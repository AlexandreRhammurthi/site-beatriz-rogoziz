import { createClient } from "npm:@supabase/supabase-js@2";
import { decryptInstagramToken, encryptInstagramToken } from "../_shared/instagram-crypto.ts";

const ALLOWED_ORIGINS = new Set([
  "https://beatrizrogoziz.com.br",
  "https://www.beatrizrogoziz.com.br",
  "https://alexandrerhammurthi.github.io",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:8087",
  "http://127.0.0.1:8087",
]);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const INSTAGRAM_TOKEN_ENCRYPTION_KEY = Deno.env.get("INSTAGRAM_TOKEN_ENCRYPTION_KEY") ||
  Deno.env.get("BOOKING_TOKEN_PEPPER") || "";
const LEGACY_INSTAGRAM_ACCESS_TOKEN = Deno.env.get("INSTAGRAM_ACCESS_TOKEN") || "";
const LEGACY_INSTAGRAM_USER_ID = Deno.env.get("INSTAGRAM_USER_ID") || "me";
const INSTAGRAM_GRAPH_VERSION = (Deno.env.get("INSTAGRAM_GRAPH_VERSION") || "").replace(/^\/+|\/+$/g, "");
const META_GRAPH_VERSION = (Deno.env.get("META_GRAPH_VERSION") || "v26.0").replace(/^\/+|\/+$/g, "");
const PROFILE_URL = "https://www.instagram.com/beatrizrogozizribeiro_/";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
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

type StoredConnection = {
  auth_method?: "instagram_login" | "unified_login";
  instagram_user_id: string;
  username: string;
  token_ciphertext: string;
  token_iv: string;
  token_expires_at?: string | null;
};

const graphRoot = () => INSTAGRAM_GRAPH_VERSION
  ? `https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}`
  : "https://graph.instagram.com";

const metaGraphRoot = () => `https://graph.facebook.com/${META_GRAPH_VERSION}`;

const readConnection = async () => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !INSTAGRAM_TOKEN_ENCRYPTION_KEY) return null;
  const { data, error } = await admin.from("instagram_connections")
    .select("auth_method,instagram_user_id,username,token_ciphertext,token_iv,token_expires_at")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) return null;
  const connection = data as StoredConnection;
  const token = await decryptInstagramToken(
    connection.token_ciphertext,
    connection.token_iv,
    INSTAGRAM_TOKEN_ENCRYPTION_KEY,
  );
  return { connection, token };
};

const refreshTokenIfNeeded = async (stored: Awaited<ReturnType<typeof readConnection>>) => {
  if (stored?.connection.auth_method === "unified_login") return stored;
  if (!stored?.connection.token_expires_at) return stored;
  const refreshAt = new Date(stored.connection.token_expires_at).getTime() - 7 * 24 * 60 * 60 * 1000;
  if (Date.now() < refreshAt) return stored;
  const endpoint = new URL(`${graphRoot()}/refresh_access_token`);
  endpoint.searchParams.set("grant_type", "ig_refresh_token");
  endpoint.searchParams.set("access_token", stored.token);
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(10000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) return stored;
  const encrypted = await encryptInstagramToken(payload.access_token, INSTAGRAM_TOKEN_ENCRYPTION_KEY);
  const expiresAt = new Date(Date.now() + Math.max(300, Number(payload.expires_in || 5184000)) * 1000).toISOString();
  await admin.from("instagram_connections").update({
    token_ciphertext: encrypted.ciphertext,
    token_iv: encrypted.iv,
    token_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }).eq("id", true);
  return {
    connection: { ...stored.connection, token_expires_at: expiresAt },
    token: String(payload.access_token),
  };
};

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "GET") {
    return json(origin, { error: "Método não permitido." }, 405);
  }
  let stored: Awaited<ReturnType<typeof readConnection>> = null;
  try {
    stored = await refreshTokenIfNeeded(await readConnection());
  } catch (error) {
    console.error("Não foi possível ler a conexão protegida do Instagram.", error instanceof Error ? error.message : "erro desconhecido");
  }
  const accessToken = stored?.token || LEGACY_INSTAGRAM_ACCESS_TOKEN;
  const instagramUserId = stored?.connection.instagram_user_id || LEGACY_INSTAGRAM_USER_ID;
  const profileUrl = stored?.connection.username
    ? `https://www.instagram.com/${encodeURIComponent(stored.connection.username)}/`
    : PROFILE_URL;

  if (!accessToken) {
    return json(origin, {
      connected: false,
      profile_url: profileUrl,
      items: [],
    }, 200, "public, max-age=60");
  }

  try {
    const apiRoot = stored?.connection.auth_method === "unified_login" ? metaGraphRoot() : graphRoot();
    const endpoint = new URL(`${apiRoot}/${encodeURIComponent(instagramUserId)}/media`);
    endpoint.searchParams.set("fields", "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp");
    endpoint.searchParams.set("limit", "12");
    endpoint.searchParams.set("access_token", accessToken);

    const response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.error("Instagram Graph API indisponível.", { status: response.status });
      return json(origin, { connected: false, profile_url: profileUrl, items: [] }, 502);
    }

    const payload = await response.json();
    const items = (Array.isArray(payload?.data) ? payload.data : [])
      .map((item: InstagramMedia) => ({
        id: String(item.id || ""),
        caption: String(item.caption || "").slice(0, 2200),
        media_type: String(item.media_type || "IMAGE"),
        media_url: isHttpsUrl(item.media_url) ? item.media_url : "",
        thumbnail_url: isHttpsUrl(item.thumbnail_url) ? item.thumbnail_url : "",
        permalink: isHttpsUrl(item.permalink) ? item.permalink : profileUrl,
        timestamp: item.timestamp || "",
      }))
      .filter((item: InstagramMedia) => item.id && (item.thumbnail_url || item.media_url));

    return json(origin, {
      connected: true,
      profile_url: profileUrl,
      items,
    }, 200, "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
  } catch (error) {
    console.error("Falha ao carregar a galeria do Instagram.", error instanceof Error ? error.message : "erro desconhecido");
    return json(origin, { connected: false, profile_url: profileUrl, items: [] }, 502);
  }
});
