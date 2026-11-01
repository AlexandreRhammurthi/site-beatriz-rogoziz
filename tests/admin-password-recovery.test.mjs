import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../admin.html", import.meta.url), "utf8");
const js = await readFile(new URL("../admin.js", import.meta.url), "utf8");

test("login oferece recuperação de senha sem expor existência da conta", () => {
  assert.match(html, /data-forgot-password/);
  assert.match(html, /data-reset-request-form/);
  assert.match(js, /resetPasswordForEmail\(email/);
  assert.match(js, /Se o e-mail estiver cadastrado/);
});

test("link de recuperação abre formulário de nova senha", () => {
  assert.match(html, /data-reset-password-form/);
  assert.match(html, /autocomplete="new-password"/);
  assert.match(js, /event === "PASSWORD_RECOVERY"/);
  assert.match(js, /hash\.get\("type"\) === "recovery"/);
});

test("nova senha exige confirmação e usa a sessão segura do Supabase", () => {
  assert.match(js, /password !== confirmation/);
  assert.match(js, /client\.auth\.updateUser\(\{ password \}\)/);
  assert.match(html, /minlength="8"/);
  assert.match(js, /redirectTo: callbackUrl\(\)/);
});
