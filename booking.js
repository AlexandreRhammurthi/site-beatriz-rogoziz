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
const availableDatesContainer = document.querySelector("[data-available-dates]");
const selectedDateCopy = document.querySelector("[data-selected-date]");
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

const selectedService = () => config?.services.find((service) => service.id === serviceSelect.value);

const formatAvailableDate = (dateValue, options) => new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  ...options
}).format(new Date(`${dateValue}T12:00:00Z`));

const validateStep = (step) => {
  const fields = form.querySelectorAll(`[data-step="${step}"] input:not([type="hidden"]), [data-step="${step}"] select`);
  for (const field of fields) {
    if (!field.reportValidity()) return false;
  }
  if (step === 2 && !startsAtInput.value) {
    showStatus("Selecione um dos horários disponíveis.");
    return false;
  }
  if (step === 1 && !dateInput.value) {
    showStatus("Escolha uma das datas disponíveis.");
    return false;
  }
  return true;
};

const loadAvailableDates = async () => {
  dateInput.value = "";
  startsAtInput.value = "";
  selectedDateCopy.textContent = "";
  slotsContainer.innerHTML = '<p class="empty-state">Escolha uma data para consultar os horários.</p>';
  if (!serviceSelect.value) {
    availableDatesContainer.innerHTML = '<p class="empty-state">Escolha um serviço para consultar as próximas datas disponíveis.</p>';
    return;
  }
  availableDatesContainer.innerHTML = '<p class="empty-state">Consultando as próximas datas disponíveis…</p>';
  showStatus();
  try {
    const result = await api("available-dates", { service_id: serviceSelect.value });
    if (!result.dates.length) {
      availableDatesContainer.innerHTML = '<p class="empty-state">Não há datas disponíveis no período atual. Fale com o Studio B pelo WhatsApp para outras possibilidades.</p>';
      return;
    }
    availableDatesContainer.innerHTML = result.dates.map((dateValue) => `
      <button class="available-date" type="button" data-date-value="${dateValue}" aria-pressed="false">
        <span>${escapeHTML(formatAvailableDate(dateValue, { weekday: "short" }).replace(".", ""))}</span>
        <strong>${escapeHTML(formatAvailableDate(dateValue, { day: "2-digit" }))}</strong>
        <small>${escapeHTML(formatAvailableDate(dateValue, { month: "short" }).replace(".", ""))}</small>
      </button>
    `).join("");
  } catch (error) {
    availableDatesContainer.innerHTML = '<p class="empty-state">Não foi possível consultar as datas disponíveis.</p>';
    showStatus(error.message);
  }
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

availableDatesContainer?.addEventListener("click", async (event) => {
  const dateButton = event.target.closest("[data-date-value]");
  if (!dateButton) return;
  availableDatesContainer.querySelectorAll("[data-date-value]").forEach((button) => {
    button.classList.toggle("selected", button === dateButton);
    button.setAttribute("aria-pressed", String(button === dateButton));
  });
  dateInput.value = dateButton.dataset.dateValue;
  selectedDateCopy.textContent = formatAvailableDate(dateInput.value, { dateStyle: "full" });
  await loadSlots();
});

serviceSelect?.addEventListener("change", loadAvailableDates);

form?.addEventListener("click", (event) => {
  const next = event.target.closest("[data-next]");
  const back = event.target.closest("[data-back]");
  if (back) return showStep(Number(back.dataset.back));
  if (!next) return;
  const current = Number(next.closest("[data-step]").dataset.step);
  if (!validateStep(current)) return;
  if (Number(next.dataset.next) === 4) {
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
    const requestedService = new URLSearchParams(window.location.search).get("service");
    if (requestedService && config.services.some((service) => service.id === requestedService)) serviceSelect.value = requestedService;
    form.hidden = false;
    showStep(1);
    if (serviceSelect.value) await loadAvailableDates();
  } catch (error) {
    loading.hidden = true;
    configError.hidden = false;
    showStatus(error.message);
  }
};

init();
