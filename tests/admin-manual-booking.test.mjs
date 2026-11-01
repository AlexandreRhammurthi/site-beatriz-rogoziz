import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminHtml = await readFile(new URL("../admin.html", import.meta.url), "utf8");
const adminJs = await readFile(new URL("../admin.js", import.meta.url), "utf8");
const api = await readFile(new URL("../supabase/functions/booking-api/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261031120000_add_admin_booking_source.sql", import.meta.url), "utf8");

test("painel oferece lançamento administrativo dentro da Agenda", () => {
  assert.match(adminHtml, /data-admin-target="create-appointment"/);
  assert.match(adminHtml, /data-admin-view="create-appointment"/);
  assert.match(adminHtml, /data-manual-booking-form/);
  assert.match(adminHtml, /name="sync_calendar"/);
  assert.match(adminHtml, /name="send_email"/);
});

test("lançamento manual consulta disponibilidade e cria reserva autenticada", () => {
  assert.match(adminJs, /callBookingApi\("admin-config", \{\}, true\)/);
  assert.match(adminJs, /callBookingApi\("admin-availability"/);
  assert.match(adminJs, /callBookingApi\("admin-create"/);
  assert.match(adminJs, /headers\.Authorization = `Bearer/);
});

test("ações administrativas da API exigem usuário administrador", () => {
  assert.match(api, /action\.startsWith\("admin-"\)/);
  assert.match(api, /adminAction && !\(await isAdminRequest\(request\)\)/);
  assert.match(api, /from\("admin_users"\)/);
  assert.match(api, /if \(!isAdminCreate\)[\s\S]*recentThreshold/);
});

test("origem do agendamento é persistida com domínio restrito", () => {
  assert.match(migration, /add column if not exists booking_source/);
  assert.match(migration, /check \(booking_source in \('online', 'admin'\)\)/);
  assert.match(api, /booking_source: isAdminCreate \? "admin" : "online"/);
  assert.match(adminJs, /Lançamento administrativo/);
});

test("token de gerenciamento só retorna após criação e não integra a listagem", () => {
  assert.match(api, /manage_url: manageUrl/);
  assert.doesNotMatch(adminJs.match(/\.select\("id, customer_name[^"]+/)?.[0] || "", /manage_token_hash/);
});
