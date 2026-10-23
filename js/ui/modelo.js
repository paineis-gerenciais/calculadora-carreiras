// Modelo de edição do estudo (JSON v1): criação de estudo, carreira e propostas, ajuste das tabelas quando os eixos
// mudam, leitura de texto colado e conferência com a tabela publicada. Funções puras (sem DOM): testáveis em Node.
// Os decimais ficam em texto, como no formato; só o motor calcula.
import { novoId } from '../dados/serializacao.js';
import { COLUNAS_BASE_JSON, FORMATO, LIMITES, VERSAO_ESPECIFICACAO, VERSAO_FORMATO } from '../motor/constantes.js';
import { centavosDeTexto, dinheiroValido, indiceMes, mesValido, textoMes } from '../motor/numero.js';
import { gerarTabela } from '../motor/tabela.js';
import { campoParaDecimal } from './formatar.js';

export const MAX_PROPOSTAS = 3;

export const copia = (x) => JSON.parse(JSON.stringify(x));

export function mesAtual(agora = new Date()) {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

export function somarMeses(mes, n) {
  return textoMes(indiceMes(mes) + n);
}

/** Primeiro janeiro depois do mês dado ("2026-12" -> "2027-01"; "2026-03" -> "2027-01"). */
export function proximoJaneiro(mes) {
  return `${Number(mes.slice(0, 4)) + 1}-01`;
}

/** Nome que não repete nenhum de `existentes` e cabe em `max` caracteres. */
export function nomeUnico(base, existentes, max = LIMITES.nome) {
  const usados = new Set(existentes);
  const corta = (t, sufixo = '') => `${t.slice(0, max - sufixo.length)}${sufixo}`;
  if (!usados.has(corta(base))) return corta(base);
  for (let i = 2; i < 1000; i++) {
    const n = corta(base, ` (${i})`);
    if (!usados.has(n)) return n;
  }
  return corta(base, ` (${novoId().slice(0, 4)})`);
}

/** Regras de uma carreira modelo: valores de exemplo que o usuário troca (a tela avisa). */
export function regrasModelo(mesPosicao) {
  return {
    eixos: [{ nome: 'Nível', rotulos: ['I', 'II', 'III'] }, { nome: 'Grau', rotulos: ['A', 'B', 'C'] }],
    versoes: [{
      inicio_vigencia: '2000-01', referencia_valores: mesPosicao, carga_horaria: null, modo: 'gerador',
      gerador: { valor_base: '1000.00', pct_eixo1: { constante: '5' }, pct_eixo2: { constante: '2' } },
    }],
    trilhas: [], nao_acumulacao: [], parcelas: [],
  };
}

export function carreiraNova(nome, mesPosicao) {
  return {
    id: novoId(), nome,
    base: { colunas: COLUNAS_BASE_JSON.slice(), linhas: [] },
    cenarios: [{ id: 'atual', nome: 'Cenário atual', papel: 'atual', regras: regrasModelo(mesPosicao) }],
  };
}

/** Estudo novo válido: uma carreira modelo, sem base, padrões do modelo de parâmetros. */
export function estudoNovo({ nome, tipoDados, mesPosicao, nomeCarreira = 'Carreira 1', agora = new Date() }) {
  return {
    formato: FORMATO,
    versao_formato: VERSAO_FORMATO,
    versao_especificacao: VERSAO_ESPECIFICACAO,
    exportado_em: agora.toISOString(),
    tipo_dados: tipoDados,
    estudo: {
      nome, mes_posicao: mesPosicao, exercicios: 3, revisoes_gerais: [], encargos_patronais: '20', taxa_saida_anual: '0',
      tolerancia_conferencia: '0.01',
      decimo_terceiro: { ativo: true, mes_primeira_parcela: null, pct_primeira_parcela: '50' },
      ferias_terco: { ativo: true, distribuicao: 'uniforme', meses: [] },
      encargos_incidem: { decimo_terceiro: true, terco_ferias: false },
      fixa_integra_remuneracao: true, notas: '',
    },
    carreiras: [carreiraNova(nomeCarreira, mesPosicao)],
  };
}

/**
 * Nova proposta a partir de um cenário da carreira (M8). Do atual: vigência no próximo janeiro e enquadramento na mesma
 * posição. De uma proposta: cópia com " (cópia)" no nome e a mesma vigência. Devolve o cenário ou null se já há o máximo.
 */
export function cenarioDuplicado(estudo, carreira, origemId) {
  const origem = carreira.cenarios.find((c) => c.id === origemId);
  if (!origem) return null;
  const propostas = carreira.cenarios.filter((c) => c.papel === 'proposta');
  if (propostas.length >= MAX_PROPOSTAS) return null;
  const nomes = carreira.cenarios.map((c) => c.nome);
  const novo = copia(origem);
  novo.id = `p${novoId()}`;
  novo.papel = 'proposta';
  if (origem.papel === 'atual') {
    novo.nome = nomeUnico(`Proposta ${propostas.length + 1}`, nomes);
    novo.inicio_vigencia = proximoJaneiro(estudo.estudo.mes_posicao);
    novo.enquadramento = { tipo: 'mesma_posicao' };
  } else {
    novo.nome = nomeUnico(`${origem.nome} (cópia)`, nomes);
  }
  return novo;
}

/** Tira de `rotulos` espaços e vazios; aceita vírgula, ponto e vírgula ou quebra de linha como separador. */
export function lerRotulos(texto) {
  return String(texto).split(/[\n,;]+/).map((t) => t.trim()).filter((t) => t !== '');
}

const redimensionar = (lista, n, preenchimento) => {
  const nova = lista.slice(0, n);
  while (nova.length < n) nova.push(typeof preenchimento === 'function' ? preenchimento(nova.length) : preenchimento);
  return nova;
};

/** Depois de mudar rótulos: ajusta tabelas digitadas e listas de percentuais ao novo tamanho dos eixos. */
export function ajustarRegras(regras) {
  const n1 = regras.eixos[0].rotulos.length;
  const n2 = regras.eixos[1].rotulos.length;
  for (const v of regras.versoes) {
    if (v.modo === 'digitada' && Array.isArray(v.valores)) {
      v.valores = redimensionar(v.valores.map((l) => (Array.isArray(l) ? redimensionar(l, n2, '') : redimensionar([], n2, ''))), n1,
        () => redimensionar([], n2, ''));
    } else if (v.modo === 'gerador' && v.gerador) {
      for (const [chave, n] of [['pct_eixo1', n1], ['pct_eixo2', n2]]) {
        const spec = v.gerador[chave];
        if (spec && Array.isArray(spec.lista)) spec.lista = redimensionar(spec.lista, Math.max(0, n - 1), '0');
      }
    }
  }
  return regras;
}

/** Texto colado do Excel (tabulação ou ponto e vírgula entre colunas, quebra de linha entre linhas). */
export function lerColado(texto) {
  const linhas = String(texto).replace(/\r/g, '').split('\n');
  while (linhas.length && linhas[linhas.length - 1] === '') linhas.pop();
  return linhas.map((l) => l.split(l.includes('\t') ? '\t' : ';').map((c) => c.trim()));
}

/** Tabela resultante de uma versão: { ok: true, matriz: centavos[n1][n2] } | { ok: false, mensagem }. */
export function tabelaDaVersao(versao, eixos) {
  try {
    return { ok: true, matriz: gerarTabela(versao, eixos) };
  } catch (e) {
    return { ok: false, mensagem: e?.erros?.[0]?.mensagem ?? 'Não foi possível montar a tabela com os dados atuais.' };
  }
}

/**
 * Compara a tabela calculada com a publicada (texto de células, mesmas dimensões), com a tolerância em centavos.
 * Retorna { celulas: [{i, j, gerado, publicado, diferenca, dentro}], fora, invalidas }.
 */
export function compararComPublicada(matriz, publicada, toleranciaCentavos) {
  const celulas = [];
  let fora = 0;
  let invalidas = 0;
  for (let i = 0; i < matriz.length; i++) {
    for (let j = 0; j < matriz[i].length; j++) {
      const bruto = campoParaDecimal(publicada[i]?.[j] ?? '');
      if (!dinheiroValido(bruto)) {
        invalidas++;
        celulas.push({ i, j, gerado: matriz[i][j], publicado: null, diferenca: null, dentro: false });
        continue;
      }
      const pub = Number(centavosDeTexto(bruto));
      const dif = matriz[i][j] - pub;
      const dentro = Math.abs(dif) <= toleranciaCentavos;
      if (!dentro) fora++;
      celulas.push({ i, j, gerado: matriz[i][j], publicado: pub, diferenca: dif, dentro });
    }
  }
  return { celulas, fora, invalidas };
}

/** Converte a matriz em centavos para a lista de linhas de texto do formato ("2135.64"). */
export function matrizParaValores(matriz) {
  return matriz.map((l) => l.map((c) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`));
}

/** Próximo id de trilha ("t1", "t2"...), único no cenário. */
export function idTrilha(regras) {
  const usados = new Set(regras.trilhas.map((t) => t.id));
  for (let i = 1; i < 10; i++) if (!usados.has(`t${i}`)) return `t${i}`;
  return `t${novoId().slice(0, 4)}`;
}

export function trilhaNova(regras, eixo) {
  return {
    id: idTrilha(regras), eixo, passos: 1, intersticio_meses: 12, taxa_exito: '100', atraso_efeito_meses: 0,
    regra_posicao_outro_eixo: 'manter',
  };
}

/** Versão nova a partir de outra: mesmo conteúdo, início 12 meses depois da última versão. */
export function versaoDuplicada(regras, origem) {
  const v = copia(origem);
  const ultimo = regras.versoes.map((x) => x.inicio_vigencia).filter(mesValido).sort().pop();
  v.inicio_vigencia = ultimo ? somarMeses(ultimo, 12) : origem.inicio_vigencia;
  return v;
}

/** Id de cenário/carreira usado nos elementos da tela. */
export const rotuloPosicao = (eixo1, eixo2) => `${eixo1}-${eixo2}`;
