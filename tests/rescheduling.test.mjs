import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const api = await readFile(new URL("../supabase/functions/booking-api/index.ts", import.meta.url), "utf8");
const manageHtml = await readFile(new URL("../manage-booking.html", import.meta.url), "utf8");
const manageJs = await readFile(new URL("../manage-booking.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261027120000_add_rescheduling.sql", import.meta.url), "utf8");

test("banco registra o momento do reagendamento", () => {
  assert.match(migration, /add column if not exists rescheduled_at timestamptz/);
  assert.match(api, /rescheduled_at: changedAt/);
});

test("reagendamento exige link privado e respeita o prazo", () => {
  assert.match(api, /if \(action === "reschedule"\)/);
  assert.match(api, /secretHash\(token\)/);
  assert.match(api, /reagendamento online encerra/);
});

test("novo horário é revalidado excluindo apenas o próprio agendamento", () => {
  assert.match(api, /excludeAppointmentId\?: string/);
  assert.match(api, /appointmentsQuery\.neq\("id", excludeAppointmentId\)/);
  assert.match(api, /appointment\.service_id,[\s\S]*?localDate,[\s\S]*?settings,[\s\S]*?appointment\.id/);
});

test("Google Agenda é atualizado e falhas restauram o horário original", () => {
  assert.match(api, /const updateGoogleEvent/);
  assert.match(api, /method: "PATCH"/);
  assert.match(api, /Reschedule rollback failed/);
  assert.match(api, /O horário original foi mantido/);
});

test("cliente recebe confirmação da alteração", () => {
  assert.match(api, /const rescheduleEmail/);
  assert.match(api, /Agendamento atualizado — Studio B/);
});

test("interface oferece data, horários e confirmação explícita", () => {
  assert.match(manageHtml, /data-open-reschedule/);
  assert.match(manageHtml, /data-reschedule-form/);
  assert.match(manageHtml, /data-reschedule-slots/);
  assert.match(manageJs, /api\("reschedule"/);
  assert.match(manageJs, /Confirmar a alteração/);
});
