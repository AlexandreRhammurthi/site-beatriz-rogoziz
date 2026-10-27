import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20261027130000_add_appointment_reminders.sql", import.meta.url), "utf8");
const reminderFunction = await readFile(new URL("../supabase/functions/booking-reminders/index.ts", import.meta.url), "utf8");
const adminHtml = await readFile(new URL("../admin.html", import.meta.url), "utf8");
const adminJs = await readFile(new URL("../admin.js", import.meta.url), "utf8");

test("lembretes nascem desativados enquanto o Google analisa o aplicativo", () => {
  assert.match(migration, /reminders_enabled boolean not null default false/);
  assert.match(adminHtml, /Ativar lembretes automáticos por e-mail após a aprovação do Google/);
});

test("seleção considera apenas confirmados ainda não enviados", () => {
  assert.match(migration, /appointment\.status = 'confirmed'/);
  assert.match(migration, /appointment\.reminder_sent_at is null/);
});

test("claim atômico evita processamento simultâneo duplicado", () => {
  assert.match(migration, /for update of appointment skip locked/);
  assert.match(migration, /set reminder_attempted_at = p_now/);
});

test("falha de envio libera uma nova tentativa", () => {
  assert.match(reminderFunction, /reminder_attempted_at: null/);
  assert.match(reminderFunction, /Reminder delivery failed/);
});

test("função aceita somente autorização interna de serviço", () => {
  assert.match(reminderFunction, /Authorization.*Bearer \$\{SERVICE_ROLE_KEY\}/s);
  assert.match(reminderFunction, /Não autorizado/);
});

test("painel persiste antecedência e estado de ativação", () => {
  assert.match(adminJs, /reminder_hours_before/);
  assert.match(adminJs, /reminders_enabled: values\.get\("reminders_enabled"\) === "on"/);
});
