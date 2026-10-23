// Exportação para PowerPoint (M5, CA-18, CA-19, CA-20): os 8 slides do modelo (docs/design/slides.md), 16:9, texto e tabelas
// nativos em Arial, gráficos como imagem desenhada da mesma especificação da tela (exportacao/graficos.js), os dois logos
// da raiz do site, selo "Dados fictícios" e impressão digital do estudo no slide de premissas.
// Os números vêm das mesmas funções da tela (agregacoes.js) e do Resultado do motor (CA-17).
//
// gerarPptx não conhece o navegador: `desenhar(spec, { largura, altura, larguraPol })` devolve o PNG como data URL e
// `logos` vem de exportacao/logos.js. Assim o gerador roda em Node nos testes.
import { agregado, porExercicio, relativo } from '../motor/agregacoes.js';
import { FRASE_AVISO, milhoes, percentual, reais } from '../ui/formatar.js';
import { abreviar, carreiraPrincipal, cenariosDe, indiceVigencia, premissasResumidas, tabelaImpacto } from './dados.js';
import {
  agregadoAnual, componentesAnuais, dadosImpacto, seriesComposicao, specComponentes, specComposicao, specCusto, specEvolucao, specImpacto,
} from './graficos.js';

// Tokens (tokens.css), sem "#".
const COR = {
  accent: '65266D', accentSoft: 'F0E9F0', accentTint: 'E0D4E2', ink: '242321', inkSoft: '494745', borda: 'D1BED3', branco: 'FFFFFF',
  warnSoft: 'F8ECD6', warnDark: '7A4B0A',
};
const FONTE = 'Arial';
const LARGURA_PAGINA = 13.333;
const MARGEM = 0.5;
const LARGURA_UTIL = 12.33;
const LOGO_MAX = { esquerda: { l: 2.4, a: 0.6 }, direita: { l: 1.65, a: 0.6 } };
const IMG = { largura: 2400 };
const MAX_LINHAS_TABELA = 8;

const soma = (xs) => xs.reduce((s, x) => s + x, 0);
const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function mesEAno(data) {
  return maiuscula(data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
}

/** Texto de impacto em milhões, sem sinal ("R$ 3,5 mi"). */
const mi = (centavos) => milhoes(Math.abs(centavos));

class Construtor {
  constructor(PptxGenJS, m, logos) {
    this.pptx = new PptxGenJS();
    this.pptx.layout = 'LAYOUT_WIDE';
    this.pptx.title = m.estudo.estudo.nome;
    this.pptx.author = 'Simulador de carreiras';
    this.pptx.subject = 'Proposta de plano de carreira: impacto financeiro';
    // Mestres com o título como espaço reservado: o PowerPoint e os leitores de tela reconhecem o título de cada slide.
    const titulo = (o) => ({ placeholder: { options: { name: 'titulo', type: 'title', fontFace: FONTE, margin: 0, valign: 'middle', align: 'left', ...o }, text: '' } });
    this.pptx.defineSlideMaster({
      title: 'MODELO', background: { color: COR.branco },
      objects: [titulo({ x: MARGEM, y: 1.2, w: LARGURA_UTIL, h: 0.9, fontSize: 28, bold: true, color: COR.accent })],
    });
    this.pptx.defineSlideMaster({
      title: 'CAPA', background: { color: COR.branco },
      objects: [titulo({ x: MARGEM, y: 2.2, w: LARGURA_UTIL, h: 1.6, fontSize: 36, bold: true, color: COR.branco })],
    });
    this.m = m;
    this.logos = logos;
    this.ficticio = m.estudo.tipo_dados === 'ficticio';
    this.n = 0;
    this.avisos = [];
    for (const lado of ['esquerda', 'direita']) {
      if (!logos[lado]) this.avisos.push(`O arquivo do logo ${lado} não foi encontrado na raiz do site: os slides mostram uma caixa no lugar.`);
    }
  }

  texto(slide, texto, opcoes) {
    slide.addText(texto, { fontFace: FONTE, lang: 'pt-BR', margin: 0, ...opcoes });
  }

  logo(slide, lado) {
    const max = LOGO_MAX[lado];
    const y0 = 0.3;
    const alturaCab = 0.7;
    const l = this.logos[lado];
    if (l) {
      const k = Math.min(max.l / l.largura, max.a / l.altura);
      const w = l.largura * k;
      const h = l.altura * k;
      const x = lado === 'esquerda' ? MARGEM : MARGEM + LARGURA_UTIL - w;
      slide.addImage({ data: l.dados, x, y: y0 + (alturaCab - h) / 2, w, h, altText: `Logo ${lado}` });
    } else {
      const x = lado === 'esquerda' ? MARGEM : MARGEM + LARGURA_UTIL - max.l;
      this.texto(slide, `Logo ${lado} (arquivo a fornecer)`, {
        x, y: y0 + (alturaCab - max.a) / 2, w: max.l, h: max.a, shape: this.pptx.ShapeType.rect, line: { color: COR.inkSoft, width: 1, dashType: 'dash' },
        fill: { color: COR.branco }, fontSize: 12, color: COR.inkSoft, align: 'center', valign: 'middle', margin: 0.05,
      });
    }
  }

  selo(slide) {
    const o = { x: 8.4, y: 6.8, w: 3.0, h: 0.34, shape: this.pptx.ShapeType.roundRect, rectRadius: 0.05, fontSize: 12, bold: true, align: 'center', valign: 'middle' };
    if (this.ficticio) this.texto(slide, '▲ Dados fictícios', { ...o, fill: { color: COR.warnSoft }, line: { color: COR.warnDark, width: 1 }, color: COR.warnDark });
    else this.texto(slide, 'Real anonimizado', { ...o, fill: { color: COR.accentTint }, line: { color: COR.accent, width: 1 }, color: COR.accent });
  }

  /** Slide com cabeçalho (2 logos), filete, título, rodapé (nota, selo, número). */
  novo({ titulo, nota, capa = false }) {
    const slide = this.pptx.addSlide({ masterName: capa ? 'CAPA' : 'MODELO' });
    this.n++;
    this.logo(slide, 'esquerda');
    this.logo(slide, 'direita');
    slide.addShape(this.pptx.ShapeType.rect, { x: MARGEM, y: 1.05, w: LARGURA_UTIL, h: 0.04, fill: { color: COR.accent }, line: { color: COR.accent, width: 0 } });
    if (!capa) slide.addText(abreviar(titulo, 118), { placeholder: 'titulo', lang: 'pt-BR' });
    this.texto(slide, abreviar(nota, 165), { x: MARGEM, y: 6.75, w: 7.7, h: 0.5, fontSize: 12, color: COR.inkSoft, valign: 'middle' });
    this.selo(slide);
    this.texto(slide, String(this.n), { x: 12.0, y: 6.75, w: 0.83, h: 0.5, fontSize: 12, color: COR.inkSoft, align: 'right', valign: 'middle' });
    return slide;
  }

  /** Desenha a especificação como PNG (mínimo de 1920 px de largura, slides.md seção 6) e a insere com texto alternativo. */
  async imagem(slide, spec, { x, y, w, h }) {
    const pxPorPol = Math.max(IMG.largura / LARGURA_UTIL, 1920 / w);
    const url = await this.m.desenhar(spec, { largura: Math.round(w * pxPorPol), altura: Math.round(h * pxPorPol), larguraPol: w });
    slide.addImage({ data: url.replace(/^data:/, ''), x, y, w, h, altText: spec.textoAlternativo });
  }
}

function celulaTab(texto, { num = false, negrito = false, fundo = null } = {}) {
  const o = { fontFace: FONTE, fontSize: 14, color: COR.ink, align: num ? 'right' : 'left', valign: 'middle', bold: negrito, lang: 'pt-BR' };
  if (fundo) o.fill = { color: fundo };
  return { text: texto, options: o };
}

function nomeCurto(t, max = 30) { return abreviar(t, max); }

// ----------------------------------------------------------------------------------------------------- slides

function capa(c) {
  const { estudo } = c.m;
  const s = c.novo({ capa: true, nota: c.m.notaFonte });
  s.addShape(c.pptx.ShapeType.rect, { x: 0, y: 1.4, w: LARGURA_PAGINA, h: 4.9, fill: { color: COR.accent }, line: { color: COR.accent, width: 0 } });
  s.addText(abreviar(estudo.estudo.nome, 90), { placeholder: 'titulo', lang: 'pt-BR' });
  c.texto(s, 'Proposta de plano de carreira: impacto financeiro', { x: MARGEM, y: 4.0, w: LARGURA_UTIL, h: 0.5, fontSize: 20, color: COR.branco, valign: 'middle' });
  c.texto(s, mesEAno(c.m.geradoEm), { x: MARGEM, y: 4.6, w: LARGURA_UTIL, h: 0.5, fontSize: 20, color: COR.branco, valign: 'middle' });
}

function premissas(c) {
  const itens = premissasResumidas(c.m.estudo, c.m.res, c.m.impressao);
  const s = c.novo({
    titulo: 'As premissas do estudo definem o resultado: confira antes de usar os números',
    nota: 'Estimativa de apoio à decisão; não é peça oficial. Premissas completas e memória de cálculo no arquivo Excel.',
  });
  const coluna = (lista, x) => {
    const runs = [];
    lista.forEach((it, i) => {
      runs.push({ text: `${it.rotulo}: `, options: { bold: true, color: COR.ink } });
      runs.push({ text: it.valor, options: { color: COR.ink, breakLine: i < lista.length - 1 } });
    });
    c.texto(s, runs, { x, y: 2.2, w: 6.0, h: 4.4, fontSize: 18, valign: 'top', paraSpaceAfter: 8 });
  };
  coluna(itens.slice(0, 6), MARGEM);
  coluna(itens.slice(6, 12), MARGEM + 6.33);
}

/** Formata os valores da tabela de impacto: reais com centavos, ou milhares inteiros se não couber. */
function formatadorDeTabela(valores) {
  const longo = valores.some((v) => reais(v).length > 17);
  return longo
    ? { fmt: (v) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.round(v / 100000)), unidade: 'R$ mil' }
    : { fmt: (v) => reais(v), unidade: 'R$' };
}

function tabelaDeImpacto(c, { atual, proposta, res }) {
  const nomeP = nomeCurto(proposta.nome, 18);
  const t = tabelaImpacto(res, atual, proposta);
  const vig = indiceVigencia(res);
  const linhas = t.linhas.slice(vig, vig + MAX_LINHAS_TABELA);
  const cortou = vig + MAX_LINHAS_TABELA < t.linhas.length;
  const todos = [...t.linhas.flatMap((l) => [l.atual, l.proposta, l.dif, l.acum]), t.total.atual, t.total.proposta, t.total.dif, t.total.acum];
  const { fmt, unidade } = formatadorDeTabela(todos);
  const cabecalho = ['Exercício', 'Meses', `Atual (${unidade})`, `${nomeP} (${unidade})`, `Diferença (${unidade})`, `Acumulado (${unidade})`]
    .map((h) => celulaTab(h, { negrito: true, fundo: COR.accentSoft, num: h !== 'Exercício' }));
  const corpo = linhas.map((l) => [
    celulaTab(String(l.ano)),
    celulaTab(l.mesesImpacto > 0 && l.mesesImpacto < l.meses ? `${l.meses} (${l.mesesImpacto} com impacto)` : String(l.meses), { num: true }),
    celulaTab(fmt(l.atual), { num: true }), celulaTab(fmt(l.proposta), { num: true }), celulaTab(fmt(l.dif), { num: true, negrito: true }), celulaTab(fmt(l.acum), { num: true }),
  ]);
  const tot = [`Total${cortou ? ' (todos os exercícios)' : ''}`, String(t.total.meses), fmt(t.total.atual), fmt(t.total.proposta), fmt(t.total.dif), fmt(t.total.acum)]
    .map((x, i) => celulaTab(x, { negrito: true, fundo: COR.accentTint, num: i > 0 }));
  return { linhas: [cabecalho, ...corpo, tot], cortou, t, vig };
}

function slideTabela(c, ctx) {
  const { res, atual, propostas } = ctx;
  const p = propostas[0];
  if (!p) {
    const exAt = porExercicio(atual.mensal.total, res);
    const vig = indiceVigencia(res);
    const linhas = exAt.slice(vig, vig + MAX_LINHAS_TABELA);
    const todos = exAt.map((x) => x.valor);
    const { fmt, unidade } = formatadorDeTabela(todos);
    const s = c.novo({
      titulo: `O cenário atual custa ${mi(exAt[exAt.length - 1].valor)} em ${exAt[exAt.length - 1].ano}; não há proposta para comparar`,
      nota: c.m.notaFonte,
    });
    const corpo = linhas.map((l) => [celulaTab(String(l.ano)), celulaTab(String(l.meses), { num: true }), celulaTab(fmt(l.valor), { num: true })]);
    s.addTable([
      ['Exercício', 'Meses', `Atual (${unidade})`].map((h) => celulaTab(h, { negrito: true, fundo: COR.accentSoft, num: h !== 'Exercício' })), ...corpo,
      ['Total', String(soma(exAt.map((x) => x.meses))), fmt(soma(todos))].map((x, i) => celulaTab(x, { negrito: true, fundo: COR.accentTint, num: i > 0 })),
    ], { x: MARGEM, y: 2.2, w: LARGURA_UTIL, colW: [3, 3, 6.33], rowH: 0.4, border: { type: 'solid', pt: 0.5, color: COR.borda } });
    return;
  }
  const { linhas, cortou, t, vig } = tabelaDeImpacto(c, { atual, proposta: p, res });
  const lv = t.linhas[vig];
  const sinal = (v) => (v >= 0 ? 'a mais' : 'a menos');
  const s = c.novo({
    titulo: `${nomeCurto(p.nome)} custa ${mi(lv.dif)} ${sinal(lv.dif)} em ${lv.ano} e ${mi(t.total.acum)} ${sinal(t.total.acum)} acumulados até ${res.exercicios[res.exercicios.length - 1].ano}`,
    nota: c.m.notaFonte,
  });
  s.addTable(linhas, { x: MARGEM, y: 2.2, w: LARGURA_UTIL, colW: [1.4, 2.4, 2.1, 2.1, 2.2, 2.13], rowH: 0.4, border: { type: 'solid', pt: 0.5, color: COR.borda } });
  if (cortou) {
    c.texto(s, 'Demais exercícios no arquivo Excel.', { x: MARGEM, y: 6.3, w: LARGURA_UTIL, h: 0.3, fontSize: 14, color: COR.inkSoft, valign: 'middle' });
  }
}

async function slideCusto(c, ctx) {
  const { res, atual, propostas } = ctx;
  const sels = [atual, ...propostas.slice(0, 3)];
  const spec = specCusto(res, sels, c.ficticio);
  const fim = res.exercicios.length - 1;
  const ano = res.exercicios[fim].ano;
  const valorFim = (cen) => porExercicio(cen.mensal.total, res)[fim].valor;
  const titulo = propostas.length
    ? `O custo anual de ${nomeCurto(propostas[0].nome)} chega a ${mi(valorFim(propostas[0]))} em ${ano}, contra ${mi(valorFim(atual))} no cenário atual`
    : `O custo anual do cenário atual vai de ${mi(porExercicio(atual.mensal.total, res)[0].valor)} em ${res.exercicios[0].ano} a ${mi(valorFim(atual))} em ${ano}`;
  const s = c.novo({ titulo, nota: c.m.notaFonte });
  await c.imagem(s, spec, { x: MARGEM, y: 2.2, w: LARGURA_UTIL, h: 4.4 });
}

async function slideImpacto(c, ctx) {
  const { res, atual, propostas } = ctx;
  if (!propostas.length) {
    const s = c.novo({ titulo: 'Esta carreira não tem proposta: não há impacto incremental a mostrar', nota: c.m.notaFonte });
    c.texto(s, 'Cadastre uma proposta na tela Carreiras ou duplique um cenário na tela Projeção para comparar com o cenário atual.', {
      x: MARGEM, y: 2.4, w: LARGURA_UTIL, h: 1.2, fontSize: 20, color: COR.inkSoft, valign: 'top',
    });
    return;
  }
  const props = propostas.slice(0, 3);
  const atuais = porExercicio(atual.mensal.total, res).map((x) => x.valor);
  const dados = dadosImpacto(res, props, atuais);
  const fim = res.exercicios.length - 1;
  const ano = res.exercicios[fim].ano;
  let titulo;
  if (dados.length === 1) {
    const v = dados[0].acum[fim];
    titulo = `O impacto acumulado de ${nomeCurto(dados[0].p.nome)} chega a ${v < 0 ? '-' : ''}${mi(v)} em ${ano}`;
  } else {
    const acs = dados.map((d) => d.acum[fim]);
    titulo = `O impacto acumulado até ${ano} vai de ${milhoes(Math.min(...acs))} a ${milhoes(Math.max(...acs))}, conforme a proposta`;
  }
  const s = c.novo({
    titulo,
    nota: 'Impacto = proposta menos cenário atual, mesma revisão geral nos dois (art. 16–17 da LRF aplicável; validação do órgão).',
  });
  await c.imagem(s, specImpacto(res, dados, c.ficticio), { x: MARGEM, y: 2.2, w: LARGURA_UTIL, h: 4.4 });
}

async function slideComparacao(c, ctx) {
  const { res, estudo } = c.m;
  const MAX = 6;
  if (estudo.carreiras.length >= 2) {
    const ids = estudo.carreiras.map((x) => x.id);
    const validas = estudo.carreiras.map((x) => ({
      id: x.id, nome: nomeCurto(x.nome, 24), cen: res.carreiras.find((r) => r.id === x.id).cenarios.find((k) => k.papel === 'atual'),
    }));
    let grupo = validas;
    if (validas.length > MAX) {
      const resto = validas.slice(MAX - 1);
      const agg = agregado(res, resto.map((r) => r.id), 'atual');
      grupo = [...validas.slice(0, MAX - 1), { id: 'demais', nome: 'Demais carreiras', cen: { mensal: agg.mensal } }];
    }
    const series = seriesComposicao(grupo, res);
    const aggAnual = agregadoAnual(res, ids, 'atual');
    const fim = res.exercicios.length - 1;
    const maior = validas.map((v) => ({ nome: v.nome, valor: porExercicio(v.cen.mensal.total, res)[fim].valor })).sort((a, b) => b.valor - a.valor)[0];
    const s = c.novo({
      titulo: `As ${estudo.carreiras.length} carreiras somam ${mi(aggAnual[fim])} em ${res.exercicios[fim].ano}; a maior é ${maior.nome}`,
      nota: 'Cenário atual de cada carreira; mesmo estudo e mesma data de tabela. Detalhe por carreira no arquivo Excel.',
    });
    await c.imagem(s, specComposicao(res, series, aggAnual, c.ficticio), { x: MARGEM, y: 2.2, w: LARGURA_UTIL, h: 4.4 });
    return;
  }
  // uma só carreira: componentes do custo do último cenário (proposta, se houver)
  const cen = ctx.propostas[0] ?? ctx.atual;
  const comp = componentesAnuais(res, cen);
  const fim = res.exercicios.length - 1;
  const s = c.novo({
    titulo: `Em ${res.exercicios[fim].ano}, ${nomeCurto(cen.nome)} custa ${mi(comp.tot[fim])}, dos quais ${mi(comp.vv[fim])} em vencimentos e vantagens`,
    nota: 'Componentes do custo por exercício. O estudo tem uma só carreira: não há comparação entre carreiras.',
  });
  await c.imagem(s, specComponentes(res, cen, comp, c.ficticio), { x: MARGEM, y: 2.2, w: LARGURA_UTIL, h: 4.4 });
}

async function slideEvolucao(c) {
  const ev = c.m.evolucao;
  if (!ev) {
    const s = c.novo({ titulo: 'A evolução individual não pôde ser calculada para este estudo', nota: c.m.notaFonte });
    c.texto(s, 'Use a tela Evolução individual para escolher a posição inicial e simular.', { x: MARGEM, y: 2.4, w: LARGURA_UTIL, h: 1, fontSize: 20, color: COR.inkSoft, valign: 'top' });
    return;
  }
  const r = ev.resultado;
  const n = r.meses.length;
  const ini = r.valorEsperado[0];
  const fim = r.valorEsperado[n - 1];
  const rotValor = ev.certo ? 'Vencimento da tabela' : 'Valor esperado do vencimento';
  const anos = ev.anos;
  const s = c.novo({
    titulo: `${rotValor} vai de ${reais(ini)} a ${reais(fim)} em ${anos} ${anos === 1 ? 'ano' : 'anos'}`,
    nota: `${ev.padrao ? 'Simulação padrão: ingresso' : 'Simulação: início'} em ${ev.posicao.eixo1}-${ev.posicao.eixo2}, ${ev.cenarioNome}. Premissas de êxito e de revisão geral na aba Evolução individual do Excel.`,
  });
  await c.imagem(s, specEvolucao(r, rotValor, c.ficticio), { x: MARGEM, y: 2.2, w: 8.2, h: 4.4 });
  const cartoes = [
    ['Valor inicial', reais(ini)],
    [`Valor após ${anos} ${anos === 1 ? 'ano' : 'anos'}`, reais(fim)],
    ['Variação', percentual(relativo(fim - ini, ini))],
  ];
  cartoes.forEach(([rotulo, valor], i) => {
    const y = 2.2 + i * 1.5;
    s.addShape(c.pptx.ShapeType.rect, { x: 8.95, y, w: 3.88, h: 1.3, fill: { color: COR.branco }, line: { color: COR.borda, width: 1 } });
    c.texto(s, [{ text: rotulo, options: { color: COR.inkSoft, breakLine: true } }, { text: valor, options: { bold: true, color: COR.ink } }], {
      x: 9.1, y: y + 0.1, w: 3.58, h: 1.1, fontSize: 18, valign: 'middle', paraSpaceAfter: 6,
    });
  });
}

function fonteELimites(c) {
  const nome = abreviar(c.m.estudo.estudo.nome, 60);
  const s = c.novo({
    titulo: 'Estimativa de apoio à decisão: o que o cálculo inclui e o que fica de fora',
    nota: 'Não é peça oficial; a validação jurídica é do órgão.',
  });
  const itens = [
    'No cálculo: tabela salarial, progressão e promoção por trilhas, parcelas, revisão geral, 13º salário, 1/3 de férias e encargos patronais, conforme as premissas.',
    'Fora do cálculo: servidores inativos, novos ingressos (a base é fechada, com taxa de saída opcional) e requisitos pessoa a pessoa (só a taxa de êxito os representa).',
    'Também fora nesta versão: estágio probatório, ganho depois do topo da carreira e primeiro interstício diferente.',
    `Fonte: ${nome}, simulador de carreiras; base de ${c.m.estudo.estudo.mes_posicao}; valores nominais, em R$.`,
    FRASE_AVISO,
    `Impressão digital do estudo: ${c.m.impressao ?? '-'}. Premissas completas e memória de cálculo no arquivo Excel.`,
  ];
  c.texto(s, itens.map((t, i) => ({ text: t, options: { bullet: { indent: 18 }, breakLine: i < itens.length - 1 } })), {
    x: MARGEM, y: 2.2, w: LARGURA_UTIL, h: 4.4, fontSize: 18, color: COR.ink, valign: 'top', paraSpaceAfter: 6,
  });
}

/**
 * Gera o PPTX (Blob). `m`: { estudo, res, impressao, geradoEm, evolucao, desenhar }; `logos`: { esquerda, direita } (ou null);
 * `PptxGenJS`: construtor da biblioteca. Devolve { blob, avisos }.
 */
export async function gerarPptx(m, { logos, PptxGenJS }) {
  const { estudo, res } = m;
  const i = carreiraPrincipal(estudo);
  const car = estudo.carreiras[i];
  const { atual, propostas } = cenariosDe(res, car.id);
  const versoes = car.cenarios.find((x) => x.papel === 'atual').regras.versoes.slice().sort((a, b) => (a.inicio_vigencia < b.inicio_vigencia ? -1 : 1));
  const v = versoes[versoes.length - 1];
  const modelo = {
    ...m,
    notaFonte: `Fonte: ${abreviar(estudo.estudo.nome, 45)}, simulador de carreiras; base de ${estudo.estudo.mes_posicao}; tabela vigente em ${v.inicio_vigencia}; valores nominais, em R$.`,
  };
  const c = new Construtor(PptxGenJS, modelo, logos);
  const ctx = { res, atual, propostas };
  capa(c);
  premissas(c);
  slideTabela(c, ctx);
  await slideCusto(c, ctx);
  await slideImpacto(c, ctx);
  await slideComparacao(c, ctx);
  await slideEvolucao(c);
  fonteELimites(c);
  const blob = await c.pptx.write({ outputType: 'blob' });
  return { blob, avisos: c.avisos };
}
