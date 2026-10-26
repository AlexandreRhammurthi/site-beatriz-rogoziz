const settings = window.STUDIO_B_SUPABASE || {};
const form = document.querySelector("[data-booking-form]");
const loading = document.querySelector("[data-loading]");
const configError = document.querySelector("[data-config-error]");
const status = document.querySelector("[data-status]");
const success = document.querySelector("[data-success]");
const serviceSelect = form?.elements.service_id;
const dateInput = form?.elements.date;
const startsAtInput = form?.elements.starts_at;
const slotsContainer = document.querySelector("[data-slots]");
const summary = document.querySelector("[data-summary]");
let config = null;

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
  if (!response.ok) throw new Error(payload.error || "Não foi possível consultar a agenda.");
  return payload;
};

const showStatus = (message = "") => { status.textContent = message; };

const setBusy = (button, busy) => {
  if (!button) return;
  button.disabled = busy;
  button.dataset.label ||= button.textContent;
  button.textContent = busy ? "Aguarde…" : button.dataset.label;
};

const showStep = (step) => {
  form.querySelectorAll("[data-step]").forEach((fieldset) => { fieldset.hidden = fieldset.dataset.step !== String(step); });
  document.querySelectorAll("[data-step-marker]").forEach((marker) => marker.classList.toggle("active", Number(marker.dataset.stepMarker) <= step));
  showStatus();
  document.querySelector(".booking-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const brazilDate = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: config?.timezone || "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const selectedService = () => config?.services.find((service) => service.id === serviceSelect.value);

const validateStep = (step) => {
  const fields = form.querySelectorAll(`[data-step="${step}"] input:not([type="hidden"]), [data-step="${step}"] select`);
  for (const field of fields) {
    if (!field.reportValidity()) return false;
  }
  if (step === 2 && !startsAtInput.value) {
    showStatus("Selecione um dos horários disponíveis.");
    return false;
  }
  return true;
};

const loadSlots = async () => {
  startsAtInput.value = "";
  if (!serviceSelect.value || !dateInput.value) {
    slotsContainer.innerHTML = '<p class="empty-state">Escolha uma data para consultar os horários.</p>';
    return;
  }
  slotsContainer.innerHTML = '<p class="empty-state">Consultando horários…</p>';
  showStatus();
  try {
    const result = await api("availability", { service_id: serviceSelect.value, date: dateInput.value });
    if (!result.slots.length) {
      slotsContainer.innerHTML = '<p class="empty-state">Não há horários disponíveis nesta data. Escolha outro dia.</p>';
      return;
    }
    slotsContainer.innerHTML = result.slots.map((slot) => `<button class="slot" type="button" data-start="${slot.start}">${slot.label}</button>`).join("");
  } catch (error) {
    slotsContainer.innerHTML = '<p class="empty-state">Não foi possível consultar esta data.</p>';
    showStatus(error.message);
  }
};

slotsContainer?.addEventListener("click", (event) => {
  const slot = event.target.closest("[data-start]");
  if (!slot) return;
  slotsContainer.querySelectorAll(".slot").forEach((button) => button.classList.toggle("selected", button === slot));
  startsAtInput.value = slot.dataset.start;
  showStatus();
});

dateInput?.addEventListener("change", loadSlots);
serviceSelect?.addEventListener("change", () => { if (dateInput.value) loadSlots(); });

form?.addEventListener("click", (event) => {
  const next = event.target.closest("[data-next]");
  const back = event.target.closest("[data-back]");
  if (back) return showStep(Number(back.dataset.back));
  if (!next) return;
  const current = Number(next.closest("[data-step]").dataset.step);
  if (!validateStep(current)) return;
  if (Number(next.dataset.next) === 3) {
    const service = selectedService();
    const start = new Date(startsAtInput.value);
    summary.innerHTML = `<strong>${escapeHTML(service.name)}</strong><br>${escapeHTML(new Intl.DateTimeFormat("pt-BR", { timeZone: config.timezone, dateStyle: "full", timeStyle: "short" }).format(start))}<br>${Number(service.duration_minutes)} minutos`;
  }
  showStep(Number(next.dataset.next));
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateStep(3)) return;
  const button = event.submitter;
  const data = new FormData(form);
  setBusy(button, true);
  showStatus();
  try {
    const result = await api("create", {
      name: data.get("name"),
      phone: data.get("phone"),
      email: data.get("email"),
      service_id: data.get("service_id"),
      starts_at: data.get("starts_at"),
      sync_calendar: data.get("sync_calendar") === "yes"
    });
    form.hidden = true;
    success.hidden = false;
    document.querySelector("[data-success-copy]").textContent = result.email_delivered
      ? "Enviamos os detalhes e o link seguro de gerenciamento para seu e-mail."
      : "Seu horário foi reservado. Guarde o link seguro abaixo para gerenciar o agendamento.";
    document.querySelector("[data-manage-link]").href = result.manage_url;
    success.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    showStatus(error.message);
  } finally {
    setBusy(button, false);
  }
});

const init = async () => {
  try {
    config = await api("config");
    loading.hidden = true;
    if (!config.enabled) {
      configError.hidden = false;
      return;
    }
    serviceSelect.insertAdjacentHTML("beforeend", config.services.map((service) => `<option value="${escapeHTML(service.id)}">${escapeHTML(service.name)} — ${Number(service.duration_minutes)} min</option>`).join(""));
    const today = new Date();
    const max = new Date(Date.now() + config.booking_horizon_days * 86400000);
    dateInput.min = brazilDate(today);
    dateInput.max = brazilDate(max);
    const requestedService = new URLSearchParams(window.location.search).get("service");
    if (requestedService && config.services.some((service) => service.id === requestedService)) serviceSelect.value = requestedService;
    form.hidden = false;
    showStep(1);
  } catch (error) {
    loading.hidden = true;
    configError.hidden = false;
    showStatus(error.message);
  }
};

init();
