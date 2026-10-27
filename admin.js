const client = window.createStudioSupabaseClient?.();
const authPanel = document.querySelector("[data-auth-panel]");
const claimPanel = document.querySelector("[data-claim-panel]");
const dashboard = document.querySelector("[data-dashboard]");
const logoutButton = document.querySelector("[data-logout]");
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
  claimPanel.hidden = view !== "claim";
  dashboard.hidden = view !== "dashboard";
  logoutButton.hidden = view === "auth";
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
  return `
    <article class="appointment-card ${escapeHTML(appointment.status)}">
      <div>
        <p class="appointment-date">${escapeHTML(adminUtils.formatAppointmentDate(appointment.starts_at, appointment.ends_at))}</p>
        <h3>${escapeHTML(serviceName)}</h3>
      </div>
      <div class="appointment-customer">
        <strong>${escapeHTML(appointment.customer_name)}</strong>
        <a href="mailto:${encodeURIComponent(appointment.customer_email)}">${escapeHTML(appointment.customer_email)}</a>
        <a href="tel:+${escapeHTML(appointment.customer_phone)}">${escapeHTML(phone)}</a>
      </div>
      <div class="appointment-meta">
        <p>${escapeHTML(syncLabel)}</p>
        <span class="appointment-status ${escapeHTML(appointment.status)}">${escapeHTML(statusLabel)}</span>
      </div>
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
    .select("id, customer_name, customer_email, customer_phone, starts_at, ends_at, status, calendar_sync_requested, services(name)")
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

const showDashboard = async () => {
  setView("dashboard");
  await Promise.all([loadServices(), loadBookingSettings(), loadBlockedPeriods(), loadAppointments()]);
};

const handleSession = async (session) => {
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

document.querySelector("[data-toggle-password]")?.addEventListener("click", (event) => {
  const button = event.currentTarget;
  const input = button.closest(".password-control").querySelector("input");
  const willShow = input.type === "password";
  input.type = willShow ? "text" : "password";
  button.textContent = willShow ? "Ocultar" : "Mostrar";
  button.setAttribute("aria-label", willShow ? "Ocultar senha" : "Mostrar senha");
  button.setAttribute("aria-pressed", String(willShow));
});

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
  setView("auth");
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

document.querySelector("[data-export-appointments]")?.addEventListener("click", () => {
  if (!appointmentsCache.length) return showStatus("Não há agendamentos carregados para exportar.", true);
  const header = ["Data e horário", "Serviço", "Cliente", "E-mail", "WhatsApp", "Status", "Convite de agenda"];
  const rows = appointmentsCache.map((appointment) => [
    adminUtils.formatAppointmentDate(appointment.starts_at, appointment.ends_at),
    appointment.services?.name || "Serviço removido",
    appointment.customer_name,
    appointment.customer_email,
    adminUtils.formatPhone(appointment.customer_phone),
    adminUtils.appointmentStatusLabel(appointment.status),
    appointment.calendar_sync_requested ? "Sim" : "Não"
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
  const queryError = url.searchParams.get("error_description");
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
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
    showStatus("E-mail confirmado. Acesso liberado.");
  }
};

if (!client) {
  setView("auth");
  showStatus("A conexão com o Supabase não foi carregada.", true);
} else {
  client.auth.onAuthStateChange((_event, session) => setTimeout(() => handleSession(session), 0));
  processAuthCallback()
    .catch((error) => showStatus(`Não foi possível confirmar o e-mail: ${friendlyAuthError(error)}`, true))
    .finally(() => client.auth.getSession().then(({ data }) => handleSession(data.session)));
}
