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

const escapeHTML = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

let statusTimer;
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
  ["minimum_notice_hours", "booking_horizon_days", "slot_interval_minutes", "cancellation_notice_hours"].forEach((name) => {
    form.elements[name].value = settings[name];
  });
  form.elements.booking_enabled.checked = settings.booking_enabled;
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

const showDashboard = async () => {
  setView("dashboard");
  await Promise.all([loadServices(), loadBookingSettings()]);
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
    is_active: row.querySelector('[data-rule-field="is_active"]').checked
  }));
  if (rules.some((rule) => !rule.start_time || !rule.end_time || rule.start_time >= rule.end_time)) {
    return showStatus("Revise os horários de início e fim.", true);
  }
  const settings = {
    minimum_notice_hours: Number(values.get("minimum_notice_hours")),
    booking_horizon_days: Number(values.get("booking_horizon_days")),
    slot_interval_minutes: Number(values.get("slot_interval_minutes")),
    cancellation_notice_hours: Number(values.get("cancellation_notice_hours")),
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
