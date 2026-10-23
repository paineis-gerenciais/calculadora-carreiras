// Tabela das telas e resolução de rota (hash "#/nome"). Sem DOM: testável em Node.
// Telas da especificação (docs/design/especificacao.md, seção 5). Nesta etapa (parte 1) cada tela mostra só o estado vazio.
export const TELAS = [
  { id: 'estudos', titulo: 'Estudos', dentroDoEstudo: false,
    vazio: { titulo: 'Nenhum estudo ainda', texto: 'Crie o primeiro estudo ou importe um arquivo JSON.' } },
  { id: 'carreiras', titulo: 'Carreiras', dentroDoEstudo: true,
    vazio: { titulo: 'Nenhuma carreira cadastrada', texto: 'Abra um estudo para cadastrar a primeira carreira.' } },
  { id: 'base', titulo: 'Base de servidores', dentroDoEstudo: true,
    vazio: { titulo: 'Sem base de servidores', texto: 'Importe a planilha para projetar a base.' } },
  { id: 'evolucao', titulo: 'Evolução individual', dentroDoEstudo: true,
    vazio: { titulo: 'Escolha a posição inicial', texto: 'Escolha a carreira e a posição inicial para ver a evolução.' } },
  { id: 'projecao', titulo: 'Projeção e propostas', dentroDoEstudo: true,
    vazio: { titulo: 'Falta a base de servidores', texto: 'Importe a base para calcular a projeção e comparar propostas.' } },
  { id: 'comparar', titulo: 'Comparar carreiras', dentroDoEstudo: true,
    vazio: { titulo: 'Escolha duas ou mais carreiras', texto: 'A comparação precisa de pelo menos duas carreiras no estudo.' } },
  { id: 'premissas', titulo: 'Premissas', dentroDoEstudo: true,
    vazio: { titulo: 'Sem premissas para mostrar', texto: 'Abra um estudo e calcule a projeção para ver a memória de premissas.' } },
  { id: 'exportar', titulo: 'Exportar', dentroDoEstudo: true,
    vazio: { titulo: 'Nada para exportar', texto: 'Abra um estudo para gerar Excel, PowerPoint ou JSON.' } },
];

export const ROTA_PADRAO = 'estudos';
const POR_ID = new Map(TELAS.map((t) => [t.id, t]));

/** "#/carreiras" -> tela de carreiras. Hash vazio -> tela padrão. Hash desconhecido -> null (a casca mostra "não encontrada"). */
export function resolverRota(hash) {
  const h = String(hash ?? '');
  if (h === '' || h === '#' || h === '#/') return POR_ID.get(ROTA_PADRAO);
  const m = /^#\/([a-z-]+)$/.exec(h);
  return (m && POR_ID.get(m[1])) || null;
}

/** Trilha de pão (texto e rota). Dentro do estudo: Estudos > Estudo > Tela. */
export function trilhaDe(tela, nomeDoEstudo = null) {
  if (!tela || tela.id === ROTA_PADRAO) return [{ texto: 'Estudos', rota: null }];
  const itens = [{ texto: 'Estudos', rota: '#/estudos' }];
  if (tela.dentroDoEstudo) itens.push({ texto: nomeDoEstudo ?? 'Nenhum estudo aberto', rota: null });
  itens.push({ texto: tela.titulo, rota: null });
  return itens;
}
