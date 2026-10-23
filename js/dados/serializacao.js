// Funções puras da camada de dados (sem Firebase): ids, medida em bytes UTF-8, hash, partição da base em partes de até
// 700.000 bytes e conferência de integridade do conteúdo lido. Visão geral, seção 3.
export const LIMITE_PARTE_BYTES = 700000;
export const MAX_PARTES_POR_CARREIRA = 99;
export const MAX_CARREIRAS = 20;
export const ID_RE = /^[a-z0-9]{12}$/;

const codificador = new TextEncoder();
export const bytesUtf8 = (texto) => codificador.encode(texto).length;

export async function sha256Hex(texto) {
  const h = await globalThis.crypto.subtle.digest('SHA-256', codificador.encode(texto));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}

const ALFABETO = 'abcdefghijklmnopqrstuvwxyz0123456789';
/** Id de 12 caracteres [a-z0-9] com crypto.getRandomValues (sem viés: descarta bytes >= 252). */
export function novoId(cripto = globalThis.crypto) {
  let id = '';
  while (id.length < 12) {
    for (const b of cripto.getRandomValues(new Uint8Array(24))) {
      if (b < 252 && id.length < 12) id += ALFABETO[b % 36];
    }
  }
  return id;
}

export const nomeParte = (carreiraId, nn) => {
  if (!ID_RE.test(carreiraId)) throw new Error('carreiraId inválido');
  if (!Number.isInteger(nn) || nn < 1 || nn > MAX_PARTES_POR_CARREIRA) throw new Error('número de parte inválido');
  return `base-${carreiraId}-${String(nn).padStart(2, '0')}`;
};

export class ErroTamanho extends Error {
  constructor(mensagem) { super(mensagem); this.name = 'ErroTamanho'; }
}

/**
 * Corta as linhas da base de uma carreira em partes de até `limite` bytes UTF-8, em fronteira de linha. Devolve os
 * textos JSON: {"carreira_id","parte","de","colunas","linhas":[[...],...]}. Sem linhas: uma parte vazia.
 */
export function dividirBase({ carreiraId, colunas, linhas, limite = LIMITE_PARTE_BYTES }) {
  if (!ID_RE.test(carreiraId)) throw new Error('carreiraId inválido');
  const moldura = (parte, de, itens) => JSON.stringify({ carreira_id: carreiraId, parte, de, colunas, linhas: itens });
  // Reserva o pior caso de dígitos em "parte" e "de" (99 e 99): a moldura final nunca passa da reservada.
  const reserva = bytesUtf8(moldura(MAX_PARTES_POR_CARREIRA, MAX_PARTES_POR_CARREIRA, []));
  if (reserva >= limite) throw new ErroTamanho('Lista de colunas grande demais para uma parte.');
  const grupos = [[]];
  let usado = reserva;
  for (const linha of linhas) {
    const bytes = bytesUtf8(JSON.stringify(linha)) + 1; // vírgula
    if (reserva + bytes > limite) throw new ErroTamanho('Uma linha da base é maior que o limite de uma parte.');
    if (usado + bytes > limite) { grupos.push([]); usado = reserva; }
    grupos[grupos.length - 1].push(linha);
    usado += bytes;
  }
  if (grupos.length > MAX_PARTES_POR_CARREIRA) throw new ErroTamanho(`A base precisaria de mais de ${MAX_PARTES_POR_CARREIRA} partes.`);
  const textos = grupos.map((g, i) => moldura(i + 1, grupos.length, g));
  for (const t of textos) if (bytesUtf8(t) > limite) throw new ErroTamanho('Parte acima do limite (erro interno).');
  return textos;
}

/** Documento de conteúdo: {conteudo, revisao, bytes, sha256}. */
export async function montarConteudo(revisao, texto) {
  const bytes = bytesUtf8(texto);
  if (bytes < 1 || bytes > LIMITE_PARTE_BYTES) throw new ErroTamanho(`Conteúdo com ${bytes} bytes; o limite é ${LIMITE_PARTE_BYTES}.`);
  return { conteudo: texto, revisao, bytes, sha256: await sha256Hex(texto) };
}

export class ErroIntegridade extends Error {
  constructor(mensagem, detalhe = null) { super(mensagem); this.name = 'ErroIntegridade'; this.detalhe = detalhe; }
}

/**
 * Confere os limites do mapa `resumo.partes` do cabeçalho ANTES de qualquer leitura (R1): no máximo MAX_CARREIRAS entradas,
 * chaves no formato de id, valores inteiros de 1 a MAX_PARTES_POR_CARREIRA e não mais entradas que `resumo.carreiras`.
 * Devolve a lista [[carreiraId, n], ...]; fora dos limites lança ErroIntegridade (mensagem em português simples).
 */
export function conferirPartesDoCabecalho(resumo) {
  const partes = resumo?.partes ?? {};
  const invalido = (m) => new ErroIntegridade(`o cabeçalho do estudo está fora dos limites (${m}).`);
  if (partes === null || typeof partes !== 'object' || Array.isArray(partes)) throw invalido('lista de partes ilegível');
  const itens = Object.entries(partes);
  if (itens.length > MAX_CARREIRAS) throw invalido(`mais de ${MAX_CARREIRAS} carreiras com base`);
  if (Number.isInteger(resumo?.carreiras) && itens.length > resumo.carreiras) throw invalido('mais carreiras com base que carreiras no estudo');
  for (const [carreiraId, n] of itens) {
    if (!ID_RE.test(carreiraId)) throw invalido('identificador de carreira inválido');
    if (!Number.isInteger(n) || n < 1 || n > MAX_PARTES_POR_CARREIRA) {
      throw invalido(`número de partes da base deve ficar entre 1 e ${MAX_PARTES_POR_CARREIRA}`);
    }
  }
  return itens;
}

/** Confere revisão, bytes e sha256 de um documento de conteúdo lido (detecta parte trocada ou truncada). */
export async function conferirConteudo(dados, revisaoEsperada, rotulo, sha256Esperado = null) {
  if (!dados || typeof dados.conteudo !== 'string') throw new ErroIntegridade(`${rotulo}: conteúdo ausente ou inválido.`);
  if (dados.revisao !== revisaoEsperada) throw new ErroIntegridade(`${rotulo}: revisão ${dados.revisao} diferente da do cabeçalho (${revisaoEsperada}).`);
  if (bytesUtf8(dados.conteudo) !== dados.bytes) throw new ErroIntegridade(`${rotulo}: tamanho diferente do registrado.`);
  if ((await sha256Hex(dados.conteudo)) !== dados.sha256) throw new ErroIntegridade(`${rotulo}: impressão digital (sha256) diferente da registrada.`);
  if (sha256Esperado !== null && dados.sha256 !== sha256Esperado) throw new ErroIntegridade(`${rotulo}: impressão digital (sha256) diferente da registrada na definição do estudo.`);
  return dados.conteudo;
}

const SHA_RE = /^[0-9a-f]{64}$/;

/**
 * Lê da definição (texto já conferido contra o cabeçalho) o registro das partes de cada carreira: { carreiraId: [{sha256,
 * revisao}] }. `partesDoCabecalho`: [[carreiraId, n], ...] já validado. A definição pode ter sido gravada por qualquer
 * um (sem login): o formato é conferido aqui. Sem registro (estudo gravado no formato anterior) ou incoerente com o
 * cabeçalho: ErroIntegridade com mensagem clara.
 */
export function lerRegistroDasPartes(definicao, partesDoCabecalho, revisaoCabecalho) {
  const anterior = () => new ErroIntegridade('o estudo foi gravado no formato anterior, sem o registro das partes da base na definição, e não pode ser conferido. Importe a última cópia JSON do estudo.');
  let doc;
  try { doc = JSON.parse(definicao); } catch { throw new ErroIntegridade('a definição do estudo não é um JSON válido.'); }
  const carreiras = Array.isArray(doc?.carreiras) ? doc.carreiras : [];
  const registro = {};
  for (const [carreiraId, n] of partesDoCabecalho) {
    const c = carreiras.find((x) => x !== null && typeof x === 'object' && x.id === carreiraId);
    const reg = c?.base?.registro;
    if (!Array.isArray(reg)) throw anterior();
    if (reg.length !== n) throw new ErroIntegridade(`a definição registra ${reg.length} parte(s) para uma carreira, mas o cabeçalho tem ${n}.`);
    for (const r of reg) {
      const ok = r !== null && typeof r === 'object' && typeof r.sha256 === 'string' && SHA_RE.test(r.sha256)
        && Number.isInteger(r.revisao) && r.revisao >= 1 && r.revisao <= revisaoCabecalho;
      if (!ok) throw new ErroIntegridade('o registro das partes na definição do estudo está fora do formato.');
    }
    registro[carreiraId] = reg.map((r) => ({ sha256: r.sha256, revisao: r.revisao }));
  }
  return registro;
}
