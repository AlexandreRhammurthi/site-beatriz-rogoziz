import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../manage-booking.html", import.meta.url), "utf8");
const js = await readFile(new URL("../manage-booking.js", import.meta.url), "utf8");
const api = await readFile(new URL("../supabase/functions/booking-api/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261102120000_booking_recovery_confirmation.sql", import.meta.url), "utf8");

test("cancelamento exige confirmação explícita com o resumo do atendimento", () => {
  assert.match(html, /data-cancel-confirm/);
  assert.match(html, /Confirmo que desejo cancelar este atendimento/);
  assert.match(js, /cancelConfirmForm\.elements\.understood\.checked = false/);
  assert.doesNotMatch(js, /confirm\("Deseja realmente cancelar/);
});

test("banco é a fonte do cancelamento antes da integração externa", () => {
  const cancelBlock = api.slice(api.indexOf('if (action === "cancel")'), api.indexOf('if (action === "recovery-request")'));
  assert.ok(cancelBlock.indexOf('.update({ status: "cancelled"') < cancelBlock.indexOf("deleteGoogleEvent("));
  assert.match(cancelBlock, /Cancellation rollback failed/);
  assert.match(cancelBlock, /calendar_updated: true/);
  assert.match(cancelBlock, /email_delivered: emailDelivered/);
});

test("recuperação usa data sem exigir horário e invalida códigos anteriores", () => {
  assert.doesNotMatch(html, /name="time"/);
  assert.match(api, /const recoveryDayRange/);
  assert.match(api, /\.eq\("appointment_id", appointment\.id\)\.is\("used_at", null\)/);
  assert.match(js, /await loadAppointment\(\)/);
  assert.doesNotMatch(js, /window\.location\.assign\(result\.manage_url\)/);
});

test("confirmação pode ser reenviada com intervalo atômico", () => {
  assert.match(html, /data-resend-confirmation/);
  assert.match(api, /action === "resend-confirmation"/);
  assert.match(api, /claim_appointment_confirmation_resend/);
  assert.match(migration, /p_now - interval '10 minutes'/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
});

