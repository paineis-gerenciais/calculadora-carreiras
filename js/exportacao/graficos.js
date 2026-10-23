// Especificação neutra dos gráficos (visão geral, seção 6.4). Funções puras, sem DOM: a tela (ui/graficos.js, Chart.js na
// página) e o PowerPoint (Chart.js num canvas fora da tela, virando PNG) desenham a MESMA especificação. As telas
// chamam estas funções para montar o gráfico; por isso o slide mostra os mesmos números da tela (CA-17).
//
// Forma da especificação: { tipo: 'linhas'|'degraus'|'barras'|'barras_empilhadas'|'barras_e_linha', categorias,
//   series: [{ nome, valores, estilo?, cor?, tipo?: 'bar'|'line', padrao?: bool, eixo?: 'y'|'y2' }], divisor, prefixo,
//   sufixo, tituloEixo, comecaEmZero, textoAlternativo, rotulosDegrau?, marcas?: [{ tipo: 'vigencia', categoria, texto }] }
// Cores são nomes de variável CSS (tokens.css); quem desenha as resolve.
import { acumulado, agregado, custoPorServidorMes, impacto, porExercicio, relativo } from '../motor/agregacoes.js';
import { milhoes, reais, rotuloExercicio } from '../ui/formatar.js';

/** Estilos das séries de cenário: atual cinza tracejado/quadrado; propostas roxo, verde-azulado, laranja. */
export function estiloDoCenario(indice) {
  return [
    { cor: '--serie-atual', marcador: 'rect', tracejado: [8, 4] },
    { cor: '--serie-p1', marcador: 'circle', tracejado: [] },
    { cor: '--serie-p2', marcador: 'triangle', tracejado: [] },
    { cor: '--serie-p3', marcador: 'rectRot', tracejado: [] },
  ][Math.min(indice, 3)];
}

export const COR_COMPONENTE = { vencimento: '--comp-ven', decimo_terceiro: '--comp-13', terco_ferias: '--comp-fer', encargos: '--comp-enc' };

/** Cores das carreiras no gráfico de comparação (tela Comparar). */
export const CORES_CARREIRA = ['--serie-p1', '--serie-p2', '--serie-p3', '--comp-ven', '--accent-mid', '--comp-fer'];

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2027-07" -> "jul/2027". */
export function mesCurto(mes) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes));
  return m ? `${MESES[Number(m[2]) - 1] ?? m[2]}/${m[1]}` : String(mes);
}

const FIC = (ficticio) => (ficticio ? ' Dados fictícios.' : '');

/** Marca de vigência: categoria do exercício que contém o início da vigência da primeira proposta, se houver. */
export function marcaDeVigencia(res, sels) {
  const proposta = sels.find((c) => c.papel === 'proposta');
  if (!proposta) return [];
  const idx = res.exercicios.findIndex((ex) => res.meses.slice(ex.inicio, ex.fim + 1).some((m) => m >= proposta.inicioVigencia));
  return idx < 0 ? [] : [{ tipo: 'vigencia', categoria: idx, texto: `vigência ${mesCurto(proposta.inicioVigencia)}` }];
}

/** Custo anual por cenário (visão "Custo por exercício"). `sels`: cenários do resultado com `estilo`. */
export function specCusto(res, sels, ficticio) {
  const categorias = res.exercicios.map(rotuloExercicio);
  const series = sels.map((c) => ({ nome: c.nome, valores: porExercicio(c.mensal.total, res).map((x) => x.valor), estilo: estiloDoCenario(c.estilo) }));
  const fim = res.exercicios.length - 1;
  const texto = `Custo anual por cenário, ${res.exercicios[0].ano} a ${res.exercicios[fim].ano}, em R$ milhões. ${series.map((s) => `${s.nome} em ${res.exercicios[fim].ano}: ${milhoes(s.valores[fim])}`).join('; ')}. O eixo não começa em zero.${FIC(ficticio)}`;
  return {
    tipo: 'linhas', categorias, series, divisor: 1e8, prefixo: 'R$ ', sufixo: ' mi', tituloEixo: 'R$ milhões (o eixo não começa em zero)',
    textoAlternativo: texto, comecaEmZero: false, marcas: marcaDeVigencia(res, sels),
  };
}

/** Dados do impacto de cada proposta: anual, acumulado e percentual sobre o atual. */
export function dadosImpacto(res, props, atuais) {
  return props.map((p) => {
    const anual = impacto(porExercicio(p.mensal.total, res).map((x) => x.valor), atuais);
    return { p, anual, acum: acumulado(anual), pct: relativo(anual, atuais) };
  });
}

/** Impacto incremental (barras da diferença anual + linha do acumulado). */
export function specImpacto(res, dados, ficticio) {
  const series = [];
  dados.forEach((d, k) => {
    series.push({ nome: `${d.p.nome}: diferença anual`, valores: d.anual, tipo: 'bar', padrao: k > 0, estilo: estiloDoCenario(d.p.estilo) });
  });
  // Acumulado: linha na cor `ink` (as barras usam a cor da proposta), marcador próprio por proposta e valor final rotulado.
  const marcadoresAcumulado = [{ marcador: 'circle', tracejado: [] }, { marcador: 'triangle', tracejado: [8, 4] }, { marcador: 'rectRot', tracejado: [2, 3] }];
  dados.forEach((d, k) => {
    series.push({ nome: `${d.p.nome}: acumulado`, valores: d.acum, tipo: 'line', cor: '--ink', estilo: { cor: '--ink', ...marcadoresAcumulado[Math.min(k, 2)] }, rotuloFinal: true });
  });
  const fim = res.exercicios.length - 1;
  const texto = `Impacto anual e acumulado em relação ao cenário atual, em R$ milhões. ${dados.map((d) => `${d.p.nome}: acumulado de ${milhoes(d.acum[fim])} até ${res.exercicios[fim].ano}`).join('; ')}.${FIC(ficticio)}`;
  return {
    tipo: 'barras_e_linha', categorias: res.exercicios.map(rotuloExercicio), series, divisor: 1e8, prefixo: 'R$ ', sufixo: ' mi',
    tituloEixo: 'R$ milhões', textoAlternativo: texto,
  };
}

/** Componentes anuais do custo de um cenário (centavos por exercício). */
export function componentesAnuais(res, c) {
  const m = c.mensal;
  const par = porExercicio(m.parcelas, res);
  const vv = porExercicio(m.vencimento, res).map((x, i) => x.valor + par[i].valor);
  return {
    vv,
    d13: porExercicio(m.decimo_terceiro, res).map((x) => x.valor),
    fer: porExercicio(m.terco_ferias, res).map((x) => x.valor),
    enc: porExercicio(m.encargos, res).map((x) => x.valor),
    tot: porExercicio(m.total, res).map((x) => x.valor),
  };
}

/** Barras empilhadas dos componentes do custo de um cenário. */
export function specComponentes(res, c, comp, ficticio) {
  const { vv, d13, fer, enc } = comp;
  const series = [
    { nome: 'Vencimentos e vantagens', valores: vv, cor: COR_COMPONENTE.vencimento, tipo: 'bar' },
    { nome: '13º salário', valores: d13, cor: COR_COMPONENTE.decimo_terceiro, tipo: 'bar' },
    { nome: '1/3 de férias', valores: fer, cor: COR_COMPONENTE.terco_ferias, tipo: 'bar', padrao: true },
    { nome: 'Encargos patronais', valores: enc, cor: COR_COMPONENTE.encargos, tipo: 'bar', padrao: true },
  ];
  const fim = res.exercicios.length - 1;
  const texto = `Componentes do custo de ${c.nome} por exercício, em R$ milhões. Em ${res.exercicios[fim].ano}: vencimentos e vantagens ${milhoes(vv[fim])}, 13º ${milhoes(d13[fim])}, 1/3 de férias ${milhoes(fer[fim])}, encargos ${milhoes(enc[fim])}.${FIC(ficticio)}`;
  return {
    tipo: 'barras_empilhadas', categorias: res.exercicios.map(rotuloExercicio), series, divisor: 1e8, prefixo: 'R$ ', sufixo: ' mi',
    tituloEixo: 'R$ milhões', textoAlternativo: texto,
  };
}

/** Custo mensal por cenário (visão "Mensal e janelas de 12 meses"). */
export function specMensal(res, sels, ficticio) {
  const series = sels.map((c) => ({ nome: c.nome, valores: c.mensal.total, estilo: estiloDoCenario(c.estilo) }));
  const texto = `Custo mensal por cenário, de ${res.meses[0]} a ${res.meses[res.meses.length - 1]}, em R$ mil.${FIC(ficticio)}`;
  return {
    tipo: 'linhas', categorias: res.meses, series, divisor: 1e5, prefixo: 'R$ ', sufixo: ' mil', tituloEixo: 'R$ mil por mês',
    textoAlternativo: texto, comecaEmZero: false,
  };
}

/** Composição do custo por carreira, empilhado (tela Comparar). `validas`: [{ id, nome, cen }]. */
export function seriesComposicao(validas, res) {
  return validas.map((s, i) => ({
    nome: s.nome, valores: porExercicio(s.cen.mensal.total, res).map((x) => x.valor), cor: CORES_CARREIRA[i % CORES_CARREIRA.length], tipo: 'bar', padrao: i >= 3,
  }));
}

export function specComposicao(res, series, aggAnual, ficticio) {
  const fim = res.exercicios.length - 1;
  const texto = `Custo anual por carreira, empilhado, de ${res.exercicios[0].ano} a ${res.exercicios[fim].ano}, em R$ milhões. Em ${res.exercicios[fim].ano}, o agregado soma ${reais(aggAnual[fim])}.${FIC(ficticio)}`;
  return { tipo: 'barras_empilhadas', categorias: res.exercicios.map(rotuloExercicio), series, divisor: 1e8, prefixo: 'R$ ', sufixo: ' mi', tituloEixo: 'R$ milhões', textoAlternativo: texto };
}

/** Agregado anual das carreiras `ids` no papel dado. */
export function agregadoAnual(res, ids, papel) {
  const agg = agregado(res, ids, papel);
  return porExercicio(agg.mensal.total, res).map((x) => x.valor);
}

/** Linhas do custo médio por servidor-mês de um exercício, da maior para a menor (cenário atual). */
export function linhasCustoMedio(res, validas, ano) {
  return validas.map((s) => {
    const a = custoPorServidorMes(res, s.id, s.atual.id).find((x) => x.ano === ano)?.valor ?? null;
    const p = s.proposta ? custoPorServidorMes(res, s.id, s.proposta.id).find((x) => x.ano === ano)?.valor ?? null : null;
    return { nome: s.nome, atual: a, proposta: p };
  }).sort((x, y) => (y.atual ?? 0) - (x.atual ?? 0));
}

export function specCustoMedio(linhas, ano, ficticio) {
  const series = [
    { nome: 'Cenário atual', valores: linhas.map((l) => l.atual), cor: '--serie-atual', tipo: 'bar' },
    { nome: 'Proposta', valores: linhas.map((l) => l.proposta), cor: '--serie-p1', tipo: 'bar', padrao: true },
  ];
  const texto = `Custo médio por servidor-mês em ${ano}, em reais, por carreira, do maior para o menor: ${linhas.map((l) => `${l.nome} ${reais(l.atual)}`).join('; ')}.${FIC(ficticio)}`;
  return { tipo: 'barras', categorias: linhas.map((l) => l.nome), series, divisor: 100, prefixo: 'R$ ', tituloEixo: 'R$ por servidor-mês', textoAlternativo: texto };
}

/** Rótulo de posição de uma linha da evolução. */
export const rotuloPosicao = (p) => `${p.eixo1}-${p.eixo2}`;

/** Evolução individual (degraus da remuneração). `ev`: Evolucao do motor. `rotValor`: "Vencimento da tabela" ou "Valor esperado...". */
export function specEvolucao(ev, rotValor, ficticio) {
  const n = ev.meses.length;
  const rot = ev.posicaoProvavel.map(rotuloPosicao);
  const rotulosDegrau = rot.map((r, i) => (i === 0 || r !== rot[i - 1] ? r : null));
  const fim = ev.valorEsperado[n - 1];
  const ini = ev.valorEsperado[0];
  const textoAlternativo = `${rotValor} de ${reais(ini)} em ${ev.meses[0]} (${rot[0]}) a ${reais(fim)} em ${ev.meses[n - 1]} (${rot[n - 1]}).${FIC(ficticio)}`;
  return {
    tipo: 'degraus', categorias: ev.meses, series: [{ nome: rotValor, valores: ev.valorEsperado, estilo: { cor: '--serie-p1', marcador: 'circle', tracejado: [] } }],
    divisor: 100, prefixo: 'R$ ', comecaEmZero: false, tituloEixo: 'R$ por mês', textoAlternativo, rotulosDegrau,
  };
}
