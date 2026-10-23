// Tabela de valores de uma versão: digitada ou gerada (modelo-parametros.md, seção 6), e revisão geral sobre a tabela.
// Valores em centavos. A tabela interna é uma lista plana (linha a linha: índice = i x n2 + j) de BigInt.
import { ErroMotor, LIMITES } from "./constantes.js";
import { E8, centavosDeTexto, microPercentual, pot10, rdiv } from "./numero.js";

function erroGerador(mensagem, caminho) {
  return new ErroMotor({ codigo: "GERADOR_INVALIDO", mensagem, caminho });
}

/**
 * Função (k, posicaoOutroEixo) -> fator (10^8 + P) do passo k -> k+1, onde P é o percentual em micro-percentuais.
 * `spec`: { constante } | { lista } | { faixas }; `n`: tamanho do eixo percorrido; `rotulosOutro`: rótulos do outro eixo.
 */
function fatoresDoEixo(spec, n, rotulosOutro, nome, caminho) {
  if (spec === null || typeof spec !== "object") throw erroGerador(`${nome}: informe constante, lista ou faixas.`, caminho);
  if (Object.hasOwn(spec, "constante")) {
    const f = E8 + BigInt(microPercentual(spec.constante));
    return () => f;
  }
  if (Object.hasOwn(spec, "lista")) {
    if (!Array.isArray(spec.lista) || spec.lista.length !== n - 1) {
      throw erroGerador(`${nome}: a lista deve ter ${n - 1} percentuais (um por passo).`, caminho);
    }
    const fs = spec.lista.map((p) => E8 + BigInt(microPercentual(p)));
    return (k) => fs[k];
  }
  if (Object.hasOwn(spec, "faixas")) {
    const idx = new Map(rotulosOutro.map((r, i) => [r, i]));
    const faixas = spec.faixas.map((f) => ({ de: idx.get(f.de), ate: idx.get(f.ate), f: E8 + BigInt(microPercentual(f.percentual)) }));
    if (faixas.some((f) => f.de === undefined || f.ate === undefined || f.de > f.ate)) {
      throw erroGerador(`${nome}: faixa com rótulo inexistente ou fora de ordem.`, caminho);
    }
    const porPosicao = rotulosOutro.map((_, i) => {
      const achadas = faixas.filter((f) => f.de <= i && i <= f.ate);
      if (achadas.length !== 1) {
        throw erroGerador(`${nome}: a posição "${rotulosOutro[i]}" do outro eixo deve estar em exatamente uma faixa.`, caminho);
      }
      return achadas[0].f;
    });
    return (_k, outro) => porPosicao[outro];
  }
  throw erroGerador(`${nome}: informe constante, lista ou faixas.`, caminho);
}

/**
 * Tabela da versão, em centavos (BigInt), lista plana linha a linha.
 * Gerador: valor(i,j) = arredondar_centavo(valor_base x prod_{k<i}(1+pct1_k) x prod_{k<j}(1+pct2_k(i))), um só
 * arredondamento no fim (regras-calculo, seção 3; caso de referência: 75 + 50 + 44 células da lei com R$ 0,00 de diferença).
 * `pct_eixo1` aceita constante ou lista; faixas só em `pct_eixo2` (indexadas pelos rótulos do eixo 1).
 */
export function tabelaBase(versao, eixos, caminho = "") {
  const rot1 = eixos[0].rotulos;
  const rot2 = eixos[1].rotulos;
  const n1 = rot1.length;
  const n2 = rot2.length;
  const flat = new Array(n1 * n2);
  if (versao.modo === "digitada") {
    for (let i = 0; i < n1; i++) for (let j = 0; j < n2; j++) flat[i * n2 + j] = centavosDeTexto(versao.valores[i][j]);
  } else {
    const g = versao.gerador;
    if (Object.hasOwn(g.pct_eixo1, "faixas")) {
      throw erroGerador("pct_eixo1: faixas só valem para o eixo 2 (percentual por faixa do eixo 1).", `${caminho}.gerador.pct_eixo1`);
    }
    const f1 = fatoresDoEixo(g.pct_eixo1, n1, rot2, "pct_eixo1", `${caminho}.gerador.pct_eixo1`);
    const f2 = fatoresDoEixo(g.pct_eixo2, n2, rot1, "pct_eixo2", `${caminho}.gerador.pct_eixo2`);
    const base = centavosDeTexto(g.valor_base);
    let p1 = 1n; // prod_{k<i} f1(k)
    for (let i = 0; i < n1; i++) {
      if (i > 0) p1 *= f1(i - 1, 0);
      let p2 = 1n; // prod_{k<j} f2(k, i)
      for (let j = 0; j < n2; j++) {
        if (j > 0) p2 *= f2(j - 1, i);
        flat[i * n2 + j] = rdiv(base * p1 * p2, pot10(8 * (i + j)));
      }
    }
  }
  for (const c of flat) {
    if (c <= 0n || c > LIMITES.celulaMaxCentavos) {
      throw new ErroMotor({ codigo: "VALOR_FORA_DO_LIMITE", mensagem: "Há valor de tabela fora da faixa de R$ 0,01 a R$ 999.999.999,99.", caminho });
    }
  }
  return flat;
}

/** Contrato da visão geral (5.2): `gerarTabela(versao, eixos) -> centavos[n1][n2]` (Number, seguro). */
export function gerarTabela(versao, eixos) {
  const flat = tabelaBase(versao, eixos);
  const n2 = eixos[1].rotulos.length;
  const n1 = eixos[0].rotulos.length;
  const saida = [];
  for (let i = 0; i < n1; i++) saida.push(flat.slice(i * n2, (i + 1) * n2).map(Number));
  return saida;
}

/** Aplica uma revisão geral: valor <- arredondar_centavo(valor x (1 + p)). `micro` = percentual x 10^6. */
export function aplicarRevisao(flat, micro) {
  const f = E8 + BigInt(micro);
  return flat.map((v) => rdiv(v * f, E8));
}
