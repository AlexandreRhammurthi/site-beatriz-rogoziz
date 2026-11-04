import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [html, adminJs, supabaseConfig, adminFunction, feedFunction, cryptoHelper, migration, configToml] = await Promise.all([
  readFile(new URL("admin.html", root), "utf8"),
  readFile(new URL("admin.js", root), "utf8"),
  readFile(new URL("supabase-config.js", root), "utf8"),
  readFile(new URL("supabase/functions/instagram-admin/index.ts", root), "utf8"),
  readFile(new URL("supabase/functions/instagram-feed/index.ts", root), "utf8"),
  readFile(new URL("supabase/functions/_shared/instagram-crypto.ts", root), "utf8"),
  readFile(new URL("supabase/migrations/20261103150000_instagram_admin_connection.sql", root), "utf8"),
  readFile(new URL("supabase/config.toml", root), "utf8"),
]);

test("painel oferece gestão da conta do Instagram", () => {
  assert.match(html, /data-admin-target="instagram"/);
  assert.match(html, /data-admin-view="instagram"/);
  assert.match(html, /data-instagram-connect/);
  assert.match(html, /data-instagram-disconnect/);
  assert.match(adminJs, /callInstagramAdmin\("status"\)/);
  assert.match(adminJs, /callInstagramAdmin\("connect"\)/);
  assert.match(adminJs, /callInstagramAdmin\("disconnect"\)/);
  assert.match(supabaseConfig, /functions\/v1\/instagram-admin/);
});

test("OAuth exige administrador, estado descartável e escopo mínimo", () => {
  assert.match(adminFunction, /getAdminUser\(request\)/);
  assert.match(adminFunction, /instagram_business_basic/);
  assert.match(adminFunction, /instagram_oauth_states/);
  assert.match(adminFunction, /\.delete\(\)[\s\S]*\.eq\("state_hash", stateHash\)/);
  assert.match(adminFunction, /force_authentication/);
  assert.match(adminFunction, /hostname !== "www\.instagram\.com"|www\.instagram\.com\/oauth\/authorize/);
  assert.match(configToml, /\[functions\.instagram-admin\][\s\S]*verify_jwt = false/);
});

test("token fica cifrado e tabelas privadas não são expostas ao frontend", () => {
  assert.match(cryptoHelper, /AES-GCM/);
  assert.match(adminFunction, /encryptInstagramToken/);
  assert.match(feedFunction, /decryptInstagramToken/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.instagram_connections from anon, authenticated/);
  assert.match(migration, /revoke all on table public\.instagram_oauth_states from anon, authenticated/);
  assert.doesNotMatch(adminJs, /token_ciphertext|INSTAGRAM_ACCESS_TOKEN/);
  assert.doesNotMatch(supabaseConfig, /INSTAGRAM_CLIENT_SECRET|INSTAGRAM_ACCESS_TOKEN|INSTAGRAM_TOKEN_ENCRYPTION_KEY/);
});

test("feed renova a autorização e mantém fallback em caso de falha", () => {
  assert.match(feedFunction, /refresh_access_token/);
  assert.match(feedFunction, /ig_refresh_token/);
  assert.match(feedFunction, /instagram_connections/);
  assert.match(feedFunction, /connected: false/);
});
