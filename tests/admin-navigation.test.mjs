import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminHtml = await readFile(new URL("../admin.html", import.meta.url), "utf8");
const adminJs = await readFile(new URL("../admin.js", import.meta.url), "utf8");

test("painel inicia com escolhas separadas para conteúdo e agenda", () => {
  assert.match(adminHtml, /data-admin-view="home"/);
  assert.match(adminHtml, /data-admin-target="services"/);
  assert.match(adminHtml, /data-admin-target="schedule-menu"/);
  assert.match(adminHtml, /data-admin-target="instagram"/);
  assert.match(adminHtml, /Serviços e valores/);
});

test("agenda possui submenu para configuração e agendamentos", () => {
  assert.match(adminHtml, /data-admin-view="schedule-menu"/);
  assert.match(adminHtml, /data-admin-view="instagram"/);
  assert.match(adminHtml, /data-admin-target="schedule-settings"/);
  assert.match(adminHtml, /data-admin-target="appointments"/);
  assert.match(adminHtml, /Administrar a agenda/);
  assert.match(adminHtml, /Ver agendamentos marcados/);
});

test("áreas administrativas carregam dados apenas quando abertas", () => {
  assert.match(adminJs, /if \(view === "services"\) await loadServices\(\)/);
  assert.match(adminJs, /if \(view === "schedule-settings"\) await Promise\.all\(\[loadBookingSettings\(\), loadBlockedPeriods\(\)\]\)/);
  assert.match(adminJs, /if \(view === "appointments"\) await loadAppointments\(\)/);
  assert.match(adminJs, /isFirstEntry \? "home" : currentAdminView/);
});

test("navegação oferece retorno ao início e ao submenu da agenda", () => {
  assert.match(adminHtml, /data-admin-home/);
  assert.match(adminHtml, /data-admin-target="home"/);
  assert.match(adminHtml, /data-admin-target="schedule-menu"/);
  assert.match(adminJs, /showAdminView\(navigationButton\.dataset\.adminTarget\)/);
});
