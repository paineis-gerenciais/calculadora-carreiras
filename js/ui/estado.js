// Estado do estudo aberto, em memória (nada em armazenamento local). Liga as telas ao Firestore (dados/firestore.js,
// carregado sob demanda) e ao motor. Telas assinam as mudanças e leem daqui; só `editar` altera o estudo.
//
// Salvamento: cada edição valida o estudo (validarEstudo) e, se válido, agenda a gravação 2 s depois da última
// alteração (visão geral, seção 3.4). Estudo inválido não é gravado: a barra diz quantos problemas faltam corrigir.
// Concorrência: a revisão lida vai junto; outra aba que gravou antes faz a gravação ser recusada ("estudo alterado em outra aba").
import { classificarErro } from '../dados/erros.js';
import { impressaoDigital, remontarEstudo, separarEstudo } from '../dados/estudo-io.js';
import { ID_RE, novoId } from '../dados/serializacao.js';
import { lerEstudo } from '../motor/formato.js';
import { validarEstudo } from '../motor/validacao.js';
import { calcularNoWorker } from './calculo.js';
import { COLUNAS_JSON } from './importacao.js';
import { nomeUnico } from './modelo.js';

export const ATRASO_SALVAR_MS = 2000;

let carregarBanco = () => import('../dados/firestore.js');
let moduloBanco = null;
/** Para os testes: substitui o módulo do banco por um dublê. */
export function definirBanco(fabrica) { carregarBanco = fabrica; moduloBanco = null; }
const banco = async () => (moduloBanco ??= await carregarBanco());

export const estado = {
  lista: null,
  id: null,
  estudo: null,
  revisao: 0,
  partesAntigas: {},
  registroPartes: {},
  cabecalho: null,
  idsBaseAlterada: new Set(),
  removidas: new Set(),
  edicao: 0,
  validacao: { ok: true, erros: [], avisos: [] },
  avisosAbertura: [],
  salvamento: { tipo: 'nenhum', hora: null, mensagem: '' },
  impressao: null,
  resultado: null,
  calculando: null,
};

const ouvintes = new Set();
export function assinar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }
function notificar(tipo) { for (const f of [...ouvintes]) f(tipo); }

export const estudoAberto = () => estado.estudo !== null;
export const tipoDeDados = () => estado.estudo?.tipo_dados ?? null;
export const nomeDoEstudo = () => estado.estudo?.estudo.nome ?? null;
export const temAlteracaoNaoSalva = () => ['pendente', 'invalido', 'erro', 'conflito', 'salvando'].includes(estado.salvamento.tipo);

function definirSalvamento(tipo, mensagem = '') {
  estado.salvamento = { tipo, hora: tipo === 'salvo' ? new Date() : estado.salvamento.hora, mensagem };
  notificar('salvamento');
}

// ----------------------------------------------------------------------------- impressão digital (O3)

let tempoImpressao = null;
function agendarImpressao() {
  clearTimeout(tempoImpressao);
  tempoImpressao = setTimeout(async () => {
    const edicao = estado.edicao;
    const codigo = estado.estudo ? await impressaoDigital(estado.estudo) : null;
    if (edicao === estado.edicao) { estado.impressao = codigo; notificar('impressao'); }
  }, 150);
}

// ----------------------------------------------------------------------------- abrir, criar, fechar

function zerar() {
  clearTimeout(temporizador);
  Object.assign(estado, {
    id: null, estudo: null, revisao: 0, partesAntigas: {}, registroPartes: {}, cabecalho: null, idsBaseAlterada: new Set(), removidas: new Set(),
    edicao: estado.edicao + 1, validacao: { ok: true, erros: [], avisos: [] }, avisosAbertura: [],
    salvamento: { tipo: 'nenhum', hora: null, mensagem: '' }, impressao: null, resultado: null,
  });
}

function instalar({ id, estudo, revisao, partesAntigas, registroPartes = {}, cabecalho = null, avisos = [], salvo = true }) {
  zerar();
  Object.assign(estado, { id, estudo, revisao, partesAntigas, registroPartes, cabecalho, avisosAbertura: avisos });
  estado.validacao = validarEstudo(estudo);
  if (salvo) estado.salvamento = { tipo: 'salvo', hora: new Date(), mensagem: '' };
  agendarImpressao();
  notificar('estudo');
}

export function fechar() {
  zerar();
  notificar('estudo');
}

/** Lista todos os estudos (páginas de 50). Devolve { ok: true, estudos } | { ok: false, mensagem, tipo }. */
export async function carregarLista() {
  try {
    const b = await banco();
    const todos = [];
    let depois = null;
    do {
      const pagina = await b.listarEstudos({ depois });
      todos.push(...pagina.estudos);
      depois = pagina.proximo;
    } while (depois && todos.length < 1000);
    estado.lista = todos;
    return { ok: true, estudos: todos };
  } catch (e) {
    return { ok: false, ...erroDe(e, 'listar') };
  }
}

function erroDe(e, operacao) {
  if (e?.name === 'ErroAmbienteLocal') {
    return { tipo: 'sem_banco', mensagem: 'Este endereço local não está ligado a nenhum banco de dados. Abra o aplicativo com o parâmetro ?emulador=127.0.0.1:8081 (veja o CLAUDE.md do projeto).' };
  }
  if (e?.name === 'ErroSemConfiguracao') {
    return { tipo: 'sem_banco', mensagem: 'O banco de dados ainda não foi configurado nesta versão. Importar um arquivo JSON e calcular continuam funcionando sem o banco.' };
  }
  return classificarErro(e, operacao);
}

/** Lê um estudo do banco sem abri-lo na tela. Devolve { ok: true, estudo, cabecalho, avisos } ou { ok: false, ... }. */
async function lerDoBanco(id) {
  try {
    const b = await banco();
    const { cabecalho, definicao, partes, registro } = await b.abrirEstudo(id);
    const r = remontarEstudo({ definicao, partes });
    if (!r.ok) return { ok: false, tipo: 'invalido', erros: r.erros, mensagem: `O estudo não pôde ser aberto: ${r.erros[0].mensagem} Importe a última cópia JSON do estudo.` };
    if (r.estudo.tipo_dados !== cabecalho.tipo_dados) {
      return { ok: false, tipo: 'invalido', erros: [], mensagem: 'O estudo não pôde ser aberto: o tipo de dados do cabeçalho difere do conteúdo. Importe a última cópia JSON do estudo.' };
    }
    return { ok: true, estudo: r.estudo, cabecalho, avisos: r.avisos, partesAntigas: cabecalho.resumo?.partes ?? {}, registroPartes: registro ?? {} };
  } catch (e) {
    return { ok: false, ...erroDe(e, 'abrir') };
  }
}

export async function abrir(id) {
  const r = await lerDoBanco(id);
  if (!r.ok) return r;
  instalar({ id, estudo: r.estudo, revisao: r.cabecalho.revisao, partesAntigas: r.partesAntigas, registroPartes: r.registroPartes, cabecalho: r.cabecalho, avisos: r.avisos });
  return { ok: true };
}

/** Cria um estudo e o abre. `estudo` é um JSON v1 válido. Sem banco, o estudo fica só na memória desta aba. */
export async function criarEAbrir(estudo, { avisos = [] } = {}) {
  const id = novoId();
  const todos = new Set(estudo.carreiras.map((c) => c.id));
  const sep = await separarEstudo(estudo, { idsBaseAlterada: todos, revisaoNova: 1 });
  try {
    const b = await banco();
    const r = await b.criarEstudo({ id, nome: estudo.estudo.nome, tipoDados: estudo.tipo_dados, definicaoTexto: sep.definicaoTexto, contagens: sep.contagens, bases: sep.bases });
    instalar({ id, estudo, revisao: r.revisao, partesAntigas: r.resumo.partes, registroPartes: sep.registro, avisos });
    estado.lista = null;
    return { ok: true, id, gravado: true };
  } catch (e) {
    const info = erroDe(e, 'criar');
    instalar({ id: null, estudo, revisao: 0, partesAntigas: {}, avisos, salvo: false });
    estado.idsBaseAlterada = todos;
    definirSalvamento('erro', info.mensagem);
    return { ok: true, id: null, gravado: false, mensagem: info.mensagem };
  }
}

/** Importa o texto de um JSON v1 como estudo novo, com o nome dado. Recusa tudo ou nada (CA-26). */
export async function importarJson(texto, { nome = null } = {}) {
  const r = lerEstudo(texto);
  if (!r.ok) return { ok: false, tipo: 'invalido', erros: r.erros };
  const estudo = r.estudo;
  const nomes = (estado.lista ?? []).map((e) => e.nome);
  const final = nome ?? estudo.estudo.nome;
  if (nomes.includes(final)) return { ok: false, tipo: 'nome_existe', nomeSugerido: nomeUnico(final, nomes), avisos: r.avisos };
  estudo.estudo.nome = final;
  estudo.exportado_em = new Date().toISOString();
  const aberto = await criarEAbrir(estudo, { avisos: r.avisos });
  return { ...aberto, avisos: r.avisos };
}

/** Duplica um estudo do banco: cópia com novo id e nome "X (cópia)". O original não muda. */
export async function duplicarEstudo(id) {
  const r = await lerDoBanco(id);
  if (!r.ok) return r;
  const nomes = (estado.lista ?? []).map((e) => e.nome);
  const nome = nomeUnico(`${r.estudo.estudo.nome} (cópia)`, nomes);
  const estudo = r.estudo;
  estudo.estudo.nome = nome;
  estudo.exportado_em = new Date().toISOString();
  const ids = new Set(estudo.carreiras.map((c) => c.id));
  const sep = await separarEstudo(estudo, { idsBaseAlterada: ids, revisaoNova: 1 });
  try {
    const b = await banco();
    const novo = novoId();
    await b.criarEstudo({ id: novo, nome, tipoDados: estudo.tipo_dados, definicaoTexto: sep.definicaoTexto, contagens: sep.contagens, bases: sep.bases });
    estado.lista = null;
    return { ok: true, id: novo, nome };
  } catch (e) {
    return { ok: false, ...erroDe(e, 'criar') };
  }
}

export async function excluirEstudoPorId(id) {
  try {
    const b = await banco();
    await b.excluirEstudo(id);
    if (estado.id === id) fechar();
    estado.lista = null;
    return { ok: true };
  } catch (e) {
    return { ok: false, ...erroDe(e, 'excluir') };
  }
}

// ----------------------------------------------------------------------------- edição e gravação

let temporizador = null;
let salvando = false;
let repetir = false;

/** Aplica `fn(estudo)` ao estudo aberto, revalida e agenda a gravação. Devolve o resultado da validação. */
export function editar(fn, { removerCarreira = null, baseAlterada = null } = {}) {
  if (!estado.estudo) throw new Error('nenhum estudo aberto');
  fn(estado.estudo);
  if (removerCarreira) {
    estado.idsBaseAlterada.delete(removerCarreira);
    if (ID_RE.test(removerCarreira) && estado.partesAntigas[removerCarreira]) estado.removidas.add(removerCarreira);
  }
  if (baseAlterada) estado.idsBaseAlterada.add(baseAlterada);
  estado.edicao++;
  estado.validacao = validarEstudo(estado.estudo);
  agendarImpressao();
  if (estado.validacao.ok) {
    if (estado.salvamento.tipo !== 'conflito') {
      definirSalvamento('pendente');
      clearTimeout(temporizador);
      temporizador = setTimeout(() => { salvarAgora(); }, ATRASO_SALVAR_MS);
    }
  } else {
    clearTimeout(temporizador);
    definirSalvamento('invalido', `${estado.validacao.erros.length} ${estado.validacao.erros.length === 1 ? 'problema' : 'problemas'}`);
  }
  notificar('estudo');
  return estado.validacao;
}

export let TEMPO_LIMITE_GRAVACAO_MS = 15000;
/** Para os testes: reduz o tempo de espera da gravação. */
export function definirTempoLimite(ms) { TEMPO_LIMITE_GRAVACAO_MS = ms; }

/**
 * Grava já. Devolve true se gravou. O SDK do Firestore guarda a gravação e espera a rede voltar em vez de falhar; por isso,
 * sem resposta em TEMPO_LIMITE_GRAVACAO_MS o estado vira "Sem conexão: não salvo" e a gravação segue pendente no SDK
 * (quando terminar, o estado volta a "salvo" e a revisão é atualizada).
 */
export async function salvarAgora() {
  clearTimeout(temporizador);
  if (!estado.estudo) return false;
  if (!estado.validacao.ok) { definirSalvamento('invalido', `${estado.validacao.erros.length} problemas`); return false; }
  if (estado.salvamento.tipo === 'conflito') return false;
  if (salvando) { repetir = true; return false; }
  salvando = true;
  definirSalvamento('salvando');
  const edicao = estado.edicao;
  let liberar = true;
  try {
    const b = await banco();
    const idsBase = new Set(estado.idsBaseAlterada);
    const removidas = [...estado.removidas];
    const criando = estado.id === null;
    const sep = await separarEstudo(estado.estudo, { partesAntigas: estado.partesAntigas, registroAntigo: estado.registroPartes, idsBaseAlterada: idsBase, revisaoNova: estado.revisao + 1 });
    const comum = {
      nome: estado.estudo.estudo.nome, tipoDados: estado.estudo.tipo_dados, definicaoTexto: sep.definicaoTexto, contagens: sep.contagens,
    };
    const novoIdEstudo = criando ? novoId() : null;
    const operacao = criando
      ? b.criarEstudo({ id: novoIdEstudo, ...comum, bases: sep.bases })
      : b.salvarEdicao({ id: estado.id, revisao: estado.revisao, ...comum, partesAntigas: estado.partesAntigas, removerCarreiras: removidas, bases: sep.bases });
    const concluir = (r) => {
      if (criando) estado.id = novoIdEstudo;
      estado.revisao = r.revisao;
      estado.partesAntigas = r.resumo.partes;
      estado.registroPartes = sep.registro;
      for (const i of idsBase) estado.idsBaseAlterada.delete(i);
      for (const i of removidas) estado.removidas.delete(i);
      estado.lista = null;
    };
    let tempo;
    const limite = new Promise((ok) => { tempo = setTimeout(() => ok(null), TEMPO_LIMITE_GRAVACAO_MS); });
    const r = await Promise.race([operacao, limite]);
    clearTimeout(tempo);
    if (r === null) {
      liberar = false;
      const info = classificarErro({ code: 'unavailable' }, 'salvar');
      definirSalvamento('erro', `${info.mensagem} As alterações serão gravadas quando a conexão voltar: não feche esta aba.`);
      operacao.then((res) => {
        concluir(res);
        definirSalvamento(estado.edicao === edicao ? 'salvo' : 'pendente');
      }, (e) => {
        const i2 = erroDe(e, 'salvar');
        definirSalvamento(i2.tipo === 'conflito' ? 'conflito' : 'erro', i2.mensagem);
      }).finally(() => { salvando = false; });
      return false;
    }
    concluir(r);
    if (estado.edicao === edicao && !repetir) definirSalvamento('salvo');
    else { repetir = false; definirSalvamento('pendente'); temporizador = setTimeout(() => { salvarAgora(); }, 300); }
    return true;
  } catch (e) {
    const info = erroDe(e, 'salvar');
    definirSalvamento(info.tipo === 'conflito' ? 'conflito' : 'erro', info.mensagem);
    return false;
  } finally {
    if (liberar) salvando = false;
  }
}

/**
 * Troca a base de uma carreira e grava na hora (importação). Devolve { ok: true } ou { ok: false, mensagem }.
 * `linhas`: linhas do JSON v1 (colunas de COLUNAS_JSON).
 */
export async function gravarBase(carreiraId, linhas) {
  const validacao = editar((e) => {
    const c = e.carreiras.find((x) => x.id === carreiraId);
    c.base = { colunas: COLUNAS_JSON.slice(), linhas };
  }, { baseAlterada: carreiraId });
  if (!validacao.ok) return { ok: false, mensagem: `A base não é compatível com a carreira: ${validacao.erros[0].mensagem}` };
  const gravou = await salvarAgora();
  if (!gravou && estado.salvamento.tipo !== 'salvo') return { ok: false, mensagem: estado.salvamento.mensagem || 'Não foi possível gravar a base.' };
  return { ok: true };
}

/** Lê um estudo salvo no banco sem abri-lo na tela (exportação a partir da lista). { ok: true, estudo } | { ok: false, mensagem }. */
export async function lerEstudoSalvo(id) {
  const r = await lerDoBanco(id);
  return r.ok ? { ok: true, estudo: r.estudo } : { ok: false, mensagem: r.mensagem };
}

/** Grava `ultima_exportacao_json` no cabeçalho (RG-14: só esse campo, revisão inalterada). Devolve true se gravou. */
export async function marcarExportado(id) {
  if (!id) return false;
  try {
    const b = await banco();
    await b.marcarExportacao(id);
    estado.lista = null;
    return true;
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------------- cálculo

/**
 * Resultado do motor para o estudo aberto, calculado no worker. Reaproveita o último se o estudo não mudou.
 * Rejeita com { erros } (lista do motor) ou { cancelado: true }.
 */
export async function calcular({ forcar = false } = {}) {
  const atual = resultadoAtual();
  if (atual && !atual.desatualizado && !forcar) return atual.dados;
  if (estado.calculando) return estado.calculando.promessa;
  const pre = validarEstudo(estado.estudo, { paraCalculo: true });
  if (!pre.ok) throw { erros: pre.erros };
  const edicao = estado.edicao;
  const { promessa, cancelar } = calcularNoWorker(estado.estudo, {}, (p) => {
    if (estado.calculando) { estado.calculando.progresso = p; notificar('calculo'); }
  });
  const final = promessa.then((dados) => {
    estado.resultado = { dados, edicao };
    return dados;
  }).finally(() => { estado.calculando = null; notificar('resultado'); });
  estado.calculando = { promessa: final, cancelar, progresso: null, edicao };
  notificar('calculo');
  return final;
}

export function cancelarCalculo() {
  estado.calculando?.cancelar();
}

/** { dados, desatualizado } ou null se nunca calculou neste estudo. */
export function resultadoAtual() {
  if (!estado.resultado) return null;
  return { dados: estado.resultado.dados, desatualizado: estado.resultado.edicao !== estado.edicao };
}
