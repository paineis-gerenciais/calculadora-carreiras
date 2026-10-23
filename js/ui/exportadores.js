// Pontos de entrada das exportações (T8; M4, M5, M11). ui/exportacao-ui.js registra as funções reais:
//   registrarExportador('excel' | 'pptx' | 'json', async (contexto) => ({ ok, mensagem, avisos? }))
// `contexto` = { id, origem: 'lista' | 'exportar' } — a função lê o estudo aberto em ui/estado.js (ou o lê do banco pelo id).
const mapa = new Map();

export const TIPOS_EXPORTACAO = ['excel', 'pptx', 'json'];

export function registrarExportador(tipo, fn) {
  if (!TIPOS_EXPORTACAO.includes(tipo)) throw new Error(`tipo de exportação desconhecido: ${tipo}`);
  mapa.set(tipo, fn);
}

export const exportadorDe = (tipo) => mapa.get(tipo) ?? null;

/**
 * Roda o exportador do tipo e devolve sempre { ok, mensagem, avisos? }; uma falha inesperada vira mensagem, nunca exceção.
 * Quem chama desabilita o botão enquanto espera e mostra o resultado.
 */
export async function executarExportacao(tipo, contexto) {
  const fn = mapa.get(tipo);
  if (!fn) return { ok: false, mensagem: 'Esta exportação não está disponível.' };
  try {
    return await fn(contexto);
  } catch {
    return { ok: false, mensagem: 'Não foi possível gerar o arquivo. Tente de novo; se o problema continuar, exporte o JSON do estudo para não perder o trabalho.' };
  }
}
