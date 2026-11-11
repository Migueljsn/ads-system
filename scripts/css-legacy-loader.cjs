/*
 * Loader de CSS que roda depois do Tailwind: tira os blocos @layer, mantendo o conteúdo na mesma ordem.
 * Navegadores de TV (Tizen/webOS, Chromium < 99) não entendem @layer e descartam o bloco inteiro,
 * e a página abre sem estilo. O Tailwind emite as camadas já na ordem theme → base → components → utilities,
 * e o nosso CSS sem camada vem depois, então a cascata resultante é a mesma.
 */
function unlayer(css) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    // comentários e strings passam intactos
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      const stop = end === -1 ? css.length : end + 2;
      out += css.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== ch) j += css[j] === "\\" ? 2 : 1;
      out += css.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === "@" && css.startsWith("@layer", i) && !/[\w-]/.test(css[i + 6] ?? "")) {
      let j = i + 6;
      while (j < css.length && css[j] !== "{" && css[j] !== ";") j++;
      if (css[j] === ";") {
        // "@layer theme, base;" só declara a ordem: some
        i = j + 1;
        continue;
      }
      // acha o "}" correspondente e mantém só o conteúdo
      let depth = 1;
      let k = j + 1;
      while (k < css.length && depth > 0) {
        const c = css[k];
        if (c === "/" && css[k + 1] === "*") {
          const end = css.indexOf("*/", k + 2);
          k = end === -1 ? css.length : end + 2;
          continue;
        }
        if (c === '"' || c === "'") {
          let m = k + 1;
          while (m < css.length && css[m] !== c) m += css[m] === "\\" ? 2 : 1;
          k = m + 1;
          continue;
        }
        if (c === "{") depth++;
        else if (c === "}") depth--;
        k++;
      }
      out += unlayer(css.slice(j + 1, k - 1));
      i = k;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

module.exports = function cssLegacyLoader(source) {
  const css = typeof source === "string" ? source : source.toString("utf8");
  this.callback(null, css.includes("@layer") ? unlayer(css) : css);
};
module.exports.unlayer = unlayer;
