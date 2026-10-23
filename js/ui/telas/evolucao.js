// T4. Evolução individual (F2; CA-05, CA-06): um servidor, posição inicial escolhida, horizonte em anos, taxa de êxito e
// revisão geral só para esta simulação (o estudo não muda). O cálculo é do motor (evolucaoIndividual).
import { ErroMotor } from '../../motor/constantes.js';
import { evolucaoIndividual } from '../../motor/simulacao.js';
import { validarEstudo } from '../../motor/validacao.js';
import { campo, faixa, secao, tabela, vazio } from '../componentes.js';
import { criar, esvaziar, linkRota } from '../dom.js';
import { estado } from '../estado.js';
import { campoParaDecimal, decimalParaCampo, percentual, reais } from '../formatar.js';
import { premissasEvolucao, registrarSimulacao } from '../../exportacao/dados.js';
import { rotuloPosicao, specEvolucao } from '../../exportacao/graficos.js';
import { desenharGrafico } from '../graficos.js';
import { copia } from '../modelo.js';

const ev = { estudo: null, a: 0, b: 0, i1: '', i2: '', anos: '5', mc1: '0', mc2: '0', exito: {}, revModo: 'estudo', revMes: '', revPct: '0' };

const EFEITO = { aplicada: 'Mudou de posição', descartada: 'Não ocorreu (descartada)', topo: 'Já estava no topo: sem efeito' };

function inteiro(t) { return /^\d+$/.test(String(t).trim()) ? Number(String(t).trim()) : NaN; }

export function telaEvolucao(container) {
  if (ev.estudo !== estado.estudo) Object.assign(ev, { estudo: estado.estudo, a: 0, b: 0, i1: '', i2: '', anos: '5', mc1: '0', mc2: '0', exito: {}, revModo: 'estudo', revMes: '', revPct: '0' });
  const estudo = estado.estudo;
  const formNo = criar('div');
  const saida = criar('div', { class: 'saida-evolucao', 'aria-live': 'polite' });
  container.append(formNo, saida);
  let destruirGrafico = null;

  const carreira = () => estado.estudo.carreiras[Math.min(ev.a, estado.estudo.carreiras.length - 1)];
  const cenario = () => carreira().cenarios[Math.min(ev.b, carreira().cenarios.length - 1)];
  const atual = () => carreira().cenarios.find((c) => c.papel === 'atual');

  function desenharFormulario() {
    esvaziar(formNo);
    const car = carreira();
    const at = atual();
    const eixos = at.regras.eixos;
    const trilhas = at.regras.trilhas;
    const linha1 = criar('div', { class: 'grade g3' });
    if (estudo.carreiras.length > 1) {
      linha1.append(campo({
        rotulo: 'Carreira', tipo: 'selecao', valor: String(ev.a),
        opcoes: estudo.carreiras.map((c, i) => ({ valor: String(i), texto: c.nome })),
        aoMudar: (v) => { ev.a = Number(v); ev.b = 0; ev.i1 = ''; ev.i2 = ''; ev.exito = {}; desenharFormulario(); executar(); },
      }).no);
    }
    linha1.append(campo({
      rotulo: 'Cenário simulado', tipo: 'selecao', valor: String(ev.b),
      opcoes: car.cenarios.map((c, i) => ({ valor: String(i), texto: c.papel === 'atual' ? `${c.nome} (atual)` : c.nome })),
      aoMudar: (v) => { ev.b = Number(v); executar(); },
    }).no);
    linha1.append(campo({
      rotulo: 'Horizonte (anos)', valor: ev.anos, inputmode: 'numeric', ajuda: 'De 1 a 30 anos.',
      aoMudar: (v) => { ev.anos = v.trim(); executar(); },
    }).no);

    const linha2 = criar('div', { class: 'grade g4' });
    linha2.append(campo({
      rotulo: `Posição inicial: ${eixos[0].nome}`, tipo: 'selecao', valor: ev.i1,
      opcoes: [{ valor: '', texto: 'Escolha…' }, ...eixos[0].rotulos.map((r) => ({ valor: r, texto: r }))],
      aoMudar: (v) => { ev.i1 = v; executar(); },
    }).no);
    linha2.append(campo({
      rotulo: `Posição inicial: ${eixos[1].nome}`, tipo: 'selecao', valor: ev.i2,
      opcoes: [{ valor: '', texto: 'Escolha…' }, ...eixos[1].rotulos.map((r) => ({ valor: r, texto: r }))],
      aoMudar: (v) => { ev.i2 = v; executar(); },
    }).no);
    for (const eixo of [1, 2]) {
      const t = trilhas.find((x) => x.eixo === eixo);
      if (!t) continue;
      linha2.append(campo({
        rotulo: `Meses já cumpridos no interstício (${eixos[eixo - 1].nome})`, valor: eixo === 1 ? ev.mc1 : ev.mc2, inputmode: 'numeric',
        ajuda: `De 0 a ${t.intersticio_meses + t.atraso_efeito_meses}.`,
        aoMudar: (v) => { if (eixo === 1) ev.mc1 = v.trim(); else ev.mc2 = v.trim(); executar(); },
      }).no);
    }
    const linha3 = criar('div', { class: 'grade g4' });
    trilhas.forEach((t) => {
      linha3.append(campo({
        rotulo: `Taxa de êxito, trilha ${eixos[t.eixo - 1].nome} (%)`, inputmode: 'decimal', valor: decimalParaCampo(ev.exito[t.id] ?? t.taxa_exito),
        ajuda: `No estudo: ${decimalParaCampo(t.taxa_exito)}%. Vale só nesta simulação.`,
        aoMudar: (v) => { ev.exito[t.id] = campoParaDecimal(v); executar(); },
      }).no);
    });
    const rev = campo({
      rotulo: 'Revisão geral', tipo: 'selecao', valor: ev.revModo, classe: 'campo-curto',
      opcoes: [{ valor: 'estudo', texto: 'A do estudo' }, { valor: 'nenhuma', texto: 'Nenhuma' }, { valor: 'uma', texto: 'Uma revisão (informe abaixo)' }],
      aoMudar: (v) => { ev.revModo = v; desenharFormulario(); executar(); },
    });
    linha3.append(rev.no);
    if (ev.revModo === 'uma') {
      linha3.append(campo({
        rotulo: 'Data-base da revisão (AAAA-MM)', valor: ev.revMes, aoMudar: (v) => { ev.revMes = v.trim(); executar(); },
      }).no, campo({
        rotulo: 'Percentual da revisão (%)', inputmode: 'decimal', valor: decimalParaCampo(ev.revPct),
        aoMudar: (v) => { ev.revPct = campoParaDecimal(v); executar(); },
      }).no);
    }
    formNo.append(secao('Simulação', linha1, linha2, linha3,
      criar('p', { class: 'small muted' }, 'Mexer aqui não altera o estudo: são premissas só desta simulação. Para mudar o estudo, use Carreiras e Projeção.')));
  }

  function montarSimulacao() {
    const sim = copia(estado.estudo);
    for (const c of sim.carreiras) c.base.linhas = [];
    const car = sim.carreiras[Math.min(ev.a, sim.carreiras.length - 1)];
    // a taxa digitada vale para a trilha da carreira atual e para as trilhas do mesmo eixo nas propostas
    const at = car.cenarios.find((c) => c.papel === 'atual');
    for (const t of at.regras.trilhas) {
      if (ev.exito[t.id] === undefined) continue;
      for (const cen of car.cenarios) for (const u of cen.regras.trilhas) if (u.eixo === t.eixo) u.taxa_exito = ev.exito[t.id];
    }
    if (ev.revModo === 'nenhuma') sim.estudo.revisoes_gerais = [];
    else if (ev.revModo === 'uma') sim.estudo.revisoes_gerais = [{ mes: ev.revMes, percentual: ev.revPct }];
    return { sim, car };
  }

  function executar() {
    destruirGrafico?.();
    destruirGrafico = null;
    esvaziar(saida);
    if (!ev.i1 || !ev.i2) {
      saida.append(vazio('Escolha a posição inicial', 'Escolha a posição inicial para ver a evolução.'));
      return;
    }
    const anos = inteiro(ev.anos);
    if (!(anos >= 1 && anos <= 30)) { saida.append(faixa('erro', 'Horizonte: informe de 1 a 30 anos.')); return; }
    const mc1 = inteiro(ev.mc1);
    const mc2 = inteiro(ev.mc2);
    if (Number.isNaN(mc1) || Number.isNaN(mc2)) { saida.append(faixa('erro', 'Meses cumpridos: informe um número inteiro de meses (0 ou mais).')); return; }
    const { sim, car } = montarSimulacao();
    const v = validarEstudo(sim);
    if (!v.ok) {
      saida.append(faixa('erro', criar('strong', {}, 'Não foi possível simular.'), criar('ul', { class: 'lista-simples' }, v.erros.slice(0, 6).map((e) => criar('li', {}, e.mensagem))),
        linkRota('Ir para Carreiras', '#/carreiras')));
      return;
    }
    let res;
    let cenarioEscolhido = null;
    try {
      const cen = car.cenarios[Math.min(ev.b, car.cenarios.length - 1)];
      res = evolucaoIndividual(sim, car.id, cen.id, { posicao: { eixo1: ev.i1, eixo2: ev.i2 }, meses_cumpridos: { eixo1: mc1, eixo2: mc2 } }, anos * 12);
      cenarioEscolhido = cen;
    } catch (e) {
      esvaziar(saida);
      const erros = e instanceof ErroMotor ? e.erros : [{ mensagem: 'Erro inesperado no cálculo.' }];
      saida.append(faixa('erro', criar('strong', {}, 'Não foi possível calcular: '), erros[0].mensagem));
      return;
    }
    esvaziar(saida);
    mostrarResultado(res, sim, car, { cen: cenarioEscolhido, anos, mc1, mc2 });
  }

  function mostrarResultado(res, sim, car, entrada) {
    const at = car.cenarios.find((c) => c.papel === 'atual');
    const certo = at.regras.trilhas.every((t) => Number(t.taxa_exito) === 100);
    const rotValor = certo ? 'Vencimento da tabela' : 'Valor esperado do vencimento da tabela';
    const rotPos = certo ? 'Posição' : 'Posição mais provável';
    const nRev = sim.estudo.revisoes_gerais.length;
    const premissas = premissasEvolucao(at, nRev);
    saida.append(criar('p', { class: 'premissas-linha', id: 'premissas-evolucao' }, criar('strong', {}, 'Premissas usadas: '), premissas, ' ', linkRota('Ver premissas', '#/premissas')));

    const n = res.meses.length;
    const rot = res.posicaoProvavel.map(rotuloPosicao);
    registrarSimulacao({
      estudo: estado.estudo, edicao: estado.edicao, carreiraNome: car.nome, cenarioNome: entrada.cen.nome, posicao: { eixo1: ev.i1, eixo2: ev.i2 },
      mesesCumpridos: { eixo1: entrada.mc1, eixo2: entrada.mc2 }, anos: entrada.anos, resultado: res, certo, premissas,
    });
    const graf = criar('div', { class: 'grafico' });
    const area = secao(`${rotValor} mês a mês`, graf,
      criar('p', { class: 'small muted' }, 'Vencimento da tabela da posição, sem parcelas, 13º, 1/3 de férias nem encargos. Cada degrau mostra a posição.'));
    saida.append(area);
    desenharGrafico(graf, specEvolucao(res, rotValor, estado.estudo.tipo_dados === 'ficticio'))
      .then((g) => { destruirGrafico = g.destruir; });

    // por exercício
    const porAno = new Map();
    res.meses.forEach((m, i) => {
      const ano = m.slice(0, 4);
      const x = porAno.get(ano) ?? { ano, meses: 0, soma: 0, ultimo: i };
      x.meses++; x.soma += res.valorEsperado[i]; x.ultimo = i;
      porAno.set(ano, x);
    });
    saida.append(secao('Por exercício', tabela({
      legenda: 'Evolução por exercício',
      colunas: [{ texto: 'Exercício' }, { texto: 'Meses', num: true }, { texto: `${rotPos} ao fim` }, { texto: `${rotValor} ao fim`, num: true }, { texto: 'Soma no exercício', num: true }],
      linhas: [...porAno.values()].map((x) => [x.ano, String(x.meses), rot[x.ultimo], reais(res.valorEsperado[x.ultimo]), reais(x.soma)]),
    })));

    saida.append(secao('Mês a mês', tabela({
      legenda: 'Evolução mês a mês',
      colunas: [{ texto: 'Mês' }, { texto: rotPos }, { texto: rotValor, num: true }],
      linhas: res.meses.map((m, i) => [m, rot[i], reais(res.valorEsperado[i])]),
      classe: 'tabela-longa',
    })));

    saida.append(secao('Mudanças de posição', res.eventos.length ? tabela({
      legenda: 'Eventos de trilha',
      colunas: [{ texto: 'Mês' }, { texto: 'Trilha' }, { texto: 'De' }, { texto: 'Para' }, { texto: 'Efeito' }],
      linhas: res.eventos.map((e) => [e.mes, e.trilha, `${e.de.eixo1}-${e.de.eixo2}`, `${e.para.eixo1}-${e.para.eixo2}`, EFEITO[e.efeito] ?? e.efeito]),
      cabecalhoLinha: false,
    }) : criar('p', {}, 'Nenhuma trilha venceu dentro do horizonte.')));

    if (!certo) {
      const det = criar('details', { class: 'cartao' }, criar('summary', {}, 'Ver distribuição'));
      const alvo = criar('div');
      const mesSel = campo({
        rotulo: 'Mês', tipo: 'selecao', valor: String(n - 1), classe: 'campo-curto',
        opcoes: res.meses.map((m, i) => ({ valor: String(i), texto: m })),
        aoMudar: (v) => desenharDist(Number(v)),
      });
      const desenharDist = (i) => {
        esvaziar(alvo);
        alvo.append(tabela({
          legenda: `Distribuição das posições em ${res.meses[i]}`,
          colunas: [{ texto: 'Posição' }, { texto: 'Probabilidade', num: true }],
          linhas: res.distribuicao[i].map((d) => [`${d.eixo1}-${d.eixo2}`, percentual(String(Number(d.massa) * 100))]),
        }));
      };
      desenharDist(n - 1);
      det.append(mesSel.no, alvo);
      saida.append(det);
    }
  }

  desenharFormulario();
  executar();
  return () => { destruirGrafico?.(); };
}
