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

test("galeria usa destaques locais e atualiza pelo endpoint seguro", () => {
  assert.match(config, /fallbackPosts/);
  assert.match(config, /assets\/banner\.jpeg/);
  assert.match(supabaseConfig, /functions\/v1\/instagram-feed/);
  assert.match(app, /instagramFeedUrl/);
  assert.match(app, /loadInstagramPage\(galleryNextCursor, true\)/);
  assert.match(app, /endpoint\.searchParams\.set\("after", after\)/);
  assert.match(edgeFunction, /Deno\.env\.get\("INSTAGRAM_ACCESS_TOKEN"\)/);
  assert.match(edgeFunction, /graph\.instagram\.com/);
  assert.match(edgeFunction, /payload\?\.paging\?\.cursors\?\.after/);
  assert.match(edgeFunction, /next_cursor: hasMore/);
  assert.match(edgeFunction, /endpoint\.searchParams\.set\("after", after\)/);
  assert.doesNotMatch(supabaseConfig, /INSTAGRAM_ACCESS_TOKEN/);
  assert.doesNotMatch(config, /INSTAGRAM_ACCESS_TOKEN/);
});

test("feed carrega páginas de 12 itens até o fim sem expor o cursor da Meta com o token", () => {
  assert.match(edgeFunction, /endpoint\.searchParams\.set\("limit", "12"\)/);
  assert.match(app, /remaining < galleryViewport\.clientWidth \* 1\.5/);
  assert.match(app, /galleryNextCursor/);
  assert.match(app, /Você chegou à última publicação disponível/);
  assert.doesNotMatch(app, /access_token/);
});

