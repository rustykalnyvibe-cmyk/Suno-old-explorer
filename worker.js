
const DATASET = "https://huggingface.co/datasets/sleeping-ai/Suno-Public-Playlist-small-audio/resolve/main/suno_music.txt?download=true";

const EXP = [
  "experimental", "turntablism", "avant-garde", "avant garde",
  "abstract", "weird", "crazy", "mystic", "psychedelic",
  "surreal", "unconventional", "glitch", "idm", "leftfield",
  "hybrid", "chaotic", "freestyle", "experimental electronic"
];

function cors(b, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
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
  return String(s || "")
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

function first(o, keys) {
  for (const k of keys) {
    if (o && o[k] !== undefined && o[k] !== null && o[k] !== "") {
      return o[k];
    }
  }
  return null;
}

function modelLabel(d) {
  const md = d?.metadata || {};

  return String(
    first(d, ["major_model_version", "model_version"]) ||
    first(md, ["major_model_version", "model_version"]) ||
    ""
  );
}

/*
Nie przypisujemy modelu na podstawie samego "chirp".
Nieznana wartość pozostaje nieznana.
*/
function ver(v, wanted) {
  const x = norm(v);

  if (!x) return false;

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

function expscore(h) {
  return EXP.reduce(
    (n, t) => n + (h.includes(norm(t)) ? 1 : 0),
    0
  );
}

function extract(d, id) {
  const md = d?.metadata || {};
  const persona = first(d, ["persona"]) || first(md, ["persona"]) || {};
  const voice = first(d, ["voice"]) || first(md, ["voice"]) || {};

  const tags = [
    first(md, ["tags"]),
    first(d, ["display_tags"]),
    first(d, ["tags"])
  ].filter(Boolean).join(", ");

  return {
    id: d?.id || id,

    model_version: modelLabel(d),
    model_name: first(d, ["model_name"]) || first(md, ["model_name"]) || "",

    title: first(d, ["title"]) || first(md, ["title"]) || "",
    handle: first(d, ["handle"]) || "",
    display_name: first(d, ["display_name"]) || "",

    tags,
    display_tags: first(d, ["display_tags"]) || "",

    created_at: first(d, ["created_at"]) || "",
    audio_url: first(d, ["audio_url"]) || "",

    has_vocal: first(d, ["has_vocal"]) ?? first(md, ["has_vocal"]),

    can_remix: first(d, ["can_remix"]) ?? first(md, ["can_remix"]),
    can_download_remix: first(d, ["can_download_remix"]),
    is_remix: first(d, ["is_remix"]) ?? first(md, ["is_remix"]),
    is_public: first(d, ["is_public"]),

    clip_type: first(md, ["type"]) ?? first(d, ["type"]),
    source_type: first(d, ["source_type", "clip_type", "type"]) ??
      first(md, ["source_type", "clip_type", "type"]),

    voice_id: first(d, ["voice_id"]) ??
      first(md, ["voice_id"]) ??
      first(voice, ["id", "voice_id"]),

    voice_name: first(d, ["voice_name"]) ??
      first(md, ["voice_name"]) ??
      first(voice, ["name", "voice_name"]),

    persona_id: first(d, ["persona_id"]) ??
      first(md, ["persona_id"]) ??
      first(persona, ["id", "persona_id"]),

    persona_name: first(d, ["persona_name"]) ??
      first(md, ["persona_name"]) ??
      first(persona, ["name", "persona_name"]),

    source_clips: first(d, ["source_clips"]) ??
      first(md, ["source_clips"]),

    raw_api: d
  };
}

function searchable(d) {
  return norm([
    d.tags,
    d.display_tags,
    d.title,
    d.model_name
  ].filter(Boolean).join(" "));
}

function score(d, st, ex, mode, em) {
  const h = searchable(d);

  if (ex.some(x => h.includes(x))) return null;

  const hits = st.filter(x => h.includes(x)).length;

  if (st.length && !h.includes(st[0])) return null;
  if (st.length && mode === "all" && hits < st.length) return null;
  if (st.length && mode === "any" && hits < 1) return null;

  const e = expscore(h);

  if (em === "only" && !e) return null;

  let s = hits * 100 + e * 10;

  if (st.length && h.includes(st[0])) s += 30;
  if (em === "boost") s += e * 25;

  return {
    ...d,
    match_score: s,
    experimental_hits: e
  };
}

async function ids() {
  const key = new Request("https://cache.local/suno-ids");

  const cached = await caches.default.match(key);
  if (cached) return cached.json();

  const r = await fetch(DATASET, {
    cf: { cacheTtl: 86400 }
  });

  if (!r.ok) throw Error("Nie można pobrać listy ID.");

  const body = await r.text();

  const a = [...new Set(
    [...body.matchAll(/https:\/\/cdn1\.suno\.ai\/([0-9a-f-]{36})\.mp3/gi)]
      .map(m => m[1])
  )];

  if (!a.length) throw Error("Lista ID jest pusta.");

  await caches.default.put(
    key,
    new Response(JSON.stringify(a), {
      headers: { "content-type": "application/json" }
    })
  );

  return a;
}

async function clip(id) {
  const r = await fetch(
    "https://studio-api.prod.suno.com/api/clip/" + id,
    {
      headers: { "user-agent": "Mozilla/5.0" },
      cf: { cacheTtl: 3600, cacheEverything: true }
    }
  );

  if (!r.ok) return { ok: false, reason: "http_" + r.status };

  let d;

  try {
    d = await r.json();
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  if (d.status !== "complete") {
    return { ok: false, reason: "not_complete" };
  }

  return {
    ok: true,
    data: extract(d, id)
  };
}

export default {
  async fetch(req) {
    if (req.method === "OPTIONS") return cors({}, 204);

    const u = new URL(req.url);

    if (u.pathname === "/health") {
      return cors({ ok: true, version: "diagnostic-2" });
    }

    if (u.pathname === "/debug") {
      const id = u.searchParams.get("id");

      if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
        return cors({ ok: false, error: "Podaj prawidłowe ID UUID." }, 400);
      }

      try {
        const r = await fetch(
          "https://studio-api.prod.suno.com/api/clip/" + id,
          {
            headers: { "user-agent": "Mozilla/5.0" },
            cf: { cacheTtl: 3600, cacheEverything: true }
          }
        );

        const body = await r.text();
        let api;

        try {
          api = JSON.parse(body);
        } catch {
          api = { raw: body };
        }

        return cors({
          ok: r.ok,
          http_status: r.status,
          id,
          api
        }, r.ok ? 200 : 502);
      } catch (e) {
        return cors({ ok: false, error: String(e.message || e) }, 500);
      }
    }

    if (u.pathname === "/stats") {
      try {
        const a = await ids();
        return cors({
          ok: true,
          dataset_ids: a.length,
          message: "Lista ID została pobrana."
        });
      } catch (e) {
        return cors({ ok: false, error: String(e.message || e) }, 500);
      }
    }

    if (u.pathname !== "/random") {
      return cors({ ok: false, error: "Not found" }, 404);
    }

    try {
      const wanted = u.searchParams.get("model") || "both";

      const n = Math.min(
        Math.max(+u.searchParams.get("tries") || 20, 1),
        20
      );

      const st = terms(u.searchParams.get("style"));
      const ex = terms(u.searchParams.get("exclude"));

      const mode = u.searchParams.get("match") === "any" ? "any" : "all";

      const em = ["normal", "boost", "only"].includes(
        u.searchParams.get("experimental")
      ) ? u.searchParams.get("experimental") : "normal";

      const a = await ids();

      const sample = [];
      const seen = new Set();

      while (sample.length < Math.min(n, a.length)) {
        const id = a[Math.floor(Math.random() * a.length)];
        if (!seen.has(id)) {
          seen.add(id);
          sample.push(id);
        }
      }

      const m = [];
      const stats = {
        sampled: sample.length,
        complete: 0,
        incomplete: 0,
        model_missing: 0,
        model_mismatch: 0,
        matched: 0
      };

      for (let i = 0; i < sample.length; i += 5) {
        const batch = await Promise.all(
          sample.slice(i, i + 5).map(clip)
        );

        for (const item of batch) {
          if (!item.ok) {
            if (item.reason === "not_complete") stats.incomplete++;
            continue;
          }

          stats.complete++;

          const d = item.data;

          if (!d.model_version) {
            stats.model_missing++;
            continue;
          }

          if (!ver(d.model_version, wanted)) {
            stats.model_mismatch++;
            continue;
          }

          const x = score(d, st, ex, mode, em);

          if (x) {
            m.push(x);
            stats.matched++;
          }
        }
      }

      if (!m.length) {
        return cors({
          ok: false,
          checked: sample.length,
          stats,
          error: "Nie znaleziono pasującego utworu."
        }, 404);
      }

      m.sort((a, b) => b.match_score - a.match_score);

      return cors({
        ok: true,
        checked: sample.length,
        stats,
        results: m.slice(0, 10)
      });
    } catch (e) {
      return cors({
        ok: false,
        error: String(e.message || e)
      }, 500);
    }
  }
};
