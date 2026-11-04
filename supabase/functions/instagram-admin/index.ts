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
const INSTAGRAM_CLIENT_ID = Deno.env.get("INSTAGRAM_CLIENT_ID") || "";
const INSTAGRAM_CLIENT_SECRET = Deno.env.get("INSTAGRAM_CLIENT_SECRET") || "";
const INSTAGRAM_TOKEN_ENCRYPTION_KEY = Deno.env.get("INSTAGRAM_TOKEN_ENCRYPTION_KEY") ||
  Deno.env.get("BOOKING_TOKEN_PEPPER") || "";
const INSTAGRAM_GRAPH_VERSION = (Deno.env.get("INSTAGRAM_GRAPH_VERSION") || "").replace(/^\/+|\/+$/g, "");
const INSTAGRAM_REDIRECT_URI = Deno.env.get("INSTAGRAM_REDIRECT_URI") ||
  `${SUPABASE_URL}/functions/v1/instagram-admin`;
const SITE_URL = (Deno.env.get("INSTAGRAM_SITE_URL") || "https://www.beatrizrogoziz.com.br").replace(/\/$/, "");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : SITE_URL,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const json = (origin: string | null, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders(origin),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  },
});

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const randomToken = (size = 32) => {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

const graphRoot = () => INSTAGRAM_GRAPH_VERSION
  ? `https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}`
  : "https://graph.instagram.com";

const configurationReady = () => Boolean(
  SUPABASE_URL && SERVICE_ROLE_KEY && INSTAGRAM_CLIENT_ID && INSTAGRAM_CLIENT_SECRET &&
  INSTAGRAM_TOKEN_ENCRYPTION_KEY && INSTAGRAM_REDIRECT_URI,
);

const getAdminUser = async (request: Request) => {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return null;
  const { data: membership, error: membershipError } = await admin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  return membershipError || !membership ? null : userData.user;
};

const redirectToAdmin = (status: "connected" | "error", reason = "") => {
  const url = new URL(`${SITE_URL}/admin.html`);
  url.searchParams.set("instagram", status);
  if (reason) url.searchParams.set("reason", reason.slice(0, 80));
  return Response.redirect(url.toString(), 303);
};

const exchangeAuthorizationCode = async (code: string) => {
  const form = new FormData();
  form.set("client_id", INSTAGRAM_CLIENT_ID);
  form.set("client_secret", INSTAGRAM_CLIENT_SECRET);
  form.set("grant_type", "authorization_code");
  form.set("redirect_uri", INSTAGRAM_REDIRECT_URI);
  form.set("code", code);
  const response = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(12000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) throw new Error("Não foi possível concluir a autorização na Meta.");
  return payload;
};

const exchangeLongLivedToken = async (shortToken: string) => {
  const endpoint = new URL(`${graphRoot()}/access_token`);
  endpoint.searchParams.set("grant_type", "ig_exchange_token");
  endpoint.searchParams.set("client_secret", INSTAGRAM_CLIENT_SECRET);
  endpoint.searchParams.set("access_token", shortToken);
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(12000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) return { access_token: shortToken, expires_in: 3600 };
  return payload;
};

const readProfile = async (token: string) => {
  const endpoint = new URL(`${graphRoot()}/me`);
  endpoint.searchParams.set("fields", "user_id,username,name,profile_picture_url");
  endpoint.searchParams.set("access_token", token);
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(12000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.user_id || !payload?.username) {
    throw new Error("A Meta não retornou uma conta profissional válida.");
  }
  return payload;
};

const handleCallback = async (url: URL) => {
  if (!configurationReady()) return redirectToAdmin("error", "configuration");
  if (url.searchParams.get("error")) return redirectToAdmin("error", "denied");
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  if (!code || !state) return redirectToAdmin("error", "invalid_callback");

  const stateHash = await sha256(state);
  const now = new Date().toISOString();
  const { data: savedState, error: stateError } = await admin
    .from("instagram_oauth_states")
    .delete()
    .eq("state_hash", stateHash)
    .gt("expires_at", now)
    .select("admin_user_id")
    .maybeSingle();
  if (stateError || !savedState) return redirectToAdmin("error", "expired_state");

  try {
    const shortToken = await exchangeAuthorizationCode(code);
    const longToken = await exchangeLongLivedToken(shortToken.access_token);
    const profile = await readProfile(longToken.access_token);
    const encrypted = await encryptInstagramToken(longToken.access_token, INSTAGRAM_TOKEN_ENCRYPTION_KEY);
    const expiresIn = Math.max(300, Number(longToken.expires_in || 3600));
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const { error } = await admin.from("instagram_connections").upsert({
      id: true,
      instagram_user_id: String(profile.user_id),
      username: String(profile.username),
      display_name: profile.name ? String(profile.name) : null,
      token_ciphertext: encrypted.ciphertext,
      token_iv: encrypted.iv,
      token_expires_at: expiresAt,
      connected_by: savedState.admin_user_id,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) throw error;
    return redirectToAdmin("connected");
  } catch (error) {
    console.error("Falha no callback do Instagram.", error instanceof Error ? error.message : "erro desconhecido");
    return redirectToAdmin("error", "exchange_failed");
  }
};

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);

  if (request.method === "GET") return handleCallback(url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST") return json(origin, { error: "Método não permitido." }, 405);

  const user = await getAdminUser(request);
  if (!user) return json(origin, { error: "Acesso administrativo necessário." }, 403);
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "status");

  if (action === "status") {
    const { data, error } = await admin.from("instagram_connections")
      .select("instagram_user_id,username,display_name,token_expires_at,connected_at,updated_at")
      .eq("id", true)
      .maybeSingle();
    if (error) return json(origin, { error: "Não foi possível consultar a conexão." }, 500);
    return json(origin, {
      configured: configurationReady(),
      connected: Boolean(data),
      account: data ? {
        id: data.instagram_user_id,
        username: data.username,
        name: data.display_name,
        profile_url: `https://www.instagram.com/${encodeURIComponent(data.username)}/`,
        connected_at: data.connected_at,
        expires_at: data.token_expires_at,
      } : null,
    });
  }

  if (action === "connect") {
    if (!configurationReady()) return json(origin, {
      error: "O aplicativo Meta ainda precisa das credenciais iniciais no Supabase.",
      code: "instagram_not_configured",
    }, 409);
    await admin.from("instagram_oauth_states").delete().lt("expires_at", new Date().toISOString());
    const state = randomToken(36);
    const { error } = await admin.from("instagram_oauth_states").insert({
      state_hash: await sha256(state),
      admin_user_id: user.id,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (error) return json(origin, { error: "Não foi possível iniciar a autenticação." }, 500);
    const authorize = new URL("https://www.instagram.com/oauth/authorize");
    authorize.searchParams.set("enable_fb_login", "0");
    authorize.searchParams.set("force_authentication", "1");
    authorize.searchParams.set("client_id", INSTAGRAM_CLIENT_ID);
    authorize.searchParams.set("redirect_uri", INSTAGRAM_REDIRECT_URI);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("scope", "instagram_business_basic");
    authorize.searchParams.set("state", state);
    return json(origin, { authorization_url: authorize.toString() });
  }

  if (action === "disconnect") {
    const { data } = await admin.from("instagram_connections")
      .select("token_ciphertext,token_iv")
      .eq("id", true)
      .maybeSingle();
    if (data && INSTAGRAM_TOKEN_ENCRYPTION_KEY) {
      try {
        const token = await decryptInstagramToken(data.token_ciphertext, data.token_iv, INSTAGRAM_TOKEN_ENCRYPTION_KEY);
        const endpoint = new URL(`${graphRoot()}/me/permissions`);
        endpoint.searchParams.set("access_token", token);
        await fetch(endpoint, { method: "DELETE", signal: AbortSignal.timeout(8000) });
      } catch (error) {
        console.warn("A autorização remota não pôde ser revogada; a conexão local será removida.", error instanceof Error ? error.message : "erro desconhecido");
      }
    }
    const { error } = await admin.from("instagram_connections").delete().eq("id", true);
    if (error) return json(origin, { error: "Não foi possível desconectar a conta." }, 500);
    return json(origin, { disconnected: true });
  }

  return json(origin, { error: "Ação inválida." }, 400);
});
