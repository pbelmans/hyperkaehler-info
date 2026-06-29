// Smoke-test the built site in a headless browser: every route returns 200,
// throws no uncaught JS error, and — where the HTML contains TeX — renders at
// least one KaTeX element. Run after `hugo`:  node tests/render.mjs
// Requires playwright (the CI installs it; locally: npm i --no-save playwright).
import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, extname, relative } from "path";

const PUBLIC = "public";
const PORT = 8099;
const MIME = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
};

const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  let file = join(PUBLIC, p);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  else if (p.endsWith("/")) file = join(PUBLIC, p, "index.html");
  if (!existsSync(file) || statSync(file).isDirectory()) { res.statusCode = 404; res.end("not found"); return; }
  res.setHeader("Content-Type", MIME[extname(file)] || "application/octet-stream");
  res.end(readFileSync(file));
});

function routes(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...routes(p));
    else if (e === "index.html") {
      const rel = relative(PUBLIC, dir);
      out.push(rel ? "/" + rel.split("\\").join("/") + "/" : "/");
    }
  }
  return out;
}

await new Promise((r) => server.listen(PORT, r));
const base = `http://127.0.0.1:${PORT}`;
const all = [...new Set(routes(PUBLIC))].sort();
const browser = await chromium.launch();
let failures = 0;

for (const route of all) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const resp = await page.goto(base + route, { waitUntil: "networkidle" });
  const status = resp ? resp.status() : 0;

  const html = readFileSync(join(PUBLIC, route, "index.html"), "utf8");
  // Detect real math in the page, ignoring the KaTeX delimiter config in <script>.
  const stripped = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  const hasMath = /\\\(|\\\[|\$[^$\n]+\$/.test(stripped);
  let katex = 0;
  if (hasMath) {
    await page.waitForSelector(".katex", { timeout: 8000 }).catch(() => {});
    katex = await page.locator(".katex").count();
  }

  const ok = status === 200 && errors.length === 0 && (!hasMath || katex > 0);
  if (!ok) {
    failures++;
    console.log(`FAIL ${route}  status=${status} jsErrors=${errors.length} katex=${katex}`);
    errors.forEach((e) => console.log("     " + e));
  } else {
    console.log(`ok   ${route}  ${hasMath ? katex + " katex" : "(no math)"}`);
  }
  await page.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} route(s) failed` : `\nall ${all.length} routes passed`);
process.exit(failures ? 1 : 0);
