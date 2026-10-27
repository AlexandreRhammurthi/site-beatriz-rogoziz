import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

await import("../admin-utils.js");
const utils = globalThis.STUDIO_B_ADMIN_UTILS;
const migration = await readFile(new URL("../supabase/migrations/20261027150000_add_appointment_followup.sql", import.meta.url), "utf8");
const adminJs = await readFile(new URL("../admin.js", import.meta.url), "utf8");

test("banco aceita somente os três estados de comparecimento", () => {
  assert.match(migration, /attendance_status in \('scheduled', 'completed', 'no_show'\)/);
  assert.equal(utils.attendanceStatusLabel("scheduled"), "Agendado");
  assert.equal(utils.attendanceStatusLabel("completed"), "Concluído");
  assert.equal(utils.attendanceStatusLabel("no_show"), "Não compareceu");
});

test("observações privadas têm limite no banco e na interface", () => {
  assert.match(migration, /char_length\(admin_notes\) <= 2000/);
  assert.match(adminJs, /maxlength="2000"/);
});

test("painel atualiza apenas o agendamento selecionado", () => {
  assert.match(adminJs, /from\("appointments"\)\.update\(update\)\.eq\("id", form\.dataset\.appointmentId\)/);
});

test("dados internos são incluídos somente na consulta autenticada", () => {
  assert.match(adminJs, /attendance_status, admin_notes/);
  assert.match(adminJs, /data-appointment-admin-form/);
});

test("exportação inclui acompanhamento e observações", () => {
  assert.match(adminJs, /"Comparecimento"/);
  assert.match(adminJs, /"Observações privadas"/);
  assert.match(adminJs, /appointment\.admin_notes \|\| ""/);
});
