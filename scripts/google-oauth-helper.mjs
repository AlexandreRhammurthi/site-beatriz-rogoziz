import http from "node:http";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const credentialsFile = process.env.GOOGLE_CREDENTIALS_FILE;
let clientId = process.env.GOOGLE_CLIENT_ID;
let clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const port = 53682;
const redirectUri = `http://localhost:${port}/callback`;
const expectedEmail = "contato.beatrizrogoziz@gmail.com";

if (credentialsFile) {
  const credentials = JSON.parse(await readFile(credentialsFile, "utf8"));
  const oauthClient = credentials.web || credentials.installed;
  clientId = oauthClient?.client_id;
  clientSecret = oauthClient?.client_secret;
}

if (!clientId || !clientSecret) {
  console.error("Informe GOOGLE_CREDENTIALS_FILE ou defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.");
  process.exit(1);
}

const state = randomBytes(24).toString("hex");
const scopes = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/gmail.send"
];

const authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authorizeUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: "code",
  access_type: "offline",
  prompt: "consent",
  include_granted_scopes: "true",
  scope: scopes.join(" "),
  state
}).toString();

const openBrowser = (url) => {
  const command = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = [url];
  spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
};

const saveSupabaseSecrets = (refreshToken) => new Promise((resolve, reject) => {
  const isWindows = process.platform === "win32";
  const command = isWindows ? "pwsh.exe" : "sh";
  const script = isWindows
    ? "npx supabase secrets set ('GOOGLE_CLIENT_ID=' + $env:STUDIO_GOOGLE_CLIENT_ID) ('GOOGLE_CLIENT_SECRET=' + $env:STUDIO_GOOGLE_CLIENT_SECRET) ('GOOGLE_REFRESH_TOKEN=' + $env:STUDIO_GOOGLE_REFRESH_TOKEN)"
    : "npx supabase secrets set \"GOOGLE_CLIENT_ID=$STUDIO_GOOGLE_CLIENT_ID\" \"GOOGLE_CLIENT_SECRET=$STUDIO_GOOGLE_CLIENT_SECRET\" \"GOOGLE_REFRESH_TOKEN=$STUDIO_GOOGLE_REFRESH_TOKEN\"";
  const args = isWindows ? ["-NoProfile", "-NonInteractive", "-Command", script] : ["-c", script];
  const child = spawn(command, args, {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      STUDIO_GOOGLE_CLIENT_ID: clientId,
      STUDIO_GOOGLE_CLIENT_SECRET: clientSecret,
      STUDIO_GOOGLE_REFRESH_TOKEN: refreshToken
    }
  });
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("Não foi possível salvar os secrets no Supabase.")));
});

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, redirectUri);
  if (url.pathname !== "/callback") {
    response.writeHead(404).end("Not found");
    return;
  }
  if (url.searchParams.get("state") !== state) {
    response.writeHead(400).end("Estado de segurança inválido.");
    server.close();
    return;
  }
  const code = url.searchParams.get("code");
  if (!code) {
    response.writeHead(400).end("Autorização cancelada.");
    server.close();
    return;
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri })
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.refresh_token) throw new Error(tokens.error_description || "O Google não retornou um refresh token.");

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const profile = await profileResponse.json();
    if (profile.email !== expectedEmail) throw new Error(`A conta autorizada foi ${profile.email || "desconhecida"}. Use ${expectedEmail}.`);

    await saveSupabaseSecrets(tokens.refresh_token);

    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end("<h1>Studio B conectado</h1><p>As credenciais foram salvas com segurança no Supabase. Você pode fechar esta página.</p>");
    console.log(`\nConta autorizada: ${profile.email}`);
    console.log("Credenciais salvas com segurança no Supabase; nenhum token foi exibido ou gravado no projeto.");
  } catch (error) {
    response.writeHead(500).end("Não foi possível concluir a autorização.");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Aguardando autorização em ${redirectUri}`);
  console.log(`Se o navegador não abrir, acesse:\n${authorizeUrl}`);
  openBrowser(authorizeUrl.toString());
});
