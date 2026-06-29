// Build data/hyperkaehlers.json from data.yml.
//
// This is a faithful port of the Hyperkaehler class from the original Flask
// application.py: every invariant is computed here, so the Hugo templates carry
// no mathematics. Run before `hugo` (see package.json `data`/`build`).
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- exact-integer helpers (BigInt) for the Todd integral -----------------
const factBig = (n) => { let r = 1n; for (let i = 2n; i <= BigInt(n); i++) r *= i; return r; };
const powBig = (b, e) => BigInt(b) ** BigInt(e);
const gcdBig = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a; };

class Hyperkaehler {
  constructor(key, data) {
    this.key = key;
    this.dimension = data.dimension;
    const n = Math.floor(this.dimension / 2);
    const dim = this.dimension;

    // Hodge numbers: flat list reshaped into rows of length dim+1
    const flat = String(data.hodge).split(" ").map(Number);
    this.hodge = [];
    for (let i = 0; i < flat.length; i += dim + 1) this.hodge.push(flat.slice(i, i + dim + 1));

    // Betti numbers from the Hodge numbers
    this.betti = [];
    for (let i = 0; i <= 2 * dim; i++) {
      let s = 0;
      for (let j = 0; j <= i; j++) if (j <= dim && i - j <= dim) s += this.hodge[j][i - j];
      this.betti.push(s);
    }

    // signature from the Hodge numbers
    let sig = 0;
    for (let a = 0; a <= dim; a++) for (let b = 0; b <= dim; b++) sig += (a % 2 === 0 ? 1 : -1) * this.hodge[a][b];
    this.signature = sig;

    // Chern numbers (list of {monomial: [[d,e],...], value}, in data.yml order).
    // Values use BigInt: in dimension 20 they exceed 2^53, so parsing them as
    // JS numbers (or letting Hugo read JSON numbers as float64) would round them.
    this.chern = [];
    this.euler = 0n;
    if (data.chern) {
      for (const numberStr of data.chern) {
        const parts = String(numberStr).split(" ");
        const value = BigInt(parts[parts.length - 1]);
        const nums = parts.slice(0, -1).map(Number); // degrees & exponents (small)
        const monomial = [];
        for (let i = 0; i < nums.length; i += 2) monomial.push([nums[i], nums[i + 1]]);
        monomial.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const deg = monomial.reduce((acc, [d, e]) => acc + d * e, 0);
        if (deg !== dim) throw new Error(`${key}: ${JSON.stringify(monomial)} is not a valid Chern monomial of degree ${dim}`);
        this.chern.push({ monomial, value });
      }
      const eulerKey = JSON.stringify([[2 * n, 1]]);
      const e = this.chern.find((c) => JSON.stringify(c.monomial) === eulerKey);
      this.euler = e ? e.value : 0n;
    }

    // integral of the square root of the Todd class -> {raw, reduced, value}
    if (key === "K3") {
      this.square_root_todd = { raw: 1, reduced: 1, value: 1 };
    } else {
      let num, den;
      if (key.startsWith("K3-")) { num = powBig(n + 3, n); den = powBig(4, n) * factBig(n); }
      else if (key.startsWith("Kum")) { num = powBig(n + 1, n + 1); den = powBig(4, n) * factBig(n); }
      else if (key === "OG6") { num = 2n; den = 3n; }
      else if (key === "OG10") { num = 4n; den = 15n; }
      const raw = `${num}/${den}`;
      const g = gcdBig(num, den);
      const reduced = `${num / g}/${den / g}`;
      this.square_root_todd = { raw, reduced, value: Number(num) / Number(den) };
    }

    // Fujiki constant
    if (key === "K3") this.fujiki = 1;
    else if (key.startsWith("K3-")) this.fujiki = 1;
    else if (key.startsWith("Kum")) this.fujiki = 1 + n;
    else if (key === "OG6") this.fujiki = 4;
    else if (key === "OG10") this.fujiki = 1;

    // Beauville-Bogomolov form
    if (key === "K3") this.bb = String.raw`\mathrm{E}_8(-1)^{\oplus2}\oplus\mathrm{U}^{\oplus3}`;
    else if (key.startsWith("K3-")) this.bb = String.raw`\mathrm{E}_8(-1)^{\oplus2}\oplus\mathrm{U}^{\oplus3}\oplus(` + (-dim + 2) + ")";
    else if (key.startsWith("Kum")) this.bb = String.raw`\mathrm{U}^3\oplus(` + (-dim - 2) + ")";
    else if (key === "OG6") this.bb = String.raw`\mathrm{U}^3\oplus(-2)^{\oplus2}`;
    else if (key === "OG10") this.bb = String.raw`\mathrm{E}_8(-1)^{\oplus2}\oplus\mathrm{U}^3\oplus\mathrm{A}_2(-1)`;

    // Aut_0
    if (key === "K3") this.Aut_0 = "0";
    else if (key.startsWith("K3-")) this.Aut_0 = "0";
    else if (key.startsWith("Kum")) this.Aut_0 = String.raw`(\mathbb{Z}/` + (n + 1) + String.raw`\mathbb{Z})^4\rtimes\mathbb{Z}/2\mathbb{Z}`;
    else if (key === "OG6") this.Aut_0 = String.raw`(\mathbb{Z}/2\mathbb{Z})^8`;
    else if (key === "OG10") this.Aut_0 = "0";

    // polarisation type of the Lagrangian fibration
    this.polarisations = [];
    if (key === "K3") this.polarisations.push("(1)");
    else if (key.startsWith("K3-")) this.polarisations.push("(1)");
    else if (key.startsWith("Kum")) {
      // Theorem 1.1 of MR3848435
      for (let d = 1; d < n + 2; d++) {
        if ((n + 1) % (d * d) === 0) {
          const ones = Array(Math.max(0, n - 2)).fill("1").join(",");
          const sep = n > 2 ? "," : "";
          this.polarisations.push("(" + ones + sep + d + "," + (n + 1) / d + ")");
        }
      }
    } else if (key === "OG6") this.polarisations.push("(1,2,2)");
    else if (key === "OG10") this.polarisations.push("(1,1,1,1,1)");

    // HTML name
    if (key === "K3") this.name = "K3 surface";
    else if (key.startsWith("K3-")) this.name = `K3<sup>[${n}]</sup>-type`;
    else if (key.startsWith("Kum")) this.name = `Kum<sup>${n}</sup>-type`;
    else if (key === "OG6") this.name = "O'Grady's 6-dimensional sporadic type";
    else if (key === "OG10") this.name = "O'Grady's 10-dimensional sporadic type";

    // shorthand name
    if (key === "K3") this.shorthand = "K3";
    else if (key.startsWith("K3-")) this.shorthand = `K3<sup>[${n}]</sup>-type`;
    else if (key.startsWith("Kum")) this.shorthand = `Kum<sup>${n}</sup>-type`;
    else if (key === "OG6") this.shorthand = "OG<sub>6</sub>";
    else if (key === "OG10") this.shorthand = "OG<sub>10</sub>";
  }
}

// mon2 / rr: the only LaTeX that used to live in the Jinja macro (depend on key
// + dimension). Reproduced here so the templates stay free of arithmetic.
function mon2Latex(X) {
  if (X.key === "K3") return String.raw`\operatorname{O}^{+}(\operatorname{H}^2(X,\mathbb{Z}))`;
  if (X.key.startsWith("K3-")) return String.raw`\mathrm{W}_X`;
  if (X.key.startsWith("Kum")) return String.raw`\ker(\det\chi\colon\mathrm{W}_X\to\{\pm1\})`;
  return String.raw`\operatorname{O}^{+}(\operatorname{H}^2(X,\mathbb{Z}))`; // OG6, OG10
}
function rrLatex(X) {
  const n = Math.floor(X.dimension / 2);
  if (X.key === "K3") return String.raw`\operatorname{RR}_X(t)=\binom{t/2+2}{1}`;
  if (X.key.startsWith("K3-")) return String.raw`\operatorname{RR}_X(t)=\binom{t/2+` + (n + 1) + `+1}{ ` + n + ` }`;
  if (X.key.startsWith("Kum")) return String.raw`\operatorname{RR}_X(t)=` + (n + 1) + String.raw`\binom{t/2+` + n + `}{ ` + n + ` }`;
  if (X.key === "OG6") return String.raw`\operatorname{RR}_X(t)=4\binom{t/2+3}{3}`;
  if (X.key === "OG10") return String.raw`\operatorname{RR}_X(t)=\binom{t/2+6}{5}`;
}

function record(X, sortindex) {
  // Chern monomials ordered by value descending (mirrors the Jinja
  // `dictsort(false,'value')|reverse`): ascending-stable sort, then reversed.
  // Values are emitted as strings to preserve the full integer precision.
  const chern = X.chern
    .slice()
    .sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))
    .reverse()
    .map((c) => ({ monomial: c.monomial, value: c.value.toString() }));
  return {
    key: X.key,
    sortindex,
    dimension: X.dimension,
    hodge: X.hodge,
    betti: X.betti,
    signature: X.signature,
    euler: X.euler.toString(),
    chern,
    square_root_todd: X.square_root_todd,
    fujiki: X.fujiki,
    bb: X.bb,
    Aut_0: X.Aut_0,
    polarisations: X.polarisations,
    name: X.name,
    shorthand: X.shorthand,
    mon2: mon2Latex(X),
    rr: rrLatex(X),
  };
}

const data = yaml.load(readFileSync(join(ROOT, "data.yml"), "utf8"));
const out = {};
let i = 0;
for (const key of Object.keys(data)) {
  out[key] = record(new Hyperkaehler(key, data[key]), i++);
}

mkdirSync(join(ROOT, "data"), { recursive: true });
writeFileSync(join(ROOT, "data", "hyperkaehlers.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`wrote data/hyperkaehlers.json (${Object.keys(out).length} types)`);
