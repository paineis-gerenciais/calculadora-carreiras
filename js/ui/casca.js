// Casca da interface: logos com texto alternativo, menu, navegação entre telas e faixa de tipo de dados.
// Dados só entram no DOM por textContent (ver dom.js). As telas são funções registradas por id (ver main.js).
import { criar, esvaziar, linkRota } from './dom.js';
import { ROTA_PADRAO, TELAS, resolverRota, trilhaDe } from './rotas.js';
import { vazio } from './componentes.js';
import { assinar, estado, estudoAberto, nomeDoEstudo, tipoDeDados } from './estado.js';

/** Sem arquivo de logo: mostra o texto alternativo dentro de caixa tracejada, nunca imagem quebrada (CA-19). */
function protegerLogos(raiz) {
  for (const img of raiz.querySelectorAll('img.logo-img')) {
    const trocar = () => {
      const classes = [...img.classList].filter((c) => c !== 'logo-img').concat('logo-texto');
      const caixa = criar('span', { class: classes.join(' '), role: 'img', 'aria-label': img.dataset.textoAlternativo }, img.dataset.textoAlternativo);
      img.replaceWith(caixa);
    };
    img.addEventListener('error', trocar, { once: true });
    if (img.complete && img.naturalWidth === 0) trocar();
  }
}

/** "Ir para o conteúdo": foca o conteúdo sem mudar o hash (o hash é a rota; "#conteudo" não é uma tela). */
function configurarPular(raiz) {
  const pular = raiz.querySelector('.pular');
  pular?.addEventListener('click', (e) => {
    e.preventDefault();
    raiz.getElementById('conteudo').focus();
  });
}

function configurarMenu(raiz) {
  const menu = raiz.getElementById('menu');
  const botao = raiz.getElementById('btn-menu');
  const definir = (aberto) => {
    menu.classList.toggle('aberto', aberto);
    botao.setAttribute('aria-expanded', String(aberto));
  };
  botao.addEventListener('click', () => definir(botao.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && botao.getAttribute('aria-expanded') === 'true') { definir(false); botao.focus(); }
  });
  // Tocar no link da tela atual não muda a rota (sem "hashchange"): o menu fecha mesmo assim.
  raiz.getElementById('menu-lista').addEventListener('click', (e) => { if (e.target.closest('a[data-rota]')) definir(false); });
  return { fechar: () => definir(false) };
}

function desenharTrilha(raiz, tela) {
  const ol = raiz.getElementById('trilha');
  esvaziar(ol);
  const itens = trilhaDe(tela, nomeDoEstudo());
  itens.forEach((item, i) => {
    const ultimo = i === itens.length - 1;
    ol.append(criar('li', ultimo ? { 'aria-current': 'page' } : {}, item.rota && !ultimo ? linkRota(item.texto, item.rota) : item.texto));
  });
}

/**
 * Faixa permanente "Dados fictícios": visível quando o estudo aberto é fictício (CA-20). Para 'real_anonimizado' ou
 * sem estudo aberto a faixa some (a barra do estudo mostra o selo "Real anonimizado").
 */
export function definirTipoDados(raiz, tipo) {
  const faixa = raiz.getElementById('faixa-tipo');
  faixa.hidden = tipo !== 'ficticio';
  faixa.dataset.tipo = tipo ?? '';
  return !faixa.hidden;
}

/** Marca no menu o que falta no estudo aberto (ex.: base de servidores). */
function atualizarMenu(raiz) {
  const link = raiz.querySelector('#menu-lista a[data-rota="base"]');
  if (!link) return;
  link.querySelector('.menu-nota')?.remove();
  if (estudoAberto() && estado.estudo.carreiras.some((c) => c.base.linhas.length === 0)) {
    link.append(criar('span', { class: 'menu-nota' }, 'Falta'));
  }
}

/** Liga a casca: rota inicial, mudança de rota, menu, logos. `telas`: { id: (area, contexto) => limpeza? }. */
export function iniciarCasca(raiz = document, janela = window, { telas = {} } = {}) {
  protegerLogos(raiz);
  configurarPular(raiz);
  const menu = configurarMenu(raiz);
  const links = [...raiz.querySelectorAll('#menu-lista a[data-rota]')];
  let primeira = true;
  let limpeza = null;
  let senha = 0;
  let rotaAtual = null;

  const contexto = { raiz, janela, irPara: (id) => { janela.location.hash = `#/${id}`; } };

  const desenhar = async () => {
    const tela = resolverRota(janela.location.hash);
    const area = raiz.getElementById('tela');
    const minha = ++senha;
    if (typeof limpeza === 'function') { try { limpeza(); } catch { /* a tela anterior já saiu */ } }
    limpeza = null;
    esvaziar(area);
    area.setAttribute('aria-busy', 'true');
    const titulo = tela ? tela.titulo : 'Tela não encontrada';
    const h1 = criar('h1', { class: 'titulo-tela', tabindex: '-1' }, titulo);
    const conteudo = criar('div', { class: 'tela-conteudo' });
    area.append(h1, conteudo);
    if (!tela) {
      conteudo.append(vazio('Esta tela não existe', 'Use o menu para escolher uma tela.', linkRota('Ir para Estudos', `#/${ROTA_PADRAO}`)));
    } else if (tela.dentroDoEstudo && !estudoAberto()) {
      conteudo.append(vazio(tela.vazio.titulo, tela.vazio.texto, linkRota('Ir para Estudos', `#/${ROTA_PADRAO}`)));
    } else if (telas[tela.id]) {
      try {
        const r = await telas[tela.id](conteudo, contexto);
        if (minha !== senha) { if (typeof r === 'function') r(); return; }
        limpeza = r;
      } catch (e) {
        if (minha !== senha) return;
        esvaziar(conteudo);
        conteudo.append(vazio('Não foi possível abrir esta tela', 'Ocorreu um erro inesperado. Volte a Estudos e abra o estudo de novo.', linkRota('Ir para Estudos', `#/${ROTA_PADRAO}`)));
        console.error(e);
      }
    } else {
      conteudo.append(vazio(tela.vazio.titulo, tela.vazio.texto));
    }
    if (minha === senha) area.setAttribute('aria-busy', 'false');
  };

  const mostrar = () => {
    const tela = resolverRota(janela.location.hash);
    for (const a of links) {
      if (tela && a.dataset.rota === tela.id) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    desenharTrilha(raiz, tela);
    raiz.title = `${tela ? tela.titulo : 'Tela não encontrada'} · Simulador de carreiras`;
    menu.fechar();
    rotaAtual = tela?.id ?? null;
    const pronto = desenhar();
    // Na primeira carga o foco fica no começo da página; depois, vai para o título da nova tela.
    if (!primeira) raiz.querySelector('.titulo-tela')?.focus();
    primeira = false;
    return pronto;
  };

  const aoMudarEstudo = (tipo) => {
    if (tipo !== 'estudo') return;
    definirTipoDados(raiz, tipoDeDados());
    atualizarMenu(raiz);
    desenharTrilha(raiz, resolverRota(janela.location.hash));
  };
  assinar(aoMudarEstudo);
  definirTipoDados(raiz, tipoDeDados());

  janela.addEventListener('hashchange', mostrar);
  mostrar();
  return {
    irPara: contexto.irPara,
    telas: TELAS,
    /** Redesenha a tela atual (ex.: depois de abrir ou fechar um estudo). */
    redesenhar: () => desenhar(),
    rotaAtual: () => rotaAtual,
  };
}
