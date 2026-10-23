// Tradução dos erros do Firestore para mensagens em português simples. Sem Firebase: testável em Node.
import { ErroIntegridade, ErroTamanho } from './serializacao.js';

const AVISO_SEM_BANCO = 'Importar um arquivo JSON e calcular continuam funcionando sem o banco.';

/**
 * Devolve { tipo, mensagem }. `operacao`: 'listar' | 'abrir' | 'criar' | 'salvar' | 'importar' | 'excluir' | 'exportar'.
 * tipo: 'cota' | 'conflito' | 'sem_conexao' | 'integridade' | 'tamanho' | 'regras' | 'nao_encontrado' | 'outro'.
 */
export function classificarErro(e, operacao = 'salvar') {
  if (e instanceof ErroIntegridade) {
    return { tipo: 'integridade', mensagem: `O estudo não pôde ser aberto: ${e.message} Importe a última cópia JSON do estudo.` };
  }
  if (e instanceof ErroTamanho) return { tipo: 'tamanho', mensagem: e.message };
  const codigo = e?.code ?? '';
  if (codigo === 'resource-exhausted') {
    // O6: a cota gratuita do dia acabou. Ela volta à meia-noite do Pacífico (cerca de 04h a 05h em Brasília).
    return {
      tipo: 'cota',
      mensagem: `A cota diária gratuita do banco de dados acabou. Ela volta por volta das 04h às 05h (horário de Brasília). ${AVISO_SEM_BANCO}`,
    };
  }
  if (codigo === 'permission-denied') {
    if (operacao === 'salvar' || operacao === 'importar') {
      return { tipo: 'conflito', mensagem: 'Estudo alterado em outra aba: nada foi gravado. Reabra o estudo para ver a versão mais recente.' };
    }
    return { tipo: 'regras', mensagem: 'O banco de dados recusou a operação. Tente de novo; se continuar, avise quem mantém o sistema.' };
  }
  if (codigo === 'unavailable' || codigo === 'deadline-exceeded' || codigo === 'cancelled') {
    return { tipo: 'sem_conexao', mensagem: `Sem conexão com o banco de dados: as alterações ainda não foram gravadas. ${AVISO_SEM_BANCO}` };
  }
  if (codigo === 'not-found') return { tipo: 'nao_encontrado', mensagem: 'O estudo não existe mais.' };
  if (codigo === 'invalid-argument') return { tipo: 'tamanho', mensagem: 'O banco de dados recusou o tamanho ou o formato do conteúdo.' };
  return { tipo: 'outro', mensagem: 'Não foi possível concluir a operação. Tente de novo.' };
}
