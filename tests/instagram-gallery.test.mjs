import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [html, css, app, config, supabaseConfig, edgeFunction] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("styles.css", root), "utf8"),
  readFile(new URL("app.js", root), "utf8"),
  readFile(new URL("config.js", root), "utf8"),
  readFile(new URL("supabase-config.js", root), "utf8"),
  readFile(new URL("supabase/functions/instagram-feed/index.ts", root), "utf8"),
]);

test("Galeria aparece antes de Onde estamos no conteúdo e nos menus", () => {
  const gallerySection = html.indexOf('id="galeria"');
  const locationSection = html.indexOf('id="unidade-casa-verde"');
  assert.ok(gallerySection > 0 && locationSection > gallerySection);

  const firstGalleryLink = html.indexOf('href="#galeria"');
  const firstLocationLink = html.indexOf('href="#unidade-casa-verde"');
  assert.ok(firstGalleryLink > 0 && firstLocationLink > firstGalleryLink);
  assert.match(html, /<h2 id="gallery-title">/);
});

test("carrossel é acessível, responsivo e aponta para o Instagram informado", () => {
  assert.match(html, /aria-roledescription="carrossel"/);
  assert.match(html, /data-gallery-prev/);
  assert.match(html, /data-gallery-next/);
  assert.match(html, /data-gallery-viewport/);
  assert.match(html, /data-gallery-status/);
  assert.match(html, /https:\/\/www\.instagram\.com\/beatrizrogozizribeiro_\//);
  assert.match(css, /scroll-snap-type:\s*x mandatory/);
  assert.match(css, /\.gallery-track\s*\{[^}]*grid-auto-flow:\s*column/s);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.gallery-track/);
  assert.match(app, /ArrowLeft/);
  assert.match(app, /prefers-reduced-motion/);
});

test("galeria preserva 12 imagens locais e só ativa conteúdo real válido", () => {
  assert.match(config, /fallbackPosts/);
  assert.match(config, /assets\/banner\.jpeg/);
  assert.equal((config.match(/image:\s*"assets\//g) || []).length, 12);
  assert.match(config, /assets\/gallery-video-08\.jpeg/);
  assert.match(app, /fetch\(settings\.instagramFeedUrl/);
  assert.match(app, /AbortSignal\.timeout\(6000\)/);
  assert.match(app, /result\.connected && remotePosts\.length/);
  assert.match(app, /renderGallery\(galleryFallbackPosts, false\)/);
  assert.doesNotMatch(supabaseConfig, /INSTAGRAM_ACCESS_TOKEN/);
  assert.doesNotMatch(config, /INSTAGRAM_ACCESS_TOKEN/);
});

