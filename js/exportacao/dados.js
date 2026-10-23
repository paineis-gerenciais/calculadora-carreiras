// Dados comuns às exportações (Excel e PowerPoint): tabelas calculadas com as MESMAS funções de agregação da tela
// (motor/agregacoes.js), para que tela, planilha e slides mostrem os mesmos números (CA-17). Sem DOM; testável em Node.
import { acumulado, impacto, porExercicio, relativo } from '../motor/agregacoes.js';
import { evolucaoIndividual } from '../motor/simulacao.js';
import { percentual } from '../ui/formatar.js';

const soma = (xs) => xs.reduce((s, x) => s + x, 0);

/** Cenários de uma carreira do resultado, na ordem do estudo, com índice de estilo. */
export function cenariosDe(res, carreiraId) {
  const car = res.carreiras.find((c) => c.id === carreiraId);
  const lista = car.cenarios.map((c, idx) => ({ ...c, estilo: idx }));
  return { atual: lista.find((c) => c.papel === 'atual'), propostas: lista.filter((c) => c.papel === 'proposta'), todos: lista };
}

/** Meses do exercício `ex` a partir do início da vigência da proposta (meses com impacto). */
export function mesesComImpacto(res, ex, proposta) {
  return res.meses.slice(ex.inicio, ex.fim + 1).filter((m) => m >= proposta.inicioVigencia).length;
}

/**
 * Impacto da proposta sobre o atual, por exercício: { linhas: [{ano, meses, mesesImpacto, atual, proposta, dif, acum, pct}], total }.
 * Valores em centavos; `pct` é texto com 4 casas ou "n/d".
 */
export function tabelaImpacto(res, atual, proposta) {
  const exAt = porExercicio(atual.mensal.total, res).map((x) => x.valor);
  const exPr = porExercicio(proposta.mensal.total, res).map((x) => x.valor);
  const dif = impacto(exPr, exAt);
  const acum = acumulado(dif);
  const pct = relativo(dif, exAt);
  const linhas = res.exercicios.map((ex, i) => ({
    ano: ex.ano, meses: ex.meses, mesesImpacto: mesesComImpacto(res, ex, proposta), atual: exAt[i], proposta: exPr[i], dif: dif[i], acum: acum[i], pct: pct[i],
  }));
  const total = {
    meses: soma(res.exercicios.map((x) => x.meses)), atual: soma(exAt), proposta: soma(exPr), dif: soma(dif),
    acum: acum[acum.length - 1], pct: relativo(soma(dif), soma(exAt)),
  };
  return { linhas, total };
}

/** Índice do primeiro exercício a partir da vigência (0 se todos forem de depois da vigência). */
export const indiceVigencia = (res) => Math.max(0, res.exercicios.findIndex((x) => !x.anteriorVigencia));

/** Carreira que os slides mostram: a primeira com proposta, ou a primeira. */
export function carreiraPrincipal(estudo) {
  const i = estudo.carreiras.findIndex((c) => c.cenarios.some((x) => x.papel === 'proposta'));
  return Math.max(0, i);
}

/** Posição inicial padrão da evolução individual: a primeira de cada eixo. */
function evolucaoPadrao(estudo, indiceCarreira) {
  const car = estudo.carreiras[indiceCarreira];
  const atual = car.cenarios.find((c) => c.papel === 'atual');
  const eixos = atual.regras.eixos;
  return {
    carreira: car, cenario: atual, posicao: { eixo1: eixos[0].rotulos[0], eixo2: eixos[1].rotulos[0] },
    mesesCumpridos: { eixo1: 0, eixo2: 0 }, anos: Math.min(10, estudo.estudo.exercicios), padrao: true,
    estudoSim: estudo,
  };
}

let simulacaoRegistrada = null;
/** A tela Evolução individual registra a última simulação válida, para o Excel e o PowerPoint usarem a mesma. */
export function registrarSimulacao(info) { simulacaoRegistrada = info; }
export function limparSimulacao() { simulacaoRegistrada = null; }

/** Cópia do estudo sem as linhas da base (a evolução individual não usa a base). */
export function semBase(estudo) {
  return { ...estudo, carreiras: estudo.carreiras.map((c) => ({ ...c, base: { colunas: c.base.colunas, linhas: [] } })) };
}

/**
 * Evolução individual a exportar: a simulação feita na tela (se o estudo não mudou desde então) ou, sem ela, a do
 * ingresso na primeira posição de cada eixo, no cenário atual da carreira principal, rotulada como padrão.
 * Devolve null se não for possível calcular.
 */
export function evolucaoParaExportar(estudo, edicao) {
  let info = null;
  if (simulacaoRegistrada && simulacaoRegistrada.estudo === estudo && simulacaoRegistrada.edicao === edicao) info = simulacaoRegistrada;
  try {
    if (info) return { ...info, padrao: false };
    const p = evolucaoPadrao(estudo, carreiraPrincipal(estudo));
    const sim = semBase(estudo);
    const car = sim.carreiras[estudo.carreiras.indexOf(p.carreira)];
    const resultado = evolucaoIndividual(sim, car.id, car.cenarios.find((c) => c.id === p.cenario.id).id,
      { posicao: p.posicao, meses_cumpridos: p.mesesCumpridos }, p.anos * 12);
    return {
      carreiraNome: p.carreira.nome, cenarioNome: p.cenario.nome, posicao: p.posicao, mesesCumpridos: p.mesesCumpridos, anos: p.anos,
      resultado, certo: p.cenario.regras.trilhas.every((t) => Number(t.taxa_exito) === 100), premissas: premissasEvolucao(p.cenario, estudo.estudo.revisoes_gerais.length),
      padrao: true,
    };
  } catch {
    return null;
  }
}

/** Texto das premissas da evolução individual (igual ao da tela). */
export function premissasEvolucao(cenarioAtual, nRev) {
  const exitos = cenarioAtual.regras.trilhas.length
    ? cenarioAtual.regras.trilhas.map((t) => `${cenarioAtual.regras.eixos[t.eixo - 1].nome} ${percentual(t.taxa_exito)}`).join(' e ')
    : 'sem trilha';
  return `Êxito ${exitos}; revisão geral: ${nRev ? `${nRev} revisão(ões)` : 'nenhuma'}; efeito no mês seguinte ao interstício, mais o atraso configurado.`;
}

/** Resumo anual da evolução: [{ano, meses, posicaoFim, valorFim, soma}]. */
export function evolucaoPorAno(ev) {
  const mapa = new Map();
  ev.meses.forEach((m, i) => {
    const ano = m.slice(0, 4);
    const x = mapa.get(ano) ?? { ano, meses: 0, soma: 0, ultimo: i };
    x.meses++; x.soma += ev.valorEsperado[i]; x.ultimo = i;
    mapa.set(ano, x);
  });
  return [...mapa.values()].map((x) => ({
    ano: x.ano, meses: x.meses, posicaoFim: `${ev.posicaoProvavel[x.ultimo].eixo1}-${ev.posicaoProvavel[x.ultimo].eixo2}`, valorFim: ev.valorEsperado[x.ultimo], soma: x.soma,
  }));
}

export const abreviar = (texto, max) => (texto.length <= max ? texto : `${texto.slice(0, max - 1).trimEnd()}…`);

const sn = (b) => (b ? 'sim' : 'não');

/** Premissas do slide S2: 12 itens { rotulo, valor }, 6 por coluna (design: slides.md, seção 5). */
export function premissasResumidas(estudo, resultado, impressao) {
  const e = estudo.estudo;
  const i = carreiraPrincipal(estudo);
  const car = estudo.carreiras[i];
  const atual = car.cenarios.find((c) => c.papel === 'atual');
  const props = car.cenarios.filter((c) => c.papel === 'proposta');
  const versoes = atual.regras.versoes.slice().sort((a, b) => (a.inicio_vigencia < b.inicio_vigencia ? -1 : 1));
  const v = versoes[versoes.length - 1];
  const outras = estudo.carreiras.length - 1;
  const rev = e.revisoes_gerais.slice().sort((a, b) => (a.mes < b.mes ? -1 : 1));
  const trilhas = atual.regras.trilhas;
  const atrasos = [...new Set(trilhas.map((t) => t.atraso_efeito_meses))];
  const ultimoMes = resultado.meses[resultado.meses.length - 1];
  return [
    { rotulo: 'Carreira', valor: abreviar(`${car.nome}${outras ? ` (e mais ${outras}, no Excel)` : ''}`, 80) },
    { rotulo: 'Tabela vigente', valor: `início em ${v.inicio_vigencia}; valores de ${v.referencia_valores}` },
    { rotulo: 'Vigência da proposta', valor: abreviar(props.length ? props.map((p) => `${p.nome}: ${p.inicio_vigencia}`).join('; ') : 'sem proposta', 80) },
    { rotulo: 'Revisão geral', valor: abreviar(rev.length ? rev.map((r) => `${percentual(r.percentual)} em ${r.mes}`).join('; ') : 'nenhuma após a posição da base', 80) },
    { rotulo: 'Êxito nas trilhas', valor: abreviar(trilhas.length ? trilhas.map((t) => `${atual.regras.eixos[t.eixo - 1].nome} ${percentual(t.taxa_exito)}`).join('; ') : 'sem trilha', 80) },
    { rotulo: 'Efeito da progressão', valor: trilhas.length ? `mês seguinte ao interstício${atrasos.length === 1 && atrasos[0] > 0 ? `, mais ${atrasos[0]} mês(es) de atraso` : atrasos.length > 1 ? ', mais atraso por trilha' : ''}` : 'sem trilha' },
    { rotulo: 'Encargos patronais', valor: percentual(e.encargos_patronais) },
    { rotulo: 'Taxa anual de saída', valor: percentual(e.taxa_saida_anual) },
    { rotulo: 'Posição da base', valor: e.mes_posicao },
    { rotulo: 'Horizonte', valor: `${e.exercicios} exercícios (até ${ultimoMes})` },
    { rotulo: '13º e 1/3 de férias', valor: `13º: ${sn(e.decimo_terceiro.ativo)}; 1/3 de férias: ${sn(e.ferias_terco.ativo)}` },
    { rotulo: 'Impressão digital do estudo', valor: impressao ?? '-' },
  ];
}

const semAcento = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Parte do nome do arquivo derivada do nome do estudo: minúsculas, sem acento, só [a-z0-9-], até 40 caracteres. */
export function nomeSeguro(nome) {
  const s = semAcento(String(nome)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return s || 'estudo';
}

/** `<prefixo>-<nome>-AAAA-MM-DD-<impressão digital>.<extensão>` (O3: o código no nome do arquivo). */
export function nomeArquivo(prefixo, nomeEstudo, extensao, impressao, data = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const dia = `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}`;
  return `${prefixo}-${nomeSeguro(nomeEstudo)}-${dia}-${impressao ?? 'sem-codigo'}.${extensao}`;
}
