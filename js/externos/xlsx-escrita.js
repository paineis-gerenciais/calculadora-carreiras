// Adaptador da write-excel-file 4.1.1 (vendor/write-excel-file). Parecer de segurança MS-1, item 5: NUNCA usa células do
// tipo 'Formula'. Todo texto vira célula de texto (string compartilhada), mesmo que comece com "=", "+", "-" ou "@".
//
// Células aceitas pelo adaptador:
//   null | undefined            célula vazia
//   string                      texto
//   number                      número com 2 casas (#,##0.00)
//   { texto, negrito?, fundo?, cor?, quebra? }
//   { numero, formato?: 'dinheiro' | 'num2' | 'inteiro', negrito?, fundo? }
// Aba: { nome, larguras?: number[], linhas: Célula[][], congelarLinhas?: number }
import { carregarScript } from './carregar.js';

export const FORMATOS = { dinheiro: '#,##0.00', num2: '#,##0.00', inteiro: '0' };

// Caracteres de controle que o XML 1.0 não admite.
// eslint-disable-next-line no-control-regex
const CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const limpo = (t) => String(t).replace(CONTROLE, '');

function celula(c) {
  if (c === null || c === undefined || c === '') return null;
  if (typeof c === 'number') return Number.isFinite(c) ? { value: c, type: Number, format: FORMATOS.dinheiro } : null;
  if (typeof c === 'string') return { value: limpo(c), type: String };
  if (typeof c.numero === 'number') {
    if (!Number.isFinite(c.numero)) return null;
    const x = { value: c.numero, type: Number, format: FORMATOS[c.formato ?? 'dinheiro'] ?? FORMATOS.dinheiro };
    if (c.negrito) x.fontWeight = 'bold';
    if (c.fundo) x.backgroundColor = c.fundo;
    return x;
  }
  const texto = c.texto === null || c.texto === undefined || c.texto === '' ? null : limpo(c.texto);
  if (texto === null) return null;
  const x = { value: texto, type: String };
  if (c.negrito) x.fontWeight = 'bold';
  if (c.fundo) x.backgroundColor = c.fundo;
  if (c.cor) x.textColor = c.cor;
  if (c.quebra) x.wrap = true;
  return x;
}

const nomeAba = (n) => limpo(n).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);

/** Gera o XLSX como Blob. `escritor`: para os testes (injeta a função da biblioteca). */
export async function gerarXlsx(abas, { escritor = null } = {}) {
  const escrever = escritor ?? await carregarScript('vendor/write-excel-file/4.1.1/write-excel-file.min.js', 'writeXlsxFile');
  const folhas = abas.map((a) => {
    const folha = { sheet: nomeAba(a.nome), data: a.linhas.map((l) => l.map(celula)) };
    if (a.larguras) folha.columns = a.larguras.map((w) => ({ width: w }));
    if (a.congelarLinhas) folha.stickyRowsCount = a.congelarLinhas;
    return folha;
  });
  return escrever(folhas).toBlob();
}
