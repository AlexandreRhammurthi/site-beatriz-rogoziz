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
let passwordRecoveryMode = false;
let currentAdminView = "home";
const loadedAdminViews = new Set();
const callbackUrl = () => `${window.location.origin}${window.location.pathname}`;

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
  return `
    <article class="appointment-card ${escapeHTML(appointment.status)}">
      <div>
        <p class="appointment-date">${escapeHTML(adminUtils.formatAppointmentDate(appointment.starts_at, appointment.ends_at))}</p>
        <h3>${escapeHTML(serviceName)}</h3>
        <span class="appointment-source">${escapeHTML(sourceLabel)}</span>
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
    .select("id, customer_name, customer_email, customer_phone, starts_at, ends_at, status, attendance_status, admin_notes, calendar_sync_requested, booking_source, services(name)")
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
};

const loadManualBookingForm = async () => {
  if (!manualBookingForm || !adminUtils) return;
  manualBookingConfig = await callBookingApi("admin-config", {}, true);
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
  const start = new Date(slot.dataset.manualStart);
  const label = new Intl.DateTimeFormat("pt-BR", {
    timeZone: manualBookingConfig.timezone,
    dateStyle: "full",
    timeStyle: "short"
  }).format(start);
  manualBookingSummary.innerHTML = `<strong>${escapeHTML(service.name)}</strong><br>${escapeHTML(label)}<br>${Number(service.duration_minutes)} minutos`;
  manualBookingSummary.hidden = false;
};

manualBookingForm?.elements.service_id.addEventListener("change", loadManualBookingSlots);
manualBookingForm?.elements.date.addEventListener("change", loadManualBookingSlots);

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

const loadAdminView = async (view) => {
  if (loadedAdminViews.has(view)) return;
  if (view === "services") await loadServices();
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
  await showAdminView(isFirstEntry ? "home" : currentAdminView, { focus: false });
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
  renderAppointments();
  showStatus("Acompanhamento salvo.");
});

document.querySelector("[data-export-appointments]")?.addEventListener("click", () => {
  if (!appointmentsCache.length) return showStatus("Não há agendamentos carregados para exportar.", true);
  const header = ["Data e horário", "Serviço", "Cliente", "E-mail", "WhatsApp", "Origem", "Status", "Comparecimento", "Convite de agenda", "Observações privadas"];
  const rows = appointmentsCache.map((appointment) => [
    adminUtils.formatAppointmentDate(appointment.starts_at, appointment.ends_at),
    appointment.services?.name || "Serviço removido",
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
