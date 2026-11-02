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
  const [home, booking, admin, manage, servicesFaq, scheduleFaq, robots, sitemap] = await Promise.all([
    fetch(`${baseUrl}/?v=${stamp}`),
    fetch(`${baseUrl}/booking.html?v=${stamp}`),
    fetch(`${baseUrl}/admin.html?v=${stamp}`),
    fetch(`${baseUrl}/manage-booking.html?v=${stamp}`),
    fetch(`${baseUrl}/admin-faq-servicos.html?v=${stamp}`),
    fetch(`${baseUrl}/admin-faq-agenda.html?v=${stamp}`),
    fetch(`${baseUrl}/robots.txt?v=${stamp}`),
    fetch(`${baseUrl}/sitemap.xml?v=${stamp}`)
  ]);
  assert.equal(home.status, 200);
  assert.equal(booking.status, 200);
  assert.equal(admin.status, 200);
  assert.equal(manage.status, 200);
  assert.equal(servicesFaq.status, 200);
  assert.equal(scheduleFaq.status, 200);
  assert.equal(robots.status, 200);
  assert.equal(sitemap.status, 200);
  const homeHtml = await home.text();
  assert.match(homeHtml, />Agendar online</);
  assert.match(homeHtml, /data-whatsapp/);
  assert.match(homeHtml, /rel="canonical" href="https:\/\/www\.beatrizrogoziz\.com\.br\/"/);
  assert.match(await booking.text(), /href="privacy\.html"/);
  assert.match(await (await fetch(`${baseUrl}/booking.html?v=${stamp + 1}`)).text(), /data-available-dates/);
  const adminHtml = await admin.text();
  assert.match(adminHtml, /data-admin-view="home"/);
  assert.match(adminHtml, /data-admin-view="schedule-menu"/);
  assert.match(adminHtml, /data-admin-target="services"/);
  assert.match(adminHtml, /data-admin-target="schedule-settings"/);
  assert.match(adminHtml, /data-admin-target="appointments"/);
  assert.match(adminHtml, /data-admin-target="create-appointment"/);
  assert.match(adminHtml, /data-admin-target="packages"/);
  assert.match(adminHtml, /data-admin-target="history"/);
  assert.match(adminHtml, /data-admin-target="operations-dashboard"/);
  assert.match(adminHtml, /data-operations-metrics/);
  assert.match(adminHtml, /data-history-list/);
  assert.match(adminHtml, /href="admin-faq-servicos\.html"/);
  assert.match(adminHtml, /href="admin-faq-agenda\.html"/);
  assert.match(adminHtml, /data-blocked-period-form/);
  assert.match(adminHtml, /data-appointments-filter/);
  assert.match(adminHtml, /data-appointments-list/);
  assert.match(adminHtml, /data-manual-booking-form/);
  assert.match(adminHtml, /data-reset-request-form/);
  assert.match(adminHtml, /data-reset-password-form/);
  assert.match(adminHtml, /data-package-form/);
  assert.match(adminHtml, /data-packages-list/);
  assert.match(await manage.text(), /data-reschedule-form/);
  assert.match(await servicesFaq.text(), /FAQ de Serviços e valores/);
  assert.match(await scheduleFaq.text(), /Intervalo não é preparação/);
  assert.match(await robots.text(), /sitemap\.xml/i);
  assert.match(await sitemap.text(), /https:\/\/www\.beatrizrogoziz\.com\.br\//);
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
  assert.ok(config.services.every((service) => Array.isArray(service.price_options)));
});

test("API pública lista datas realmente disponíveis", { skip: !run }, async () => {
  const configResponse = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Origin: baseUrl },
    body: JSON.stringify({ action: "config" })
  });
  const config = await configResponse.json();
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Origin: baseUrl },
    body: JSON.stringify({ action: "available-dates", service_id: config.services[0].id })
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.ok(Array.isArray(result.dates));
  assert.ok(result.dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)));
});

test("ações administrativas da agenda rejeitam chamadas anônimas", { skip: !run }, async () => {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Origin: baseUrl },
    body: JSON.stringify({ action: "admin-config" })
  });
  assert.equal(response.status, 401);
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

test("pacotes e sessões não podem ser consultados anonimamente", { skip: !run }, async () => {
  for (const table of ["client_packages", "package_sessions"]) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=id&limit=1`, {
      headers: { apikey: key }
    });
    assert.ok([401, 403].includes(response.status), `${table}: status inesperado ${response.status}`);
  }
});

test("histórico administrativo não pode ser consultado anonimamente", { skip: !run }, async () => {
  const response = await fetch(`${supabaseUrl}/rest/v1/admin_audit_log?select=id&limit=1`, {
    headers: { apikey: key }
  });
  assert.ok([401, 403].includes(response.status), `status inesperado: ${response.status}`);
});

test("executor de lembretes rejeita chamadas públicas", { skip: !run }, async () => {
  const response = await fetch(`${supabaseUrl}/functions/v1/booking-reminders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key }
  });
  assert.equal(response.status, 401);
});
