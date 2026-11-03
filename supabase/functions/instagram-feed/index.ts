const ALLOWED_ORIGINS = new Set([
  "https://beatrizrogoziz.com.br",
  "https://www.beatrizrogoziz.com.br",
  "https://alexandrerhammurthi.github.io",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:8087",
  "http://127.0.0.1:8087",
]);

const INSTAGRAM_ACCESS_TOKEN = Deno.env.get("INSTAGRAM_ACCESS_TOKEN") || "";
const INSTAGRAM_USER_ID = Deno.env.get("INSTAGRAM_USER_ID") || "me";
const INSTAGRAM_GRAPH_VERSION = (Deno.env.get("INSTAGRAM_GRAPH_VERSION") || "").replace(/^\/+|\/+$/g, "");
const PROFILE_URL = "https://www.instagram.com/beatrizrogozizribeiro_/";

const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://www.beatrizrogoziz.com.br",
  "Access-Control-Allow-Headers": "apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Vary": "Origin",
});

const json = (
  origin: string | null,
  body: unknown,
  status = 200,
  cacheControl = "no-store",
) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders(origin),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
  },
});

type InstagramMedia = {
  id?: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
};

const isHttpsUrl = (value: unknown) => {
  try {
    return new URL(String(value || "")).protocol === "https:";
  } catch {
    return false;
  }
};

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "GET") {
    return json(origin, { error: "Método não permitido." }, 405);
  }
  if (!INSTAGRAM_ACCESS_TOKEN) {
    return json(origin, {
      connected: false,
      profile_url: PROFILE_URL,
      items: [],
    }, 200, "public, max-age=60");
  }

  try {
    const requestUrl = new URL(request.url);
    const after = requestUrl.searchParams.get("after") || "";
    if (after && (after.length > 1024 || !/^[A-Za-z0-9._=-]+$/.test(after))) {
      return json(origin, { error: "Cursor de paginação inválido." }, 400);
    }
    const graphRoot = INSTAGRAM_GRAPH_VERSION
      ? `https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}`
      : "https://graph.instagram.com";
    const endpoint = new URL(`${graphRoot}/${encodeURIComponent(INSTAGRAM_USER_ID)}/media`);
    endpoint.searchParams.set("fields", "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp");
    endpoint.searchParams.set("limit", "12");
    if (after) endpoint.searchParams.set("after", after);
    endpoint.searchParams.set("access_token", INSTAGRAM_ACCESS_TOKEN);

    const response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.error("Instagram Graph API indisponível.", { status: response.status });
      return json(origin, { connected: false, profile_url: PROFILE_URL, items: [] }, 502);
    }

    const payload = await response.json();
    const items = (Array.isArray(payload?.data) ? payload.data : [])
      .map((item: InstagramMedia) => ({
        id: String(item.id || ""),
        caption: String(item.caption || "").slice(0, 2200),
        media_type: String(item.media_type || "IMAGE"),
        media_url: isHttpsUrl(item.media_url) ? item.media_url : "",
        thumbnail_url: isHttpsUrl(item.thumbnail_url) ? item.thumbnail_url : "",
        permalink: isHttpsUrl(item.permalink) ? item.permalink : PROFILE_URL,
        timestamp: item.timestamp || "",
      }))
      .filter((item: InstagramMedia) => item.id && (item.thumbnail_url || item.media_url));
    const nextCursor = String(payload?.paging?.cursors?.after || "");
    const hasMore = Boolean(payload?.paging?.next && nextCursor);

    return json(origin, {
      connected: true,
      profile_url: PROFILE_URL,
      items,
      next_cursor: hasMore ? nextCursor : "",
      has_more: hasMore,
    }, 200, "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
  } catch (error) {
    console.error("Falha ao carregar a galeria do Instagram.", error instanceof Error ? error.message : "erro desconhecido");
    return json(origin, { connected: false, profile_url: PROFILE_URL, items: [] }, 502);
  }
});
