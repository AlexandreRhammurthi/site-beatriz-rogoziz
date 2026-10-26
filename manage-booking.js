const settings = window.STUDIO_B_SUPABASE || {};
const loading = document.querySelector("[data-loading]");
const appointmentPanel = document.querySelector("[data-appointment]");
const recoveryPanel = document.querySelector("[data-recovery]");
const details = document.querySelector("[data-appointment-details]");
const cancelledPanel = document.querySelector("[data-cancelled]");
const status = document.querySelector("[data-status]");
const recoveryForm = document.querySelector("[data-recovery-form]");
const codeForm = document.querySelector("[data-code-form]");
let token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token") || "";
let recoveryData = null;

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

const renderAppointment = (appointment) => {
  const statusLabel = appointment.status === "cancelled" ? "Cancelado" : "Confirmado";
  details.innerHTML = `<strong>${escapeHTML(appointment.service_name)}</strong><br>${escapeHTML(appointment.date_label)}<br>${escapeHTML(appointment.time_label)}<br>Status: ${escapeHTML(statusLabel)}`;
  appointmentPanel.hidden = false;
  recoveryPanel.hidden = true;
  const cancelButton = document.querySelector("[data-cancel]");
  cancelButton.hidden = appointment.status === "cancelled";
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

if (token) loadAppointment();
else recoveryPanel.hidden = false;
