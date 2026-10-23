// Liga os botões de exportação (telas Exportar e Estudos) às funções de exportacao/ (M4, M5, M11). Cada exportador devolve
// { ok, mensagem, avisos? }: a tela mostra o resultado. Excel, PowerPoint e as bibliotecas só são carregados no clique.
import { impressaoDigital } from '../dados/estudo-io.js';
import { baixar } from './download.js';
import { estado, calcular, estudoAberto, lerEstudoSalvo, marcarExportado, salvarAgora } from './estado.js';
import { registrarExportador } from './exportadores.js';
import { carreirasSemBase } from './telas/calculo-ui.js';

/** Resultado do motor para exportar (recalcula se o estudo mudou). { ok: true, res } | { ok: false, mensagem }. */
async function resultadoParaExportar() {
  if (!estudoAberto()) return { ok: false, mensagem: 'Abra um estudo antes de exportar.' };
  const falta = carreirasSemBase();
  if (falta.length) {
    return { ok: false, mensagem: `Falta a base de servidores ${falta.length === 1 ? 'da carreira' : 'das carreiras'} ${falta.join(', ')}. Importe a base na tela Base de servidores para exportar os resultados.` };
  }
  if (!estado.validacao.ok) return { ok: false, mensagem: `O estudo tem problemas e não pode ser calculado: ${estado.validacao.erros[0].mensagem}` };
  try {
    return { ok: true, res: await calcular() };
  } catch (e) {
    if (e?.cancelado) return { ok: false, mensagem: 'O cálculo foi cancelado. Nada foi exportado.' };
    return { ok: false, mensagem: `Não foi possível calcular: ${(e?.erros ?? [{ mensagem: 'erro inesperado.' }])[0].mensagem}` };
  }
}

async function dadosDaExportacao() {
  const pre = await resultadoParaExportar();
  if (!pre.ok) return pre;
  const estudo = estado.estudo;
  const edicao = estado.edicao;
  const impressao = await impressaoDigital(estudo);
  const { evolucaoParaExportar, nomeArquivo } = await import('../exportacao/dados.js');
  return { ok: true, estudo, res: pre.res, impressao, geradoEm: new Date(), evolucao: evolucaoParaExportar(estudo, edicao), nomeArquivo };
}

async function exportarExcel() {
  const d = await dadosDaExportacao();
  if (!d.ok) return d;
  const { gerarExcel } = await import('../exportacao/excel.js');
  const blob = await gerarExcel(d);
  const nome = d.nomeArquivo('resultados', d.estudo.estudo.nome, 'xlsx', d.impressao, d.geradoEm);
  baixar(nome, blob);
  return { ok: true, mensagem: `Excel gerado: ${nome}.` };
}

async function exportarPptx() {
  const d = await dadosDaExportacao();
  if (!d.ok) return d;
  const [{ gerarPptx }, { carregarLogos }, { carregarPptxGen }, { gerarPngDoGrafico }] = await Promise.all([
    import('../exportacao/pptx.js'), import('../exportacao/logos.js'), import('../externos/pptx.js'), import('./graficos.js'),
  ]);
  const [PptxGenJS, logos] = await Promise.all([carregarPptxGen(), carregarLogos()]);
  const { blob, avisos } = await gerarPptx({ ...d, desenhar: gerarPngDoGrafico }, { logos, PptxGenJS });
  const nome = d.nomeArquivo('apresentacao', d.estudo.estudo.nome, 'pptx', d.impressao, d.geradoEm);
  baixar(nome, blob);
  return { ok: true, mensagem: `PowerPoint gerado: ${nome}.`, avisos };
}

async function exportarJson({ id, origem } = {}) {
  let estudo;
  let idMarca = null;
  if (origem === 'lista' && id !== estado.id) {
    const r = await lerEstudoSalvo(id);
    if (!r.ok) return { ok: false, mensagem: r.mensagem };
    estudo = r.estudo;
    idMarca = id;
  } else {
    if (!estudoAberto()) return { ok: false, mensagem: 'Abra um estudo antes de exportar.' };
    if (estado.salvamento.tipo === 'pendente') await salvarAgora();
    estudo = estado.estudo;
    idMarca = estado.id;
  }
  const { gerarJson } = await import('../exportacao/json.js');
  const j = await gerarJson(estudo);
  baixar(j.nome, j.blob);
  const marcou = await marcarExportado(idMarca);
  const avisos = [];
  if (j.grande) avisos.push('O arquivo passa de 10 MB: o simulador não conseguirá importá-lo de volta. Reduza o tamanho das bases antes de guardar a cópia.');
  if (!marcou) avisos.push(idMarca ? 'Não foi possível registrar a data da cópia no banco de dados; o arquivo foi baixado normalmente.' : 'O estudo ainda não está gravado no banco: o arquivo foi baixado, mas não há data de cópia a registrar.');
  return { ok: true, mensagem: `JSON exportado: ${j.nome}. Impressão digital do estudo: ${j.impressao ?? '-'}.`, avisos };
}

registrarExportador('excel', exportarExcel);
registrarExportador('pptx', exportarPptx);
registrarExportador('json', exportarJson);
