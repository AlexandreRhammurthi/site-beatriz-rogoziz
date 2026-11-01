import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../booking.html", import.meta.url), "utf8");
const js = await readFile(new URL("../booking.js", import.meta.url), "utf8");
const api = await readFile(new URL("../supabase/functions/booking-api/index.ts", import.meta.url), "utf8");

test("datas e horário aparecem antes dos dados pessoais", () => {
  const firstStep = html.match(/<fieldset data-step="1">([\s\S]*?)<\/fieldset>/)?.[1] || "";
  const thirdStep = html.match(/<fieldset data-step="3" hidden>([\s\S]*?)<\/fieldset>/)?.[1] || "";
  assert.match(firstStep, /data-available-dates/);
  assert.match(firstStep, /name="service_id"/);
  assert.doesNotMatch(firstStep, /name="(name|phone|email)"/);
  assert.match(thirdStep, /name="name"/);
  assert.match(thirdStep, /name="phone"/);
  assert.match(thirdStep, /name="email"/);
});

test("interface mostra apenas datas retornadas como disponíveis", () => {
  assert.match(js, /api\("available-dates"/);
  assert.match(js, /result\.dates\.map/);
  assert.match(js, /data-date-value/);
  assert.match(js, /await loadSlots\(\)/);
});

test("API calcula datas em lote usando conflitos e regras reais", () => {
  assert.match(api, /const getAvailableDates = async/);
  assert.match(api, /action === "available-dates"/);
  assert.match(api, /getGoogleBusy\(rangeStart, rangeEnd/);
  assert.match(api, /daily_booking_limit/);
  assert.match(api, /overlaps\(start, end, unavailable, settings\.buffer_minutes\)/);
  assert.match(api, /pauseStart && pauseEnd/);
});
