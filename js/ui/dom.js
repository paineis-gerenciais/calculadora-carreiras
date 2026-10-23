// Montagem de DOM sem marcação: dados só entram por textContent e createElement (parecer MS-1, item 1).
// Atributos passam por uma lista fechada; nenhum atributo executável (on*, style, href e src com dado).
const ATRIBUTO_OK = /^(class|id|role|tabindex|type|hidden|title|lang|for|name|colspan|rowspan|scope|headers|value|min|max|step|inputmode|autocomplete|accept|multiple|disabled|readonly|required|placeholder|rows|maxlength|checked|selected|open|width|height|aria-[a-z]+|data-[a-z-]+)$/;
const ROTA_OK = /^#\/[a-z-]+$/;

/** criar('p', {class: 'x'}, 'texto', outroNo): textos viram nós de texto (nunca marcação). */
export function criar(tag, atributos = {}, ...filhos) {
  const no = document.createElement(tag);
  for (const [nome, valor] of Object.entries(atributos)) {
    if (!ATRIBUTO_OK.test(nome)) throw new Error(`atributo não permitido: ${nome}`);
    if (valor === false || valor == null) continue;
    no.setAttribute(nome, valor === true ? '' : String(valor));
  }
  for (const f of filhos.flat(Infinity)) {
    if (f == null || f === false) continue;
    no.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return no;
}

/** Link para uma rota interna do app. Recusa qualquer destino que não seja "#/nome". */
export function linkRota(texto, rota, atributos = {}) {
  if (!ROTA_OK.test(rota)) throw new Error(`rota inválida: ${rota}`);
  const a = criar('a', atributos, texto);
  a.href = rota;
  return a;
}

export const esvaziar = (no) => no.replaceChildren();

/** Como `pai.append(...)`, mas ignora null, undefined e false (append nativo escreveria o texto "null"). */
export function anexar(pai, ...filhos) {
  for (const f of filhos.flat(Infinity)) {
    if (f == null || f === false) continue;
    pai.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return pai;
}
