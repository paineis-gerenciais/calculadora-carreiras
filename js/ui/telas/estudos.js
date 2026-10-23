// T1. Estudos (M1, M9, M11, M8): criar, abrir, duplicar, excluir e importar JSON. Exportar JSON é ponto de entrada (parte 3).
import { LIMITES } from '../../motor/constantes.js';
import { lerEstudo } from '../../motor/formato.js';
import { validarEstudo } from '../../motor/validacao.js';
import { avisarNaProxima, mostrarAvisoPendente, mostrarMensagem } from '../avisos.js';
import {
  abrirDialogo, acoes, anunciar, botao, campo, confirmar, esqueletos, faixa, selo, seloTipo, vazio,
} from '../componentes.js';
import { anexar, criar, esvaziar } from '../dom.js';
import {
  abrir, carregarLista, criarEAbrir, duplicarEstudo, estado, excluirEstudoPorId, importarJson, nomeDoEstudo, temAlteracaoNaoSalva,
} from '../estado.js';
import { executarExportacao } from '../exportadores.js';
import { dataHora } from '../formatar.js';
import { estudoNovo, mesAtual } from '../modelo.js';

function listaDeErros(erros, limite = 10) {
  return criar('ul', { class: 'lista-simples' },
    erros.slice(0, limite).map((e) => criar('li', {}, e.mensagem)),
    erros.length > limite ? criar('li', {}, `E mais ${erros.length - limite}.`) : null);
}

/** Pergunta antes de abandonar o estudo aberto com alterações não gravadas. */
async function podeTrocarDeEstudo() {
  if (!temAlteracaoNaoSalva()) return true;
  return confirmar({
    titulo: 'Há alterações não gravadas',
    texto: `O estudo "${nomeDoEstudo()}" tem alterações que ainda não foram gravadas. Se abrir outro estudo agora, elas serão perdidas.`,
    confirmar: 'Abrir mesmo assim', perigo: true,
  });
}

// ----------------------------------------------------------------------------- novo estudo

function dialogoNovo(ctx) {
  const nome = campo({ rotulo: 'Nome do estudo', ajuda: 'Até 80 caracteres. Não escreva nomes de pessoas.', maxlength: 80 });
  const tipo = campo({
    rotulo: 'Tipo de dados', tipo: 'selecao', valor: 'ficticio',
    opcoes: [{ valor: 'ficticio', texto: 'Dados fictícios' }, { valor: 'real_anonimizado', texto: 'Real anonimizado' }],
    ajuda: 'Dados fictícios levam a faixa de aviso em todas as telas e arquivos.',
  });
  const mes = campo({ rotulo: 'Mês da posição da base (AAAA-MM)', valor: mesAtual(), ajuda: 'Mês a que se referem a posição e os meses cumpridos da base.' });
  const carreira = campo({ rotulo: 'Nome da primeira carreira', valor: 'Carreira 1', maxlength: 80 });
  const msg = criar('div', { class: 'dialogo-msg' });
  const real = criar('p', { class: 'small', hidden: true }, 'Use somente dados sem identificação pessoal: códigos sequenciais, sem nome, CPF ou matrícula. A base fica no banco de dados e qualquer pessoa com o endereço do sistema pode lê-la.');
  tipo.entrada.addEventListener('change', () => { real.hidden = tipo.entrada.value !== 'real_anonimizado'; });
  const corpo = criar('div', { class: 'grade-dialogo' }, msg, nome.no, tipo.no, real, mes.no, carreira.no);
  abrirDialogo({
    titulo: 'Novo estudo', corpo,
    acoes: [
      { texto: 'Cancelar', variante: 'fant' },
      {
        texto: 'Criar estudo', variante: 'prim', manter: true,
        aoClicar: async (fechar, b) => {
          esvaziar(msg);
          [nome, mes, carreira].forEach((c) => c.definirErro(null));
          const e = estudoNovo({ nome: nome.entrada.value.trim(), tipoDados: tipo.entrada.value, mesPosicao: mes.entrada.value.trim(), nomeCarreira: carreira.entrada.value.trim() });
          const v = validarEstudo(e);
          if (!v.ok) {
            const por = { 'estudo.nome': nome, 'estudo.mes_posicao': mes, 'carreiras[0].nome': carreira };
            const sem = [];
            for (const er of v.erros) { const c = por[er.caminho]; if (c) c.definirErro(er.mensagem.replace(/^[^:]*:\s*/, '')); else sem.push(er); }
            if (sem.length) msg.append(faixa('erro', listaDeErros(sem)));
            (nome.entrada.getAttribute('aria-invalid') ? nome : mes.entrada.getAttribute('aria-invalid') ? mes : carreira).entrada.focus();
            return false;
          }
          if (!(await podeTrocarDeEstudo())) return false;
          b.disabled = true;
          b.textContent = 'Criando…';
          const r = await criarEAbrir(e);
          b.disabled = false;
          b.textContent = 'Criar estudo';
          avisarNaProxima(r.gravado
            ? `Estudo "${e.estudo.nome}" criado com uma carreira modelo (valores de exemplo). Edite a estrutura e a tabela antes de calcular.`
            : `Estudo criado só na memória desta aba: ${r.mensagem} Veja a barra acima.`, r.gravado ? 'ok' : 'aviso');
          fechar();
          ctx.irPara('carreiras');
          return undefined;
        },
      },
    ],
  });
  nome.entrada.focus();
}

// ----------------------------------------------------------------------------- importar JSON

function dialogoImportar(ctx) {
  const arquivo = criar('input', { type: 'file', id: 'arquivo-json', accept: '.json,application/json' });
  const rotuloArq = criar('label', { for: 'arquivo-json' }, 'Arquivo JSON do estudo');
  const status = criar('div', { class: 'dialogo-msg', role: 'status' });
  const nome = campo({ rotulo: 'Nome do novo estudo', ajuda: 'A importação sempre cria um estudo novo; nenhum estudo existente é alterado.', maxlength: 80 });
  nome.no.hidden = true;
  let texto = null;
  let botaoImportar = null;
  const corpo = criar('div', { class: 'grade-dialogo' }, criar('div', { class: 'campo' }, rotuloArq, arquivo), status, nome.no);

  arquivo.addEventListener('change', async () => {
    texto = null;
    esvaziar(status);
    nome.no.hidden = true;
    if (botaoImportar) botaoImportar.disabled = true;
    const f = arquivo.files?.[0];
    if (!f) return;
    if (f.size > LIMITES.bytesArquivo) {
      status.append(faixa('erro', criar('strong', {}, 'Arquivo recusado: passa de 10 MB.'), ' Nenhum estudo existente foi alterado.'));
      return;
    }
    status.append(criar('p', {}, 'Validando…'));
    const lido = await f.text();
    const r = lerEstudo(lido);
    esvaziar(status);
    if (!r.ok) {
      status.append(faixa('erro', criar('strong', {}, 'Arquivo recusado.'), listaDeErros(r.erros), criar('p', { class: 'small' }, 'Nenhum estudo existente foi alterado.')));
      return;
    }
    texto = lido;
    const linhas = r.estudo.carreiras.reduce((s, c) => s + c.base.linhas.length, 0);
    status.append(faixa('ok', criar('strong', {}, 'Arquivo válido.'),
      ` ${r.estudo.carreiras.length} carreira(s), ${linhas} linha(s) de base, `, r.estudo.tipo_dados === 'ficticio' ? 'Dados fictícios' : 'Real anonimizado', '.',
      r.avisos.length ? criar('p', { class: 'small' }, `${r.avisos.length} aviso(s): ${r.avisos[0].mensagem}`) : null));
    nome.entrada.value = r.estudo.estudo.nome;
    nome.no.hidden = false;
    if (botaoImportar) botaoImportar.disabled = false;
  });

  const d = abrirDialogo({
    titulo: 'Importar estudo (JSON)', corpo,
    acoes: [
      { texto: 'Cancelar', variante: 'fant' },
      {
        texto: 'Importar como estudo novo', variante: 'prim', manter: true, desabilitado: true,
        aoClicar: async (fechar, b) => {
          if (!texto) return false;
          nome.definirErro(null);
          const novoNome = nome.entrada.value.trim();
          if (!(await podeTrocarDeEstudo())) return false;
          if (estado.lista === null) await carregarLista();
          b.disabled = true;
          const r = await importarJson(texto, { nome: novoNome });
          b.disabled = false;
          if (!r.ok && r.tipo === 'nome_existe') {
            nome.definirErro('Já existe um estudo com este nome. Escolha outro nome (sugestão abaixo).');
            nome.entrada.value = r.nomeSugerido;
            nome.entrada.focus();
            return false;
          }
          if (!r.ok) {
            esvaziar(status);
            status.append(faixa('erro', criar('strong', {}, 'Arquivo recusado.'), listaDeErros(r.erros ?? [{ mensagem: 'Erro desconhecido.' }])));
            return false;
          }
          avisarNaProxima(r.gravado
            ? 'Importado como novo estudo; o original não foi alterado.'
            : `Estudo importado só na memória desta aba: ${r.mensagem}`, r.gravado ? 'ok' : 'aviso');
          fechar();
          ctx.irPara('carreiras');
          return undefined;
        },
      },
    ],
  });
  botaoImportar = d.rodape.querySelectorAll('button')[1];
}

// ----------------------------------------------------------------------------- cartão do estudo

function cartaoEstudo(e, { recarregar, ctx, aviso, sucesso }) {
  const aberto = estado.id === e.id;
  const resumo = e.resumo ?? {};
  const semCopia = !e.ultima_exportacao_json;
  const alteradoDepois = !semCopia && e.atualizado_em && e.atualizado_em > e.ultima_exportacao_json;
  const botoes = criar('div', { class: 'acoes acoes-cartao' });
  const li = criar('li', { class: 'cartao cartao-estudo', 'data-estudo': e.id, 'data-nome': e.nome });
  const titulo = criar('h2', { class: 'cartao-titulo' }, e.nome, ' ', seloTipo(e.tipo_dados));

  const desenharBotoes = () => {
    esvaziar(botoes);
    const bAbrir = botao(aberto ? 'Continuar' : 'Abrir', {
      variante: 'prim',
      atributos: { 'aria-label': `${aberto ? 'Continuar' : 'Abrir'} o estudo ${e.nome}` },
      aoClicar: async (_, b) => {
        if (!aberto && !(await podeTrocarDeEstudo())) return;
        b.disabled = true;
        const r = aberto ? { ok: true } : await abrir(e.id);
        b.disabled = false;
        if (!r.ok) { aviso(r.mensagem); return; }
        ctx.irPara('carreiras');
      },
    });
    const bDup = botao('Duplicar', {
      atributos: { 'aria-label': `Duplicar o estudo ${e.nome}` },
      aoClicar: async (_, b) => {
        b.disabled = true;
        const r = await duplicarEstudo(e.id);
        b.disabled = false;
        if (!r.ok) { aviso(r.mensagem); return; }
        await recarregar();
        sucesso(`Estudo duplicado como "${r.nome}".`);
      },
    });
    const bExp = botao('Exportar JSON', {
      atributos: { 'aria-label': `Exportar o estudo ${e.nome} em JSON`, 'data-exportar': 'json' },
      aoClicar: async (_, b) => {
        b.disabled = true;
        const r = await executarExportacao('json', { id: e.id, origem: 'lista' });
        b.disabled = false;
        if (!r.ok) { aviso(r.mensagem); return; }
        await recarregar();
        sucesso(r.mensagem);
        for (const a of r.avisos ?? []) sucesso(a, 'aviso');
      },
    });
    const bExc = botao('Excluir', {
      variante: 'perigo', atributos: { 'aria-label': `Excluir o estudo ${e.nome}` },
      aoClicar: () => confirmarExclusao(),
    });
    anexar(botoes, bAbrir, bDup, bExp, criar('span', { class: 'espaco-perigo' }), bExc);
  };

  const confirmarExclusao = () => {
    esvaziar(botoes);
    const sim = botao('Excluir definitivamente', { variante: 'perigo', atributos: { 'aria-label': `Excluir definitivamente o estudo ${e.nome}` } });
    const nao = botao('Cancelar', { aoClicar: () => { desenharBotoes(); botoes.querySelector('button:last-of-type')?.focus(); } });
    botoes.append(criar('p', { class: 'confirmacao', role: 'group', 'aria-label': 'Confirmar exclusão' },
      criar('strong', {}, `Excluir "${e.nome}"?`), ' Não há lixeira: o estudo some do banco. Exporte uma cópia JSON antes se for precisar dele.'), sim, nao);
    sim.addEventListener('click', async () => {
      sim.disabled = true;
      const r = await excluirEstudoPorId(e.id);
      if (!r.ok) { sim.disabled = false; aviso(r.mensagem); return; }
      anunciar('Estudo excluído.');
      await recarregar();
      sucesso(`Estudo "${e.nome}" excluído.`);
    });
    nao.focus();
  };
  desenharBotoes();

  li.append(titulo,
    criar('p', { class: 'small muted' },
      `${resumo.carreiras ?? 0} carreira(s) · ${resumo.linhas_base ?? 0} linha(s) de base · ${resumo.servidores ?? 0} servidor(es)`,
      aberto ? [' ', selo('Aberto', 'info')] : null),
    criar('p', { class: 'small muted' }, `Última alteração: ${dataHora(e.atualizado_em)}`),
    criar('p', { class: 'small' },
      semCopia ? [selo('Sem cópia JSON', 'aviso'), ' Exporte uma cópia antes de levar números a uma reunião.']
        : alteradoDepois ? [selo('Alterado depois da última cópia', 'aviso'), ` Última cópia JSON: ${dataHora(e.ultima_exportacao_json)}.`]
          : `Última cópia JSON: ${dataHora(e.ultima_exportacao_json)}.`),
    botoes);
  return li;
}

// ----------------------------------------------------------------------------- tela

export async function telaEstudos(container, ctx) {
  mostrarAvisoPendente(container);
  container.append(acoes(
    botao('Novo estudo', { variante: 'prim', aoClicar: () => dialogoNovo(ctx), atributos: { id: 'btn-novo-estudo' } }),
    botao('Importar JSON', { aoClicar: () => dialogoImportar(ctx), atributos: { id: 'btn-importar-json' } }),
  ));
  const erroNo = criar('div', { class: 'area-erro' });
  const area = criar('div', { class: 'lista-estudos' });
  container.append(erroNo, area);
  const aviso = (mensagem) => { esvaziar(erroNo); erroNo.append(faixa('erro', mensagem)); };
  const sucesso = (texto, tipo = 'ok') => mostrarMensagem(erroNo, texto, tipo);

  const recarregar = async () => {
    esvaziar(area);
    esvaziar(erroNo);
    area.append(esqueletos(3));
    const r = await carregarLista();
    esvaziar(area);
    if (!r.ok) {
      area.append(vazio(r.tipo === 'sem_banco' ? 'Banco de dados indisponível' : 'Não foi possível carregar os estudos', r.mensagem,
        botao('Tentar de novo', { aoClicar: recarregar })));
      return;
    }
    if (!r.estudos.length) {
      area.append(vazio('Nenhum estudo ainda', 'Crie o primeiro estudo ou importe um arquivo JSON.'));
      return;
    }
    area.append(criar('ul', { class: 'lista-cartoes' }, r.estudos.map((e) => cartaoEstudo(e, { recarregar, ctx, aviso, sucesso }))));
  };
  await recarregar();
}
