// Mensagem de sucesso que atravessa uma navegação (ex.: "Estudo criado") e some em 8 s sem roubar o foco (especificação, seção 4).
import { anunciar, faixa } from './componentes.js';

let pendente = null;

/** Guarda a mensagem para a próxima tela que chamar `mostrarAvisoPendente`. */
export function avisarNaProxima(texto, tipo = 'ok') {
  pendente = { texto, tipo };
}

/** Mostra uma faixa de sucesso/aviso no início de `container`; some em 8 s (sucesso). */
export function mostrarMensagem(container, texto, tipo = 'ok') {
  const f = faixa(tipo, texto);
  container.prepend(f);
  anunciar(texto);
  if (tipo === 'ok') setTimeout(() => f.remove(), 8000);
  return f;
}

export function mostrarAvisoPendente(container) {
  if (!pendente) return;
  const { texto, tipo } = pendente;
  pendente = null;
  mostrarMensagem(container, texto, tipo);
}
