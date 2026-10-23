// Constantes do motor de cálculo (demanda #9). Módulo puro: sem DOM, sem Firebase, sem relógio, sem aleatoriedade.

/** Componentes de custo, na ordem de exibição (visão geral, seção 5.2). */
export const COMPONENTES = Object.freeze(["vencimento", "parcelas", "decimo_terceiro", "terco_ferias", "encargos", "total"]);

export const FORMATO = "simulador-carreiras/estudo";
export const VERSAO_FORMATO = 1;
export const VERSAO_ESPECIFICACAO = "2026-10-23";

/** Casas decimais com que se guarda r^(t-1), o fator de permanência (ADR 0001, decisão N3). */
export const CASAS_FATOR = 40;

/**
 * Tetos de tamanho e de contagem. Parecer de segurança da G2 (MS-1, item 6) pede que existam tetos;
 * os valores são `[HIPÓTESE]` do parecer, aqui fixados pelo data-bi-engineer e documentados em
 * docs/dados/modelo-parametros.md, seção 15.
 */
export const LIMITES = Object.freeze({
  bytesArquivo: 10 * 1024 * 1024,
  profundidadeJson: 20,
  carreiras: 20,
  cenariosPorCarreira: 10,
  versoes: 20,
  rotulosPorEixo: 60,
  trilhas: 2, // no máximo uma por eixo
  parcelas: 20,
  codigosPorParcela: 200,
  revisoesGerais: 60,
  mapaDepara: 3600,
  linhasBase: 5000,
  quantidadeMax: 100000,
  tempoServicoMax: 720,
  mesesCumpridosMax: 100000,
  exerciciosMin: 3,
  exerciciosMax: 30,
  mesesHorizonte: 720,
  passosMax: 100,
  intersticioMax: 1200,
  atrasoMax: 120,
  blocoMesesMax: 720,
  maxBlocosMax: 100,
  parcelaFixaMaxCentavos: 100000000n, // R$ 1.000.000,00
  celulaMaxCentavos: 99999999999n, // R$ 999.999.999,99 (mesma faixa do formato do dinheiro)
  anoMin: 2000,
  anoMax: 2200,
  nome: 80,
  nomeEixo: 40,
  rotulo: 30,
  codigoTitulacao: 20,
  nomeParcela: 60,
  notas: 2000,
  errosRelatados: 500,
});

/** Chaves que nunca podem aparecer em objetos vindos de arquivo ou do banco (poluição de protótipo, CWE-1321). */
export const CHAVES_PROIBIDAS = Object.freeze(new Set(["__proto__", "constructor", "prototype"]));

/** Colunas da planilha da base (docs/dados/planilha-base.md, seção 2). */
export const COLUNAS_PLANILHA = Object.freeze([
  "codigo_registro", "carreira", "carga_horaria", "posicao_eixo1", "posicao_eixo2",
  "meses_cumpridos_eixo1", "meses_cumpridos_eixo2", "quantidade", "mes_posicao", "tipo_dados",
  "tempo_servico_meses", "titulacao", "valor_parcela_fixa",
]);
export const COLUNAS_OBRIGATORIAS = Object.freeze(["codigo_registro", "carreira", "posicao_eixo1", "posicao_eixo2", "mes_posicao", "tipo_dados"]);

/** Colunas da base dentro do JSON v1 (carreira, mes_posicao e tipo_dados ficam implícitos; visão geral, seção 4, regra 2). */
export const COLUNAS_BASE_JSON = Object.freeze([
  "codigo_registro", "carga_horaria", "posicao_eixo1", "posicao_eixo2", "meses_cumpridos_eixo1",
  "meses_cumpridos_eixo2", "quantidade", "tempo_servico_meses", "titulacao", "valor_parcela_fixa",
]);
export const COLUNAS_OBRIGATORIAS_JSON = Object.freeze(["codigo_registro", "posicao_eixo1", "posicao_eixo2"]);

/** Termos de identificação direta proibidos em nomes de coluna (planilha-base.md, seção 4). */
export const TERMOS_PROIBIDOS = Object.freeze([
  "nome", "cpf", "matricula", "nascimento", "endereco", "email", "telefone", "celular", "rg", "pis", "nis",
  "lotacao", "mae", "pai", "conjuge", "dependente", "cep", "bairro", "cidade", "foto", "idade",
]);

export const TIPOS_DADOS = Object.freeze(["ficticio", "real_anonimizado"]);
/** Limiar de aviso de reidentificação (planilha-base.md, seção 6; `[HIPÓTESE]`). */
export const K_MINIMO = 3;

/** Códigos estáveis de erro e aviso (visão geral, seção 5.6, mais os acrescentados pelo data-bi-engineer). */
export const CODIGOS = Object.freeze({
  erros: [
    "JSON_INVALIDO", "ARQUIVO_GRANDE_DEMAIS", "JSON_PROFUNDO_DEMAIS", "FORMATO_DESCONHECIDO", "VERSAO_NAO_SUPORTADA",
    "CAMPO_PROIBIDO", "CAMPO_DESCONHECIDO", "CAMPO_AUSENTE", "FORMATO_INVALIDO", "TEXTO_INVALIDO", "VALOR_FORA_DO_LIMITE",
    "VALOR_DUPLICADO", "TIPO_DADOS_DIVERGENTE", "SEM_VERSAO_VIGENTE", "POSICAO_INEXISTENTE", "CONTADOR_ACIMA_DO_CICLO",
    "TRILHA_INVALIDA", "GERADOR_INVALIDO", "ENQUADRAMENTO_INVALIDO", "VIGENCIA_INVALIDA", "PRIMEIRA_PARCELA_13_EXCEDE",
    "FERIAS_NAO_SOMAM_100", "HORIZONTE_INVALIDO", "BASE_VAZIA", "CODIGO_REGISTRO_INVALIDO", "CSV_INVALIDO",
    "TITULACAO_INEXISTENTE", "RESULTADO_GRANDE_DEMAIS", "ERRO_INTERNO",
  ],
  avisos: [
    "GRUPO_PEQUENO", "POSICAO_NO_TOPO", "PRIMEIRO_MAIOR_SEM_DESTINO", "ENQUADRAMENTO_SEM_DESTINO",
    "ENQUADRAMENTO_REDUZ_VALOR", "LINHAS_AGRUPADAS", "ESPECIFICACAO_DIFERENTE", "BASE_VAZIA", "ERROS_OMITIDOS",
  ],
});

/** Erro com lista estruturada, lançado pelo motor quando não há como calcular. */
export class ErroMotor extends Error {
  constructor(erros) {
    const lista = Array.isArray(erros) ? erros : [erros];
    super(lista.length ? lista[0].mensagem : "erro do motor");
    this.name = "ErroMotor";
    this.erros = lista;
  }
}
