const settings = window.STUDIO_B_SUPABASE || {};
const loading = document.querySelector("[data-loading]");
const appointmentPanel = document.querySelector("[data-appointment]");
const recoveryPanel = document.querySelector("[data-recovery]");
const details = document.querySelector("[data-appointment-details]");
const cancelledPanel = document.querySelector("[data-cancelled]");
const status = document.querySelector("[data-status]");
const recoveryForm = document.querySelector("[data-recovery-form]");
const codeForm = document.querySelector("[data-code-form]");
const rescheduleForm = document.querySelector("[data-reschedule-form]");
const rescheduleSlots = document.querySelector("[data-reschedule-slots]");
const rescheduledPanel = document.querySelector("[data-rescheduled]");
const cancelConfirmForm = document.querySelector("[data-cancel-confirm]");
let token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token") || "";
let recoveryData = null;
let config = null;
let currentAppointment = null;

const escapeHTML = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const api = async (action, data = {}) => {
  const response = await fetch(settings.bookingApiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: settings.publishableKey },
    body: JSON.stringify({ action, ...data })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a solicitação.");
  return payload;
};

const showStatus = (message = "") => { status.textContent = message; };

const setBusy = (button, busy) => {
  if (!button) return;
  button.disabled = busy;
  button.dataset.label ||= button.textContent;
  button.textContent = busy ? "Aguarde…" : button.dataset.label;
};

const brazilDate = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config?.timezone || "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const renderAppointment = (appointment) => {
  currentAppointment = appointment;
  const statusLabel = appointment.status === "cancelled" ? "Cancelado" : "Confirmado";
  const optionValue = appointment.selected_option_price_amount !== null && appointment.selected_option_price_amount !== undefined
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(appointment.selected_option_price_amount))
    : appointment.selected_option_custom_value || "";
  const option = appointment.selected_option_label
    ? `<br>${escapeHTML(appointment.selected_option_label)}${optionValue ? ` — ${escapeHTML(optionValue)}` : ""}`
    : "";
  details.innerHTML = `<strong>${escapeHTML(appointment.service_name)}</strong>${option}<br>${escapeHTML(appointment.date_label)}<br>${escapeHTML(appointment.time_label)}<br>Status: ${escapeHTML(statusLabel)}`;
  const cancelDetails = document.querySelector("[data-cancel-details]");
  if (cancelDetails) cancelDetails.innerHTML = details.innerHTML;
  appointmentPanel.hidden = false;
  recoveryPanel.hidden = true;
  const cancelButton = document.querySelector("[data-open-cancel]");
  cancelButton.hidden = appointment.status === "cancelled";
  document.querySelector("[data-open-reschedule]").hidden = appointment.status === "cancelled";
  document.querySelector("[data-resend-confirmation]").hidden = appointment.status === "cancelled";
};

const loadAppointment = async () => {
  if (!token) return;
  recoveryPanel.hidden = true;
  loading.hidden = false;
  showStatus();
  try {
    const result = await api("manage", { token });
    renderAppointment(result.appointment);
  } catch (error) {
    token = "";
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
    recoveryPanel.hidden = false;
    showStatus(error.message);
  } finally {
    loading.hidden = true;
  }
};

document.querySelector("[data-open-cancel]")?.addEventListener("click", () => {
  appointmentPanel.hidden = true;
  cancelConfirmForm.hidden = false;
  cancelConfirmForm.elements.understood.checked = false;
  cancelConfirmForm.scrollIntoView({ behavior: "smooth", block: "start" });
});

document.querySelector("[data-close-cancel]")?.addEventListener("click", () => {
  cancelConfirmForm.hidden = true;
  appointmentPanel.hidden = false;
  showStatus();
});

cancelConfirmForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  setBusy(button, true);
  showStatus();
  try {
    const result = await api("cancel", { token });
    cancelConfirmForm.hidden = true;
    appointmentPanel.hidden = true;
    cancelledPanel.hidden = false;
    const messages = ["O horário foi liberado."];
    messages.push(result.email_delivered === false
      ? "A confirmação por e-mail não pôde ser enviada; o cancelamento continua válido."
      : "A confirmação foi enviada para seu e-mail.");
    if (result.calendar_updated === false) {
      messages.push("O evento pode continuar visível na sua agenda, mas o atendimento está cancelado no Studio B.");
    }
    document.querySelector("[data-cancelled-copy]").textContent = messages.join(" ");
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
    token = "";
  } catch (error) {
    showStatus(error.message);
  } finally {
    setBusy(button, false);
  }
});

document.querySelector("[data-resend-confirmation]")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  setBusy(button, true);
  showStatus();
  try {
    const result = await api("resend-confirmation", { token });
    showStatus(result.message);
  } catch (error) {
    showStatus(error.message);
  } finally {
    setBusy(button, false);
  }
});

const loadRescheduleSlots = async () => {
  const date = rescheduleForm.elements.date.value;
  rescheduleForm.elements.starts_at.value = "";
  if (!date || !currentAppointment?.service_id) {
    rescheduleSlots.innerHTML = '<p class="empty-state">Escolha uma data para consultar os horários.</p>';
    return;
  }
  rescheduleSlots.innerHTML = '<p class="empty-state">Consultando horários…</p>';
  showStatus();
  try {
    const result = await api("availability", { service_id: currentAppointment.service_id, date });
    if (!result.slots.length) {
      rescheduleSlots.innerHTML = '<p class="empty-state">Não há horários disponíveis nesta data. Escolha outro dia.</p>';
      return;
    }
    rescheduleSlots.innerHTML = result.slots.map((slot) => `<button class="slot" type="button" data-reschedule-start="${escapeHTML(slot.start)}">${escapeHTML(slot.label)}</button>`).join("");
  } catch (error) {
    rescheduleSlots.innerHTML = '<p class="empty-state">Não foi possível consultar esta data.</p>';
    showStatus(error.message);
  }
};

document.querySelector("[data-open-reschedule]")?.addEventListener("click", () => {
  appointmentPanel.hidden = true;
  rescheduledPanel.hidden = true;
  rescheduleForm.hidden = false;
  const today = new Date();
  rescheduleForm.elements.date.min = brazilDate(today);
  rescheduleForm.elements.date.max = brazilDate(new Date(Date.now() + config.booking_horizon_days * 86400000));
  rescheduleForm.elements.date.value = "";
  rescheduleForm.elements.starts_at.value = "";
  rescheduleSlots.innerHTML = '<p class="empty-state">Escolha uma data para consultar os horários.</p>';
  rescheduleForm.scrollIntoView({ behavior: "smooth", block: "start" });
});

document.querySelector("[data-close-reschedule]")?.addEventListener("click", () => {
  rescheduleForm.hidden = true;
  appointmentPanel.hidden = false;
  showStatus();
});

rescheduleForm?.elements.date.addEventListener("change", loadRescheduleSlots);

rescheduleSlots?.addEventListener("click", (event) => {
  const slot = event.target.closest("[data-reschedule-start]");
  if (!slot) return;
  rescheduleSlots.querySelectorAll(".slot").forEach((button) => button.classList.toggle("selected", button === slot));
  rescheduleForm.elements.starts_at.value = slot.dataset.rescheduleStart;
  showStatus();
});

rescheduleForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!rescheduleForm.elements.starts_at.value) {
    showStatus("Selecione um dos horários disponíveis.");
    return;
  }
  if (!window.confirm("Confirmar a alteração para o novo horário selecionado?")) return;
  const button = event.submitter;
  setBusy(button, true);
  showStatus();
  try {
    const result = await api("reschedule", { token, starts_at: rescheduleForm.elements.starts_at.value });
    rescheduleForm.hidden = true;
    rescheduledPanel.hidden = false;
    renderAppointment(result.appointment);
    showStatus(result.email_delivered ? "Enviamos a nova confirmação para seu e-mail." : "Horário atualizado. Guarde seu link de gerenciamento.");
  } catch (error) {
    showStatus(error.message);
  } finally {
    setBusy(button, false);
  }
});

const requestRecoveryCode = async (button, { refreshData = false } = {}) => {
  if (refreshData) recoveryData = Object.fromEntries(new FormData(recoveryForm));
  setBusy(button, true);
  showStatus();
  try {
    const result = await api("recovery-request", recoveryData);
    codeForm.hidden = false;
    recoveryForm.hidden = true;
    showStatus(result.message);
  } catch (error) {
    showStatus(error.message);
  } finally {
    setBusy(button, false);
  }
};

recoveryForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await requestRecoveryCode(event.submitter, { refreshData: true });
});

document.querySelector("[data-recovery-back]")?.addEventListener("click", () => {
  codeForm.hidden = true;
  recoveryForm.hidden = false;
  codeForm.reset();
  showStatus();
});

document.querySelector("[data-resend-code]")?.addEventListener("click", async (event) => {
  if (!recoveryData) return;
  codeForm.reset();
  await requestRecoveryCode(event.currentTarget);
});

codeForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  setBusy(button, true);
  showStatus();
  try {
    const result = await api("recovery-confirm", { ...recoveryData, code: new FormData(codeForm).get("code") });
    token = new URL(result.manage_url).hash.replace(/^#token=/, "");
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}#token=${encodeURIComponent(token)}`);
    codeForm.hidden = true;
    recoveryPanel.hidden = true;
    await loadAppointment();
    showStatus(result.email_delivered
      ? "Acesso recuperado. Também enviamos seu novo link por e-mail."
      : "Acesso recuperado. Guarde o link desta página para retornar depois.");
  } catch (error) {
    showStatus(error.message);
  } finally {
    setBusy(button, false);
  }
});

const init = async () => {
  try {
    config = await api("config");
  } catch (error) {
    showStatus(error.message);
  }
  if (token) loadAppointment();
  else recoveryPanel.hidden = false;
};

init();
