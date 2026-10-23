// Única camada que importa o Firebase. Contrato: docs/arquitetura/visao-geral.md, seção 3 (esquema F1) e 3.4 (operações).
// Guarda e lê TEXTO JSON v1; não conhece regras de cálculo. Todo texto lido deve passar pelo validador do motor
// (lerEstudo) antes de chegar à tela. Toda gravação é um writeBatch (atômico) e leva a revisão +1 (concorrência
// otimista, conferida pelas regras). Sem onSnapshot. Nada fica no armazenamento do navegador: cache só em memória.
import { initializeApp } from '../../vendor/firebase/13.0.0/firebase-app.js';
import {
  collection, connectFirestoreEmulator, doc, getDoc, getDocs, initializeFirestore, limit, memoryLocalCache, orderBy, query,
  serverTimestamp, startAfter, terminate, updateDoc, writeBatch,
} from '../../vendor/firebase/13.0.0/firebase-firestore.js';
import config, { PRODUCAO_CONFIGURADA } from './config.js';
import { escolherAmbiente } from './ambiente.js';
import {
  ErroIntegridade, ErroTamanho, ID_RE, MAX_CARREIRAS, MAX_PARTES_POR_CARREIRA, conferirConteudo, conferirPartesDoCabecalho, dividirBase, lerRegistroDasPartes, montarConteudo, nomeParte, novoId,
} from './serializacao.js';

export { classificarErro } from './erros.js';
export { novoId } from './serializacao.js';

export const PROJETO_EMULADOR = 'demo-simulador-carreiras';
export const TAMANHO_PAGINA = 50;
const MAX_ESCRITAS_POR_LOTE = 500;

let db = null;
let modoEmulador = false;

export class ErroAmbienteLocal extends Error {
  constructor() { super('ambiente local sem emulador'); this.name = 'ErroAmbienteLocal'; }
}
export class ErroSemConfiguracao extends Error {
  constructor() { super('projeto Firebase ainda não configurado (G3)'); this.name = 'ErroSemConfiguracao'; }
}

// Configuração do emulador: não leva chave nem identificadores do projeto de produção.
const CONFIG_EMULADOR = { apiKey: 'demo-sem-chave', projectId: PROJETO_EMULADOR, appId: '1:0:web:demo' };

/**
 * Conecta ao emulador só na máquina local e com o parâmetro explícito ?emulador=host:porta. Na máquina local sem o
 * parâmetro, não conecta a nada (ErroAmbienteLocal). Fora dela, usa a configuração do projeto, se já configurada (G3).
 */
export function iniciar(localizacao = window.location) {
  if (db) return { emulador: modoEmulador, projeto: modoEmulador ? PROJETO_EMULADOR : config.projectId };
  const ambiente = escolherAmbiente(localizacao);
  if (ambiente.tipo === 'bloqueado') throw new ErroAmbienteLocal();
  const emu = ambiente.tipo === 'emulador' ? ambiente : null;
  if (!emu && !PRODUCAO_CONFIGURADA) throw new ErroSemConfiguracao();
  const configuracao = emu ? CONFIG_EMULADOR : config;
  db = initializeFirestore(initializeApp(configuracao), { localCache: memoryLocalCache() });
  if (emu) {
    connectFirestoreEmulator(db, emu.host, emu.porta);
    modoEmulador = true;
  }
  return { emulador: modoEmulador, projeto: configuracao.projectId };
}

/** Encerra a conexão (usado nos testes; o app não precisa chamar). */
export async function encerrar() {
  if (!db) return;
  const atual = db;
  db = null;
  modoEmulador = false;
  await terminate(atual);
}

function banco() {
  if (!db) iniciar();
  return db;
}

const refCab = (id) => doc(banco(), 'estudos', id);
const refCont = (id, nome) => doc(banco(), 'estudos', id, 'conteudo', nome);

function lerCabecalho(snap) {
  const d = snap.data({ serverTimestamps: 'estimate' });
  const data = (t) => (t && typeof t.toDate === 'function' ? t.toDate() : null);
  return { ...d, id: snap.id, criado_em: data(d.criado_em), atualizado_em: data(d.atualizado_em), ultima_exportacao_json: data(d.ultima_exportacao_json) };
}

function exigirId(id) {
  if (!ID_RE.test(id)) throw new Error('id de estudo inválido');
}

// ----- Leitura -----

/** Lista os estudos, do mais recente ao mais antigo, em páginas de até 50 (RG-02). `depois` = cursor da página anterior. */
export async function listarEstudos({ depois = null } = {}) {
  const base = [collection(banco(), 'estudos'), orderBy('atualizado_em', 'desc')];
  if (depois) base.push(startAfter(depois));
  const snap = await getDocs(query(...base, limit(TAMANHO_PAGINA)));
  const estudos = snap.docs.map(lerCabecalho);
  return { estudos, proximo: snap.docs.length === TAMANHO_PAGINA ? snap.docs[snap.docs.length - 1] : null };
}

/**
 * Abre um estudo: lê o cabeçalho, a definição e as partes de todas as carreiras (de 3 a 5 leituras). A definição é conferida
 * contra a revisão do cabeçalho; cada parte, contra o registro (sha256 e revisão) que a definição traz. Confere também bytes. Devolve os TEXTOS; quem chama os passa por lerEstudo. Falha de conferência: ErroIntegridade.
 */
export async function abrirEstudo(id) {
  exigirId(id);
  const cabSnap = await getDoc(refCab(id));
  if (!cabSnap.exists()) throw Object.assign(new Error('estudo inexistente'), { code: 'not-found' });
  const cabecalho = lerCabecalho(cabSnap);
  const revisao = cabecalho.revisao;
  const partesCab = conferirPartesDoCabecalho(cabecalho.resumo); // recusa antes de ler qualquer parte (R1)
  const defSnap = await getDoc(refCont(id, 'definicao'));
  if (!defSnap.exists()) throw new ErroIntegridade('definição: documento ausente.');
  const definicao = await conferirConteudo(defSnap.data(), revisao, 'definição');
  // Cada parte é conferida pelo registro da definição (sha256 e revisão em que foi gravada), não pela revisão do
  // cabeçalho: salvar parâmetros não regrava as partes (visão geral, seção 3.3 e 3.4).
  const registro = partesCab.length > 0 ? lerRegistroDasPartes(definicao, partesCab, revisao) : {};
  const pedidos = [];
  for (const [carreiraId, n] of partesCab) {
    for (let nn = 1; nn <= n; nn++) pedidos.push({ rotulo: `parte ${nn} da carreira ${carreiraId}`, nome: nomeParte(carreiraId, nn), carreiraId, ref: registro[carreiraId][nn - 1] });
  }
  const lidos = await Promise.all(pedidos.map(async (p) => {
    const s = await getDoc(refCont(id, p.nome));
    if (!s.exists()) throw new ErroIntegridade(`${p.rotulo}: documento ausente.`);
    return { ...p, texto: await conferirConteudo(s.data(), p.ref.revisao, p.rotulo, p.ref.sha256) };
  }));
  const partes = {};
  for (const l of lidos) (partes[l.carreiraId] ??= []).push(l.texto);
  return { cabecalho, definicao, partes, registro };
}

// ----- Gravação -----

const RESUMO_VAZIO = { carreiras: 0, linhas_base: 0, servidores: 0 };

/**
 * Núcleo das gravações: um writeBatch com cabeçalho + definição + partes novas + exclusão das partes que sobraram.
 *  - revisaoAtual: 0 para criar; senão a revisão que a tela leu (a gravação grava revisaoAtual + 1).
 *  - contagens: {carreiras, linhas_base, servidores} do estudo depois da gravação.
 *  - partesAntigas: resumo.partes lido do cabeçalho (carreiraId -> nº de partes), para saber o que excluir.
 *  - bases: { carreiraId: {colunas, linhas} } só das carreiras cuja base é (re)gravada.
 *  - removerCarreiras: ids de carreiras que saíram do estudo (suas partes são excluídas).
 */
async function gravarEstudo({ id, revisaoAtual, nome, tipoDados, definicaoTexto, contagens = RESUMO_VAZIO, partesAntigas = {}, bases = {}, removerCarreiras = [] }) {
  exigirId(id);
  const nova = revisaoAtual + 1;
  const criando = revisaoAtual === 0;
  const partes = { ...partesAntigas };
  for (const c of removerCarreiras) delete partes[c];
  const novos = [];
  const exclusoes = [];
  for (const c of removerCarreiras) {
    for (let nn = 1; nn <= (partesAntigas[c] ?? 0); nn++) exclusoes.push(nomeParte(c, nn));
  }
  for (const [carreiraId, base] of Object.entries(bases)) {
    const textos = dividirBase({ carreiraId, colunas: base.colunas, linhas: base.linhas });
    partes[carreiraId] = textos.length;
    textos.forEach((t, i) => novos.push({ nome: nomeParte(carreiraId, i + 1), texto: t }));
    for (let nn = textos.length + 1; nn <= (partesAntigas[carreiraId] ?? 0); nn++) exclusoes.push(nomeParte(carreiraId, nn));
  }
  if (Object.keys(partes).length > MAX_CARREIRAS) throw new ErroTamanho(`O estudo aceita até ${MAX_CARREIRAS} carreiras com base.`);
  if (2 + novos.length + exclusoes.length > MAX_ESCRITAS_POR_LOTE) throw new ErroTamanho('Gravação grande demais para um lote.');

  const resumo = { carreiras: contagens.carreiras, linhas_base: contagens.linhas_base, servidores: contagens.servidores, partes };
  const lote = writeBatch(banco());
  if (criando) {
    lote.set(refCab(id), {
      nome, tipo_dados: tipoDados, versao_formato: 1, revisao: nova, criado_em: serverTimestamp(), atualizado_em: serverTimestamp(),
      resumo, ultima_exportacao_json: null,
    });
  } else {
    lote.update(refCab(id), { nome, tipo_dados: tipoDados, revisao: nova, atualizado_em: serverTimestamp(), resumo });
  }
  lote.set(refCont(id, 'definicao'), await montarConteudo(nova, definicaoTexto));
  for (const p of novos) lote.set(refCont(id, p.nome), await montarConteudo(nova, p.texto));
  for (const nomeDoc of exclusoes) lote.delete(refCont(id, nomeDoc));
  await lote.commit();
  return { id, revisao: nova, resumo };
}

/** Criar estudo: cabeçalho + definição (2 gravações), e as partes se já houver base. Devolve {id, revisao: 1, resumo}. */
export function criarEstudo({ nome, tipoDados, definicaoTexto, contagens, bases = {}, id = novoId() }) {
  return gravarEstudo({ id, revisaoAtual: 0, nome, tipoDados, definicaoTexto, contagens, bases });
}

/** Salvar edição de parâmetros: cabeçalho + definição (2 gravações). A tela chama depois de 2 s sem digitação. `bases` (opcional): bases a regravar no mesmo lote. */
export function salvarEdicao({ id, revisao, nome, tipoDados, definicaoTexto, contagens, partesAntigas, removerCarreiras, bases }) {
  return gravarEstudo({ id, revisaoAtual: revisao, nome, tipoDados, definicaoTexto, contagens, partesAntigas, removerCarreiras, bases });
}

/** Importar a base de uma ou mais carreiras: cabeçalho + definição + partes novas + exclusão das partes antigas a mais. */
export function importarBase({ id, revisao, nome, tipoDados, definicaoTexto, contagens, partesAntigas, bases }) {
  return gravarEstudo({ id, revisaoAtual: revisao, nome, tipoDados, definicaoTexto, contagens, partesAntigas, bases });
}

/**
 * Excluir estudo: cabeçalho + definição + partes. Sem lixeira (decisão do G2). Tolerante (R1): não depende de o cabeçalho
 * estar coerente. Ignora entradas de `resumo.partes` fora do formato e limita cada valor a 1..99. O primeiro lote leva o
 * cabeçalho e a definição (até 500 operações); o que sobrar de partes vai em lotes seguintes (sem cabeçalho, a regra RG-31
 * aceita a limpeza de partes órfãs).
 */
export async function excluirEstudo(id) {
  exigirId(id);
  const snap = await getDoc(refCab(id));
  const partesDoc = [];
  if (snap.exists()) {
    const partes = snap.data().resumo?.partes;
    const itens = partes && typeof partes === 'object' && !Array.isArray(partes) ? Object.entries(partes).slice(0, MAX_CARREIRAS) : [];
    for (const [carreiraId, n] of itens) {
      if (!ID_RE.test(carreiraId) || !Number.isInteger(n) || n < 1) continue;
      for (let nn = 1; nn <= Math.min(n, MAX_PARTES_POR_CARREIRA); nn++) partesDoc.push(nomeParte(carreiraId, nn));
    }
  }
  const primeiro = partesDoc.slice(0, MAX_ESCRITAS_POR_LOTE - 2);
  const lote = writeBatch(banco());
  for (const nome of primeiro) lote.delete(refCont(id, nome));
  lote.delete(refCont(id, 'definicao'));
  lote.delete(refCab(id));
  await lote.commit();
  for (let i = primeiro.length; i < partesDoc.length; i += MAX_ESCRITAS_POR_LOTE) {
    const resto = writeBatch(banco());
    for (const nome of partesDoc.slice(i, i + MAX_ESCRITAS_POR_LOTE)) resto.delete(refCont(id, nome));
    await resto.commit();
  }
}

/** Marca a exportação do JSON (RG-14): só `ultima_exportacao_json`, com carimbo do servidor; a revisão não muda. */
export async function marcarExportacao(id) {
  exigirId(id);
  await updateDoc(refCab(id), { ultima_exportacao_json: serverTimestamp() });
}
