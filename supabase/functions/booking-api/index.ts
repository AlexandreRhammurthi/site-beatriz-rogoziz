import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://alexandrerhammurthi.github.io",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const GOOGLE_REFRESH_TOKEN = Deno.env.get("GOOGLE_REFRESH_TOKEN") || "";
const GOOGLE_CALENDAR_ID = Deno.env.get("GOOGLE_CALENDAR_ID") || "";
const BOOKING_FROM_EMAIL = Deno.env.get("BOOKING_FROM_EMAIL") ||
  "contato.beatrizrogoziz@gmail.com";
const BOOKING_TOKEN_PEPPER = Deno.env.get("BOOKING_TOKEN_PEPPER") || "";
const SITE_URL = (Deno.env.get("SITE_URL") ||
  "https://alexandrerhammurthi.github.io/site-beatriz-rogoziz").replace(
    /\/$/,
    "",
  );
const STUDIO_ADDRESS =
  "Praça Delegado Amoroso Neto, 74 - Casa Verde, São Paulo - SP, 02518-050";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://alexandrerhammurthi.github.io",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const json = (origin: string | null, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
};

const secretHash = (value: string) =>
  sha256(`${BOOKING_TOKEN_PEPPER}:${value}`);

const randomToken = (size = 32) => {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll(
    "/",
    "_",
  ).replaceAll("=", "");
};

const normalizeEmail = (value: unknown) =>
  String(value || "").trim().toLowerCase();
const normalizePhone = (value: unknown) =>
  String(value || "").replace(/\D/g, "");
const isEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
const isUuid = (value: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(String(value || ""));
const isDate = (value: unknown) =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
const html = (value: unknown) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

type BookingSettings = {
  timezone: string;
  booking_horizon_days: number;
  minimum_notice_hours: number;
  cancellation_notice_hours: number;
  slot_interval_minutes: number;
  booking_enabled: boolean;
  calendar_label: string;
};

const integrationsConfigured = () =>
  Boolean(
    GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN &&
      GOOGLE_CALENDAR_ID && BOOKING_FROM_EMAIL && BOOKING_TOKEN_PEPPER,
  );

const getSettings = async (): Promise<BookingSettings> => {
  const { data, error } = await admin.from("booking_settings").select("*").eq(
    "id",
    true,
  ).single();
  if (error) throw error;
  return data;
};

const partsInZone = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
};

const zonedTimeToUtc = (
  dateValue: string,
  timeValue: string,
  timeZone: string,
) => {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute, second = 0] = timeValue.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = desired;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = partsInZone(new Date(guess), timeZone);
    const actualAsUtc = Date.UTC(
      Number(actual.year),
      Number(actual.month) - 1,
      Number(actual.day),
      Number(actual.hour),
      Number(actual.minute),
      Number(actual.second),
    );
    guess += desired - actualAsUtc;
  }
  return new Date(guess);
};

const weekdayForDate = (dateValue: string) =>
  new Date(`${dateValue}T12:00:00Z`).getUTCDay();

const recoveryStart = (payload: Record<string, unknown>, timezone: string) => {
  const dateValue = String(payload.date || "");
  const timeValue = String(payload.time || "");
  if (!isDate(dateValue) || !/^\d{2}:\d{2}$/.test(timeValue)) return null;
  const date = zonedTimeToUtc(dateValue, `${timeValue}:00`, timezone);
  return Number.isNaN(date.getTime()) ? null : date;
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
  if (!response.ok || !payload.access_token) {
    throw new Error("Google Calendar authorization failed");
  }
  return payload.access_token as string;
};

const googleRequest = async (path: string, init: RequestInit = {}) => {
  const accessToken = await getGoogleAccessToken();
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    console.error(
      "Google Calendar API error",
      response.status,
      detail.slice(0, 500),
    );
    throw new Error(`Google Calendar request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
};

const getGoogleBusy = async (start: Date, end: Date, timezone: string) => {
  const result = await googleRequest("/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      timeZone: timezone,
      items: [{ id: GOOGLE_CALENDAR_ID }],
    }),
  });
  const calendar = result?.calendars?.[GOOGLE_CALENDAR_ID];
  if (!calendar || calendar.errors?.length) {
    throw new Error("Configured calendar is unavailable");
  }
  return (calendar.busy || []).map((
    period: { start: string; end: string },
  ) => ({
    start: new Date(period.start),
    end: new Date(period.end),
  }));
};

const overlaps = (
  start: Date,
  end: Date,
  periods: Array<{ start: Date; end: Date }>,
) => periods.some((period) => start < period.end && end > period.start);

const getAvailability = async (
  serviceId: string,
  dateValue: string,
  settings: BookingSettings,
) => {
  const { data: service, error: serviceError } = await admin
    .from("services")
    .select("id, name, duration_minutes")
    .eq("id", serviceId)
    .eq("is_active", true)
    .single();
  if (serviceError || !service) {
    return { error: "Serviço indisponível.", status: 404 };
  }

  const weekday = weekdayForDate(dateValue);
  const { data: rules, error: rulesError } = await admin
    .from("availability_rules")
    .select("start_time, end_time, pause_start_time, pause_end_time")
    .eq("weekday", weekday)
    .eq("is_active", true)
    .order("start_time");
  if (rulesError) throw rulesError;
  if (!rules?.length) return { service, slots: [] };

  const dayStart = zonedTimeToUtc(dateValue, "00:00:00", settings.timezone);
  const nextDate = new Date(`${dateValue}T12:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const nextDateValue = nextDate.toISOString().slice(0, 10);
  const dayEnd = zonedTimeToUtc(nextDateValue, "00:00:00", settings.timezone);

  const now = new Date();
  const latest = new Date(
    now.getTime() + settings.booking_horizon_days * 86400000,
  );
  const earliest = new Date(
    now.getTime() + settings.minimum_notice_hours * 3600000,
  );
  if (dayEnd <= earliest || dayStart > latest) return { service, slots: [] };

  const [
    { data: appointments, error: appointmentsError },
    { data: blocked, error: blockedError },
    googleBusy,
  ] = await Promise.all([
    admin.from("appointments").select("starts_at, ends_at").in("status", [
      "pending",
      "confirmed",
    ]).lt("starts_at", dayEnd.toISOString()).gt(
      "ends_at",
      dayStart.toISOString(),
    ),
    admin.from("blocked_periods").select("starts_at, ends_at").lt(
      "starts_at",
      dayEnd.toISOString(),
    ).gt("ends_at", dayStart.toISOString()),
    getGoogleBusy(dayStart, dayEnd, settings.timezone),
  ]);
  if (appointmentsError) throw appointmentsError;
  if (blockedError) throw blockedError;

  const unavailable = [
    ...googleBusy,
    ...(appointments || []).map((item) => ({
      start: new Date(item.starts_at),
      end: new Date(item.ends_at),
    })),
    ...(blocked || []).map((item) => ({
      start: new Date(item.starts_at),
      end: new Date(item.ends_at),
    })),
  ];
  const slots: Array<{ start: string; end: string; label: string }> = [];

  for (const rule of rules) {
    const windowStart = zonedTimeToUtc(
      dateValue,
      rule.start_time,
      settings.timezone,
    );
    const windowEnd = zonedTimeToUtc(
      dateValue,
      rule.end_time,
      settings.timezone,
    );
    const pauseStart = rule.pause_start_time
      ? zonedTimeToUtc(dateValue, rule.pause_start_time, settings.timezone)
      : null;
    const pauseEnd = rule.pause_end_time
      ? zonedTimeToUtc(dateValue, rule.pause_end_time, settings.timezone)
      : null;
    for (
      let cursor = windowStart.getTime();
      cursor < windowEnd.getTime();
      cursor += settings.slot_interval_minutes * 60000
    ) {
      const start = new Date(cursor);
      const end = new Date(cursor + service.duration_minutes * 60000);
      if (
        end > windowEnd || start < earliest || start > latest ||
        overlaps(start, end, unavailable) ||
        (pauseStart && pauseEnd && start < pauseEnd && end > pauseStart)
      ) continue;
      slots.push({
        start: start.toISOString(),
        end: end.toISOString(),
        label: new Intl.DateTimeFormat("pt-BR", {
          timeZone: settings.timezone,
          hour: "2-digit",
          minute: "2-digit",
        }).format(start),
      });
    }
  }
  return { service, slots };
};

const createGoogleEvent = async (
  appointment: Record<string, unknown>,
  serviceName: string,
  timezone: string,
  manageUrl: string,
) => {
  const sendInvite = Boolean(appointment.calendar_sync_requested);
  const event = {
    summary: `Studio B • ${serviceName}`,
    location: STUDIO_ADDRESS,
    description: [
      `Atendimento no Studio B com Beatriz Rogoziz.`,
      `Cliente: ${appointment.customer_name}`,
      `WhatsApp: ${appointment.customer_phone}`,
      `Gerenciar ou cancelar: ${manageUrl}`,
    ].join("\n"),
    start: { dateTime: appointment.starts_at, timeZone: timezone },
    end: { dateTime: appointment.ends_at, timeZone: timezone },
    attendees: sendInvite ? [{ email: appointment.customer_email }] : [],
    guestsCanModify: false,
    visibility: "private",
    extendedProperties: {
      private: { studio_b_appointment_id: appointment.id },
    },
  };
  const params = new URLSearchParams({
    sendUpdates: sendInvite ? "all" : "none",
  });
  return googleRequest(
    `/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}/events?${params}`,
    {
      method: "POST",
      body: JSON.stringify(event),
    },
  );
};

const deleteGoogleEvent = async (eventId: string, sendUpdates: boolean) => {
  const params = new URLSearchParams({
    sendUpdates: sendUpdates ? "all" : "none",
  });
  const accessToken = await getGoogleAccessToken();
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${
      encodeURIComponent(GOOGLE_CALENDAR_ID)
    }/events/${encodeURIComponent(eventId)}?${params}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (
    response.status !== 204 && response.status !== 404 &&
    response.status !== 410
  ) {
    console.error(
      "Google Calendar delete error",
      response.status,
      (await response.text()).slice(0, 500),
    );
    throw new Error("Calendar cancellation failed");
  }
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};

const sendEmail = async (to: string, subject: string, content: string) => {
  const accessToken = await getGoogleAccessToken();
  const encodedSubject = `=?UTF-8?B?${
    bytesToBase64(new TextEncoder().encode(subject))
  }?=`;
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
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    },
  );
  if (!response.ok) {
    console.error(
      "Email provider error",
      response.status,
      (await response.text()).slice(0, 500),
    );
    throw new Error("Email delivery failed");
  }
};

const formatAppointment = (
  appointment: Record<string, unknown>,
  timezone: string,
) => {
  const start = new Date(String(appointment.starts_at));
  return {
    id: appointment.id,
    customer_name: appointment.customer_name,
    service_name:
      appointment.services && typeof appointment.services === "object"
        ? (appointment.services as Record<string, unknown>).name
        : "Atendimento",
    starts_at: appointment.starts_at,
    ends_at: appointment.ends_at,
    status: appointment.status,
    calendar_sync_requested: appointment.calendar_sync_requested,
    date_label: new Intl.DateTimeFormat("pt-BR", {
      timeZone: timezone,
      dateStyle: "long",
    }).format(start),
    time_label: new Intl.DateTimeFormat("pt-BR", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(start),
  };
};

const confirmationEmail = (
  name: string,
  service: string,
  start: Date,
  timezone: string,
  manageUrl: string,
  synced: boolean,
) => `
  <div style="font-family:Arial,sans-serif;color:#143434;line-height:1.6;max-width:620px;margin:auto">
    <h1 style="font-family:Georgia,serif;font-weight:normal;color:#0b3b3c">Agendamento confirmado</h1>
    <p>Olá, ${html(name)}. Seu cuidado no Studio B foi reservado.</p>
    <p><strong>${html(service)}</strong><br>${
  html(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: timezone,
      dateStyle: "full",
      timeStyle: "short",
    }).format(start),
  )
}<br>${html(STUDIO_ADDRESS)}</p>
    ${synced ? "<p>Também enviamos um convite para sua Agenda Google.</p>" : ""}
    <p><a href="${
  html(manageUrl)
}" style="display:inline-block;background:#0b3b3c;color:white;padding:12px 18px;text-decoration:none">Gerenciar ou cancelar</a></p>
    <p style="font-size:12px;color:#687675">Este link é pessoal. Não o encaminhe a outras pessoas.</p>
  </div>`;

const recoveryEmail = (name: string, code: string) => `
  <div style="font-family:Arial,sans-serif;color:#143434;line-height:1.6;max-width:620px;margin:auto">
    <h1 style="font-family:Georgia,serif;font-weight:normal;color:#0b3b3c">Código para gerenciar seu agendamento</h1>
    <p>Olá, ${
  html(name)
}. Use o código abaixo para recuperar o acesso ao seu agendamento:</p>
    <p style="font-size:28px;letter-spacing:8px;font-weight:bold">${
  html(code)
}</p>
    <p>O código expira em 10 minutos. Se você não fez esta solicitação, ignore este e-mail.</p>
  </div>`;

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return json(origin, { error: "Método não permitido." }, 405);
  }
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json(origin, { error: "Origem não autorizada." }, 403);
  }

  try {
    const payload = await request.json();
    const action = String(payload.action || "");
    const settings = await getSettings();
    const effectiveEnabled = settings.booking_enabled &&
      integrationsConfigured();

    if (action === "config") {
      const { data: services, error } = await admin
        .from("services")
        .select("id, name, subtitle, duration_minutes, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return json(origin, {
        enabled: effectiveEnabled,
        timezone: settings.timezone,
        booking_horizon_days: settings.booking_horizon_days,
        services: services || [],
      });
    }

    if (!effectiveEnabled) {
      return json(origin, {
        error: "O agendamento online ainda está em configuração.",
      }, 503);
    }

    if (action === "availability") {
      if (!isUuid(payload.service_id) || !isDate(payload.date)) {
        return json(origin, { error: "Serviço ou data inválidos." }, 400);
      }
      const result = await getAvailability(
        payload.service_id,
        payload.date,
        settings,
      );
      if ("error" in result) {
        return json(origin, { error: result.error }, result.status);
      }
      return json(origin, result);
    }

    if (action === "create") {
      const name = String(payload.name || "").trim().replace(/\s+/g, " ");
      const email = normalizeEmail(payload.email);
      const phone = normalizePhone(payload.phone);
      const startsAt = new Date(String(payload.starts_at || ""));
      if (
        name.length < 2 || name.length > 100 || !isEmail(email) ||
        !/^\d{10,13}$/.test(phone) || !isUuid(payload.service_id) ||
        Number.isNaN(startsAt.getTime())
      ) {
        return json(
          origin,
          { error: "Revise seus dados e tente novamente." },
          400,
        );
      }

      const local = partsInZone(startsAt, settings.timezone);
      const localDate = `${local.year}-${local.month}-${local.day}`;
      const availability = await getAvailability(
        payload.service_id,
        localDate,
        settings,
      );
      if ("error" in availability) {
        return json(origin, { error: availability.error }, availability.status);
      }
      const selected = availability.slots.find((slot) =>
        slot.start === startsAt.toISOString()
      );
      if (!selected) {
        return json(origin, {
          error:
            "Este horário não está mais disponível. Escolha outro horário.",
        }, 409);
      }

      const recentThreshold = new Date(Date.now() - 30 * 60000).toISOString();
      const [{ count: recentEmailCount }, { count: recentPhoneCount }] =
        await Promise.all([
          admin.from("appointments").select("id", {
            count: "exact",
            head: true,
          }).eq("customer_email", email).gte("created_at", recentThreshold),
          admin.from("appointments").select("id", {
            count: "exact",
            head: true,
          }).eq("customer_phone", phone).gte("created_at", recentThreshold),
        ]);
      if ((recentEmailCount || 0) >= 3 || (recentPhoneCount || 0) >= 3) {
        return json(origin, {
          error: "Muitas tentativas de agendamento. Aguarde alguns minutos.",
        }, 429);
      }

      const token = randomToken();
      const tokenHash = await secretHash(token);
      const appointmentInput = {
        service_id: payload.service_id,
        customer_name: name,
        customer_email: email,
        customer_phone: phone,
        starts_at: selected.start,
        ends_at: selected.end,
        calendar_sync_requested: payload.sync_calendar === true,
        manage_token_hash: tokenHash,
        status: "pending",
      };
      const { data: appointment, error: insertError } = await admin.from(
        "appointments",
      ).insert(appointmentInput).select("*").single();
      if (insertError) {
        if (insertError.code === "23P01") {
          return json(origin, {
            error:
              "Este horário acabou de ser reservado. Escolha outro horário.",
          }, 409);
        }
        throw insertError;
      }

      const manageUrl = `${SITE_URL}/manage-booking.html#token=${token}`;
      try {
        const event = await createGoogleEvent(
          appointment,
          availability.service.name,
          settings.timezone,
          manageUrl,
        );
        const { error: updateError } = await admin.from("appointments").update({
          status: "confirmed",
          google_event_id: event.id,
        }).eq("id", appointment.id);
        if (updateError) throw updateError;
      } catch (error) {
        await admin.from("appointments").delete().eq("id", appointment.id);
        throw error;
      }

      let emailDelivered = true;
      try {
        await sendEmail(
          email,
          "Agendamento confirmado — Studio B",
          confirmationEmail(
            name,
            availability.service.name,
            startsAt,
            settings.timezone,
            manageUrl,
            payload.sync_calendar === true,
          ),
        );
      } catch (error) {
        console.error("Confirmation email failed", error);
        emailDelivered = false;
      }
      return json(origin, {
        success: true,
        appointment: {
          service_name: availability.service.name,
          starts_at: selected.start,
          ends_at: selected.end,
          calendar_sync_requested: payload.sync_calendar === true,
        },
        manage_url: manageUrl,
        email_delivered: emailDelivered,
      }, 201);
    }

    if (action === "manage") {
      const token = String(payload.token || "");
      if (token.length < 32) {
        return json(origin, { error: "Link de gerenciamento inválido." }, 400);
      }
      const tokenHash = await secretHash(token);
      const { data: appointment, error } = await admin
        .from("appointments")
        .select("*, services(name)")
        .eq("manage_token_hash", tokenHash)
        .single();
      if (error || !appointment) {
        return json(origin, {
          error: "Agendamento não encontrado ou link inválido.",
        }, 404);
      }
      return json(origin, {
        appointment: formatAppointment(appointment, settings.timezone),
      });
    }

    if (action === "cancel") {
      const token = String(payload.token || "");
      if (token.length < 32) {
        return json(origin, { error: "Link de gerenciamento inválido." }, 400);
      }
      const tokenHash = await secretHash(token);
      const { data: appointment, error } = await admin
        .from("appointments")
        .select("*, services(name)")
        .eq("manage_token_hash", tokenHash)
        .single();
      if (error || !appointment) {
        return json(origin, {
          error: "Agendamento não encontrado ou link inválido.",
        }, 404);
      }
      if (appointment.status === "cancelled") {
        return json(origin, {
          success: true,
          appointment: formatAppointment(appointment, settings.timezone),
        });
      }
      const deadline = new Date(appointment.starts_at).getTime() -
        settings.cancellation_notice_hours * 3600000;
      if (Date.now() > deadline) {
        return json(origin, {
          error:
            `O cancelamento online encerra ${settings.cancellation_notice_hours} horas antes do atendimento. Fale com o Studio B pelo WhatsApp.`,
        }, 409);
      }
      if (appointment.google_event_id) {
        await deleteGoogleEvent(
          appointment.google_event_id,
          appointment.calendar_sync_requested,
        );
      }
      const { data: cancelled, error: updateError } = await admin.from(
        "appointments",
      ).update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", appointment.id).select("*, services(name)").single();
      if (updateError) throw updateError;
      try {
        await sendEmail(
          appointment.customer_email,
          "Agendamento cancelado — Studio B",
          `<div style="font-family:Arial,sans-serif;color:#143434;line-height:1.6"><h1 style="font-family:Georgia,serif;font-weight:normal">Agendamento cancelado</h1><p>Olá, ${
            html(appointment.customer_name)
          }. Seu agendamento de <strong>${
            html(appointment.services?.name)
          }</strong> foi cancelado.</p></div>`,
        );
      } catch (error) {
        console.error("Cancellation email failed", error);
      }
      return json(origin, {
        success: true,
        appointment: formatAppointment(cancelled, settings.timezone),
      });
    }

    if (action === "recovery-request") {
      const email = normalizeEmail(payload.email);
      const phone = normalizePhone(payload.phone);
      const startsAt = recoveryStart(payload, settings.timezone);
      const generic = {
        success: true,
        message:
          "Se os dados coincidirem, enviaremos um código para o e-mail informado.",
      };
      if (!isEmail(email) || !/^\d{10,13}$/.test(phone) || !startsAt) {
        return json(origin, generic);
      }

      const from = new Date(startsAt.getTime() - 60000).toISOString();
      const to = new Date(startsAt.getTime() + 60000).toISOString();
      const { data: appointment } = await admin.from("appointments").select(
        "id, customer_name, customer_email",
      ).eq("customer_email", email).eq("customer_phone", phone).in("status", [
        "pending",
        "confirmed",
      ]).gte("starts_at", from).lte("starts_at", to).maybeSingle();
      if (!appointment) return json(origin, generic);

      const since = new Date(Date.now() - 30 * 60000).toISOString();
      const { count } = await admin.from("booking_recovery_codes").select(
        "id",
        { count: "exact", head: true },
      ).eq("appointment_id", appointment.id).gte("created_at", since);
      if ((count || 0) >= 3) return json(origin, generic);

      const code = String(
        crypto.getRandomValues(new Uint32Array(1))[0] % 1000000,
      ).padStart(6, "0");
      const codeHash = await secretHash(`${appointment.id}:${code}`);
      await admin.from("booking_recovery_codes").insert({
        appointment_id: appointment.id,
        code_hash: codeHash,
        expires_at: new Date(Date.now() + 10 * 60000).toISOString(),
      });
      try {
        await sendEmail(
          appointment.customer_email,
          "Código de acesso — Studio B",
          recoveryEmail(appointment.customer_name, code),
        );
      } catch (error) {
        console.error("Recovery email failed", error);
      }
      return json(origin, generic);
    }

    if (action === "recovery-confirm") {
      const email = normalizeEmail(payload.email);
      const phone = normalizePhone(payload.phone);
      const startsAt = recoveryStart(payload, settings.timezone);
      const code = String(payload.code || "").replace(/\D/g, "");
      if (
        !isEmail(email) || !/^\d{10,13}$/.test(phone) || !startsAt ||
        code.length !== 6
      ) {
        return json(origin, { error: "Código inválido ou expirado." }, 400);
      }
      const from = new Date(startsAt.getTime() - 60000).toISOString();
      const to = new Date(startsAt.getTime() + 60000).toISOString();
      const { data: appointment } = await admin.from("appointments").select(
        "id",
      ).eq("customer_email", email).eq("customer_phone", phone).in("status", [
        "pending",
        "confirmed",
      ]).gte("starts_at", from).lte("starts_at", to).maybeSingle();
      if (!appointment) {
        return json(origin, { error: "Código inválido ou expirado." }, 400);
      }

      const { data: recovery } = await admin.from("booking_recovery_codes")
        .select("*").eq("appointment_id", appointment.id).is("used_at", null)
        .gt("expires_at", new Date().toISOString()).order("created_at", {
          ascending: false,
        }).limit(1).maybeSingle();
      if (!recovery || recovery.attempt_count >= 5) {
        return json(origin, { error: "Código inválido ou expirado." }, 400);
      }
      const suppliedHash = await secretHash(`${appointment.id}:${code}`);
      if (suppliedHash !== recovery.code_hash) {
        await admin.from("booking_recovery_codes").update({
          attempt_count: recovery.attempt_count + 1,
        }).eq("id", recovery.id);
        return json(origin, { error: "Código inválido ou expirado." }, 400);
      }

      const token = randomToken();
      await Promise.all([
        admin.from("appointments").update({
          manage_token_hash: await secretHash(token),
        }).eq("id", appointment.id),
        admin.from("booking_recovery_codes").update({
          used_at: new Date().toISOString(),
        }).eq("id", recovery.id),
      ]);
      return json(origin, {
        success: true,
        manage_url: `${SITE_URL}/manage-booking.html#token=${token}`,
      });
    }

    return json(origin, { error: "Ação inválida." }, 400);
  } catch (error) {
    console.error("Booking API failure", error);
    return json(origin, {
      error: "Não foi possível concluir a solicitação. Tente novamente.",
    }, 500);
  }
});
