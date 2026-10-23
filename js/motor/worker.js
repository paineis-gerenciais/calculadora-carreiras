// Adaptador do Web Worker (visão geral, seção 6.1). Recebe { tipo: "calcular", estudo, opcoes } e responde
// { tipo: "progresso", feitas, total }, { tipo: "resultado", resultado } ou { tipo: "erro", erros }.
// "Cancelar" é terminate() do lado da tela. Um cálculo por vez: o worker é síncrono e as mensagens esperam na fila.
import { ErroMotor } from "./constantes.js";
import { calcular } from "./simulacao.js";

/** Trata uma mensagem; `postar` envia a resposta. Separada do `onmessage` para rodar também em Node (testes). */
export function tratarMensagem(msg, postar) {
  if (msg === null || typeof msg !== "object" || msg.tipo !== "calcular") {
    postar({ tipo: "erro", erros: [{ codigo: "ERRO_INTERNO", mensagem: "Mensagem desconhecida para o motor.", caminho: "" }] });
    return;
  }
  try {
    const resultado = calcular(msg.estudo, msg.opcoes ?? {}, (p) => postar({ tipo: "progresso", feitas: p.feitas, total: p.total }));
    postar({ tipo: "resultado", resultado });
  } catch (e) {
    if (e instanceof ErroMotor) postar({ tipo: "erro", erros: e.erros });
    else postar({ tipo: "erro", erros: [{ codigo: "ERRO_INTERNO", mensagem: `Erro inesperado no cálculo: ${String(e && e.message).slice(0, 200)}`, caminho: "" }] });
  }
}

if (typeof WorkerGlobalScope !== "undefined" && typeof self !== "undefined" && self instanceof WorkerGlobalScope) {
  self.onmessage = (ev) => tratarMensagem(ev.data, (m) => self.postMessage(m));
}
