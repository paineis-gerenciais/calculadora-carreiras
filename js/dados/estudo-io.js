// Ponte entre o estudo inteiro (JSON v1, na memória) e os textos guardados no Firestore (visão geral, seções 3 e 4).
// Funções puras e assíncronas só para o hash: sem Firebase, sem DOM. Testáveis em Node.
//  - separarEstudo: estudo -> texto da definição (a base de cada carreira vira um resumo) + bases a gravar + contagens.
//  - remontarEstudo: textos lidos do banco -> estudo validado por lerEstudo (entrada hostil: qualquer um pode gravar no banco).
//  - impressaoDigital (O3): SHA-256 curto do JSON canônico do estudo, para o usuário notar adulteração válida.
import { COLUNAS_BASE_JSON, LIMITES } from '../motor/constantes.js';
import { lerEstudo, profundidadeJson, serializarEstudo } from '../motor/formato.js';
import { dividirBase, sha256Hex } from './serializacao.js';

const falha = (mensagem, caminho = '') => ({ ok: false, erros: [{ codigo: 'DADOS_INCOERENTES', mensagem, caminho }] });

/** Quantidade de servidores de uma linha (coluna quantidade; vazio = 1). */
function quantidadeDe(colunas, linha) {
  const i = colunas.indexOf('quantidade');
  if (i < 0) return 1;
  const q = linha[i];
  return typeof q === 'number' && Number.isSafeInteger(q) && q > 0 ? q : 1;
}

export function contarBase(base) {
  const linhas = Array.isArray(base?.linhas) ? base.linhas : [];
  let servidores = 0;
  for (const l of linhas) servidores += quantidadeDe(base.colunas ?? [], l);
  return { linhas: linhas.length, servidores };
}

/** Data fixa do `exportado_em` do texto gravado: a hora da gravação não faz parte do conteúdo (mesma regra da impressão digital). */
const DATA_FIXA = '2000-01-01T00:00:00Z';

/**
 * Registro das partes de uma base: para cada parte, o sha256 do texto e a revisão em que ela foi gravada. A definição
 * guarda esse registro; a abertura confere cada parte por ele (visão geral, seção 3.3).
 */
export async function registrarPartes(carreiraId, base, revisao) {
  const textos = dividirBase({ carreiraId, colunas: base.colunas, linhas: base.linhas });
  return Promise.all(textos.map(async (t) => ({ sha256: await sha256Hex(t), revisao })));
}

/**
 * Separa o estudo para gravar. `idsBaseAlterada`: carreiras cuja base precisa ser (re)gravada; as demais mantêm as
 * partes que já estão no banco, com o registro lido ao abrir (`registroAntigo`: carreiraId -> [{sha256, revisao}]).
 * `revisaoNova`: revisão que a gravação vai ter (revisão atual + 1; 1 ao criar).
 * Devolve { definicaoTexto, bases, contagens, registro }. A definição segue o serializador canônico (o mesmo da
 * impressão digital), com a base de cada carreira trocada por { partes, linhas, servidores, registro }.
 */
export async function separarEstudo(estudo, { partesAntigas = {}, idsBaseAlterada = new Set(), registroAntigo = {}, revisaoNova = 1 } = {}) {
  const bases = {};
  const registro = {};
  const resumos = [];
  let totalLinhas = 0;
  let totalServidores = 0;
  for (const c of estudo.carreiras) {
    const n = contarBase(c.base);
    totalLinhas += n.linhas;
    totalServidores += n.servidores;
    let partes = 0;
    let reg = [];
    if (idsBaseAlterada.has(c.id) && n.linhas > 0) {
      bases[c.id] = { colunas: c.base.colunas, linhas: c.base.linhas };
      reg = await registrarPartes(c.id, c.base, revisaoNova);
      partes = reg.length;
    } else if (!idsBaseAlterada.has(c.id)) {
      partes = partesAntigas[c.id] ?? 0;
      reg = registroAntigo[c.id] ?? [];
    }
    if (partes > 0) registro[c.id] = reg;
    resumos.push({ partes, linhas: n.linhas, servidores: n.servidores, ...(partes > 0 ? { registro: reg } : {}) });
  }
  const semBase = { ...estudo, carreiras: estudo.carreiras.map((c) => ({ ...c, base: { colunas: [], linhas: [] } })) };
  const doc = JSON.parse(serializarEstudo(semBase, { exportadoEm: DATA_FIXA, compacto: true }));
  doc.carreiras.forEach((c, i) => { c.base = resumos[i]; });
  return {
    definicaoTexto: JSON.stringify(doc),
    bases,
    registro,
    contagens: { carreiras: estudo.carreiras.length, linhas_base: totalLinhas, servidores: totalServidores },
  };
}

/**
 * Remonta o estudo com a definição e as partes lidas (textos já conferidos por sha256 e revisão). Retorna o mesmo que
 * lerEstudo: { ok: true, estudo, avisos } | { ok: false, erros }.
 */
export function remontarEstudo({ definicao, partes = {} }) {
  if (typeof definicao !== 'string') return falha('A definição do estudo não é texto.');
  if (profundidadeJson(definicao) > LIMITES.profundidadeJson) return lerEstudo(definicao);
  let doc;
  try { doc = JSON.parse(definicao); } catch { return lerEstudo(definicao); }
  if (doc === null || typeof doc !== 'object' || !Array.isArray(doc.carreiras)) return lerEstudo(definicao);
  const usadas = new Set();
  for (let a = 0; a < doc.carreiras.length; a++) {
    const c = doc.carreiras[a];
    if (c === null || typeof c !== 'object' || typeof c.id !== 'string') return lerEstudo(definicao);
    const resumo = c.base;
    const textos = Object.hasOwn(partes, c.id) ? partes[c.id] : [];
    usadas.add(c.id);
    let colunas = COLUNAS_BASE_JSON.slice();
    let linhas = [];
    if (textos.length > 0) {
      let colunasTexto = null;
      for (let i = 0; i < textos.length; i++) {
        let p;
        try { p = JSON.parse(textos[i]); } catch { return falha(`Parte ${i + 1} da base da carreira ${a + 1}: texto inválido.`); }
        if (p === null || typeof p !== 'object' || p.carreira_id !== c.id || p.parte !== i + 1 || p.de !== textos.length
          || !Array.isArray(p.colunas) || !Array.isArray(p.linhas)) {
          return falha(`Parte ${i + 1} da base da carreira ${a + 1}: não corresponde à carreira ou à ordem esperada.`);
        }
        const ct = JSON.stringify(p.colunas);
        if (colunasTexto !== null && colunasTexto !== ct) return falha(`Partes da base da carreira ${a + 1} com colunas diferentes.`);
        colunasTexto = ct;
        colunas = p.colunas;
        for (const l of p.linhas) linhas.push(l);
        if (linhas.length > LIMITES.linhasBase) return falha(`A base da carreira ${a + 1} passa de ${LIMITES.linhasBase} linhas.`);
      }
    }
    if (resumo !== null && typeof resumo === 'object' && Number.isSafeInteger(resumo.linhas) && resumo.linhas !== linhas.length) {
      return falha(`A base da carreira ${a + 1} tem ${linhas.length} linhas, mas a definição registra ${resumo.linhas}.`);
    }
    c.base = { colunas, linhas };
  }
  for (const id of Object.keys(partes)) if (!usadas.has(id)) return falha('O banco tem partes de base de uma carreira que não existe na definição.');
  return lerEstudo(JSON.stringify(doc));
}

/**
 * Impressão digital do estudo (O3): 12 primeiros caracteres hexadecimais do SHA-256 do JSON canônico compacto, com
 * `exportado_em` fixo (a hora da exportação não faz parte do conteúdo). Mesmo estudo, mesmo código; qualquer parâmetro
 * alterado muda o código. Devolve null se o estudo ainda estiver incompleto demais para serializar.
 */
export async function impressaoDigital(estudo) {
  try {
    const texto = serializarEstudo(estudo, { exportadoEm: DATA_FIXA, compacto: true });
    return (await sha256Hex(texto)).slice(0, 12);
  } catch {
    return null;
  }
}
