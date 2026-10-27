import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const gitignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8");
const api = await readFile(new URL("../supabase/functions/booking-api/index.ts", import.meta.url), "utf8");
const reminders = await readFile(new URL("../supabase/functions/booking-reminders/index.ts", import.meta.url), "utf8");
const schema = await readFile(new URL("../supabase/migrations/20261025210000_booking_system.sql", import.meta.url), "utf8");
const security = await readFile(new URL("../supabase/migrations/20261025213000_booking_security.sql", import.meta.url), "utf8");

test("arquivos comuns de credenciais são ignorados", () => {
  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /client_secret\*\.json/);
});

test("origens de produção são explícitas e não usam curinga", () => {
  assert.match(api, /https:\/\/www\.beatrizrogoziz\.com\.br/);
  assert.doesNotMatch(api, /Access-Control-Allow-Origin[^\n]*\*/);
});

test("tokens de gerenciamento são armazenados somente como hash", () => {
  assert.match(schema, /manage_token_hash text not null unique/);
  assert.match(api, /manage_token_hash: tokenHash/);
  assert.doesNotMatch(schema, /manage_token\s+text/);
});

test("códigos de recuperação têm expiração e limite de tentativas", () => {
  assert.match(api, /recovery\.attempt_count >= 5/);
  assert.match(api, /expires_at/);
  assert.match(api, /\(count \|\| 0\) >= 3/);
});

test("tabelas sensíveis negam acesso anônimo", () => {
  for (const table of ["booking_settings", "availability_rules", "blocked_periods", "appointments"]) {
    assert.match(security, new RegExp(`revoke all on public\\.${table} from anon`));
  }
  assert.match(security, /revoke all on public\.booking_recovery_codes from anon, authenticated/);
});

test("função de lembretes exige credencial interna", () => {
  assert.match(reminders, /Bearer \$\{SERVICE_ROLE_KEY\}/);
  assert.match(reminders, /Cache-Control.*no-store/s);
});

test("criação de reservas possui limite por e-mail e telefone", () => {
  assert.match(api, /recentEmailCount/);
  assert.match(api, /recentPhoneCount/);
  assert.match(api, /}, 429/);
});
