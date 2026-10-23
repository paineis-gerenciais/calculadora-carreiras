// Ponto de entrada: monta a casca, a barra do estudo e registra as telas (T1 a T8 da especificação).
import { iniciarBarra } from './ui/barra.js';
import { iniciarCasca } from './ui/casca.js';
import { temAlteracaoNaoSalva } from './ui/estado.js';
import './ui/exportacao-ui.js';
import { telas } from './ui/telas/indice.js';

iniciarBarra(document);
iniciarCasca(document, window, { telas });
window.addEventListener('beforeunload', (e) => {
  if (temAlteracaoNaoSalva()) { e.preventDefault(); e.returnValue = ''; }
});
