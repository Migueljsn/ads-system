/*
 * Loader de CSS que roda depois do Tailwind e deixa o CSS legível por navegadores de Smart TV
 * (LG webOS, Samsung Tizen, Android TV antigas: Chromium 68–98). Sem isso a página abre quebrada:
 *
 *  1. @layer: o bloco inteiro é descartado → tira as camadas, mantendo a ordem (theme → base → components →
 *     utilities, e o nosso CSS sem camada depois), então a cascata resultante é a mesma.
 *  2. color-mix(): o Tailwind deixa como fallback a cor sólida (bg-bad/10 vira rosa chapado) → troca por rgba()
 *     calculado a partir das variáveis do tema e tira o @supports que só servia para isso.
 *  3. Gradiente "to right in oklab": inválido nesses navegadores, botões ficam sem fundo → "to right".
 *  4. Valores iniciais das variáveis --tw-* (que vêm por @property) ficam atrás de um @supports que nem todo
 *     navegador antigo satisfaz → passam a valer sempre.
 *  5. Flex gap (Chromium < 84): gera margens equivalentes, ativadas só quando o <html> tem .no-flexgap
 *     (detectado por src/lib/legacy-polyfills.ts).
 */

/** percorre o CSS respeitando comentários e strings; para cada at-rule cujo prelúdio casar, substitui */
function rewriteAt(css, match, replace) {
  let out = "";
  let i = 0;
  const skip = (k) => {
    const c = css[k];
    if (c === "/" && css[k + 1] === "*") {
      const end = css.indexOf("*/", k + 2);
      return end === -1 ? css.length : end + 2;
    }
    if (c === '"' || c === "'") {
      let m = k + 1;
      while (m < css.length && css[m] !== c) m += css[m] === "\\" ? 2 : 1;
      return m + 1;
    }
    return -1;
  };
  while (i < css.length) {
    const s = skip(i);
    if (s !== -1) {
      out += css.slice(i, s);
      i = s;
      continue;
    }
    if (css[i] === "@") {
      let j = i + 1;
      while (j < css.length && css[j] !== "{" && css[j] !== ";" && css[j] !== "}") j++;
      const prelude = css.slice(i, j);
      if (match(prelude)) {
        if (css[j] !== "{") {
          // at-rule sem bloco ("@layer a, b;"): some
          i = css[j] === ";" ? j + 1 : j;
          continue;
        }
        let depth = 1;
        let k = j + 1;
        while (k < css.length && depth > 0) {
          const s2 = skip(k);
          if (s2 !== -1) {
            k = s2;
            continue;
          }
          if (css[k] === "{") depth++;
          else if (css[k] === "}") depth--;
          k++;
        }
        out += replace(rewriteAt(css.slice(j + 1, k - 1), match, replace), prelude);
        i = k;
        continue;
      }
    }
    out += css[i];
    i++;
  }
  return out;
}

const unwrap = (inner) => inner;
const isLayer = (p) => /^@layer\b/.test(p);
const unlayer = (css) => rewriteAt(css, isLayer, unwrap);

/* ---------- cores ---------- */
function parseColor(v) {
  v = v.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (k) => parseInt(h.slice(k, k + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [+m[1], +m[2], +m[3], a];
  }
  if (v === "white") return [255, 255, 255, 1];
  if (v === "black") return [0, 0, 0, 1];
  if (v === "transparent") return [0, 0, 0, 0];
  return null;
}

function varMap(css) {
  const raw = {};
  for (const m of css.matchAll(/--([\w-]+)\s*:\s*([^;}]+)/g)) if (!(m[1] in raw)) raw[m[1]] = m[2].trim();
  const resolve = (name, seen = new Set()) => {
    const v = raw[name];
    if (v === undefined || seen.has(name)) return null;
    seen.add(name);
    const ref = v.match(/^var\(\s*--([\w-]+)\s*(?:,\s*([^)]+))?\)$/);
    if (ref) return resolve(ref[1], seen) ?? (ref[2] ? parseColor(ref[2]) : null);
    return parseColor(v);
  };
  return resolve;
}

function resolveColorMix(css) {
  const resolve = varMap(css);
  const color = (x) => {
    const ref = x.match(/^var\(\s*--([\w-]+)\s*(?:,\s*([^)]+))?\)$/);
    if (ref) return resolve(ref[1]) ?? (ref[2] ? parseColor(ref[2]) : null);
    return parseColor(x);
  };
  css = css.replace(/color-mix\(\s*in\s+[a-z]+\s*,\s*(var\([^()]*\)|#[0-9a-fA-F]{3,8}|rgba?\([^()]*\)|[a-z]+)\s*([\d.]+)%\s*,\s*transparent\s*\)/g, (all, x, pct) => {
    const c = color(x);
    if (!c) return all;
    const a = Math.round(c[3] * (parseFloat(pct) / 100) * 1000) / 1000;
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  });
  // sombras: color-mix(in oklab, <cor já resolvida> var(--tw-shadow-alpha), transparent) → a própria cor (alpha padrão 100%)
  css = css.replace(/color-mix\(\s*in\s+[a-z]+\s*,\s*(rgba\([^()]*\))\s*var\(--tw-[\w-]+-alpha\)\s*,\s*transparent\s*\)/g, "$1");
  // @supports (color:color-mix(...)) só protegia o color-mix; se não sobrou nenhum lá dentro, vale para todos
  return rewriteAt(
    css,
    (p) => /^@supports\s*\(\s*color\s*:\s*color-mix\(in lab,\s*red,\s*red\)\s*\)\s*$/.test(p.trim()),
    (inner, prelude) => (inner.includes("color-mix(") ? `${prelude}{${inner}}` : inner),
  );
}

/* ---------- flex gap ---------- */
function flexGapFallback(css) {
  const rules = [];
  for (const m of css.matchAll(/\.(gap(?:-[xy])?-[^\s{,:]+)\s*\{\s*((?:row-|column-)?gap)\s*:\s*([^;}]+);?\s*\}/g)) {
    const [, cls, prop, val] = m;
    const sel = `.${cls}`;
    // linha: margem à direita de cada filho menos o último ; ícones (svg) sempre, porque o texto solto depois deles não conta como filho
    const row = [`.no-flexgap .flex${sel}>:not(:last-child)`, `.no-flexgap .inline-flex${sel}>:not(:last-child)`, `.no-flexgap .flex${sel}>svg`, `.no-flexgap .inline-flex${sel}>svg`];
    const col = [`.no-flexgap .flex-col${sel}>*+*`, `.no-flexgap [class~="md:flex-col"]${sel}>*+*`];
    if (prop !== "row-gap") rules.push(`${row.join(",")}{margin-right:${val}}`);
    if (prop !== "column-gap") rules.push(`${col.join(",")}{margin-right:0;margin-top:${val}}`, `.no-flexgap .flex-wrap${sel}>*{margin-bottom:${val}}`);
  }
  return rules.length ? `${css}\n/* flex gap para TVs antigas */\n${rules.join("\n")}\n` : css;
}

function legacy(css) {
  css = unlayer(css);
  css = resolveColorMix(css);
  css = css.replace(/(--tw-gradient-position\s*:\s*[^;}]*?)\s+in\s+oklab/g, "$1");
  // space-x/space-y usam :where() (Chromium < 88 descarta a regra e os cards ficam colados)
  css = css.replace(/:where\((\.space-[xy]-[^\s>{}]+\s*>\s*:not\(:last-child\))\)/g, "$1");
  // inset (Chromium < 87): top/right/bottom/left antes, o inset continua valendo onde existe
  css = css.replace(/([{;])inset\s*:\s*([^;}\s]+)\s*(?=[;}])/g, "$1top:$2;right:$2;bottom:$2;left:$2;inset:$2");
  // translate como propriedade (Chromium < 104): transform equivalente só onde ela não existe
  const tr = [];
  for (const m of css.matchAll(/(\.[^{}@;]+)\{[^{}]*?translate\s*:\s*var\(--tw-translate-x\)\s+var\(--tw-translate-y\)/g)) tr.push(m[1]);
  if (tr.length) css += `\n@supports not (translate:0){${tr.join(",")}{transform:translate(var(--tw-translate-x),var(--tw-translate-y))}}\n`;
  css = rewriteAt(css, (p) => /^@supports\s*\(\(\(-webkit-hyphens|^@supports\s*\(\(-webkit-hyphens/.test(p.replace(/\s+/g, "")), unwrap);
  return flexGapFallback(css);
}

module.exports = function cssLegacyLoader(source) {
  const css = typeof source === "string" ? source : source.toString("utf8");
  this.callback(null, /@layer|@tailwind|color-mix|--tw-/.test(css) ? legacy(css) : css);
};
module.exports.legacy = legacy;
module.exports.unlayer = unlayer;
