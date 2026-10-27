import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

await import("../admin-utils.js");
const utils = globalThis.STUDIO_B_ADMIN_UTILS;
const adminHtml = await readFile(new URL("../admin.html", import.meta.url), "utf8");
const adminJs = await readFile(new URL("../admin.js", import.meta.url), "utf8");
const bookingApi = await readFile(new URL("../supabase/functions/booking-api/index.ts", import.meta.url), "utf8");
const bookingMigration = await readFile(new URL("../supabase/migrations/20261025210000_booking_system.sql", import.meta.url), "utf8");

test("converte horário de São Paulo para UTC sem depender do computador", () => {
  const result = utils.zonedTimeToUtc("2026-11-02", "09:30", "America/Sao_Paulo");
  assert.equal(result.toISOString(), "2026-11-02T12:30:00.000Z");
});

test("bloqueio de dia inteiro inclui integralmente a data final", () => {
  const result = utils.buildBlockedPeriod({
    startDate: "2026-12-24",
    startTime: "",
    endDate: "2026-12-25",
    endTime: "",
    allDay: true
  });
  assert.deepEqual(result, {
    starts_at: "2026-12-24T03:00:00.000Z",
    ends_at: "2026-12-26T03:00:00.000Z"
  });
});

test("rejeita bloqueio cujo fim não seja posterior ao início", () => {
  const result = utils.buildBlockedPeriod({
    startDate: "2026-11-02",
    startTime: "15:00",
    endDate: "2026-11-02",
    endTime: "14:00",
    allDay: false
  });
  assert.match(result.error, /posterior ao início/);
});

test("painel oferece cadastro, listagem e remoção de bloqueios", () => {
  assert.match(adminHtml, /data-blocked-period-form/);
  assert.match(adminHtml, /data-blocked-periods-list/);
  assert.match(adminJs, /from\("blocked_periods"\)\.insert/);
  assert.match(adminJs, /from\("blocked_periods"\)\.delete\(\)\.eq\("id"/);
});

test("RLS restringe bloqueios a administradores", () => {
  assert.match(bookingMigration, /create policy "Admins manage blocked periods"/);
  assert.match(bookingMigration, /on public\.blocked_periods for all[\s\S]*?using \(public\.is_admin\(\)\)/);
});

test("API pública considera os bloqueios ao montar a disponibilidade", () => {
  assert.match(bookingApi, /from\("blocked_periods"\)/);
  assert.match(bookingApi, /\.\.\.\(blocked \|\| \[\]\)\.map/);
});
