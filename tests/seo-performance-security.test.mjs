import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [home, admin, booking, manage, privacy, terms, robots, sitemap, worker] = await Promise.all([
  read("index.html"), read("admin.html"), read("booking.html"), read("manage-booking.html"),
  read("privacy.html"), read("terms.html"), read("robots.txt"), read("sitemap.xml"), read("sw.js")
]);

test("página pública possui metadados SEO absolutos", () => {
  assert.match(home, /rel="canonical" href="https:\/\/www\.beatrizrogoziz\.com\.br\/"/);
  assert.match(home, /property="og:url" content="https:\/\/www\.beatrizrogoziz\.com\.br\/"/);
  assert.match(home, /property="og:image" content="https:\/\/www\.beatrizrogoziz\.com\.br\/assets\/banner\.jpeg"/);
  assert.match(home, /"url": "https:\/\/www\.beatrizrogoziz\.com\.br\/"/);
  assert.match(home, /max-image-preview:large/);
  assert.doesNotMatch(home, /no-cache, no-store/);
});

test("robots e sitemap anunciam apenas páginas indexáveis", () => {
  assert.match(robots, /Sitemap: https:\/\/www\.beatrizrogoziz\.com\.br\/sitemap\.xml/);
  for (const url of ["https://www.beatrizrogoziz.com.br/", "privacy.html", "terms.html"]) assert.match(sitemap, new RegExp(url.replaceAll(".", "\\.")));
  assert.doesNotMatch(sitemap, /admin\.html|manage-booking\.html|booking\.html/);
});

test("recursos críticos têm estabilidade visual, cache e carregamento controlado", () => {
  assert.match(home, /rel="preload" as="image" href="assets\/banner\.jpeg"/);
  assert.match(home, /width="1200" height="1600" loading="lazy" decoding="async"/);
  assert.match(home, /preload="metadata"/);
  assert.match(worker, /request\.destination === "document"/);
  assert.match(worker, /relativePath\.startsWith\("assets\/"\)/);
  assert.doesNotMatch(worker, /admin\.js|booking\.js|supabase-config\.js/);
});

test("páginas possuem CSP e áreas privadas permanecem noindex", () => {
  for (const page of [home, admin, booking, manage, privacy, terms]) {
    assert.match(page, /Content-Security-Policy/);
    assert.match(page, /object-src 'none'/);
    assert.match(page, /base-uri 'self'/);
  }
  assert.match(admin, /noindex, nofollow/);
  assert.match(manage, /noindex, nofollow/);
  assert.match(booking, /noindex/);
});

test("CSP permite somente o JSON-LD inline conhecido", () => {
  const jsonLd = home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(jsonLd);
  const hash = createHash("sha256").update(jsonLd).digest("base64");
  assert.match(home, new RegExp(`script-src[^\"]+'sha256-${hash.replaceAll("+", "\\+")}'`));
  assert.doesNotMatch(home, /script-src[^\"]+'unsafe-inline'/);
});

test("biblioteca externa está fixada e protegida por integridade", () => {
  for (const page of [home, admin]) {
    assert.match(page, /@supabase\/supabase-js@2\.118\.0/);
    assert.match(page, /integrity="sha384-UagCvVPT5XXA0Hx\+nJYUAGBFseHT9zBgpJMSebsAxl9lciTwbT\+39j5VfRjdP5Tp"/);
    assert.match(page, /crossorigin="anonymous"/);
  }
});
