import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bookingHtml = await readFile(new URL("../booking.html", import.meta.url), "utf8");
const bookingJs = await readFile(new URL("../booking.js", import.meta.url), "utf8");
const adminHtml = await readFile(new URL("../admin.html", import.meta.url), "utf8");
const adminJs = await readFile(new URL("../admin.js", import.meta.url), "utf8");
const api = await readFile(new URL("../supabase/functions/booking-api/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261102100000_booking_option_snapshot.sql", import.meta.url), "utf8");

test("cliente escolhe uma opção ativa de sessão ou pacote", () => {
  assert.match(bookingHtml, /data-booking-options/);
  assert.match(bookingJs, /name="service_price_id"/);
  assert.match(bookingJs, /service_price_id: data\.get\("service_price_id"\)/);
  assert.match(bookingJs, /Este agendamento reserva a primeira sessão/);
});

test("API valida a opção e preserva o retrato comercial", () => {
  assert.match(api, /\.from\("service_prices"\)/);
  assert.match(api, /Escolha uma sessão avulsa ou pacote disponível/);
  assert.match(api, /selected_option_label: selectedOption\.label/);
  assert.match(migration, /add column service_price_id uuid/);
  assert.match(migration, /selected_option_price_amount numeric/);
});

test("cadastro administrativo também permite selecionar opção", () => {
  assert.match(adminHtml, /name="service_price_id"/);
  assert.match(adminJs, /refreshManualPriceOptions/);
  assert.match(adminJs, /service_price_id: String\(values\.get\("service_price_id"\)/);
});

