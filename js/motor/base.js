// Planilha da base de servidores: leitura de CSV, validação e agrupamento (docs/dados/planilha-base.md; ADR 0001, B1).
// A base não tem dado pessoal: a validação recusa colunas identificadoras e códigos com cara de CPF.
import {
  COLUNAS_OBRIGATORIAS, COLUNAS_PLANILHA, K_MINIMO, LIMITES, TERMOS_PROIBIDOS, TIPOS_DADOS,
} from "./constantes.js";
import { mesValido } from "./numero.js";
import { Coletor, citar, excedeBytes, normalizarColuna } from "./texto.js";

const RE_CODIGO = /^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$/;
const RE_CPF = /^(\d{11}|\d{3}\.?\d{3}\.?\d{3}-?\d{2})$/;
const RE_INTEIRO = /^\d{1,9}$/;
const RE_VALOR = /^\d{1,9}([.,]\d{1,2})?$/;

// ------------------------------------------------------------------------------------------- CSV

/**
 * Lê CSV (UTF-8 com ou sem BOM, separador ";", aspas duplas). Retorna { cabecalho, linhas, numerosLinha, erros }:
 * `linhas` são listas de textos; `numerosLinha[i]` é a linha do arquivo onde começa a linha de dados i (cabeçalho = 1).
 * A decodificação UTF-8 estrita (`TextDecoder` com `fatal`) é da tela (visão geral, seção 6.2).
 */
export function lerCSV(texto) {
  const erros = [];
  const vazio = { cabecalho: [], linhas: [], numerosLinha: [], erros };
  if (typeof texto !== "string") {
    erros.push({ codigo: "CSV_INVALIDO", linha: 0, coluna: "", mensagem: "O conteúdo do arquivo não é texto." });
    return vazio;
  }
  if (excedeBytes(texto, LIMITES.bytesArquivo)) {
    erros.push({ codigo: "ARQUIVO_GRANDE_DEMAIS", linha: 0, coluna: "", mensagem: "O arquivo passa de 10 MB." });
    return vazio;
  }
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  const registros = [];
  const numeros = [];
  let campo = "";
  let reg = [];
  let aspas = false;
  let linhaAtual = 1;
  let inicioReg = 1;
  let temConteudo = false;
  const fecharCampo = () => {
    reg.push(campo);
    campo = "";
  };
  const fecharRegistro = () => {
    fecharCampo();
    if (temConteudo || reg.length > 1 || reg[0] !== "") {
      registros.push(reg);
      numeros.push(inicioReg);
    }
    reg = [];
    temConteudo = false;
  };
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else {
        if (ch === "\n") linhaAtual++;
        campo += ch;
      }
    } else if (ch === '"' && campo === "") {
      aspas = true;
      temConteudo = true;
    } else if (ch === ";") {
      fecharCampo();
      temConteudo = true;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && texto[i + 1] === "\n") i++;
      fecharRegistro();
      linhaAtual++;
      inicioReg = linhaAtual;
    } else {
      campo += ch;
      temConteudo = true;
    }
  }
  if (aspas) {
    erros.push({ codigo: "CSV_INVALIDO", linha: inicioReg, coluna: "", mensagem: `Linha ${inicioReg}: aspas sem fechamento.` });
  }
  if (campo !== "" || reg.length > 0) fecharRegistro();
  if (registros.length === 0) return { cabecalho: [], linhas: [], numerosLinha: [], erros };
  const cabecalho = registros[0].map((c) => c.trim());
  if (cabecalho.length === 1 && /[,\t]/.test(cabecalho[0])) {
    erros.push({
      codigo: "CSV_INVALIDO", linha: 1, coluna: "",
      mensagem: 'Linha 1: o separador de colunas deve ser ponto e vírgula (";"). Salve como "CSV UTF-8" com esse separador.',
    });
  }
  return { cabecalho, linhas: registros.slice(1), numerosLinha: numeros.slice(1), erros };
}

// ------------------------------------------------------------------------------------------- contexto da carreira

/**
 * Dados da carreira que a validação da base consulta. Exige estudo já validado (`validarEstudo`), sem a base.
 * Tabelas de consulta com `Map`: rótulos e códigos vêm do usuário (parecer de segurança, A12).
 */
export function contextoBase(doc, carreiraId) {
  const carr = doc.carreiras.find((c) => c.id === carreiraId);
  if (!carr) return null;
  const atual = carr.cenarios.find((c) => c.papel === "atual");
  if (!atual) return null;
  const eixos = atual.regras.eixos;
  const idx1 = new Map(eixos[0].rotulos.map((r, i) => [r, i]));
  const idx2 = new Map(eixos[1].rotulos.map((r, i) => [r, i]));
  const ciclo = [null, null];
  for (const tr of atual.regras.trilhas) ciclo[tr.eixo - 1] = tr.intersticio_meses + tr.atraso_efeito_meses;
  const codigosTit = new Set();
  let temTempo = false;
  for (const cen of carr.cenarios) {
    for (const p of cen.regras.parcelas) {
      if (p.tipo === "titulacao") for (const c of Object.keys(p.codigos)) codigosTit.add(c);
      else temTempo = true;
    }
  }
  return {
    nome: carr.nome, idx1, idx2, n: [eixos[0].rotulos.length, eixos[1].rotulos.length], ciclo, codigosTit, temTempo,
    mesPosicao: doc.estudo.mes_posicao, tipoDados: doc.tipo_dados,
  };
}

// ------------------------------------------------------------------------------------------- validação de uma linha

/**
 * Valida os textos de uma linha. `v(coluna)` devolve o texto aparado ("" se vazio). `emitir(coluna, codigo, mensagem)`.
 * `linhaNormal` recebe a linha normalizada se não houver erro. Retorna { ok, linha, avisos: [[coluna, codigo, msg]] }.
 */
export function validarCelulas(ctx, v, emitir, { checarMeta = true } = {}) {
  let ok = true;
  const erro = (col, cod, msg) => {
    ok = false;
    emitir(col, cod, msg);
  };
  const avisos = [];
  const codigo = v("codigo_registro");
  if (RE_CPF.test(codigo)) erro("codigo_registro", "CODIGO_REGISTRO_INVALIDO", "o código parece um CPF; use um código sequencial que não identifique a pessoa");
  else if (!RE_CODIGO.test(codigo)) {
    erro("codigo_registro", "CODIGO_REGISTRO_INVALIDO", "use 1 a 20 caracteres: letras, números, '_' ou '-', começando por letra ou número");
  }
  if (checarMeta && v("carreira") !== ctx.nome) erro("carreira", "VALOR_FORA_DO_LIMITE", `deve ser igual ao nome da carreira do estudo (${citar(ctx.nome)})`);
  if (v("carga_horaria") !== "") {
    erro("carga_horaria", "VALOR_FORA_DO_LIMITE", "tabela por carga horária ainda não é suportada pelo motor; deixe vazio e use uma carreira para cada carga horária");
  }
  const pos = [ctx.idx1.get(v("posicao_eixo1")), ctx.idx2.get(v("posicao_eixo2"))];
  if (pos[0] === undefined) erro("posicao_eixo1", "POSICAO_INEXISTENTE", `posição inexistente na carreira (${citar(v("posicao_eixo1"))})`);
  if (pos[1] === undefined) erro("posicao_eixo2", "POSICAO_INEXISTENTE", `posição inexistente na carreira (${citar(v("posicao_eixo2"))})`);
  const meses = [0, 0];
  for (let e = 0; e < 2; e++) {
    const col = `meses_cumpridos_eixo${e + 1}`;
    const t = v(col);
    if (ctx.ciclo[e] !== null) {
      if (!RE_INTEIRO.test(t)) erro(col, "FORMATO_INVALIDO", "informe um número inteiro de meses (0 ou mais)");
      else if (Number(t) > ctx.ciclo[e]) erro(col, "CONTADOR_ACIMA_DO_CICLO", `maior que o ciclo da trilha (${ctx.ciclo[e]} meses)`);
      else meses[e] = Number(t);
    } else if (t !== "" && t !== "0") erro(col, "VALOR_FORA_DO_LIMITE", "a carreira não tem trilha neste eixo; deixe vazio ou 0");
  }
  let q = 1;
  const tq = v("quantidade");
  if (tq !== "") {
    if (!/^\d{1,9}$/.test(tq) || Number(tq) < 1 || Number(tq) > LIMITES.quantidadeMax) {
      erro("quantidade", "VALOR_FORA_DO_LIMITE", `use um inteiro de 1 a ${LIMITES.quantidadeMax}`);
    } else q = Number(tq);
  }
  if (checarMeta) {
    const mp = v("mes_posicao");
    if (!mesValido(mp)) erro("mes_posicao", "FORMATO_INVALIDO", "use o formato AAAA-MM");
    else if (mp !== ctx.mesPosicao) erro("mes_posicao", "VALOR_FORA_DO_LIMITE", `diferente do mês da posição do estudo (${ctx.mesPosicao})`);
    const td = v("tipo_dados");
    if (!TIPOS_DADOS.includes(td)) erro("tipo_dados", "FORMATO_INVALIDO", "use 'ficticio' ou 'real_anonimizado'");
    else if (td !== ctx.tipoDados) erro("tipo_dados", "TIPO_DADOS_DIVERGENTE", `diferente do tipo de dados do estudo (${ctx.tipoDados})`);
  }
  let tempo = null;
  const ts = v("tempo_servico_meses");
  if (ts !== "") {
    if (!RE_INTEIRO.test(ts) || Number(ts) > LIMITES.tempoServicoMax) erro("tempo_servico_meses", "VALOR_FORA_DO_LIMITE", `use um inteiro de 0 a ${LIMITES.tempoServicoMax}`);
    else tempo = Number(ts);
  } else if (ctx.temTempo) erro("tempo_servico_meses", "CAMPO_AUSENTE", "obrigatório: a carreira tem parcela por tempo de serviço");
  const ti = v("titulacao");
  if (ti !== "" && !ctx.codigosTit.has(ti)) erro("titulacao", "TITULACAO_INEXISTENTE", `código sem parcela cadastrada (${citar(ti)})`);
  let fixa = 0;
  const vf = v("valor_parcela_fixa");
  if (vf !== "") {
    if (!RE_VALOR.test(vf)) erro("valor_parcela_fixa", "FORMATO_INVALIDO", "número com até 2 casas decimais, sem separador de milhar");
    else {
      const [inteiro, frac = ""] = vf.replace(",", ".").split(".");
      fixa = Number(inteiro) * 100 + Number((frac + "00").slice(0, 2));
      if (BigInt(fixa) > LIMITES.parcelaFixaMaxCentavos) erro("valor_parcela_fixa", "VALOR_FORA_DO_LIMITE", "acima de R$ 1.000.000,00");
    }
  }
  if (q < K_MINIMO) avisos.push(["quantidade", "GRUPO_PEQUENO", `grupo com menos de ${K_MINIMO} servidores: risco de reidentificação`]);
  for (let e = 0; e < 2; e++) {
    if (ctx.ciclo[e] !== null && pos[e] !== undefined && pos[e] === ctx.n[e] - 1) {
      avisos.push([`posicao_eixo${e + 1}`, "POSICAO_NO_TOPO", "posição já no topo do eixo da trilha: a trilha não terá efeito para esta linha"]);
    }
  }
  const linha = ok
    ? { codigo, p1: v("posicao_eixo1"), p2: v("posicao_eixo2"), c1: meses[0], c2: meses[1], q, tempo, titulacao: ti === "" ? null : ti, fixaCent: fixa }
    : null;
  return { ok, linha, avisos };
}

// ------------------------------------------------------------------------------------------- validarBase (CSV)

/**
 * Valida a planilha da base (recusa total, planilha-base.md, seção 5).
 * `cabecalho`: nomes das colunas; `linhas`: listas de textos; `estudo`: JSON v1 já validado; `carreiraId`: carreira alvo.
 * Retorna { ok, erros, avisos, linhas } com `linhas` normalizadas (vazias se houver erro).
 * Erros: { codigo, linha, coluna, mensagem } (linha do arquivo, cabeçalho = 1).
 */
export function validarBase(cabecalho, linhas, { estudo, carreiraId, numerosLinha } = {}) {
  const erros = new Coletor(LIMITES.errosRelatados);
  const avisos = new Coletor(LIMITES.errosRelatados);
  const E = (linha, coluna, codigo, msg) => {
    const onde = linha ? `Linha ${linha}` : "Arquivo";
    erros.add({ codigo, linha, coluna, mensagem: `${onde}${coluna ? `, coluna ${citar(coluna)}` : ""}: ${msg}.` });
  };
  const fim = () => {
    const lista = erros.itens.slice();
    const av = avisos.itens.slice();
    if (erros.omitidos > 0) lista.push({ codigo: "ERROS_OMITIDOS", linha: 0, coluna: "", mensagem: `Mais ${erros.omitidos} erros não foram listados.` });
    if (avisos.omitidos > 0) av.push({ codigo: "ERROS_OMITIDOS", linha: 0, coluna: "", mensagem: `Mais ${avisos.omitidos} avisos não foram listados.` });
    return { ok: erros.total === 0, erros: lista, avisos: av, linhas: erros.total === 0 ? linhasOk : [] };
  };
  const linhasOk = [];
  const ctx = estudo && Array.isArray(estudo.carreiras) ? contextoBase(estudo, carreiraId) : null;
  if (ctx === null) {
    E(0, "", "CAMPO_AUSENTE", "carreira do estudo não encontrada");
    return fim();
  }
  if (!Array.isArray(cabecalho) || !Array.isArray(linhas)) {
    E(0, "", "CSV_INVALIDO", "cabeçalho e linhas devem ser listas");
    return fim();
  }
  const conhecidas = new Set(COLUNAS_PLANILHA);
  const posicaoColuna = new Map();
  cabecalho.forEach((col, i) => {
    if (typeof col !== "string") return;
    if (conhecidas.has(col)) {
      if (posicaoColuna.has(col)) E(1, col, "VALOR_DUPLICADO", "coluna repetida");
      posicaoColuna.set(col, i);
      return;
    }
    const nc = normalizarColuna(col);
    const proibida = TERMOS_PROIBIDOS.some((p) => p === nc || (p.length > 3 && nc.includes(p)));
    if (proibida) E(1, col, "CAMPO_PROIBIDO", "campo identificador proibido");
    else E(1, col, "CAMPO_DESCONHECIDO", "coluna desconhecida (a importação aceita só as colunas do modelo)");
  });
  for (const col of COLUNAS_OBRIGATORIAS) if (!posicaoColuna.has(col)) E(1, col, "CAMPO_AUSENTE", "coluna obrigatória ausente");
  if (linhas.length === 0) E(0, "", "BASE_VAZIA", "arquivo sem linhas de dados");
  if (linhas.length > LIMITES.linhasBase) E(0, "", "VALOR_FORA_DO_LIMITE", `mais de ${LIMITES.linhasBase} linhas`);
  if (erros.total > 0) return fim();

  const vistos = new Set();
  const metas = { mes_posicao: new Set(), tipo_dados: new Set() };
  linhas.forEach((cels, i) => {
    const n = numerosLinha && numerosLinha[i] ? numerosLinha[i] : i + 2;
    if (!Array.isArray(cels) || cels.length !== cabecalho.length) {
      E(n, "", "CSV_INVALIDO", `a linha tem ${Array.isArray(cels) ? cels.length : 0} colunas e o cabeçalho tem ${cabecalho.length}`);
      return;
    }
    const v = (col) => {
      const p = posicaoColuna.get(col);
      return p === undefined ? "" : String(cels[p] ?? "").trim();
    };
    const r = validarCelulas(ctx, v, (col, cod, msg) => E(n, col, cod, msg));
    const cod = v("codigo_registro");
    if (vistos.has(cod)) E(n, "codigo_registro", "VALOR_DUPLICADO", "código repetido");
    vistos.add(cod);
    metas.mes_posicao.add(v("mes_posicao"));
    metas.tipo_dados.add(v("tipo_dados"));
    for (const [col, codigo, msg] of r.avisos) avisos.add({ codigo, linha: n, coluna: col, mensagem: `Linha ${n}, coluna ${citar(col)}: ${msg}.` });
    if (r.ok) linhasOk.push(r.linha);
  });
  for (const [col, vs] of Object.entries(metas)) {
    if (vs.size > 1) E(0, col, col === "tipo_dados" ? "TIPO_DADOS_DIVERGENTE" : "VALOR_FORA_DO_LIMITE", "valores diferentes no mesmo arquivo");
  }
  return fim();
}

// ------------------------------------------------------------------------------------------- agrupamento (ADR, decisão B1)

/**
 * Junta as linhas iguais em todas as colunas de cálculo (posição, meses cumpridos, tempo de serviço, titulação e parcela
 * fixa), somando `quantidade`. Os códigos viram G0001, G0002… (os originais não são guardados).
 * Retorna { linhas, agrupadas, avisos }: `agrupadas` = quantas linhas deixaram de existir.
 */
export function agruparBase(linhas) {
  const grupos = new Map();
  for (const l of linhas) {
    const chave = [l.p1, l.p2, l.c1, l.c2, l.tempo ?? "", l.titulacao ?? "", l.fixaCent].join("\u0001");
    const g = grupos.get(chave);
    if (g) g.q += l.q;
    else grupos.set(chave, { ...l, q: l.q });
  }
  const largura = Math.max(4, String(grupos.size).length);
  let k = 0;
  const saida = [];
  for (const g of grupos.values()) {
    k++;
    saida.push({ ...g, codigo: `G${String(k).padStart(largura, "0")}` });
  }
  const agrupadas = linhas.length - saida.length;
  const avisos = agrupadas > 0
    ? [{ codigo: "LINHAS_AGRUPADAS", mensagem: `${agrupadas} linhas iguais foram juntadas em outras, somando a quantidade (${linhas.length} para ${saida.length} linhas).` }]
    : [];
  return { linhas: saida, agrupadas, avisos };
}

