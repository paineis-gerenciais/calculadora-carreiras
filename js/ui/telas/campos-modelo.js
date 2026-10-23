// Campos de formulário ligados ao modelo do estudo (usados pelas abas da tela de carreiras).
import { campo } from '../componentes.js';

/** Campo de texto ligado a um caminho do estudo. `ler()` -> texto do campo; `escrever(estudo, valor)` aplica a edição. */
export function campoModelo(amb, caminho, { rotulo, ler, escrever, ...opcoes }) {
  const c = campo({ rotulo, valor: ler(), aoMudar: (v) => amb.mudar((e) => escrever(e, v)), ...opcoes });
  amb.formulario.adicionar(caminho, c);
  return c;
}

/** "12" -> 12; outro texto fica como está (o validador recusa e mostra o motivo no campo). */
export const inteiroOuTexto = (v) => (/^\d+$/.test(String(v).trim()) ? Number(String(v).trim()) : String(v).trim());
