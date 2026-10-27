import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

await import("../admin-utils.js");
const utils = globalThis.STUDIO_B_ADMIN_UTILS;
const migration = await readFile(new URL("../supabase/migrations/20261027140000_add_booking_capacity.sql", import.meta.url), "utf8");
const api = await readFile(new URL("../supabase/functions/booking-api/index.ts", import.meta.url), "utf8");
const adminHtml = await readFile(new URL("../admin.html", import.meta.url), "utf8");
const adminJs = await readFile(new URL("../admin.js", import.meta.url), "utf8");

test("configuração de capacidade tem limites seguros", () => {
  assert.match(migration, /buffer_minutes between 0 and 180/);
  assert.match(migration, /daily_booking_limit between 0 and 50/);
});

test("intervalo de preparação amplia ambos os lados do conflito", () => {
  assert.match(api, /period\.end\.getTime\(\) \+ buffer/);
  assert.match(api, /end\.getTime\(\) \+ buffer > period\.start\.getTime\(\)/);
});

test("limite diário encerra a geração de horários", () => {
  assert.match(api, /appointments \|\| \[\]\)\.length >= settings\.daily_booking_limit/);
  assert.match(api, /return \{ service, slots: \[\] \}/);
});

test("painel permite configurar capacidade operacional", () => {
  assert.match(adminHtml, /name="buffer_minutes"/);
  assert.match(adminHtml, /name="daily_booking_limit"/);
  assert.match(adminJs, /buffer_minutes: Number/);
  assert.match(adminJs, /daily_booking_limit: Number/);
});

test("célula CSV neutraliza aspas sem perder o conteúdo", () => {
  assert.equal(utils.csvCell('Ana "B"'), '"Ana ""B"""');
});

test("exportação usa somente dados já autorizados e carregados no painel", () => {
  assert.match(adminHtml, /data-export-appointments/);
  assert.match(adminJs, /appointmentsCache\.map/);
  assert.match(adminJs, /text\/csv;charset=utf-8/);
});
