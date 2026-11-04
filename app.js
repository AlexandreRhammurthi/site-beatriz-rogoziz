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
let onlineBookingEnabled = false;
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

const loadBookingConfig = async () => {
  const settings = window.STUDIO_B_SUPABASE;
  if (!settings?.bookingApiUrl || !settings?.publishableKey) return;
  const response = await fetch(settings.bookingApiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: settings.publishableKey },
    body: JSON.stringify({ action: "config" })
  });
  if (!response.ok) return;
  const config = await response.json();
  onlineBookingEnabled = config.enabled === true;
  if (onlineBookingEnabled) {
    document.querySelectorAll("[data-booking]").forEach((element) => {
      element.setAttribute("aria-label", "Abrir agendamento online do Studio B");
    });
  }
};

loadBookingConfig().catch((error) => console.warn("Agendamento online indisponível.", error));

const galleryTrack = document.querySelector("[data-gallery-track]");
const galleryViewport = document.querySelector("[data-gallery-viewport]");
const galleryPrev = document.querySelector("[data-gallery-prev]");
const galleryNext = document.querySelector("[data-gallery-next]");
const galleryDots = document.querySelector("[data-gallery-dots]");
const galleryStatus = document.querySelector("[data-gallery-status]");
const instagram = studio.instagram || {};

const safeGalleryImage = (value) => {
  try {
    const url = new URL(String(value || ""), window.location.href);
    const allowedRemote = url.hostname.endsWith(".cdninstagram.com") || url.hostname.endsWith(".fbcdn.net");
    return url.origin === window.location.origin || allowedRemote ? url.href : "";
  } catch {
    return "";
  }
};

const safeInstagramLink = (value) => {
  try {
    const url = new URL(String(value || instagram.profileUrl || "https://www.instagram.com/"));
    const instagramHost = url.hostname === "instagram.com" || url.hostname === "www.instagram.com";
    return url.protocol === "https:" && instagramHost ? url.href : instagram.profileUrl;
  } catch {
    return instagram.profileUrl || "https://www.instagram.com/";
  }
};

const galleryFallbackPosts = (Array.isArray(instagram.fallbackPosts) ? instagram.fallbackPosts : [])
  .map((post) => ({
    image_url: safeGalleryImage(post.image),
    caption: String(post.caption || "Studio B — Beatriz Rogoziz"),
    permalink: safeInstagramLink(instagram.profileUrl),
    media_type: "IMAGE"
  }))
  .filter((post) => post.image_url);

const normalizeGalleryPost = (post) => {
  const imageUrl = safeGalleryImage(post.thumbnail_url || post.media_url || post.image_url);
  if (!imageUrl) return null;
  return {
    id: String(post.id || ""),
    image_url: imageUrl,
    caption: String(post.caption || "Uma publicação do Studio B no Instagram").trim(),
    permalink: safeInstagramLink(post.permalink),
    media_type: String(post.media_type || "IMAGE").toUpperCase(),
    timestamp: post.timestamp ? String(post.timestamp) : ""
  };
};

let galleryPosts = [];
let galleryFrame = 0;

const galleryMetaLabel = (post) => {
  if (!post.timestamp) return "Ver no Instagram";
  const date = new Date(post.timestamp);
  if (Number.isNaN(date.getTime())) return "Ver no Instagram";
  return `${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date)} · Ver no Instagram`;
};

const updateGalleryPosition = () => {
  if (!galleryViewport || !galleryTrack || !galleryPosts.length) return;
  const cards = [...galleryTrack.children];
  const firstCard = cards[0];
  const styles = window.getComputedStyle(galleryTrack);
  const step = (firstCard?.getBoundingClientRect().width || galleryViewport.clientWidth) + (Number.parseFloat(styles.columnGap) || 0);
  const activeIndex = Math.min(galleryPosts.length - 1, Math.max(0, Math.round(galleryViewport.scrollLeft / Math.max(step, 1))));
  galleryDots?.querySelectorAll(".gallery-dot").forEach((dot, index) => {
    const active = index === activeIndex;
    dot.classList.toggle("active", active);
    dot.setAttribute("aria-current", active ? "true" : "false");
  });
  galleryPrev && (galleryPrev.disabled = galleryViewport.scrollLeft <= 4);
  galleryNext && (galleryNext.disabled = galleryViewport.scrollLeft >= galleryViewport.scrollWidth - galleryViewport.clientWidth - 4);
};

const scrollGallery = (direction) => {
  if (!galleryViewport || !galleryTrack) return;
  const firstCard = galleryTrack.firstElementChild;
  const gap = Number.parseFloat(window.getComputedStyle(galleryTrack).columnGap) || 0;
  const distance = (firstCard?.getBoundingClientRect().width || galleryViewport.clientWidth) + gap;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  galleryViewport.scrollBy({ left: direction * distance, behavior: reducedMotion ? "auto" : "smooth" });
};

const renderGallery = (posts, live = false) => {
  if (!galleryTrack || !galleryViewport) return;
  galleryPosts = posts.map(normalizeGalleryPost).filter(Boolean).slice(0, 12);
  if (!galleryPosts.length) return;

  galleryTrack.innerHTML = galleryPosts.map((post, index) => {
    const mediaLabel = post.media_type === "VIDEO" ? "Vídeo" : post.media_type === "CAROUSEL_ALBUM" ? "Álbum" : "Publicação";
    return `
      <article class="gallery-card" aria-label="${escapeHTML(mediaLabel)} ${index + 1} de ${galleryPosts.length}">
        <img src="${escapeHTML(post.image_url)}" alt="${escapeHTML(post.caption.slice(0, 120))}" width="720" height="900" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
        <a class="gallery-card-link" href="${escapeHTML(post.permalink)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir ${escapeHTML(mediaLabel.toLowerCase())} no Instagram: ${escapeHTML(post.caption.slice(0, 100))}">
          <span class="gallery-card-top">
            <span class="gallery-card-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4.25"></circle><circle cx="17.4" cy="6.7" r="1"></circle></svg>
            </span>
          </span>
          <span class="gallery-card-copy">
            <span class="gallery-card-caption">${escapeHTML(post.caption)}</span>
            <span class="gallery-card-meta">${escapeHTML(galleryMetaLabel(post))}</span>
          </span>
        </a>
      </article>
    `;
  }).join("");

  if (galleryDots) {
    galleryDots.innerHTML = galleryPosts.map((_, index) => `<button class="gallery-dot${index === 0 ? " active" : ""}" type="button" aria-label="Ir para a publicação ${index + 1}" aria-current="${index === 0 ? "true" : "false"}" data-gallery-index="${index}"></button>`).join("");
  }
  if (galleryStatus) galleryStatus.textContent = live ? "Publicações recentes do Instagram." : "Destaques do Studio B — acompanhe todas as publicações no Instagram.";
  galleryViewport.scrollLeft = 0;
  window.requestAnimationFrame(updateGalleryPosition);
};

const loadInstagramGallery = async () => {
  if (galleryFallbackPosts.length) renderGallery(galleryFallbackPosts, false);
  const settings = window.STUDIO_B_SUPABASE;
  if (!settings?.instagramFeedUrl || !settings?.publishableKey) return;
  try {
    const response = await fetch(settings.instagramFeedUrl, {
      headers: { apikey: settings.publishableKey, Accept: "application/json" },
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) return;
    const result = await response.json();
    const remotePosts = Array.isArray(result.items) ? result.items.slice(0, 12) : [];
    if (result.connected && remotePosts.length) renderGallery(remotePosts, true);
  } catch (error) {
    console.info("Galeria real indisponível; mantendo as imagens locais.");
  }
};

galleryPrev?.addEventListener("click", () => scrollGallery(-1));
galleryNext?.addEventListener("click", () => scrollGallery(1));
galleryViewport?.addEventListener("scroll", () => {
  window.cancelAnimationFrame(galleryFrame);
  galleryFrame = window.requestAnimationFrame(updateGalleryPosition);
}, { passive: true });
galleryViewport?.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  scrollGallery(event.key === "ArrowLeft" ? -1 : 1);
});
galleryDots?.addEventListener("click", (event) => {
  const dot = event.target.closest("[data-gallery-index]");
  if (!dot || !galleryTrack) return;
  const card = galleryTrack.children[Number(dot.dataset.galleryIndex)];
  card?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest", inline: "start" });
});
window.addEventListener("resize", updateGalleryPosition, { passive: true });

loadInstagramGallery();

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

  event.preventDefault();
  if (onlineBookingEnabled) {
    const serviceIndex = trigger.getAttribute("data-service-index");
    const service = serviceIndex !== null && services[serviceIndex] ? services[serviceIndex] : null;
    const query = service?.id ? `?service=${encodeURIComponent(service.id)}` : "";
    window.location.href = `booking.html${query}`;
    return;
  }

  document.querySelector("#agendamento")?.scrollIntoView({ behavior: "smooth" });
  if (feedback) feedback.textContent = "O agendamento online está temporariamente indisponível. Você ainda pode falar com o Studio B pelo WhatsApp.";
  closeMenu();
});

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-whatsapp]");
  if (!trigger) return;
  event.preventDefault();

  const number = String(studio.whatsappNumber || "").replace(/\D/g, "");
  if (!number) {
    document.querySelector("#agendamento")?.scrollIntoView({ behavior: "smooth" });
    if (feedback) feedback.textContent = "O número de WhatsApp ainda não foi configurado.";
    closeMenu();
    return;
  }

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
const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const saveData = navigator.connection?.saveData === true;
if (reduceMotion || saveData) {
  video?.pause();
  document.querySelector(".hero")?.classList.add("video-paused");
} else {
  video?.play().catch(() => document.querySelector(".hero")?.classList.add("video-paused"));
}

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js?v=1").catch(() => {});
  }, { once: true });
}
