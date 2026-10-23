// T2. Cadastro da carreira (F1; CA-01 a CA-04, CA-22, CA-24): estrutura, tabela, trilhas, parcelas, versões e revisão geral.
// Edita o estudo aberto direto no modelo JSON v1 (estado.editar); o motor valida e cada campo mostra o motivo do erro.
import { LIMITES } from '../../motor/constantes.js';
import { mesValido } from '../../motor/numero.js';
import { mostrarAvisoPendente } from '../avisos.js';
import {
  abas, acoes, botao, campo, confirmar, abrirDialogo, faixa, Formulario, nomeDoCaminho, razao, secao, selo, semCaminho, tabela,
} from '../componentes.js';
import { criar, esvaziar } from '../dom.js';
import { assinar, editar, estado } from '../estado.js';
import { campoParaDecimal, decimalParaCampo, reais } from '../formatar.js';
import {
  MAX_PROPOSTAS, ajustarRegras, carreiraNova, cenarioDuplicado, lerRotulos, somarMeses, tabelaDaVersao, versaoDuplicada,
} from '../modelo.js';
import { campoModelo } from './campos-modelo.js';
import { painelParcelas, painelTrilhas } from './carreiras-regras.js';
import { painelTabela } from './carreiras-tabela.js';

const sel = { estudo: null, a: 0, b: 0, aba: 'estrutura', versao: 0 };

/** Seleciona carreira e cenário antes de abrir a tela (ex.: depois de duplicar um cenário na projeção). */
export function selecionarCenario(a, b, aba = 'estrutura') {
  Object.assign(sel, { estudo: estado.estudo, a, b, aba, versao: 0 });
}

const ABAS = [
  { id: 'estrutura', titulo: '1 Estrutura' }, { id: 'tabela', titulo: '2 Tabela' }, { id: 'trilhas', titulo: '3 Trilhas' },
  { id: 'parcelas', titulo: '4 Parcelas' }, { id: 'versoes', titulo: '5 Versões' }, { id: 'revisao', titulo: '6 Revisão geral' },
];

function normalizar() {
  if (sel.estudo !== estado.estudo) Object.assign(sel, { estudo: estado.estudo, a: 0, b: 0, aba: 'estrutura', versao: 0 });
  const cs = estado.estudo.carreiras;
  sel.a = Math.min(sel.a, cs.length - 1);
  sel.b = Math.min(sel.b, cs[sel.a].cenarios.length - 1);
  sel.versao = Math.min(sel.versao, cs[sel.a].cenarios[sel.b].regras.versoes.length - 1);
}

/** Seleção ligada ao caminho de um erro: devolve { a, b, aba, versao } ou null. */
export function destinoDoCaminho(caminho) {
  const m = /^carreiras\[(\d+)\](?:\.cenarios\[(\d+)\])?(.*)$/.exec(caminho);
  if (!m) return /^estudo\.revisoes_gerais/.test(caminho) ? { aba: 'revisao' } : null;
  const resto = m[3];
  const v = /versoes\[(\d+)\]/.exec(resto);
  if (/\.base(\.|$)/.test(resto)) return null;
  let aba = 'estrutura';
  if (/\.regras\.versoes\[\d+\]\.(valores|gerador)/.test(resto)) aba = 'tabela';
  else if (/\.regras\.versoes/.test(resto)) aba = 'versoes';
  else if (/\.regras\.(trilhas|nao_acumulacao)/.test(resto)) aba = 'trilhas';
  else if (/\.regras\.parcelas/.test(resto)) aba = 'parcelas';
  return { a: Number(m[1]), b: m[2] === undefined ? 0 : Number(m[2]), aba, versao: v ? Number(v[1]) : undefined };
}

export function telaCarreiras(container) {
  normalizar();
  mostrarAvisoPendente(container);
  const formulario = new Formulario();
  const topo = criar('div', { class: 'seletores' });
  const resumoNo = criar('div', { class: 'resumo-erros' });
  const abasNo = criar('div');
  container.append(topo, resumoNo, abasNo);

  const carreira = () => estado.estudo.carreiras[sel.a];
  const cenario = () => carreira().cenarios[sel.b];
  const regras = () => cenario().regras;
  const P = () => `carreiras[${sel.a}].cenarios[${sel.b}]`;
  let painelAtual = null;
  let painelFn = null;

  const amb = {
    sel, formulario, carreira, cenario, regras, P,
    estudo: () => estado.estudo,
    mudar: (fn, op) => editar(fn, op),
    /** Redesenha o painel da aba atual (depois de mudança de estrutura). */
    redesenhar: () => { if (painelFn) painelFn(); },
  };

  // ------------------------------------------------------------- resumo de problemas
  const irPara = (caminho) => {
    const d = destinoDoCaminho(caminho);
    if (!d) return;
    if (d.a !== undefined) { sel.a = d.a; sel.b = d.b; }
    if (d.versao !== undefined) sel.versao = d.versao;
    normalizar();
    desenharTudo(d.aba);
    setTimeout(() => formulario.focar(caminho), 0);
  };
  const atualizarErros = () => {
    const erros = estado.validacao.erros;
    formulario.aplicar(erros);
    esvaziar(resumoNo);
    if (!erros.length) return;
    const itens = erros.slice(0, 12).map((e) => {
      const texto = `${nomeDoCaminho(e.caminho)}: ${semCaminho(e.mensagem)}`;
      return criar('li', {}, destinoDoCaminho(e.caminho) ? botao(texto, { variante: 'link', aoClicar: () => irPara(e.caminho) }) : texto);
    });
    resumoNo.append(criar('div', { class: 'faixa faixa-erro', role: 'alert' },
      criar('span', { 'aria-hidden': 'true' }, '✖'),
      criar('div', { class: 'faixa-texto' },
        criar('strong', { id: 'resumo-titulo' }, `${erros.length} ${erros.length === 1 ? 'problema impede' : 'problemas impedem'} salvar.`),
        criar('ul', { class: 'lista-simples' }, itens, erros.length > 12 ? criar('li', {}, `E mais ${erros.length - 12}.`) : null))));
  };

  // ------------------------------------------------------------- seletores
  const desenharTopo = () => {
    esvaziar(topo);
    const cs = estado.estudo.carreiras;
    const selCar = campo({
      rotulo: 'Carreira', tipo: 'selecao', valor: String(sel.a), classe: 'campo-curto',
      opcoes: cs.map((c, i) => ({ valor: String(i), texto: c.nome })),
      aoMudar: (v) => { sel.a = Number(v); sel.b = 0; sel.versao = 0; desenharTudo(); },
    });
    const cens = carreira().cenarios;
    const selCen = campo({
      rotulo: 'Cenário', tipo: 'selecao', valor: String(sel.b), classe: 'campo-curto',
      opcoes: cens.map((c, i) => ({ valor: String(i), texto: c.papel === 'atual' ? `${c.nome} (atual)` : c.nome })),
      aoMudar: (v) => { sel.b = Number(v); sel.versao = 0; desenharTudo(); },
    });
    const nProp = cens.filter((c) => c.papel === 'proposta').length;
    const bNova = botao('Nova carreira', {
      desabilitado: cs.length >= LIMITES.carreiras, atributos: { id: 'btn-nova-carreira' },
      aoClicar: () => dialogoNovaCarreira(),
    });
    const bExc = botao('Excluir carreira', {
      variante: 'perigo', desabilitado: cs.length < 2, atributos: { id: 'btn-excluir-carreira' },
      aoClicar: async () => {
        const ok = await confirmar({
          titulo: 'Excluir carreira', texto: `Excluir a carreira "${carreira().nome}", com a base e todos os cenários? Esta ação não tem volta (o estudo grava sozinho).`,
          confirmar: 'Excluir carreira', perigo: true,
        });
        if (!ok) return;
        const id = carreira().id;
        editar((e) => { e.carreiras.splice(sel.a, 1); }, { removerCarreira: id });
        sel.a = 0; sel.b = 0; sel.versao = 0;
        desenharTudo();
      },
    });
    const bDup = botao('Duplicar cenário', {
      desabilitado: nProp >= MAX_PROPOSTAS, atributos: { id: 'btn-duplicar-cenario' },
      aoClicar: () => {
        const novo = cenarioDuplicado(estado.estudo, carreira(), cenario().id);
        if (!novo) return;
        editar((e) => { e.carreiras[sel.a].cenarios.push(novo); });
        sel.b = carreira().cenarios.length - 1;
        sel.versao = 0;
        desenharTudo('estrutura');
      },
    });
    const bExcCen = botao('Excluir cenário', {
      variante: 'perigo', desabilitado: cenario().papel === 'atual', atributos: { id: 'btn-excluir-cenario' },
      aoClicar: async () => {
        const ok = await confirmar({ titulo: 'Excluir cenário', texto: `Excluir o cenário "${cenario().nome}"?`, confirmar: 'Excluir cenário', perigo: true });
        if (!ok) return;
        editar((e) => { e.carreiras[sel.a].cenarios.splice(sel.b, 1); });
        sel.b = 0; sel.versao = 0;
        desenharTudo();
      },
    });
    topo.append(
      criar('div', { class: 'grade g2' }, selCar.no, selCen.no),
      acoes(bNova, bExc, bDup, nProp >= MAX_PROPOSTAS ? razao(bDup, `No máximo ${MAX_PROPOSTAS} propostas por carreira.`) : null,
        bExcCen, cenario().papel === 'atual' ? razao(bExcCen, 'O cenário atual não pode ser excluído.') : null,
        cs.length < 2 ? razao(bExc, 'O estudo precisa de ao menos uma carreira.') : null));
  };

  const dialogoNovaCarreira = () => {
    const nome = campo({ rotulo: 'Nome da carreira', maxlength: 80, ajuda: 'Igual ao valor da coluna "carreira" da planilha da base.' });
    abrirDialogo({
      titulo: 'Nova carreira', corpo: nome.no,
      acoes: [{ texto: 'Cancelar' }, {
        texto: 'Criar carreira', variante: 'prim', manter: true,
        aoClicar: (fechar) => {
          const n = nome.entrada.value.trim();
          const existe = estado.estudo.carreiras.some((c) => c.nome === n);
          if (!n || n.length > LIMITES.nome || existe || /^[=+\-@\t]/.test(n)) {
            nome.definirErro(!n ? 'Informe o nome da carreira.' : existe ? 'Já existe uma carreira com este nome.' : 'Use até 80 caracteres, sem começar por =, +, - ou @.');
            nome.entrada.focus();
            return false;
          }
          editar((e) => { e.carreiras.push(carreiraNova(n, e.estudo.mes_posicao)); });
          sel.a = estado.estudo.carreiras.length - 1; sel.b = 0; sel.versao = 0;
          fechar();
          desenharTudo('estrutura');
          return undefined;
        },
      }],
    });
    nome.entrada.focus();
  };

  // ------------------------------------------------------------- painéis
  const paineis = {
    estrutura: (p) => painelEstrutura(p, amb),
    tabela: (p) => painelTabela(p, amb),
    trilhas: (p) => painelTrilhas(p, amb),
    parcelas: (p) => painelParcelas(p, amb),
    versoes: (p) => painelVersoes(p, amb),
    revisao: (p) => painelRevisao(p, amb),
  };

  let comAbas = null;
  const desenharTudo = (aba = sel.aba) => {
    normalizar();
    sel.aba = aba;
    desenharTopo();
    esvaziar(abasNo);
    comAbas = abas({
      rotulo: 'Partes da carreira', itens: ABAS, ativa: aba,
      aoTrocar: (id, painel) => {
        sel.aba = id;
        painelAtual = painel;
        painelFn = () => { formulario.limpar(); esvaziar(painel); paineis[id](painel); atualizarErros(); };
        painelFn();
      },
    });
    abasNo.append(comAbas.lista, comAbas.painel);
    atualizarErros();
  };
  desenharTudo();

  const parar = assinar((tipo) => { if (tipo === 'estudo') atualizarErros(); });
  return () => parar();
}

// ----------------------------------------------------------------------------- 1 Estrutura

function painelEstrutura(p, amb) {
  const a = amb.sel.a;
  const b = amb.sel.b;
  const base = amb.P();
  const cen = amb.cenario();
  const car = amb.carreira();
  const proposta = cen.papel === 'proposta';

  const nomeCar = campoModelo(amb, `carreiras[${a}].nome`, {
    rotulo: 'Nome da carreira', maxlength: 80, ler: () => car.nome, escrever: (e, v) => { e.carreiras[a].nome = v.trim(); },
    ajuda: 'Igual ao valor da coluna "carreira" da planilha da base. Ao trocar o nome, a base já importada não muda.',
  });
  const nomeCen = campoModelo(amb, `${base}.nome`, {
    rotulo: 'Nome do cenário', maxlength: 80, ler: () => cen.nome, escrever: (e, v) => { e.carreiras[a].cenarios[b].nome = v.trim(); },
  });
  p.append(secao('Identificação', criar('div', { class: 'grade g2' }, nomeCar.no, nomeCen.no)));

  const eixosSec = secao('Eixos e posições');
  const grade = criar('div', { class: 'grade g2' });
  const contagens = [];
  for (let k = 0; k < 2; k++) {
    const eixo = cen.regras.eixos[k];
    const nome = campoModelo(amb, `${base}.regras.eixos[${k}].nome`, {
      rotulo: `Eixo ${k + 1}: nome`, maxlength: 40, ler: () => eixo.nome, escrever: (e, v) => { e.carreiras[a].cenarios[b].regras.eixos[k].nome = v.trim(); },
      ajuda: k === 0 ? 'Ex.: Nível ou Classe.' : 'Ex.: Grau ou Referência.',
    });
    const conta = criar('span', {}, '');
    const rot = campoModelo(amb, `${base}.regras.eixos[${k}].rotulos`, {
      rotulo: `Eixo ${k + 1}: posições, na ordem de progressão`, tipo: 'area', linhas: 3,
      ler: () => eixo.rotulos.join(', '),
      escrever: (e, v) => {
        const r = e.carreiras[a].cenarios[b].regras;
        r.eixos[k].rotulos = lerRotulos(v);
        ajustarRegras(r);
      },
      ajuda: criar('span', {}, 'Separe por vírgula ou quebra de linha. Rótulos livres (ex.: A, B, C… sem K). ', conta),
    });
    const atualizarConta = () => { conta.textContent = `${amb.regras().eixos[k].rotulos.length} posições.`; };
    atualizarConta();
    rot.entrada.addEventListener('change', () => { atualizarConta(); previa(); });
    nome.entrada.addEventListener('change', () => previa());
    contagens.push(atualizarConta);
    grade.append(criar('div', {}, nome.no, rot.no));
  }
  eixosSec.append(grade);
  p.append(eixosSec);

  if (proposta) p.append(blocoProposta(amb, base, a, b));

  const secPrevia = secao('Pré-visualização da matriz');
  const previaNo = criar('div');
  secPrevia.append(criar('p', { class: 'small muted' }, 'Os rótulos aparecem como serão exibidos nas tabelas e gráficos. Os valores vêm da versão 1 da tabela.'), previaNo);
  p.append(secPrevia);
  function previa() {
    esvaziar(previaNo);
    const r = amb.regras();
    const rot1 = r.eixos[0].rotulos;
    const rot2 = r.eixos[1].rotulos;
    const t = tabelaDaVersao(r.versoes[0], r.eixos);
    previaNo.append(tabela({
      legenda: `Matriz ${r.eixos[0].nome} × ${r.eixos[1].nome} (R$)`,
      colunas: [{ texto: `${r.eixos[0].nome} \\ ${r.eixos[1].nome}` }, ...rot2.map((x) => ({ texto: x, num: true }))],
      linhas: rot1.map((x, i) => [x, ...rot2.map((_, j) => (t.ok ? reais(t.matriz[i]?.[j]) : '-'))]),
      classe: 'matriz',
    }));
    if (!t.ok) previaNo.append(criar('p', { class: 'small muted' }, `Sem valores: ${t.mensagem}`));
  }
  previa();
  if (amb.estudo().carreiras.length && car.cenarios[0].regras.versoes[0].gerador?.valor_base === '1000.00' && car.cenarios[0].regras.versoes[0].modo === 'gerador') {
    p.append(faixa('info', criar('strong', {}, 'Valores de exemplo.'), ' Esta carreira usa o valor-base de modelo (R$ 1.000,00). Troque pela tabela da lei na aba "2 Tabela" antes de calcular.'));
  }
}

function blocoProposta(amb, base, a, b) {
  const cen = amb.cenario();
  const sec = secao('Proposta: vigência e enquadramento');
  const vig = campoModelo(amb, `${base}.inicio_vigencia`, {
    rotulo: 'Início da vigência (AAAA-MM)', ler: () => cen.inicio_vigencia, escrever: (e, v) => { e.carreiras[a].cenarios[b].inicio_vigencia = v.trim(); },
    ajuda: 'Mês em que o enquadramento ocorre e a proposta passa a valer; posterior ao mês da posição da base.',
  });
  const tipo = campo({
    rotulo: 'Enquadramento', tipo: 'selecao', valor: cen.enquadramento.tipo,
    opcoes: [
      { valor: 'mesma_posicao', texto: 'Mesma posição (os rótulos dos eixos são iguais)' },
      { valor: 'menor_valor_igual_ou_maior', texto: 'Posição de menor valor igual ou maior' },
      { valor: 'depara', texto: 'De-para digitado, posição a posição' },
    ],
    aoMudar: (v) => {
      amb.mudar((e) => {
        const c = e.carreiras[a].cenarios[b];
        c.enquadramento = v === 'depara' ? { tipo: 'depara', mapa: deparaPadrao(e.carreiras[a], c) } : { tipo: v };
      });
      amb.redesenhar();
    },
  });
  amb.formulario.adicionar(`${base}.enquadramento.tipo`, tipo);
  amb.formulario.adicionar(`${base}.enquadramento`, tipo);
  sec.append(criar('div', { class: 'grade g2' }, vig.no, tipo.no));
  if (cen.enquadramento.tipo === 'depara') sec.append(editorDepara(amb, a, b, base));
  return sec;
}

/** Mapa de-para inicial: mesma posição quando o rótulo existe na proposta; senão a primeira. */
function deparaPadrao(carreira, proposta) {
  const atual = carreira.cenarios.find((c) => c.papel === 'atual').regras.eixos;
  const alvo = proposta.regras.eixos;
  const mapa = [];
  for (const r1 of atual[0].rotulos) {
    for (const r2 of atual[1].rotulos) {
      mapa.push({ de: [r1, r2], para: [alvo[0].rotulos.includes(r1) ? r1 : alvo[0].rotulos[0], alvo[1].rotulos.includes(r2) ? r2 : alvo[1].rotulos[0]] });
    }
  }
  return mapa;
}

function editorDepara(amb, a, b, base) {
  const car = amb.carreira();
  const cen = amb.cenario();
  const atual = car.cenarios.find((c) => c.papel === 'atual').regras.eixos;
  const alvo = cen.regras.eixos;
  const cabecalho = criar('tr', {}, ['Posição atual', `${alvo[0].nome} na proposta`, `${alvo[1].nome} na proposta`].map((t) => criar('th', { scope: 'col' }, t)));
  const linhas = cen.enquadramento.mapa.map((m, i) => {
    const s1 = campo({
      rotulo: `${m.de.join('-')}: ${alvo[0].nome} na proposta`, ocultarRotulo: true, tipo: 'selecao', valor: m.para[0],
      opcoes: alvo[0].rotulos.map((r) => ({ valor: r, texto: r })),
      aoMudar: (v) => amb.mudar((e) => { e.carreiras[a].cenarios[b].enquadramento.mapa[i].para[0] = v; }),
    });
    const s2 = campo({
      rotulo: `${m.de.join('-')}: ${alvo[1].nome} na proposta`, ocultarRotulo: true, tipo: 'selecao', valor: m.para[1],
      opcoes: alvo[1].rotulos.map((r) => ({ valor: r, texto: r })),
      aoMudar: (v) => amb.mudar((e) => { e.carreiras[a].cenarios[b].enquadramento.mapa[i].para[1] = v; }),
    });
    return criar('tr', {}, criar('th', { scope: 'row' }, m.de.join('-')), criar('td', {}, s1.no), criar('td', {}, s2.no));
  });
  const reavaliar = botao('Refazer o mapa a partir dos rótulos', {
    aoClicar: () => { amb.mudar((e) => { const c = e.carreiras[a].cenarios[b]; c.enquadramento.mapa = deparaPadrao(e.carreiras[a], c); }); amb.redesenhar(); },
  });
  return criar('div', {},
    criar('p', { class: 'small muted' }, 'Cada posição do cenário atual vai para uma posição da proposta. Todas as posições precisam ter destino.'),
    criar('div', { class: 'rolagem rolagem-alta' }, criar('table', {}, criar('caption', {}, 'De-para do enquadramento'), criar('thead', {}, cabecalho), criar('tbody', {}, linhas))),
    acoes(reavaliar));
}

// ----------------------------------------------------------------------------- 5 Versões

function situacaoDaVersao(regras, v, i, vigenteIdx) {
  if (i === vigenteIdx) return selo('Vigente', 'ok');
  const ref = vigenteIdx >= 0 ? regras.versoes[vigenteIdx].inicio_vigencia : null;
  if (ref && mesValido(v.inicio_vigencia) && v.inicio_vigencia > ref) return selo('Futura', 'info');
  return selo('Encerrada', 'neutro');
}

function painelVersoes(p, amb) {
  const a = amb.sel.a;
  const b = amb.sel.b;
  const base = amb.P();
  const cen = amb.cenario();
  const r = amb.regras();
  const estudo = amb.estudo();
  const referencia = cen.papel === 'proposta' ? cen.inicio_vigencia : somarMeses(estudo.estudo.mes_posicao, 1);
  let vigente = -1;
  if (mesValido(referencia)) {
    r.versoes.forEach((v, i) => {
      if (mesValido(v.inicio_vigencia) && v.inicio_vigencia <= referencia && (vigente < 0 || v.inicio_vigencia > r.versoes[vigente].inicio_vigencia)) vigente = i;
    });
  }
  const sec = secao('Versões da tabela');
  sec.append(criar('p', { class: 'small muted' }, `Cada versão vale do mês de início até o mês anterior ao início da próxima. "Vigente" = a que vale em ${referencia}. Os valores de cada versão se referem ao poder de compra do mês de referência; as revisões gerais posteriores a ele são aplicadas.`));
  const celulasSituacao = [];
  const celulaSituacao = (i, no) => { const td = criar('td', {}, no); celulasSituacao[i] = td; return td; };
  /** Recalcula "Vigente / Futura / Encerrada" depois de mudar um início, sem redesenhar a tabela (o foco fica onde está). */
  const atualizarSituacoes = () => {
    const rr = amb.regras();
    let vig = -1;
    if (mesValido(referencia)) {
      rr.versoes.forEach((x, k) => {
        if (mesValido(x.inicio_vigencia) && x.inicio_vigencia <= referencia && (vig < 0 || x.inicio_vigencia > rr.versoes[vig].inicio_vigencia)) vig = k;
      });
    }
    rr.versoes.forEach((x, k) => { esvaziar(celulasSituacao[k]); celulasSituacao[k].append(situacaoDaVersao(rr, x, k, vig)); });
  };
  const cab = criar('tr', {}, ['Versão', 'Início da vigência (AAAA-MM)', 'Valores em moeda de (AAAA-MM)', 'Modo', 'Situação', 'Ações'].map((t) => criar('th', { scope: 'col' }, t)));
  const linhas = r.versoes.map((v, i) => {
    const ini = campoModelo(amb, `${base}.regras.versoes[${i}].inicio_vigencia`, {
      rotulo: `Versão ${i + 1}: início da vigência`, ocultarRotulo: true, ler: () => v.inicio_vigencia,
      escrever: (e, x) => { e.carreiras[a].cenarios[b].regras.versoes[i].inicio_vigencia = x.trim(); },
    });
    ini.entrada.addEventListener('change', () => atualizarSituacoes());
    const ref = campoModelo(amb, `${base}.regras.versoes[${i}].referencia_valores`, {
      rotulo: `Versão ${i + 1}: valores em moeda de`, ocultarRotulo: true, ler: () => v.referencia_valores,
      escrever: (e, x) => { e.carreiras[a].cenarios[b].regras.versoes[i].referencia_valores = x.trim(); },
    });
    const editar_ = botao('Editar tabela', { atributos: { 'aria-label': `Editar a tabela da versão ${i + 1}` }, aoClicar: () => { amb.sel.versao = i; amb.sel.aba = 'tabela'; document.querySelector('[role="tab"][id$="-tabela"]')?.click(); } });
    const rem = botao('Remover', {
      variante: 'perigo', desabilitado: r.versoes.length < 2, atributos: { 'aria-label': `Remover a versão ${i + 1}` },
      aoClicar: () => { amb.mudar((e) => { e.carreiras[a].cenarios[b].regras.versoes.splice(i, 1); }); amb.sel.versao = 0; amb.redesenhar(); },
    });
    return criar('tr', {},
      criar('th', { scope: 'row' }, `Versão ${i + 1}`), criar('td', {}, ini.no), criar('td', {}, ref.no),
      criar('td', {}, v.modo === 'gerador' ? 'Gerada por percentuais' : 'Digitada'), celulaSituacao(i, situacaoDaVersao(r, v, i, vigente)),
      criar('td', {}, criar('div', { class: 'acoes acoes-linha' }, editar_, rem)));
  });
  sec.append(criar('div', { class: 'rolagem' }, criar('table', { class: 'tabela-campos' },
    criar('caption', { class: 'so-leitor' }, 'Versões da tabela'), criar('thead', {}, cab), criar('tbody', {}, linhas))));
  const nova = botao('Nova versão a partir desta', {
    desabilitado: r.versoes.length >= LIMITES.versoes, atributos: { id: 'btn-nova-versao' },
    aoClicar: () => {
      amb.mudar((e) => {
        const reg = e.carreiras[a].cenarios[b].regras;
        reg.versoes.push(versaoDuplicada(reg, reg.versoes[Math.min(amb.sel.versao, reg.versoes.length - 1)]));
      });
      amb.sel.versao = amb.regras().versoes.length - 1;
      amb.redesenhar();
    },
  });
  sec.append(acoes(nova), criar('p', { class: 'small muted' }, `A nova versão copia a tabela da versão ${amb.sel.versao + 1}, com início 12 meses depois da última. Ajuste o início e os valores.`));
  p.append(sec);
}

// ----------------------------------------------------------------------------- 6 Revisão geral

function painelRevisao(p, amb) {
  const estudo = amb.estudo();
  const rev = estudo.estudo.revisoes_gerais;
  const sec = secao('Revisão geral');
  sec.append(criar('p', { class: 'small muted' }, 'Aplicada ao cenário atual e à proposta (CA-14). Cada linha é uma data-base. Percentual de -50% a +100%.'));
  if (!rev.length) {
    sec.append(criar('p', {}, `Sem revisão geral após ${estudo.estudo.mes_posicao}.`));
  } else {
    const cab = criar('tr', {}, ['Data-base (AAAA-MM)', 'Percentual (%)', 'Ações'].map((t) => criar('th', { scope: 'col' }, t)));
    const linhas = rev.map((r, i) => {
      const mes = campoModelo(amb, `estudo.revisoes_gerais[${i}].mes`, {
        rotulo: `Revisão ${i + 1}: data-base`, ocultarRotulo: true, ler: () => r.mes, escrever: (e, v) => { e.estudo.revisoes_gerais[i].mes = v.trim(); },
      });
      const pct = campoModelo(amb, `estudo.revisoes_gerais[${i}].percentual`, {
        rotulo: `Revisão ${i + 1}: percentual`, ocultarRotulo: true, inputmode: 'decimal', ler: () => decimalParaCampo(r.percentual),
        escrever: (e, v) => { e.estudo.revisoes_gerais[i].percentual = campoParaDecimal(v); },
      });
      const rem = botao('Remover', { variante: 'perigo', atributos: { 'aria-label': `Remover a revisão ${i + 1}` }, aoClicar: () => { amb.mudar((e) => { e.estudo.revisoes_gerais.splice(i, 1); }); amb.redesenhar(); } });
      return criar('tr', {}, criar('th', { scope: 'row' }, String(i + 1)), criar('td', {}, mes.no), criar('td', {}, pct.no), criar('td', {}, rem));
    });
    sec.append(criar('div', { class: 'rolagem' }, criar('table', { class: 'tabela-campos' }, criar('caption', { class: 'so-leitor' }, 'Revisões gerais'), criar('thead', {}, cab), criar('tbody', {}, linhas))));
  }
  const add = botao('Adicionar revisão', {
    desabilitado: rev.length >= LIMITES.revisoesGerais, atributos: { id: 'btn-nova-revisao' },
    aoClicar: () => {
      amb.mudar((e) => {
        const ult = e.estudo.revisoes_gerais.map((x) => x.mes).filter(mesValido).sort().pop();
        const mes = ult ? somarMeses(ult, 12) : somarMeses(e.estudo.mes_posicao, 5);
        e.estudo.revisoes_gerais.push({ mes, percentual: '0' });
      });
      amb.redesenhar();
    },
  });
  sec.append(acoes(add));
  p.append(sec);
}

