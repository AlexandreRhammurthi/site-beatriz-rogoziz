const studio = window.STUDIO_B || {};

const escapeHTML = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const servicesContainer = document.querySelector("[data-services]");
const services = Array.isArray(studio.services) ? studio.services : [];

if (servicesContainer) {
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
}

const menuCardContainer = document.querySelector("[data-menu-card]");
if (menuCardContainer) {
  menuCardContainer.innerHTML = `
    <div class="menu-card-frame">
      <div class="menu-card-header">
        <span class="gold-rule-small" aria-hidden="true"></span>
        <h3>MENU DE CUIDADOS</h3>
        <span class="gold-rule-small" aria-hidden="true"></span>
      </div>
      ${services.map((service, index) => `
        ${index > 0 ? `<div class="menu-card-diamond" aria-hidden="true"><span>◆</span></div>` : ""}
        <div class="menu-card-item">
          <h4>${escapeHTML(service.name)}</h4>
          <p class="menu-card-subtitle">${escapeHTML(service.subtitle)}</p>
          ${service.duration ? `<p class="menu-card-duration">${escapeHTML(service.duration)}</p>` : ""}
          <div class="menu-card-prices">
            ${(service.options || []).map(([label, price]) => `
              <div class="menu-card-price-row">
                <span>${escapeHTML(label)}</span>
                <span class="menu-card-dots" aria-hidden="true"></span>
                <strong>${escapeHTML(price)}</strong>
              </div>
            `).join("")}
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
}

const header = document.querySelector("[data-header]");
const onScroll = () => header?.classList.toggle("scrolled", window.scrollY > 32);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

const fab = document.querySelector("[data-fab]");
const onScrollFab = () => fab?.classList.toggle("visible", window.scrollY > 380);
onScrollFab();
window.addEventListener("scroll", onScrollFab, { passive: true });

const menuToggle = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");

const closeMenu = () => {
  menuToggle?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("nav-open");
};

menuToggle?.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!open));
  document.body.classList.toggle("nav-open", !open);
});

nav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add("visible");
    observer.unobserve(entry.target);
  });
}, { threshold: 0.12 });

document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

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

  if (trigger.tagName === "A") {
    event.preventDefault();
  }

  const serviceIndex = trigger.getAttribute("data-service-index");
  const service = serviceIndex !== null && services[serviceIndex] ? services[serviceIndex] : null;
  let message = service?.whatsappMessage || studio.whatsappMessage || "Olá! Gostaria de consultar os horários disponíveis com Beatriz Rogoziz no Studio B.";
  if (!service?.whatsappMessage && service?.name) {
    message = `Olá! Gostaria de consultar os horários disponíveis para ${service.name} com Beatriz Rogoziz no Studio B.`;
  }
  const messageParam = encodeURIComponent(message);
  window.open(`https://wa.me/${number}?text=${messageParam}`, "_blank", "noopener,noreferrer");
});

document.querySelector("[data-year]").textContent = new Date().getFullYear();

const video = document.querySelector(".hero-video");
video?.play().catch(() => document.querySelector(".hero")?.classList.add("video-paused"));


