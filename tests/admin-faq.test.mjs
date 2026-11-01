import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminHtml = await readFile(new URL("../admin.html", import.meta.url), "utf8");
const servicesFaq = await readFile(new URL("../admin-faq-servicos.html", import.meta.url), "utf8");
const scheduleFaq = await readFile(new URL("../admin-faq-agenda.html", import.meta.url), "utf8");

test("painel oferece uma FAQ para cada área administrativa", () => {
  assert.match(adminHtml, /href="admin-faq-servicos\.html"/);
  assert.match(adminHtml, /href="admin-faq-agenda\.html"/);
});

test("FAQ de serviços explica conteúdo, duração, valores e promoção", () => {
  for (const term of ["Duração em minutos", "Mensagem do WhatsApp", "Valor anterior", "Promocional", "Texto alternativo"]) {
    assert.match(servicesFaq, new RegExp(term));
  }
  assert.match(servicesFaq, /Como operar esta área/);
  assert.match(servicesFaq, /noindex, nofollow/);
});

test("FAQ da agenda explica disponibilidade, pausas, bloqueios e acompanhamento", () => {
  for (const term of ["Antecedência mínima", "Intervalo entre opções", "Preparação entre sessões", "Bloqueios de datas", "Comparecimento", "Exportar CSV"]) {
    assert.match(scheduleFaq, new RegExp(term));
  }
  assert.match(scheduleFaq, /Como operar a agenda/);
  assert.match(scheduleFaq, /noindex, nofollow/);
});

test("FAQ diferencia intervalo de opções e preparação com exemplo", () => {
  assert.match(scheduleFaq, /Intervalo não é preparação/);
  assert.match(scheduleFaq, /09:00, 09:20 e 09:40/);
  assert.match(scheduleFaq, /próximo início compatível com a grade poderá ser 10:20/);
});
