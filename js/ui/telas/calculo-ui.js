// Obtém o resultado do motor para as telas de resultado (projeção, comparação, premissas) e mostra os estados:
// falta de base, problemas no estudo, calculando (com progresso e cancelar), erro e cancelado.
import { horizonte } from '../../motor/validacao.js';
import { botao, faixa, vazio } from '../componentes.js';
import { criar, esvaziar, linkRota } from '../dom.js';
import { assinar, calcular, cancelarCalculo, estado, resultadoAtual } from '../estado.js';

/** Nomes das carreiras sem linhas na base. */
export const carreirasSemBase = () => estado.estudo.carreiras.filter((c) => c.base.linhas.length === 0).map((c) => c.nome);

/**
 * Devolve o Resultado (calculando se preciso) ou null depois de mostrar em `area` o estado que impede o cálculo.
 * `tentarDeNovo`: função chamada pelo botão "Calcular de novo" (ex.: redesenhar a tela).
 */
export async function prepararResultado(area, tentarDeNovo) {
  esvaziar(area);
  const falta = carreirasSemBase();
  if (falta.length) {
    area.append(vazio('Falta a base de servidores',
      `Importe a base ${falta.length === 1 ? 'da carreira' : 'das carreiras'} ${falta.join(', ')} para calcular a projeção e comparar propostas.`,
      linkRota('Ir para Base de servidores', '#/base')));
    return null;
  }
  if (!estado.validacao.ok) {
    area.append(faixa('erro', criar('strong', {}, 'O estudo tem problemas e não pode ser calculado.'), ' ', estado.validacao.erros[0].mensagem, ' ', linkRota('Ir para Carreiras', '#/carreiras')));
    return null;
  }
  const atual = resultadoAtual();
  if (atual && !atual.desatualizado) return atual.dados;

  const h = horizonte(estado.estudo);
  const linhas = estado.estudo.carreiras.reduce((s, c) => s + c.base.linhas.length, 0);
  const texto = criar('p', { id: 'texto-calculo' }, `Calculando a projeção: ${h ? h.n : '?'} meses × ${linhas} linhas`);
  const barra = criar('progress', { max: '100', 'aria-label': 'Progresso do cálculo' });
  const cancelar = botao('Cancelar', { aoClicar: () => cancelarCalculo(), atributos: { id: 'btn-cancelar-calculo' } });
  const painel = criar('section', { class: 'cartao calculando', 'aria-busy': 'true' }, texto, barra, cancelar);
  area.append(painel);
  const parar = assinar((tipo) => {
    if (tipo !== 'calculo' || !estado.calculando?.progresso) return;
    const { feitas, total } = estado.calculando.progresso;
    barra.value = total ? Math.round((feitas / total) * 100) : 0;
    texto.textContent = `Calculando a projeção: ${h ? h.n : '?'} meses × ${linhas} linhas (${feitas} de ${total})`;
  });
  try {
    const dados = await calcular();
    return dados;
  } catch (e) {
    esvaziar(area);
    if (e?.cancelado) {
      area.append(vazio('Cálculo cancelado', 'O cálculo foi interrompido. Nada foi alterado no estudo.', botao('Calcular de novo', { variante: 'prim', aoClicar: tentarDeNovo })));
    } else {
      const erros = e?.erros ?? [{ mensagem: 'Erro inesperado no cálculo.' }];
      area.append(faixa('erro', criar('strong', {}, 'Não foi possível calcular a projeção.'),
        criar('ul', { class: 'lista-simples' }, erros.slice(0, 6).map((x) => criar('li', {}, x.mensagem))),
        botao('Tentar de novo', { aoClicar: tentarDeNovo })));
    }
    return null;
  } finally {
    parar();
  }
}
