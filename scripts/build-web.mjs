// Builds www/, the folder Capacitor bundles into the Android and iOS apps.
// Everything the app needs is copied in, so it starts and works offline:
// the page, translations, fonts, the native bridge and the app settings.
//
// Settings (environment variables):
//   GOOD_THINGS_API_URL      address of your hosted news server, e.g. https://good-things.onrender.com
//   GOOD_THINGS_PRIVACY_URL  public address of privacy.html (needed for the store listings)
import { readFile, writeFile, mkdir, rm, copyFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "www");
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const api = process.env.GOOD_THINGS_API_URL || "";
const privacyUrl = process.env.GOOD_THINGS_PRIVACY_URL || (api ? api.replace(/\/?$/, "/privacy.html") : "");

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, "fonts"), { recursive: true });

// 1. The page: local fonts instead of Google Fonts, and the app settings and native bridge loaded first.
let html = await readFile(path.join(root, "index.html"), "utf8");
const fontLinks = /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*<link href="https:\/\/fonts\.googleapis\.com[^>]*>/;
if (!fontLinks.test(html)) throw new Error("Google Fonts links not found in index.html; update build-web.mjs");
html = html
  .replace(fontLinks, '<link rel="stylesheet" href="fonts/fonts.css">')
  .replace("<title>Good Things App Prototype</title>", "<title>Good Things</title>")
  .replace('<html lang="en">', '<html lang="en" class="app">')
  .replace('<script src="i18n.js"></script>', '<script src="config.js"></script>\n<script src="native.js"></script>\n<script src="i18n.js"></script>');
await writeFile(path.join(out, "index.html"), html);
await copyFile(path.join(root, "i18n.js"), path.join(out, "i18n.js"));
await copyFile(path.join(root, "privacy.html"), path.join(out, "privacy.html"));

// 2. App settings.
await writeFile(path.join(out, "config.js"), `window.GOOD_THINGS_CONFIG=${JSON.stringify({ app: true, apiBase: api, privacyUrl, version: pkg.version })};\n`);

// 3. Fonts (Latin and Latin Extended, which covers Polish, German and Spanish), under the names the CSS uses.
let css = "";
for (const [pkgName, file, family] of [["@fontsource-variable/figtree", "wght.css", "Figtree"], ["@fontsource-variable/newsreader", "opsz.css", "Newsreader"]]) {
  const dir = path.join(root, "node_modules", pkgName);
  const src = await readFile(path.join(dir, file), "utf8");
  for (const block of src.split("/*").slice(1)) {
    if (!/-(latin|latin-ext)-/.test(block.split("*/")[0])) continue;
    const face = "/*" + block.replace(/font-family: '[^']+'/, `font-family: '${family}'`);
    const files = [...face.matchAll(/url\(\.\/files\/([^)]+)\)/g)].map(m => m[1]);
    for (const f of files) await copyFile(path.join(dir, "files", f), path.join(out, "fonts", f));
    css += face.replace(/url\(\.\/files\//g, "url(./") + "\n";
  }
}
await writeFile(path.join(out, "fonts", "fonts.css"), css);

// 4. The native bridge, with the Capacitor plugins bundled in.
await build({ entryPoints: [path.join(root, "src", "native.js")], bundle: true, format: "iife", target: "es2020", minify: true, outfile: path.join(out, "native.js"), logLevel: "warning" });

const files = (await readdir(out, { recursive: true })).filter(f => /\.\w+$/.test(f));
console.log(`www/ built: ${files.length} files. News server: ${api || "not set (the app shows sample stories until GOOD_THINGS_API_URL is set)"}.`);
