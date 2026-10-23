// Motor de cálculo: valor esperado do custo por linha, mês e cenário (docs/dados/regras-calculo.md, seções 2 a 10).
// Aritmética exata em BigInt (ADR 0001, decisão N3). Sem DOM, sem Firebase, sem relógio, sem aleatoriedade.
//
// Estrutura do cálculo:
//  1. `compilar` transforma o JSON v1 já validado em estruturas de cálculo (tabelas por mês, trilhas, parcelas...).
//  2. Para cada chave (posição inicial + meses cumpridos) `percorrer` faz a evolução da distribuição de massa uma só vez
//     e guarda, por trecho de meses, o numerador do vencimento esperado (soma massa x valor da célula) e seu denominador.
//     A massa é inteira com denominador comum (a linha do tempo dos vencimentos não depende do sucesso).
//  3. Para cada linha da base, `linhaCenario` calcula os componentes mês a mês só com inteiros.
import { COMPONENTES, ErroMotor, LIMITES, VERSAO_ESPECIFICACAO } from "./constantes.js";
import { compilarDecimoFerias, decimoTerceiro, encargos, tercoFerias } from "./decimo-ferias.js";
import {
  E8, centavosDeTexto, fatorPermanencia, formatarFracao, indiceMes, mdc, microPercentual, potenciasPermanencia,
  rdiv, textoMes,
} from "./numero.js";
import { aplicarRevisao, tabelaBase } from "./tabela.js";
import { horizonte, validarEstudo } from "./validacao.js";

const MAXS = Number.MAX_SAFE_INTEGER;

function falhaGrande(onde) {
  return new ErroMotor({
    codigo: "RESULTADO_GRANDE_DEMAIS",
    mensagem: `O resultado passa do maior valor que o simulador consegue somar com exatidão${onde ? ` (${onde})` : ""}. Reduza o horizonte ou os valores.`,
    caminho: "",
  });
}

// ------------------------------------------------------------------------------------------- compilação

function compilarCenario(ctx, carr, json, ordem) {
  const proposta = json.papel === "proposta";
  const eixos = json.regras.eixos;
  const rot1 = eixos[0].rotulos;
  const rot2 = eixos[1].rotulos;
  const cen = {
    id: json.id, nome: json.nome, papel: json.papel, ordem,
    inicioVigencia: proposta ? json.inicio_vigencia : null,
    vigT: proposta ? indiceMes(json.inicio_vigencia) - ctx.P : 0,
    rot1, rot2, n1: rot1.length, n2: rot2.length, eixosNomes: [eixos[0].nome, eixos[1].nome],
    idx1: new Map(rot1.map((r, i) => [r, i])), idx2: new Map(rot2.map((r, i) => [r, i])),
    trilhas: [], naoAcumula: [], parcelas: [], enq: null, tabs: null, cache: new Map(), pctCache: new Map(),
    json,
  };
  const porId = new Map();
  for (const t of json.regras.trilhas) {
    const P = microPercentual(t.taxa_exito); // % x 10^6
    let pn = BigInt(P);
    let pd = E8;
    const g = mdc(pn, pd);
    pn /= g;
    pd /= g;
    const tr = {
      id: t.id, eixo: t.eixo - 1, passos: t.passos, ciclo: t.intersticio_meses + t.atraso_efeito_meses,
      pn, pd, primeiroMaior: t.regra_posicao_outro_eixo === "primeiro_maior",
    };
    cen.trilhas.push(tr);
    porId.set(t.id, tr);
  }
  cen.naoAcumula = json.regras.nao_acumulacao.map((id) => porId.get(id));
  cen.temTrilha = [cen.trilhas.some((t) => t.eixo === 0), cen.trilhas.some((t) => t.eixo === 1)];
  for (const p of json.regras.parcelas) {
    if (p.tipo === "titulacao") {
      cen.parcelas.push({ tipo: "titulacao", integra: p.integra_remuneracao, cod: new Map(Object.keys(p.codigos).map((k) => [k, microPercentual(p.codigos[k])])) });
    } else {
      cen.parcelas.push({ tipo: "tempo", integra: p.integra_remuneracao, pct: microPercentual(p.pct_por_bloco), bloco: p.bloco_meses, max: p.max_blocos });
    }
  }
  const versoes = json.regras.versoes.slice().sort((a, b) => indiceMes(a.inicio_vigencia) - indiceMes(b.inicio_vigencia));
  cen.versoes = versoes.map((v) => {
    const ref = indiceMes(v.referencia_valores);
    return { inicio: indiceMes(v.inicio_vigencia), ref, s: ctx.rev.filter((r) => r.idx <= ref).length, json: v, base: null };
  });
  cen.enqJson = proposta ? json.enquadramento : null;
  return cen;
}

/** Tabela (lista plana de centavos BigInt) da versão `v` com as revisões gerais até a de índice `e - 1` aplicadas. */
function tabelaDaVersao(ctx, cen, v, e) {
  const ver = cen.versoes[v];
  const chave = v * 256 + e;
  let tb = cen.cache.get(chave);
  if (tb) return tb;
  if (e <= ver.s) {
    if (!ver.base) ver.base = tabelaBase(ver.json, [{ rotulos: cen.rot1 }, { rotulos: cen.rot2 }], `${cen.caminho}.regras.versoes`);
    tb = ver.base;
  } else tb = aplicarRevisao(tabelaDaVersao(ctx, cen, v, e - 1), ctx.rev[e - 1].micro);
  cen.cache.set(chave, tb);
  return tb;
}

function montarTabelas(ctx, cen, tIni, tFim) {
  cen.tabs = new Array(tFim + 1).fill(null);
  let v = -1;
  for (let t = tIni; t <= tFim; t++) {
    const m = ctx.P + t;
    while (v + 1 < cen.versoes.length && cen.versoes[v + 1].inicio <= m) v++;
    if (v < 0) {
      throw new ErroMotor({
        codigo: "SEM_VERSAO_VIGENTE",
        mensagem: `O cenário ${cen.nome} não tem versão de tabela vigente em ${textoMes(m)}.`,
        caminho: cen.caminho,
      });
    }
    cen.tabs[t] = tabelaDaVersao(ctx, cen, v, Math.max(ctx.eRev[t], cen.versoes[v].s));
  }
}

function compilarEnquadramento(ctx, atual, prop) {
  const enq = prop.enqJson;
  prop.enq = { tipo: enq.tipo, mapa: null };
  if (enq.tipo === "depara") {
    prop.enq.mapa = new Map();
    for (const m of enq.mapa) {
      const de = atual.idx1.get(m.de[0]) * atual.n2 + atual.idx2.get(m.de[1]);
      prop.enq.mapa.set(de, prop.idx1.get(m.para[0]) * prop.n2 + prop.idx2.get(m.para[1]));
    }
  }
}

/**
 * Compila o estudo validado. `nMeses` (opcional) força o horizonte em meses (usado pela evolução individual).
 */
function compilar(doc, nMeses) {
  const e = doc.estudo;
  const h = horizonte(doc);
  const P = h.P;
  const n = nMeses ?? h.n;
  const ctx = { doc, P, n, E0: h.E0 };
  ctx.rev = e.revisoes_gerais
    .map((r) => ({ idx: indiceMes(r.mes), micro: microPercentual(r.percentual) }))
    .sort((a, b) => a.idx - b.idx);
  ctx.eRev = new Array(n + 1).fill(0);
  for (let t = 1; t <= n; t++) ctx.eRev[t] = ctx.rev.filter((r) => r.idx <= P + t).length;
  // fator de permanência
  const saidaMicro = microPercentual(e.taxa_saida_anual);
  ctx.rn = fatorPermanencia(saidaMicro);
  const pot = potenciasPermanencia(ctx.rn, n);
  ctx.escala = pot.escala;
  ctx.R = pot.R;
  ctx.cfg = compilarDecimoFerias(e, ctx.rn);
  // calendário
  ctx.k = new Array(n + 1).fill(0);
  ctx.tM1 = new Array(n + 1).fill(0);
  ctx.iRef = new Array(n + 1).fill(1);
  const mes1 = ctx.cfg.d13.mes1;
  for (let t = 1; t <= n; t++) {
    const m = P + t;
    ctx.k[t] = (m % 12) + 1;
    if (mes1 !== null) {
      ctx.tM1[t] = m - (m % 12) + mes1 - 1 - P;
      ctx.iRef[t] = ctx.tM1[t] >= 1 ? ctx.tM1[t] : 1;
    }
  }
  ctx.meses = [];
  for (let t = 1; t <= n; t++) ctx.meses.push(textoMes(P + t));
  ctx.exercicios = [];
  ctx.exDe = new Array(n + 1).fill(0);
  for (let t = 1; t <= n; t++) {
    const ano = Math.floor((P + t) / 12);
    let ex = ctx.exercicios[ctx.exercicios.length - 1];
    if (!ex || ex.ano !== ano) {
      ex = { ano, meses: 0, inicio: t - 1, fim: t - 1, anteriorVigencia: ano < h.E0 };
      ctx.exercicios.push(ex);
    }
    ex.meses++;
    ex.fim = t - 1;
    ctx.exDe[t] = ctx.exercicios.length - 1;
  }
  ctx.fixaCache = new Map();
  // carreiras e cenários
  ctx.carreiras = doc.carreiras.map((c, a) => {
    const carr = { json: c, id: c.id, nome: c.nome, ordem: a, cenarios: [], propostas: [], atual: null };
    c.cenarios.forEach((cj, b) => {
      const cen = compilarCenario(ctx, carr, cj, b);
      cen.caminho = `carreiras[${a}].cenarios[${b}]`;
      carr.cenarios.push(cen);
      if (cen.papel === "atual") carr.atual = cen;
      else carr.propostas.push(cen);
    });
    montarTabelas(ctx, carr.atual, 1, n);
    for (const p of carr.propostas) {
      if (p.vigT > n) {
        // só ocorre na evolução individual com horizonte curto: a proposta ainda não vigora
        p.fora = true;
        continue;
      }
      montarTabelas(ctx, p, p.vigT, n);
      compilarEnquadramento(ctx, carr.atual, p);
    }
    return carr;
  });
  return ctx;
}

// ------------------------------------------------------------------------------------------- evolução da massa

class Estado {
  constructor(massa, D, c, ver) {
    this.massa = massa; // Map<posição linearizada, peso inteiro> com denominador comum D
    this.D = D;
    this.c = c; // contadores [eixo 1, eixo 2]; null = o cenário não tem trilha no eixo
    this.ver = ver; // muda a cada alteração da massa
  }
  clonar() {
    return new Estado(new Map(this.massa), this.D, this.c.slice(), this.ver);
  }
}

function somar(mapa, chave, w) {
  const x = mapa.get(chave);
  mapa.set(chave, x === undefined ? w : x + w);
}

/** Destino de um sucesso da trilha a partir da posição s; -1 se já está no topo do eixo; -2 - destino se `primeiro_maior` não achou. */
function destino(cen, tabela, s, tr) {
  const { n1, n2 } = cen;
  const i = Math.floor(s / n2);
  const j = s - i * n2;
  if (tr.eixo === 0) {
    if (i === n1 - 1) return -1;
    const i2 = Math.min(i + tr.passos, n1 - 1);
    if (!tr.primeiroMaior) return i2 * n2 + j;
    const v = tabela[s];
    for (let j2 = 0; j2 < n2; j2++) if (tabela[i2 * n2 + j2] > v) return i2 * n2 + j2;
    return -2 - (i2 * n2 + n2 - 1);
  }
  if (j === n2 - 1) return -1;
  const j2 = Math.min(j + tr.passos, n2 - 1);
  if (!tr.primeiroMaior) return i * n2 + j2;
  const v = tabela[s];
  for (let i2 = 0; i2 < n1; i2++) if (tabela[i2 * n2 + j2] > v) return i2 * n2 + j2;
  return -2 - ((n1 - 1) * n2 + j2);
}

/** Aplica um vencimento da trilha a toda a massa. `eventos`: lista opcional para a evolução individual. */
function aplicarTrilha(st, cen, tabela, tr, t, avisos) {
  if (tr.pn === 0n) return; // êxito 0%: nada muda
  const nova = new Map();
  let semDestino = false;
  for (const [s, w] of st.massa) {
    let d = destino(cen, tabela, s, tr);
    if (d === -1) {
      somar(nova, s, w * tr.pd);
      continue;
    }
    if (d <= -2) {
      d = -2 - d;
      semDestino = true;
    }
    somar(nova, d, w * tr.pn);
    if (tr.pn < tr.pd) somar(nova, s, w * (tr.pd - tr.pn));
  }
  if (semDestino) avisos.push({ codigo: "PRIMEIRO_MAIOR_SEM_DESTINO", cen, t });
  st.massa = nova;
  st.D *= tr.pd;
  st.ver++;
}

/**
 * Eventos do mês t (regras-calculo, seção 4.4, passos 2 a 5): vencimentos, não acumulação, aplicação e zerar contadores.
 * `obs.aoEvento(tr, efeito)` é chamado antes de cada aplicação (evolução individual).
 */
function eventosDoMes(st, cen, tabela, t, avisos, obs) {
  if (cen.trilhas.length === 0) return;
  let venc = null;
  for (const tr of cen.trilhas) {
    if (st.c[tr.eixo] >= tr.ciclo) (venc ??= []).push(tr);
  }
  if (venc === null) return;
  let perdem = null;
  if (venc.length > 1 && cen.naoAcumula.length) {
    const grupo = cen.naoAcumula.filter((tr) => venc.includes(tr));
    perdem = new Set(grupo.slice(1));
  }
  for (const tr of cen.trilhas) {
    if (!venc.includes(tr)) continue;
    if (perdem && perdem.has(tr)) {
      if (obs) obs.aoEvento(st, tr, "descartada", cen, tabela, t);
      continue;
    }
    if (obs) obs.aoEvento(st, tr, null, cen, tabela, t);
    aplicarTrilha(st, cen, tabela, tr, t, avisos);
  }
  for (const tr of venc) st.c[tr.eixo] = 0;
}

/** Enquadramento no mês da vigência (regras-calculo, seção 7): leva a massa do atual à proposta. */
function enquadrar(st, atual, prop, t, avisos) {
  const tabA = atual.tabs[t];
  const tabP = prop.tabs[t];
  const nova = new Map();
  let semDestino = false;
  let reduz = false;
  let menorSem = null;
  for (const [s, w] of st.massa) {
    let d;
    if (prop.enq.tipo === "mesma_posicao") d = s;
    else if (prop.enq.tipo === "depara") d = prop.enq.mapa.get(s);
    else {
      // menor valor igual ou maior (empate: menor índice no eixo 1, depois no eixo 2)
      if (menorSem === null) menorSem = new Map();
      d = menorSem.get(s);
      if (d === undefined) {
        const v = tabA[s];
        let melhor = -1;
        for (let k = 0; k < tabP.length; k++) {
          if (tabP[k] >= v && (melhor < 0 || tabP[k] < tabP[melhor])) melhor = k;
        }
        if (melhor < 0) {
          melhor = tabP.length - 1;
          semDestino = true;
        }
        d = melhor;
        menorSem.set(s, d);
      }
    }
    if (tabP[d] < tabA[s]) reduz = true;
    somar(nova, d, w);
  }
  if (semDestino) avisos.push({ codigo: "ENQUADRAMENTO_SEM_DESTINO", cen: prop, t });
  if (reduz) avisos.push({ codigo: "ENQUADRAMENTO_REDUZ_VALOR", cen: prop, t });
  st.massa = nova;
  st.ver++;
  const c = [null, null];
  for (let e = 0; e < 2; e++) if (prop.temTrilha[e]) c[e] = st.c[e] ?? 0;
  st.c = c;
}

function criarDD(ctx, D) {
  const SD = ctx.escala * D;
  const SD8 = SD * E8;
  return { D, SD, SD2: SD << 1n, SD8, SD82: SD8 << 1n };
}

/** Guarda o numerador do vencimento esperado quando a massa ou a tabela mudou desde o último trecho. */
function registrar(ctx, run, t, st, tabela) {
  if (st.ver === run.ultVer && tabela === run.ultTab) return;
  let N = 0n;
  for (const [s, w] of st.massa) N += w * tabela[s];
  if (st.D !== run.ultD) {
    run.ultD = st.D;
    run.ultDD = criarDD(ctx, st.D);
  }
  run.ini.push(t);
  run.N.push(N);
  run.dd.push(run.ultDD);
  run.ultVer = st.ver;
  run.ultTab = tabela;
}

function novoRun() {
  return { ini: [], N: [], dd: [], ultVer: -1, ultTab: null, ultD: null, ultDD: null };
}

function estadoInicial(cen, i0, j0, c0, c1) {
  const c = [cen.temTrilha[0] ? c0 : null, cen.temTrilha[1] ? c1 : null];
  return new Estado(new Map([[i0 * cen.n2 + j0, 1n]]), 1n, c, 0);
}

function avancarContadores(st) {
  if (st.c[0] !== null) st.c[0]++;
  if (st.c[1] !== null) st.c[1]++;
}

/**
 * Percorre os meses de uma chave (posição inicial + meses cumpridos) uma só vez: o atual inteiro e cada proposta a
 * partir do seu enquadramento. Retorna { atual, props: Run[], avisos }.
 */
function percorrer(ctx, carr, i0, j0, c0, c1) {
  const avisos = [];
  const atual = carr.atual;
  const st = estadoInicial(atual, i0, j0, c0, c1);
  const runA = novoRun();
  const snaps = new Map();
  const vigs = new Map();
  for (const p of carr.propostas) {
    const lista = vigs.get(p.vigT);
    if (lista) lista.push(p);
    else vigs.set(p.vigT, [p]);
  }
  for (let t = 1; t <= ctx.n; t++) {
    const doMes = vigs.get(t);
    if (doMes) for (const p of doMes) snaps.set(p, st.clonar());
    const tab = atual.tabs[t];
    eventosDoMes(st, atual, tab, t, avisos, null);
    registrar(ctx, runA, t, st, tab);
    avancarContadores(st);
  }
  const props = carr.propostas.map((p) => {
    const sp = snaps.get(p);
    enquadrar(sp, atual, p, p.vigT, avisos);
    const run = novoRun();
    for (let t = p.vigT; t <= ctx.n; t++) {
      const tab = p.tabs[t];
      eventosDoMes(sp, p, tab, t, avisos, null);
      registrar(ctx, run, t, sp, tab);
      avancarContadores(sp);
    }
    return run;
  });
  return { atual: runA, props, avisos };
}

// ------------------------------------------------------------------------------------------- linhas

/** Percentuais de parcelas (micro-percentuais) por mês para uma titulação e um tempo de serviço: { PC, PCi }. */
function pctsLinha(ctx, cen, titulacao, tempo) {
  const chave = `${titulacao ?? ""}\u0001${tempo}`;
  let r = cen.pctCache.get(chave);
  if (r) return r;
  const n = ctx.n;
  const PC = new Array(n + 1).fill(0);
  const PCi = new Array(n + 1).fill(0);
  for (const p of cen.parcelas) {
    if (p.tipo === "titulacao") {
      const x = titulacao === null ? 0 : (p.cod.get(titulacao) ?? 0);
      if (x === 0) continue;
      for (let t = 1; t <= n; t++) {
        PC[t] += x;
        if (p.integra) PCi[t] += x;
      }
    } else {
      for (let t = 1; t <= n; t++) {
        const x = p.pct * Math.min(Math.floor((tempo + t - 1) / p.bloco), p.max);
        PC[t] += x;
        if (p.integra) PCi[t] += x;
      }
    }
  }
  r = { PC, PCi };
  cen.pctCache.set(chave, r);
  return r;
}

/** Parcela fixa por mês (centavos BigInt) com as revisões gerais posteriores ao mês da posição; null se for zero. */
function fixaSerie(ctx, centavos) {
  if (centavos === 0) return null;
  let s = ctx.fixaCache.get(centavos);
  if (s) return s;
  s = new Array(ctx.n + 1).fill(0n);
  let x = BigInt(centavos);
  let usadas = 0;
  const aplicaveis = ctx.rev.filter((r) => r.idx > ctx.P);
  for (let t = 1; t <= ctx.n; t++) {
    while (usadas < aplicaveis.length && aplicaveis[usadas].idx <= ctx.P + t) {
      x = rdiv(x * (E8 + BigInt(aplicaveis[usadas].micro)), E8);
      usadas++;
    }
    s[t] = x;
  }
  ctx.fixaCache.set(centavos, s);
  return s;
}

function novosBuffers(n) {
  return {
    venc: new Float64Array(n + 1), parc: new Float64Array(n + 1), d13: new Float64Array(n + 1),
    fer: new Float64Array(n + 1), enc: new Float64Array(n + 1), rb: new Float64Array(n + 1), total: new Float64Array(n + 1),
  };
}

/**
 * Componentes de uma linha num cenário, de tIni a n, em centavos (regras-calculo, seções 8, 8A e 10).
 * Para a proposta, os meses anteriores a tIni já vêm copiados do cenário atual nos buffers `b`.
 */
function linhaCenario(ctx, cen, linha, run, tIni, b) {
  const { n, R, cfg, escala } = ctx;
  const Qb = BigInt(linha.q);
  const { PC: PCs, PCi: PCis } = pctsLinha(ctx, cen, linha.titulacao, linha.tempo);
  const fx = fixaSerie(ctx, linha.fixaC);
  const d13Ativo = cfg.d13.ativo;
  const comMes1 = d13Ativo && cfg.d13.mes1 !== null;
  let sp = 0;
  while (sp + 1 < run.ini.length && run.ini[sp + 1] <= tIni) sp++;
  let N = run.N[sp];
  let dd = run.dd[sp];
  for (let t = tIni; t <= n; t++) {
    if (sp + 1 < run.ini.length && run.ini[sp + 1] <= t) {
      sp++;
      N = run.N[sp];
      dd = run.dd[sp];
    }
    const Rt = R[t];
    const QR = Qb * Rt;
    const num = QR * N;
    const VEN = ((num << 1n) + dd.SD) / dd.SD2;
    let PAR1 = 0n;
    let PARB1 = 0n;
    const PC = PCs[t];
    if (PC !== 0) {
      PAR1 = (((num * BigInt(PC)) << 1n) + dd.SD8) / dd.SD82;
      const PCi = PCis[t];
      if (PCi === PC) PARB1 = PAR1;
      else if (PCi !== 0) PARB1 = (((num * BigInt(PCi)) << 1n) + dd.SD8) / dd.SD82;
    }
    let PAR2 = 0n;
    if (fx !== null) PAR2 = rdiv(QR * fx[t], escala);
    const PAR = PAR1 + PAR2;
    const RB = VEN + PARB1 + (cfg.fixaIntegra ? PAR2 : 0n);
    const k = ctx.k[t];
    let D13 = 0n;
    if (d13Ativo) {
      if (comMes1 && k >= cfg.d13.mes1) {
        const iRef = ctx.iRef[t];
        const rbI = iRef === t ? RB : BigInt(b.rb[iRef]);
        D13 = decimoTerceiro(cfg, t, k, ctx.tM1[t], RB, rbI, Rt, R[iRef]);
      } else D13 = decimoTerceiro(cfg, t, k, ctx.tM1[t], RB, 0n, Rt, 1n);
    }
    const FER = tercoFerias(cfg, k, RB);
    const ENC = encargos(cfg, VEN + PAR, D13, FER);
    const TOT = VEN + PAR + D13 + FER + ENC;
    const nv = Number(VEN);
    const nt = Number(TOT);
    if (nt > MAXS || nv > MAXS || Number(RB) > MAXS) throw falhaGrande(`${linha.codigo}, ${ctx.meses[t - 1]}`);
    b.venc[t] = nv;
    b.parc[t] = Number(PAR);
    b.d13[t] = Number(D13);
    b.fer[t] = Number(FER);
    b.enc[t] = Number(ENC);
    b.rb[t] = Number(RB);
    b.total[t] = nt;
  }
}

function copiarPrefixo(origem, destino, ate) {
  for (const c of ["venc", "parc", "d13", "fer", "enc", "rb", "total"]) destino[c].set(origem[c].subarray(0, ate + 1));
}

// ------------------------------------------------------------------------------------------- calcular

const NOMES_AVISO = {
  PRIMEIRO_MAIOR_SEM_DESTINO: (cen, mes) => `Cenário ${cen.nome}, ${mes}: nenhuma posição do outro eixo tem valor maior; o servidor vai para o último rótulo.`,
  ENQUADRAMENTO_SEM_DESTINO: (cen, mes) => `Cenário ${cen.nome}, ${mes}: no enquadramento, nenhuma célula da proposta tem valor igual ou maior para alguma posição; ela vai para a última célula.`,
  ENQUADRAMENTO_REDUZ_VALOR: (cen, mes) => `Cenário ${cen.nome}, ${mes}: o enquadramento leva ao menos uma posição a um valor menor que o atual.`,
};

/**
 * Calcula o estudo (JSON v1) e devolve o `Resultado` (visão geral, seção 5.3). Dinheiro em centavos inteiros.
 * Lança `ErroMotor` (com `.erros`) se o estudo for inválido ou o resultado passar de Number.MAX_SAFE_INTEGER.
 * `opcoes.porLinha`: inclui o total por exercício de cada linha. `aoProgresso({feitas, total})` a cada 1% das linhas.
 */
export function calcular(estudo, opcoes = {}, aoProgresso) {
  const porLinha = Boolean(opcoes && opcoes.porLinha);
  const val = validarEstudo(estudo, { paraCalculo: true });
  if (!val.ok) throw new ErroMotor(val.erros);
  const ctx = compilar(estudo);
  const n = ctx.n;
  const totalLinhas = ctx.carreiras.reduce((s, c) => s + c.json.base.linhas.length, 0);
  const passo = Math.max(1, Math.floor(totalLinhas / 100));
  let feitas = 0;
  const avisosMap = new Map();
  const registrarAvisos = (carr, lista) => {
    for (const a of lista) {
      const chave = `${a.codigo}|${carr.ordem}|${a.cen.ordem}|${a.t}`;
      if (avisosMap.has(chave)) continue;
      const mes = textoMes(ctx.P + a.t);
      avisosMap.set(chave, {
        ordem: [carr.ordem, a.cen.ordem, a.t, a.codigo],
        aviso: { codigo: a.codigo, mensagem: NOMES_AVISO[a.codigo](a.cen, mes), carreiraId: carr.id, cenarioId: a.cen.id, mes },
      });
    }
  };
  const resCarreiras = [];
  for (const carr of ctx.carreiras) {
    const cenarios = carr.cenarios;
    const nExerc = ctx.exercicios.length;
    const acc = cenarios.map(() => {
      const m = {};
      for (const c of COMPONENTES) m[c] = new Float64Array(n);
      return m;
    });
    const linhasEx = cenarios.map(() => []);
    const memo = new Map();
    const bufA = novosBuffers(n);
    const bufP = carr.propostas.map(() => novosBuffers(n));
    let kProp = 0;
    const bufDe = cenarios.map((cen) => (cen.papel === "atual" ? bufA : bufP[kProp++]));
    const colunas = new Map(carr.json.base.colunas.map((c, i) => [c, i]));
    const col = (cels, nome, padrao) => {
      const i = colunas.get(nome);
      if (i === undefined) return padrao;
      const v = cels[i];
      return v === null || v === "" ? padrao : v;
    };
    let qCarreira = 0;
    const atual = carr.atual;
    for (const cels of carr.json.base.linhas) {
      const q = col(cels, "quantidade", 1);
      qCarreira += q;
      const fixa = col(cels, "valor_parcela_fixa", null);
      const linha = {
        codigo: cels[colunas.get("codigo_registro")],
        q,
        tempo: col(cels, "tempo_servico_meses", 0),
        titulacao: col(cels, "titulacao", null),
        fixaC: fixa === null ? 0 : Number(centavosDeTexto(fixa)),
      };
      const i0 = atual.idx1.get(cels[colunas.get("posicao_eixo1")]);
      const j0 = atual.idx2.get(cels[colunas.get("posicao_eixo2")]);
      const c0 = atual.temTrilha[0] ? col(cels, "meses_cumpridos_eixo1", 0) : 0;
      const c1 = atual.temTrilha[1] ? col(cels, "meses_cumpridos_eixo2", 0) : 0;
      const chave = `${i0}|${j0}|${c0}|${c1}`;
      let entrada = memo.get(chave);
      if (!entrada) {
        entrada = percorrer(ctx, carr, i0, j0, c0, c1);
        memo.set(chave, entrada);
        registrarAvisos(carr, entrada.avisos);
      }
      linhaCenario(ctx, atual, linha, entrada.atual, 1, bufA);
      carr.propostas.forEach((p, k) => {
        copiarPrefixo(bufA, bufP[k], p.vigT - 1);
        linhaCenario(ctx, p, linha, entrada.props[k], p.vigT, bufP[k]);
      });
      for (let idx = 0; idx < cenarios.length; idx++) {
        const b = bufDe[idx];
        const a = acc[idx];
        const tot = porLinha ? new Float64Array(nExerc) : null;
        for (let t = 1; t <= n; t++) {
          const i = t - 1;
          a.vencimento[i] += b.venc[t];
          a.parcelas[i] += b.parc[t];
          a.decimo_terceiro[i] += b.d13[t];
          a.terco_ferias[i] += b.fer[t];
          a.encargos[i] += b.enc[t];
          a.total[i] += b.total[t];
          if (tot) tot[ctx.exDe[t]] += b.total[t];
        }
        if (tot) {
          for (const x of tot) if (x > MAXS) throw falhaGrande(linha.codigo);
          linhasEx[idx].push({ codigo: linha.codigo, porExercicio: { total: Array.from(tot) } });
        }
      }
      feitas++;
      if (aoProgresso && (feitas % passo === 0 || feitas === totalLinhas)) aoProgresso({ feitas, total: totalLinhas });
    }
    // servidores esperados: a taxa de saída é a mesma em todas as linhas e cenários, então basta a soma das quantidades
    const servidoresTxt = [];
    const servidoresPrec = [];
    for (let t = 1; t <= n; t++) {
      const x = BigInt(qCarreira) * ctx.R[t];
      servidoresPrec.push(x.toString());
      servidoresTxt.push(formatarFracao(x, ctx.escala, 4));
    }
    const cenRes = cenarios.map((cen, idx) => {
      const mensal = {};
      for (const c of COMPONENTES) {
        const arr = Array.from(acc[idx][c]);
        for (const x of arr) if (x > MAXS || x < -MAXS) throw falhaGrande(c);
        mensal[c] = arr;
      }
      const r = {
        id: cen.id, nome: cen.nome, papel: cen.papel, inicioVigencia: cen.inicioVigencia, mensal,
        servidoresEsperados: servidoresTxt, servidoresPrecisos: servidoresPrec,
      };
      if (porLinha) r.porLinha = linhasEx[idx];
      return r;
    });
    resCarreiras.push({ id: carr.id, nome: carr.nome, cenarios: cenRes });
  }
  const avisos = [...avisosMap.values()]
    .sort((x, y) => x.ordem[0] - y.ordem[0] || x.ordem[1] - y.ordem[1] || x.ordem[2] - y.ordem[2] || (x.ordem[3] < y.ordem[3] ? -1 : 1))
    .map((v) => v.aviso);
  return {
    versaoEspecificacao: VERSAO_ESPECIFICACAO,
    tipoDados: estudo.tipo_dados,
    mesPosicao: estudo.estudo.mes_posicao,
    meses: ctx.meses,
    exercicios: ctx.exercicios.map((e) => ({ ...e })),
    componentes: COMPONENTES.slice(),
    escalaServidores: ctx.escala.toString(),
    carreiras: resCarreiras,
    avisos,
  };
}

// ------------------------------------------------------------------------------------------- evolução individual (F2)

function posicaoModal(st) {
  let melhor = -1;
  let pesoMelhor = -1n;
  for (const [s, w] of st.massa) {
    if (w > pesoMelhor || (w === pesoMelhor && s < melhor)) {
      melhor = s;
      pesoMelhor = w;
    }
  }
  return melhor;
}

function rotulosDe(cen, s) {
  const i = Math.floor(s / cen.n2);
  return { eixo1: cen.rot1[i], eixo2: cen.rot2[s - i * cen.n2] };
}

/**
 * Evolução de um servidor (Q = 1) num cenário, por `nMeses` meses a partir de `mes_posicao + 1` (visão geral, seção 5.4).
 * `entrada`: { posicao: {eixo1, eixo2}, meses_cumpridos: {eixo1, eixo2} (opcional, padrão 0) }.
 * Valor esperado = vencimento da tabela (centavos); com êxito de 100% a distribuição tem um estado por mês.
 * Numa proposta, o servidor percorre o cenário atual até a vigência, é enquadrado e segue pelas regras da proposta.
 */
export function evolucaoIndividual(estudo, carreiraId, cenarioId, entrada, nMeses) {
  const val = validarEstudo(estudo);
  if (!val.ok) throw new ErroMotor(val.erros);
  if (!Number.isSafeInteger(nMeses) || nMeses < 1 || nMeses > LIMITES.mesesHorizonte) {
    throw new ErroMotor({ codigo: "HORIZONTE_INVALIDO", mensagem: `O horizonte da evolução deve ter de 1 a ${LIMITES.mesesHorizonte} meses.`, caminho: "" });
  }
  const ctx = compilar(estudo, nMeses);
  const carr = ctx.carreiras.find((c) => c.id === carreiraId);
  const cenAlvo = carr ? carr.cenarios.find((c) => c.id === cenarioId) : null;
  if (!carr || !cenAlvo) {
    throw new ErroMotor({ codigo: "CAMPO_AUSENTE", mensagem: "Carreira ou cenário não encontrado no estudo.", caminho: "" });
  }
  const atual = carr.atual;
  const pos = entrada && entrada.posicao ? entrada.posicao : {};
  const i0 = typeof pos.eixo1 === "string" ? atual.idx1.get(pos.eixo1) : undefined;
  const j0 = typeof pos.eixo2 === "string" ? atual.idx2.get(pos.eixo2) : undefined;
  if (i0 === undefined || j0 === undefined) {
    throw new ErroMotor({ codigo: "POSICAO_INEXISTENTE", mensagem: "A posição escolhida não existe no cenário atual da carreira.", caminho: "" });
  }
  const mc = entrada && entrada.meses_cumpridos ? entrada.meses_cumpridos : {};
  const cont = [mc.eixo1 ?? 0, mc.eixo2 ?? 0];
  for (let e = 0; e < 2; e++) {
    const tr = atual.trilhas.find((x) => x.eixo === e);
    if (!Number.isSafeInteger(cont[e]) || cont[e] < 0 || (tr ? cont[e] > tr.ciclo : cont[e] !== 0)) {
      throw new ErroMotor({
        codigo: "CONTADOR_ACIMA_DO_CICLO",
        mensagem: tr ? `Os meses cumpridos no eixo ${e + 1} devem ir de 0 até o ciclo da trilha (${tr.ciclo}).` : `O eixo ${e + 1} não tem trilha: os meses cumpridos devem ser 0.`,
        caminho: "",
      });
    }
  }
  const proposta = cenAlvo.papel === "proposta" && !cenAlvo.fora ? cenAlvo : null;
  const st = estadoInicial(atual, i0, j0, cont[0], cont[1]);
  const avisosIgnorados = [];
  const saida = { meses: ctx.meses.slice(), valorEsperado: [], posicaoProvavel: [], distribuicao: [], eventos: [] };
  let cen = atual;
  const obs = {
    aoEvento(estado, tr, efeito, c, tabela, t) {
      const modal = posicaoModal(estado);
      let de = rotulosDe(c, modal);
      let para = de;
      let ef = efeito;
      if (ef === null) {
        if (tr.pn === 0n) ef = "descartada";
        else {
          const d = destino(c, tabela, modal, tr);
          if (d === -1) ef = "topo";
          else {
            ef = "aplicada";
            para = rotulosDe(c, d <= -2 ? -2 - d : d);
          }
        }
      }
      saida.eventos.push({ mes: ctx.meses[t - 1], trilha: tr.id, de, para, efeito: ef });
    },
  };
  for (let t = 1; t <= nMeses; t++) {
    if (proposta && t === proposta.vigT) {
      enquadrar(st, atual, proposta, t, avisosIgnorados);
      cen = proposta;
    }
    const tab = cen.tabs[t];
    eventosDoMes(st, cen, tab, t, avisosIgnorados, obs);
    let N = 0n;
    for (const [s, w] of st.massa) N += w * tab[s];
    const valor = Number(rdiv(N, st.D));
    if (valor > MAXS) throw falhaGrande(ctx.meses[t - 1]);
    saida.valorEsperado.push(valor);
    saida.posicaoProvavel.push(rotulosDe(cen, posicaoModal(st)));
    const dist = [...st.massa.keys()].sort((a, b) => a - b).map((s) => ({ ...rotulosDe(cen, s), massa: formatarFracao(st.massa.get(s), st.D, 4) }));
    saida.distribuicao.push(dist);
    avancarContadores(st);
  }
  return saida;
}
