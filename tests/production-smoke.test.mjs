import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const run = process.env.RUN_PRODUCTION_SMOKE === "1";
const baseUrl = "https://www.beatrizrogoziz.com.br";
const configSource = await readFile(new URL("../supabase-config.js", import.meta.url), "utf8");
const key = configSource.match(/publishableKey:\s*"([^"]+)"/)?.[1];
const apiUrl = configSource.match(/bookingApiUrl:\s*"([^"]+)"/)?.[1];
const supabaseUrl = configSource.match(/url:\s*"([^"]+)"/)?.[1];

test("site publicado expõe o contrato atualizado", { skip: !run }, async () => {
  const stamp = Date.now();
  const [booking, admin, manage] = await Promise.all([
    fetch(`${baseUrl}/booking.html?v=${stamp}`),
    fetch(`${baseUrl}/admin.html?v=${stamp}`),
    fetch(`${baseUrl}/manage-booking.html?v=${stamp}`)
  ]);
  assert.equal(booking.status, 200);
  assert.equal(admin.status, 200);
  assert.equal(manage.status, 200);
  assert.match(await booking.text(), /href="privacy\.html"/);
  const adminHtml = await admin.text();
  assert.match(adminHtml, /data-blocked-period-form/);
  assert.match(adminHtml, /data-appointments-filter/);
  assert.match(adminHtml, /data-appointments-list/);
  assert.match(await manage.text(), /data-reschedule-form/);
});

test("API pública de agendamento permanece operacional", { skip: !run }, async () => {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Origin: baseUrl },
    body: JSON.stringify({ action: "config" })
  });
  assert.equal(response.status, 200);
  const config = await response.json();
  assert.equal(config.enabled, true);
  assert.ok(Array.isArray(config.services) && config.services.length > 0);
});

test("reagendamento rejeita link inválido sem alterar dados", { skip: !run }, async () => {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Origin: baseUrl },
    body: JSON.stringify({
      action: "reschedule",
      token: "x".repeat(43),
      starts_at: "2026-12-01T15:00:00.000Z"
    })
  });
  assert.equal(response.status, 404);
});

test("bloqueios não podem ser consultados anonimamente", { skip: !run }, async () => {
  const response = await fetch(`${supabaseUrl}/rest/v1/blocked_periods?select=id&limit=1`, {
    headers: { apikey: key }
  });
  assert.ok([401, 403].includes(response.status), `status inesperado: ${response.status}`);
});

test("agendamentos não podem ser consultados anonimamente", { skip: !run }, async () => {
  const response = await fetch(`${supabaseUrl}/rest/v1/appointments?select=id&limit=1`, {
    headers: { apikey: key }
  });
  assert.ok([401, 403].includes(response.status), `status inesperado: ${response.status}`);
});
