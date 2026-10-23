// Componentes de interface montados só com createElement/textContent (ver dom.js). Estados transversais da
// especificação (docs/design/especificacao.md, seção 4): carregando, vazio, erro, sucesso, aviso.
import { criar, esvaziar } from './dom.js';

let contador = 0;
export const novoIdDom = (prefixo = 'c') => `${prefixo}-${++contador}`;

// ----------------------------------------------------------------------------- avisos e estados

const ICONES = { erro: '✖', ok: '✔', info: 'ⓘ', aviso: '▲' };

/** Faixa de mensagem. tipo: erro | ok | info | aviso. `papel`: 'alert' só para erro bloqueante; 'status' para sucesso. */
export function faixa(tipo, ...conteudo) {
  const papel = tipo === 'erro' ? 'alert' : tipo === 'ok' ? 'status' : null;
  return criar('div', { class: `faixa faixa-${tipo}`, role: papel },
    criar('span', { 'aria-hidden': 'true' }, ICONES[tipo] ?? ''),
    criar('div', { class: 'faixa-texto' }, ...conteudo));
}

export function selo(texto, tipo = 'neutro') {
  const icone = { ok: '✔ ', erro: '✖ ', aviso: '▲ ', info: '● ' }[tipo] ?? '';
  return criar('span', { class: `selo selo-${tipo}` }, icone ? criar('span', { 'aria-hidden': 'true' }, icone) : null, texto);
}

/** Estado vazio: título (h2), uma frase e no máximo uma ação. */
export function vazio(titulo, texto, acao = null) {
  return criar('section', { class: 'vazio' }, criar('h2', {}, titulo), criar('p', {}, texto), acao);
}

/** Esqueletos de carregamento (sem giro; respeita reduced-motion). */
export function esqueletos(n = 3) {
  return criar('div', { class: 'carregando', 'aria-busy': 'true' },
    criar('p', { class: 'so-leitor' }, 'Carregando…'),
    Array.from({ length: n }, () => criar('div', { class: 'esqueleto', 'aria-hidden': 'true' })));
}

/** Anuncia uma mensagem curta a leitores de tela (região #anuncios). */
export function anunciar(texto) {
  const r = document.getElementById('anuncios');
  if (!r) return;
  r.textContent = '';
  setTimeout(() => { r.textContent = texto; }, 30);
}

// ----------------------------------------------------------------------------- botões

/** variante: prim | fant | perigo. */
export function botao(texto, { variante = 'fant', aoClicar = null, desabilitado = false, tipo = 'button', atributos = {} } = {}) {
  const b = criar('button', { type: tipo, class: `btn btn-${variante}`, disabled: desabilitado, ...atributos }, texto);
  if (aoClicar) b.addEventListener('click', (e) => aoClicar(e, b));
  return b;
}

/** Texto ao lado de um botão desabilitado, ligado a ele por aria-describedby (razão visível). */
export function razao(b, texto) {
  const id = novoIdDom('razao');
  b.setAttribute('aria-describedby', id);
  return criar('span', { class: 'small muted', id }, texto);
}

export function acoes(...nos) {
  return criar('div', { class: 'acoes' }, ...nos);
}

// ----------------------------------------------------------------------------- campos

/**
 * Campo de formulário. `tipo`: texto (padrão) | area | selecao | caixa. `opcoes` (selecao): [{valor, texto}].
 * `aoMudar(valor)`: no evento "change" (ao sair do campo). Retorna { no, entrada, id, definirErro }.
 */
export function campo({ rotulo, valor = '', tipo = 'texto', opcoes = [], ajuda = null, aoMudar = null, inputmode = null,
  desabilitado = false, somenteLeitura = false, placeholder = null, maxlength = null, linhas = 4, classe = '', ocultarRotulo = false } = {}) {
  const id = novoIdDom('campo');
  let entrada;
  if (tipo === 'selecao') {
    entrada = criar('select', { id, disabled: desabilitado },
      opcoes.map((o) => criar('option', { value: o.valor, disabled: o.desabilitado }, o.texto)));
    entrada.value = String(valor);
  } else if (tipo === 'area') {
    entrada = criar('textarea', { id, rows: linhas, disabled: desabilitado, readonly: somenteLeitura, placeholder, maxlength });
    entrada.value = String(valor ?? '');
  } else if (tipo === 'caixa') {
    entrada = criar('input', { id, type: 'checkbox', disabled: desabilitado });
    entrada.checked = Boolean(valor);
  } else {
    entrada = criar('input', { id, type: 'text', inputmode, disabled: desabilitado, readonly: somenteLeitura, placeholder, maxlength, autocomplete: 'off' });
    entrada.value = String(valor ?? '');
  }
  const ajudaId = ajuda ? `${id}-ajuda` : null;
  const erroId = `${id}-erro`;
  const noErro = criar('div', { class: 'erro-campo', id: erroId, hidden: true });
  const descreve = () => {
    const ids = [ajudaId, noErro.hidden ? null : erroId].filter(Boolean);
    if (ids.length) entrada.setAttribute('aria-describedby', ids.join(' '));
    else entrada.removeAttribute('aria-describedby');
  };
  descreve();
  if (aoMudar) {
    entrada.addEventListener('change', () => aoMudar(tipo === 'caixa' ? entrada.checked : entrada.value, entrada));
  }
  const rot = criar('label', { for: id, class: ocultarRotulo ? 'so-leitor' : null }, rotulo);
  const no = tipo === 'caixa'
    ? criar('div', { class: `campo campo-caixa ${classe}` }, entrada, rot, ajuda ? criar('div', { class: 'ajuda', id: ajudaId }, ajuda) : null, noErro)
    : criar('div', { class: `campo ${classe}` }, rot, entrada, ajuda ? criar('div', { class: 'ajuda', id: ajudaId }, ajuda) : null, noErro);
  const definirErro = (mensagem) => {
    if (mensagem) {
      noErro.textContent = mensagem;
      noErro.hidden = false;
      entrada.setAttribute('aria-invalid', 'true');
    } else {
      noErro.textContent = '';
      noErro.hidden = true;
      entrada.removeAttribute('aria-invalid');
    }
    descreve();
  };
  return { no, entrada, id, definirErro };
}

/**
 * Conjunto de campos ligados a caminhos do estudo (`carreiras[0].cenarios[0]...`). Mostra, em cada campo, o motivo do
 * erro que o motor devolveu; o que não tiver campo vai para o resumo do formulário (CA-04: campo e motivo).
 */
export class Formulario {
  constructor() { this.campos = new Map(); this.ganchos = []; }
  adicionar(caminho, c) { this.campos.set(caminho, c); return c; }
  limpar() { this.campos.clear(); this.ganchos = []; }
  /** Registra uma função chamada depois de cada `aplicar` (ex.: lista de erros de uma tabela). */
  aoAplicar(fn) { this.ganchos.push(fn); }
  /** Aplica a lista de erros do validador; devolve os que não tinham campo. */
  aplicar(erros) {
    for (const c of this.campos.values()) c.definirErro(null);
    const sem = [];
    for (const e of erros) {
      const c = this.campos.get(e.caminho);
      if (c) c.definirErro(semCaminho(e.mensagem));
      else sem.push(e);
    }
    for (const g of this.ganchos) g(erros);
    return sem;
  }
  focar(caminho) { this.campos.get(caminho)?.entrada.focus(); }
}

/** Tira o "caminho: " do começo da mensagem do motor (o campo já diz onde está). */
export function semCaminho(mensagem) {
  const m = /^[^\s:]+(?:\s\([a-z_0-9]+\))?:\s(.*)$/s.exec(String(mensagem));
  const t = m ? m[1] : String(mensagem);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Resumo de problemas do formulário: "N problemas", cada um com botão que leva ao campo. */
export function resumoDeErros(erros, formulario = null, titulo = null) {
  if (!erros.length) return null;
  const itens = erros.slice(0, 12).map((e) => {
    const c = formulario?.campos.get(e.caminho);
    const texto = semCaminho(e.mensagem);
    const rotulo = e.caminho ? `${nomeDoCaminho(e.caminho)}: ${texto}` : texto;
    return criar('li', {}, c ? botao(rotulo, { variante: 'link', aoClicar: () => c.entrada.focus() }) : rotulo);
  });
  return criar('div', { class: 'faixa faixa-erro', role: 'alert' },
    criar('span', { 'aria-hidden': 'true' }, ICONES.erro),
    criar('div', { class: 'faixa-texto' },
      criar('strong', {}, titulo ?? `${erros.length} ${erros.length === 1 ? 'problema impede' : 'problemas impedem'} salvar.`),
      criar('ul', { class: 'lista-simples' }, itens, erros.length > 12 ? criar('li', {}, `E mais ${erros.length - 12}.`) : null)));
}

const NOMES_CAMPO = {
  nome: 'Nome', rotulos: 'Rótulos', intersticio_meses: 'Interstício', taxa_exito: 'Taxa de êxito', passos: 'Passos',
  atraso_efeito_meses: 'Atraso do efeito', eixo: 'Eixo', valor_base: 'Valor-base', inicio_vigencia: 'Início da vigência',
  referencia_valores: 'Mês de referência', percentual: 'Percentual', mes_posicao: 'Mês da posição', exercicios: 'Exercícios',
  encargos_patronais: 'Encargos', taxa_saida_anual: 'Taxa de saída', regra_posicao_outro_eixo: 'Regra de posição',
  bloco_meses: 'Meses por bloco', max_blocos: 'Máximo de blocos', pct_por_bloco: 'Percentual por bloco', mes: 'Data-base',
};

/** Rótulo curto e legível de um caminho do estudo, para o resumo de problemas. */
export function nomeDoCaminho(caminho) {
  const partes = String(caminho).split('.');
  const ultimo = partes[partes.length - 1].replace(/\[\d+\]/g, '');
  let base = NOMES_CAMPO[ultimo] ?? ultimo.replace(/_/g, ' ');
  const t = /trilhas\[(\d+)\]/.exec(caminho);
  if (t) base = `Trilha ${Number(t[1]) + 1}, ${base.toLowerCase()}`;
  const v = /versoes\[(\d+)\]/.exec(caminho);
  if (v && !t) base = `Versão ${Number(v[1]) + 1}, ${base.toLowerCase()}`;
  const cel = /valores\[(\d+)\]\[(\d+)\]/.exec(caminho);
  if (cel) base = `Tabela, linha ${Number(cel[1]) + 1}, coluna ${Number(cel[2]) + 1}`;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

// ----------------------------------------------------------------------------- tabelas

/**
 * Tabela com legenda. `colunas`: [{texto, num}]. `linhas`: [{celulas: [...], total, classe}] ou listas simples.
 * A primeira célula de cada linha é cabeçalho de linha (th scope="row") quando `cabecalhoLinha`.
 */
export function tabela({ legenda, legendaVisivel = true, colunas, linhas, cabecalhoLinha = true, classe = '', rolagem = true }) {
  const cab = criar('tr', {}, colunas.map((c) => criar('th', { scope: 'col', class: c.num ? 'n' : null }, c.texto)));
  const corpo = linhas.map((l) => {
    const linha = Array.isArray(l) ? { celulas: l } : l;
    const celulas = linha.celulas.map((c, i) => {
      const num = colunas[i]?.num;
      if (cabecalhoLinha && i === 0) return criar('th', { scope: 'row' }, c);
      return criar('td', { class: num ? 'n' : null }, c);
    });
    return criar('tr', { class: [linha.total ? 'total' : '', linha.classe ?? ''].join(' ').trim() || null }, celulas);
  });
  const t = criar('table', { class: classe },
    criar('caption', { class: legendaVisivel ? null : 'so-leitor' }, legenda),
    criar('thead', {}, cab), criar('tbody', {}, corpo));
  return rolagem ? criar('div', { class: classe.includes('tabela-longa') ? 'rolagem rolagem-alta' : 'rolagem', tabindex: '0', role: 'region', 'aria-label': typeof legenda === 'string' ? legenda : 'Tabela' }, t) : t;
}

// ----------------------------------------------------------------------------- abas

/**
 * Abas (tablist) com setas, Home e End. `aoTrocar(id)` desenha o conteúdo no painel (um só elemento, role tabpanel).
 * Retorna { lista, painel, ativar(id) }.
 */
export function abas({ rotulo, itens, ativa, aoTrocar }) {
  const idBase = novoIdDom('aba');
  const painel = criar('div', { role: 'tabpanel', id: `${idBase}-painel`, tabindex: '0', class: 'painel-aba' });
  const lista = criar('div', { role: 'tablist', 'aria-label': rotulo, class: 'abas' });
  const botoes = new Map();
  const ativar = (id, { foco = false } = {}) => {
    for (const [k, b] of botoes) {
      const sel = k === id;
      b.setAttribute('aria-selected', String(sel));
      b.tabIndex = sel ? 0 : -1;
    }
    painel.setAttribute('aria-labelledby', botoes.get(id).id);
    if (foco) botoes.get(id).focus();
    esvaziar(painel);
    aoTrocar(id, painel);
  };
  itens.forEach((it) => {
    const b = criar('button', { type: 'button', role: 'tab', id: `${idBase}-${it.id}`, 'aria-selected': 'false', 'aria-controls': painel.id, tabindex: '-1', class: 'aba' }, it.titulo);
    b.addEventListener('click', () => ativar(it.id));
    b.addEventListener('keydown', (e) => {
      const ids = itens.map((x) => x.id);
      const i = ids.indexOf(it.id);
      let novo = null;
      if (e.key === 'ArrowRight') novo = ids[(i + 1) % ids.length];
      else if (e.key === 'ArrowLeft') novo = ids[(i - 1 + ids.length) % ids.length];
      else if (e.key === 'Home') novo = ids[0];
      else if (e.key === 'End') novo = ids[ids.length - 1];
      if (novo) { e.preventDefault(); ativar(novo, { foco: true }); }
    });
    botoes.set(it.id, b);
    lista.append(b);
  });
  ativar(ativa);
  return { lista, painel, ativar };
}

// ----------------------------------------------------------------------------- diálogo

/**
 * Diálogo modal nativo (<dialog>): foco preso, Esc fecha, foco volta a quem abriu.
 * `acoes`: [{texto, variante, aoClicar(fechar), manter}] — por padrão o botão fecha o diálogo depois do clique.
 */
export function abrirDialogo({ titulo, corpo, acoes: lista = [], aoFechar = null, largo = false }) {
  const idTitulo = novoIdDom('dlg');
  const dlg = criar('dialog', { class: `dialogo${largo ? ' dialogo-largo' : ''}`, 'aria-labelledby': idTitulo });
  const rodape = criar('div', { class: 'acoes' });
  const fechar = () => { if (dlg.open) dlg.close(); };
  for (const a of lista) {
    const b = botao(a.texto, { variante: a.variante ?? 'fant', desabilitado: a.desabilitado });
    b.addEventListener('click', async () => {
      if (a.aoClicar) {
        const r = await a.aoClicar(fechar, b);
        if (r === false) return;
      }
      if (!a.manter) fechar();
    });
    rodape.append(b);
  }
  dlg.append(criar('h2', { id: idTitulo }, titulo), criar('div', { class: 'dialogo-corpo' }, corpo), rodape);
  dlg.addEventListener('close', () => { dlg.remove(); if (aoFechar) aoFechar(); });
  document.body.append(dlg);
  dlg.showModal();
  return { dialogo: dlg, fechar, rodape };
}

/** Pergunta de confirmação. Resolve true/false. */
export function confirmar({ titulo, texto, confirmar: rotulo = 'Confirmar', perigo = false, cancelar = 'Cancelar' }) {
  return new Promise((ok) => {
    let resposta = false;
    abrirDialogo({
      titulo,
      corpo: criar('p', {}, texto),
      acoes: [
        { texto: cancelar, variante: 'fant' },
        { texto: rotulo, variante: perigo ? 'perigo' : 'prim', aoClicar: () => { resposta = true; } },
      ],
      aoFechar: () => ok(resposta),
    });
  });
}

// ----------------------------------------------------------------------------- seção e cartão

export function secao(titulo, ...filhos) {
  const id = novoIdDom('sec');
  return criar('section', { class: 'cartao', 'aria-labelledby': id }, criar('h2', { id }, titulo), ...filhos);
}

/** Selo do tipo de dados do estudo. */
export function seloTipo(tipo) {
  return tipo === 'ficticio' ? selo('Dados fictícios', 'ficticio') : selo('Real anonimizado', 'real');
}
