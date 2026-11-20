const DATASET =
  "https://huggingface.co/datasets/sleeping-ai/Suno-Public-Playlist-small-audio/resolve/main/suno_music.txt?download=true";

const CLIP_API =
  "https://studio-api.prod.suno.com/api/clip/";

const EXP = [
  "experimental",
  "turntablism",
  "avant-garde",
  "avant garde",
  "abstract",
  "weird",
  "crazy",
  "mystic",
  "psychedelic",
  "surreal",
  "unconventional",
  "glitch",
  "idm",
  "leftfield",
  "hybrid",
  "chaotic",
  "freestyle",
  "experimental electronic",
  "breakcore",
  "noise",
  "industrial",
  "deconstructed",
  "microtonal",
  "atonal",
  "dissonant",
  "genre-bending",
  "genre bending",
  "outsider",
  "avantgarde",
  "left field",
  "sound collage",
  "free improvisation",
  "odd time"
];

const MAX_CLIPS_PER_REQUEST = 20;
const MAX_PARALLEL = 5;

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
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return value;
    }
  }

  return null;
}

function modelLabel(d) {
  const md = d?.metadata || {};

  return String(
    first(
      d?.major_model_version,
      d?.model_version,
      md.major_model_version,
      md.model_version
    ) || ""
  )
    .toLowerCase()
    .trim();
}

function ver(value, wanted) {
  const x =
    norm(value).replace(/\s+/g, "");

  const w =
    norm(wanted).replace(/\s+/g, "");

  if (!x) return false;

  const isV3 =
    x === "v3" ||
    x === "v3-all";

  const isV35 =
    x.includes("3.5");

  const isV4 =
    x.startsWith("v4") &&
    !x.startsWith("v4.5");

  const isV45 =
    x.startsWith("v4.5");

  if (
    [
      "all",
      "old",
      "v3-v4.5",
      "v3-v4.5+"
    ].includes(w)
  ) {
    return (
      isV3 ||
      isV35 ||
      isV4 ||
      isV45
    );
  }

  if (w === "v3")
    return isV3;

  if (w === "v3.5")
    return isV35;

  if (
    w === "v3both" ||
    w === "v3+v3.5"
  ) {
    return isV3 || isV35;
  }

  if (w === "v4")
    return isV4;

  if (
    w === "v4.5" ||
    w === "v4.5+" ||
    w === "v4.5plus"
  ) {
    return isV45;
  }

  if (
    w === "both" ||
    w === "v4both" ||
    w === "v4+v4.5"
  ) {
    return isV4 || isV45;
  }

  return false;
}

function expscore(text) {
  return EXP.reduce(
    (n, term) =>
      n +
      (
        text.includes(
          norm(term)
        )
          ? 1
          : 0
      ),
    0
  );
}

function extract(item) {
  const d =
    item?.content_item ||
    item ||
    {};

  const md =
    d.metadata ||
    {};

  const persona =
    first(
      d.persona,
      md.persona
    ) || {};

  const voice =
    first(
      d.voice,
      md.voice
    ) || {};

  const media =
    Array.isArray(
      d.media_urls
    )
      ? d.media_urls
      : [];

  const audio =
    media.find(x =>
      /audio|m4a|mp3|opus/i.test(
        String(
          x?.content_type ||
          x?.url ||
          ""
        )
      )
    ) ||
    media[0] ||
    {};

  const user =
    first(
      d.user,
      d.creator,
      d.owner
    ) || {};

  return {
    id:
      first(
        d.id,
        item?.content_id
      ) || "",

    model_version:
      modelLabel(d),

    model_name:
      first(
        d.model_name,
        md.model_name
      ) || "",

    title:
      first(
        d.title,
        md.title
      ) || "",

    handle:
      first(
        d.handle,
        user.handle
      ) || "",

    display_name:
      first(
        d.display_name,
        user.display_name,
        user.name
      ) || "",

    tags:
      first(
        md.tags,
        d.tags
      ) || "",

    display_tags:
      first(
        d.display_tags,
        md.display_tags
      ) || "",

    prompt:
      first(
        md.gpt_description_prompt,
        d.gpt_description_prompt,
        md.prompt,
        d.prompt
      ) || "",

    description:
      first(
        md.description,
        d.description
      ) || "",

    negative_tags:
      first(
        md.negative_tags,
        d.negative_tags
      ) || "",

    created_at:
      d.created_at ||
      "",

    audio_url:
      first(
        d.audio_url,
        md.audio_url,
        audio.url
      ) || "",

    has_vocal:
      first(
        d.has_vocal,
        md.has_vocal
      ),

    can_remix:
      first(
        d.can_remix,
        md.can_remix
      ),

    can_download_remix:
      first(
        d.can_download_remix,
        md.can_download_remix
      ),

    is_remix:
      first(
        d.is_remix,
        md.is_remix
      ),

    is_public:
      first(
        d.is_public,
        md.is_public
      ),

    clip_type:
      first(
        md.type,
        d.type
      ),

    source_type:
      first(
        d.source_type,
        d.clip_type,
        d.type,
        md.source_type,
        md.clip_type,
        md.type
      ),

    task:
      first(
        md.task,
        d.task
      ) || "",

    voice_id:
      first(
        d.voice_id,
        md.voice_id,
        voice.id,
        voice.voice_id
      ),

    voice_name:
      first(
        d.voice_name,
        md.voice_name,
        voice.name,
        voice.voice_name
      ),

    persona_id:
      first(
        d.persona_id,
        md.persona_id,
        persona.id,
        persona.persona_id
      ),

    persona_name:
      first(
        d.persona_name,
        md.persona_name,
        persona.name,
        persona.persona_name
      ),

    source_clips:
      first(
        d.source_clips,
        md.source_clips
      ),

    raw_api:
      d
  };
}

function searchable(d) {
  return norm(
    [
      d.tags,
      d.display_tags,
      d.title,
      d.model_name,
      d.prompt,
      d.description,
      d.task
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function score(
  d,
  styleTerms,
  excluded,
  matchMode,
  experimentalMode,
  wanted
) {
  if (
    !d.model_version ||
    !ver(
      d.model_version,
      wanted
    )
  ) {
    return null;
  }

  const h =
    searchable(d);

  if (
    excluded.some(
      term =>
        h.includes(term)
    )
  ) {
    return null;
  }

  const hits =
    styleTerms.filter(
      term =>
        h.includes(term)
    ).length;

  if (
    styleTerms.length &&
    !h.includes(
      styleTerms[0]
    )
  ) {
    return null;
  }

  if (
    styleTerms.length &&
    matchMode === "all" &&
    hits < styleTerms.length
  ) {
    return null;
  }

  if (
    styleTerms.length &&
    matchMode === "any" &&
    hits < 1
  ) {
    return null;
  }

  const experimentalHits =
    expscore(h);

  if (
    experimentalMode === "only" &&
    experimentalHits === 0
  ) {
    return null;
  }

  let matchScore =
    hits * 100 +
    experimentalHits * 10;

  if (
    styleTerms.length &&
    h.includes(
      styleTerms[0]
    )
  ) {
    matchScore += 30;
  }

  if (
    experimentalMode === "boost"
  ) {
    matchScore +=
      experimentalHits * 25;
  }

  return {
    ...d,

    match_score:
      matchScore,

    experimental_hits:
      experimentalHits
  };
}

/*
 * ============================================================
 * DATASET
 * ============================================================
 */

let datasetCache = null;
let datasetLoadedAt = 0;

const DATASET_CACHE_MS =
  30 * 60 * 1000;

async function loadDataset() {

  if (
    datasetCache &&
    Date.now() -
      datasetLoadedAt <
        DATASET_CACHE_MS
  ) {
    return datasetCache;
  }

  const response =
    await fetch(
      DATASET,
      {
        headers: {
          "accept":
            "text/plain"
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      `Dataset HTTP ${response.status}`
    );
  }

  const text =
    await response.text();

  const urls =
    text
      .split(/\r?\n/)
      .map(x => x.trim())
      .filter(
        x =>
          x.includes(
            "cdn1.suno.ai/"
          )
      );

  const ids = [];

  const seen =
    new Set();

  for (
    const url of urls
  ) {

    const match =
      url.match(
        /\/([0-9a-f-]{36})\.mp3/i
      );

    if (!match) {
      continue;
    }

    const id =
      match[1];

    if (
      seen.has(id)
    ) {
      continue;
    }

    seen.add(id);

    ids.push(id);
  }

  if (!ids.length) {
    throw new Error(
      "Dataset nie zawiera poprawnych ID Suno."
    );
  }

  datasetCache =
    ids;

  datasetLoadedAt =
    Date.now();

  return ids;
}

/*
 * ============================================================
 * DETERMINISTIC SAMPLE
 * ============================================================
 */

function hashString(s) {

  let h = 2166136261;

  for (
    let i = 0;
    i < s.length;
    i++
  ) {
    h ^= s.charCodeAt(i);
    h =
      Math.imul(
        h,
        16777619
      );
  }

  return h >>> 0;
}

function sampleIds(
  ids,
  seed,
  count
) {
  const arr =
    ids.slice();

  let state =
    hashString(
      String(seed)
    );

  function rnd() {

    state +=
      0x6D2B79F5;

    let t =
      state;

    t =
      Math.imul(
        t ^
          (t >>> 15),
        t | 1
      );

    t ^=
      t +
      Math.imul(
        t ^
          (t >>> 7),
        t | 61
      );

    return (
      (
        (t ^
          (t >>> 14))
        >>> 0
      ) /
      4294967296
    );
  }

  /*
   * Fisher-Yates,
   * ale tylko do potrzebnego zakresu.
   */
  for (
    let i = 0;
    i < count &&
    i < arr.length;
    i++
  ) {

    const j =
      i +
      Math.floor(
        rnd() *
        (arr.length - i)
      );

    [
      arr[i],
      arr[j]
    ] = [
      arr[j],
      arr[i]
    ];
  }

  return arr.slice(
    0,
    Math.min(
      count,
      arr.length
    )
  );
}

/*
 * ============================================================
 * CLIP API
 * ============================================================
 */

async function fetchClip(id) {

  const response =
    await fetch(
      CLIP_API +
      encodeURIComponent(id),
      {
        method: "GET",
        headers: {
          "accept":
            "application/json"
        }
      }
    );

  const text =
    await response.text();

  if (!response.ok) {
    return {
      ok: false,
      id,
      status:
        response.status
    };
  }

  let data;

  try {
    data =
      JSON.parse(text);
  } catch {
    return {
      ok: false,
      id,
      status:
        response.status,
      parse_error:
        true
    };
  }

  return {
    ok: true,
    id,
    data
  };
}

/*
 * ============================================================
 * CONCURRENCY
 * ============================================================
 */

async function mapLimit(
  items,
  limit,
  fn
) {
  const results =
    new Array(
      items.length
    );

  let index = 0;

  async function worker() {

    while (true) {

      const i =
        index++;

      if (
        i >= items.length
      ) {
        return;
      }

      try {
        results[i] =
          await fn(
            items[i],
            i
          );
      } catch (error) {

        results[i] = {
          ok: false,
          error:
            String(
              error.message ||
              error
            )
        };
      }
    }
  }

  const workers =
    Array.from(
      {
        length:
          Math.min(
            limit,
            items.length
          )
      },
      () =>
        worker()
    );

  await Promise.all(
    workers
  );

  return results;
}

/*
 * ============================================================
 * SEARCH
 * ============================================================
 */

async function searchDataset(
  term,
  cursor,
  pageSize
) {

  const ids =
    await loadDataset();

  /*
   * Cursor jest naszym własnym
   * numerem próbki.
   *
   * "0" = pierwsza próbka
   * "1" = następna
   * itd.
   */

  const page =
    Math.max(
      0,
      Number(cursor) || 0
    );

  const seed =
    [
      term,
      page
    ].join("|");

  const idsToCheck =
    sampleIds(
      ids,
      seed,
      MAX_CLIPS_PER_REQUEST
    );

  const clipResults =
    await mapLimit(
      idsToCheck,
      MAX_PARALLEL,
      fetchClip
    );

  const extracted =
    [];

  let httpErrors = 0;
  let parseErrors = 0;

  for (
    const result of
      clipResults
  ) {

    if (!result?.ok) {

      if (
        result?.parse_error
      ) {
        parseErrors++;
      } else {
        httpErrors++;
      }

      continue;
    }

    /*
     * API /clip może zwracać
     * obiekt bezpośrednio albo
     * wrapper.
     */
    const clip =
      result.data?.clip ||
      result.data?.data ||
      result.data;

    if (!clip) {
      continue;
    }

    extracted.push(
      extract(clip)
    );
  }

  return {
    extracted,
    checked:
      idsToCheck.length,

    sampleSize:
      ids.length,

    page,

    nextCursor:
      String(page + 1),

    httpErrors,
    parseErrors
  };
}

/*
 * ============================================================
 * WORKER
 * ============================================================
 */

export default {

  async fetch(request) {

    if (
      request.method ===
      "OPTIONS"
    ) {
      return cors(
        {},
        204
      );
    }

    const url =
      new URL(
        request.url
      );

    /*
     * --------------------------------------------------------
     * HEALTH
     * --------------------------------------------------------
     */

    if (
      url.pathname ===
      "/health"
    ) {
      return cors({
        ok: true,
        version:
          "explorer-7",

        source:
          "Hugging Face Suno public playlist + public clip metadata",

        message:
          "Worker działa."
      });
    }

    /*
     * --------------------------------------------------------
     * STATS
     * --------------------------------------------------------
     */

    if (
      url.pathname ===
      "/stats"
    ) {

      try {

        const ids =
          await loadDataset();

        return cors({
          ok: true,
          version:
            "explorer-7",

          dataset:
            DATASET,

          unique_ids:
            ids.length,

          clip_api:
            CLIP_API,

          max_per_request:
            MAX_CLIPS_PER_REQUEST,

          max_parallel:
            MAX_PARALLEL
        });

      } catch (error) {

        return cors({
          ok: false,
          error:
            String(
              error.message ||
              error
            )
        }, 502);
      }
    }

    /*
     * --------------------------------------------------------
     * ROUTES
     * --------------------------------------------------------
     */

    if (
      url.pathname !==
        "/search" &&
      url.pathname !==
        "/random"
    ) {

      return cors({
        ok: false,
        error:
          "Not found"
      }, 404);
    }

    try {

      const term =
        (
          url.searchParams.get(
            "term"
          ) ||
          "experimental"
        ).trim();

      const cursor =
        url.searchParams.get(
          "cursor"
        ) || "0";

      const pageSize =
        Math.min(
          Math.max(
            Number(
              url.searchParams.get(
                "page_size"
              )
            ) || 20,
            1
          ),
          20
        );

      const wanted =
        url.searchParams.get(
          "model"
        ) ||
        "both";

      const styleTerms =
        terms(
          url.searchParams.get(
            "style"
          )
        );

      const excluded =
        terms(
          url.searchParams.get(
            "exclude"
          )
        );

      const matchMode =
        url.searchParams.get(
          "match"
        ) === "any"
          ? "any"
          : "all";

      const experimentalParam =
        url.searchParams.get(
          "experimental"
        );

      const experimentalMode =
        [
          "normal",
          "boost",
          "only"
        ].includes(
          experimentalParam
        )
          ? experimentalParam
          : "normal";

      if (!term) {

        return cors({
          ok: false,
          error:
            "Wpisz frazę wyszukiwania."
        }, 400);
      }

      const page =
        await searchDataset(
          term,
          cursor,
          pageSize
        );

      const stats = {
        received:
          page.checked,

        model_missing:
          0,

        model_mismatch:
          0,

        matched:
          0,

        http_errors:
          page.httpErrors,

        parse_errors:
          page.parseErrors,

        sampled:
          page.checked,

        dataset_size:
          page.sampleSize,

        model_versions:
          {}
      };

      const matches =
        [];

      for (
        const d of
          page.extracted
      ) {

        const model =
          d.model_version ||
          "unknown";

        stats.model_versions[
          model
        ] =
          (
            stats.model_versions[
              model
            ] ||
            0
          ) + 1;

        if (
          !d.model_version
        ) {
          stats.model_missing++;
          continue;
        }

        if (
          !ver(
            d.model_version,
            wanted
          )
        ) {
          stats.model_mismatch++;
          continue;
        }

        const result =
          score(
            d,
            styleTerms,
            excluded,
            matchMode,
            experimentalMode,
            wanted
          );

        if (result) {

          matches.push(
            result
          );

          stats.matched++;
        }
      }

      matches.sort(
        (a, b) =>
          (
            b.match_score ||
            0
          ) -
          (
            a.match_score ||
            0
          )
      );

      /*
       * Nie używamy już
       * has_more na podstawie
       * Suno cursor.
       *
       * Dataset jest skończony,
       * ale możemy robić kolejne
       * losowe próbki.
       */

      const nextCursor =
        String(
          (
            Number(cursor) ||
            0
          ) + 1
        );

      return cors({

        ok: true,

        version:
          "explorer-7",

        term,

        source:
          "Hugging Face public Suno playlist",

        checked:
          page.checked,

        sample_size:
          page.sampleSize,

        page:
          page.page,

        next_cursor:
          nextCursor,

        has_more:
          true,

        stats,

        results:
          matches,

        raw_count:
          page.checked
      });

    } catch (error) {

      return cors({

        ok: false,

        error:
          String(
            error.message ||
            error
          )

      }, 502);
    }
  }
};
