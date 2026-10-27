import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const GOOGLE_REFRESH_TOKEN = Deno.env.get("GOOGLE_REFRESH_TOKEN") || "";
const BOOKING_FROM_EMAIL = Deno.env.get("BOOKING_FROM_EMAIL") ||
  "contato.beatrizrogoziz@gmail.com";
const SITE_URL = (Deno.env.get("SITE_URL") || "https://www.beatrizrogoziz.com.br")
  .replace(/\/$/, "");
const TIMEZONE = "America/Sao_Paulo";
const STUDIO_ADDRESS =
  "Praça Delegado Amoroso Neto, 74 - Casa Verde, São Paulo - SP, 02518-050";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

const html = (value: unknown) => String(value || "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};

const getGoogleAccessToken = async () => {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error("Google authorization failed");
  return payload.access_token as string;
};

const sendEmail = async (accessToken: string, to: string, subject: string, content: string) => {
  const encodedSubject = `=?UTF-8?B?${bytesToBase64(new TextEncoder().encode(subject))}?=`;
  const mime = [
    `From: Studio B <${BOOKING_FROM_EMAIL}>`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    content,
  ].join("\r\n");
  const raw = bytesToBase64(new TextEncoder().encode(mime)).replaceAll("+", "-")
    .replaceAll("/", "_").replaceAll("=", "");
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!response.ok) throw new Error(`Email delivery failed (${response.status})`);
};

const reminderEmail = (name: string, service: string, startsAt: string) => `
  <div style="font-family:Arial,sans-serif;color:#143434;line-height:1.6;max-width:620px;margin:auto">
    <h1 style="font-family:Georgia,serif;font-weight:normal;color:#0b3b3c">Seu cuidado está chegando</h1>
    <p>Olá, ${html(name)}. Este é um lembrete do seu próximo atendimento no Studio B.</p>
    <p><strong>${html(service)}</strong><br>${html(new Intl.DateTimeFormat("pt-BR", {
      timeZone: TIMEZONE,
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date(startsAt)))}<br>${html(STUDIO_ADDRESS)}</p>
    <p><a href="${html(`${SITE_URL}/manage-booking.html`)}" style="display:inline-block;background:#0b3b3c;color:white;padding:12px 18px;text-decoration:none">Gerenciar agendamento</a></p>
    <p style="font-size:12px;color:#687675">Se precisar recuperar o acesso, use o mesmo e-mail, WhatsApp, data e horário informados no agendamento.</p>
  </div>`;

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);
  if (!SERVICE_ROLE_KEY || request.headers.get("Authorization") !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return json({ error: "Não autorizado." }, 401);
  }
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    return json({ error: "Integração Google indisponível." }, 503);
  }

  const now = new Date();
  const { data: reminders, error } = await admin.rpc("claim_due_appointment_reminders", {
    p_now: now.toISOString(),
    p_limit: 50,
  });
  if (error) return json({ error: "Não foi possível selecionar os lembretes." }, 500);
  if (!reminders?.length) return json({ processed: 0, delivered: 0, failed: 0 });

  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken();
  } catch (error) {
    console.error("Reminder Google authorization failed", error);
    await admin.from("appointments").update({ reminder_attempted_at: null })
      .in("id", reminders.map((item: { id: string }) => item.id));
    return json({ error: "Integração Google indisponível." }, 503);
  }

  let delivered = 0;
  let failed = 0;
  for (const reminder of reminders) {
    try {
      await sendEmail(
        accessToken,
        reminder.customer_email,
        "Lembrete de agendamento — Studio B",
        reminderEmail(reminder.customer_name, reminder.service_name, reminder.starts_at),
      );
      await admin.from("appointments").update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", reminder.id).is("reminder_sent_at", null);
      delivered += 1;
    } catch (error) {
      console.error("Reminder delivery failed", reminder.id, error);
      await admin.from("appointments").update({ reminder_attempted_at: null })
        .eq("id", reminder.id).is("reminder_sent_at", null);
      failed += 1;
    }
  }
  return json({ processed: reminders.length, delivered, failed });
});
