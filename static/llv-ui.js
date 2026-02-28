/*
 * LLV UI module
 *
 * Design goals:
 * - Keep rendering deterministic and side-effect light.
 * - Separate state updates from DOM rendering.
 * - Support mouse and touch with the same interaction model.
 *
 * Interaction model:
 * - Hover a component: temporary preview (unless pinned).
 * - Move pointer away: reset to full decomposition (unless pinned).
 * - Click/tap a component: pin it.
 * - Click/tap the full cohomology term: unpin and show full decomposition.
 */
(function() {
  const LIE_ALGEBRA_BY_KEY = {
    "K3": "LLV Lie algebra used here: $\\mathfrak{so}(25,\\mathbb{C})$ (type $\\mathrm{B}_{12}$).",
    "K3-n": "LLV Lie algebra used here: $\\mathfrak{so}(25,\\mathbb{C})$ (type $\\mathrm{B}_{12}$).",
    "Kum-n": "LLV Lie algebra used here: $\\mathfrak{so}(9,\\mathbb{C})$ (type $\\mathrm{B}_{4}$).",
    "OG6": "LLV Lie algebra used here: $\\mathfrak{so}(9,\\mathbb{C})$ (type $\\mathrm{B}_{4}$) in this decomposition table.",
    "OG10": "LLV Lie algebra used here: $\\mathfrak{so}(24,\\mathbb{C})$ (type $\\mathrm{D}_{12}$).",
  };

  function familyKey(key) {
    if (key.startsWith("K3-")) {
      return "K3-n";
    }
    if (key.startsWith("Kum-")) {
      return "Kum-n";
    }
    return key;
  }

  function typeset(target) {
    if (window.renderMathInElement) {
      window.renderMathInElement(target, {
        delimiters: [
          {left: "$$", right: "$$", display: true},
          {left: "\\[", right: "\\]", display: true},
          {left: "\\(", right: "\\)", display: false},
          {left: "$", right: "$", display: false}
        ],
        throwOnError: false
      });
    }
  }

  function fractionToTex(token) {
    if (!token.includes("/")) {
      return token;
    }
    const [num, den] = token.split("/").map((x) => x.trim());
    return `\\frac{${num}}{${den}}`;
  }

  function weightTupleToTex(weight) {
    if (weight === "()") {
      return "()";
    }
    const body = weight.slice(1, -1).trim();
    if (!body) {
      return "()";
    }
    const coords = body.split(",").map((token) => fractionToTex(token.trim()));
    return `(${coords.join(",")})`;
  }

  function texWeight(weight, withBar) {
    if (weight === "()") {
      return "\\mathbf{Q}";
    }
    if (weight === "(1)") {
      return withBar ? "\\bar V" : "V";
    }
    return `${withBar ? "\\bar V" : "V"}_{${weightTupleToTex(weight)}}`;
  }

  function zeroDiamond(d) {
    const rows = [];
    for (let i = -d; i <= d; i++) {
      rows.push(Array(d + 1 - Math.abs(i)).fill(0));
    }
    return rows;
  }

  function hsSliceDiamond(record, weight, shift) {
    const d = record.dim;
    const hs = record.HS[weight];
    const diamond = zeroDiamond(d);

    const rowIndex = shift + d;
    const rowWidth = diamond[rowIndex].length;
    const leftPad = Math.max(0, Math.floor((rowWidth - hs.length) / 2));

    for (let i = 0; i < hs.length && leftPad + i < rowWidth; i++) {
      diamond[rowIndex][leftPad + i] = hs[i];
    }
    return diamond;
  }

  function diamondHtml(diamond, multiplicity, highlightNonzero) {
    const out = ['<div class="llv-diamond-inner">'];
    for (let i = 0; i < diamond.length; i++) {
      for (let j = 0; j < diamond[i].length; j++) {
        const value = diamond[i][j];
        let cls = "";
        if (highlightNonzero) {
          cls = value !== 0 ? " llv-active" : " llv-zero";
        }
        const mult = value === 0 || multiplicity === 1 ? "" : `<sup>⊕${multiplicity}</sup>`;
        out.push(`<span class="llv-cell${cls}">${value}${mult}</span>`);
      }
      out.push("<br>");
    }
    out.push("</div>");
    return out.join("");
  }

  function renderFullHodge(record) {
    const d = record.dim;
    const rows = Array.from({ length: 2 * d + 1 }, () => ({}));

    Object.keys(record.llv).forEach((llvKey) => {
      const comp = record.llv[llvKey];
      comp["hs-comps"].forEach(([weight, shift]) => {
        const idx = shift + d;
        rows[idx][weight] = (rows[idx][weight] || 0) + comp.m;
      });
    });

    const lines = [
      "<p>For a very general member $X$, the cohomology decomposes into irreducible Hodge structures with $\\bar V=\\operatorname{H}^2(X,\\mathbf{Q})$.</p>"
    ];

    for (let i = 0; i <= 2 * d; i++) {
      const keys = Object.keys(rows[i]);
      if (!keys.length) {
        continue;
      }
      const pieces = keys.sort().reverse().map((weight) => {
        const m = rows[i][weight];
        return `<span class="llv-hs-comp" data-weight="${weight}" data-shift="${i - d}" data-m="${m}">$${texWeight(weight, true)}${m === 1 ? "" : "^{\\oplus" + m + "}"}$</span>`;
      });
      lines.push(`<p>$\\operatorname{H}^{${i}}(X,\\mathbf{Q})=$ ${pieces.join(" $\\oplus$ ")}</p>`);
    }

    return `<div class="llv-decomp">${lines.join("")}</div>`;
  }

  function renderComponentHodge(record, llvKey) {
    const d = record.dim;
    const comp = record.llv[llvKey];
    const rows = Array.from({ length: 2 * d + 1 }, () => []);

    comp["hs-comps"].forEach(([weight, shift]) => {
      rows[shift + d].push(weight);
    });

    const lines = [
      `<p>Selected LLV summand $${texWeight(llvKey, false)}$ and its Hodge decomposition.</p>`
    ];

    for (let i = 0; i <= 2 * d; i++) {
      if (!rows[i].length) {
        continue;
      }
      const rendered = rows[i].map((weight) => (
        `<span class="llv-hs-comp" data-llv="${llvKey}" data-weight="${weight}" data-shift="${i - d}" data-m="${comp.m}">$${texWeight(weight, true)}$</span>`
      ));
      lines.push(`<p>$${texWeight(llvKey, false)}\\cap\\operatorname{H}^{${i}}(X,\\mathbf{Q})=$ ${rendered.join(" $\\oplus$ ")}</p>`);
    }

    return `<div class="llv-decomp">${lines.join("")}</div>`;
  }

  function decompositionHtml(record) {
    const chunks = [`<span class="llv-full">$\\operatorname{H}^\\ast(${record.tex},\\mathbf{Q})$</span>`, "$=$"];
    record["llv-comps"].forEach((llvKey, idx) => {
      if (idx > 0) {
        chunks.push("$\\oplus$");
      }
      const m = record.llv[llvKey].m;
      chunks.push(`<span class="llv-comp" data-llv="${llvKey}">$${texWeight(llvKey, false)}${m === 1 ? "" : "^{\\oplus" + m + "}"}$</span>`);
    });
    return `<div class="llv-decomposition-inner"><div class="llv-decomposition-line">${chunks.join(" ")}</div></div><p class="llv-hint"><small>Hover to preview, click/tap to pin a summand.</small></p>`;
  }

  function pathClosest(event, selector) {
    const path = event.composedPath ? event.composedPath() : [];
    for (let i = 0; i < path.length; i++) {
      const node = path[i];
      if (node && node.matches && node.matches(selector)) {
        return node;
      }
    }
    const target = event.target;
    if (target && target.closest) {
      return target.closest(selector);
    }
    return null;
  }

  function applyState(widget) {
    const key = widget.dataset.llvKey;
    const record = LLV_DATA[key];
    const state = widget._llvState;

    const decompEl = widget.querySelector(".llv-decomposition");
    const diamondEl = widget.querySelector(".llv-diamond");
    const hodgeEl = widget.querySelector(".llv-hodge");
    const structureEl = widget.querySelector(".llv-structure");

    if (structureEl) {
      const text = LIE_ALGEBRA_BY_KEY[familyKey(key)] || "";
      structureEl.innerHTML = text;
    }

    decompEl.innerHTML = decompositionHtml(record);

    const activeKey = state.previewLLV || state.pinnedLLV;
    if (!activeKey) {
      diamondEl.innerHTML = diamondHtml(record.diamond, 1, false);
      hodgeEl.innerHTML = renderFullHodge(record);
    } else {
      const comp = record.llv[activeKey];
      diamondEl.innerHTML = diamondHtml(comp.diamond, comp.m, true);
      hodgeEl.innerHTML = renderComponentHodge(record, activeKey);
      const activeEl = decompEl.querySelector(`.llv-comp[data-llv=\"${activeKey}\"]`);
      if (activeEl) {
        activeEl.classList.add("llv-active");
      }
    }

    typeset(widget);
  }

  function bindEvents(widget) {
    if (widget.dataset.llvBound === "1") {
      return;
    }
    widget.dataset.llvBound = "1";

    widget.addEventListener("mouseover", (event) => {
      const state = widget._llvState;
      if (state.pinnedLLV) {
        return;
      }

      const comp = pathClosest(event, ".llv-comp");
      if (!comp) {
        if (state.previewLLV !== null) {
          state.previewLLV = null;
          applyState(widget);
        }
        return;
      }

      const nextPreview = comp.dataset.llv;
      if (state.previewLLV !== nextPreview) {
        state.previewLLV = nextPreview;
        applyState(widget);
      }
    });

    widget.addEventListener("mouseleave", () => {
      const state = widget._llvState;
      if (state.pinnedLLV) {
        return;
      }
      state.previewLLV = null;
      applyState(widget);
    });

    widget.addEventListener("click", (event) => {
      const state = widget._llvState;

      const full = pathClosest(event, ".llv-full");
      if (full) {
        state.pinnedLLV = null;
        state.previewLLV = null;
        applyState(widget);
        return;
      }

      const comp = pathClosest(event, ".llv-comp");
      if (comp) {
        const llvKey = comp.dataset.llv;
        state.pinnedLLV = state.pinnedLLV === llvKey ? null : llvKey;
        state.previewLLV = null;
        applyState(widget);
        return;
      }

      const hs = pathClosest(event, ".llv-hs-comp");
      if (!hs) {
        return;
      }

      const key = widget.dataset.llvKey;
      const record = LLV_DATA[key];
      const weight = hs.dataset.weight;
      const shift = parseInt(hs.dataset.shift, 10);
      const multiplicity = parseInt(hs.dataset.m, 10);

      widget.querySelector(".llv-diamond").innerHTML = diamondHtml(
        hsSliceDiamond(record, weight, shift),
        multiplicity,
        true,
      );
      typeset(widget);
    });
  }

  function renderWidget(widget, key) {
    if (!widget || !LLV_DATA[key]) {
      return;
    }

    widget.dataset.llvKey = key;
    if (!widget._llvState) {
      widget._llvState = { pinnedLLV: null, previewLLV: null };
    } else {
      widget._llvState.previewLLV = null;
      if (widget._llvState.pinnedLLV && !LLV_DATA[key].llv[widget._llvState.pinnedLLV]) {
        widget._llvState.pinnedLLV = null;
      }
    }

    bindEvents(widget);
    applyState(widget);
  }

  window.LLV = { renderWidget };
})();
