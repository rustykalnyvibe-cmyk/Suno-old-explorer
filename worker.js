const SUNO_API = "https://studio-api-prod.suno.com/api/playlist/";
const VERSION = "explorer-8.2";
const MAX_PAGE = 50;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
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

function getClip(item) {
  return item?.clip || item?.content_item || item || {};
}

function first(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function extract(item) {
  const c = getClip(item);
  const md = c.metadata || {};
  const media = Array.isArray(c.media_urls) ? c.media_urls : [];
  const audio = media.find(x => /^https?:\/\//i.test(String(x?.url || "")) && !/\/api\/forbidden(?:\?|$)/i.test(String(x.url)) && /audio|m4a|mp3|opus/i.test(String(x?.content_type || x?.url || "")))
    || media.find(x => /^https?:\/\//i.test(String(x?.url || "")) && !/\/api\/forbidden(?:\?|$)/i.test(String(x.url)))
    || {};
  const creator = c.user || c.creator || c.owner || {};

  return {
    id: first(c.id, item?.content_id, ""),
    title: first(c.title, md.title, "(bez tytułu)"),
    major_model_version: first(c.major_model_version, md.major_model_version, c.model_version, md.model_version, ""),
    model_name: first(c.model_name, md.model_name, ""),
    tags: first(md.tags, c.tags, ""),
    prompt: first(md.prompt, md.gpt_description_prompt, c.prompt, c.gpt_description_prompt, ""),
    task: first(md.task, c.task, ""),
    type: first(md.type, c.type, ""),
    is_remix: first(c.is_remix, md.is_remix, null),
    cover_clip_id: first(md.cover_clip_id, c.cover_clip_id, md.cover_clip, ""),
    clip_roots: first(c.clip_roots, md.clip_roots, null),
    history: first(md.history, c.history, null),
    created_at: first(c.created_at, ""),
    duration: first(md.duration, c.duration, null),
    audio_url: first(audio.url, c.audio_url && /^https?:\/\//i.test(c.audio_url) && !/\/api\/forbidden(?:\?|$)/i.test(c.audio_url) ? c.audio_url : "", ""),
    image_url: first(c.image_url, ""),
    handle: first(c.handle, creator.handle, ""),
    display_name: first(c.display_name, creator.display_name, creator.name, ""),
    is_public: first(c.is_public, md.is_public, null),
    raw_type: first(md.type, c.type, "")
  };
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return json({}, 204);

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        ok: true,
        version: VERSION,
        source: "Public Suno playlist API",
        message: "Explorer 8.2 działa. Wklej adres publicznej playlisty Suno."
      });
    }

    if (url.pathname !== "/playlist") {
      return json({ ok: false, error: "Not found" }, 404);
    }

    const id = (url.searchParams.get("id") || "").trim();
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);

    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return json({ ok: false, error: "Nieprawidłowe ID playlisty. Wklej adres publicznej playlisty Suno lub samo ID." }, 400);
    }
    if (page > MAX_PAGE) {
      return json({ ok: false, error: `Przekroczono limit ${MAX_PAGE} stron playlisty.` }, 400);
    }

    try {
      const upstream = await fetch(`${SUNO_API}${encodeURIComponent(id)}/?page=${page}`, {
        method: "GET",
        headers: { "accept": "application/json" }
      });

      const body = await upstream.text();
      if (!upstream.ok) {
        return json({
          ok: false,
          error: `Suno API zwróciło HTTP ${upstream.status}. Playlista może być prywatna lub niedostępna.`,
          upstream_status: upstream.status,
          page
        }, upstream.status === 404 ? 404 : 502);
      }

      let data;
      try {
        data = JSON.parse(body);
      } catch {
        return json({ ok: false, error: "Suno API zwróciło niepoprawną odpowiedź JSON.", page }, 502);
      }

      const items = Array.isArray(data.playlist_clips) ? data.playlist_clips : [];
      const clips = items.map(extract);
      const total = Number(data.num_total_results || data.total_results || 0);

      return json({
        ok: true,
        version: VERSION,
        playlist_id: id,
        playlist_name: first(data.name, data.title, data.playlist?.name, ""),
        page,
        received: clips.length,
        total,
        has_more: clips.length > 0 && (total ? page * 50 < total : clips.length >= 50),
        results: clips
      });
    } catch (error) {
      return json({ ok: false, error: String(error?.message || error), page }, 502);
    }
  }
};
