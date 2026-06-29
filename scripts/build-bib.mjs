// Build data/bibliography.json from bibliography.bib using citation.js.
//
// Each entry is formatted in a standard CSL style (APA) and then annotated with
// arXiv / DOI / MathSciNet links. citation.js drops the non-standard `eprint`
// field, so the arXiv id is read straight from the .bib. Run before `hugo`.
import { Cite } from "@citation-js/core";
import "@citation-js/plugin-bibtex";
import "@citation-js/plugin-csl";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const bibText = readFileSync(join(ROOT, "bibliography.bib"), "utf8");

// Pull eprint + doi straight from the .bib (their values contain no braces, so a
// simple regex is safe), since citation.js does not expose `eprint`.
const rawField = (block, field) => {
  const m = block.match(new RegExp(field + "\\s*=\\s*\\{([^}]*)\\}"));
  return m ? m[1].trim() : null;
};
const raw = {};
for (const m of bibText.matchAll(/@\w+\s*\{\s*([^,]+),([\s\S]*?)\n\}/g)) {
  raw[m[1].trim()] = { eprint: rawField(m[2], "eprint"), doi: rawField(m[2], "doi") };
}

const cite = new Cite(bibText);

function entryHtml(entry) {
  const full = new Cite(entry).format("bibliography", { format: "html", template: "apa", lang: "en-US" });
  // Strip the csl-bib-body / csl-entry wrapper divs that citation.js adds.
  let html = full.replace(/<div class="csl-bib-body">/, "").replace(/<\/div>\s*$/, "");
  html = html.replace(/<div[^>]*class="csl-entry"[^>]*>/, "").replace(/<\/div>\s*$/, "");
  // APA appends the DOI as a trailing URL; drop it (we add our own links).
  html = html.replace(/\s*https?:\/\/doi\.org\/\S+\s*$/, "");
  // tidy the thesis genre label that citation.js renders from "phdthesis"
  html = html.replace(/\[Phdthesis\]/g, "[PhD thesis]");
  return html.trim();
}

const bibliography = {};
for (const entry of cite.data) {
  const key = entry.id;
  let html = entryHtml(entry);
  const r = raw[key] || {};
  const doi = entry.DOI || r.doi;
  const links = [];
  if (r.eprint) links.push(`<a href="https://arxiv.org/abs/${r.eprint}">arXiv:${r.eprint}</a>`);
  if (doi) links.push(`<a href="https://doi.org/${doi}">doi:${doi}</a>`);
  if (/^MR\d+$/.test(key)) links.push(`<a href="https://mathscinet.ams.org/mathscinet-getitem?mr=${key.slice(2)}">${key}</a>`);
  if (links.length) html += " " + links.join(" ");
  bibliography[key] = html;
}

mkdirSync(join(ROOT, "data"), { recursive: true });
writeFileSync(join(ROOT, "data", "bibliography.json"), JSON.stringify(bibliography, null, 2) + "\n");
console.log(`wrote data/bibliography.json (${Object.keys(bibliography).length} entries)`);
