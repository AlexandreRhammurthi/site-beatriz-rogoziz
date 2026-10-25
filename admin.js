const client = window.createStudioSupabaseClient?.();
const authPanel = document.querySelector("[data-auth-panel]");
const claimPanel = document.querySelector("[data-claim-panel]");
const dashboard = document.querySelector("[data-dashboard]");
const logoutButton = document.querySelector("[data-logout]");
const servicesList = document.querySelector("[data-services-list]");
const statusElement = document.querySelector("[data-status]");
const priceTemplate = document.querySelector("#price-row-template");

const escapeHTML = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

let statusTimer;
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

const showDashboard = async () => {
  setView("dashboard");
  await loadServices();
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
  if (error) showStatus(error.message, true);
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
    options: { emailRedirectTo: window.location.href.split("#")[0].split("?")[0] }
  });
  setBusy(button, false);
  if (error) return showStatus(error.message, true);
  if (!data.session) showStatus("Conta criada. Confirme o e-mail e depois entre no painel.");
  else showStatus("Conta criada. Agora informe o código de ativação.");
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

if (!client) {
  setView("auth");
  showStatus("A conexão com o Supabase não foi carregada.", true);
} else {
  client.auth.onAuthStateChange((_event, session) => setTimeout(() => handleSession(session), 0));
  client.auth.getSession().then(({ data }) => handleSession(data.session));
}
