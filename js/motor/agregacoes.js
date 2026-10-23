// Agregações sobre as séries mensais do Resultado (regras-calculo.md, seção 11). Funções puras, sobre centavos inteiros.
// A tela, o Excel e o PowerPoint chamam as mesmas funções, para os mesmos números (CA-17).
import { COMPONENTES, ErroMotor } from "./constantes.js";
import { formatarFracao, rdiv } from "./numero.js";

const MAXS = Number.MAX_SAFE_INTEGER;

function seguro(x) {
  if (x > MAXS || x < -MAXS) {
    throw new ErroMotor({ codigo: "RESULTADO_GRANDE_DEMAIS", mensagem: "A soma passa do maior valor que o simulador consegue representar com exatidão.", caminho: "" });
  }
  return x;
}

/** Custo de cada exercício: [{ano, meses, valor}] (`meses` = meses calculados no exercício; nunca se anualiza em silêncio). */
export function porExercicio(serie, resultado) {
  return resultado.exercicios.map((ex) => {
    let valor = 0;
    for (let i = ex.inicio; i <= ex.fim; i++) valor = seguro(valor + serie[i]);
    return { ano: ex.ano, meses: ex.meses, valor };
  });
}

/** Janela móvel de 12 meses terminando em cada mês; `null` até o 11º mês (disponível a partir do 12º). */
export function janela12(serie) {
  const saida = new Array(serie.length).fill(null);
  let soma = 0;
  for (let i = 0; i < serie.length; i++) {
    soma = seguro(soma + serie[i]);
    if (i >= 12) soma = seguro(soma - serie[i - 12]);
    if (i >= 11) saida[i] = soma;
  }
  return saida;
}

/** Impacto incremental: proposta - atual, mês a mês (ou exercício a exercício). Positivo = a proposta custa mais. */
export function impacto(serieProposta, serieAtual) {
  if (serieProposta.length !== serieAtual.length) {
    throw new ErroMotor({ codigo: "FORMATO_INVALIDO", mensagem: "As séries comparadas têm tamanhos diferentes.", caminho: "" });
  }
  return serieProposta.map((v, i) => seguro(v - serieAtual[i]));
}

/**
 * Acumulado a partir do primeiro exercício. Aceita lista de números ou de {ano, meses, valor} (saída de `porExercicio`),
 * e devolve a mesma forma.
 */
export function acumulado(serieAnual) {
  let soma = 0;
  return serieAnual.map((x) => {
    if (x !== null && typeof x === "object") {
      soma = seguro(soma + x.valor);
      return { ...x, valor: soma };
    }
    soma = seguro(soma + x);
    return soma;
  });
}

function percentualTexto(dif, base) {
  if (base === 0) return "n/d";
  let num = BigInt(dif) * 100n;
  let den = BigInt(base);
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  return formatarFracao(num, den, 4);
}

/** Impacto relativo (dif / base, em %, texto com 4 casas); "n/d" se a base for zero. Aceita listas ou números. */
export function relativo(dif, base) {
  if (Array.isArray(dif)) return dif.map((d, i) => percentualTexto(d, Array.isArray(base) ? base[i] : base));
  return percentualTexto(dif, base);
}

function achar(resultado, carreiraId, cenarioId) {
  const carr = resultado.carreiras.find((c) => c.id === carreiraId);
  const cen = carr ? carr.cenarios.find((c) => c.id === cenarioId) : null;
  if (!cen) throw new ErroMotor({ codigo: "CAMPO_AUSENTE", mensagem: "Carreira ou cenário não encontrado no resultado.", caminho: "" });
  return cen;
}

/**
 * Custo por servidor-mês de cada exercício: total do exercício / soma dos servidores esperados nos meses do exercício
 * (o total inclui 13º, 1/3 de férias e encargos). Retorna [{ano, valor}] em centavos, arredondado ao centavo.
 */
export function custoPorServidorMes(resultado, carreiraId, cenarioId) {
  const cen = achar(resultado, carreiraId, cenarioId);
  const escala = BigInt(resultado.escalaServidores);
  return resultado.exercicios.map((ex) => {
    let total = 0n;
    let serv = 0n;
    for (let i = ex.inicio; i <= ex.fim; i++) {
      total += BigInt(cen.mensal.total[i]);
      serv += BigInt(cen.servidoresPrecisos[i]);
    }
    return { ano: ex.ano, valor: serv === 0n ? 0 : Number(rdiv(total * escala, serv)) };
  });
}

/**
 * Agregado de um grupo de carreiras (CA-11): soma mês a mês, por componente, dos cenários de papel `cenarioPapel`
 * (o primeiro de cada carreira com esse papel). Retorna { mensal, carreiraIds, ausentes } — `ausentes` lista as
 * carreiras sem cenário desse papel, que ficam fora da soma.
 */
export function agregado(resultado, carreiraIds, cenarioPapel) {
  const n = resultado.meses.length;
  const mensal = {};
  for (const c of COMPONENTES) mensal[c] = new Array(n).fill(0);
  const incluidas = [];
  const ausentes = [];
  for (const id of carreiraIds) {
    const carr = resultado.carreiras.find((c) => c.id === id);
    const cen = carr ? carr.cenarios.find((x) => x.papel === cenarioPapel) : null;
    if (!cen) {
      ausentes.push(id);
      continue;
    }
    incluidas.push(id);
    for (const c of COMPONENTES) for (let i = 0; i < n; i++) mensal[c][i] = seguro(mensal[c][i] + cen.mensal[c][i]);
  }
  return { mensal, carreiraIds: incluidas, ausentes };
}
