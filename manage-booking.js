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
  details.innerHTML = `<strong>${escapeHTML(appointment.service_name)}</strong><br>${escapeHTML(appointment.date_label)}<br>${escapeHTML(appointment.time_label)}<br>Status: ${escapeHTML(statusLabel)}`;
  appointmentPanel.hidden = false;
  recoveryPanel.hidden = true;
  const cancelButton = document.querySelector("[data-cancel]");
  cancelButton.hidden = appointment.status === "cancelled";
  document.querySelector("[data-open-reschedule]").hidden = appointment.status === "cancelled";
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

document.querySelector("[data-cancel]")?.addEventListener("click", async (event) => {
  if (!window.confirm("Deseja realmente cancelar este agendamento?")) return;
  const button = event.currentTarget;
  setBusy(button, true);
  showStatus();
  try {
    await api("cancel", { token });
    appointmentPanel.hidden = true;
    cancelledPanel.hidden = false;
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
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

recoveryForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  recoveryData = Object.fromEntries(new FormData(recoveryForm));
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
});

codeForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  setBusy(button, true);
  showStatus();
  try {
    const result = await api("recovery-confirm", { ...recoveryData, code: new FormData(codeForm).get("code") });
    window.location.assign(result.manage_url);
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
