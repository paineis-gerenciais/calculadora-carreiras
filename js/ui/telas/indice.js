// Telas do MVP por id de rota (ver ui/rotas.js).
import { telaBase } from './base.js';
import { telaCarreiras } from './carreiras.js';
import { telaComparar } from './comparar.js';
import { telaEstudos } from './estudos.js';
import { telaEvolucao } from './evolucao.js';
import { telaExportar } from './exportar.js';
import { telaPremissas } from './premissas.js';
import { telaProjecao } from './projecao.js';

export const telas = {
  estudos: telaEstudos,
  carreiras: telaCarreiras,
  base: telaBase,
  evolucao: telaEvolucao,
  projecao: telaProjecao,
  comparar: telaComparar,
  premissas: telaPremissas,
  exportar: telaExportar,
};
