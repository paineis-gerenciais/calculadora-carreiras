// T7. Premissas (CA-13; LRF art. 16, § 2º): memória de premissas legível, com a origem de cada item (definido pelo usuário
// ou padrão), avisos do motor, impressão digital do estudo (O3) e link para onde cada item se edita.
import { memoriaPremissas } from '../../motor/premissas.js';
import { botao, faixa, secao, selo, tabela } from '../componentes.js';
import { criar, esvaziar, linkRota } from '../dom.js';
import { assinar, estado } from '../estado.js';
import { FRASE_AVISO, premissaPtBr } from '../formatar.js';
import { carreirasSemBase, prepararResultado } from './calculo-ui.js';

const ROTA_DO_GRUPO = (grupo, item) => {
  if (grupo.startsWith('Carreira ')) return '#/carreiras';
  if (grupo === 'Revisão geral') return '#/carreiras';
  if (grupo === 'Resultado') return null;
  if (item === 'Nome' && grupo === 'Estudo') return '#/projecao';
  return '#/projecao';
};

export async function telaPremissas(container) {
  const area = criar('div', { class: 'area-premissas' });
  container.append(area);
  let parar = () => {};

  const desenhar = async () => {
    parar();
    esvaziar(area);
    const calculavel = carreirasSemBase().length === 0 && estado.validacao.ok;
    let res = null;
    if (calculavel) {
      const sub = criar('div');
      area.append(sub);
      res = await prepararResultado(sub, desenhar);
      if (!res) return;
      sub.remove();
    } else {
      area.append(faixa('info', criar('strong', {}, 'Sem cálculo ainda.'), ' Os itens abaixo vêm do estudo; horizonte e avisos do cálculo aparecem depois que a base for importada e a projeção calculada.'));
    }
    const memoria = memoriaPremissas(estado.estudo, res);
    const grupos = new Map();
    for (const m of memoria) {
      if (!grupos.has(m.grupo)) grupos.set(m.grupo, []);
      grupos.get(m.grupo).push(m);
    }
    const codigoNo = criar('code', { id: 'impressao-premissas' }, estado.impressao ?? '—');
    area.append(secao('Resumo',
      criar('p', {}, FRASE_AVISO),
      criar('p', { class: 'small' }, 'Impressão digital do estudo: ', codigoNo,
        ' (se não bater com a do último JSON guardado, o estudo foi alterado).'),
      criar('p', { class: 'small' }, 'Tipo de dados: ', estado.estudo.tipo_dados === 'ficticio' ? selo('Dados fictícios', 'ficticio') : selo('Real anonimizado', 'real'))));
    for (const [grupo, itens] of grupos) {
      area.append(secao(grupo, tabela({
        legenda: grupo,
        legendaVisivel: false,
        colunas: [{ texto: 'Item' }, { texto: 'Valor' }, { texto: 'Origem' }, { texto: 'Onde editar' }],
        linhas: itens.map((m) => {
          const rota = ROTA_DO_GRUPO(grupo, m.item);
          return [m.item, premissaPtBr(m.valor), m.origem === 'padrao' ? selo('padrão', 'info') : selo('definido', 'neutro'),
            rota ? linkRota('Editar', rota, { 'aria-label': `Editar: ${m.item}` }) : '-'];
        }),
      })));
    }
    if (res) {
      area.append(secao('Avisos do cálculo', res.avisos.length
        ? criar('ul', { class: 'lista-avisos' }, res.avisos.slice(0, 200).map((a) => criar('li', {}, criar('span', { 'aria-hidden': 'true' }, '▲ '), `${a.mes}: ${a.mensagem}`)))
        : criar('p', {}, 'Nenhum aviso.')));
    }
    area.append(botao('Atualizar', { aoClicar: desenhar, atributos: { id: 'btn-atualizar-premissas' } }));
    // a impressão digital é calculada depois da edição: atualiza o código quando chegar
    parar = assinar((tipo) => { if (tipo === 'impressao') codigoNo.textContent = estado.impressao ?? '—'; });
  };
  await desenhar();
  return () => parar();
}
