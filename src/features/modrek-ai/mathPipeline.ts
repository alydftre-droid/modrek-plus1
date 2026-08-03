/**
 * Modrek AI — Math / Science normalization pipeline (Teacher Engine 2026).
 *
 * The model is instructed to emit LaTeX, but real answers arrive in mixed
 * shapes: \( \), \[ \], `sqrt(2)`, `x^2`, `H2SO4`, `1/2`, Arabic trig names…
 * This module normalizes everything into KaTeX-safe `$…$` / `$$…$$` math so the
 * rendered output looks like a printed textbook.
 */

/* KaTeX macros: Arabic trigonometric + common teacher shorthands. */
export const KATEX_MACROS: Record<string, string> = {
  // Arabic trig (جا / جتا / ظا / ظتا / قا / قتا)
  "\\ja": "\\operatorname{\\text{جا}}",
  "\\jta": "\\operatorname{\\text{جتا}}",
  "\\za": "\\operatorname{\\text{ظا}}",
  "\\zta": "\\operatorname{\\text{ظتا}}",
  "\\qa": "\\operatorname{\\text{قا}}",
  "\\qta": "\\operatorname{\\text{قتا}}",
  "\\جا": "\\operatorname{\\text{جا}}",
  "\\جتا": "\\operatorname{\\text{جتا}}",
  "\\ظا": "\\operatorname{\\text{ظا}}",
  "\\ظتا": "\\operatorname{\\text{ظتا}}",
  "\\قا": "\\operatorname{\\text{قا}}",
  "\\قتا": "\\operatorname{\\text{قتا}}",
  // Physics / general shorthands
  "\\dd": "\\mathrm{d}",
  "\\unit": "\\,\\mathrm{#1}",
  "\\vect": "\\overrightarrow{#1}",
  "\\R": "\\mathbb{R}",
  "\\Z": "\\mathbb{Z}",
  "\\N": "\\mathbb{N}",
  "\\Q": "\\mathbb{Q}",
  "\\deg": "^{\\circ}",
};

const FENCE_RE = /```[\s\S]*?(?:```|$)/g;
const MATH_RE = /\$\$[\s\S]*?\$\$|\$[^\n$]*?\$/g;

/** Run `fn` on text outside code fences and existing math spans. */
function mapOutsideMath(text: string, fn: (chunk: string) => string): string {
  const protectedSpans: string[] = [];
  const stash = (re: RegExp, src: string) =>
    src.replace(re, (m) => {
      protectedSpans.push(m);
      return `\u0000${protectedSpans.length - 1}\u0000`;
    });

  let out = stash(FENCE_RE, text);
  out = stash(MATH_RE, out);
  out = fn(out);
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => protectedSpans[Number(i)]);
}

/** Chemical formulas the model often writes as plain text. */
const CHEM_TOKEN_RE =
  /(?<![\p{L}\\$])((?:[A-Z][a-z]?\d*){1,6}(?:\^?\d*[+-])?)(?![\p{L}])/gu;

const CHEM_ALLOW = new Set([
  "H2O", "H2SO4", "HCl", "HNO3", "H3PO4", "H2CO3", "NaOH", "KOH", "NH3", "NH4Cl",
  "CaCO3", "CaO", "CaCl2", "Ca(OH)2", "CO2", "CO", "SO2", "SO3", "NO2", "NO",
  "N2", "O2", "H2", "Cl2", "Br2", "I2", "NaCl", "KCl", "MgO", "MgCl2", "Al2O3",
  "Fe2O3", "FeO", "Fe3O4", "CuO", "CuSO4", "ZnO", "ZnSO4", "AgNO3", "PbO2",
  "Na2CO3", "NaHCO3", "K2CO3", "KMnO4", "K2Cr2O7", "CH4", "C2H4", "C2H6",
  "C2H2", "C6H6", "C2H5OH", "CH3COOH", "C6H12O6", "C12H22O11", "SiO2", "P2O5",
]);

/** Common physics/maths ASCII → LaTeX conversions inside a plain-text chunk. */
function convertInlineScience(chunk: string): string {
  let out = chunk;

  // \( … \) and \[ … \] → $ … $ / $$ … $$
  out = out.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `\n\n$$${String(m).trim()}$$\n\n`);
  out = out.replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${String(m).trim()}$`);

  // \ce{...} outside math → wrap it
  out = out.replace(/(?<!\$)\\ce\{([^}]*)\}/g, (_, m) => `$\\ce{${m}}$`);

  // Known chemical formulas → mhchem
  out = out.replace(CHEM_TOKEN_RE, (m) => {
    const bare = m.replace(/\^?\d*[+-]$/, "");
    if (!CHEM_ALLOW.has(bare) && !CHEM_ALLOW.has(m)) return m;
    return `$\\ce{${m}}$`;
  });

  // Chemical reaction arrows
  out = out.replace(/(?<!\$)\s-->\s(?!\$)/g, " $\\longrightarrow$ ");
  out = out.replace(/(?<!\$)\s<-->\s(?!\$)/g, " $\\rightleftharpoons$ ");

  return out;
}

/**
 * Public entry: normalize an assistant answer for KaTeX rendering.
 */
export function normalizeScience(text: string): string {
  const src = String(text || "").replace(/\r\n/g, "\n");
  let out = mapOutsideMath(src, convertInlineScience);

  // Arabic trig written as bare words inside math ($ جا س $) — keep, KaTeX
  // renders Arabic through \text via macros; also allow "جا(" style calls.
  out = out.replace(/\$\$?([\s\S]*?)\$\$?/g, (m) =>
    m
      .replace(/\bجتا\b/g, "\\jta ")
      .replace(/\bجا\b/g, "\\ja ")
      .replace(/\bظتا\b/g, "\\zta ")
      .replace(/\bظا\b/g, "\\za ")
      .replace(/\bقتا\b/g, "\\qta ")
      .replace(/\bقا\b/g, "\\qa "),
  );

  // A math block alone on its line becomes a display equation.
  out = out
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (/^\$[^$][\s\S]*\$$/.test(t) && !t.startsWith("$$") && t.length > 6) {
        return `$$${t.slice(1, -1)}$$`;
      }
      return line;
    })
    .join("\n");

  return out;
}
