// 13º salário, adicional de 1/3 de férias e encargos por parcela (regras-calculo.md, seção 8A), em centavos (BigInt).
import { E8, E12, rdiv, rdivS, microPercentual } from "./numero.js";

/**
 * Configuração compilada a partir do bloco `estudo` do JSON v1.
 * `rm` = 10^12 - rn: parte do fator mensal que sai (1 - r = rm / 10^12).
 */
export function compilarDecimoFerias(estudo, rn) {
  const d = estudo.decimo_terceiro;
  const f = estudo.ferias_terco;
  const d13 = { ativo: d.ativo === true, mes1: null, A: 0n };
  if (d13.ativo && d.mes_primeira_parcela !== null) {
    d13.mes1 = d.mes_primeira_parcela;
    d13.A = BigInt(microPercentual(d.pct_primeira_parcela));
  }
  const fer = { ativo: f.ativo === true, fn: new Array(13).fill(0n), fd: new Array(13).fill(1n) };
  if (fer.ativo) {
    if (f.distribuicao === "uniforme") {
      for (let k = 1; k <= 12; k++) {
        fer.fn[k] = 1n;
        fer.fd[k] = 12n;
      }
    } else {
      for (let k = 1; k <= 12; k++) fer.fd[k] = E8;
      for (const item of f.meses) fer.fn[item.mes] = BigInt(microPercentual(item.percentual));
    }
  }
  return {
    d13,
    fer,
    rm: E12 - rn,
    enB: BigInt(microPercentual(estudo.encargos_patronais)),
    enc13: estudo.encargos_incidem.decimo_terceiro === true,
    encFer: estudo.encargos_incidem.terco_ferias === true,
    fixaIntegra: estudo.fixa_integra_remuneracao === true,
  };
}

/**
 * 13º do mês (centavos, BigInt; negativo só se a remuneração cair depois da 1ª parcela, arredondado pelo valor absoluto).
 * k = mês do ano (1 a 12); rb = remuneração-base do mês; rbI e Ri = remuneração-base e fator de permanência do mês de
 * referência do adiantamento (mês da 1ª parcela do exercício, ou o mês 1 se ela cai antes do horizonte); tM1 = índice do
 * mês da 1ª parcela do exercício (`t === tM1` paga a 1ª parcela); Rt = fator de permanência do mês.
 */
export function decimoTerceiro(cfg, t, k, tM1, rb, rbI, Rt, Ri) {
  const c = cfg.d13;
  if (!c.ativo) return 0n;
  const rm = cfg.rm;
  if (c.mes1 === null) {
    if (k === 12) return rb;
    if (rm === 0n) return 0n;
    return rdiv(rb * rm * BigInt(k), 12n * E12);
  }
  const A = c.A;
  const kb = BigInt(k);
  if (k === 12) {
    // rb - A x rbI x Rt / (E8 x Ri)
    return rdivS(rb * E8 * Ri - A * rbI * Rt, E8 * Ri);
  }
  if (k >= c.mes1) {
    // x + rm/E12 x (rb k/12 - adiantamento), com x = A rb / E8 apenas no mês da 1ª parcela
    let num = rm * (rb * kb * E8 * Ri - 12n * A * rbI * Rt);
    const den = E12 * 12n * E8 * Ri;
    if (t === tM1) num += A * rb * E12 * 12n * Ri;
    return rdivS(num, den);
  }
  if (rm === 0n) return 0n;
  return rdiv(rb * rm * kb, 12n * E12);
}

/** 1/3 de férias do mês: arred(rb x f_k / 3). */
export function tercoFerias(cfg, k, rb) {
  const f = cfg.fer;
  if (!f.ativo) return 0n;
  const fn = f.fn[k];
  if (fn === 0n) return 0n;
  return rdiv(rb * fn, 3n * f.fd[k]);
}

/** Encargos: arred(e x (VEN+PAR)) + [incide no 13º] arred(e x 13º) + [incide no 1/3] arred(e x 1/3). */
export function encargos(cfg, vencPar, d13, fer) {
  let enc = rdiv(cfg.enB * vencPar, E8);
  if (cfg.enc13 && d13 !== 0n) enc += rdivS(cfg.enB * d13, E8);
  if (cfg.encFer && fer !== 0n) enc += rdiv(cfg.enB * fer, E8);
  return enc;
}
