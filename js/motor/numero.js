// Aritmética exata sobre BigInt (ADR 0001, decisão N3). Nenhuma conversão para Number antes do fim do cálculo.
// Dinheiro trabalha em centavos inteiros; percentuais em "micro-percentuais" (% x 10^6, inteiro);
// o fator de permanência r^(t-1) em 40 casas decimais.
import { CASAS_FATOR } from "./constantes.js";

const _pot = [1n];
/** 10^n como BigInt (com cache). */
export function pot10(n) {
  while (_pot.length <= n) _pot.push(_pot[_pot.length - 1] * 10n);
  return _pot[n];
}

export const E6 = pot10(6);
export const E8 = pot10(8); // 100 x 10^6: denominador de um micro-percentual convertido em fração
export const E12 = pot10(12);

/** Arredonda num/den ao inteiro, metade para cima. Exige num >= 0 e den > 0. */
export function rdiv(num, den) {
  return (num * 2n + den) / (den * 2n);
}

/** Como `rdiv`, com sinal: o negativo é o espelho do positivo (regras-calculo, seção 10, item 1). */
export function rdivS(num, den) {
  return num >= 0n ? rdiv(num, den) : -rdiv(-num, den);
}

export function mdc(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}

const RE_DINHEIRO = /^\d{1,9}(\.\d{1,2})?$/;
const RE_PERCENTUAL = /^-?\d{1,3}(\.\d{1,6})?$/;

export function dinheiroValido(texto) {
  return typeof texto === "string" && RE_DINHEIRO.test(texto);
}
export function percentualValido(texto) {
  return typeof texto === "string" && RE_PERCENTUAL.test(texto);
}

/** "2135.64" -> 213564n. Exige texto já conferido por `dinheiroValido`. */
export function centavosDeTexto(texto) {
  const [inteiro, frac = ""] = texto.split(".");
  return BigInt(inteiro) * 100n + BigInt((frac + "00").slice(0, 2));
}

/** "-2.5" -> -2500000 (percentual x 10^6, Number inteiro). Exige texto já conferido por `percentualValido`. */
export function microPercentual(texto) {
  const neg = texto.startsWith("-");
  const [inteiro, frac = ""] = (neg ? texto.slice(1) : texto).split(".");
  const n = Number(inteiro) * 1000000 + Number((frac + "000000").slice(0, 6));
  return neg ? -n : n;
}

/** Centavos (Number inteiro seguro ou BigInt) -> "1234.56" (texto sem separador de milhar). */
export function centavosParaTexto(c) {
  let n = typeof c === "bigint" ? c : BigInt(c);
  const sinal = n < 0n ? "-" : "";
  if (n < 0n) n = -n;
  return `${sinal}${n / 100n}.${String(n % 100n).padStart(2, "0")}`;
}

/** Fração num/den (den > 0) em texto com `casas` casas decimais, metade para cima (espelho no negativo). */
export function formatarFracao(num, den, casas) {
  const neg = num < 0n;
  const a = neg ? -num : num;
  const esc = pot10(casas);
  const n = rdiv(a * esc, den);
  const sinal = neg && n !== 0n ? "-" : "";
  return casas === 0 ? `${sinal}${n}` : `${sinal}${n / esc}.${String(n % esc).padStart(casas, "0")}`;
}

/**
 * Fator mensal de permanência r = (1 - s)^(1/12), arredondado a 12 casas (regras-calculo, seção 9).
 * `saidaMicro` é a taxa anual s em micro-percentuais (0 a 50 x 10^6). Retorna rn (BigInt) com r = rn / 10^12.
 * Inteiro puro: acha x = floor(r x 10^12) por busca binária em x^12 <= (1 - s) x 10^144 e arredonda pela metade.
 */
export function fatorPermanencia(saidaMicro) {
  if (saidaMicro === 0) return E12;
  // 1 - s = (10^8 - saidaMicro) / 10^8   (s = saidaMicro / 10^8)
  const alvo = (E8 - BigInt(saidaMicro)) * pot10(136); // (1 - s) x 10^144
  let lo = 0n;
  let hi = E12;
  while (lo < hi) {
    const meio = (lo + hi + 1n) >> 1n;
    if (meio ** 12n <= alvo) lo = meio;
    else hi = meio - 1n;
  }
  // metade para cima: ((2x + 1) / 2)^12 <= alvo  <=>  (2x + 1)^12 <= alvo x 2^12
  return (2n * lo + 1n) ** 12n <= alvo * 4096n ? lo + 1n : lo;
}

/**
 * Lista R[1..n] (índice 0 não usado) com R[t] = round(r^(t-1) x 10^casas), metade para cima, calculado a partir
 * da potência exata (sem acumular erro). Sem saída (r = 1), devolve escala 1 e R[t] = 1.
 * Retorna { escala: BigInt, R: BigInt[] }.
 */
export function potenciasPermanencia(rn, n, casas = CASAS_FATOR) {
  if (rn === E12) return { escala: 1n, R: [0n, ...new Array(n).fill(1n)] };
  const escala = pot10(casas);
  const R = [0n];
  let num = 1n; // rn^(t-1)
  let den = 1n; // 10^(12 (t-1))
  for (let t = 1; t <= n; t++) {
    R.push((num * escala * 2n + den) / (den * 2n));
    num *= rn;
    den *= E12;
  }
  return { escala, R };
}

/** "2026-12" -> índice absoluto do mês (ano x 12 + mês - 1). */
export function indiceMes(texto) {
  return Number(texto.slice(0, 4)) * 12 + Number(texto.slice(5, 7)) - 1;
}
/** Índice absoluto -> "2026-12". */
export function textoMes(idx) {
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}
const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;
export function mesValido(texto) {
  return typeof texto === "string" && RE_MES.test(texto);
}
