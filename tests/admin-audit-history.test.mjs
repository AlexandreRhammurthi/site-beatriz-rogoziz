import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../admin.html", import.meta.url), "utf8");
const js = await readFile(new URL("../admin.js", import.meta.url), "utf8");
const css = await readFile(new URL("../admin.css", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261101190000_admin_audit_history.sql", import.meta.url), "utf8");

test("painel oferece histórico administrativo e filtros", () => {
  assert.match(html, /data-admin-target="history"/);
  assert.match(html, /data-admin-view="history"/);
  assert.match(html, /data-history-filter/);
  assert.match(html, /data-history-list/);
  assert.match(html, /data-refresh-history/);
  assert.match(css, /\.history-card/);
});

test("histórico é carregado e o desfazer usa RPC protegida", () => {
  assert.match(js, /from\("admin_audit_log"\)/);
  assert.match(js, /rpc\("undo_admin_change"/);
  assert.match(js, /data-undo-audit/);
  assert.match(js, /O registro foi alterado depois desta ação|alteração mais recente/);
});

test("migração cria trilha append-only limitada a administradores", () => {
  assert.match(migration, /create table public\.admin_audit_log/);
  assert.match(migration, /create or replace function public\.capture_admin_audit\(\)/);
  assert.match(migration, /v_actor is null or not public\.is_admin\(\)/);
  assert.match(migration, /alter table public\.admin_audit_log enable row level security/);
  assert.match(migration, /revoke all on public\.admin_audit_log from public, anon, authenticated/);
  assert.match(migration, /create policy "Admins read audit history"/);
});

test("desfazer bloqueia conflitos e dependências", () => {
  assert.match(migration, /for update/);
  assert.match(migration, /v_current is distinct from v_expected/);
  assert.match(migration, /Desfaça primeiro as alterações mais recentes/);
  assert.match(migration, /Remova ou desfaça primeiro os registros vinculados a este serviço/);
  assert.match(migration, /source_audit_id/);
});
