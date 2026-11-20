
const DATASET = "https://huggingface.co/datasets/sleeping-ai/Suno-Public-Playlist-small-audio/resolve/main/suno_music.txt?download=true";

const EXP = [
  "experimental", "experimental electronic", "experimental hip hop",
  "abstract", "abstract hip hop", "turntablism", "avant-garde",
  "avant garde", "leftfield", "left field", "idm", "glitch",
  "glitchcore", "psychedelic", "surreal", "unconventional",
  "unorthodox", "weird", "chaotic", "noise", "breakcore",
  "industrial", "deconstructed", "microtonal", "atonal",
  "improvisational", "freeform", "freestyle", "sound collage",
  "sound design", "field recording", "dissonant", "wonky",
  "genre bending", "genre-bending", "off-kilter", "hybrid",
  "mystic", "crazy"
];

const API = "https://studio-api.prod.suno.com/api/clip/";

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

function textValue(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);

  if (Array.isArray(value)) {
    return value.map(textValue).filter(Boolean).join(", ");
  }

  return "";
}

function hasTerm(text, term) {
  const haystack = " " + norm(text) + " ";
  const needle = " " + norm(term) + " ";

  return haystack.includes(needle);
}

function modelLabel(d) {
  const md = d?.metadata || {};
  const clip = d?.clip || {};

  return String(first(
    d?.major_model_version,
    d?.model_version,
    md.major_model_version,
    md.model_version,
    clip.major_model_version,
    clip.model_version
  ) || "");
}

function ver(value, wanted) {
  let x = norm(value);

  if (!x) return false;

  if (!x.startsWith("v") && /^[0-9]/.test(x)) {
    x = "v" + x;
  }

  if (wanted === "v3") {
    return x === "v3" || x === "v3-all";
  }

  if (wanted === "v3.5") {
    return x.includes("3.5");
  }

  if (wanted === "v3both") {
    return x === "v3" || x === "v3-all" || x.includes("3.5");
  }

  if (wanted === "v4") {
    return x.startsWith("v4") && !x.includes("4.5");
  }

  if (wanted === "v4.5") {
    return x.includes("4.5");
  }

  if (wanted === "both") {
    return x.startsWith("v4");
  }

  return false;
}

function expscore(text) {
  return EXP.reduce(
    (n, term) => n + (hasTerm(text, term) ? 1 : 0),
    0
  );
}

function extract(d, id) {
  const md = d?.metadata || {};
  const persona = first(d?.persona, md.persona) || {};
  const voice = first(d?.voice, md.voice) || {};

  const tags = [
    d.tags,
    md.tags,
    d.display_tags,
    md.display_tags,
    d.style,
    md.style
  ]
    .map(textValue)
    .filter(Boolean)
    .join(", ");

  const description = textValue(first(
    d.gpt_description_prompt,
    md.gpt_description_prompt,
    d.description,
    md.description,
    d.prompt,
    md.prompt
  ));

  const negativeTags = textValue(first(
    d.negative_tags,
    md.negative_tags
  ));

  return {
    id: d?.id || id,

    model_version: modelLabel(d),
    model_name: first(d.model_name, md.model_name) || "",

    title: first(d.title, md.title) || "",
    handle: d.handle || "",
    display_name: d.display_name || "",

    tags,
    display_tags: textValue(first(d.display_tags, md.display_tags)),
    description,
    negative_tags: negativeTags,

    created_at: d.created_at || "",
    audio_url: first(d.audio_url, md.audio_url) || "",

    has_vocal: first(d.has_vocal, md.has_vocal),

    can_remix: first(d.can_remix, md.can_remix),
    can_download_remix: first(d.can_download_remix, md.can_download_remix),
    is_remix: first(d.is_remix, md.is_remix),

    is_public: first(d.is_public, md.is_public),

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

    source_clips: first(d.source_clips, md.source_clips),

    raw_api: d
  };
}

function searchable(d) {
  return norm([
    d.tags,
    d.display_tags,
    d.description,
    d.title,
    d.model_name
  ].filter(Boolean).join(" "));
}

function score(d, styleTerms, excluded, matchMode, experimentalMode) {
  const h = searchable(d);

  if (excluded.some(term => hasTerm(h, term))) {
    return null;
  }

  const hits = styleTerms.filter(term => hasTerm(h, term)).length;

  // Tryb ALL: wszystkie wpisane terminy muszą wystąpić.
  if (styleTerms.length && matchMode === "all" && hits !== styleTerms.length) {
    return null;
  }

  // Tryb ANY: wystarczy jeden z wpisanych terminów.
  if (styleTerms.length && matchMode === "any" && hits === 0) {
    return null;
  }

  const experimentalHits = expscore(h);

  if (experimentalMode === "only" && experimentalHits === 0) {
    return null;
  }

  let matchScore = hits * 100 + experimentalHits * 10;

  if (styleTerms.length && hasTerm(h, styleTerms[0])) {
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
        version: "explorer-4",
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
        matched: 0
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
