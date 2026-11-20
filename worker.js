
const SUNO_FEED = "https://suno.com/a/api/unified/feed";

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

function modelLabel(d) {
  const md = d?.metadata || {};
  return String(first(
    d?.major_model_version,
    d?.model_version,
    md.major_model_version,
    md.model_version
  ) || "").toLowerCase().trim();
}

function ver(value, wanted) {
  const x = norm(value).replace(/\s+/g, "");
  const w = norm(wanted).replace(/\s+/g, "");

  if (!x) return false;

  const isV3 = x === "v3" || x === "v3-all";
  const isV35 = x.includes("3.5");
  const isV4 = x.startsWith("v4") && !x.startsWith("v4.5");
  const isV45 = x.startsWith("v4.5");

  if (["all", "old", "v3-v4.5", "v3-v4.5+"].includes(w)) {
    return isV3 || isV35 || isV4 || isV45;
  }

  if (w === "v3") return isV3;
  if (w === "v3.5") return isV35;

  if (w === "v3both" || w === "v3+v3.5") {
    return isV3 || isV35;
  }

  if (w === "v4") return isV4;
  if (w === "v4.5" || w === "v4.5+" || w === "v4.5plus") {
    return isV45;
  }

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

function extract(item) {
  const d = item?.content_item || item || {};
  const md = d.metadata || {};

  const persona = first(d.persona, md.persona) || {};
  const voice = first(d.voice, md.voice) || {};
  const media = Array.isArray(d.media_urls) ? d.media_urls : [];

  const audio = media.find(x =>
    /audio|m4a|mp3|opus/i.test(String(x?.content_type || x?.url || ""))
  ) || media[0] || {};

  const user = first(d.user, d.creator, d.owner) || {};

  return {
    id: first(d.id, item?.content_id) || "",
    model_version: modelLabel(d),
    model_name: first(d.model_name, md.model_name) || "",

    title: first(d.title, md.title) || "",
    handle: first(d.handle, user.handle) || "",
    display_name: first(d.display_name, user.display_name, user.name) || "",

    tags: first(md.tags, d.tags) || "",
    display_tags: first(d.display_tags, md.display_tags) || "",
    prompt: first(
      md.gpt_description_prompt,
      d.gpt_description_prompt,
      md.prompt,
      d.prompt
    ) || "",
    description: first(md.description, d.description) || "",
    negative_tags: first(md.negative_tags, d.negative_tags) || "",

    created_at: d.created_at || "",
    audio_url: first(d.audio_url, md.audio_url, audio.url) || "",

    has_vocal: first(d.has_vocal, md.has_vocal),
    can_remix: first(d.can_remix, md.can_remix),
    can_download_remix: first(d.can_download_remix, md.can_download_remix),
    is_remix: first(d.is_remix, md.is_remix),
    is_public: first(d.is_public, md.is_public),

    clip_type: first(md.type, d.type),
    source_type: first(
      d.source_type, d.clip_type, d.type,
      md.source_type, md.clip_type, md.type
    ),

    task: first(md.task, d.task) || "",
    voice_id: first(d.voice_id, md.voice_id, voice.id, voice.voice_id),
    voice_name: first(d.voice_name, md.voice_name, voice.name, voice.voice_name),
    persona_id: first(d.persona_id, md.persona_id, persona.id, persona.persona_id),
    persona_name: first(
      d.persona_name, md.persona_name, persona.name, persona.persona_name
    ),

    source_clips: first(d.source_clips, md.source_clips),
    raw_api: d
  };
}

function searchable(d) {
  return norm([
    d.tags,
    d.display_tags,
    d.title,
    d.model_name,
    d.prompt,
    d.description,
    d.task
  ].filter(Boolean).join(" "));
}

function score(d, styleTerms, excluded, matchMode, experimentalMode, wanted) {
  if (!d.model_version || !ver(d.model_version, wanted)) {
    return null;
  }

  const h = searchable(d);

  if (excluded.some(term => h.includes(term))) {
    return null;
  }

  const hits = styleTerms.filter(term => h.includes(term)).length;

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

async function searchSuno(term, cursor, pageSize) {
  const payload = {
    feed_id: "omnisearch_songs",
    cursor: cursor || null,
    page_size: pageSize,
    request_metadata: {
      term
    }
  };

  const response = await fetch(SUNO_FEED, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json",
      "user-agent": "Mozilla/5.0",
      "origin": "https://suno.com",
      "referer": "https://suno.com/"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Suno zwróciło nie-JSON (HTTP ${response.status}): ${text.slice(0, 500)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Suno API HTTP ${response.status}: ${JSON.stringify(data).slice(0, 700)}`
    );
  }

  return data;
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
        version: "explorer-6",
        source: "Suno omnisearch_songs",
        message: "Worker działa."
      });
    }

    if (url.pathname === "/stats") {
      return cors({
        ok: true,
        source: "Suno omnisearch_songs",
        dataset: "Hugging Face nie jest już używany."
      });
    }

    if (url.pathname !== "/search" && url.pathname !== "/random") {
      return cors({ ok: false, error: "Not found" }, 404);
    }

    try {
      const term = (url.searchParams.get("term") || "experimental").trim();
      const cursor = url.searchParams.get("cursor") || null;

      const pageSize = Math.min(
        Math.max(Number(url.searchParams.get("page_size")) || 20, 1),
        20
      );

      const wanted = url.searchParams.get("model") || "both";
      const styleTerms = terms(url.searchParams.get("style"));
      const excluded = terms(url.searchParams.get("exclude"));

      const matchMode =
        url.searchParams.get("match") === "any" ? "any" : "all";

      const experimentalMode = [
        "normal", "boost", "only"
      ].includes(url.searchParams.get("experimental"))
        ? url.searchParams.get("experimental")
        : "normal";

      if (!term) {
        return cors({
          ok: false,
          error: "Wpisz frazę wyszukiwania Suno."
        }, 400);
      }

      const api = await searchSuno(term, cursor, pageSize);
      const feed = api?.feed || {};
      const items = Array.isArray(feed.items) ? feed.items : [];

      const stats = {
        received: items.length,
        model_missing: 0,
        model_mismatch: 0,
        matched: 0,
        model_versions: {}
      };

      const matches = [];

      for (const item of items) {
        const d = extract(item);
        const model = d.model_version || "unknown";

        stats.model_versions[model] =
          (stats.model_versions[model] || 0) + 1;

        if (!d.model_version) {
          stats.model_missing++;
          continue;
        }

        if (!ver(d.model_version, wanted)) {
          stats.model_mismatch++;
          continue;
        }

        const result = score(
          d,
          styleTerms,
          excluded,
          matchMode,
          experimentalMode,
          wanted
        );

        if (result) {
          matches.push(result);
          stats.matched++;
        }
      }

      matches.sort((a, b) => b.match_score - a.match_score);

      return cors({
        ok: true,
        term,
        feed_title: feed.feed_title || "",
        checked: items.length,
        next_cursor: feed.next_cursor || null,
        has_more: Boolean(feed.next_cursor),
        stats,
        results: matches,
        raw_count: items.length
      });

    } catch (error) {
      return cors({
        ok: false,
        error: String(error.message || error)
      }, 502);
    }
  }
};
