// Formatação para exibição (pt-BR). Só apresenta: nada aqui volta ao cálculo. Dinheiro vem em centavos inteiros.
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const decimal1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const decimal2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 123456 -> "R$ 1.234,56". null -> "-". */
export function reais(centavos) {
  if (centavos === null || centavos === undefined) return '-';
  return moeda.format(centavos / 100).replace(/ /g, ' ');
}

/**
 * 1620000000 -> "R$ 16,2 mi"; 20951597 -> "R$ 0,2 mi". Regra (docs/design/slides.md, "Números"): títulos, cartões e rótulos
 * de gráfico usam sempre R$ milhões com 1 casa, sem misturar unidades; o valor exato (R$ com centavos) fica nas tabelas.
 * Única exceção: valor diferente de zero que arredondaria para "0,0 mi" aparece em reais, para não parecer zero.
 */
export function milhoes(centavos) {
  if (centavos === null || centavos === undefined) return '-';
  const abs = Math.abs(centavos);
  if (abs !== 0 && abs < 5000000) return reais(centavos);
  return `${centavos < 0 ? '-' : ''}R$ ${decimal1.format(abs / 100000000)} mi`;
}

/** "7.1234" -> "7,12%". "n/d" fica "n/d". */
export function percentual(texto) {
  if (texto === null || texto === undefined) return '-';
  if (texto === 'n/d') return 'n/d';
  const n = Number(texto);
  return Number.isFinite(n) ? `${decimal2.format(n)}%` : String(texto);
}

/** "915.4991" -> "915,5". */
export function servidores(texto) {
  const n = Number(texto);
  return Number.isFinite(n) ? decimal1.format(n) : String(texto);
}

/** Texto decimal do modelo ("2135.64") para o campo de edição ("2135,64"). */
export function decimalParaCampo(texto) {
  return typeof texto === 'string' ? texto.replace('.', ',') : '';
}

/**
 * Texto do campo para o modelo: aceita "2.135,64", "2135,64" e "2135.64". Se não for número, devolve o texto como está
 * (o validador do motor recusa e a tela mostra o motivo no campo).
 */
export function campoParaDecimal(texto) {
  const t = String(texto ?? '').trim();
  return t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
}

/**
 * Valor de premissa (texto do motor, com ponto decimal) para exibição e planilha: "R$ 2135.64" -> "R$ 2.135,64",
 * "3.5%" -> "3,5%". Só mexe em números precedidos de "R$ " ou seguidos de "%"; versões e datas ficam como estão.
 */
export function premissaPtBr(texto) {
  const milhar = (i) => i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return String(texto)
    .replace(/R\$ (\d+)(?:\.(\d+))?/g, (_, i, d) => `R$ ${milhar(i)}${d ? `,${d}` : ''}`)
    .replace(/(\d+)(?:\.(\d+))?%/g, (_, i, d) => `${milhar(i)}${d ? `,${d}` : ''}%`);
}

/** "Salvo às 14:32". */
export function hora(data) {
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Data e hora curta para a lista de estudos. */
export function dataHora(data) {
  if (!(data instanceof Date) || Number.isNaN(data.getTime())) return '-';
  return data.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Rótulo de exercício: "2027" ou "2027 (6 meses)" quando parcial. */
export function rotuloExercicio(ex) {
  return ex.meses < 12 ? `${ex.ano} (${ex.meses} meses)` : String(ex.ano);
}

export const FRASE_AVISO = 'Estimativa de apoio à decisão; não é peça oficial; a validação jurídica é do órgão.';
