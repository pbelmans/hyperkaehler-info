# Hyperkaehler.info

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.21296892.svg)](https://doi.org/10.5281/zenodo.21296892)

The code behind [Hyperkaehler.info](https://hyperkaehler.info), a static site
built with [Hugo](https://gohugo.io).

## How it works

The mathematical data and the bibliography are kept in two human-edited sources
at the repository root:

- `data.yml` — the hyperkähler invariants (dimension, Hodge numbers, Chern
  numbers) for each deformation type;
- `bibliography.bib` — the references.

Two Node scripts turn these into the data files Hugo consumes (written to
`data/`, git-ignored, regenerated on every build):

- `scripts/build-data.mjs` — computes every invariant (Betti numbers, signature,
  Euler characteristic, the Beauville–Bogomolov form, the Todd integral, the
  Riemann–Roch and monodromy expressions, …) and writes `data/hyperkaehlers.json`;
- `scripts/build-bib.mjs` — formats the bibliography with
  [citation.js](https://citation.js.org) and writes `data/bibliography.json`.

Hugo then renders the pages. Math is typeset client-side with KaTeX; the
interactive LLV decomposition widget lives in `static/llv-ui.js` and reads
`static/llv-data.js`.

## Build & develop

Requires [Hugo extended](https://gohugo.io/installation/) and Node 20+.

```shell
npm install            # once

npm run serve          # build data + bib, then `hugo server` with live reload
npm run build          # build data + bib, then `hugo --gc --minify` into public/
```

`npm run data` and `npm run bib` regenerate the two data files individually.

## Tests

```shell
npm i --no-save playwright && npx playwright install chromium   # once
npm run build
node tests/render.mjs   # every route loads, throws no JS error, and renders KaTeX
```

## Deployment

Pushing to `main` triggers `.github/workflows/hugo.yml`, which builds the data,
runs `hugo --gc --minify`, and publishes `public/` to GitHub Pages. The custom
domain is set in `static/CNAME`.

## LLV tooling

The LLV section uses `static/llv-data.js`. Use `llv.jl` to (re)generate the
decompositions via Julia (`../HomogeneousTools/Lie.jl`):

```shell
julia llv.jl --family K3-n --n 4 --show-character
julia llv.jl --family Kum-n --n 6 --json
julia llv.jl --family K3 --capabilities
```

To keep `static/llv-data.js` human-readable (all integer lists on single lines):

```shell
node scripts/format-llv-data.mjs
```

## Perverse-Hodge octahedron tooling

The perverse-Hodge widget reads the generated files in
`static/octahedron-data/`. It projects each LLV representation to the first
three orthonormal weight coordinates and verifies that the result collapses to
the stored Hodge diamond:

```shell
sage scripts/build-octahedron-data.sage
```

## Bibliography accents

To normalise LaTeX accent commands in `bibliography.bib` to Unicode:

```shell
node scripts/unicode-accents.mjs
```

## How to cite

The website is archived on Zenodo. To cite the version-independent latest
release, use the concept DOI
[10.5281/zenodo.21296892](https://doi.org/10.5281/zenodo.21296892).

```bibtex
@online{hyperkaehler,
  author = {Belmans, Pieter},
  title  = {hyperkaehler.info --- the geography of compact irreducible holomorphic symplectic (or hyperk\"ahler) varieties},
  url    = {https://hyperkaehler.info},
  doi    = {10.5281/zenodo.21296892},
  year   = {2026},
}
```
