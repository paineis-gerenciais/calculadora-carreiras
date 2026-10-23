// T6. Comparar carreiras e agregados (F5; CA-11): composição do custo por carreira, custo médio por servidor e agregado
// (soma, calculada por agregacoes.agregado, igual à soma das carreiras por exercício).
import { CORES_CARREIRA as CORES, agregadoAnual, linhasCustoMedio, seriesComposicao, specComposicao, specCustoMedio } from '../../exportacao/graficos.js';
import { abas, campo, faixa, secao, tabela, vazio } from '../componentes.js';
import { criar, esvaziar, linkRota } from '../dom.js';
import { estado } from '../estado.js';
import { FRASE_AVISO, reais, rotuloExercicio } from '../formatar.js';
import { desenharGrafico } from '../graficos.js';
import { prepararResultado } from './calculo-ui.js';

const cp = { estudo: null, escolhidas: null, papel: 'atual', nomeGrupo: 'Agregado: carreiras escolhidas', visao: 'composicao', ano: null };
const MAX_CARREIRAS_GRAFICO = 6;
const soma = (xs) => xs.reduce((s, x) => s + x, 0);

export async function telaComparar(container) {
  if (cp.estudo !== estado.estudo) Object.assign(cp, { estudo: estado.estudo, escolhidas: null, papel: 'atual', nomeGrupo: 'Agregado: carreiras escolhidas', visao: 'composicao', ano: null });
  const estudo = estado.estudo;
  if (estudo.carreiras.length < 2) {
    container.append(vazio('Escolha duas ou mais carreiras', 'A comparação precisa de pelo menos duas carreiras no estudo. Cadastre outra carreira na tela Carreiras.',
      linkRota('Ir para Carreiras', '#/carreiras')));
    return undefined;
  }
  if (cp.escolhidas === null) cp.escolhidas = new Set(estudo.carreiras.slice(0, MAX_CARREIRAS_GRAFICO).map((c) => c.id));
  const controles = criar('div');
  const area = criar('div', { class: 'area-comparacao' });
  container.append(controles, area);
  let graficos = [];
  const limpa = () => { graficos.forEach((g) => g?.destruir?.()); graficos = []; };

  let res0 = null;
  const desenhar = async () => {
    limpa();
    const res = await prepararResultado(area, desenhar);
    if (!res) return;
    res0 = res;
    esvaziar(area);
    desenharControles(res);
    desenharResultado(res);
  };

  function desenharControles() {
    esvaziar(controles);
    const grupo = criar('fieldset', { class: 'grupo-carreiras' }, criar('legend', {}, 'Carreiras a comparar'));
    estudo.carreiras.forEach((c, i) => {
      const ck = campo({
        rotulo: c.nome, tipo: 'caixa', valor: cp.escolhidas.has(c.id), classe: 'campo-caixa-linha',
        aoMudar: (v) => { if (v) cp.escolhidas.add(c.id); else cp.escolhidas.delete(c.id); desenharResultado(res0); },
      });
      grupo.append(criar('div', { class: 'item-carreira' }, criar('span', { class: `faixa-cor cor-${i % CORES.length}`, 'aria-hidden': 'true' }), ck.no));
    });
    const papel = campo({
      rotulo: 'Cenário comparado', tipo: 'selecao', valor: cp.papel, classe: 'campo-curto',
      opcoes: [{ valor: 'atual', texto: 'Cenário atual' }, { valor: 'proposta', texto: 'Primeira proposta de cada carreira' }],
      aoMudar: (v) => { cp.papel = v; desenharResultado(res0); },
    });
    const nome = campo({
      rotulo: 'Nome do agrupamento (soma das carreiras escolhidas)', valor: cp.nomeGrupo, maxlength: 60,
      aoMudar: (v) => { cp.nomeGrupo = v.trim() || 'Agregado'; desenharResultado(res0); },
    });
    controles.append(secao('Seleção', grupo, criar('div', { class: 'grade g2' }, papel.no, nome.no)));
  }

  function desenharResultado(res) {
    limpa();
    esvaziar(area);
    const ids = estudo.carreiras.filter((c) => cp.escolhidas.has(c.id)).map((c) => c.id);
    if (ids.length < 2) {
      area.append(vazio('Escolha duas ou mais carreiras', 'Marque pelo menos duas carreiras para comparar.'));
      return;
    }
    if (ids.length > MAX_CARREIRAS_GRAFICO) {
      area.append(faixa('aviso', `O gráfico mostra até ${MAX_CARREIRAS_GRAFICO} carreiras. Desmarque algumas ou use o agregado.`));
    }
    const sels = ids.map((id) => {
      const car = res.carreiras.find((c) => c.id === id);
      const cen = car.cenarios.find((c) => c.papel === cp.papel);
      return { id, nome: car.nome, cen, atual: car.cenarios.find((c) => c.papel === 'atual'), proposta: car.cenarios.find((c) => c.papel === 'proposta') };
    });
    const semCenario = sels.filter((s) => !s.cen);
    if (semCenario.length) {
      area.append(faixa('aviso', criar('strong', {}, 'Carreira sem esse cenário: '), `${semCenario.map((s) => s.nome).join(', ')} ficam fora da soma e do gráfico.`));
    }
    const validas = sels.filter((s) => s.cen);
    // aviso: meses de referência diferentes (IND-09, limitações)
    const refs = new Set();
    for (const s of validas) {
      const car = estudo.carreiras.find((c) => c.id === s.id);
      const cen = car.cenarios.find((c) => c.id === s.cen.id);
      for (const v of cen.regras.versoes) refs.add(v.referencia_valores);
    }
    if (refs.size > 1) {
      area.append(faixa('aviso', criar('strong', {}, 'Tabelas em moedas de meses diferentes.'),
        ` As tabelas das carreiras escolhidas se referem aos meses ${[...refs].sort().join(', ')}. A soma mistura poderes de compra diferentes; confira antes de apresentar.`));
    }
    if (validas.length < 2) return;

    const comAbas = abas({
      rotulo: 'Visões da comparação',
      itens: [{ id: 'composicao', titulo: 'Composição por exercício' }, { id: 'medio', titulo: 'Custo médio por servidor' }],
      ativa: cp.visao,
      aoTrocar: (id, painel) => {
        cp.visao = id;
        limpa();
        if (id === 'composicao') composicao(painel, res, validas);
        else medio(painel, res, validas);
      },
    });
    area.append(comAbas.lista, comAbas.painel, criar('p', { class: 'small muted' }, FRASE_AVISO));
  }

  const ficticio = () => estado.estudo.tipo_dados === 'ficticio';

  function composicao(painel, res, validas) {
    const series = seriesComposicao(validas, res);
    const aggAnual = agregadoAnual(res, validas.map((s) => s.id), cp.papel);
    const graf = criar('div', { class: 'grafico' });
    desenharGrafico(graf, specComposicao(res, series, aggAnual, ficticio()))
      .then((g) => graficos.push(g));
    const linhas = res.exercicios.map((ex, i) => [String(ex.ano), ...series.map((s) => reais(s.valores[i])), reais(aggAnual[i])]);
    linhas.push({ celulas: ['Total', ...series.map((s) => reais(soma(s.valores))), reais(soma(aggAnual))], total: true });
    painel.append(secao('Composição do custo por carreira', criar('div', { class: 'duas' }, graf, tabela({
      legenda: ficticio() ? `Custo anual por carreira e ${cp.nomeGrupo} (R$) (Dados fictícios)` : `Custo anual por carreira e ${cp.nomeGrupo} (R$)`,
      colunas: [{ texto: 'Exercício' }, ...series.map((s) => ({ texto: s.nome, num: true })), { texto: cp.nomeGrupo, num: true }],
      linhas,
    })), criar('p', { class: 'small muted' }, `${cp.nomeGrupo} = soma das carreiras escolhidas, por exercício.`)));
  }

  function medio(painel, res, validas) {
    const anos = res.exercicios.map((e) => e.ano);
    if (cp.ano === null || !anos.includes(cp.ano)) cp.ano = anos[anos.length - 1];
    const alvo = criar('div');
    const desenharAno = () => {
      limpa();
      esvaziar(alvo);
      const linhasBase = linhasCustoMedio(res, validas, cp.ano);
      const graf = criar('div', { class: 'grafico' });
      desenharGrafico(graf, specCustoMedio(linhasBase, cp.ano, ficticio()))
        .then((g) => graficos.push(g));
      alvo.append(criar('div', { class: 'duas' }, graf, tabela({
        legenda: ficticio() ? `Custo médio por servidor-mês em ${cp.ano} (R$) (Dados fictícios)` : `Custo médio por servidor-mês em ${cp.ano} (R$)`,
        colunas: [{ texto: 'Carreira' }, { texto: 'Cenário atual', num: true }, { texto: 'Proposta', num: true }],
        linhas: linhasBase.map((l) => [l.nome, reais(l.atual), l.proposta === null ? '-' : reais(l.proposta)]),
      })));
    };
    painel.append(secao('Custo médio por servidor', criar('p', { class: 'small muted' }, 'Total do exercício (com 13º, 1/3 de férias e encargos) dividido pelos servidores-mês esperados.'),
      campo({ rotulo: 'Exercício', tipo: 'selecao', valor: String(cp.ano), classe: 'campo-curto', opcoes: anos.map((a) => ({ valor: String(a), texto: String(a) })), aoMudar: (v) => { cp.ano = Number(v); desenharAno(); } }).no, alvo));
    desenharAno();
  }

  await desenhar();
  return () => limpa();
}
