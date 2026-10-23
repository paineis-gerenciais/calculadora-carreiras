// Exportação para Excel (M4, CA-17): abas de resultados, evolução individual, comparação, premissas e avisos. Os números
// vêm do Resultado do motor e das agregações (motor/agregacoes.js), os mesmos da tela. Valores monetários saem como
// número (centavos / 100) com formato de 2 casas; todo texto sai como célula de texto, nunca como fórmula (MS-1).
import { agregado, custoPorServidorMes, janela12, porExercicio } from '../motor/agregacoes.js';
import { memoriaPremissas } from '../motor/premissas.js';
import { gerarXlsx } from '../externos/xlsx-escrita.js';
import { FRASE_AVISO, premissaPtBr } from '../ui/formatar.js';
import { cenariosDe, evolucaoPorAno, indiceVigencia, tabelaImpacto } from './dados.js';

const FUNDO_CAB = '#f0e9f0'; // accent-soft
const FUNDO_FIC = '#f8ecd6'; // warn-soft
const COR_FIC = '#7a4b0a'; // warn-dark

const R = (centavos) => ({ numero: centavos / 100, formato: 'dinheiro' });
const RN = (centavos, negrito = false) => ({ numero: centavos / 100, formato: 'dinheiro', negrito });
const INT = (n) => ({ numero: n, formato: 'inteiro' });
const PCT = (texto) => (texto === 'n/d' ? 'n/d' : { numero: Number(texto), formato: 'num2' });
const N2 = (texto) => ({ numero: Number(texto), formato: 'num2' });
const B = (texto) => ({ texto, negrito: true });
const cab = (...colunas) => colunas.map((t) => ({ texto: t, negrito: true, fundo: FUNDO_CAB, quebra: true }));

const pad = (n) => String(n).padStart(2, '0');
const dataHora = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Linhas do topo de toda aba: aviso "Dados fictícios" (se for o caso) e título. Devolve a lista de linhas. */
function topo(m, titulo) {
  const linhas = [];
  if (m.ficticio) linhas.push([{ texto: 'Dados fictícios. Todos os dados deste estudo são inventados.', negrito: true, fundo: FUNDO_FIC, cor: COR_FIC }]);
  linhas.push([B(titulo)]);
  return linhas;
}

/** Aba com topo, cabeçalho e linhas. Congela as linhas até o cabeçalho. */
function aba(m, nome, titulo, cabecalho, linhas, larguras, extraTopo = []) {
  const t = topo(m, titulo);
  const todas = [...t, ...extraTopo, [], cabecalho, ...linhas];
  return { nome, larguras, linhas: todas, congelarLinhas: t.length + extraTopo.length + 2 };
}

function abaResumo(m) {
  const { estudo, res } = m;
  const e = estudo.estudo;
  const linhas = [
    ...topo(m, 'Simulador de carreiras: resultados do estudo'),
    ['Estudo', e.nome],
    ['Tipo de dados', m.ficticio ? 'Dados fictícios' : 'Real anonimizado'],
    ['Impressão digital do estudo', m.impressao ?? '-'],
    ['Gerado em', dataHora(m.geradoEm)],
    ['Posição da base', e.mes_posicao],
    ['Horizonte', `${e.exercicios} exercícios (${res.meses[0]} a ${res.meses[res.meses.length - 1]})`],
    [FRASE_AVISO],
    ['Premissas e memória de cálculo (LRF, art. 16, § 2º): aba Premissas. Valores nominais, em R$.'],
    [],
    [B('Impacto das propostas sobre o cenário atual (R$)')],
    cab('Carreira', 'Proposta', 'Início da vigência', 'Impacto no exercício da vigência', 'Impacto nos 3 primeiros exercícios da vigência', 'Acumulado no horizonte'),
  ];
  const vig = indiceVigencia(res);
  let achou = false;
  for (const car of estudo.carreiras) {
    const { atual, propostas } = cenariosDe(res, car.id);
    for (const p of propostas) {
      achou = true;
      const t = tabelaImpacto(res, atual, p);
      const tres = t.linhas.slice(vig, vig + 3).reduce((s, x) => s + x.dif, 0);
      linhas.push([car.nome, p.nome, p.inicioVigencia, R(t.linhas[vig].dif), R(tres), R(t.total.dif)]);
    }
  }
  if (!achou) linhas.push(['Nenhuma carreira do estudo tem proposta: não há impacto a comparar.']);
  return { nome: 'Resumo', larguras: [34, 30, 20, 26, 30, 24], linhas, congelarLinhas: 0 };
}

function abaPorExercicio(m) {
  const { estudo, res } = m;
  const linhas = [];
  for (const car of estudo.carreiras) {
    for (const c of cenariosDe(res, car.id).todos) {
      const venc = porExercicio(c.mensal.vencimento, res);
      const par = porExercicio(c.mensal.parcelas, res);
      const d13 = porExercicio(c.mensal.decimo_terceiro, res);
      const fer = porExercicio(c.mensal.terco_ferias, res);
      const enc = porExercicio(c.mensal.encargos, res);
      const tot = porExercicio(c.mensal.total, res);
      const tt = { meses: 0, vv: 0, d13: 0, fer: 0, enc: 0, tot: 0 };
      res.exercicios.forEach((ex, i) => {
        const vv = venc[i].valor + par[i].valor;
        linhas.push([car.nome, c.nome, c.papel, INT(ex.ano), INT(ex.meses), R(vv), R(d13[i].valor), R(fer[i].valor), R(enc[i].valor), R(tot[i].valor)]);
        tt.meses += ex.meses; tt.vv += vv; tt.d13 += d13[i].valor; tt.fer += fer[i].valor; tt.enc += enc[i].valor; tt.tot += tot[i].valor;
      });
      linhas.push([B(car.nome), B(c.nome), B(c.papel), B('Total'), { numero: tt.meses, formato: 'inteiro', negrito: true }, RN(tt.vv, true), RN(tt.d13, true), RN(tt.fer, true), RN(tt.enc, true), RN(tt.tot, true)]);
    }
  }
  return aba(m, 'Por exercício', 'Custo por exercício e por componente (R$)',
    cab('Carreira', 'Cenário', 'Papel', 'Exercício', 'Meses calculados', 'Vencimentos e vantagens', '13º salário', '1/3 de férias', 'Encargos patronais', 'Total'),
    linhas, [26, 26, 10, 11, 12, 22, 16, 16, 18, 18],
    [['"Meses calculados" mostra os meses do exercício que entram no cálculo; nada é anualizado em silêncio.']]);
}

function abaMensal(m) {
  const { estudo, res } = m;
  const linhas = [];
  for (const car of estudo.carreiras) {
    for (const c of cenariosDe(res, car.id).todos) {
      const jan = janela12(c.mensal.total);
      res.meses.forEach((mes, i) => {
        linhas.push([car.nome, c.nome, mes, R(c.mensal.vencimento[i] + c.mensal.parcelas[i]), R(c.mensal.decimo_terceiro[i]), R(c.mensal.terco_ferias[i]),
          R(c.mensal.encargos[i]), R(c.mensal.total[i]), jan[i] === null ? '-' : R(jan[i]), N2(c.servidoresEsperados[i])]);
      });
    }
  }
  return aba(m, 'Mensal', 'Custo mensal por componente e janela móvel de 12 meses (R$)',
    cab('Carreira', 'Cenário', 'Mês', 'Vencimentos e vantagens', '13º salário', '1/3 de férias', 'Encargos patronais', 'Total do mês', 'Janela de 12 meses', 'Servidores esperados'),
    linhas, [26, 26, 10, 22, 16, 16, 18, 18, 20, 18],
    [['A janela de 12 meses fica disponível a partir do 12º mês projetado; antes disso mostra "-", nunca zero.']]);
}

function abaImpacto(m) {
  const { estudo, res } = m;
  const linhas = [];
  for (const car of estudo.carreiras) {
    const { atual, propostas } = cenariosDe(res, car.id);
    for (const p of propostas) {
      const t = tabelaImpacto(res, atual, p);
      for (const l of t.linhas) {
        linhas.push([car.nome, p.nome, INT(l.ano), INT(l.meses), INT(l.mesesImpacto), R(l.atual), R(l.proposta), R(l.dif), R(l.acum), PCT(l.pct)]);
      }
      linhas.push([B(car.nome), B(p.nome), B('Total'), { numero: t.total.meses, formato: 'inteiro', negrito: true }, '', RN(t.total.atual, true), RN(t.total.proposta, true),
        RN(t.total.dif, true), RN(t.total.acum, true), t.total.pct === 'n/d' ? 'n/d' : { numero: Number(t.total.pct), formato: 'num2', negrito: true }]);
    }
  }
  if (!linhas.length) linhas.push(['Nenhuma carreira do estudo tem proposta.']);
  return aba(m, 'Impacto', 'Impacto incremental: proposta menos cenário atual, mesma revisão geral nos dois (R$)',
    cab('Carreira', 'Proposta', 'Exercício', 'Meses calculados', 'Meses com impacto', 'Cenário atual', 'Proposta', 'Diferença', 'Diferença acumulada', 'Diferença (%)'),
    linhas, [26, 26, 11, 12, 12, 18, 18, 18, 20, 14],
    [['Impacto = proposta menos atual. "n/d" quando o custo atual é zero.']]);
}

function abaCompararCarreiras(m) {
  const { estudo, res } = m;
  const extra = [];
  const linhas = [];
  let cabecalho;
  let larguras;
  if (estudo.carreiras.length < 2) {
    extra.push(['A comparação entre carreiras exige duas ou mais carreiras no estudo.']);
    cabecalho = cab('Informação');
    larguras = [60];
  } else {
    const ids = estudo.carreiras.map((c) => c.id);
    const agg = agregado(res, ids, 'atual');
    const aggAnual = porExercicio(agg.mensal.total, res).map((x) => x.valor);
    const porCar = estudo.carreiras.map((c) => {
      const cen = res.carreiras.find((x) => x.id === c.id).cenarios.find((x) => x.papel === 'atual');
      return porExercicio(cen.mensal.total, res).map((x) => x.valor);
    });
    const medios = estudo.carreiras.map((c) => {
      const { atual, propostas } = cenariosDe(res, c.id);
      return { nome: c.nome, a: custoPorServidorMes(res, c.id, atual.id), p: propostas[0] ? custoPorServidorMes(res, c.id, propostas[0].id) : null };
    });
    res.exercicios.forEach((ex, i) => {
      linhas.push([INT(ex.ano), ...porCar.map((s) => R(s[i])), R(aggAnual[i])]);
    });
    linhas.push([]);
    linhas.push([B('Custo médio por servidor-mês (R$): total do exercício com 13º, 1/3 de férias e encargos, dividido pelos servidores-mês esperados')]);
    linhas.push(cab('Exercício', 'Carreira', 'Cenário atual', 'Primeira proposta'));
    for (const md of medios) {
      md.a.forEach((x, i) => linhas.push([INT(x.ano), md.nome, R(x.valor), md.p ? R(md.p[i].valor) : '-']));
    }
    cabecalho = cab('Exercício', ...estudo.carreiras.map((c) => `${c.nome} (atual)`), 'Agregado (soma das carreiras, atual)');
    larguras = [11, ...estudo.carreiras.map(() => 24), 30];
    extra.push(['Composição do custo anual por carreira no cenário atual (R$) e agregado; abaixo, o custo médio por servidor-mês.']);
  }
  return aba(m, 'Comparar carreiras', 'Comparação entre carreiras (R$)', cabecalho, linhas, larguras, extra);
}

function abaEvolucao(m) {
  const ev = m.evolucao;
  if (!ev) {
    return aba(m, 'Evolução individual', 'Evolução individual de um servidor', cab('Informação'),
      [['Não foi possível calcular a evolução individual deste estudo. Use a tela Evolução individual.']], [80]);
  }
  const r = ev.resultado;
  const rotValor = ev.certo ? 'Vencimento da tabela' : 'Valor esperado do vencimento da tabela';
  const rotPos = ev.certo ? 'Posição' : 'Posição mais provável';
  const extra = [
    [ev.padrao ? 'Simulação padrão: ingresso na primeira posição de cada eixo, no cenário atual (nenhuma simulação feita na tela evolução individual desde a última alteração do estudo).' : 'Simulação feita na tela Evolução individual.'],
    ['Carreira', ev.carreiraNome],
    ['Cenário simulado', ev.cenarioNome],
    ['Posição inicial', `${ev.posicao.eixo1}-${ev.posicao.eixo2}`],
    ['Meses já cumpridos no interstício (eixo 1; eixo 2)', `${ev.mesesCumpridos.eixo1}; ${ev.mesesCumpridos.eixo2}`],
    ['Horizonte', `${ev.anos} ano(s)`],
    ['Premissas usadas', ev.premissas],
    ['Vencimento da tabela da posição, sem parcelas, 13º, 1/3 de férias nem encargos.'],
    [],
    [B('Por exercício')],
    cab('Exercício', 'Meses', `${rotPos} ao fim`, `${rotValor} ao fim (R$)`, 'Soma no exercício (R$)'),
    ...evolucaoPorAno(r).map((x) => [x.ano, INT(x.meses), x.posicaoFim, R(x.valorFim), R(x.soma)]),
    [],
    [B('Mudanças de posição')],
    cab('Mês', 'Trilha', 'De', 'Para', 'Efeito'),
    ...(r.eventos.length
      ? r.eventos.map((e) => [e.mes, e.trilha, `${e.de.eixo1}-${e.de.eixo2}`, `${e.para.eixo1}-${e.para.eixo2}`, { aplicada: 'Mudou de posição', descartada: 'Não ocorreu (descartada)', topo: 'Já estava no topo: sem efeito' }[e.efeito] ?? e.efeito])
      : [['Nenhuma trilha venceu dentro do horizonte.']]),
    [],
    [B('Mês a mês')],
  ];
  const linhas = r.meses.map((mes, i) => [mes, `${r.posicaoProvavel[i].eixo1}-${r.posicaoProvavel[i].eixo2}`, R(r.valorEsperado[i])]);
  return aba(m, 'Evolução individual', 'Evolução individual de um servidor', cab('Mês', rotPos, `${rotValor} (R$)`), linhas, [30, 30, 28, 28, 26], extra);
}

function abaPremissas(m) {
  const memoria = memoriaPremissas(m.estudo, m.res);
  const extra = [
    ['Impressão digital do estudo', m.impressao ?? '-'],
    ['Código de 12 caracteres do conteúdo do estudo (SHA-256). Se não bater com o do último JSON guardado, o estudo foi alterado.'],
    [FRASE_AVISO],
    ['Memória de cálculo e premissas, conforme a LRF, art. 16, § 2º.'],
  ];
  const linhas = memoria.map((x) => [x.grupo, x.item, premissaPtBr(x.valor), x.origem === 'padrao' ? 'padrão' : 'definido']);
  return aba(m, 'Premissas', 'Premissas e memória de cálculo', cab('Grupo', 'Item', 'Valor', 'Origem'), linhas, [40, 36, 80, 12], extra);
}

function abaAvisos(m) {
  const { estudo, res } = m;
  const nome = (carId, cenId) => {
    const car = estudo.carreiras.find((c) => c.id === carId);
    const cen = car?.cenarios.find((c) => c.id === cenId);
    return [car?.nome ?? '-', cen?.nome ?? '-'];
  };
  const linhas = res.avisos.length
    ? res.avisos.map((a) => [a.mes ?? '-', ...nome(a.carreiraId, a.cenarioId), a.codigo ?? '-', a.mensagem])
    : [['Nenhum aviso.']];
  return aba(m, 'Avisos', 'Avisos do cálculo', cab('Mês', 'Carreira', 'Cenário', 'Código', 'Mensagem'), linhas, [10, 26, 26, 28, 90]);
}

/** Abas do XLSX (listas de células do adaptador). `m`: { estudo, res, impressao, geradoEm, evolucao }. */
export function montarAbas(m) {
  const modelo = { ...m, ficticio: m.estudo.tipo_dados === 'ficticio' };
  return [
    abaResumo(modelo), abaPorExercicio(modelo), abaMensal(modelo), abaImpacto(modelo), abaCompararCarreiras(modelo),
    abaEvolucao(modelo), abaPremissas(modelo), abaAvisos(modelo),
  ];
}

/** Gera o XLSX (Blob). */
export function gerarExcel(m, opcoes = {}) {
  return gerarXlsx(montarAbas(m), opcoes);
}
