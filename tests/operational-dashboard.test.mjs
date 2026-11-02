import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../admin.html", import.meta.url), "utf8");
const js = await readFile(new URL("../admin.js", import.meta.url), "utf8");
const css = await readFile(new URL("../admin.css", import.meta.url), "utf8");

test("portal oferece acesso à visão operacional", () => {
  assert.match(html, /data-admin-target="operations-dashboard"/);
  assert.match(html, /data-admin-view="operations-dashboard"/);
  assert.match(html, /data-operations-metrics/);
});

test("dashboard calcula agenda, demanda e alertas sem estimar faturamento", () => {
  assert.match(js, /const loadOperationsDashboard = async/);
  assert.match(js, /Cancelamentos \+ faltas/);
  assert.match(js, /Demanda nos próximos 30 dias|demandRows/);
  assert.match(html, /indicadores financeiros não são exibidos/i);
});

test("dashboard possui layout responsivo", () => {
  assert.match(css, /\.operations-metrics/);
  assert.match(css, /@media \(max-width: 560px\)/);
});

