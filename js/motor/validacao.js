// Validação do estudo no formato JSON v1 (docs/dados/modelo-parametros.md, seções 2 a 13; visão geral, seção 4;
// parecer de segurança da G2, MS-1, itens 4 a 6). Entrada hostil: arquivo importado e texto lido do Firestore.
// Regras: lista de campos permitidos em cada nível; tetos de contagem; decimais só depois da expressão regular;
// consultas por rótulo e código só com `Map`/`Set` (nunca `objeto[texto]`).
import { validarCelulas, contextoBase } from "./base.js";
import {
  CHAVES_PROIBIDAS, COLUNAS_BASE_JSON, COLUNAS_OBRIGATORIAS_JSON, FORMATO, LIMITES, TIPOS_DADOS,
  VERSAO_ESPECIFICACAO, VERSAO_FORMATO,
} from "./constantes.js";
import {
  centavosDeTexto, dinheiroValido, indiceMes, mesValido, microPercentual, percentualValido, textoMes,
} from "./numero.js";
import { Coletor, citar, iniciaComoFormula, temCaractereInvalido } from "./texto.js";

const RE_ID_CARREIRA = /^[a-z0-9]{12}$/;
const RE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const RE_CODIGO_TIT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$/;
const RE_DATA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
const MICRO = 1000000;

function ehObjeto(v) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

/** Contexto de uma validação: coletores de erros e avisos e utilitários por tipo de campo. */
class Validador {
  constructor() {
    this.erros = new Coletor(LIMITES.errosRelatados);
    this.avisos = new Coletor(LIMITES.errosRelatados);
  }
  erro(codigo, mensagem, caminho) {
    this.erros.add({ codigo, mensagem, caminho });
  }
  aviso(codigo, mensagem, caminho) {
    this.avisos.add({ codigo, mensagem, caminho });
  }

  /** Confere que `v` é objeto e que só tem chaves permitidas; as obrigatórias precisam existir. */
  objeto(v, caminho, permitidas, obrigatorias = permitidas) {
    if (!ehObjeto(v)) {
      this.erro("FORMATO_INVALIDO", `${caminho || "(raiz)"}: deve ser um objeto.`, caminho);
      return false;
    }
    let ok = true;
    const ok_ = new Set(permitidas);
    for (const k of Object.keys(v)) {
      if (CHAVES_PROIBIDAS.has(k)) {
        this.erro("CAMPO_PROIBIDO", `${caminho || "(raiz)"}: a chave ${citar(k)} não é aceita.`, caminho);
        ok = false;
      } else if (!ok_.has(k)) {
        this.erro("CAMPO_DESCONHECIDO", `${caminho || "(raiz)"}: campo desconhecido ${citar(k)}.`, caminho);
        ok = false;
      }
    }
    for (const k of obrigatorias) {
      if (!Object.hasOwn(v, k)) {
        this.erro("CAMPO_AUSENTE", `${caminho || "(raiz)"}: falta o campo "${k}".`, caminho);
        ok = false;
      }
    }
    return ok;
  }
  lista(v, caminho, min, max) {
    if (!Array.isArray(v)) {
      this.erro("FORMATO_INVALIDO", `${caminho}: deve ser uma lista.`, caminho);
      return false;
    }
    if (v.length < min || v.length > max) {
      this.erro("VALOR_FORA_DO_LIMITE", `${caminho}: a lista deve ter de ${min} a ${max} itens (tem ${v.length}).`, caminho);
      return false;
    }
    return true;
  }
  booleano(v, caminho) {
    if (typeof v === "boolean") return true;
    this.erro("FORMATO_INVALIDO", `${caminho}: deve ser verdadeiro ou falso.`, caminho);
    return false;
  }
  inteiro(v, caminho, min, max) {
    if (typeof v !== "number" || !Number.isSafeInteger(v)) {
      this.erro("FORMATO_INVALIDO", `${caminho}: deve ser um número inteiro.`, caminho);
      return false;
    }
    if (v < min || v > max) {
      this.erro("VALOR_FORA_DO_LIMITE", `${caminho}: deve estar entre ${min} e ${max} (valor ${v}).`, caminho);
      return false;
    }
    return true;
  }
  /** Texto livre ou rótulo. `rotulo`: sem espaços nas pontas e sem caractere de fórmula no início. */
  texto(v, caminho, max, { rotulo = true, permitirQuebra = false, min = 1 } = {}) {
    if (typeof v !== "string") {
      this.erro("FORMATO_INVALIDO", `${caminho}: deve ser texto.`, caminho);
      return false;
    }
    if (v.length < min || v.length > max) {
      this.erro("VALOR_FORA_DO_LIMITE", `${caminho}: o texto deve ter de ${min} a ${max} caracteres.`, caminho);
      return false;
    }
    if (temCaractereInvalido(v, permitirQuebra)) {
      this.erro("TEXTO_INVALIDO", `${caminho}: o texto tem caractere de controle, bidirecional ou de largura zero.`, caminho);
      return false;
    }
    if (rotulo) {
      if (v !== v.trim()) {
        this.erro("TEXTO_INVALIDO", `${caminho}: o texto não pode ter espaços no início ou no fim.`, caminho);
        return false;
      }
      if (iniciaComoFormula(v)) {
        this.erro("TEXTO_INVALIDO", `${caminho}: o texto não pode começar com =, +, -, @ ou tabulação (seria lido como fórmula numa planilha).`, caminho);
        return false;
      }
    }
    return true;
  }
  mes(v, caminho) {
    if (!mesValido(v)) {
      this.erro("FORMATO_INVALIDO", `${caminho}: use o formato AAAA-MM (mês de 01 a 12).`, caminho);
      return false;
    }
    const ano = Number(v.slice(0, 4));
    if (ano < LIMITES.anoMin || ano > LIMITES.anoMax) {
      this.erro("VALOR_FORA_DO_LIMITE", `${caminho}: o ano deve estar entre ${LIMITES.anoMin} e ${LIMITES.anoMax}.`, caminho);
      return false;
    }
    return true;
  }
  dinheiro(v, caminho, { positivo = false } = {}) {
    if (!dinheiroValido(v)) {
      this.erro("FORMATO_INVALIDO", `${caminho}: use um valor em reais como texto, com ponto e até 2 casas (ex.: "2135.64").`, caminho);
      return false;
    }
    if (positivo && centavosDeTexto(v) === 0n) {
      this.erro("VALOR_FORA_DO_LIMITE", `${caminho}: o valor deve ser maior que zero.`, caminho);
      return false;
    }
    return true;
  }
  /** Percentual em texto, entre `min` e `max` (em %). `exclusivoMin`: o mínimo não vale (ex.: maior que 0). */
  percentual(v, caminho, min, max, { exclusivoMin = false } = {}) {
    if (!percentualValido(v)) {
      this.erro("FORMATO_INVALIDO", `${caminho}: use um percentual como texto, com ponto e até 6 casas (ex.: "2.5").`, caminho);
      return false;
    }
    const m = microPercentual(v);
    if (m < min * MICRO || m > max * MICRO || (exclusivoMin && m === min * MICRO)) {
      const faixa = exclusivoMin ? `maior que ${min} e no máximo ${max}` : `entre ${min} e ${max}`;
      this.erro("VALOR_FORA_DO_LIMITE", `${caminho}: o percentual deve ser ${faixa} (valor ${v}).`, caminho);
      return false;
    }
    return true;
  }
  enumeracao(v, caminho, valores) {
    if (typeof v === "string" && valores.includes(v)) return true;
    this.erro("FORMATO_INVALIDO", `${caminho}: use um destes valores: ${valores.join(", ")}.`, caminho);
    return false;
  }
}

// ------------------------------------------------------------------------------------------- estudo

function validarEstudoBloco(V, e, caminho) {
  const chaves = ["nome", "mes_posicao", "exercicios", "revisoes_gerais", "encargos_patronais", "taxa_saida_anual",
    "tolerancia_conferencia", "decimo_terceiro", "ferias_terco", "encargos_incidem", "fixa_integra_remuneracao", "notas"];
  if (!V.objeto(e, caminho, chaves)) return;
  V.texto(e.nome, `${caminho}.nome`, LIMITES.nome);
  V.mes(e.mes_posicao, `${caminho}.mes_posicao`);
  if (typeof e.exercicios === "number" && Number.isSafeInteger(e.exercicios) && (e.exercicios < LIMITES.exerciciosMin || e.exercicios > LIMITES.exerciciosMax)) {
    V.erro("HORIZONTE_INVALIDO", `${caminho}.exercicios: o horizonte deve ter de ${LIMITES.exerciciosMin} a ${LIMITES.exerciciosMax} exercícios (valor ${e.exercicios}).`, `${caminho}.exercicios`);
  } else V.inteiro(e.exercicios, `${caminho}.exercicios`, LIMITES.exerciciosMin, LIMITES.exerciciosMax);
  if (V.lista(e.revisoes_gerais, `${caminho}.revisoes_gerais`, 0, LIMITES.revisoesGerais)) {
    const vistos = new Set();
    e.revisoes_gerais.forEach((r, i) => {
      const c = `${caminho}.revisoes_gerais[${i}]`;
      if (!V.objeto(r, c, ["mes", "percentual"])) return;
      if (V.mes(r.mes, `${c}.mes`)) {
        if (vistos.has(r.mes)) V.erro("VALOR_DUPLICADO", `${c}.mes: já existe revisão geral em ${r.mes}.`, `${c}.mes`);
        vistos.add(r.mes);
      }
      V.percentual(r.percentual, `${c}.percentual`, -50, 100);
    });
  }
  V.percentual(e.encargos_patronais, `${caminho}.encargos_patronais`, 0, 100);
  V.percentual(e.taxa_saida_anual, `${caminho}.taxa_saida_anual`, 0, 50);
  if (V.dinheiro(e.tolerancia_conferencia, `${caminho}.tolerancia_conferencia`) && centavosDeTexto(e.tolerancia_conferencia) > 100n) {
    V.erro("VALOR_FORA_DO_LIMITE", `${caminho}.tolerancia_conferencia: no máximo R$ 1,00.`, `${caminho}.tolerancia_conferencia`);
  }
  V.booleano(e.fixa_integra_remuneracao, `${caminho}.fixa_integra_remuneracao`);
  if (typeof e.notas === "string") V.texto(e.notas, `${caminho}.notas`, LIMITES.notas, { rotulo: false, permitirQuebra: true, min: 0 });
  else V.erro("FORMATO_INVALIDO", `${caminho}.notas: deve ser texto.`, `${caminho}.notas`);

  // 13º salário
  const cd = `${caminho}.decimo_terceiro`;
  if (V.objeto(e.decimo_terceiro, cd, ["ativo", "mes_primeira_parcela", "pct_primeira_parcela"])) {
    const d = e.decimo_terceiro;
    const okAtivo = V.booleano(d.ativo, `${cd}.ativo`);
    const okPct = V.percentual(d.pct_primeira_parcela, `${cd}.pct_primeira_parcela`, 0, 100, { exclusivoMin: true });
    if (d.mes_primeira_parcela !== null) {
      const okMes = V.inteiro(d.mes_primeira_parcela, `${cd}.mes_primeira_parcela`, 1, 11);
      if (okAtivo && d.ativo && okMes && okPct && microPercentual(d.pct_primeira_parcela) * 12 > d.mes_primeira_parcela * 100 * MICRO) {
        V.erro("PRIMEIRA_PARCELA_13_EXCEDE",
          `${cd}.pct_primeira_parcela: a 1ª parcela (${d.pct_primeira_parcela}%) passa de ${d.mes_primeira_parcela}/12 da remuneração; com 1ª parcela no mês ${d.mes_primeira_parcela} o máximo é ${(d.mes_primeira_parcela * 100 / 12).toFixed(2)}%.`,
          `${cd}.pct_primeira_parcela`);
      }
    }
  }
  // 1/3 de férias
  const cf = `${caminho}.ferias_terco`;
  if (V.objeto(e.ferias_terco, cf, ["ativo", "distribuicao", "meses"])) {
    const f = e.ferias_terco;
    V.booleano(f.ativo, `${cf}.ativo`);
    const okDist = V.enumeracao(f.distribuicao, `${cf}.distribuicao`, ["uniforme", "concentrada"]);
    if (V.lista(f.meses, `${cf}.meses`, 0, 12)) {
      if (okDist && f.distribuicao === "uniforme" && f.meses.length > 0) {
        V.erro("VALOR_FORA_DO_LIMITE", `${cf}.meses: na distribuição uniforme a lista de meses deve ficar vazia.`, `${cf}.meses`);
      }
      let soma = 0;
      let todos = true;
      const vistos = new Set();
      f.meses.forEach((m, i) => {
        const c = `${cf}.meses[${i}]`;
        if (!V.objeto(m, c, ["mes", "percentual"])) {
          todos = false;
          return;
        }
        if (!V.inteiro(m.mes, `${c}.mes`, 1, 12)) todos = false;
        else {
          if (vistos.has(m.mes)) {
            V.erro("VALOR_DUPLICADO", `${c}.mes: o mês ${m.mes} aparece mais de uma vez.`, `${c}.mes`);
            todos = false;
          }
          vistos.add(m.mes);
        }
        if (V.percentual(m.percentual, `${c}.percentual`, 0, 100)) soma += microPercentual(m.percentual);
        else todos = false;
      });
      if (okDist && f.distribuicao === "concentrada" && todos && f.ativo === true) {
        if (f.meses.length === 0 || soma !== 100 * MICRO) {
          V.erro("FERIAS_NAO_SOMAM_100", `${cf}.meses: os percentuais das férias devem somar 100% (somam ${(soma / MICRO).toFixed(6).replace(/\.?0+$/, "")}%).`, `${cf}.meses`);
        }
      }
    }
  }
  const ci = `${caminho}.encargos_incidem`;
  if (V.objeto(e.encargos_incidem, ci, ["decimo_terceiro", "terco_ferias"])) {
    V.booleano(e.encargos_incidem.decimo_terceiro, `${ci}.decimo_terceiro`);
    V.booleano(e.encargos_incidem.terco_ferias, `${ci}.terco_ferias`);
  }
}

// ------------------------------------------------------------------------------------------- regras do cenário

function validarEixos(V, eixos, caminho) {
  const info = [null, null];
  if (!V.lista(eixos, caminho, 2, 2)) return null;
  for (let k = 0; k < 2; k++) {
    const c = `${caminho}[${k}]`;
    if (!V.objeto(eixos[k], c, ["nome", "rotulos"])) return null;
    V.texto(eixos[k].nome, `${c}.nome`, LIMITES.nomeEixo);
    if (!V.lista(eixos[k].rotulos, `${c}.rotulos`, 1, LIMITES.rotulosPorEixo)) return null;
    const vistos = new Set();
    let ok = true;
    eixos[k].rotulos.forEach((r, i) => {
      if (!V.texto(r, `${c}.rotulos[${i}]`, LIMITES.rotulo)) ok = false;
      else if (vistos.has(r)) {
        V.erro("VALOR_DUPLICADO", `${c}.rotulos[${i}]: o rótulo ${citar(r)} se repete no eixo.`, `${c}.rotulos[${i}]`);
        ok = false;
      }
      vistos.add(r);
    });
    if (!ok) return null;
    info[k] = eixos[k].rotulos;
  }
  return info;
}

function validarPctEixo(V, spec, caminho, n, rotulosOutro, aceitaFaixas) {
  if (!ehObjeto(spec)) {
    V.erro("GERADOR_INVALIDO", `${caminho}: informe constante, lista ou faixas.`, caminho);
    return;
  }
  const chaves = Object.keys(spec);
  if (chaves.length !== 1 || !["constante", "lista", "faixas"].includes(chaves[0])) {
    if (chaves.some((k) => CHAVES_PROIBIDAS.has(k))) V.erro("CAMPO_PROIBIDO", `${caminho}: chave não aceita.`, caminho);
    else V.erro("GERADOR_INVALIDO", `${caminho}: informe exatamente uma destas formas: constante, lista ou faixas.`, caminho);
    return;
  }
  const faixaPct = (v, c) => V.percentual(v, c, -50, 100);
  if (chaves[0] === "constante") faixaPct(spec.constante, `${caminho}.constante`);
  else if (chaves[0] === "lista") {
    if (!Array.isArray(spec.lista) || spec.lista.length !== n - 1) {
      V.erro("GERADOR_INVALIDO", `${caminho}.lista: deve ter ${n - 1} percentuais (um por passo entre posições).`, `${caminho}.lista`);
      return;
    }
    spec.lista.forEach((p, i) => faixaPct(p, `${caminho}.lista[${i}]`));
  } else {
    if (!aceitaFaixas) {
      V.erro("GERADOR_INVALIDO", `${caminho}: faixas só valem para o eixo 2 (percentual por faixa de posições do eixo 1).`, caminho);
      return;
    }
    if (!V.lista(spec.faixas, `${caminho}.faixas`, 1, LIMITES.rotulosPorEixo)) return;
    const idx = new Map(rotulosOutro.map((r, i) => [r, i]));
    const cobertura = new Array(rotulosOutro.length).fill(0);
    spec.faixas.forEach((f, i) => {
      const c = `${caminho}.faixas[${i}]`;
      if (!V.objeto(f, c, ["de", "ate", "percentual"])) return;
      faixaPct(f.percentual, `${c}.percentual`);
      const a = typeof f.de === "string" ? idx.get(f.de) : undefined;
      const b = typeof f.ate === "string" ? idx.get(f.ate) : undefined;
      if (a === undefined) V.erro("POSICAO_INEXISTENTE", `${c}.de: rótulo inexistente no eixo 1 (${citar(f.de)}).`, `${c}.de`);
      if (b === undefined) V.erro("POSICAO_INEXISTENTE", `${c}.ate: rótulo inexistente no eixo 1 (${citar(f.ate)}).`, `${c}.ate`);
      if (a !== undefined && b !== undefined) {
        if (a > b) V.erro("GERADOR_INVALIDO", `${c}: a faixa começa depois de onde termina.`, c);
        else for (let k = a; k <= b; k++) cobertura[k]++;
      }
    });
    cobertura.forEach((q, k) => {
      if (q !== 1) V.erro("GERADOR_INVALIDO", `${caminho}.faixas: a posição ${citar(rotulosOutro[k])} do eixo 1 deve estar em exatamente uma faixa (está em ${q}).`, `${caminho}.faixas`);
    });
  }
}

function validarVersoes(V, versoes, caminho, info) {
  if (!V.lista(versoes, caminho, 1, LIMITES.versoes)) return null;
  const inicios = new Set();
  const lista = [];
  versoes.forEach((v, i) => {
    const c = `${caminho}[${i}]`;
    if (!V.objeto(v, c, ["inicio_vigencia", "referencia_valores", "carga_horaria", "modo", "gerador", "valores"],
      ["inicio_vigencia", "referencia_valores", "carga_horaria", "modo"])) return;
    const okIni = V.mes(v.inicio_vigencia, `${c}.inicio_vigencia`);
    V.mes(v.referencia_valores, `${c}.referencia_valores`);
    if (v.carga_horaria !== null) {
      V.erro("VALOR_FORA_DO_LIMITE", `${c}.carga_horaria: tabela por carga horária ainda não é suportada pelo motor; deixe nulo e use uma carreira para cada carga horária.`, `${c}.carga_horaria`);
    }
    if (okIni) {
      if (inicios.has(v.inicio_vigencia)) V.erro("VALOR_DUPLICADO", `${c}.inicio_vigencia: já existe versão que começa em ${v.inicio_vigencia}.`, `${c}.inicio_vigencia`);
      inicios.add(v.inicio_vigencia);
      lista.push(v.inicio_vigencia);
    }
    if (!V.enumeracao(v.modo, `${c}.modo`, ["digitada", "gerador"])) return;
    const outro = v.modo === "digitada" ? "gerador" : "valores";
    if (Object.hasOwn(v, outro) && v[outro] !== null) V.erro("CAMPO_DESCONHECIDO", `${c}.${outro}: não se usa no modo "${v.modo}".`, `${c}.${outro}`);
    if (!info) return;
    if (v.modo === "digitada") {
      if (!Object.hasOwn(v, "valores")) return V.erro("CAMPO_AUSENTE", `${c}: falta o campo "valores".`, c);
      const [r1, r2] = info;
      if (!Array.isArray(v.valores) || v.valores.length !== r1.length) {
        return V.erro("FORMATO_INVALIDO", `${c}.valores: deve ter ${r1.length} linhas (uma por posição do eixo 1).`, `${c}.valores`);
      }
      v.valores.forEach((linha, a) => {
        if (!Array.isArray(linha) || linha.length !== r2.length) {
          return V.erro("FORMATO_INVALIDO", `${c}.valores[${a}]: deve ter ${r2.length} valores (um por posição do eixo 2).`, `${c}.valores[${a}]`);
        }
        linha.forEach((x, b) => V.dinheiro(x, `${c}.valores[${a}][${b}]`, { positivo: true }));
      });
    } else {
      if (!Object.hasOwn(v, "gerador")) return V.erro("CAMPO_AUSENTE", `${c}: falta o campo "gerador".`, c);
      const cg = `${c}.gerador`;
      if (!V.objeto(v.gerador, cg, ["valor_base", "pct_eixo1", "pct_eixo2"])) return;
      V.dinheiro(v.gerador.valor_base, `${cg}.valor_base`, { positivo: true });
      validarPctEixo(V, v.gerador.pct_eixo1, `${cg}.pct_eixo1`, info[0].length, info[1], false);
      validarPctEixo(V, v.gerador.pct_eixo2, `${cg}.pct_eixo2`, info[1].length, info[0], true);
    }
  });
  return lista;
}

function validarTrilhas(V, trilhas, caminho) {
  const ids = new Map();
  if (!V.lista(trilhas, caminho, 0, LIMITES.trilhas)) return ids;
  const eixos = new Set();
  trilhas.forEach((t, i) => {
    const c = `${caminho}[${i}]`;
    if (!ehObjeto(t)) return V.erro("FORMATO_INVALIDO", `${c}: deve ser um objeto.`, c);
    if (!Object.hasOwn(t, "eixo")) V.erro("CAMPO_AUSENTE", `${c}: trilha sem eixo.`, c);
    if (!V.objeto(t, c, ["id", "eixo", "passos", "intersticio_meses", "taxa_exito", "atraso_efeito_meses", "regra_posicao_outro_eixo"],
      ["id", "passos", "intersticio_meses", "taxa_exito", "atraso_efeito_meses", "regra_posicao_outro_eixo"].concat(Object.hasOwn(t, "eixo") ? ["eixo"] : []))) {
      return;
    }
    if (typeof t.id === "string" && RE_ID.test(t.id)) {
      if (ids.has(t.id)) V.erro("VALOR_DUPLICADO", `${c}.id: o id ${citar(t.id)} se repete.`, `${c}.id`);
      ids.set(t.id, i);
    } else V.erro("FORMATO_INVALIDO", `${c}.id: use 1 a 32 caracteres (letras, números, _ ou -), começando por letra ou número.`, `${c}.id`);
    if (V.inteiro(t.eixo, `${c}.eixo`, 1, 2)) {
      if (eixos.has(t.eixo)) V.erro("TRILHA_INVALIDA", `${c}.eixo: só pode haver uma trilha por eixo (o eixo ${t.eixo} já tem uma).`, `${c}.eixo`);
      eixos.add(t.eixo);
    }
    V.inteiro(t.passos, `${c}.passos`, 1, LIMITES.passosMax);
    if (typeof t.intersticio_meses === "number" && Number.isSafeInteger(t.intersticio_meses) && t.intersticio_meses < 1) {
      V.erro("TRILHA_INVALIDA", `${c}.intersticio_meses: o interstício deve ser de pelo menos 1 mês.`, `${c}.intersticio_meses`);
    } else V.inteiro(t.intersticio_meses, `${c}.intersticio_meses`, 1, LIMITES.intersticioMax);
    if (percentualValido(t.taxa_exito) && (microPercentual(t.taxa_exito) < 0 || microPercentual(t.taxa_exito) > 100 * MICRO)) {
      V.erro("TRILHA_INVALIDA", `${c}.taxa_exito: a taxa de êxito deve ficar entre 0% e 100% (valor ${t.taxa_exito}).`, `${c}.taxa_exito`);
    } else V.percentual(t.taxa_exito, `${c}.taxa_exito`, 0, 100);
    V.inteiro(t.atraso_efeito_meses, `${c}.atraso_efeito_meses`, 0, LIMITES.atrasoMax);
    V.enumeracao(t.regra_posicao_outro_eixo, `${c}.regra_posicao_outro_eixo`, ["manter", "primeiro_maior"]);
  });
  return ids;
}

function validarParcelas(V, parcelas, caminho) {
  if (!V.lista(parcelas, caminho, 0, LIMITES.parcelas)) return;
  const codigos = new Set();
  parcelas.forEach((p, i) => {
    const c = `${caminho}[${i}]`;
    if (!ehObjeto(p)) return V.erro("FORMATO_INVALIDO", `${c}: deve ser um objeto.`, c);
    const tipo = p.tipo;
    const base = ["nome", "tipo", "integra_remuneracao"];
    const extra = tipo === "titulacao" ? ["codigos"] : tipo === "tempo" ? ["pct_por_bloco", "bloco_meses", "max_blocos"] : [];
    if (!V.enumeracao(tipo, `${c}.tipo`, ["titulacao", "tempo"])) return;
    if (!V.objeto(p, c, base.concat(extra))) return;
    V.texto(p.nome, `${c}.nome`, LIMITES.nomeParcela);
    V.booleano(p.integra_remuneracao, `${c}.integra_remuneracao`);
    if (tipo === "titulacao") {
      const cc = `${c}.codigos`;
      if (!V.objeto(p.codigos, cc, Object.keys(ehObjeto(p.codigos) ? p.codigos : {}), [])) return;
      const chaves = Object.keys(p.codigos);
      if (chaves.length > LIMITES.codigosPorParcela) {
        return V.erro("VALOR_FORA_DO_LIMITE", `${cc}: no máximo ${LIMITES.codigosPorParcela} códigos por parcela.`, cc);
      }
      for (const cod of chaves) {
        if (CHAVES_PROIBIDAS.has(cod)) continue; // já relatado por `objeto`
        if (!RE_CODIGO_TIT.test(cod)) V.erro("FORMATO_INVALIDO", `${cc}: o código ${citar(cod)} é inválido (1 a 20 caracteres: letras, números, _ ou -, começando por letra ou número).`, cc);
        else if (codigos.has(cod)) V.erro("VALOR_DUPLICADO", `${cc}: o código ${citar(cod)} já existe em outra parcela.`, cc);
        codigos.add(cod);
        V.percentual(p.codigos[cod], `${cc}.${cod}`, 0, 100);
      }
    } else {
      V.percentual(p.pct_por_bloco, `${c}.pct_por_bloco`, 0, 100);
      V.inteiro(p.bloco_meses, `${c}.bloco_meses`, 1, LIMITES.blocoMesesMax);
      V.inteiro(p.max_blocos, `${c}.max_blocos`, 1, LIMITES.maxBlocosMax);
    }
  });
}

function validarEnquadramento(V, enq, caminho, atual, prop) {
  if (!ehObjeto(enq) || !Object.hasOwn(enq, "tipo")) {
    return V.erro("ENQUADRAMENTO_INVALIDO", `${caminho}: informe o tipo de enquadramento.`, caminho);
  }
  if (!V.enumeracao(enq.tipo, `${caminho}.tipo`, ["mesma_posicao", "depara", "menor_valor_igual_ou_maior"])) return;
  if (enq.tipo !== "depara") {
    if (!V.objeto(enq, caminho, ["tipo"])) return;
    if (enq.tipo === "mesma_posicao" && atual && prop) {
      const igual = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
      if (!igual(atual[0], prop[0]) || !igual(atual[1], prop[1])) {
        V.erro("ENQUADRAMENTO_INVALIDO", `${caminho}: "mesma posição" exige os mesmos rótulos, na mesma ordem, nos dois eixos do cenário atual e da proposta.`, caminho);
      }
    }
    return;
  }
  if (!V.objeto(enq, caminho, ["tipo", "mapa"])) return;
  if (!V.lista(enq.mapa, `${caminho}.mapa`, 1, LIMITES.mapaDepara)) return;
  if (!atual || !prop) return;
  const idxA = [new Map(atual[0].map((r, i) => [r, i])), new Map(atual[1].map((r, i) => [r, i]))];
  const idxP = [new Map(prop[0].map((r, i) => [r, i])), new Map(prop[1].map((r, i) => [r, i]))];
  const cobertas = new Set();
  enq.mapa.forEach((m, i) => {
    const c = `${caminho}.mapa[${i}]`;
    if (!V.objeto(m, c, ["de", "para"])) return;
    const par = (v, cc, idx, nome) => {
      if (!Array.isArray(v) || v.length !== 2 || v.some((x) => typeof x !== "string")) {
        V.erro("FORMATO_INVALIDO", `${cc}: informe [rótulo do eixo 1, rótulo do eixo 2].`, cc);
        return null;
      }
      const a = idx[0].get(v[0]);
      const b = idx[1].get(v[1]);
      if (a === undefined || b === undefined) {
        V.erro("POSICAO_INEXISTENTE", `${cc}: posição inexistente ${nome} (${citar(v[0])}, ${citar(v[1])}).`, cc);
        return null;
      }
      return [a, b];
    };
    const de = par(m.de, `${c}.de`, idxA, "no cenário atual");
    par(m.para, `${c}.para`, idxP, "na proposta");
    if (de) {
      const chave = de[0] * 1000 + de[1];
      if (cobertas.has(chave)) V.erro("VALOR_DUPLICADO", `${c}.de: a posição ${citar(m.de[0])}-${citar(m.de[1])} do cenário atual aparece mais de uma vez.`, `${c}.de`);
      cobertas.add(chave);
    }
  });
  const total = atual[0].length * atual[1].length;
  if (cobertas.size !== total) {
    V.erro("ENQUADRAMENTO_INVALIDO", `${caminho}.mapa: o "de-para" deve cobrir todas as ${total} posições do cenário atual (cobre ${cobertas.size}).`, `${caminho}.mapa`);
  }
}

// ------------------------------------------------------------------------------------------- base dentro do JSON

function textoDaCelula(x) {
  if (x === null) return "";
  if (typeof x === "number") return Number.isSafeInteger(x) ? String(x) : null;
  if (typeof x === "string") return x;
  return null;
}

function validarBaseJson(V, doc, carr, caminho, paraCalculo) {
  const base = carr.base;
  if (!V.objeto(base, caminho, ["colunas", "linhas"])) return;
  if (!V.lista(base.colunas, `${caminho}.colunas`, COLUNAS_OBRIGATORIAS_JSON.length, COLUNAS_BASE_JSON.length)) return;
  const pos = new Map();
  let okCol = true;
  base.colunas.forEach((col, i) => {
    if (typeof col !== "string" || !COLUNAS_BASE_JSON.includes(col)) {
      V.erro(typeof col === "string" ? "CAMPO_DESCONHECIDO" : "FORMATO_INVALIDO", `${caminho}.colunas[${i}]: coluna desconhecida ${citar(col)}.`, `${caminho}.colunas[${i}]`);
      okCol = false;
    } else if (pos.has(col)) {
      V.erro("VALOR_DUPLICADO", `${caminho}.colunas[${i}]: a coluna ${citar(col)} se repete.`, `${caminho}.colunas[${i}]`);
      okCol = false;
    } else pos.set(col, i);
  });
  for (const col of COLUNAS_OBRIGATORIAS_JSON) {
    if (!pos.has(col) && okCol) {
      V.erro("CAMPO_AUSENTE", `${caminho}.colunas: falta a coluna obrigatória "${col}".`, `${caminho}.colunas`);
      okCol = false;
    }
  }
  if (!okCol) return;
  if (!V.lista(base.linhas, `${caminho}.linhas`, 0, LIMITES.linhasBase)) return;
  if (base.linhas.length === 0) {
    if (paraCalculo) V.erro("BASE_VAZIA", `${caminho}.linhas: a base da carreira ${citar(carr.nome)} não tem linhas; importe a planilha antes de calcular.`, `${caminho}.linhas`);
    else V.aviso("BASE_VAZIA", `${caminho}.linhas: a base da carreira ${citar(carr.nome)} ainda não tem linhas.`, `${caminho}.linhas`);
    return;
  }
  const ctx = contextoBase(doc, carr.id);
  if (!ctx) return;
  const vistos = new Set();
  base.linhas.forEach((cels, i) => {
    const c = `${caminho}.linhas[${i}]`;
    if (!Array.isArray(cels) || cels.length !== base.colunas.length) {
      return V.erro("FORMATO_INVALIDO", `${c}: a linha deve ter ${base.colunas.length} valores, um por coluna.`, c);
    }
    const textos = new Map();
    let tipoOk = true;
    base.colunas.forEach((col, k) => {
      const t = textoDaCelula(cels[k]);
      if (t === null) {
        V.erro("FORMATO_INVALIDO", `${c}[${k}] (${col}): valor de tipo inválido (use texto, inteiro ou nulo).`, `${c}[${k}]`);
        tipoOk = false;
      } else textos.set(col, t);
    });
    if (!tipoOk) return;
    const v = (col) => textos.get(col) ?? "";
    const caminhoCol = (col) => `${c}[${pos.get(col) ?? 0}]`;
    const r = validarCelulas(ctx, v, (col, cod, msg) => V.erro(cod, `${caminho}.linhas[${i}] (${col}): ${msg}.`, caminhoCol(col)), { checarMeta: false });
    const cod = v("codigo_registro");
    if (vistos.has(cod)) V.erro("VALOR_DUPLICADO", `${caminho}.linhas[${i}] (codigo_registro): código repetido (${citar(cod)}).`, caminhoCol("codigo_registro"));
    vistos.add(cod);
    for (const [col, codigoAviso, msg] of r.avisos) V.aviso(codigoAviso, `${caminho}.linhas[${i}] (${col}): ${msg}.`, caminhoCol(col));
  });
}

// ------------------------------------------------------------------------------------------- horizonte

/**
 * Horizonte do estudo (regras-calculo, seção 2): P = mes_posicao; E0 = ano da menor vigência entre as propostas (ou o
 * ano de P + 1 sem proposta); fim em dezembro de E0 + N - 1. Retorna { P, n, E0, vigencias } ou null se faltar dado.
 */
export function horizonte(doc) {
  const e = doc?.estudo;
  if (!e || !mesValido(e.mes_posicao) || !Number.isSafeInteger(e.exercicios)) return null;
  const P = indiceMes(e.mes_posicao);
  const vigencias = [];
  for (const carr of doc.carreiras ?? []) {
    for (const cen of carr.cenarios ?? []) {
      if (cen.papel === "proposta" && mesValido(cen.inicio_vigencia)) vigencias.push(indiceMes(cen.inicio_vigencia));
    }
  }
  const E0 = vigencias.length ? Math.floor(Math.min(...vigencias) / 12) : Math.floor((P + 1) / 12);
  const n = (E0 + e.exercicios - 1) * 12 + 11 - P;
  return { P, n, E0, vigencias };
}

// ------------------------------------------------------------------------------------------- estudo completo

/**
 * Valida o JSON v1 já lido (objeto). Retorna { ok, erros, avisos }.
 * `paraCalculo`: base vazia vira erro (`calcular` usa isso); sem ele, vira aviso (estudo em edição).
 * Erros e avisos: { codigo, mensagem, caminho } (visão geral, seção 5.6).
 */
export function validarEstudo(doc, { paraCalculo = false } = {}) {
  const V = new Validador();
  const cabecalho = ["formato", "versao_formato", "versao_especificacao", "exportado_em", "tipo_dados", "estudo", "carreiras"];
  if (V.objeto(doc, "", cabecalho)) {
    if (doc.formato !== FORMATO) V.erro("FORMATO_DESCONHECIDO", `formato: o arquivo não é um estudo do simulador-carreiras (esperado "${FORMATO}").`, "formato");
    if (typeof doc.versao_formato !== "number" || !Number.isSafeInteger(doc.versao_formato) || doc.versao_formato < 1 || doc.versao_formato > VERSAO_FORMATO) {
      V.erro("VERSAO_NAO_SUPORTADA", `versao_formato: versão ${typeof doc.versao_formato === "number" ? doc.versao_formato : "inválida"} não suportada (esta versão do simulador lê até a ${VERSAO_FORMATO}).`, "versao_formato");
    }
    if (typeof doc.versao_especificacao !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(doc.versao_especificacao)) {
      V.erro("FORMATO_INVALIDO", "versao_especificacao: use uma data AAAA-MM-DD.", "versao_especificacao");
    } else if (doc.versao_especificacao !== VERSAO_ESPECIFICACAO) {
      V.aviso("ESPECIFICACAO_DIFERENTE", `versao_especificacao: o arquivo usa a especificação de ${doc.versao_especificacao}; esta versão do simulador usa a de ${VERSAO_ESPECIFICACAO}.`, "versao_especificacao");
    }
    if (typeof doc.exportado_em !== "string" || !RE_DATA_HORA.test(doc.exportado_em)) {
      V.erro("FORMATO_INVALIDO", "exportado_em: use data e hora no formato ISO 8601 (ex.: 2026-10-23T14:05:00-03:00).", "exportado_em");
    }
    V.enumeracao(doc.tipo_dados, "tipo_dados", TIPOS_DADOS);
    validarEstudoBloco(V, doc.estudo, "estudo");
    validarCarreiras(V, doc, paraCalculo);
  }
  const erros = V.erros.itens.slice();
  const avisos = V.avisos.itens.slice();
  if (V.erros.omitidos > 0) erros.push({ codigo: "ERROS_OMITIDOS", mensagem: `Mais ${V.erros.omitidos} erros não foram listados.`, caminho: "" });
  if (V.avisos.omitidos > 0) avisos.push({ codigo: "ERROS_OMITIDOS", mensagem: `Mais ${V.avisos.omitidos} avisos não foram listados.`, caminho: "" });
  return { ok: V.erros.total === 0, erros, avisos };
}

function validarCarreiras(V, doc, paraCalculo) {
  if (!V.lista(doc.carreiras, "carreiras", 1, LIMITES.carreiras)) return;
  const idsC = new Set();
  const nomesC = new Set();
  const estudoOk = V.erros.total === 0; // tudo acima estava íntegro?
  const infos = [];
  doc.carreiras.forEach((carr, a) => {
    const c = `carreiras[${a}]`;
    if (!V.objeto(carr, c, ["id", "nome", "base", "cenarios"])) return;
    if (typeof carr.id === "string" && RE_ID_CARREIRA.test(carr.id)) {
      if (idsC.has(carr.id)) V.erro("VALOR_DUPLICADO", `${c}.id: o id ${citar(carr.id)} se repete.`, `${c}.id`);
      idsC.add(carr.id);
    } else V.erro("FORMATO_INVALIDO", `${c}.id: use 12 caracteres [a-z0-9].`, `${c}.id`);
    if (V.texto(carr.nome, `${c}.nome`, LIMITES.nome)) {
      if (nomesC.has(carr.nome)) V.erro("VALOR_DUPLICADO", `${c}.nome: já existe carreira com o nome ${citar(carr.nome)}.`, `${c}.nome`);
      nomesC.add(carr.nome);
    }
    const info = { atual: null, propostas: [], ok: true };
    infos.push(info);
    if (!V.lista(carr.cenarios, `${c}.cenarios`, 1, LIMITES.cenariosPorCarreira)) {
      info.ok = false;
      return;
    }
    const idsCen = new Set();
    const nomesCen = new Set();
    let nAtual = 0;
    carr.cenarios.forEach((cen, b) => {
      const cc = `${c}.cenarios[${b}]`;
      if (!ehObjeto(cen)) return V.erro("FORMATO_INVALIDO", `${cc}: deve ser um objeto.`, cc);
      const proposta = cen.papel === "proposta";
      const permitidas = ["id", "nome", "papel", "regras"].concat(proposta ? ["inicio_vigencia", "enquadramento"] : ["inicio_vigencia", "enquadramento"]);
      const obrig = ["id", "nome", "papel", "regras"].concat(proposta ? ["inicio_vigencia", "enquadramento"] : []);
      if (!V.enumeracao(cen.papel, `${cc}.papel`, ["atual", "proposta"])) return;
      if (!V.objeto(cen, cc, permitidas, obrig)) return;
      if (typeof cen.id === "string" && RE_ID.test(cen.id)) {
        if (idsCen.has(cen.id)) V.erro("VALOR_DUPLICADO", `${cc}.id: o id ${citar(cen.id)} se repete na carreira.`, `${cc}.id`);
        idsCen.add(cen.id);
      } else V.erro("FORMATO_INVALIDO", `${cc}.id: use 1 a 32 caracteres (letras, números, _ ou -), começando por letra ou número.`, `${cc}.id`);
      if (V.texto(cen.nome, `${cc}.nome`, LIMITES.nome)) {
        if (nomesCen.has(cen.nome)) V.erro("VALOR_DUPLICADO", `${cc}.nome: já existe cenário com o nome ${citar(cen.nome)} nesta carreira.`, `${cc}.nome`);
        nomesCen.add(cen.nome);
      }
      if (!proposta) {
        nAtual++;
        if ((Object.hasOwn(cen, "inicio_vigencia") && cen.inicio_vigencia !== null) || (Object.hasOwn(cen, "enquadramento") && cen.enquadramento !== null)) {
          V.erro("CAMPO_DESCONHECIDO", `${cc}: o cenário atual não tem início de vigência nem enquadramento.`, cc);
        }
      } else V.mes(cen.inicio_vigencia, `${cc}.inicio_vigencia`);
      const cr = `${cc}.regras`;
      let eixosInfo = null;
      let versoesInicios = null;
      if (V.objeto(cen.regras, cr, ["eixos", "versoes", "trilhas", "nao_acumulacao", "parcelas"])) {
        eixosInfo = validarEixos(V, cen.regras.eixos, `${cr}.eixos`);
        versoesInicios = validarVersoes(V, cen.regras.versoes, `${cr}.versoes`, eixosInfo);
        const ids = validarTrilhas(V, cen.regras.trilhas, `${cr}.trilhas`);
        if (V.lista(cen.regras.nao_acumulacao, `${cr}.nao_acumulacao`, 0, LIMITES.trilhas)) {
          const vistos = new Set();
          cen.regras.nao_acumulacao.forEach((id, k) => {
            if (typeof id !== "string" || !ids.has(id)) V.erro("TRILHA_INVALIDA", `${cr}.nao_acumulacao[${k}]: ${citar(id)} não é o id de uma trilha deste cenário.`, `${cr}.nao_acumulacao[${k}]`);
            else if (vistos.has(id)) V.erro("VALOR_DUPLICADO", `${cr}.nao_acumulacao[${k}]: ${citar(id)} se repete.`, `${cr}.nao_acumulacao[${k}]`);
            vistos.add(id);
          });
        }
        validarParcelas(V, cen.regras.parcelas, `${cr}.parcelas`);
      }
      const item = { cen, caminho: cc, eixos: eixosInfo, inicios: versoesInicios };
      if (proposta) info.propostas.push(item);
      else info.atual = item;
    });
    if (nAtual !== 1) {
      V.erro("VALOR_FORA_DO_LIMITE", `${c}.cenarios: a carreira deve ter exatamente um cenário "atual" (tem ${nAtual}).`, `${c}.cenarios`);
      info.ok = false;
    }
    for (const p of info.propostas) {
      validarEnquadramento(V, p.cen.enquadramento, `${p.caminho}.enquadramento`, info.atual?.eixos ?? null, p.eixos);
    }
  });
  // Verificações que dependem do estudo e das regras estarem íntegros.
  if (V.erros.total > 0 || !estudoOk) return;
  const h = horizonte(doc);
  if (h) {
    const P = h.P;
    for (const info of infos) {
      for (const p of info.propostas) {
        const v = indiceMes(p.cen.inicio_vigencia);
        if (v <= P) V.erro("VIGENCIA_INVALIDA", `${p.caminho}.inicio_vigencia: a vigência (${p.cen.inicio_vigencia}) deve ser posterior ao mês da posição (${doc.estudo.mes_posicao}).`, `${p.caminho}.inicio_vigencia`);
      }
    }
    if (V.erros.total === 0) {
      if (h.n < 1 || h.n > LIMITES.mesesHorizonte) {
        V.erro("HORIZONTE_INVALIDO", `estudo.exercicios: o horizonte tem ${h.n} meses; o máximo é ${LIMITES.mesesHorizonte} (aproxime a vigência do mês da posição ou reduza os exercícios).`, "estudo.exercicios");
      } else {
        infos.forEach((info) => {
          const checar = (item, primeiro) => {
            const menor = Math.min(...item.inicios.map(indiceMes));
            if (menor > primeiro) {
              V.erro("SEM_VERSAO_VIGENTE", `${item.caminho}.regras.versoes: o cenário ${citar(item.cen.nome)} não tem versão de tabela vigente em ${textoMes(primeiro)}; a primeira versão começa em ${textoMes(menor)}.`, `${item.caminho}.regras.versoes`);
            }
          };
          checar(info.atual, P + 1);
          for (const p of info.propostas) checar(p, indiceMes(p.cen.inicio_vigencia));
        });
      }
    }
  }
  // A base só é conferida com as regras íntegras (rótulos, trilhas e parcelas servem de referência).
  if (V.erros.total === 0) {
    doc.carreiras.forEach((carr, a) => validarBaseJson(V, doc, carr, `carreiras[${a}].base`, paraCalculo));
  }
}
