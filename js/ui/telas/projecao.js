// T5. Projeção da base e comparação proposta × atual (F3, F4; CA-07, CA-09 a CA-16): resumo, quatro visões com gráfico e
// tabela de valores exatos, parâmetros do estudo e duplicação de cenário. Os números vêm do motor e das agregações
// (motor/agregacoes.js): a tela só apresenta.
import { acumulado, impacto, janela12, porExercicio, relativo } from '../../motor/agregacoes.js';
import { validarEstudo } from '../../motor/validacao.js';
import { abas, abrirDialogo, acoes, botao, campo, faixa, razao, secao, tabela } from '../componentes.js';
import { criar, esvaziar } from '../dom.js';
import { assinar, editar, estado, resultadoAtual } from '../estado.js';
import { FRASE_AVISO, decimalParaCampo, campoParaDecimal, milhoes, percentual, reais, rotuloExercicio } from '../formatar.js';
import { componentesAnuais, dadosImpacto, specComponentes, specCusto, specImpacto, specMensal } from '../../exportacao/graficos.js';
import { desenharGrafico } from '../graficos.js';
import { MAX_PROPOSTAS, cenarioDuplicado, copia, lerRotulos } from '../modelo.js';
import { prepararResultado } from './calculo-ui.js';
import { selecionarCenario } from './carreiras.js';

const pj = { estudo: null, a: 0, visao: 'custo', ocultos: new Set() };

const VISOES = [
  { id: 'custo', titulo: 'Custo por exercício' }, { id: 'impacto', titulo: 'Impacto incremental' },
  { id: 'componentes', titulo: 'Componentes' }, { id: 'mensal', titulo: 'Mensal e janelas de 12 meses' },
];

const MARCAS = ['marca-quadrado', 'marca-circulo', 'marca-triangulo', 'marca-losango'];

/** Alterna o modo reunião (+25% de fonte, sem menu nem controles de edição) e devolve como desfazer. */
function ligarModoReuniao(botaoReuniao) {
  const alternar = (ligado) => {
    document.documentElement.classList.toggle('modo-reuniao', ligado);
    botaoReuniao.setAttribute('aria-pressed', String(ligado));
  };
  botaoReuniao.addEventListener('click', () => alternar(!document.documentElement.classList.contains('modo-reuniao')));
  return () => document.documentElement.classList.remove('modo-reuniao');
}

/** Estrutura de dados da carreira escolhida: cenários na ordem do estudo, com índice de estilo. */
function cenariosDe(res, carreiraId) {
  const car = res.carreiras.find((c) => c.id === carreiraId);
  const lista = car.cenarios.map((c, idx) => ({ ...c, estilo: idx }));
  return { atual: lista.find((c) => c.papel === 'atual'), propostas: lista.filter((c) => c.papel === 'proposta') };
}

const soma = (xs) => xs.reduce((s, x) => s + x, 0);

/** Meses com impacto no exercício de vigência da proposta. */
function mesesComImpacto(res, ex, proposta) {
  return res.meses.slice(ex.inicio, ex.fim + 1).filter((m) => m >= proposta.inicioVigencia).length;
}

export async function telaProjecao(container, ctx) {
  if (pj.estudo !== estado.estudo) Object.assign(pj, { estudo: estado.estudo, a: 0, visao: 'custo', ocultos: new Set() });
  const cabecalhoNo = criar('div');
  const area = criar('div', { class: 'area-projecao' });
  container.append(cabecalhoNo, area);
  let limparPainel = [];
  let parar = () => {};
  const limpaGraficos = () => { limparPainel.forEach((g) => g?.destruir?.()); limparPainel = []; };

  const botaoReuniao = botao('Modo reunião', { atributos: { 'aria-pressed': 'false', id: 'btn-modo-reuniao' } });
  const desfazerReuniao = ligarModoReuniao(botaoReuniao);
  cabecalhoNo.append(criar('div', { class: 'titulo-acoes' }, botaoReuniao));

  const desenhar = async () => {
    limpaGraficos();
    parar();
    parar = () => {};
    const res = await prepararResultado(area, desenhar);
    if (!res) return;
    esvaziar(area);
    desenharResultado(res);
  };

  function desenharResultado(res) {
    const estudo = estado.estudo;
    pj.a = Math.min(pj.a, estudo.carreiras.length - 1);
    const carreira = estudo.carreiras[pj.a];
    const { atual, propostas } = cenariosDe(res, carreira.id);
    const bannerNo = criar('div');
    const topo = criar('div');
    const resumoNo = criar('div');
    const abasNo = criar('div');
    area.append(bannerNo, topo, resumoNo, abasNo);

    // ---- aviso de resultado desatualizado
    const atualizarBanner = () => {
      esvaziar(bannerNo);
      const r = resultadoAtual();
      if (r?.desatualizado) {
        bannerNo.append(faixa('aviso', criar('strong', {}, 'Os dados mudaram desde o último cálculo.'), ' ',
          botao('Recalcular', { variante: 'prim', aoClicar: () => desenhar(), atributos: { id: 'btn-recalcular' } })));
      }
    };
    parar = assinar((tipo) => { if (tipo === 'estudo') atualizarBanner(); });
    atualizarBanner();

    // ---- parâmetros do estudo
    const e = estudo.estudo;
    const vigencias = carreira.cenarios.filter((c) => c.papel === 'proposta').map((c) => `${c.nome}: ${c.inicio_vigencia}`);
    const linhaParametros = criar('p', { class: 'small muted', id: 'parametros-estudo' },
      `Posição da base: ${e.mes_posicao} · ${vigencias.length ? `vigência: ${vigencias.join('; ')}` : 'sem proposta'} · horizonte: ${e.exercicios} exercícios · encargos ${percentual(e.encargos_patronais)} · saída anual ${percentual(e.taxa_saida_anual)} · `,
      botao('Editar parâmetros', { variante: 'link', aoClicar: () => dialogoParametros(desenhar), atributos: { id: 'btn-editar-parametros', class: 'btn btn-link editar-only' } }));

    // ---- cenários
    const seletor = criar('div', { class: 'chips', role: 'group', 'aria-label': 'Cenários exibidos' });
    const todos = [atual, ...propostas];
    for (const c of todos) {
      const ligado = c.papel === 'atual' || !pj.ocultos.has(c.id);
      const chip = criar('button', {
        type: 'button', class: `chip${ligado ? ' chip-ligado' : ''}`, 'aria-pressed': String(ligado), disabled: c.papel === 'atual',
        'data-cenario': c.id,
      }, criar('span', { class: `marca ${MARCAS[c.estilo]} serie-${c.estilo}`, 'aria-hidden': 'true' }), c.nome);
      chip.addEventListener('click', () => {
        if (pj.ocultos.has(c.id)) pj.ocultos.delete(c.id); else pj.ocultos.add(c.id);
        desenharResumoEVisao();
        chip.setAttribute('aria-pressed', String(!pj.ocultos.has(c.id)));
        chip.classList.toggle('chip-ligado', !pj.ocultos.has(c.id));
      });
      seletor.append(chip);
    }
    const nProp = propostas.length;
    const bDup = botao('Duplicar cenário', {
      desabilitado: nProp >= MAX_PROPOSTAS, atributos: { id: 'btn-duplicar-projecao', class: 'btn btn-fant editar-only' },
      aoClicar: () => {
        const car = estado.estudo.carreiras[pj.a];
        const origem = [...car.cenarios].reverse().find((c) => c.papel === 'proposta') ?? car.cenarios.find((c) => c.papel === 'atual');
        const novo = cenarioDuplicado(estado.estudo, car, origem.id);
        if (!novo) return;
        editar((x) => { x.carreiras[pj.a].cenarios.push(novo); });
        selecionarCenario(pj.a, estado.estudo.carreiras[pj.a].cenarios.length - 1, 'estrutura');
        ctx.irPara('carreiras');
      },
    });
    if (estudo.carreiras.length > 1) {
      topo.append(campo({
        rotulo: 'Carreira', tipo: 'selecao', valor: String(pj.a), classe: 'campo-curto editar-only',
        opcoes: estudo.carreiras.map((c, i) => ({ valor: String(i), texto: c.nome })),
        aoMudar: (v) => { pj.a = Number(v); pj.ocultos = new Set(); desenhar(); },
      }).no);
    }
    topo.append(linhaParametros, seletor, acoes(bDup, nProp >= MAX_PROPOSTAS ? razao(bDup, `No máximo ${MAX_PROPOSTAS} propostas por carreira.`) : null));

    // ---- resumo e visões
    const ficticio = () => estado.estudo.tipo_dados === 'ficticio';
    const legendaFic = (t) => (ficticio() ? `${t} (Dados fictícios)` : t);
    const selecionados = () => [atual, ...propostas.filter((p) => !pj.ocultos.has(p.id))];
    const exAtual = porExercicio(atual.mensal.total, res);

    const desenharResumo = () => {
      esvaziar(resumoNo);
      const vigIdx = res.exercicios.findIndex((x) => !x.anteriorVigencia);
      const mostradas = propostas.filter((p) => !pj.ocultos.has(p.id));
      if (!mostradas.length) {
        resumoNo.append(faixa('info', 'Esta carreira não tem proposta. Use "Duplicar cenário" para criar uma e comparar com o cenário atual.'));
        return;
      }
      for (const p of mostradas) {
        const imp = impacto(porExercicio(p.mensal.total, res).map((x) => x.valor), exAtual.map((x) => x.valor));
        const exVig = res.exercicios[vigIdx];
        const nMeses = mesesComImpacto(res, exVig, p);
        const tres = soma(imp.slice(vigIdx, vigIdx + 3));
        const ate = res.exercicios[res.exercicios.length - 1].ano;
        const fic = estado.estudo.tipo_dados === 'ficticio' ? ' (Dados fictícios)' : '';
        resumoNo.append(criar('section', { class: 'cartao-resumo', 'aria-label': `Resumo: ${p.nome}` },
          criar('h2', { class: 'resumo-titulo' }, p.nome, ' ', criar('span', { class: `marca ${MARCAS[p.estilo]} serie-${p.estilo}`, 'aria-hidden': 'true' })),
          criar('dl', { class: 'resumo' },
            criar('div', { 'data-resumo': 'vigencia' }, criar('dt', {}, `Impacto em ${exVig.ano}${nMeses < 12 ? ` (${nMeses} meses com impacto)` : ''}${fic}`), criar('dd', {}, milhoes(imp[vigIdx]))),
            criar('div', { 'data-resumo': 'tres' }, criar('dt', {}, `Impacto de ${res.exercicios[vigIdx].ano} a ${res.exercicios[Math.min(vigIdx + 2, res.exercicios.length - 1)].ano}${fic}`), criar('dd', {}, milhoes(tres))),
            criar('div', { 'data-resumo': 'acumulado' }, criar('dt', {}, `Acumulado até ${ate}${fic}`), criar('dd', {}, milhoes(soma(imp)))))));
      }
    };

    const painelVisao = (id, painel) => {
      pj.visao = id;
      limpaGraficos();
      const sels = selecionados();
      if (id === 'custo') visaoCusto(painel, res, sels);
      else if (id === 'impacto') visaoImpacto(painel, res, sels.filter((s) => s.papel === 'proposta'), exAtual);
      else if (id === 'componentes') visaoComponentes(painel, res, sels);
      else visaoMensal(painel, res, sels);
    };
    let comAbas;
    const desenharVisao = () => {
      esvaziar(abasNo);
      comAbas = abas({ rotulo: 'Visões', itens: VISOES, ativa: pj.visao, aoTrocar: (id, painel) => painelVisao(id, painel) });
      abasNo.append(comAbas.lista, comAbas.painel);
    };
    function desenharResumoEVisao() { desenharResumo(); desenharVisao(); }
    desenharResumoEVisao();
    area.append(criar('p', { class: 'small muted' }, FRASE_AVISO));

    // ---- visões

    function visaoCusto(painel, resultado, sels) {
      const graf = criar('div', { class: 'grafico' });
      desenharGrafico(graf, specCusto(resultado, sels, ficticio()))
        .then((g) => limparPainel.push(g));
      const valores = sels.map((c) => porExercicio(c.mensal.total, resultado));
      const linhas = resultado.exercicios.map((ex, i) => {
        const proposta = sels.find((c) => c.papel === 'proposta');
        const notaMeses = proposta && !ex.anteriorVigencia && res.exercicios.findIndex((x) => !x.anteriorVigencia) === i && mesesComImpacto(resultado, ex, proposta) < ex.meses
          ? `${ex.meses} (${mesesComImpacto(resultado, ex, proposta)} com impacto)` : String(ex.meses);
        return [String(ex.ano), notaMeses, ...valores.map((v) => reais(v[i].valor))];
      });
      linhas.push({ celulas: ['Total', String(soma(resultado.exercicios.map((x) => x.meses))), ...valores.map((v) => reais(soma(v.map((x) => x.valor))))], total: true });
      painel.append(secao('Custo por exercício', criar('div', { class: 'duas' }, graf, tabela({
        legenda: legendaFic('Custo anual (R$)'),
        colunas: [{ texto: 'Exercício' }, { texto: 'Meses', num: true }, ...sels.map((c) => ({ texto: c.nome, num: true }))],
        linhas,
      })), criar('p', { class: 'small muted' }, '"Meses" mostra os meses calculados e, no exercício da vigência, os meses com impacto: nada é anualizado em silêncio. Antes da vigência, atual e proposta são iguais.')));
    }

    function visaoImpacto(painel, resultado, props, exAt) {
      if (!props.length) { painel.append(faixa('info', 'Selecione ou crie uma proposta para ver o impacto incremental.')); return; }
      const graf = criar('div', { class: 'grafico' });
      const atuais = exAt.map((x) => x.valor);
      const dados = dadosImpacto(resultado, props, atuais);
      const fim = resultado.exercicios.length - 1;
      desenharGrafico(graf, specImpacto(resultado, dados, ficticio()))
        .then((g) => limparPainel.push(g));
      const cols = [{ texto: 'Exercício' }];
      for (const d of dados) cols.push({ texto: `${d.p.nome}: anual`, num: true }, { texto: `${d.p.nome}: acumulado`, num: true }, { texto: `${d.p.nome}: %`, num: true });
      const linhas = resultado.exercicios.map((ex, i) => [String(ex.ano), ...dados.flatMap((d) => [reais(d.anual[i]), reais(d.acum[i]), percentual(d.pct[i])])]);
      linhas.push({ celulas: ['Total', ...dados.flatMap((d) => [reais(soma(d.anual)), reais(d.acum[fim]), percentual(relativo(soma(d.anual), soma(atuais)))])], total: true });
      painel.append(secao('Impacto incremental: proposta menos cenário atual', criar('div', { class: 'duas' }, graf, tabela({
        legenda: legendaFic('Impacto (R$)'), colunas: cols, linhas,
      })), criar('p', { class: 'small muted' }, 'Impacto = proposta menos atual, com a mesma revisão geral nos dois. "n/d" quando o custo atual é zero.')));
    }

    function visaoComponentes(painel, resultado, sels) {
      let escolhido = Math.min(sels.length - 1, sels.length > 1 ? 1 : 0);
      const alvo = criar('div');
      const desenharComp = () => {
        limpaGraficos();
        esvaziar(alvo);
        const c = sels[escolhido];
        const comp = componentesAnuais(resultado, c);
        const { vv, d13, fer, enc, tot } = comp;
        const graf = criar('div', { class: 'grafico' });
        desenharGrafico(graf, specComponentes(resultado, c, comp, ficticio()))
          .then((g) => limparPainel.push(g));
        const linhas = resultado.exercicios.map((ex, i) => [String(ex.ano), reais(vv[i]), reais(d13[i]), reais(fer[i]), reais(enc[i]), reais(tot[i])]);
        linhas.push({ celulas: ['Total', reais(soma(vv)), reais(soma(d13)), reais(soma(fer)), reais(soma(enc)), reais(soma(tot))], total: true });
        alvo.append(criar('div', { class: 'duas' }, graf, tabela({
          legenda: legendaFic(`Componentes do custo: ${c.nome} (R$)`),
          colunas: [{ texto: 'Exercício' }, { texto: 'Vencimentos e vantagens', num: true }, { texto: '13º salário', num: true }, { texto: '1/3 de férias', num: true },
            { texto: `Encargos (${percentual(estado.estudo.estudo.encargos_patronais)})`, num: true }, { texto: 'Total', num: true }],
          linhas,
        })));
      };
      painel.append(secao('Componentes do custo', campo({
        rotulo: 'Cenário', tipo: 'selecao', valor: String(escolhido), classe: 'campo-curto',
        opcoes: sels.map((c, i) => ({ valor: String(i), texto: c.nome })), aoMudar: (v) => { escolhido = Number(v); desenharComp(); },
      }).no, alvo));
      desenharComp();
    }

    function visaoMensal(painel, resultado, sels) {
      const graf = criar('div', { class: 'grafico' });
      desenharGrafico(graf, specMensal(resultado, sels, ficticio()))
        .then((g) => limparPainel.push(g));
      const janelas = sels.map((c) => janela12(c.mensal.total));
      const cols = [{ texto: 'Mês' }];
      sels.forEach((c) => cols.push({ texto: `${c.nome}: mês`, num: true }, { texto: `${c.nome}: 12 meses`, num: true }));
      const linhas = resultado.meses.map((m, i) => [m, ...sels.flatMap((c, k) => [reais(c.mensal.total[i]), janelas[k][i] === null ? '-' : reais(janelas[k][i])])]);
      painel.append(secao('Mensal e janelas de 12 meses',
        criar('p', { class: 'small' }, 'A janela de 12 meses fica disponível a partir do 12º mês projetado; nos 11 primeiros meses a tela mostra "-", nunca zero.'),
        graf, tabela({ legenda: legendaFic('Custo mensal e janela móvel de 12 meses (R$)'), colunas: cols, linhas, classe: 'tabela-longa' })));
    }
  }

  // ---- parâmetros do estudo (diálogo)
  function dialogoParametros(recalcular) {
    const e = estado.estudo.estudo;
    const campos = {};
    const f = (chave, opts) => { campos[chave] = campo(opts); return campos[chave].no; };
    const msg = criar('div', { class: 'dialogo-msg' });
    const mesesFerias = campo({
      rotulo: 'Férias concentradas: meses e percentuais (ex.: 1=50; 7=50)', valor: e.ferias_terco.meses.map((m) => `${m.mes}=${decimalParaCampo(m.percentual)}`).join('; '),
      ajuda: 'Só vale na distribuição "concentrada". Os percentuais devem somar 100.',
    });
    const corpo = criar('div', { class: 'grade-dialogo' }, msg,
      f('nome', { rotulo: 'Nome do estudo', valor: e.nome, maxlength: 80 }),
      f('mes', { rotulo: 'Mês da posição da base (AAAA-MM)', valor: e.mes_posicao }),
      f('ex', { rotulo: 'Horizonte (exercícios)', valor: String(e.exercicios), inputmode: 'numeric', ajuda: 'De 3 a 30, contados do exercício da vigência.' }),
      f('enc', { rotulo: 'Encargos patronais (%)', valor: decimalParaCampo(e.encargos_patronais), inputmode: 'decimal' }),
      f('saida', { rotulo: 'Taxa anual de saída (%)', valor: decimalParaCampo(e.taxa_saida_anual), inputmode: 'decimal', ajuda: 'De 0 a 50. A mesma para todas as linhas e cenários.' }),
      f('d13', { rotulo: 'Calcular o 13º salário', tipo: 'caixa', valor: e.decimo_terceiro.ativo }),
      f('d13mes', { rotulo: 'Mês da 1ª parcela do 13º (vazio = tudo em dezembro)', valor: e.decimo_terceiro.mes_primeira_parcela === null ? '' : String(e.decimo_terceiro.mes_primeira_parcela), inputmode: 'numeric' }),
      f('d13pct', { rotulo: 'Percentual da 1ª parcela do 13º (%)', valor: decimalParaCampo(e.decimo_terceiro.pct_primeira_parcela), inputmode: 'decimal' }),
      f('fer', { rotulo: 'Calcular o adicional de 1/3 de férias', tipo: 'caixa', valor: e.ferias_terco.ativo }),
      f('ferdist', { rotulo: 'Distribuição das férias no ano', tipo: 'selecao', valor: e.ferias_terco.distribuicao, opcoes: [{ valor: 'uniforme', texto: 'Uniforme (1/12 por mês)' }, { valor: 'concentrada', texto: 'Concentrada em meses' }] }),
      mesesFerias.no,
      f('e13', { rotulo: 'Encargos incidem sobre o 13º', tipo: 'caixa', valor: e.encargos_incidem.decimo_terceiro }),
      f('efe', { rotulo: 'Encargos incidem sobre o 1/3 de férias', tipo: 'caixa', valor: e.encargos_incidem.terco_ferias }),
      f('fixa', { rotulo: 'A parcela fixa em reais integra a remuneração (13º e 1/3)', tipo: 'caixa', valor: e.fixa_integra_remuneracao }),
      f('notas', { rotulo: 'Notas livres (sem nomes de pessoas)', tipo: 'area', valor: e.notas, linhas: 3 }));
    abrirDialogo({
      titulo: 'Parâmetros do estudo', largo: true, corpo,
      acoes: [{ texto: 'Cancelar' }, {
        texto: 'Aplicar', variante: 'prim', manter: true,
        aoClicar: (fechar) => {
          esvaziar(msg);
          const v = (k) => campos[k].entrada;
          const num = (t) => (/^\d+$/.test(t.trim()) ? Number(t.trim()) : t.trim());
          const meses = lerRotulos(mesesFerias.entrada.value).map((p) => {
            const [m, pc] = p.split('=');
            return { mes: num(m ?? ''), percentual: campoParaDecimal(pc ?? '') };
          }).filter((x) => x.mes !== '');
          const cand = copia(estado.estudo);
          Object.assign(cand.estudo, {
            nome: v('nome').value.trim(), mes_posicao: v('mes').value.trim(), exercicios: num(v('ex').value),
            encargos_patronais: campoParaDecimal(v('enc').value), taxa_saida_anual: campoParaDecimal(v('saida').value),
            decimo_terceiro: { ativo: v('d13').checked, mes_primeira_parcela: v('d13mes').value.trim() === '' ? null : num(v('d13mes').value), pct_primeira_parcela: campoParaDecimal(v('d13pct').value) },
            ferias_terco: { ativo: v('fer').checked, distribuicao: v('ferdist').value, meses: v('ferdist').value === 'uniforme' ? [] : meses },
            encargos_incidem: { decimo_terceiro: v('e13').checked, terco_ferias: v('efe').checked },
            fixa_integra_remuneracao: v('fixa').checked, notas: v('notas').value,
          });
          const val = validarEstudo(cand);
          if (!val.ok) {
            msg.append(faixa('erro', criar('strong', {}, `${val.erros.length} ${val.erros.length === 1 ? 'problema' : 'problemas'}:`),
              criar('ul', { class: 'lista-simples' }, val.erros.slice(0, 6).map((x) => criar('li', {}, x.mensagem)))));
            return false;
          }
          editar((x) => { x.estudo = cand.estudo; });
          fechar();
          recalcular();
          return undefined;
        },
      }],
    });
  }

  parar = () => {};
  await desenhar();
  return () => { limpaGraficos(); desfazerReuniao(); parar(); };
}
