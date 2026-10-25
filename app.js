const studio = window.STUDIO_B || {};

const escapeHTML = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const parseFallbackPrice = (value) => {
  const text = String(value || "").trim();
  if (!text.startsWith("R$")) return { custom_value: text };
  const number = Number(text.replace("R$", "").replaceAll(".", "").replace(",", ".").trim());
  return Number.isFinite(number) ? { price_amount: number } : { custom_value: text };
};

const normalizeOption = (option, index) => {
  if (Array.isArray(option)) {
    const [label, value] = option;
    return {
      label,
      ...parseFallbackPrice(value),
      is_promotional: String(label).toLowerCase().includes("promocional"),
      sort_order: index
    };
  }
  return { ...option, sort_order: option.sort_order ?? index };
};

const normalizeService = (service, index) => ({
  ...service,
  number: service.number || String(index + 1).padStart(2, "0"),
  duration: service.duration ?? service.duration_label ?? "",
  options: (service.options || []).map(normalizeOption)
});

let services = (Array.isArray(studio.services) ? studio.services : []).map(normalizeService);
const servicesContainer = document.querySelector("[data-services]");
const menuCardContainer = document.querySelector("[data-menu-card]");

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add("visible");
    observer.unobserve(entry.target);
  });
}, { threshold: 0.12 });

const observeReveals = () => {
  document.querySelectorAll(".reveal:not(.visible)").forEach((element) => observer.observe(element));
};

const optionValue = (option) => {
  if (option.price_amount !== null && option.price_amount !== undefined && option.price_amount !== "") {
    return currencyFormatter.format(Number(option.price_amount));
  }
  return option.custom_value || "A consultar";
};

const renderPrice = (option) => `
  <div class="menu-card-price-row">
    <span class="menu-card-price-label">
      ${escapeHTML(option.label)}
      ${option.is_promotional ? '<small class="promo-badge">Promocional</small>' : ""}
    </span>
    <span class="menu-card-dots" aria-hidden="true"></span>
    <span class="menu-card-price-value">
      ${option.is_promotional && option.original_price ? `<s>${escapeHTML(currencyFormatter.format(Number(option.original_price)))}</s>` : ""}
      <strong>${escapeHTML(optionValue(option))}</strong>
    </span>
  </div>
`;

const renderServices = () => {
  if (!servicesContainer) return;
  servicesContainer.innerHTML = services.map((service, index) => `
    <article class="service-card reveal">
      <div class="service-top">
        <span class="service-number">${escapeHTML(service.number)}</span>
        <button class="service-book" type="button" data-booking data-service-index="${index}" data-service-name="${escapeHTML(service.name)}" aria-label="Agendar ${escapeHTML(service.name)}">Agendar <span>↗</span></button>
      </div>
      <div class="service-content">
        <h3>${escapeHTML(service.name)}</h3>
        <p class="service-subtitle">${escapeHTML(service.subtitle)}</p>
        <p class="service-duration">${service.duration ? escapeHTML(service.duration) : "&nbsp;"}</p>
        ${service.description ? `<p class="service-description">${escapeHTML(service.description)}</p>` : ""}
      </div>
      <div class="service-card-footer">
        <a href="#menu-cuidados" class="service-view-prices">Consultar valores no Menu <span>↘</span></a>
      </div>
    </article>
  `).join("");
  observeReveals();
};

const renderMenu = () => {
  if (!menuCardContainer) return;
  menuCardContainer.innerHTML = `
    <div class="menu-card-frame">
      <div class="menu-card-header">
        <span class="gold-rule-small" aria-hidden="true"></span>
        <h3>MENU DE CUIDADOS</h3>
        <span class="gold-rule-small" aria-hidden="true"></span>
      </div>
      ${services.map((service, index) => `
        ${index > 0 ? '<div class="menu-card-diamond" aria-hidden="true"><span>◆</span></div>' : ""}
        <div class="menu-card-item">
          <h4>${escapeHTML(service.name)}</h4>
          <p class="menu-card-subtitle">${escapeHTML(service.subtitle)}</p>
          ${service.duration ? `<p class="menu-card-duration">${escapeHTML(service.duration)}</p>` : ""}
          <div class="menu-card-prices">
            ${(service.options || []).map(renderPrice).join("")}
          </div>
        </div>
      `).join("")}
      <div class="menu-card-footer">
        <span class="gold-rule-small" aria-hidden="true"></span>
        <p>Agendamentos mediante disponibilidade</p>
        <span class="gold-rule-small" aria-hidden="true"></span>
      </div>
    </div>
  `;
};

const updateStructuredData = () => {
  const script = document.querySelector('script[type="application/ld+json"]');
  if (!script) return;
  try {
    const data = JSON.parse(script.textContent);
    data.hasOfferCatalog = {
      "@type": "OfferCatalog",
      name: "Menu de Cuidados Studio B",
      itemListElement: services.map((service) => {
        const firstPrice = service.options.find((option) => option.price_amount !== null && option.price_amount !== undefined);
        return {
          "@type": "Offer",
          itemOffered: {
            "@type": "Service",
            name: service.name,
            description: service.description
          },
          ...(firstPrice ? { price: Number(firstPrice.price_amount).toFixed(2), priceCurrency: "BRL" } : {})
        };
      })
    };
    script.textContent = JSON.stringify(data);
  } catch (error) {
    console.warn("Não foi possível atualizar os dados estruturados.", error);
  }
};

const renderContent = () => {
  renderServices();
  renderMenu();
  updateStructuredData();
};

renderContent();

const loadServicesFromSupabase = async () => {
  const client = window.createStudioSupabaseClient?.();
  if (!client) return;

  const [{ data: remoteServices, error: servicesError }, { data: remotePrices, error: pricesError }] = await Promise.all([
    client.from("services").select("*").eq("is_active", true).order("sort_order"),
    client.from("service_prices").select("*").eq("is_active", true).order("sort_order")
  ]);

  if (servicesError || pricesError) {
    console.warn("Não foi possível atualizar o menu pelo Supabase; usando os dados locais.", servicesError || pricesError);
    return;
  }

  if (!remoteServices?.length) return;
  services = remoteServices.map((service, index) => normalizeService({
    ...service,
    options: (remotePrices || []).filter((price) => price.service_id === service.id)
  }, index));
  renderContent();
};

loadServicesFromSupabase().catch((error) => {
  console.warn("Não foi possível conectar ao Supabase; usando os dados locais.", error);
});

const header = document.querySelector("[data-header]");
const fab = document.querySelector("[data-fab]");
const heroEl = document.querySelector("#inicio");
const menuToggle = document.querySelector("[data-menu-toggle]");
const backToTop = document.querySelector("[data-back-to-top]");
const nav = document.querySelector("[data-nav]");

const closeMenu = () => {
  menuToggle?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("nav-open");
};

const onScrollAll = () => {
  const scrollY = window.scrollY;
  header?.classList.toggle("scrolled", scrollY > 32);
  fab?.classList.toggle("visible", scrollY > 380);

  if (heroEl) {
    const firstSectionAtTop = heroEl.getBoundingClientRect().top >= -12;
    document.body.classList.toggle("past-hero", !firstSectionAtTop);
  }

  if (document.body.classList.contains("nav-open")) closeMenu();
};

onScrollAll();
window.addEventListener("scroll", onScrollAll, { passive: true });

menuToggle?.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!open));
  document.body.classList.toggle("nav-open", !open);
});

backToTop?.addEventListener("click", () => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  closeMenu();
});

nav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
observeReveals();

const feedback = document.querySelector("[data-booking-feedback]");
document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-booking]");
  if (!trigger) return;

  const number = String(studio.whatsappNumber || "").replace(/\D/g, "");
  if (!number) {
    document.querySelector("#agendamento")?.scrollIntoView({ behavior: "smooth" });
    if (feedback) feedback.textContent = "O número de WhatsApp ainda não foi configurado.";
    closeMenu();
    return;
  }

  if (trigger.tagName === "A") event.preventDefault();

  const serviceIndex = trigger.getAttribute("data-service-index");
  const service = serviceIndex !== null && services[serviceIndex] ? services[serviceIndex] : null;
  let message = service?.whatsapp_message || service?.whatsappMessage || studio.whatsappMessage || "Olá! Gostaria de consultar os horários disponíveis com Beatriz Rogoziz no Studio B.";
  if (!service?.whatsapp_message && !service?.whatsappMessage && service?.name) {
    message = `Olá! Gostaria de consultar os horários disponíveis para ${service.name} com Beatriz Rogoziz no Studio B.`;
  }
  window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
});

const year = document.querySelector("[data-year]");
if (year) year.textContent = new Date().getFullYear();

const video = document.querySelector(".hero-video");
video?.play().catch(() => document.querySelector(".hero")?.classList.add("video-paused"));
