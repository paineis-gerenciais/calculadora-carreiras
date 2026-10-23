// Leitura da planilha da base (CSV e XLSX) e preparo das linhas para gravar. Sem DOM: testável em Node.
// Barreiras antes de abrir o arquivo (parecer de segurança, MS-2): tamanho máximo, UTF-8 estrito, número de linhas,
// colunas e tamanho de célula; no XLSX, leitura do diretório central do ZIP sem descompactar.
import { COLUNAS_BASE_JSON, COLUNAS_PLANILHA, LIMITES } from '../motor/constantes.js';
import { lerCSV } from '../motor/base.js';

export const LIMITE_ARQUIVO_BASE = 2 * 1024 * 1024;
export const LIMITE_CELULA = 64;
export const LIMITE_COLUNAS = COLUNAS_PLANILHA.length;
export const LIMITE_COLUNAS_ABSURDO = 40;
export const LIMITE_ZIP = { entradas: 100, bytesTotal: 30 * 1024 * 1024, razao: 100, pisoDaRazao: 100 * 1024 };

const erro = (codigo, mensagem, linha = 0, coluna = '') => ({ codigo, linha, coluna, mensagem });

// ----------------------------------------------------------------------------- ZIP (XLSX)

/**
 * Lê o fim do arquivo (diretório central do ZIP) e recusa o que se parece com bomba de compressão: mais de 100
 * entradas, soma dos tamanhos declarados acima de 30 MB, ou uma entrada grande (acima de 100 KB) com razão acima de 100:1.
 * ZIP64 e arquivo sem diretório central também são recusados. Não descompacta nada.
 * `[LIMITE]` Os tamanhos são os declarados no próprio arquivo; ver NÃO VERIFICADO sobre arquivos que mentem.
 */
export function prevalidarZip(buffer) {
  const v = new DataView(buffer);
  const n = buffer.byteLength;
  const recusa = (mensagem) => ({ ok: false, mensagem });
  if (n < 22) return recusa('O arquivo não é uma planilha XLSX válida.');
  let eocd = -1;
  for (let i = n - 22; i >= Math.max(0, n - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return recusa('O arquivo não é uma planilha XLSX válida (sem diretório do ZIP).');
  const entradas = v.getUint16(eocd + 10, true);
  const tamCd = v.getUint32(eocd + 12, true);
  const offCd = v.getUint32(eocd + 16, true);
  if (entradas === 0xffff || tamCd === 0xffffffff || offCd === 0xffffffff) return recusa('Planilhas em formato ZIP64 não são aceitas.');
  if (entradas > LIMITE_ZIP.entradas) return recusa(`A planilha tem ${entradas} arquivos internos; o máximo aceito é ${LIMITE_ZIP.entradas}.`);
  if (offCd + tamCd > n) return recusa('O arquivo não é uma planilha XLSX válida (diretório fora do arquivo).');
  let pos = offCd;
  let total = 0;
  for (let k = 0; k < entradas; k++) {
    if (pos + 46 > offCd + tamCd || v.getUint32(pos, true) !== 0x02014b50) return recusa('O arquivo não é uma planilha XLSX válida (diretório corrompido).');
    const comprimido = v.getUint32(pos + 20, true);
    const original = v.getUint32(pos + 24, true);
    const nome = v.getUint16(pos + 28, true);
    const extra = v.getUint16(pos + 30, true);
    const comentario = v.getUint16(pos + 32, true);
    if (original === 0xffffffff || comprimido === 0xffffffff) return recusa('Planilhas em formato ZIP64 não são aceitas.');
    total += original;
    if (total > LIMITE_ZIP.bytesTotal) return recusa('A planilha, descompactada, passaria de 30 MB: arquivo recusado.');
    if (original > LIMITE_ZIP.pisoDaRazao && original > LIMITE_ZIP.razao * Math.max(comprimido, 1)) {
      return recusa('A planilha tem conteúdo comprimido de forma suspeita (razão acima de 100 para 1): arquivo recusado.');
    }
    pos += 46 + nome + extra + comentario;
  }
  return { ok: true, entradas, bytesDescompactados: total };
}

// ----------------------------------------------------------------------------- leitura

/** Texto de uma célula da planilha: data vira AAAA-MM; número e booleano viram texto; vazio vira "". */
export function celulaParaTexto(c) {
  if (c === null || c === undefined) return '';
  if (c instanceof Date) {
    return Number.isNaN(c.getTime()) ? '' : `${c.getUTCFullYear()}-${String(c.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  if (typeof c === 'number') return Number.isFinite(c) ? String(c) : '';
  return String(c);
}

/** Aplica os tetos de linhas, colunas e tamanho de célula. Devolve { linhas, numerosLinha, erros } (linhas truncadas). */
export function limitar({ cabecalho, linhas, numerosLinha }) {
  const erros = [];
  // Colunas a mais (até o teto de segurança) são relatadas uma a uma pela validação ("coluna desconhecida" ou "campo
  // identificador proibido"), que é mais útil que um total; acima do teto, recusa direta.
  if (cabecalho.length > LIMITE_COLUNAS_ABSURDO) {
    erros.push(erro('VALOR_FORA_DO_LIMITE', `Linha 1: o cabeçalho tem ${cabecalho.length} colunas; o modelo tem ${LIMITE_COLUNAS}.`, 1));
  }
  let saida = linhas;
  let nums = numerosLinha;
  if (linhas.length > LIMITES.linhasBase) {
    erros.push(erro('VALOR_FORA_DO_LIMITE', `O arquivo tem ${linhas.length} linhas de dados; o máximo é ${LIMITES.linhasBase}.`));
    saida = linhas.slice(0, LIMITES.linhasBase);
    nums = numerosLinha.slice(0, LIMITES.linhasBase);
  }
  let longas = 0;
  [cabecalho, ...saida].forEach((cels, i) => {
    for (const c of cels) {
      if (c.length > LIMITE_CELULA) {
        longas++;
        if (longas <= 20) erros.push(erro('VALOR_FORA_DO_LIMITE', `Linha ${i === 0 ? 1 : nums[i - 1]}: há uma célula com mais de ${LIMITE_CELULA} caracteres.`, i === 0 ? 1 : nums[i - 1]));
      }
    }
  });
  if (longas > 20) erros.push(erro('ERROS_OMITIDOS', `Mais ${longas - 20} células longas não foram listadas.`));
  return { linhas: saida, numerosLinha: nums, erros };
}

/** CSV em UTF-8 estrito (com ou sem BOM), separador ";". */
export function lerCsvDeBytes(bytes) {
  let texto;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { formato: 'csv', cabecalho: [], linhas: [], numerosLinha: [], erros: [erro('CSV_INVALIDO', 'O arquivo não está em UTF-8. Salve como "CSV UTF-8 (delimitado por vírgulas ou ponto e vírgula)" e envie de novo.')] };
  }
  const r = lerCSV(texto);
  const lim = limitar(r);
  return { formato: 'csv', cabecalho: r.cabecalho, linhas: lim.linhas, numerosLinha: lim.numerosLinha, erros: [...r.erros, ...lim.erros] };
}

/** Primeira aba do XLSX em linhas de texto; a primeira linha não vazia é o cabeçalho. `numerosLinha` = linha da planilha. */
export function linhasDeXlsx(matriz) {
  const todas = matriz.map((l, i) => ({ n: i + 1, cels: l.map(celulaParaTexto) }));
  const nao = todas.filter((l) => l.cels.some((c) => c.trim() !== ''));
  if (!nao.length) return { cabecalho: [], linhas: [], numerosLinha: [] };
  const cabecalho = nao[0].cels.map((c) => c.trim());
  while (cabecalho.length && cabecalho[cabecalho.length - 1] === '') cabecalho.pop();
  const largura = cabecalho.length;
  const corpo = nao.slice(1);
  return {
    cabecalho,
    linhas: corpo.map((l) => {
      const cels = l.cels.slice(0, Math.max(largura, l.cels.reduce((m, c, i) => (c.trim() !== '' ? i + 1 : m), 0)));
      while (cels.length < largura) cels.push('');
      return cels;
    }),
    numerosLinha: corpo.map((l) => l.n),
  };
}

/**
 * Lê o arquivo escolhido (CSV ou XLSX, pelo conteúdo). `lerAba(arquivo)` é o adaptador do XLSX (externos/xlsx-leitura.js).
 * Retorna { formato, cabecalho, linhas, numerosLinha, erros } — `erros` do arquivo, antes da validação da base.
 */
export async function lerArquivoBase(arquivo, { lerAba = null } = {}) {
  const vazio = (formato, erros) => ({ formato, cabecalho: [], linhas: [], numerosLinha: [], erros });
  if (arquivo.size > LIMITE_ARQUIVO_BASE) return vazio('csv', [erro('ARQUIVO_GRANDE_DEMAIS', 'O arquivo passa de 2 MB e não será lido.')]);
  const buffer = await arquivo.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const pre = prevalidarZip(buffer);
    if (!pre.ok) return vazio('xlsx', [erro('ARQUIVO_RECUSADO', pre.mensagem)]);
    if (!lerAba) return vazio('xlsx', [erro('ARQUIVO_RECUSADO', 'A leitura de planilhas XLSX não está disponível.')]);
    let matriz;
    try { matriz = await lerAba(arquivo); } catch { return vazio('xlsx', [erro('ARQUIVO_RECUSADO', 'Não foi possível ler a planilha XLSX. Confira se o arquivo não está corrompido ou protegido por senha.')]); }
    const l = linhasDeXlsx(matriz);
    const lim = limitar(l);
    return { formato: 'xlsx', cabecalho: l.cabecalho, linhas: lim.linhas, numerosLinha: lim.numerosLinha, erros: lim.erros };
  }
  return lerCsvDeBytes(bytes);
}

// ----------------------------------------------------------------------------- saída

const textoCentavos = (c) => (c > 0 ? `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}` : null);

/** Linhas normalizadas de `validarBase`/`agruparBase` -> linhas do JSON v1 (colunas de COLUNAS_BASE_JSON). */
export function linhasParaJson(linhas) {
  return linhas.map((l) => [l.codigo, null, l.p1, l.p2, l.c1, l.c2, l.q, l.tempo, l.titulacao, textoCentavos(l.fixaCent)]);
}

export const COLUNAS_JSON = COLUNAS_BASE_JSON.slice();

/** Grupos pequenos (menos de `k` servidores) depois de juntar linhas iguais. */
export function gruposPequenos(linhas, k) {
  return linhas.filter((l) => l.q < k);
}

/** Texto seguro para CSV: neutraliza fórmula (OWASP) e cita o que tem separador, aspas ou quebra. */
export function csvSeguro(valor) {
  let t = String(valor ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** Relatório de erros em CSV UTF-8 com BOM (abre direto no Excel). */
export function relatorioCsv(erros, avisos = []) {
  const linhas = ['tipo;linha;coluna;codigo;motivo'];
  for (const e of erros) linhas.push(['erro', e.linha || '', e.coluna || '', e.codigo, e.mensagem].map(csvSeguro).join(';'));
  for (const a of avisos) linhas.push(['aviso', a.linha || '', a.coluna || '', a.codigo, a.mensagem].map(csvSeguro).join(';'));
  return `﻿${linhas.join('\r\n')}\r\n`;
}

/** Modelo vazio da planilha: só o cabeçalho (as orientações ficam na tela). */
export function modeloCsv() {
  return `﻿${COLUNAS_PLANILHA.join(';')}\r\n`;
}
