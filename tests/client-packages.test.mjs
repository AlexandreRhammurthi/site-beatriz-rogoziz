import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../admin.html", import.meta.url), "utf8");
const js = await readFile(new URL("../admin.js", import.meta.url), "utf8");
const api = await readFile(new URL("../supabase/functions/booking-api/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261101130000_client_packages.sql", import.meta.url), "utf8");
const faq = await readFile(new URL("../admin-faq-servicos.html", import.meta.url), "utf8");

test("painel oferece cadastro e acompanhamento de pacotes", () => {
  assert.match(html, /data-admin-target="packages"/);
  assert.match(html, /data-admin-view="packages"/);
  assert.match(html, /data-package-form/);
  assert.match(html, /data-packages-filter/);
  assert.match(html, /data-packages-list/);
  assert.match(js, /from\("client_packages"\)/);
  assert.match(js, /from\("package_sessions"\)/);
});

test("situação e saldo são calculados a partir do histórico", () => {
  assert.match(js, /attendance_status === "completed"/);
  assert.match(js, /remaining === 0 \? "completed"/);
  assert.match(js, /item\.expires_on < packageToday\(\) \? "expired"/);
  assert.match(js, /attendance_status === "scheduled"/);
});

test("agendamento administrativo pode consumir um pacote compatível", () => {
  assert.match(html, /name="client_package_id"/);
  assert.match(js, /client_package_id: String\(values\.get\("client_package_id"\)/);
  assert.match(api, /clientPackage\.service_id !== payload\.service_id/);
  assert.match(api, /Este pacote não possui sessões restantes/);
  assert.match(api, /client_package_id: clientPackageId/);
});

test("banco sincroniza comparecimento e protege quantidade, serviço e validade", () => {
  assert.match(migration, /create table public\.client_packages/);
  assert.match(migration, /create table public\.package_sessions/);
  assert.match(migration, /appointments_sync_package_session/);
  assert.match(migration, /attendance_status in \('scheduled', 'completed'\)/);
  assert.match(migration, /The appointment service does not match the package/);
  assert.match(migration, /The package has no remaining sessions/);
  assert.match(migration, /Expiration cannot be earlier/);
});

test("dados de pacotes são restritos a administradores", () => {
  assert.match(migration, /alter table public\.client_packages enable row level security/);
  assert.match(migration, /alter table public\.package_sessions enable row level security/);
  assert.match(migration, /revoke all on public\.client_packages, public\.package_sessions from anon/);
  assert.match(migration, /using \(public\.is_admin\(\)\)/);
});

test("FAQ explica saldo, validade, situação e atualização automática", () => {
  assert.match(faq, /Pacotes de clientes/);
  assert.match(faq, /Sessões utilizadas/);
  assert.match(faq, /Ativo:/);
  assert.match(faq, /atualiza o pacote automaticamente/);
});
