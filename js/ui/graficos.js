// Gráficos na tela com Chart.js (especificação, seção 3; visão geral, seção 6.4). Sempre sobre fundo claro, sem animação,
// com legenda no próprio canvas (sem plugin HTML), `role="img"` com descrição textual e a tabela equivalente ao lado
// (quem chama). Cor nunca é o único sinal: cada série tem marcador, traço ou hachura próprios (tokens.md, seção 1.3).
import { COR_COMPONENTE, estiloDoCenario } from '../exportacao/graficos.js';
import { carregarChart } from '../externos/chart.js';
import { criar, esvaziar } from './dom.js';

const cor = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();

export { COR_COMPONENTE, estiloDoCenario };

function hachura(corBase, ctx, tam = 8) {
  const c = document.createElement('canvas');
  c.width = tam; c.height = tam;
  const g = c.getContext('2d');
  const k = tam / 8;
  g.fillStyle = corBase; g.fillRect(0, 0, tam, tam);
  g.strokeStyle = '#ffffff'; g.lineWidth = 2 * k;
  g.beginPath(); g.moveTo(0, tam); g.lineTo(tam, 0); g.moveTo(-2 * k, 2 * k); g.lineTo(2 * k, -2 * k); g.moveTo(6 * k, 10 * k); g.lineTo(10 * k, 6 * k); g.stroke();
  return ctx.createPattern(c, 'repeat');
}

const fmtNum = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const FAMILIA = '"Public Sans", Arial, sans-serif';

const pluginRotulos = {
  id: 'rotulosDeDegrau',
  afterDatasetsDraw(chart, _args, opcoes) {
    const rotulos = opcoes?.rotulos;
    if (!rotulos) return;
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    ctx.save();
    ctx.font = `600 ${opcoes.tamanho ?? 12}px ${FAMILIA}`;
    ctx.fillStyle = cor('--ink');
    rotulos.forEach((r, i) => {
      if (!r) return;
      const p = meta.data[i];
      ctx.textAlign = i === 0 && opcoes.primeiroAEsquerda ? 'left' : 'center';
      if (p) ctx.fillText(r, p.x, p.y - Math.round((opcoes.tamanho ?? 12) * 0.67));
    });
    ctx.restore();
  },
};

/** Rótulo do valor final das linhas marcadas com `rotuloFinal` (ex.: acumulado do impacto), na cor `ink`, à esquerda do último ponto. */
const pluginRotuloFinal = {
  id: 'rotuloFinal',
  afterDatasetsDraw(chart, _args, opcoes) {
    if (!opcoes?.fmt) return;
    const { ctx } = chart;
    chart.data.datasets.forEach((d, i) => {
      if (!d.rotuloFinal) return;
      let ultimo = d.data.length - 1;
      while (ultimo >= 0 && d.data[ultimo] === null) ultimo--;
      const p = chart.getDatasetMeta(i).data[ultimo];
      if (!p) return;
      const abaixo = d.data[ultimo] < 0;
      ctx.save();
      ctx.font = `700 ${opcoes.tamanho}px ${FAMILIA}`;
      ctx.fillStyle = cor('--ink');
      ctx.textAlign = 'right';
      ctx.textBaseline = abaixo ? 'top' : 'bottom';
      ctx.fillText(opcoes.fmt(d.data[ultimo]), p.x - opcoes.tamanho * 0.6, p.y + (abaixo ? 1 : -1) * opcoes.tamanho * 0.7);
      ctx.restore();
    });
  },
};

/** Fundo branco (a imagem do slide nunca é transparente) e marca de vigência (linha vertical tracejada com texto). */
const pluginSlide = {
  id: 'fundoEMarcas',
  beforeDraw(chart) {
    const { ctx, width, height } = chart;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  },
  afterDatasetsDraw(chart, _args, opcoes) {
    const marcas = opcoes?.marcas ?? [];
    const { ctx, chartArea, scales } = chart;
    for (const m of marcas) {
      const x = scales.x.getPixelForValue(m.categoria);
      ctx.save();
      ctx.strokeStyle = cor('--ink-soft'); ctx.lineWidth = opcoes.espessura; ctx.setLineDash([opcoes.espessura * 3, opcoes.espessura * 2]);
      ctx.beginPath(); ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `400 ${opcoes.tamanho}px ${FAMILIA}`; ctx.fillStyle = cor('--ink-soft'); ctx.textBaseline = 'top';
      const largura = ctx.measureText(m.texto).width;
      const cabeDireita = x + 8 + largura < chartArea.right;
      ctx.textAlign = cabeDireita ? 'left' : 'right';
      ctx.fillText(m.texto, cabeDireita ? x + 8 : x - 8, chartArea.top + 4);
      ctx.restore();
    }
  },
};

/**
 * Configuração do Chart.js para a especificação. `png`: desenho fora da tela para o slide (fonte em px do canvas, traços
 * mais grossos, sem resposta a redimensionamento, fundo branco e marca de vigência).
 */
function montarConfig(spec, ctx2d, { png = false, fonte = 12, escala = 1, larguraPx = 0 } = {}) {
  const divisor = spec.divisor ?? 1;
  const fmt = (v) => `${spec.prefixo ?? ''}${fmtNum.format(v)}${spec.sufixo ?? ''}`;
  const empilhado = spec.tipo === 'barras_empilhadas';
  const datasets = spec.series.map((s, i) => {
    const e = s.estilo ?? estiloDoCenario(i);
    const c = s.cor ? cor(s.cor) : cor(e.cor);
    const ehBarra = (s.tipo ?? (spec.tipo.startsWith('barras') ? 'bar' : 'line')) === 'bar';
    const base = { label: s.nome, data: s.valores.map((v) => (v === null ? null : v / divisor)), yAxisID: s.eixo ?? 'y' };
    if (ehBarra) {
      return { ...base, type: 'bar', pointStyle: 'rect', backgroundColor: s.padrao ? hachura(c, ctx2d, 8 * escala) : c, borderColor: c, borderWidth: escala, stack: empilhado ? 's' : undefined };
    }
    return {
      ...base, rotuloFinal: Boolean(s.rotuloFinal), type: 'line', borderColor: c, backgroundColor: c, borderWidth: 3 * escala, borderDash: e.tracejado.map((d) => d * escala), pointStyle: e.marcador,
      pointRadius: (spec.categorias.length > 24 ? 2 : 5.5) * escala, pointHoverRadius: 7 * escala, stepped: spec.tipo === 'degraus' ? 'after' : false, tension: 0, spanGaps: false,
    };
  });
  const ink = cor('--ink-soft');
  const grade = cor('--border');
  // no slide, o texto de 14 pt é grande: poucos rótulos no eixo x, para não se sobreporem
  const maiorRotulo = Math.max(...spec.categorias.map((c) => String(c).length));
  const limiteDeRotulos = png ? Math.max(3, Math.floor(larguraPx / (maiorRotulo * fonte * 0.62 + fonte * 1.5))) : 14;
  const fnt = png ? { family: FAMILIA, size: fonte } : undefined; // no slide, todo texto do gráfico tem 14 pt
  const escalas = {
    x: { stacked: empilhado, ticks: { color: ink, maxRotation: 0, autoSkip: true, maxTicksLimit: limiteDeRotulos, font: fnt }, grid: { color: grade, lineWidth: escala } },
    y: {
      stacked: empilhado, beginAtZero: spec.comecaEmZero ?? spec.tipo.startsWith('barras'),
      title: { display: Boolean(spec.tituloEixo), text: spec.tituloEixo, color: ink, font: fnt },
      ticks: { color: ink, callback: (v) => fmt(v), font: fnt }, grid: { color: grade, lineWidth: escala },
    },
  };
  const temY2 = spec.series.some((s) => s.eixo === 'y2');
  if (temY2) escalas.y2 = { position: 'right', ticks: { color: ink, callback: (v) => fmt(v), font: fnt }, grid: { drawOnChartArea: false } };
  const plugins = [pluginRotuloFinal, ...(spec.rotulosDegrau ? [pluginRotulos] : [])];
  const opcPlugins = {
    legend: {
      position: 'bottom',
      labels: {
        usePointStyle: true, color: cor('--ink'), font: png ? { family: FAMILIA, size: fonte } : { size: 13 },
        ...(png ? { boxWidth: fonte * 0.8, boxHeight: fonte * 0.8, padding: fonte } : {}),
      },
    },
    tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.parsed.y)}` }, enabled: !png },
    rotuloFinal: { fmt, tamanho: png ? fonte : 13 },
    rotulosDeDegrau: { rotulos: spec.rotulosDegrau ?? null, tamanho: fonte, primeiroAEsquerda: png },
  };
  if (png) {
    plugins.push(pluginSlide);
    opcPlugins.fundoEMarcas = { marcas: spec.marcas ?? [], tamanho: fonte, espessura: 2 * escala };
  }
  return {
    type: spec.tipo.startsWith('barras') ? 'bar' : 'line',
    data: { labels: spec.categorias, datasets },
    plugins,
    options: {
      responsive: !png, maintainAspectRatio: false, animation: false, ...(png ? { devicePixelRatio: 1, font: { family: FAMILIA, size: fonte } } : {}),
      layout: { padding: { top: Math.round((png ? fonte : 13) * 1.6) } },
      interaction: { mode: 'index', intersect: false },
      plugins: opcPlugins,
      scales: escalas,
    },
  };
}

/**
 * Desenha um gráfico no `container`. `spec`: ver exportacao/graficos.js (especificação neutra). Devolve { destruir }.
 */
export async function desenharGrafico(container, spec) {
  const caixa = criar('div', { class: 'grafico-caixa' });
  const canvas = criar('canvas', { role: 'img', 'aria-label': spec.textoAlternativo });
  caixa.append(canvas);
  container.append(caixa);
  let Chart;
  try {
    Chart = await carregarChart();
  } catch {
    esvaziar(caixa);
    caixa.append(criar('p', { class: 'small muted' }, 'Não foi possível carregar o gráfico. Use a tabela ao lado: ela traz os mesmos números.'));
    return { destruir() {} };
  }
  const ctx2d = canvas.getContext('2d');
  const grafico = new Chart(ctx2d, montarConfig(spec, ctx2d));
  return { destruir() { grafico.destroy(); } };
}

/**
 * Desenha a mesma especificação num canvas fora da tela e devolve um PNG como `data:` (para o PowerPoint). Fundo branco,
 * sem animação, texto de 14 pt na escala do slide (`larguraPol` de largura) e fonte Public Sans.
 */
export async function gerarPngDoGrafico(spec, { largura = 2400, altura = 856, larguraPol = 12.33 } = {}) {
  const Chart = await carregarChart();
  const pxPorPol = largura / larguraPol;
  const fonte = Math.round((14 / 72) * pxPorPol);
  const escala = Math.max(1, Math.round(pxPorPol / 65));
  if (document.fonts?.load) {
    await Promise.allSettled(['400', '600', '700'].map((p) => document.fonts.load(`${p} ${fonte}px "Public Sans"`)));
  }
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx2d = canvas.getContext('2d');
  const grafico = new Chart(ctx2d, montarConfig(spec, ctx2d, { png: true, fonte, escala, larguraPx: largura * 0.85 }));
  grafico.update('none');
  const url = canvas.toDataURL('image/png');
  grafico.destroy();
  return url;
}
