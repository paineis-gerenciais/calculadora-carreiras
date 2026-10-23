// T8. Exportar (M4, M5, M11): Excel, PowerPoint e JSON do estudo aberto. Cada botão fica desabilitado enquanto o arquivo é
// gerado ("Gerando…") e o resultado aparece numa região de status: sucesso, aviso (ex.: logo ausente) ou erro com o motivo.
import { botao, faixa, secao } from '../componentes.js';
import { criar, esvaziar } from '../dom.js';
import { estado } from '../estado.js';
import { executarExportacao } from '../exportadores.js';

const CARTOES = [
  {
    tipo: 'excel', titulo: 'Excel (.xlsx)', botao: 'Gerar Excel',
    texto: 'Tabelas dos resultados (resumo, por exercício, mensal, componentes, avisos) e aba de premissas. Os números são os mesmos da tela.',
  },
  {
    tipo: 'pptx', titulo: 'PowerPoint (.pptx)', botao: 'Gerar PowerPoint',
    texto: 'Slides de resumo, tabela, gráfico e premissas, no modelo aprovado. O arquivo traz os dois logos e a nota de fonte.',
  },
  {
    tipo: 'json', titulo: 'JSON do estudo', botao: 'Exportar JSON',
    texto: 'Cópia completa do estudo (carreiras, tabelas, cenários, base e premissas). É a cópia de segurança: guarde os JSON de estudos "Real anonimizado" em pasta institucional, não compartilhada, e exporte antes de cada reunião com gestores.',
  },
];

export function telaExportar(container) {
  const aviso = criar('div', { class: 'area-exportacao', 'aria-live': 'polite' });
  container.append(aviso);
  for (const c of CARTOES) {
    const b = botao(c.botao, { variante: 'prim', atributos: { 'data-exportar': c.tipo, id: `btn-exportar-${c.tipo}` } });
    b.addEventListener('click', async () => {
      const rotulo = b.textContent;
      b.disabled = true;
      b.textContent = 'Gerando…';
      esvaziar(aviso);
      aviso.append(criar('p', { class: 'small muted', role: 'status' }, `Gerando o arquivo (${c.titulo})…`));
      const r = await executarExportacao(c.tipo, { id: estado.id, origem: 'exportar' });
      esvaziar(aviso);
      aviso.append(faixa(r.ok ? 'ok' : 'erro', r.mensagem));
      for (const a of r.avisos ?? []) aviso.append(faixa('aviso', a));
      b.disabled = false;
      b.textContent = rotulo;
    });
    container.append(secao(c.titulo, criar('p', {}, c.texto), criar('div', { class: 'acoes' }, b)));
  }
  return undefined;
}
