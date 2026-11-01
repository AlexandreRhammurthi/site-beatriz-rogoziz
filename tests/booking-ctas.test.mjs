import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const js = await readFile(new URL("../app.js", import.meta.url), "utf8");

test("site diferencia visualmente agendamento online e conversa no WhatsApp", () => {
  assert.match(html, />Agendar online</);
  assert.match(html, /data-whatsapp>Falar pelo WhatsApp/);
  assert.match(html, /data-whatsapp data-fab/);
  assert.doesNotMatch(html, /data-booking>Agendar pelo WhatsApp/);
});

test("cada CTA possui um fluxo próprio sem fallback silencioso", () => {
  assert.match(js, /closest\("\[data-booking\]"\)/);
  assert.match(js, /window\.location\.href = `booking\.html/);
  assert.match(js, /agendamento online está temporariamente indisponível/);
  assert.match(js, /closest\("\[data-whatsapp\]"\)/);
  assert.match(js, /window\.open\(`https:\/\/wa\.me/);
});
