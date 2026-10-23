// Formato JSON v1 do estudo: leitura defensiva e serialização determinística (visão geral, seção 4; parecer de
// segurança da G2, MS-1, item 6). O mesmo texto vale para o arquivo exportado e para o Firestore.
import {
  CHAVES_PROIBIDAS, FORMATO, LIMITES, VERSAO_FORMATO, VERSAO_ESPECIFICACAO,
} from "./constantes.js";
import { excedeBytes } from "./texto.js";
import { validarEstudo } from "./validacao.js";

/**
 * Migrações do formato: `MIGRACOES[n]` leva a versão n para n + 1 (função pura sobre o objeto lido).
 * Hoje só existe a versão 1, então o mapa está vazio. Ao criar a versão 2, escreva `migrarV1paraV2` aqui.
 */
export const MIGRACOES = new Map();

/** Maior profundidade de aninhamento de `[` e `{` fora de strings, por varredura linear (antes de `JSON.parse`). */
export function profundidadeJson(texto) {
  let prof = 0;
  let max = 0;
  let emTexto = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    if (emTexto) {
      if (c === 92) i++; // barra invertida: ignora o próximo caractere
      else if (c === 34) emTexto = false;
    } else if (c === 34) emTexto = true;
    else if (c === 91 || c === 123) {
      prof++;
      if (prof > max) max = prof;
    } else if (c === 93 || c === 125) prof--;
  }
  return max;
}

/** Procura chaves proibidas (`__proto__`, `constructor`, `prototype`) em qualquer nível, sem recursão. */
function chavesProibidas(raiz) {
  const achadas = [];
  const pilha = [[raiz, ""]];
  while (pilha.length) {
    const [v, caminho] = pilha.pop();
    if (v === null || typeof v !== "object") continue;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) pilha.push([v[i], `${caminho}[${i}]`]);
    } else {
      for (const k of Object.keys(v)) {
        if (CHAVES_PROIBIDAS.has(k)) achadas.push(caminho || "(raiz)");
        else pilha.push([v[k], caminho ? `${caminho}.${k}` : k]);
      }
    }
  }
  return achadas;
}

/**
 * Lê e valida o texto de um estudo JSON v1.
 * Retorna { ok: true, estudo, avisos } ou { ok: false, erros }. Nunca altera estudo algum: quem chama decide gravar.
 */
export function lerEstudo(texto) {
  const falha = (erros) => ({ ok: false, erros });
  if (typeof texto !== "string") return falha([{ codigo: "JSON_INVALIDO", mensagem: "O conteúdo não é texto.", caminho: "" }]);
  if (excedeBytes(texto, LIMITES.bytesArquivo)) {
    return falha([{ codigo: "ARQUIVO_GRANDE_DEMAIS", mensagem: "O arquivo passa de 10 MB e não será lido.", caminho: "" }]);
  }
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  if (profundidadeJson(texto) > LIMITES.profundidadeJson) {
    return falha([{ codigo: "JSON_PROFUNDO_DEMAIS", mensagem: `O JSON tem mais de ${LIMITES.profundidadeJson} níveis de aninhamento e não será lido.`, caminho: "" }]);
  }
  let doc;
  try {
    doc = JSON.parse(texto);
  } catch (e) {
    return falha([{ codigo: "JSON_INVALIDO", mensagem: `O arquivo não é um JSON válido (${String(e.message).slice(0, 120)}).`, caminho: "" }]);
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    return falha([{ codigo: "JSON_INVALIDO", mensagem: "O JSON deve ser um objeto com os blocos do estudo.", caminho: "" }]);
  }
  const proibidas = chavesProibidas(doc);
  if (proibidas.length) {
    return falha(proibidas.map((c) => ({ codigo: "CAMPO_PROIBIDO", mensagem: `${c}: o arquivo traz uma chave que não é aceita (__proto__, constructor ou prototype).`, caminho: c })));
  }
  if (doc.formato !== FORMATO) {
    return falha([{ codigo: "FORMATO_DESCONHECIDO", mensagem: `O arquivo não é um estudo do simulador-carreiras (formato esperado: "${FORMATO}").`, caminho: "formato" }]);
  }
  const avisos = [];
  const v = doc.versao_formato;
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 1 || v > VERSAO_FORMATO) {
    return falha([{ codigo: "VERSAO_NAO_SUPORTADA", mensagem: `Versão do formato ${typeof v === "number" ? v : "ausente"} não suportada; esta versão do simulador lê até a ${VERSAO_FORMATO}.`, caminho: "versao_formato" }]);
  }
  for (let n = v; n < VERSAO_FORMATO; n++) {
    const migrar = MIGRACOES.get(n);
    if (!migrar) return falha([{ codigo: "VERSAO_NAO_SUPORTADA", mensagem: `Não há migração da versão ${n} do formato.`, caminho: "versao_formato" }]);
    doc = migrar(doc);
    avisos.push({ codigo: "ESPECIFICACAO_DIFERENTE", mensagem: `O arquivo estava na versão ${n} do formato e foi migrado para a ${n + 1}.`, caminho: "versao_formato" });
  }
  const r = validarEstudo(doc);
  if (!r.ok) return falha(r.erros);
  return { ok: true, estudo: doc, avisos: avisos.concat(r.avisos) };
}

// ------------------------------------------------------------------------------------------- serialização

const ORDEM = {
  raiz: ["formato", "versao_formato", "versao_especificacao", "exportado_em", "tipo_dados", "estudo", "carreiras"],
  estudo: ["nome", "mes_posicao", "exercicios", "revisoes_gerais", "encargos_patronais", "taxa_saida_anual", "tolerancia_conferencia",
    "decimo_terceiro", "ferias_terco", "encargos_incidem", "fixa_integra_remuneracao", "notas"],
  carreira: ["id", "nome", "base", "cenarios"],
  cenario: ["id", "nome", "papel", "inicio_vigencia", "enquadramento", "regras"],
  regras: ["eixos", "versoes", "trilhas", "nao_acumulacao", "parcelas"],
  versao: ["inicio_vigencia", "referencia_valores", "carga_horaria", "modo", "gerador", "valores"],
  trilha: ["id", "eixo", "passos", "intersticio_meses", "taxa_exito", "atraso_efeito_meses", "regra_posicao_outro_eixo"],
  parcela: ["nome", "tipo", "integra_remuneracao", "codigos", "pct_por_bloco", "bloco_meses", "max_blocos"],
};

function ordenar(obj, ordem) {
  const saida = {};
  for (const k of ordem) if (Object.hasOwn(obj, k)) saida[k] = obj[k];
  return saida;
}

/** Cópia com as chaves na ordem canônica (o texto exportado não depende da ordem em que a tela montou o objeto). */
function canonico(doc) {
  const d = ordenar(doc, ORDEM.raiz);
  d.estudo = ordenar(doc.estudo, ORDEM.estudo);
  d.carreiras = doc.carreiras.map((c) => {
    const carr = ordenar(c, ORDEM.carreira);
    carr.base = { colunas: c.base.colunas.slice(), linhas: c.base.linhas.map((l) => l.slice()) };
    carr.cenarios = c.cenarios.map((cen) => {
      const x = ordenar(cen, ORDEM.cenario);
      x.regras = ordenar(cen.regras, ORDEM.regras);
      x.regras.versoes = cen.regras.versoes.map((v) => ordenar(v, ORDEM.versao));
      x.regras.trilhas = cen.regras.trilhas.map((t) => ordenar(t, ORDEM.trilha));
      x.regras.parcelas = cen.regras.parcelas.map((p) => ordenar(p, ORDEM.parcela));
      return x;
    });
    return carr;
  });
  return d;
}

function ehPrimitivo(v) {
  return v === null || typeof v !== "object";
}

function escrever(v, nivel) {
  const recuo = "  ".repeat(nivel);
  if (ehPrimitivo(v)) return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    if (v.every(ehPrimitivo)) return `[${v.map((x) => JSON.stringify(x)).join(", ")}]`;
    const itens = v.map((x) => {
      if (Array.isArray(x) && x.every(ehPrimitivo)) return `${recuo}  ${escrever(x, 0)}`; // linha da base ou da tabela, numa linha só
      return `${recuo}  ${escrever(x, nivel + 1)}`;
    });
    return `[\n${itens.join(",\n")}\n${recuo}]`;
  }
  const chaves = Object.keys(v);
  if (chaves.length === 0) return "{}";
  if (chaves.length <= 3 && chaves.every((k) => ehPrimitivo(v[k]))) {
    return `{${chaves.map((k) => `${JSON.stringify(k)}: ${JSON.stringify(v[k])}`).join(", ")}}`;
  }
  const itens = chaves.map((k) => `${recuo}  ${JSON.stringify(k)}: ${escrever(v[k], nivel + 1)}`);
  return `{\n${itens.join(",\n")}\n${recuo}}`;
}

/**
 * Serializa o estudo em texto JSON v1, com chaves em ordem canônica (mesma entrada, mesmo texto).
 * `exportadoEm` vem da tela (ISO 8601): o motor não lê o relógio. `compacto: true` gera uma linha só (Firestore).
 */
export function serializarEstudo(estudo, { exportadoEm, compacto = false } = {}) {
  const copia = canonico(estudo);
  copia.formato = FORMATO;
  copia.versao_formato = VERSAO_FORMATO;
  copia.versao_especificacao = VERSAO_ESPECIFICACAO;
  if (exportadoEm !== undefined) copia.exportado_em = exportadoEm;
  const final = ordenar(copia, ORDEM.raiz);
  return compacto ? JSON.stringify(final) : `${escrever(final, 0)}\n`;
}

