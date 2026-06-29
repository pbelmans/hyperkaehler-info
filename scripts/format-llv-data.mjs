// Format static/llv-data.js for readable git diffs: leaf lists (and short lists
// of short leaf lists) stay on one line, everything else is indented. Run after
// regenerating the LLV data with llv.jl. Port of the old format_llv_data.py;
// matches Python's json.dumps spacing (", " and ": ") so the output is stable.
import { readFileSync, writeFileSync } from "fs";

const PREFIX = "const LLV_DATA = ";
const INPUT = "static/llv-data.js";

const isLeaf = (x) => x === null || (!Array.isArray(x) && typeof x !== "object");
const isLeafList = (v) => Array.isArray(v) && v.every(isLeaf);
const isShortLeafListList = (v) =>
  Array.isArray(v) && v.length > 0 && v.length <= 20 && v.every((x) => isLeafList(x) && x.length <= 4);

// JSON serialiser matching Python's json.dumps default separators.
const py = (v) => {
  if (Array.isArray(v)) return "[" + v.map(py).join(", ") + "]";
  if (v !== null && typeof v === "object")
    return "{" + Object.entries(v).map(([k, val]) => JSON.stringify(k) + ": " + py(val)).join(", ") + "}";
  return JSON.stringify(v);
};

function formatValue(value, indent = 0) {
  const pad = "  ".repeat(indent);

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const items = Object.entries(value);
    if (items.length === 0) return "{}";
    const lines = ["{"];
    items.forEach(([key, item], index) => {
      const comma = index < items.length - 1 ? "," : "";
      lines.push(`${"  ".repeat(indent + 1)}${JSON.stringify(key)}: ${formatValue(item, indent + 1)}${comma}`);
    });
    lines.push(`${pad}}`);
    return lines.join("\n");
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (isLeafList(value)) return py(value);
    if (isShortLeafListList(value)) return "[" + value.map(py).join(", ") + "]";
    const lines = ["["];
    value.forEach((item, index) => {
      const comma = index < value.length - 1 ? "," : "";
      lines.push(`${"  ".repeat(indent + 1)}${formatValue(item, indent + 1)}${comma}`);
    });
    lines.push(`${pad}]`);
    return lines.join("\n");
  }

  return JSON.stringify(value);
}

let payload = readFileSync(INPUT, "utf8").slice(PREFIX.length).trim();
if (payload.endsWith(";")) payload = payload.slice(0, -1);
const data = JSON.parse(payload);
writeFileSync(INPUT, `${PREFIX}${formatValue(data)};\n`);
console.log("formatted", INPUT);
