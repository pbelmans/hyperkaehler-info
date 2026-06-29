// Replace LaTeX accent commands in bibliography.bib with Unicode characters.
// Port of the old unicode_accents.py. Usage: node scripts/unicode-accents.mjs [file]
import { readFileSync, writeFileSync, copyFileSync } from "fs";

const ACCENTS = {
  '"': { a: "ä", A: "Ä", e: "ë", E: "Ë", i: "ï", I: "Ï", o: "ö", O: "Ö", u: "ü", U: "Ü", y: "ÿ", Y: "Ÿ" },
  "'": { a: "á", A: "Á", e: "é", E: "É", i: "í", I: "Í", o: "ó", O: "Ó", u: "ú", U: "Ú", y: "ý", Y: "Ý", c: "ć", C: "Ć", s: "ś", S: "Ś" },
  "`": { a: "à", A: "À", e: "è", E: "È", i: "ì", I: "Ì", o: "ò", O: "Ò", u: "ù", U: "Ù" },
  "^": { a: "â", A: "Â", e: "ê", E: "Ê", i: "î", I: "Î", o: "ô", O: "Ô", u: "û", U: "Û" },
  "~": { n: "ñ", N: "Ñ", a: "ã", A: "Ã" },
  c: { c: "ç", C: "Ç" },
};

const target = process.argv[2] || "bibliography.bib";
const original = readFileSync(target, "utf8");
let text = original;

// \"{a}  \'{e}  \`{e}  \^{o}  \~{n}
text = text.replace(/\\(["'`^~])\{([a-zA-Z])\}/g, (m, acc, ch) => (ACCENTS[acc] && ACCENTS[acc][ch]) || m);
// \c{c}
text = text.replace(/\\c\{([a-zA-Z])\}/g, (m, ch) => (ACCENTS.c && ACCENTS.c[ch]) || m);
// \x{2081} etc. (biber --output-safechars residue)
text = text.replace(/\\x\{([0-9a-fA-F]+)\}/g, (m, hex) => String.fromCodePoint(parseInt(hex, 16)));

copyFileSync(target, target + ".bak");
writeFileSync(target, text);

const oLines = original.split("\n");
const nLines = text.split("\n");
const changed = [];
for (let i = 0; i < Math.min(oLines.length, nLines.length); i++) {
  if (oLines[i] !== nLines[i]) changed.push([oLines[i], nLines[i]]);
}
console.log(`Done. ${changed.length} line(s) changed.`);
for (const [o, n] of changed) {
  console.log(`  - ${o.trim()}`);
  console.log(`  + ${n.trim()}`);
}
