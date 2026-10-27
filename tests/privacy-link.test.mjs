import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bookingHtml = await readFile(new URL("../booking.html", import.meta.url), "utf8");
const privacyHtml = await readFile(new URL("../privacy.html", import.meta.url), "utf8");

test("o consentimento continua obrigatório", () => {
  assert.match(bookingHtml, /name="privacy"[^>]*required/);
});

test("o formulário aponta para a política publicada", () => {
  assert.match(bookingHtml, /href="privacy\.html"/);
  assert.match(bookingHtml, />Política de Privacidade<\/a>/);
});

test("a política identifica o uso das APIs do Google", () => {
  assert.match(privacyHtml, /Google Agenda e Gmail/);
  assert.match(privacyHtml, /Uso Limitado/);
});
