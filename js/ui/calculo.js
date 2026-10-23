// Cliente do Web Worker do motor (visão geral, seção 6.1). Um cálculo por vez. "Cancelar" encerra o worker
// (terminate) e o próximo cálculo cria outro. O worker é módulo da mesma origem (worker-src 'self').
const URL_WORKER = new URL('../motor/worker.js', import.meta.url);

/**
 * Calcula no worker. `criarWorker` existe para os testes (um dublê com postMessage/terminate/onmessage).
 * Retorna { promessa, cancelar }. A promessa resolve com o Resultado ou rejeita com { erros } (lista do motor) ou
 * { cancelado: true }.
 */
export function calcularNoWorker(estudo, opcoes = {}, aoProgresso = null, criarWorker = () => new Worker(URL_WORKER, { type: 'module' })) {
  let worker;
  let rejeitar;
  const promessa = new Promise((ok, falha) => {
    rejeitar = falha;
    try {
      worker = criarWorker();
    } catch {
      falha({ erros: [{ codigo: 'ERRO_INTERNO', mensagem: 'Não foi possível iniciar o motor de cálculo neste navegador.', caminho: '' }] });
      return;
    }
    worker.onmessage = (ev) => {
      const m = ev.data;
      if (m?.tipo === 'progresso') aoProgresso?.({ feitas: m.feitas, total: m.total });
      else if (m?.tipo === 'resultado') { worker.terminate(); ok(m.resultado); }
      else if (m?.tipo === 'erro') { worker.terminate(); falha({ erros: m.erros }); }
    };
    worker.onerror = () => {
      worker.terminate();
      falha({ erros: [{ codigo: 'ERRO_INTERNO', mensagem: 'O motor de cálculo parou de forma inesperada.', caminho: '' }] });
    };
    worker.postMessage({ tipo: 'calcular', estudo, opcoes });
  });
  const cancelar = () => {
    if (worker) worker.terminate();
    rejeitar?.({ cancelado: true });
  };
  return { promessa, cancelar };
}
