// Carregador de bibliotecas vendorizadas (visão geral, seção 1, regra 5): uma tag <script> com src local (mesma origem,
// coberta por script-src 'self'), sob demanda, devolvendo a função global da biblioteca. Cada biblioteca tem um
// adaptador em externos/ e nenhum outro módulo conhece o caminho do vendor/.
const carregadas = new Map();

/** Carrega o script `caminho` (relativo a app/) uma vez e devolve globalThis[global]. */
export function carregarScript(caminho, global) {
  if (globalThis[global]) return Promise.resolve(globalThis[global]);
  if (carregadas.has(caminho)) return carregadas.get(caminho);
  const promessa = new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = new URL(`../../${caminho}`, import.meta.url).href;
    s.addEventListener('load', () => (globalThis[global] ? ok(globalThis[global]) : falha(new Error(`${global} ausente`))));
    s.addEventListener('error', () => { carregadas.delete(caminho); falha(new Error(`não foi possível carregar ${caminho}`)); });
    document.head.append(s);
  });
  carregadas.set(caminho, promessa);
  return promessa;
}
