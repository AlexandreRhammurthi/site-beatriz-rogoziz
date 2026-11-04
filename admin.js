const client = window.createStudioSupabaseClient?.();
const authPanel = document.querySelector("[data-auth-panel]");
const resetRequestPanel = document.querySelector("[data-reset-request-panel]");
const resetPasswordPanel = document.querySelector("[data-reset-password-panel]");
const claimPanel = document.querySelector("[data-claim-panel]");
const dashboard = document.querySelector("[data-dashboard]");
const logoutButton = document.querySelector("[data-logout]");
const adminHomeButton = document.querySelector("[data-admin-home]");
const adminViews = Array.from(document.querySelectorAll("[data-admin-view]"));
const servicesList = document.querySelector("[data-services-list]");
const statusElement = document.querySelector("[data-status]");
const priceTemplate = document.querySelector("#price-row-template");
const ruleTemplate = document.querySelector("#availability-row-template");
const rulesList = document.querySelector("[data-rules-list]");
const blockedPeriodsList = document.querySelector("[data-blocked-periods-list]");
const blockedPeriodForm = document.querySelector("[data-blocked-period-form]");
const appointmentsList = document.querySelector("[data-appointments-list]");
const appointmentsSummary = document.querySelector("[data-appointments-summary]");
const appointmentsFilter = document.querySelector("[data-appointments-filter]");
const manualBookingForm = document.querySelector("[data-manual-booking-form]");
const manualBookingSlots = document.querySelector("[data-manual-slots]");
const manualBookingSummary = document.querySelector("[data-manual-summary]");
const manualBookingSuccess = document.querySelector("[data-manual-success]");
const packageForm = document.querySelector("[data-package-form]");
const packagesFilter = document.querySelector("[data-packages-filter]");
const packagesSummary = document.querySelector("[data-packages-summary]");
const packagesList = document.querySelector("[data-packages-list]");
const historyFilter = document.querySelector("[data-history-filter]");
const historyList = document.querySelector("[data-history-list]");
const operationsMetrics = document.querySelector("[data-operations-metrics]");
const operationsUpcoming = document.querySelector("[data-operations-upcoming]");
const operationsDemand = document.querySelector("[data-operations-demand]");
const operationsAlerts = document.querySelector("[data-operations-alerts]");
const instagramBadge = document.querySelector("[data-instagram-badge]");
const instagramAccount = document.querySelector("[data-instagram-account]");
const instagramConnectButton = document.querySelector("[data-instagram-connect]");
const instagramDisconnectButton = document.querySelector("[data-instagram-disconnect]");
const adminUtils = window.STUDIO_B_ADMIN_UTILS;
const weekdayLabels = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

const escapeHTML = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

let statusTimer;
let appointmentsCache = [];
let manualBookingConfig = null;
let manualBookingPackages = [];
let packagesCache = [];
let packageServices = [];
let packagePrices = [];
let historyCache = [];
let passwordRecoveryMode = false;
let currentAdminView = "home";
let instagramConnection = null;
const loadedAdminViews = new Set();
const callbackUrl = () => `${window.location.origin}${window.location.pathname}`;
let instagramReturn = new URLSearchParams(window.location.search).get("instagram");

const auditTableLabels = {
  services: "Serviço",
  service_prices: "Valor ou pacote",
  booking_settings: "Configuração da agenda",
  availability_rules: "Horário de atendimento",
  blocked_periods: "Bloqueio de agenda",
  appointments: "Agendamento",
  client_packages: "Pacote de cliente",
  package_sessions: "Sessão de pacote"
};

const auditActionLabels = { insert: "Criado", update: "Alterado", delete: "Excluído" };

const auditFieldLabels = {
  name: "Nome", subtitle: "Subtítulo", description: "Descrição", duration_label: "Duração",
  duration_minutes: "Duração em minutos", whatsapp_message: "Mensagem do WhatsApp", sort_order: "Ordem",
  is_active: "Visível ou ativo", label: "Opção", price_amount: "Valor", custom_value: "Texto alternativo",
  original_price: "Valor anterior", is_promotional: "Promocional", booking_enabled: "Agendamento online",
  reminders_enabled: "Lembretes", booking_horizon_days: "Período aberto", minimum_notice_hours: "Antecedência mínima",
  cancellation_notice_hours: "Limite de cancelamento", slot_interval_minutes: "Intervalo entre opções",
  buffer_minutes: "Preparação entre sessões", daily_booking_limit: "Limite diário", reminder_hours_before: "Antecedência do lembrete",
  weekday: "Dia da semana", start_time: "Início", end_time: "Fim", pause_start_time: "Início da pausa",
  pause_end_time: "Fim da pausa", starts_at: "Início", ends_at: "Fim", reason: "Motivo",
  attendance_status: "Comparecimento", admin_notes: "Observações", customer_name: "Cliente",
  package_label: "Pacote", total_sessions: "Sessões contratadas", purchased_on: "Compra", expires_on: "Validade",
  session_date: "Data da sessão", notes: "Observações",
  selected_option_label: "Opção escolhida", selected_option_price_amount: "Valor escolhido",
  selected_option_custom_value: "Texto do valor", selected_option_original_price: "Valor anterior",
  selected_option_is_promotional: "Valor promocional"
};

const hiddenAuditFields = new Set([
  "id", "service_id", "service_price_id", "package_id", "appointment_id", "client_package_id", "created_at", "updated_at",
  "manage_token_hash", "google_event_id", "reminder_attempted_at", "reminder_sent_at"
]);

const friendlyAuthError = (error) => {
  if (!error) return "Não foi possível concluir esta ação.";
  if (error.message === "Email not confirmed") {
    return "E-mail ainda não confirmado. Use “Reenviar e-mail de confirmação” e abra o novo link recebido.";
  }
  if (error.message === "Invalid login credentials") return "E-mail ou senha incorretos.";
  return error.message;
};

const showStatus = (message, isError = false) => {
  clearTimeout(statusTimer);
  statusElement.textContent = message;
  statusElement.classList.toggle("error", isError);
  statusElement.classList.add("visible");
  statusTimer = setTimeout(() => statusElement.classList.remove("visible"), 5000);
};

const setView = (view) => {
  authPanel.hidden = view !== "auth";
  resetRequestPanel.hidden = view !== "reset-request";
  resetPasswordPanel.hidden = view !== "reset-password";
  claimPanel.hidden = view !== "claim";
  dashboard.hidden = view !== "dashboard";
  logoutButton.hidden = view === "auth" || view === "reset-request";
  adminHomeButton.hidden = view !== "dashboard" || currentAdminView === "home";
};

const setBusy = (button, busy) => {
  if (!button) return;
  button.disabled = busy;
  button.dataset.originalText ||= button.textContent;
  button.textContent = busy ? "Aguarde…" : button.dataset.originalText;
};

const checkAdmin = async () => {
  const { data, error } = await client.rpc("is_admin");
  if (error) throw error;
  return data === true;
};

const callBookingApi = async (action, data = {}, authenticated = false) => {
  const headers = {
    "Content-Type": "application/json",
    apikey: window.STUDIO_B_SUPABASE.publishableKey
  };
  if (authenticated) {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) throw new Error("Sua sessão administrativa expirou. Entre novamente.");
    headers.Authorization = `Bearer ${sessionData.session.access_token}`;
  }
  const response = await fetch(window.STUDIO_B_SUPABASE.bookingApiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...data })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Não foi possível consultar a agenda.");
  return payload;
};

const callInstagramAdmin = async (action) => {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) throw new Error("Sua sessão administrativa expirou. Entre novamente.");
  const response = await fetch(window.STUDIO_B_SUPABASE.instagramAdminUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: window.STUDIO_B_SUPABASE.publishableKey,
      Authorization: `Bearer ${sessionData.session.access_token}`
    },
    body: JSON.stringify({ action })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Não foi possível administrar a conexão com o Instagram.");
  return payload;
};

const formatInstagramDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value))
  : "Não informada";

const renderInstagramConnection = (result) => {
  instagramConnection = result;
  const connected = Boolean(result?.connected && result.account);
  instagramBadge.textContent = connected ? "Conta conectada" : result?.configured ? "Sem conexão" : "Configuração pendente";
  instagramBadge.classList.toggle("connected", connected);
  instagramBadge.classList.toggle("pending", !connected);
  instagramConnectButton.textContent = connected ? "Trocar conta" : "Conectar conta";
  instagramConnectButton.disabled = !result?.configured;
  instagramDisconnectButton.hidden = !connected;

  if (connected) {
    const account = result.account;
    instagramAccount.innerHTML = `
      <h3>@${escapeHTML(account.username)}</h3>
      ${account.name ? `<p>${escapeHTML(account.name)}</p>` : ""}
      <p><a href="${escapeHTML(account.profile_url)}" target="_blank" rel="noopener noreferrer">Abrir perfil no Instagram</a></p>
      <p>Conectada em ${escapeHTML(formatInstagramDate(account.connected_at))}. Autorização válida até ${escapeHTML(formatInstagramDate(account.expires_at))}; a renovação é automática.</p>
    `;
    return;
  }

  instagramAccount.innerHTML = result?.configured
    ? "<h3>Nenhuma conta conectada</h3><p>Use o botão abaixo para autorizar uma conta profissional do Instagram.</p>"
    : "<h3>Aplicativo Meta ainda não configurado</h3><p>O módulo está protegido e pronto. Para liberar o botão, cadastre uma única vez as credenciais do aplicativo Meta nos Secrets do Supabase.</p>";
};

const loadInstagramConnection = async () => {
  const result = await callInstagramAdmin("status");
  renderInstagramConnection(result);
};

const addPriceRow = (container, price = {}) => {
  const row = priceTemplate.content.firstElementChild.cloneNode(true);
  row.dataset.priceId = price.id || "";
  row.querySelectorAll("[data-price-field]").forEach((field) => {
    const name = field.dataset.priceField;
    if (field.type === "checkbox") field.checked = price[name] ?? (name === "is_active");
    else field.value = price[name] ?? "";
  });
  container.append(row);
};

const addRuleRow = (rule = {}) => {
  const row = ruleTemplate.content.firstElementChild.cloneNode(true);
  row.querySelectorAll("[data-rule-field]").forEach((field) => {
    const name = field.dataset.ruleField;
    if (field.type === "checkbox") field.checked = rule[name] ?? true;
    else field.value = rule[name] ?? (name === "weekday" ? "1" : "");
  });
  rulesList.append(row);
};

const serviceMarkup = (service) => `
  <details class="service-editor" data-service-id="${escapeHTML(service.id)}">
    <summary>
      <span class="service-title">
        <span>${escapeHTML(service.name)}</span>
        <small>${escapeHTML(service.subtitle || "Sem subtítulo")}</small>
      </span>
      <span class="visibility">${service.is_active ? "Visível" : "Oculto"}</span>
    </summary>
    <form class="service-editor-form" data-service-form>
      <div class="fields-grid">
        <label>Nome<input name="name" value="${escapeHTML(service.name)}" required /></label>
        <label>Subtítulo<input name="subtitle" value="${escapeHTML(service.subtitle || "")}" /></label>
        <label>Duração<input name="duration_label" value="${escapeHTML(service.duration_label || "")}" placeholder="Duração: 1 hora" /></label>
        <label>Duração em minutos<input name="duration_minutes" type="number" min="10" max="480" step="5" value="${Number(service.duration_minutes) || 60}" required /></label>
        <label>Ordem<input name="sort_order" type="number" step="1" value="${Number(service.sort_order) || 0}" /></label>
        <label class="full">Descrição<textarea name="description">${escapeHTML(service.description || "")}</textarea></label>
        <label class="full">Mensagem do WhatsApp<textarea name="whatsapp_message">${escapeHTML(service.whatsapp_message || "")}</textarea></label>
        <label class="check"><input name="is_active" type="checkbox" ${service.is_active ? "checked" : ""} /> Exibir este serviço no site</label>
      </div>
      <div class="prices-heading">
        <h3>Sessões e pacotes</h3>
        <button class="text-action" type="button" data-add-price>Adicionar opção</button>
      </div>
      <div class="prices-list" data-prices-list></div>
      <div class="editor-actions">
        <button class="delete-service" type="button" data-delete-service>Excluir serviço</button>
        <button class="button primary" type="submit">Salvar alterações</button>
      </div>
    </form>
  </details>
`;

const loadServices = async () => {
  const [{ data: services, error: servicesError }, { data: prices, error: pricesError }] = await Promise.all([
    client.from("services").select("*").order("sort_order"),
    client.from("service_prices").select("*").order("sort_order")
  ]);
  if (servicesError || pricesError) throw servicesError || pricesError;

  servicesList.innerHTML = (services || []).map(serviceMarkup).join("");
  (services || []).forEach((service) => {
    const editor = servicesList.querySelector(`[data-service-id="${service.id}"]`);
    const container = editor.querySelector("[data-prices-list]");
    (prices || []).filter((price) => price.service_id === service.id).forEach((price) => addPriceRow(container, price));
  });
};

const loadBookingSettings = async () => {
  const [{ data: settings, error: settingsError }, { data: rules, error: rulesError }] = await Promise.all([
    client.from("booking_settings").select("*").eq("id", true).single(),
    client.from("availability_rules").select("*").order("weekday").order("start_time")
  ]);
  if (settingsError || rulesError) throw settingsError || rulesError;
  const form = document.querySelector("[data-booking-settings-form]");
  ["minimum_notice_hours", "booking_horizon_days", "slot_interval_minutes", "buffer_minutes", "daily_booking_limit", "cancellation_notice_hours", "reminder_hours_before"].forEach((name) => {
    form.elements[name].value = settings[name];
  });
  form.elements.booking_enabled.checked = settings.booking_enabled;
  form.elements.reminders_enabled.checked = settings.reminders_enabled;
  rulesList.innerHTML = "";
  (rules || []).forEach(addRuleRow);
  if (!rules?.length) addRuleRow();

  try {
    const response = await fetch(window.STUDIO_B_SUPABASE.bookingApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: window.STUDIO_B_SUPABASE.publishableKey },
      body: JSON.stringify({ action: "config" })
    });
    const result = await response.json();
    const badge = document.querySelector("[data-booking-state]");
    badge.textContent = result.enabled ? "Agendamento ativo" : settings.booking_enabled ? "Integração pendente" : "Agendamento desativado";
    badge.classList.toggle("connected", result.enabled);
  } catch {
    document.querySelector("[data-booking-state]").textContent = "Integração pendente";
  }
};

const setBlockedPeriodDefaults = () => {
  if (!blockedPeriodForm || !adminUtils) return;
  const today = adminUtils.partsInZone(new Date(), adminUtils.TIMEZONE);
  const dateValue = `${today.year}-${today.month}-${today.day}`;
  blockedPeriodForm.elements.start_date.value ||= dateValue;
  blockedPeriodForm.elements.end_date.value ||= dateValue;
};

const blockedPeriodMarkup = (period) => `
  <article class="blocked-period" data-block-id="${escapeHTML(period.id)}">
    <div>
      <strong>${escapeHTML(period.reason || "Período indisponível")}</strong>
      <p>${escapeHTML(adminUtils.formatBlockedPeriod(period.starts_at, period.ends_at))}</p>
    </div>
    <button type="button" data-remove-block>Remover bloqueio</button>
  </article>
`;

const loadBlockedPeriods = async () => {
  if (!blockedPeriodsList || !adminUtils) return;
  const { data, error } = await client
    .from("blocked_periods")
    .select("id, starts_at, ends_at, reason")
    .gt("ends_at", new Date().toISOString())
    .order("starts_at")
    .limit(100);
  if (error) throw error;
  blockedPeriodsList.innerHTML = data?.length
    ? data.map(blockedPeriodMarkup).join("")
    : '<p class="blocked-period-empty">Nenhum bloqueio futuro cadastrado.</p>';
  setBlockedPeriodDefaults();
};

const setAppointmentFilterDefaults = () => {
  if (!appointmentsFilter || !adminUtils) return;
  const today = adminUtils.partsInZone(new Date(), adminUtils.TIMEZONE);
  const dateValue = `${today.year}-${today.month}-${today.day}`;
  appointmentsFilter.elements.start_date.value ||= adminUtils.addDays(dateValue, -30);
  appointmentsFilter.elements.end_date.value ||= adminUtils.addDays(dateValue, 90);
};

const appointmentMarkup = (appointment) => {
  const statusLabel = adminUtils.appointmentStatusLabel(appointment.status);
  const serviceName = appointment.services?.name || "Serviço removido";
  const phone = adminUtils.formatPhone(appointment.customer_phone);
  const syncLabel = appointment.calendar_sync_requested ? "Convite de agenda solicitado" : "Sem convite de agenda";
  const sourceLabel = appointment.booking_source === "admin" ? "Lançamento administrativo" : "Agendamento online";
  const packageLabel = appointment.client_packages?.package_label || "";
  const optionLabel = appointment.selected_option_label || "";
  return `
    <article class="appointment-card ${escapeHTML(appointment.status)}">
      <div>
        <p class="appointment-date">${escapeHTML(adminUtils.formatAppointmentDate(appointment.starts_at, appointment.ends_at))}</p>
        <h3>${escapeHTML(serviceName)}</h3>
        <span class="appointment-source">${escapeHTML(sourceLabel)}</span>
        ${packageLabel ? `<span class="appointment-source">Pacote: ${escapeHTML(packageLabel)}</span>` : ""}
        ${optionLabel ? `<span class="appointment-source">Opção: ${escapeHTML(optionLabel)}</span>` : ""}
      </div>
      <div class="appointment-customer">
        <strong>${escapeHTML(appointment.customer_name)}</strong>
        <a href="mailto:${encodeURIComponent(appointment.customer_email)}">${escapeHTML(appointment.customer_email)}</a>
        <a href="tel:+${escapeHTML(appointment.customer_phone)}">${escapeHTML(phone)}</a>
      </div>
      <div class="appointment-meta">
        <p>${escapeHTML(syncLabel)}<br>Acompanhamento: ${escapeHTML(adminUtils.attendanceStatusLabel(appointment.attendance_status))}</p>
        <span class="appointment-status ${escapeHTML(appointment.status)}">${escapeHTML(statusLabel)}</span>
      </div>
      <details class="appointment-admin-tools">
        <summary>Acompanhamento interno</summary>
        <form data-appointment-admin-form data-appointment-id="${escapeHTML(appointment.id)}">
          <label>Comparecimento
            <select name="attendance_status">
              <option value="scheduled" ${appointment.attendance_status === "scheduled" ? "selected" : ""}>Agendado</option>
              <option value="completed" ${appointment.attendance_status === "completed" ? "selected" : ""}>Concluído</option>
              <option value="no_show" ${appointment.attendance_status === "no_show" ? "selected" : ""}>Não compareceu</option>
            </select>
          </label>
          <label>Observações privadas<textarea name="admin_notes" maxlength="2000" placeholder="Informações visíveis somente no painel">${escapeHTML(appointment.admin_notes || "")}</textarea></label>
          <button class="button primary" type="submit">Salvar acompanhamento</button>
        </form>
      </details>
    </article>
  `;
};

const renderAppointments = () => {
  if (!appointmentsList || !appointmentsSummary) return;
  const search = appointmentsFilter?.elements.search.value || "";
  const visible = appointmentsCache.filter((appointment) => adminUtils.appointmentMatches(appointment, search));
  const count = (status) => visible.filter((appointment) => appointment.status === status).length;
  appointmentsSummary.innerHTML = `
    <span class="summary-chip"><strong>${visible.length}</strong> exibidos</span>
    <span class="summary-chip"><strong>${count("confirmed")}</strong> confirmados</span>
    <span class="summary-chip"><strong>${count("pending")}</strong> pendentes</span>
    <span class="summary-chip"><strong>${count("cancelled")}</strong> cancelados</span>
  `;
  appointmentsList.innerHTML = visible.length
    ? visible.map(appointmentMarkup).join("")
    : '<p class="appointments-empty">Nenhum agendamento encontrado para os filtros selecionados.</p>';
};

const loadAppointments = async () => {
  if (!appointmentsFilter || !adminUtils) return;
  setAppointmentFilterDefaults();
  const startDate = appointmentsFilter.elements.start_date.value;
  const endDate = appointmentsFilter.elements.end_date.value;
  if (!startDate || !endDate || startDate > endDate) {
    throw new Error("O período de consulta dos agendamentos é inválido.");
  }
  const start = adminUtils.zonedTimeToUtc(startDate, "00:00:00");
  const end = adminUtils.zonedTimeToUtc(adminUtils.addDays(endDate, 1), "00:00:00");
  let query = client
    .from("appointments")
    .select("id, customer_name, customer_email, customer_phone, starts_at, ends_at, status, attendance_status, admin_notes, calendar_sync_requested, booking_source, client_package_id, selected_option_label, selected_option_price_amount, selected_option_custom_value, selected_option_is_promotional, services(name), client_packages(package_label)")
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .order("starts_at")
    .limit(500);
  const statusFilter = appointmentsFilter.elements.status.value;
  if (statusFilter !== "all") query = query.eq("status", statusFilter);
  const { data, error } = await query;
  if (error) throw error;
  appointmentsCache = data || [];
  renderAppointments();
};

const packageToday = () => {
  const parts = adminUtils.partsInZone(new Date(), adminUtils.TIMEZONE);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const packageLocalDateTime = (date = new Date()) => {
  const parts = adminUtils.partsInZone(date, adminUtils.TIMEZONE);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};

const normalizePackageSearch = (value = "") => String(value)
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();

const packageStats = (item) => {
  const sessions = item.package_sessions || [];
  const used = sessions.filter((session) => session.attendance_status === "completed").length;
  const remaining = Math.max(Number(item.total_sessions) - used, 0);
  const next = sessions
    .filter((session) => session.attendance_status === "scheduled" && new Date(session.session_date) >= new Date())
    .sort((a, b) => new Date(a.session_date) - new Date(b.session_date))[0] || null;
  const status = remaining === 0 ? "completed" : item.expires_on && item.expires_on < packageToday() ? "expired" : "active";
  return { used, remaining, next, status };
};

const packageStatusLabel = (status) => ({ active: "Ativo", completed: "Concluído", expired: "Expirado" })[status] || status;
const packageSessionStatusLabel = (status) => ({ scheduled: "Agendada", completed: "Realizada", no_show: "Não compareceu", cancelled: "Cancelada" })[status] || status;
const formatPackageDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { timeZone: value.includes("T") ? adminUtils.TIMEZONE : "UTC", dateStyle: "medium" }).format(new Date(value.includes("T") ? value : `${value}T12:00:00Z`))
  : "Sem validade";
const formatPackageDateTime = (value) => new Intl.DateTimeFormat("pt-BR", { timeZone: adminUtils.TIMEZONE, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const formatPackageMoney = (value) => value === null || value === "" ? "Não informado" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));

const packageSessionMarkup = (session) => `
  <div class="package-session" data-package-session-id="${escapeHTML(session.id)}">
    <strong>${escapeHTML(formatPackageDateTime(session.session_date))}</strong>
    <span>${escapeHTML(packageSessionStatusLabel(session.attendance_status))}</span>
    <span>${escapeHTML(session.notes || (session.appointment_id ? "Vinculada a um agendamento" : "Sem observações"))}</span>
    ${session.appointment_id ? '<span>Via agenda</span>' : '<button type="button" data-remove-package-session>Remover</button>'}
  </div>
`;

const packageMarkup = (item) => {
  const stats = packageStats(item);
  const sessions = [...(item.package_sessions || [])].sort((a, b) => new Date(b.session_date) - new Date(a.session_date));
  const progress = Math.min(100, Math.round(stats.used / Number(item.total_sessions) * 100));
  return `
    <article class="package-card" data-package-id="${escapeHTML(item.id)}">
      <div class="package-card-head">
        <div>
          <p class="eyebrow">${escapeHTML(item.services?.name || "Serviço removido")}</p>
          <h3>${escapeHTML(item.package_label)}</h3>
          <p class="package-customer"><strong>${escapeHTML(item.customer_name)}</strong><br>${escapeHTML(adminUtils.formatPhone(item.customer_phone))} · ${escapeHTML(item.customer_email)}</p>
        </div>
        <span class="package-status ${stats.status}">${escapeHTML(packageStatusLabel(stats.status))}</span>
      </div>
      <div class="package-metrics">
        <div class="package-metric"><span>Utilizadas</span><strong>${stats.used}</strong></div>
        <div class="package-metric"><span>Restantes</span><strong>${stats.remaining}</strong></div>
        <div class="package-metric"><span>Validade</span><strong>${escapeHTML(formatPackageDate(item.expires_on))}</strong></div>
        <div class="package-metric"><span>Próxima sessão</span><strong>${stats.next ? escapeHTML(formatPackageDateTime(stats.next.session_date)) : "Não agendada"}</strong></div>
      </div>
      <div class="package-progress" role="progressbar" aria-label="Sessões utilizadas" aria-valuemin="0" aria-valuemax="${Number(item.total_sessions)}" aria-valuenow="${stats.used}"><span style="width:${progress}%"></span></div>
      <details>
        <summary>Histórico e administração</summary>
        <div class="package-history">${sessions.length ? sessions.map(packageSessionMarkup).join("") : '<p class="appointments-empty">Nenhuma sessão registrada neste pacote.</p>'}</div>
        <form class="package-session-form" data-package-session-form>
          <label>Data e hora<input name="session_date" type="datetime-local" max="${packageLocalDateTime()}" required /></label>
          <label>Comparecimento<select name="attendance_status"><option value="completed">Realizada</option><option value="no_show">Não compareceu</option></select></label>
          <label>Observação<input name="notes" maxlength="1000" placeholder="Opcional" /></label>
          <button class="button secondary" type="submit">Registrar sessão</button>
        </form>
        <form class="package-edit-form" data-package-edit-form>
          <label class="wide">Nome do pacote<input name="package_label" maxlength="160" value="${escapeHTML(item.package_label)}" required /></label>
          <label>Total de sessões<input name="total_sessions" type="number" min="1" max="100" value="${Number(item.total_sessions)}" required /></label>
          <label>Valor<input name="price_amount" type="number" min="0" step="0.01" value="${item.price_amount ?? ""}" /></label>
          <label>Data da compra<input name="purchased_on" type="date" value="${escapeHTML(item.purchased_on)}" required /></label>
          <label>Validade<input name="expires_on" type="date" value="${escapeHTML(item.expires_on || "")}" /></label>
          <label class="wide">Observações internas<textarea name="notes" maxlength="2000">${escapeHTML(item.notes || "")}</textarea></label>
          <button class="button primary" type="submit">Salvar pacote</button>
        </form>
      </details>
    </article>
  `;
};

const renderPackages = () => {
  if (!packagesList || !packagesSummary) return;
  const search = normalizePackageSearch(packagesFilter.elements.search.value);
  const statusFilter = packagesFilter.elements.status.value;
  const visible = packagesCache.filter((item) => {
    const status = packageStats(item).status;
    const haystack = normalizePackageSearch([item.customer_name, item.customer_email, item.customer_phone, item.package_label, item.services?.name].filter(Boolean).join(" "));
    return (!search || haystack.includes(search)) && (statusFilter === "all" || status === statusFilter);
  });
  const count = (status) => packagesCache.filter((item) => packageStats(item).status === status).length;
  packagesSummary.innerHTML = `
    <span class="summary-chip"><strong>${packagesCache.length}</strong> cadastrados</span>
    <span class="summary-chip"><strong>${count("active")}</strong> ativos</span>
    <span class="summary-chip"><strong>${count("completed")}</strong> concluídos</span>
    <span class="summary-chip"><strong>${count("expired")}</strong> expirados</span>
  `;
  packagesList.innerHTML = visible.length ? visible.map(packageMarkup).join("") : '<p class="appointments-empty">Nenhum pacote encontrado.</p>';
};

const updatePackagePriceOptions = () => {
  if (!packageForm) return;
  const serviceId = packageForm.elements.service_id.value;
  const select = packageForm.elements.service_price_id;
  const options = packagePrices.filter((price) => price.service_id === serviceId && /pacote/i.test(price.label));
  select.innerHTML = '<option value="">Informar manualmente</option>' + options.map((price) => `<option value="${escapeHTML(price.id)}">${escapeHTML(price.label)}${price.price_amount !== null ? ` — ${escapeHTML(formatPackageMoney(price.price_amount))}` : ""}</option>`).join("");
};

const loadPackages = async () => {
  if (!packageForm || !packagesList) return;
  const [{ data: services, error: servicesError }, { data: prices, error: pricesError }, { data: packages, error: packagesError }] = await Promise.all([
    client.from("services").select("id, name, sort_order").eq("is_active", true).order("sort_order"),
    client.from("service_prices").select("id, service_id, label, price_amount, is_active").eq("is_active", true).order("sort_order"),
    client.from("client_packages").select("*, services(name), package_sessions(id, appointment_id, session_date, attendance_status, notes)").order("created_at", { ascending: false })
  ]);
  if (servicesError || pricesError || packagesError) throw servicesError || pricesError || packagesError;
  packageServices = services || [];
  packagePrices = prices || [];
  packagesCache = packages || [];
  packageForm.elements.service_id.innerHTML = '<option value="">Selecione</option>' + packageServices.map((service) => `<option value="${escapeHTML(service.id)}">${escapeHTML(service.name)}</option>`).join("");
  packageForm.elements.purchased_on.value ||= packageToday();
  updatePackagePriceOptions();
  renderPackages();
};

packageForm?.elements.service_id.addEventListener("change", () => {
  updatePackagePriceOptions();
  packageForm.elements.service_price_id.value = "";
});

packageForm?.elements.service_price_id.addEventListener("change", () => {
  const price = packagePrices.find((item) => item.id === packageForm.elements.service_price_id.value);
  if (!price) return;
  packageForm.elements.package_label.value = price.label;
  packageForm.elements.price_amount.value = price.price_amount ?? "";
  const quantity = price.label.match(/(\d+)\s*sess/i)?.[1];
  if (quantity) packageForm.elements.total_sessions.value = quantity;
});

packageForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  const values = new FormData(packageForm);
  const purchasedOn = String(values.get("purchased_on") || "");
  const expiresOn = String(values.get("expires_on") || "");
  if (expiresOn && expiresOn < purchasedOn) return showStatus("A validade não pode ser anterior à compra.", true);
  const phone = String(values.get("customer_phone") || "").replace(/\D/g, "");
  if (!/^\d{10,13}$/.test(phone)) return showStatus("Informe um WhatsApp válido com DDD.", true);
  const input = {
    service_id: String(values.get("service_id")),
    service_price_id: String(values.get("service_price_id") || "") || null,
    customer_name: String(values.get("customer_name") || "").trim().replace(/\s+/g, " "),
    customer_email: String(values.get("customer_email") || "").trim().toLowerCase(),
    customer_phone: phone,
    package_label: String(values.get("package_label") || "").trim(),
    total_sessions: Number(values.get("total_sessions")),
    price_amount: String(values.get("price_amount") || "") || null,
    purchased_on: purchasedOn,
    expires_on: expiresOn || null,
    notes: String(values.get("notes") || "").trim()
  };
  setBusy(button, true);
  const { error } = await client.from("client_packages").insert(input);
  setBusy(button, false);
  if (error) return showStatus(error.message, true);
  packageForm.reset();
  packageForm.elements.purchased_on.value = packageToday();
  updatePackagePriceOptions();
  await loadPackages();
  showStatus("Pacote cadastrado com sucesso.");
});

packagesFilter?.elements.search.addEventListener("input", renderPackages);
packagesFilter?.elements.status.addEventListener("change", renderPackages);

packagesList?.addEventListener("submit", async (event) => {
  const card = event.target.closest("[data-package-id]");
  if (!card) return;
  event.preventDefault();
  const button = event.submitter;
  const values = new FormData(event.target);

  if (event.target.matches("[data-package-session-form]")) {
    const localDateTime = String(values.get("session_date") || "");
    const [dateValue, timeValue] = localDateTime.split("T");
    const sessionDate = adminUtils.zonedTimeToUtc(dateValue, `${timeValue}:00`);
    if (!sessionDate || sessionDate > new Date()) return showStatus("A sessão realizada não pode estar no futuro.", true);
    setBusy(button, true);
    const { error } = await client.from("package_sessions").insert({
      package_id: card.dataset.packageId,
      session_date: sessionDate.toISOString(),
      attendance_status: String(values.get("attendance_status")),
      notes: String(values.get("notes") || "").trim()
    });
    setBusy(button, false);
    if (error) return showStatus(error.message, true);
    await loadPackages();
    showStatus("Sessão registrada no histórico do pacote.");
    return;
  }

  if (event.target.matches("[data-package-edit-form]")) {
    const purchasedOn = String(values.get("purchased_on") || "");
    const expiresOn = String(values.get("expires_on") || "");
    if (expiresOn && expiresOn < purchasedOn) return showStatus("A validade não pode ser anterior à compra.", true);
    setBusy(button, true);
    const { error } = await client.from("client_packages").update({
      package_label: String(values.get("package_label") || "").trim(),
      total_sessions: Number(values.get("total_sessions")),
      price_amount: String(values.get("price_amount") || "") || null,
      purchased_on: purchasedOn,
      expires_on: expiresOn || null,
      notes: String(values.get("notes") || "").trim()
    }).eq("id", card.dataset.packageId);
    setBusy(button, false);
    if (error) return showStatus(error.message, true);
    await loadPackages();
    showStatus("Pacote atualizado.");
  }
});

packagesList?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-package-session]");
  if (!button) return;
  const session = button.closest("[data-package-session-id]");
  if (!window.confirm("Remover esta sessão manual do histórico?")) return;
  setBusy(button, true);
  const { error } = await client.from("package_sessions").delete().eq("id", session.dataset.packageSessionId).is("appointment_id", null);
  setBusy(button, false);
  if (error) return showStatus(error.message, true);
  await loadPackages();
  showStatus("Sessão removida do histórico.");
});

const manualBookingDateValue = () => {
  const today = adminUtils.partsInZone(new Date(), manualBookingConfig?.timezone || adminUtils.TIMEZONE);
  return `${today.year}-${today.month}-${today.day}`;
};

const resetManualBookingForm = () => {
  if (!manualBookingForm || !manualBookingConfig) return;
  manualBookingForm.reset();
  manualBookingForm.elements.send_email.checked = true;
  manualBookingForm.elements.starts_at.value = "";
  manualBookingForm.elements.date.min = manualBookingDateValue();
  manualBookingForm.elements.date.max = adminUtils.addDays(manualBookingDateValue(), manualBookingConfig.booking_horizon_days);
  manualBookingSlots.innerHTML = '<p class="appointments-empty">Escolha o serviço e a data para consultar os horários.</p>';
  manualBookingSummary.hidden = true;
  manualBookingSummary.innerHTML = "";
  manualBookingForm.elements.client_package_id.innerHTML = '<option value="">Não vincular a pacote</option>';
  refreshManualPriceOptions();
};

const refreshManualPackageOptions = () => {
  const serviceId = manualBookingForm?.elements.service_id.value;
  const select = manualBookingForm?.elements.client_package_id;
  if (!select) return;
  const options = manualBookingPackages.filter((item) => {
    const stats = packageStats(item);
    return item.service_id === serviceId && stats.status === "active" && stats.remaining > 0;
  });
  select.innerHTML = '<option value="">Não vincular a pacote</option>' + options.map((item) => {
    const stats = packageStats(item);
    return `<option value="${escapeHTML(item.id)}">${escapeHTML(item.customer_name)} — ${escapeHTML(item.package_label)} (${stats.remaining} restantes)</option>`;
  }).join("");
};

const refreshManualPriceOptions = () => {
  const service = manualBookingConfig?.services.find((item) =>
    item.id === manualBookingForm?.elements.service_id.value
  );
  const select = manualBookingForm?.elements.service_price_id;
  if (!select) return;
  select.disabled = false;
  select.required = true;
  select.innerHTML = '<option value="">Selecione</option>' + (service?.price_options || [])
    .map((option) => {
      const value = option.price_amount !== null && option.price_amount !== undefined
        ? formatPackageMoney(option.price_amount)
        : option.custom_value || "Consulte";
      return `<option value="${escapeHTML(option.id)}">${escapeHTML(option.label)} — ${escapeHTML(value)}</option>`;
    }).join("");
};

const loadManualBookingForm = async () => {
  if (!manualBookingForm || !adminUtils) return;
  const [bookingConfig, packagesResult] = await Promise.all([
    callBookingApi("admin-config", {}, true),
    client.from("client_packages").select("*, package_sessions(id, session_date, attendance_status)")
  ]);
  if (packagesResult.error) throw packagesResult.error;
  manualBookingConfig = bookingConfig;
  manualBookingPackages = packagesResult.data || [];
  if (!manualBookingConfig.enabled) throw new Error("A integração com Google Agenda ainda não está disponível.");
  const select = manualBookingForm.elements.service_id;
  select.innerHTML = '<option value="">Selecione</option>' + manualBookingConfig.services
    .map((service) => `<option value="${escapeHTML(service.id)}">${escapeHTML(service.name)} — ${Number(service.duration_minutes)} min</option>`)
    .join("");
  manualBookingSuccess.hidden = true;
  manualBookingForm.hidden = false;
  resetManualBookingForm();
};

const loadManualBookingSlots = async () => {
  const serviceId = manualBookingForm?.elements.service_id.value;
  const date = manualBookingForm?.elements.date.value;
  manualBookingForm.elements.starts_at.value = "";
  manualBookingSummary.hidden = true;
  if (!serviceId || !date) {
    manualBookingSlots.innerHTML = '<p class="appointments-empty">Escolha o serviço e a data para consultar os horários.</p>';
    return;
  }
  manualBookingSlots.innerHTML = '<p class="appointments-empty">Consultando horários…</p>';
  try {
    const result = await callBookingApi("admin-availability", { service_id: serviceId, date }, true);
    manualBookingSlots.innerHTML = result.slots.length
      ? result.slots.map((slot) => `<button class="admin-slot" type="button" data-manual-start="${escapeHTML(slot.start)}" data-manual-label="${escapeHTML(slot.label)}">${escapeHTML(slot.label)}</button>`).join("")
      : '<p class="appointments-empty">Não há horários disponíveis nesta data.</p>';
  } catch (error) {
    manualBookingSlots.innerHTML = '<p class="appointments-empty">Não foi possível consultar esta data.</p>';
    showStatus(error.message, true);
  }
};

const updateManualBookingSummary = (slot) => {
  const service = manualBookingConfig?.services.find((item) => item.id === manualBookingForm.elements.service_id.value);
  if (!service || !slot) return;
  const option = service.price_options?.find((item) => item.id === manualBookingForm.elements.service_price_id.value);
  const linkedPackage = manualBookingPackages.find((item) => item.id === manualBookingForm.elements.client_package_id.value);
  const start = new Date(slot.dataset.manualStart);
  const label = new Intl.DateTimeFormat("pt-BR", {
    timeZone: manualBookingConfig.timezone,
    dateStyle: "full",
    timeStyle: "short"
  }).format(start);
  const optionLabel = linkedPackage?.package_label || option?.label;
  manualBookingSummary.innerHTML = `<strong>${escapeHTML(service.name)}</strong>${optionLabel ? `<br>${escapeHTML(optionLabel)}` : ""}<br>${escapeHTML(label)}<br>${Number(service.duration_minutes)} minutos`;
  manualBookingSummary.hidden = false;
};

manualBookingForm?.elements.service_id.addEventListener("change", async () => {
  refreshManualPriceOptions();
  refreshManualPackageOptions();
  await loadManualBookingSlots();
});
manualBookingForm?.elements.date.addEventListener("change", loadManualBookingSlots);
manualBookingForm?.elements.client_package_id.addEventListener("change", () => {
  const selected = manualBookingPackages.find((item) => item.id === manualBookingForm.elements.client_package_id.value);
  const priceSelect = manualBookingForm.elements.service_price_id;
  priceSelect.disabled = Boolean(selected);
  priceSelect.required = !selected;
  if (!selected) return;
  priceSelect.value = "";
  manualBookingForm.elements.name.value = selected.customer_name;
  manualBookingForm.elements.phone.value = adminUtils.formatPhone(selected.customer_phone);
  manualBookingForm.elements.email.value = selected.customer_email;
});

manualBookingSlots?.addEventListener("click", (event) => {
  const slot = event.target.closest("[data-manual-start]");
  if (!slot) return;
  manualBookingSlots.querySelectorAll("[data-manual-start]").forEach((button) => {
    button.classList.toggle("selected", button === slot);
    button.setAttribute("aria-pressed", String(button === slot));
  });
  manualBookingForm.elements.starts_at.value = slot.dataset.manualStart;
  updateManualBookingSummary(slot);
});

manualBookingForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  const values = new FormData(manualBookingForm);
  const startsAt = String(values.get("starts_at") || "");
  if (!startsAt) return showStatus("Selecione um dos horários disponíveis.", true);

  setBusy(button, true);
  try {
    const result = await callBookingApi("admin-create", {
      name: String(values.get("name") || "").trim(),
      phone: String(values.get("phone") || "").trim(),
      email: String(values.get("email") || "").trim(),
      service_id: String(values.get("service_id") || ""),
      service_price_id: String(values.get("service_price_id") || "") || null,
      client_package_id: String(values.get("client_package_id") || "") || null,
      starts_at: startsAt,
      sync_calendar: values.get("sync_calendar") === "on",
      send_email: values.get("send_email") === "on"
    }, true);

    const successCopy = manualBookingSuccess.querySelector("[data-manual-success-copy]");
    const manageLink = manualBookingSuccess.querySelector("[data-manual-manage-link]");
    if (result.email_delivered === true) {
      successCopy.textContent = "A confirmação e o link de gerenciamento foram enviados ao cliente por e-mail.";
    } else if (result.email_delivered === false) {
      successCopy.textContent = "O horário foi registrado, mas o e-mail não pôde ser enviado. Compartilhe o link de gerenciamento com o cliente.";
    } else {
      successCopy.textContent = "O horário foi registrado sem envio de e-mail. Compartilhe o link de gerenciamento com o cliente, se necessário.";
    }
    manageLink.href = result.manage_url;
    manualBookingForm.hidden = true;
    manualBookingSuccess.hidden = false;
    loadedAdminViews.delete("appointments");
    loadedAdminViews.delete("packages");
    loadedAdminViews.delete("operations-dashboard");
    appointmentsCache = [];
    showStatus("Agendamento registrado com sucesso.");
  } catch (error) {
    showStatus(error.message || "Não foi possível registrar o agendamento.", true);
    if (/horário/i.test(error.message || "")) await loadManualBookingSlots();
  } finally {
    setBusy(button, false);
  }
});

document.querySelector("[data-new-manual-booking]")?.addEventListener("click", () => {
  manualBookingSuccess.hidden = true;
  manualBookingForm.hidden = false;
  resetManualBookingForm();
  manualBookingForm.elements.name.focus();
});

const formatAuditValue = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const auditRecordLabel = (entry) => {
  const data = entry.new_data || entry.old_data || {};
  if (entry.table_name === "services") return data.name || "Serviço";
  if (entry.table_name === "service_prices") return data.label || "Opção de valor";
  if (entry.table_name === "booking_settings") return "Disponibilidade online";
  if (entry.table_name === "availability_rules") {
    return `${weekdayLabels[Number(data.weekday)] || "Dia"}, ${String(data.start_time || "").slice(0, 5)}–${String(data.end_time || "").slice(0, 5)}`;
  }
  if (entry.table_name === "blocked_periods") return data.reason || "Período indisponível";
  if (entry.table_name === "appointments") return data.customer_name || "Atendimento";
  if (entry.table_name === "client_packages") return `${data.customer_name || "Cliente"} — ${data.package_label || "Pacote"}`;
  if (entry.table_name === "package_sessions") return data.session_date ? `Sessão de ${data.session_date}` : "Sessão do pacote";
  return entry.record_id;
};

const auditChanges = (entry) => {
  const before = entry.old_data || {};
  const after = entry.new_data || {};
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((field) => !hiddenAuditFields.has(field) && JSON.stringify(before[field]) !== JSON.stringify(after[field]));
  return fields.slice(0, 10).map((field) => ({
    label: auditFieldLabels[field] || field.replaceAll("_", " "),
    before: formatAuditValue(before[field]),
    after: formatAuditValue(after[field])
  }));
};

const historyMarkup = (entry) => {
  const changes = auditChanges(entry);
  const actionLabel = entry.source_audit_id ? "Reversão" : (auditActionLabels[entry.action] || entry.action);
  const happenedAt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: adminUtils?.TIMEZONE || "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(entry.changed_at));
  const summary = changes.length
    ? changes.slice(0, 2).map((change) => change.label).join(" e ")
    : "Registro administrativo";
  return `
    <article class="history-card ${entry.undone_at ? "is-undone" : ""}" data-audit-id="${entry.id}">
      <div>
        <span class="history-action ${escapeHTML(entry.action)}">${escapeHTML(actionLabel)}</span>
        <p class="history-when">${escapeHTML(happenedAt)}</p>
        <p class="history-actor">${escapeHTML(entry.changed_by_email || "Administrador")}</p>
      </div>
      <div>
        <p class="eyebrow">${escapeHTML(auditTableLabels[entry.table_name] || entry.table_name)}</p>
        <h3>${escapeHTML(auditRecordLabel(entry))}</h3>
        <p class="history-summary">${escapeHTML(summary)}</p>
        <details class="history-details">
          <summary>Ver detalhes</summary>
          <ul class="history-changes">
            ${changes.length ? changes.map((change) => `<li><strong>${escapeHTML(change.label)}:</strong> ${escapeHTML(change.before)} → ${escapeHTML(change.after)}</li>`).join("") : "<li>Nenhum campo de conteúdo foi alterado.</li>"}
          </ul>
        </details>
      </div>
      ${entry.undone_at
        ? '<span class="history-undone">Desfeito</span>'
        : `<button class="button secondary history-undo" type="button" data-undo-audit="${entry.id}">Desfazer</button>`}
    </article>`;
};

const renderHistory = () => {
  if (!historyList || !historyFilter) return;
  const tableName = historyFilter.elements.table_name.value;
  const action = historyFilter.elements.action.value;
  const visible = historyCache.filter((entry) =>
    (tableName === "all" || entry.table_name === tableName) &&
    (action === "all" || entry.action === action)
  );
  historyList.innerHTML = visible.length
    ? visible.map(historyMarkup).join("")
    : '<p class="appointments-empty">Nenhuma alteração encontrada para estes filtros.</p>';
};

const loadHistory = async () => {
  if (!historyList) return;
  historyList.innerHTML = '<p class="appointments-empty">Carregando histórico…</p>';
  const { data, error } = await client.from("admin_audit_log")
    .select("id, table_name, record_id, action, old_data, new_data, changed_by_email, changed_at, source_audit_id, undone_at, undo_audit_id")
    .order("changed_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  historyCache = data || [];
  renderHistory();
};

const loadOperationsDashboard = async () => {
  if (!operationsMetrics || !adminUtils) return;
  operationsMetrics.innerHTML = '<p class="appointments-empty">Calculando indicadores…</p>';
  const today = packageToday();
  const start = adminUtils.zonedTimeToUtc(adminUtils.addDays(today, -30), "00:00:00");
  const end = adminUtils.zonedTimeToUtc(adminUtils.addDays(today, 91), "00:00:00");
  const [appointmentsResult, packagesResult] = await Promise.all([
    client.from("appointments")
      .select("id, customer_name, starts_at, ends_at, status, attendance_status, selected_option_label, services(name)")
      .gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString()).order("starts_at"),
    client.from("client_packages")
      .select("id, customer_name, package_label, total_sessions, expires_on, services(name), package_sessions(id, session_date, attendance_status)")
  ]);
  if (appointmentsResult.error) throw appointmentsResult.error;
  if (packagesResult.error) throw packagesResult.error;

  const appointments = appointmentsResult.data || [];
  const packages = packagesResult.data || [];
  const todayStart = adminUtils.zonedTimeToUtc(today, "00:00:00");
  const tomorrowStart = adminUtils.zonedTimeToUtc(adminUtils.addDays(today, 1), "00:00:00");
  const nextWeek = adminUtils.zonedTimeToUtc(adminUtils.addDays(today, 7), "00:00:00");
  const nextMonth = adminUtils.zonedTimeToUtc(adminUtils.addDays(today, 31), "00:00:00");
  const pastMonth = adminUtils.zonedTimeToUtc(adminUtils.addDays(today, -30), "00:00:00");
  const active = appointments.filter((item) => item.status !== "cancelled");
  const between = (item, from, to) => {
    const value = new Date(item.starts_at);
    return value >= from && value < to;
  };
  const todayCount = active.filter((item) => between(item, todayStart, tomorrowStart)).length;
  const nextSevenCount = active.filter((item) => between(item, todayStart, nextWeek)).length;
  const recent = appointments.filter((item) => between(item, pastMonth, tomorrowStart));
  const completedCount = recent.filter((item) => item.attendance_status === "completed").length;
  const cancelledCount = recent.filter((item) => item.status === "cancelled").length;
  const noShowCount = recent.filter((item) => item.attendance_status === "no_show").length;
  const incidentRate = recent.length ? Math.round(((cancelledCount + noShowCount) / recent.length) * 100) : 0;

  operationsMetrics.innerHTML = `
    <article><span>Hoje</span><strong>${todayCount}</strong><small>atendimentos ativos</small></article>
    <article><span>Próximos 7 dias</span><strong>${nextSevenCount}</strong><small>atendimentos ativos</small></article>
    <article><span>Últimos 30 dias</span><strong>${completedCount}</strong><small>sessões concluídas</small></article>
    <article><span>Cancelamentos + faltas</span><strong>${incidentRate}%</strong><small>${cancelledCount} cancelados e ${noShowCount} faltas</small></article>
  `;

  const upcoming = active.filter((item) => new Date(item.starts_at) >= new Date()).slice(0, 6);
  operationsUpcoming.innerHTML = upcoming.length ? upcoming.map((item) => `
    <article class="operations-list-item">
      <span>${escapeHTML(adminUtils.formatAppointmentDate(item.starts_at, item.ends_at))}</span>
      <strong>${escapeHTML(item.customer_name)}</strong>
      <small>${escapeHTML(item.services?.name || "Serviço removido")}${item.selected_option_label ? ` · ${escapeHTML(item.selected_option_label)}` : ""}</small>
    </article>`).join("") : '<p class="appointments-empty">Nenhum atendimento futuro.</p>';

  const demand = new Map();
  active.filter((item) => between(item, todayStart, nextMonth)).forEach((item) => {
    const name = item.services?.name || "Serviço removido";
    demand.set(name, (demand.get(name) || 0) + 1);
  });
  const demandRows = [...demand.entries()].sort((a, b) => b[1] - a[1]);
  const demandMax = Math.max(...demandRows.map(([, count]) => count), 1);
  operationsDemand.innerHTML = demandRows.length ? demandRows.map(([name, count]) => `
    <div class="demand-row"><span><strong>${escapeHTML(name)}</strong><small>${count} agendamento${count === 1 ? "" : "s"}</small></span><i><b style="width:${Math.round((count / demandMax) * 100)}%"></b></i></div>
  `).join("") : '<p class="appointments-empty">Ainda não há demanda no período.</p>';

  const alertLimit = adminUtils.addDays(today, 30);
  const alerts = packages.map((item) => ({ item, stats: packageStats(item) }))
    .filter(({ item, stats }) => stats.status === "active" && stats.remaining > 0 && (
      (item.expires_on && item.expires_on <= alertLimit) || !stats.next
    ))
    .sort((a, b) => String(a.item.expires_on || "9999").localeCompare(String(b.item.expires_on || "9999")))
    .slice(0, 8);
  operationsAlerts.innerHTML = alerts.length ? alerts.map(({ item, stats }) => `
    <article class="operations-list-item operations-alert">
      <strong>${escapeHTML(item.customer_name)}</strong>
      <span>${escapeHTML(item.package_label)} · ${stats.remaining} sessão${stats.remaining === 1 ? "" : "ões"} restante${stats.remaining === 1 ? "" : "s"}</span>
      <small>${item.expires_on && item.expires_on <= alertLimit ? `Validade: ${escapeHTML(formatPackageDate(item.expires_on))}` : "Sem próxima sessão agendada"}</small>
    </article>`).join("") : '<p class="appointments-empty">Nenhum pacote exige atenção agora.</p>';
};

const loadAdminView = async (view) => {
  if (view === "history") {
    await loadHistory();
    loadedAdminViews.add(view);
    return;
  }
  if (view === "operations-dashboard") {
    await loadOperationsDashboard();
    loadedAdminViews.add(view);
    return;
  }
  if (view === "instagram") {
    await loadInstagramConnection();
    loadedAdminViews.add(view);
    return;
  }
  if (loadedAdminViews.has(view)) return;
  if (view === "services") await loadServices();
  if (view === "packages") await loadPackages();
  if (view === "schedule-settings") await Promise.all([loadBookingSettings(), loadBlockedPeriods()]);
  if (view === "create-appointment") await loadManualBookingForm();
  if (view === "appointments") await loadAppointments();
  loadedAdminViews.add(view);
};

const showAdminView = async (view, { focus = true } = {}) => {
  const target = adminViews.find((item) => item.dataset.adminView === view);
  if (!target) return;
  dashboard.setAttribute("aria-busy", "true");
  try {
    await loadAdminView(view);
    adminViews.forEach((item) => { item.hidden = item !== target; });
    currentAdminView = view;
    adminHomeButton.hidden = view === "home";
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (focus) target.querySelector("h1, h2")?.focus({ preventScroll: true });
  } catch (error) {
    showStatus(error.message || "Não foi possível abrir esta área do painel.", true);
  } finally {
    dashboard.removeAttribute("aria-busy");
  }
};

const showDashboard = async () => {
  const isFirstEntry = dashboard.hidden;
  setView("dashboard");
  const destination = isFirstEntry && instagramReturn ? "instagram" : (isFirstEntry ? "home" : currentAdminView);
  await showAdminView(destination, { focus: false });
  if (instagramReturn) {
    showStatus(instagramReturn === "connected"
      ? "Conta do Instagram conectada com sucesso."
      : "A autorização do Instagram não foi concluída.", instagramReturn !== "connected");
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("instagram");
    cleanUrl.searchParams.delete("reason");
    window.history.replaceState({}, "", cleanUrl);
    instagramReturn = null;
  }
};

const handleSession = async (session) => {
  if (passwordRecoveryMode) {
    setView(session ? "reset-password" : "auth");
    return;
  }
  if (!session) {
    setView("auth");
    return;
  }
  try {
    if (await checkAdmin()) await showDashboard();
    else setView("claim");
  } catch (error) {
    setView("auth");
    showStatus(error.message || "Não foi possível validar o acesso.", true);
  }
};

document.querySelector("[data-auth-form]")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  const form = new FormData(event.currentTarget);
  setBusy(button, true);
  const { error } = await client.auth.signInWithPassword({
    email: String(form.get("email")).trim(),
    password: String(form.get("password"))
  });
  setBusy(button, false);
  if (error) showStatus(friendlyAuthError(error), true);
});

document.querySelector("[data-signup]")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const formElement = button.closest("form");
  if (!formElement.reportValidity()) return;
  const form = new FormData(formElement);
  setBusy(button, true);
  const { data, error } = await client.auth.signUp({
    email: String(form.get("email")).trim(),
    password: String(form.get("password")),
    options: { emailRedirectTo: callbackUrl() }
  });
  setBusy(button, false);
  if (error) return showStatus(friendlyAuthError(error), true);
  if (!data.session) showStatus("Conta criada. Confirme o e-mail e depois entre no painel.");
  else showStatus("Conta criada. Agora informe o código de ativação.");
});

document.querySelector("[data-resend]")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const emailInput = button.closest("form").querySelector('[name="email"]');
  if (!emailInput.reportValidity()) return;
  setBusy(button, true);
  const { error } = await client.auth.resend({
    type: "signup",
    email: emailInput.value.trim(),
    options: { emailRedirectTo: callbackUrl() }
  });
  setBusy(button, false);
  if (error) return showStatus(friendlyAuthError(error), true);
  showStatus("Novo e-mail enviado. Abra o link recebido para concluir a confirmação.");
});

document.querySelector("[data-forgot-password]")?.addEventListener("click", () => {
  const loginEmail = document.querySelector('[data-auth-form] [name="email"]')?.value.trim();
  const resetEmail = document.querySelector('[data-reset-request-form] [name="email"]');
  if (loginEmail && resetEmail) resetEmail.value = loginEmail;
  setView("reset-request");
  resetEmail?.focus();
});

document.querySelector("[data-back-to-login]")?.addEventListener("click", () => setView("auth"));

document.querySelector("[data-reset-request-form]")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  const email = String(new FormData(event.currentTarget).get("email") || "").trim();
  setBusy(button, true);
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl()
  });
  setBusy(button, false);
  if (error) return showStatus(friendlyAuthError(error), true);
  event.currentTarget.reset();
  setView("auth");
  showStatus("Se o e-mail estiver cadastrado, enviaremos um link seguro para redefinir a senha.");
});

document.querySelector("[data-reset-password-form]")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  const values = new FormData(event.currentTarget);
  const password = String(values.get("password") || "");
  const confirmation = String(values.get("password_confirmation") || "");
  if (password !== confirmation) return showStatus("As senhas informadas não coincidem.", true);
  setBusy(button, true);
  const { error } = await client.auth.updateUser({ password });
  setBusy(button, false);
  if (error) return showStatus(friendlyAuthError(error), true);
  passwordRecoveryMode = false;
  event.currentTarget.reset();
  showStatus("Senha atualizada com sucesso.");
  const { data } = await client.auth.getSession();
  await handleSession(data.session);
});

document.querySelectorAll("[data-toggle-password]").forEach((toggle) => toggle.addEventListener("click", (event) => {
  const button = event.currentTarget;
  const input = button.closest(".password-control").querySelector("input");
  const willShow = input.type === "password";
  input.type = willShow ? "text" : "password";
  button.textContent = willShow ? "Ocultar" : "Mostrar";
  button.setAttribute("aria-label", willShow ? "Ocultar senha" : "Mostrar senha");
  button.setAttribute("aria-pressed", String(willShow));
}));

document.querySelector("[data-claim-form]")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  const code = String(new FormData(event.currentTarget).get("code")).trim();
  setBusy(button, true);
  const { data, error } = await client.rpc("claim_first_admin", { p_code: code });
  setBusy(button, false);
  if (error || data !== true) return showStatus(error?.message || "Código inválido ou já utilizado.", true);
  showStatus("Painel ativado com sucesso.");
  await showDashboard();
});

logoutButton?.addEventListener("click", async () => {
  await client.auth.signOut();
  passwordRecoveryMode = false;
  loadedAdminViews.clear();
  appointmentsCache = [];
  historyCache = [];
  manualBookingConfig = null;
  currentAdminView = "home";
  setView("auth");
});

adminHomeButton?.addEventListener("click", () => showAdminView("home"));

dashboard?.addEventListener("click", (event) => {
  const navigationButton = event.target.closest("[data-admin-target]");
  if (!navigationButton) return;
  showAdminView(navigationButton.dataset.adminTarget);
});

instagramConnectButton?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  setBusy(button, true);
  try {
    const result = await callInstagramAdmin("connect");
    if (!result.authorization_url) throw new Error("A Meta não retornou o endereço de autorização.");
    const authorizationUrl = new URL(result.authorization_url);
    if (authorizationUrl.protocol !== "https:" || authorizationUrl.hostname !== "www.instagram.com") {
      throw new Error("O endereço de autorização retornado é inválido.");
    }
    window.location.assign(authorizationUrl.toString());
  } catch (error) {
    setBusy(button, false);
    showStatus(error.message || "Não foi possível iniciar a autorização do Instagram.", true);
  }
});

instagramDisconnectButton?.addEventListener("click", async (event) => {
  if (!instagramConnection?.connected) return;
  if (!window.confirm("Desconectar esta conta? A Galeria usará as 12 imagens locais até uma nova conexão.")) return;
  const button = event.currentTarget;
  setBusy(button, true);
  try {
    await callInstagramAdmin("disconnect");
    await loadInstagramConnection();
    showStatus("Conta do Instagram desconectada.");
  } catch (error) {
    showStatus(error.message || "Não foi possível desconectar a conta.", true);
  } finally {
    setBusy(button, false);
  }
});

historyFilter?.addEventListener("change", renderHistory);

document.querySelector("[data-refresh-history]")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  setBusy(button, true);
  try {
    await loadHistory();
    showStatus("Histórico atualizado.");
  } catch (error) {
    showStatus(error.message || "Não foi possível atualizar o histórico.", true);
  } finally {
    setBusy(button, false);
  }
});

historyList?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-undo-audit]");
  if (!button) return;
  const entry = historyCache.find((item) => String(item.id) === button.dataset.undoAudit);
  if (!entry || entry.undone_at) return;
  if (!window.confirm(`Desfazer “${auditRecordLabel(entry)}”? A operação só continuará se não houver uma alteração mais recente no mesmo registro.`)) return;
  setBusy(button, true);
  const { error } = await client.rpc("undo_admin_change", { p_audit_id: Number(entry.id) });
  setBusy(button, false);
  if (error) return showStatus(error.message, true);
  loadedAdminViews.clear();
  appointmentsCache = [];
  packagesCache = [];
  await loadHistory();
  loadedAdminViews.add("history");
  showStatus("Alteração desfeita com segurança.");
});

document.querySelector("[data-add-rule]")?.addEventListener("click", () => addRuleRow());

rulesList?.addEventListener("click", (event) => {
  const remove = event.target.closest("[data-remove-rule]");
  if (!remove) return;
  remove.closest("[data-rule-row]").remove();
  if (!rulesList.children.length) addRuleRow();
});

document.querySelector("[data-booking-settings-form]")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  const values = new FormData(event.currentTarget);
  const rules = Array.from(rulesList.querySelectorAll("[data-rule-row]")).map((row) => ({
    weekday: Number(row.querySelector('[data-rule-field="weekday"]').value),
    start_time: row.querySelector('[data-rule-field="start_time"]').value,
    end_time: row.querySelector('[data-rule-field="end_time"]').value,
    pause_start_time: row.querySelector('[data-rule-field="pause_start_time"]').value || null,
    pause_end_time: row.querySelector('[data-rule-field="pause_end_time"]').value || null,
    is_active: row.querySelector('[data-rule-field="is_active"]').checked
  }));
  if (rules.some((rule) => !rule.start_time || !rule.end_time || rule.start_time >= rule.end_time)) {
    return showStatus("Revise os horários de início e fim.", true);
  }
  for (const rule of rules) {
    const hasPauseStart = Boolean(rule.pause_start_time);
    const hasPauseEnd = Boolean(rule.pause_end_time);
    if (hasPauseStart !== hasPauseEnd) {
      return showStatus(`Preencha o início e o fim da pausa de ${weekdayLabels[rule.weekday]}.`, true);
    }
    if (hasPauseStart && !(rule.start_time < rule.pause_start_time && rule.pause_start_time < rule.pause_end_time && rule.pause_end_time < rule.end_time)) {
      return showStatus(`A pausa de ${weekdayLabels[rule.weekday]} deve ficar dentro do período de atendimento.`, true);
    }
  }
  for (let index = 0; index < rules.length; index += 1) {
    for (let comparison = index + 1; comparison < rules.length; comparison += 1) {
      const first = rules[index];
      const second = rules[comparison];
      if (first.weekday !== second.weekday) continue;
      if (first.start_time === second.start_time && first.end_time === second.end_time) {
        return showStatus(`Há dois períodos iguais para ${weekdayLabels[first.weekday]}. Remova ou altere um deles.`, true);
      }
      if (first.is_active && second.is_active && first.start_time < second.end_time && second.start_time < first.end_time) {
        return showStatus(`Os períodos de ${weekdayLabels[first.weekday]} estão sobrepostos. Ajuste os horários.`, true);
      }
    }
  }
  const settings = {
    minimum_notice_hours: Number(values.get("minimum_notice_hours")),
    booking_horizon_days: Number(values.get("booking_horizon_days")),
    slot_interval_minutes: Number(values.get("slot_interval_minutes")),
    buffer_minutes: Number(values.get("buffer_minutes")),
    daily_booking_limit: Number(values.get("daily_booking_limit")),
    cancellation_notice_hours: Number(values.get("cancellation_notice_hours")),
    reminder_hours_before: Number(values.get("reminder_hours_before")),
    reminders_enabled: values.get("reminders_enabled") === "on",
    booking_enabled: values.get("booking_enabled") === "on"
  };
  setBusy(button, true);
  const { error: settingsError } = await client.from("booking_settings").update(settings).eq("id", true);
  const { error: rulesError } = settingsError ? { error: settingsError } : await client.rpc("replace_availability_rules", { p_rules: rules });
  setBusy(button, false);
  if (settingsError || rulesError) return showStatus((settingsError || rulesError).message, true);
  showStatus("Disponibilidade salva.");
  await loadBookingSettings();
});

blockedPeriodForm?.elements.all_day.addEventListener("change", (event) => {
  const allDay = event.currentTarget.checked;
  blockedPeriodForm.querySelectorAll("[data-block-time] input").forEach((input) => {
    input.disabled = allDay;
    input.required = !allDay;
  });
});

blockedPeriodForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  const values = new FormData(blockedPeriodForm);
  const period = adminUtils.buildBlockedPeriod({
    startDate: String(values.get("start_date") || ""),
    startTime: String(values.get("start_time") || ""),
    endDate: String(values.get("end_date") || ""),
    endTime: String(values.get("end_time") || ""),
    allDay: blockedPeriodForm.elements.all_day.checked
  });
  if (period.error) return showStatus(period.error, true);
  setBusy(button, true);
  const { error } = await client.from("blocked_periods").insert({
    ...period,
    reason: String(values.get("reason") || "").trim()
  });
  setBusy(button, false);
  if (error) return showStatus(error.message, true);
  const keepDate = blockedPeriodForm.elements.end_date.value;
  blockedPeriodForm.reset();
  blockedPeriodForm.elements.start_date.value = keepDate;
  blockedPeriodForm.elements.end_date.value = keepDate;
  blockedPeriodForm.elements.start_time.value = "08:00";
  blockedPeriodForm.elements.end_time.value = "18:00";
  blockedPeriodForm.querySelectorAll("[data-block-time] input").forEach((input) => {
    input.disabled = false;
    input.required = true;
  });
  showStatus("Bloqueio adicionado. Os horários sobrepostos já estão indisponíveis.");
  await loadBlockedPeriods();
});

blockedPeriodsList?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-block]");
  if (!button) return;
  const item = button.closest("[data-block-id]");
  if (!window.confirm("Remover este bloqueio e liberar novamente os horários?")) return;
  setBusy(button, true);
  const { error } = await client.from("blocked_periods").delete().eq("id", item.dataset.blockId);
  setBusy(button, false);
  if (error) return showStatus(error.message, true);
  showStatus("Bloqueio removido.");
  await loadBlockedPeriods();
});

appointmentsFilter?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  setBusy(button, true);
  try {
    await loadAppointments();
  } catch (error) {
    showStatus(error.message || "Não foi possível carregar os agendamentos.", true);
  } finally {
    setBusy(button, false);
  }
});

appointmentsFilter?.elements.search.addEventListener("input", renderAppointments);

appointmentsList?.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-appointment-admin-form]");
  if (!form) return;
  event.preventDefault();
  const button = event.submitter;
  const values = new FormData(form);
  const update = {
    attendance_status: String(values.get("attendance_status")),
    admin_notes: String(values.get("admin_notes") || "").trim()
  };
  setBusy(button, true);
  const { error } = await client.from("appointments").update(update).eq("id", form.dataset.appointmentId);
  setBusy(button, false);
  if (error) return showStatus(error.message, true);
  const appointment = appointmentsCache.find((item) => item.id === form.dataset.appointmentId);
  if (appointment) Object.assign(appointment, update);
  loadedAdminViews.delete("packages");
  loadedAdminViews.delete("operations-dashboard");
  renderAppointments();
  showStatus("Acompanhamento salvo.");
});

document.querySelector("[data-refresh-operations]")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  setBusy(button, true);
  try {
    await loadOperationsDashboard();
    showStatus("Indicadores atualizados.");
  } catch (error) {
    showStatus(error.message || "Não foi possível atualizar os indicadores.", true);
  } finally {
    setBusy(button, false);
  }
});

document.querySelector("[data-export-appointments]")?.addEventListener("click", () => {
  if (!appointmentsCache.length) return showStatus("Não há agendamentos carregados para exportar.", true);
  const header = ["Data e horário", "Serviço", "Opção escolhida", "Pacote contratado", "Cliente", "E-mail", "WhatsApp", "Origem", "Status", "Comparecimento", "Convite de agenda", "Observações privadas"];
  const rows = appointmentsCache.map((appointment) => [
    adminUtils.formatAppointmentDate(appointment.starts_at, appointment.ends_at),
    appointment.services?.name || "Serviço removido",
    appointment.selected_option_label || "",
    appointment.client_packages?.package_label || "",
    appointment.customer_name,
    appointment.customer_email,
    adminUtils.formatPhone(appointment.customer_phone),
    appointment.booking_source === "admin" ? "Lançamento administrativo" : "Agendamento online",
    adminUtils.appointmentStatusLabel(appointment.status),
    adminUtils.attendanceStatusLabel(appointment.attendance_status),
    appointment.calendar_sync_requested ? "Sim" : "Não",
    appointment.admin_notes || ""
  ]);
  const csv = [header, ...rows].map((row) => row.map(adminUtils.csvCell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `agendamentos-studio-b-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showStatus("Arquivo CSV gerado com os filtros de período e status atuais.");
});

servicesList?.addEventListener("click", async (event) => {
  const editor = event.target.closest("[data-service-id]");
  if (!editor) return;

  if (event.target.closest("[data-add-price]")) {
    addPriceRow(editor.querySelector("[data-prices-list]"));
    return;
  }

  const removePrice = event.target.closest("[data-remove-price]");
  if (removePrice) {
    removePrice.closest("[data-price-row]").remove();
    return;
  }

  const deleteButton = event.target.closest("[data-delete-service]");
  if (deleteButton) {
    const name = editor.querySelector('[name="name"]').value;
    if (!window.confirm(`Excluir o serviço “${name}” e todos os seus valores?`)) return;
    setBusy(deleteButton, true);
    const { error } = await client.from("services").delete().eq("id", editor.dataset.serviceId);
    setBusy(deleteButton, false);
    if (error) return showStatus(error.message, true);
    editor.remove();
    showStatus("Serviço excluído.");
  }
});

const collectPrices = (editor) => Array.from(editor.querySelectorAll("[data-price-row]")).map((row, index) => {
  const value = (name) => row.querySelector(`[data-price-field="${name}"]`);
  return {
    id: row.dataset.priceId || null,
    label: value("label").value.trim(),
    price_amount: value("price_amount").value || null,
    custom_value: value("custom_value").value.trim() || null,
    original_price: value("original_price").value || null,
    is_promotional: value("is_promotional").checked,
    is_active: value("is_active").checked,
    sort_order: index + 1
  };
});

servicesList?.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-service-form]");
  if (!form) return;
  event.preventDefault();
  const editor = form.closest("[data-service-id]");
  const submit = event.submitter;
  const prices = collectPrices(editor);
  const invalidPrice = prices.find((price) => !price.label || (!price.price_amount && !price.custom_value));
  if (invalidPrice) return showStatus("Cada opção precisa de nome e de um valor ou texto alternativo.", true);

  const values = new FormData(form);
  const service = {
    name: String(values.get("name")).trim(),
    subtitle: String(values.get("subtitle")).trim(),
    duration_label: String(values.get("duration_label")).trim(),
    duration_minutes: Number(values.get("duration_minutes")),
    description: String(values.get("description")).trim(),
    whatsapp_message: String(values.get("whatsapp_message")).trim(),
    sort_order: Number(values.get("sort_order")) || 0,
    is_active: values.get("is_active") === "on"
  };

  setBusy(submit, true);
  const { error: serviceError } = await client.from("services").update(service).eq("id", editor.dataset.serviceId);
  const { error: pricesError } = serviceError
    ? { error: serviceError }
    : await client.rpc("replace_service_prices", { p_service_id: editor.dataset.serviceId, p_prices: prices });
  setBusy(submit, false);
  if (serviceError || pricesError) return showStatus((serviceError || pricesError).message, true);
  showStatus("Alterações salvas e publicadas.");
  await loadServices();
});

document.querySelector("[data-add-service]")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  setBusy(button, true);
  const now = Date.now();
  const { data, error } = await client.from("services").insert({
    slug: `novo-servico-${now}`,
    name: "Novo serviço",
    subtitle: "",
    description: "",
    duration_label: "",
    duration_minutes: 60,
    whatsapp_message: "",
    sort_order: servicesList.children.length + 1,
    is_active: false
  }).select().single();
  setBusy(button, false);
  if (error) return showStatus(error.message, true);
  await loadServices();
  const editor = servicesList.querySelector(`[data-service-id="${data.id}"]`);
  if (editor) {
    editor.open = true;
    editor.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  showStatus("Novo serviço criado como oculto. Preencha e salve para publicar.");
});

const processAuthCallback = async () => {
  const url = new URL(window.location.href);
  passwordRecoveryMode = url.searchParams.get("mode") === "reset-password";
  const queryError = url.searchParams.get("error_description");
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  if (hash.get("type") === "recovery") passwordRecoveryMode = true;
  const callbackError = queryError || hash.get("error_description");
  if (callbackError) throw new Error(decodeURIComponent(callbackError.replaceAll("+", " ")));

  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const code = url.searchParams.get("code");
  let result = null;

  if (tokenHash && type) result = await client.auth.verifyOtp({ token_hash: tokenHash, type });
  else if (code) result = await client.auth.exchangeCodeForSession(code);

  if (result?.error) throw result.error;
  if (result) {
    window.history.replaceState({}, document.title, callbackUrl());
    if (passwordRecoveryMode) {
      setView("reset-password");
      showStatus("Link validado. Crie sua nova senha.");
    } else {
      showStatus("E-mail confirmado. Acesso liberado.");
    }
  }
};

if (!client) {
  setView("auth");
  showStatus("A conexão com o Supabase não foi carregada.", true);
} else {
  client.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") passwordRecoveryMode = true;
    setTimeout(() => handleSession(session), 0);
  });
  processAuthCallback()
    .catch((error) => showStatus(`Não foi possível confirmar o e-mail: ${friendlyAuthError(error)}`, true))
    .finally(() => client.auth.getSession().then(({ data }) => handleSession(data.session)));
}
