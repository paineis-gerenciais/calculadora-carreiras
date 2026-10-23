// Adaptador da read-excel-file 9.3.12 (vendor/read-excel-file). Só lê a primeira aba. Quem chama deve ter passado antes
// pela pré-validação do ZIP (ui/importacao.js, parecer MS-2): a biblioteca não limita a descompressão.
import { carregarScript } from './carregar.js';

/** Lê a primeira aba: lista de linhas, cada uma com células (texto, número, Date, booleano ou null). */
export async function lerPrimeiraAba(arquivo) {
  const ler = await carregarScript('vendor/read-excel-file/9.3.12/read-excel-file.min.js', 'readXlsxFile');
  const abas = await ler(arquivo);
  const primeira = Array.isArray(abas) ? abas[0] : null;
  return primeira && Array.isArray(primeira.data) ? primeira.data : [];
}
