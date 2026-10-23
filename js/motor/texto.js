// Verificações de texto de entrada (parecer de segurança da G2, MS-1, itens 4 e 5). Funções puras.

// Controles C0 (exceto o que `permitirQuebra` libera), DEL, controles C1, e caracteres bidirecionais e de largura zero.
const RE_INVALIDOS = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/;
const RE_INVALIDOS_COM_QUEBRA = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/;
const RE_FORMULA = /^[=+\-@\t\r]/;

/** Verdadeiro se o texto tem caractere de controle, bidirecional ou de largura zero. */
export function temCaractereInvalido(s, permitirQuebra = false) {
  return (permitirQuebra ? RE_INVALIDOS_COM_QUEBRA : RE_INVALIDOS).test(s);
}

/** Verdadeiro se o texto começa com caractere que o Excel trataria como fórmula. */
export function iniciaComoFormula(s) {
  return RE_FORMULA.test(s);
}

/** Texto para mensagens: entre aspas, no máximo 40 caracteres, sem controles. Nunca é interpretado como HTML pela tela. */
export function citar(v) {
  if (typeof v !== "string") return String(typeof v === "object" ? "(valor inválido)" : v);
  const limpo = v.replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g, "?");
  return `"${limpo.length > 40 ? limpo.slice(0, 40) + "…" : limpo}"`;
}

/** Minúsculas, sem acentos e sem símbolos (planilha-base.md, seção 4). */
export function normalizarColuna(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Verdadeiro se o texto, em UTF-8, passa de `limite` bytes (mede de verdade só quando o resultado é incerto). */
export function excedeBytes(texto, limite) {
  if (texto.length > limite) return true; // cada unidade UTF-16 ocupa pelo menos 1 byte
  if (texto.length * 3 <= limite) return false; // e no máximo 3
  return new TextEncoder().encode(texto).length > limite;
}

/** Acumula erros com teto, para um arquivo com milhares de problemas não gerar milhares de mensagens. */
export class Coletor {
  constructor(max) {
    this.max = max;
    this.itens = [];
    this.total = 0;
  }
  add(item) {
    this.total++;
    if (this.itens.length < this.max) this.itens.push(item);
  }
  get omitidos() {
    return this.total - this.itens.length;
  }
}
