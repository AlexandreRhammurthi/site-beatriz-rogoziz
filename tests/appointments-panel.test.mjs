import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

await import("../admin-utils.js");
const utils = globalThis.STUDIO_B_ADMIN_UTILS;
const adminHtml = await readFile(new URL("../admin.html", import.meta.url), "utf8");
const adminJs = await readFile(new URL("../admin.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261025210000_booking_system.sql", import.meta.url), "utf8");

const appointment = {
  customer_name: "Ana Cecília",
  customer_email: "ana@example.com",
  customer_phone: "5511999999999",
  services: { name: "Drenagem linfática" }
};

test("busca ignora acentos e diferenciação entre maiúsculas e minúsculas", () => {
  assert.equal(utils.appointmentMatches(appointment, "ana cecilia"), true);
  assert.equal(utils.appointmentMatches(appointment, "DRENAGEM"), true);
  assert.equal(utils.appointmentMatches(appointment, "11999999999"), true);
  assert.equal(utils.appointmentMatches(appointment, "relax"), false);
});

test("formata telefone brasileiro para leitura", () => {
  assert.equal(utils.formatPhone("5511999999999"), "(11) 99999-9999");
  assert.equal(utils.formatPhone("551133334444"), "(11) 3333-4444");
});

test("traduz apenas os estados aceitos pelo banco", () => {
  assert.equal(utils.appointmentStatusLabel("confirmed"), "Confirmado");
  assert.equal(utils.appointmentStatusLabel("pending"), "Pendente");
  assert.equal(utils.appointmentStatusLabel("cancelled"), "Cancelado");
});

test("painel contém filtros, resumo e lista protegida", () => {
  assert.match(adminHtml, /data-appointments-filter/);
  assert.match(adminHtml, /data-appointments-summary/);
  assert.match(adminHtml, /data-appointments-list/);
  assert.match(adminJs, /from\("appointments"\)/);
  assert.match(adminJs, /services\(name\)/);
});

test("consulta tem limite e período explícitos", () => {
  assert.match(adminJs, /\.gte\("starts_at"/);
  assert.match(adminJs, /\.lt\("starts_at"/);
  assert.match(adminJs, /\.limit\(500\)/);
});

test("RLS restringe os agendamentos a administradores", () => {
  assert.match(migration, /create policy "Admins manage appointments"/);
  assert.match(migration, /on public\.appointments for all[\s\S]*?using \(public\.is_admin\(\)\)/);
});
