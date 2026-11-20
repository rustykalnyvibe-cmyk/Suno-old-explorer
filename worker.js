
const DATASET = "https://huggingface.co/datasets/sleeping-ai/Suno-Public-Playlist-small-audio/resolve/main/suno_music.txt?download=true";

const API = "https://studio-api.prod.suno.com/api/clip/";

const EXP = [
  "experimental", "turntablism", "avant-garde", "avant garde",
  "abstract", "weird", "crazy", "mystic", "psychedelic",
  "surreal", "unconventional", "glitch", "idm", "leftfield",
  "hybrid", "chaotic", "freestyle", "experimental electronic",
  "breakcore", "noise", "industrial", "deconstructed",
  "microtonal", "atonal", "dissonant", "genre-bending",
  "genre bending", "outsider", "avantgarde", "left field",
  "sound collage", "free improvisation", "odd time"
];

function cors(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "*",
      "cache-control": "no-store"
    }
  });
}

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+#.\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function terms(s) {
  return String(s || "")
    .split(",")
    .map(norm)
    .filter(Boolean)
    .slice(0, 8);
}

function first(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
}

// Odczyt wersji wyłącznie z jawnych danych API.
// Nie zgadujemy wersji na podstawie nazwy chirp.
function modelLabel(d) {
  const md = d?.metadata || {};

  return String(first(
    d?.major_model_version,
    d?.model_version,
    md.major_model_version,
    md.model_version
  ) || "").toLowerCase().trim();
}

// Zakres obsługiwanych generacji: V3 – V4.5+.
// V5 i V6 pozostają poza zakresem.
function ver(value, wanted) {
  const x = norm(value).replace(/\s+/g, "");
  const w = norm(wanted).replace(/\s+/g, "");

  if (!x) return false;

  const isV3 = x === "v3" || x === "v3-all";
  const isV35 = x.includes("3.5");
  const isV4 = x.startsWith("v4") && !x.startsWith("v4.5");
  const isV45 = x.startsWith("v4.5");

  // Wszystkie starsze generacje od V3 do V4.5+
  if (["all", "old", "v3-v4.5", "v3-v4.5+"].includes(w)) {
    return isV3 || isV35 || isV4 || isV45;
  }

  // V3
  if (w === "v3") return isV3;

  // V3.5
  if (w === "v3.5") return isV35;

  // V3 oraz V3.5
  if (w === "v3both" || w === "v3+v3.5") {
    return isV3 || isV35;
  }

  // V4
  if (w === "v4") return isV4;

  // V4.5
  if (w === "v4.5") return isV45;

  // V4.5 i warianty oznaczone jako V4.5+
  if (w === "v4.5+" || w === "v4.5plus") {
    return isV45;
  }

  // V4 oraz V4.5
  if (w === "both" || w === "v4both" || w === "v4+v4.5") {
    return isV4 || isV45;
  }

  return false;
}

function expscore(text) {
  return EXP.reduce(
    (n, term) => n + (text.includes(norm(term)) ? 1 : 0),
    0
  );
}

// Odczyt metadanych z API Suno.
function extract(d, id) {
  const md = d?.metadata || {};
  const persona = first(d?.persona, md.persona) || {};
  const voice = first(d?.voice, md.voice) || {};

  const tags = first(md.tags, d.tags) || "";
  const displayTags = first(d.display_tags, md.display_tags) || "";

  const prompt = first(
    md.gpt_description_prompt,
    d.gpt_description_prompt,
    md.prompt,
    d.prompt
  ) || "";

  const description = first(
    md.description,
    d.description
  ) || "";

  return {
    id: d?.id || id,

    model_version: modelLabel(d),
    model_name: first(d.model_name, md.model_name) || "",

    title: first(d.title, md.title) || "",
    handle: d.handle || "",
    display_name: d.display_name || "",

    tags,
    display_tags: displayTags,
    prompt,
    description,

    negative_tags: first(md.negative_tags, d.negative_tags) || "",

    created_at: d.created_at || "",
    audio_url: first(d.audio_url, md.audio_url) || "",

    has_vocal: first(d.has_vocal, md.has_vocal),

    can_remix: first(d.can_remix, md.can_remix),
    can_download_remix: first(d.can_download_remix, md.can_download_remix),
    is_remix: first(d.is_remix, md.is_remix),

    is_public: d.is_public ?? null,

    clip_type: first(md.type, d.type),
    source_type: first(
      d.source_type,
      d.clip_type,
      d.type,
      md.source_type,
      md.clip_type,
      md.type
    ),

    voice_id: first(
      d.voice_id,
      md.voice_id,
      voice.id,
      voice.voice_id
    ),

    voice_name: first(
      d.voice_name,
      md.voice_name,
      voice.name,
      voice.voice_name
    ),

    persona_id: first(
      d.persona_id,
      md.persona_id,
      persona.id,
      persona.persona_id
    ),

    persona_name: first(
      d.persona_name,
      md.persona_name,
      persona.name,
      persona.persona_name
    ),

    source_clips: first(d.source_clips, md.source_clips)
  };
}

// Pola wyszukiwania obejmuje teraz także opisy i prompty.
// Nie przeszukujemy negative_tags, żeby nie dopasowywać
// utworów na podstawie tego, czego autor nie chciał.
function searchable(d) {
  return norm([
    d.tags,
    d.display_tags,
    d.title,
    d.model_name,
    d.prompt,
    d.description
  ].filter(Boolean).join(" "));
}

function score(d, styleTerms, excluded, matchMode, experimentalMode) {
  const h = searchable(d);

  if (excluded.some(term => h.includes(term))) {
    return null;
  }

  const hits = styleTerms.filter(term => h.includes(term)).length;

  // Pierwszy wpisany termin jest głównym filtrem.
  if (styleTerms.length && !h.includes(styleTerms[0])) {
    return null;
  }

  if (styleTerms.length && matchMode === "all" && hits < styleTerms.length) {
    return null;
  }

  if (styleTerms.length && matchMode === "any" && hits < 1) {
    return null;
  }

  const experimentalHits = expscore(h);

  if (experimentalMode === "only" && experimentalHits === 0) {
    return null;
  }

  let matchScore = hits * 100 + experimentalHits * 10;

  if (styleTerms.length && h.includes(styleTerms[0])) {
    matchScore += 30;
  }

  if (experimentalMode === "boost") {
    matchScore += experimentalHits * 25;
  }

  return {
    ...d,
    match_score: matchScore,
    experimental_hits: experimentalHits
  };
}

// Pobieranie listy ID z datasetu.
async function ids() {
  const key = new Request("https://cache.local/suno-ids");

  const cached = await caches.default.match(key);

  if (cached) {
    return cached.json();
  }

  const response = await fetch(DATASET, {
    cf: { cacheTtl: 86400 }
  });

  if (!response.ok) {
    throw Error("Nie można pobrać listy ID.");
  }

  const body = await response.text();

  const found = [
    ...body.matchAll(
      /https:\/\/cdn1\.suno\.ai\/([0-9a-f-]{36})\.mp3/gi
    )
  ].map(match => match[1]);

  const unique = [...new Set(found)];

  if (!unique.length) {
    throw Error("Lista ID jest pusta albo zmienił się format datasetu.");
  }

  await caches.default.put(
    key,
    new Response(JSON.stringify(unique), {
      headers: { "content-type": "application/json" }
    })
  );

  return unique;
}

// Pobieranie pojedynczego utworu.
async function clip(id) {
  try {
    const response = await fetch(API + id, {
      headers: {
        "user-agent": "Mozilla/5.0"
      },
      cf: {
        cacheTtl: 3600,
        cacheEverything: true
      }
    });

    if (!response.ok) {
      return {
        ok: false,
        reason: "http_" + response.status
      };
    }

    const data = await response.json();

    if (data.status !== "complete") {
      return {
        ok: false,
        reason: "not_complete"
      };
    }

    return {
      ok: true,
      data: extract(data, id)
    };

  } catch (error) {
    return {
      ok: false,
      reason: "fetch_error",
      message: String(error.message || error)
    };
  }
}

function sampleIds(all, count) {
  const pool = [...all];
  const selected = [];

  while (selected.length < Math.min(count, pool.length)) {
    const index = Math.floor(Math.random() * pool.length);
    selected.push(pool[index]);
    pool.splice(index, 1);
  }

  return selected;
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return cors({}, 204);
    }

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return cors({
        ok: true,
        version: "explorer-5",
        message: "Worker działa."
      });
    }

    if (url.pathname === "/debug") {
      const id = url.searchParams.get("id");

      if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
        return cors({
          ok: false,
          error: "Podaj prawidłowe ID UUID."
        }, 400);
      }

      try {
        const response = await fetch(API + id, {
          headers: {
            "user-agent": "Mozilla/5.0"
          },
          cf: {
            cacheTtl: 3600,
            cacheEverything: true
          }
        });

        const body = await response.text();

        let api;

        try {
          api = JSON.parse(body);
        } catch {
          api = { raw: body };
        }

        return cors({
          ok: response.ok,
          http_status: response.status,
          id,
          api
        }, response.ok ? 200 : 502);

      } catch (error) {
        return cors({
          ok: false,
          error: String(error.message || error)
        }, 500);
      }
    }

    if (url.pathname === "/stats") {
      try {
        const all = await ids();

        return cors({
          ok: true,
          dataset_ids: all.length,
          message: "Lista ID została pobrana."
        });

      } catch (error) {
        return cors({
          ok: false,
          error: String(error.message || error)
        }, 500);
      }
    }

    if (url.pathname !== "/random") {
      return cors({
        ok: false,
        error: "Not found"
      }, 404);
    }

    try {
      const wanted = url.searchParams.get("model") || "both";

      // Limit 20 pozostaje celowy: chroni przed limitem
      // podzapytań Cloudflare podczas jednego wywołania.
      const count = Math.min(
        Math.max(Number(url.searchParams.get("tries")) || 20, 1),
        20
      );

      const styleTerms = terms(url.searchParams.get("style"));
      const excluded = terms(url.searchParams.get("exclude"));

      const matchMode =
        url.searchParams.get("match") === "any" ? "any" : "all";

      const experimentalMode = [
        "normal",
        "boost",
        "only"
      ].includes(url.searchParams.get("experimental"))
        ? url.searchParams.get("experimental")
        : "normal";

      const all = await ids();
      const sample = sampleIds(all, count);

      const matches = [];

      const stats = {
        sampled: sample.length,
        complete: 0,
        incomplete: 0,
        http_errors: 0,
        fetch_errors: 0,
        model_missing: 0,
        model_mismatch: 0,
        matched: 0,
        model_versions: {}
      };

      // Maksymalnie 5 równoległych zapytań do API Suno.
      for (let i = 0; i < sample.length; i += 5) {
        const batch = await Promise.all(
          sample.slice(i, i + 5).map(clip)
        );

        for (const item of batch) {
          if (!item.ok) {
            if (item.reason === "not_complete") {
              stats.incomplete++;
            } else if (item.reason?.startsWith("http_")) {
              stats.http_errors++;
            } else {
              stats.fetch_errors++;
            }

            continue;
          }

          stats.complete++;

          const data = item.data;
          const model = data.model_version || "unknown";

          stats.model_versions[model] =
            (stats.model_versions[model] || 0) + 1;

          if (!data.model_version) {
            stats.model_missing++;
            continue;
          }

          if (!ver(data.model_version, wanted)) {
            stats.model_mismatch++;
            continue;
          }

          const result = score(
            data,
            styleTerms,
            excluded,
            matchMode,
            experimentalMode
          );

          if (result) {
            matches.push(result);
            stats.matched++;
          }
        }
      }

      if (!matches.length) {
        return cors({
          ok: false,
          checked: sample.length,
          stats,
          error: "Nie znaleziono pasującego utworu."
        }, 404);
      }

      matches.sort(
        (a, b) => b.match_score - a.match_score
      );

      return cors({
        ok: true,
        checked: sample.length,
        stats,
        results: matches.slice(0, 10)
      });

    } catch (error) {
      return cors({
        ok: false,
        error: String(error.message || error)
      }, 500);
    }
  }
};
