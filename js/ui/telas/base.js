// T3. Importação da base de servidores (M2; CA-07, CA-08): CSV ou XLSX, validação com recusa total, relatório de erros
// por linha, avisos de grupo pequeno e gravação. A base não tem dado pessoal: colunas identificadoras são recusadas.
import { lerPrimeiraAba } from '../../externos/xlsx-leitura.js';
import { K_MINIMO, LIMITES } from '../../motor/constantes.js';
import { agruparBase, validarBase } from '../../motor/base.js';
import { mostrarAvisoPendente, mostrarMensagem } from '../avisos.js';
import { acoes, botao, campo, faixa, razao, secao, selo, tabela, vazio } from '../componentes.js';
import { criar, esvaziar, linkRota } from '../dom.js';
import { baixar } from '../download.js';
import { estado, gravarBase } from '../estado.js';
import { gruposPequenos, lerArquivoBase, linhasParaJson, modeloCsv, relatorioCsv } from '../importacao.js';

const sel = { estudo: null, a: 0 };

function resumoDaBase(c, estudo) {
  const idx = c.base.colunas.indexOf('quantidade');
  const servidores = c.base.linhas.reduce((s, l) => s + (idx < 0 || l[idx] === null ? 1 : l[idx]), 0);
  return { linhas: c.base.linhas.length, servidores, mes: estudo.estudo.mes_posicao, tipo: estudo.tipo_dados };
}

/** Erros do estudo que não são da base (impedem validar a planilha contra a carreira). */
const errosDaCarreira = () => estado.validacao.erros.filter((e) => !/\.base(\.|$)/.test(e.caminho));

export function telaBase(container) {
  if (sel.estudo !== estado.estudo) Object.assign(sel, { estudo: estado.estudo, a: 0 });
  mostrarAvisoPendente(container);
  const estudo = estado.estudo;
  const topo = criar('div');
  const atualNo = criar('div');
  const importNo = criar('div');
  container.append(topo, atualNo, importNo);
  const carreira = () => estado.estudo.carreiras[Math.min(sel.a, estado.estudo.carreiras.length - 1)];

  if (estudo.carreiras.length > 1) {
    topo.append(campo({
      rotulo: 'Carreira', tipo: 'selecao', valor: String(sel.a), classe: 'campo-curto',
      opcoes: estudo.carreiras.map((c, i) => ({ valor: String(i), texto: c.nome })),
      aoMudar: (v) => { sel.a = Number(v); desenhar(); },
    }).no);
  }

  const desenharAtual = () => {
    esvaziar(atualNo);
    const c = carreira();
    const r = resumoDaBase(c, estado.estudo);
    if (!r.linhas) {
      atualNo.append(vazio('Sem base de servidores', 'Importe a planilha para projetar a base.'));
      return;
    }
    atualNo.append(secao('Base atual', criar('p', { id: 'resumo-base' },
      `${r.linhas} linha(s), ${r.servidores} servidor(es), posição de ${r.mes}. `, selo(r.tipo === 'ficticio' ? 'Dados fictícios' : 'Real anonimizado', r.tipo === 'ficticio' ? 'ficticio' : 'real'))));
  };

  const desenharImportacao = () => {
    esvaziar(importNo);
    const c = carreira();
    const bloqueio = errosDaCarreira();
    const saida = criar('div', { class: 'saida-importacao', 'aria-live': 'polite' });
    const entrada = criar('input', { type: 'file', id: 'arquivo-base', accept: '.csv,.txt,.xlsx' });
    const sec = secao('Importar a base',
      faixa('info', criar('strong', {}, 'Orientação.'), ' Use códigos sequenciais; não use matrícula; agrupe quem está na mesma situação.'),
      criar('ol', { class: 'passos' },
        criar('li', {}, criar('strong', {}, 'Baixar o modelo. '), botao('Baixar modelo (CSV)', {
          atributos: { id: 'btn-modelo-base' },
          aoClicar: () => baixar('modelo-base-servidores.csv', new Blob([modeloCsv()], { type: 'text/csv;charset=utf-8' })),
        })),
        criar('li', {}, criar('strong', {}, 'Escolher o arquivo '), '(CSV em UTF-8 com ponto e vírgula, ou XLSX, até 2 MB e 5.000 linhas). ',
          criar('div', { class: 'campo' }, criar('label', { for: 'arquivo-base' }, `Planilha da carreira "${c.nome}"`), entrada)),
        criar('li', {}, criar('strong', {}, 'Validar: '), 'acontece ao escolher o arquivo. Qualquer erro recusa a planilha inteira; nada é gravado.'),
        criar('li', {}, criar('strong', {}, 'Confirmar e gravar.'))),
      saida);
    importNo.append(sec);
    if (bloqueio.length) {
      saida.append(faixa('erro', criar('strong', {}, 'Corrija a carreira antes de importar a base.'), ' ', bloqueio[0].mensagem, ' ', linkRota('Ir para Carreiras', '#/carreiras')));
      entrada.disabled = true;
      return;
    }
    entrada.addEventListener('change', async () => {
      esvaziar(saida);
      const f = entrada.files?.[0];
      if (!f) return;
      saida.append(criar('p', {}, 'Validando…'));
      importNo.setAttribute('aria-busy', 'true');
      let p;
      try { p = await processar(f, c); } finally { importNo.removeAttribute('aria-busy'); }
      esvaziar(saida);
      mostrarResultado(saida, p, c);
    });
  };

  /** Lê e valida o arquivo; devolve o que a tela precisa para mostrar o resultado. */
  async function processar(arquivo, c) {
    const lido = await lerArquivoBase(arquivo, { lerAba: lerPrimeiraAba });
    const base = { arquivo, lido, erros: [...lido.erros], avisos: [], linhas: null, agrupadas: null, confere: null };
    const iMes = lido.cabecalho.indexOf('mes_posicao');
    const iTipo = lido.cabecalho.indexOf('tipo_dados');
    const unicos = (i) => (i < 0 ? [] : [...new Set(lido.linhas.map((l) => (l[i] ?? '').trim()))].slice(0, 3));
    base.confere = { nome: arquivo.name, linhas: lido.linhas.length, mes: unicos(iMes), tipo: unicos(iTipo) };
    if (base.erros.length) return base;
    const vb = validarBase(lido.cabecalho, lido.linhas, { estudo: estado.estudo, carreiraId: c.id, numerosLinha: lido.numerosLinha });
    base.erros.push(...vb.erros);
    base.avisos = vb.avisos;
    if (vb.ok) {
      const ag = agruparBase(vb.linhas);
      base.agrupadas = ag;
      base.linhas = ag.linhas;
      base.servidores = vb.linhas.reduce((s, l) => s + l.q, 0);
    }
    return base;
  }

  function mostrarResultado(saida, p, c) {
    const conf = p.confere;
    saida.append(criar('h3', {}, 'Conferência do arquivo'));
    saida.append(criar('dl', { class: 'conferencia' },
      criar('div', {}, criar('dt', {}, 'Arquivo'), criar('dd', {}, conf.nome.slice(0, 80))),
      criar('div', {}, criar('dt', {}, 'Linhas de dados'), criar('dd', {}, String(conf.linhas))),
      criar('div', {}, criar('dt', {}, 'Mês da posição'), criar('dd', {}, conf.mes.join(', ') || '-')),
      criar('div', {}, criar('dt', {}, 'Tipo de dados'), criar('dd', {}, conf.tipo.map((t) => (t === 'ficticio' ? 'Dados fictícios' : t === 'real_anonimizado' ? 'Real anonimizado' : t)).join(', ') || '-')),
      p.servidores !== undefined ? criar('div', {}, criar('dt', {}, 'Total de servidores'), criar('dd', {}, String(p.servidores))) : null));

    if (p.erros.length) {
      const n = p.erros.length;
      saida.append(faixa('erro', criar('strong', {}, `Planilha recusada: ${n} ${n === 1 ? 'erro' : 'erros'}.`), ' Nada foi gravado. Corrija o arquivo e envie de novo.'));
      saida.append(tabela({
        legenda: 'Relatório de erros',
        colunas: [{ texto: 'Linha', num: true }, { texto: 'Coluna' }, { texto: 'Motivo' }],
        linhas: p.erros.slice(0, LIMITES.errosRelatados).map((e) => [e.linha ? String(e.linha) : '-', e.coluna || '-', e.mensagem]),
        cabecalhoLinha: false,
      }));
      const baixa = botao('Baixar relatório (CSV)', {
        atributos: { id: 'btn-baixar-relatorio' },
        aoClicar: () => baixar('relatorio-erros-base.csv', new Blob([relatorioCsv(p.erros, p.avisos)], { type: 'text/csv;charset=utf-8' })),
      });
      const gravar = botao('Gravar base', { variante: 'prim', desabilitado: true, atributos: { id: 'btn-gravar-base' } });
      saida.append(acoes(baixa, gravar, razao(gravar, `Corrija os ${n} ${n === 1 ? 'erro' : 'erros'} e envie de novo.`)));
    }
    if (p.avisos.length) listarAvisos(saida, p.avisos);
    if (!p.erros.length && p.linhas) {
      const pequenos = gruposPequenos(p.linhas, K_MINIMO).length;
      saida.append(faixa('ok', criar('strong', {}, 'Planilha válida.'),
        ` ${p.linhas.length} linha(s) depois de juntar as iguais (${p.agrupadas.agrupadas} juntada(s)), ${p.servidores} servidor(es).`,
        pequenos ? ` ${pequenos} grupo(s) com menos de ${K_MINIMO} servidores: risco de identificar pessoas.` : ''));
      const existente = carreira().base.linhas.length;
      const gravar = botao('Gravar base', { variante: 'prim', atributos: { id: 'btn-gravar-base' } });
      const status = criar('div', { class: 'status-gravacao' });
      gravar.addEventListener('click', async () => {
        gravar.disabled = true;
        gravar.textContent = 'Gravando…';
        const r = await gravarBase(c.id, linhasParaJson(p.linhas));
        gravar.textContent = 'Gravar base';
        esvaziar(status);
        if (!r.ok) { gravar.disabled = false; status.append(faixa('erro', r.mensagem)); return; }
        esvaziar(saida);
        mostrarMensagem(saida, `Base gravada: ${p.linhas.length} linhas, ${p.servidores} servidores, posição de ${estado.estudo.estudo.mes_posicao}.`);
        if (p.avisos.length) listarAvisos(saida, p.avisos);
        desenharAtual();
      });
      saida.append(acoes(gravar, existente ? criar('span', { class: 'small muted' }, `Substitui a base atual (${existente} linha(s)).`) : null), status);
    }
  }

  function listarAvisos(saida, avisos) {
    saida.append(criar('h3', {}, `Avisos (${avisos.length}); não impedem a gravação`));
    saida.append(criar('ul', { class: 'lista-avisos' }, avisos.slice(0, 100).map((a) =>
      criar('li', {}, criar('span', { 'aria-hidden': 'true' }, '▲ '), a.mensagem))));
  }

  const desenhar = () => { desenharAtual(); desenharImportacao(); };
  desenhar();
}
