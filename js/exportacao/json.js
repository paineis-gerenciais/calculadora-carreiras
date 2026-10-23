// Exportação do estudo completo em JSON v1 (M11, CA-25): o mesmo texto do Firestore, com a base, em ordem canônica
// (motor/formato.js). A importação é ui/estado.js `importarJson` (lerEstudo recusa tudo ou nada, CA-26).
import { impressaoDigital } from '../dados/estudo-io.js';
import { LIMITES } from '../motor/constantes.js';
import { serializarEstudo } from '../motor/formato.js';
import { bytesUtf8 } from '../dados/serializacao.js';
import { nomeArquivo } from './dados.js';

/** Devolve { blob, nome, bytes, impressao, grande }. `grande`: o arquivo passa do limite de leitura (10 MB) e não poderia ser importado. */
export async function gerarJson(estudo, { agora = new Date() } = {}) {
  const texto = serializarEstudo(estudo, { exportadoEm: agora.toISOString() });
  const impressao = await impressaoDigital(estudo);
  const bytes = bytesUtf8(texto);
  return {
    blob: new Blob([texto], { type: 'application/json' }),
    nome: nomeArquivo('estudo', estudo.estudo.nome, 'json', impressao, agora),
    bytes, impressao, grande: bytes > LIMITES.bytesArquivo,
  };
}
