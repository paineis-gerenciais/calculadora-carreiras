// Memória de premissas (modelo-parametros.md, seção 14; CA-13). Lista o que governa o resultado, com a origem de cada
// item: "usuario" ou "padrao" (valor igual ao padrão da especificação). Função pura.
const sn = (b) => (b ? "sim" : "não");
const pct = (t) => `${t}%`;

function item(grupo, nome, valor, origem = "usuario") {
  return { grupo, item: nome, valor: String(valor), origem };
}

/** Texto do gerador de tabela (parâmetros), para a memória. */
function descreverPct(spec) {
  if (Object.hasOwn(spec, "constante")) return pct(spec.constante);
  if (Object.hasOwn(spec, "lista")) return `lista de ${spec.lista.length} passos (${spec.lista.map(pct).join("; ")})`;
  return `faixas (${spec.faixas.map((f) => `${f.de} a ${f.ate}: ${pct(f.percentual)}`).join("; ")})`;
}

export function memoriaPremissas(estudo, resultado) {
  const e = estudo.estudo;
  const m = [];
  const E = (nome, valor, origem) => m.push(item("Estudo", nome, valor, origem));
  E("Nome", e.nome);
  E("Tipo de dados", estudo.tipo_dados === "ficticio" ? "Dados fictícios" : "Real anonimizado");
  E("Posição de", e.mes_posicao);
  E("Horizonte", `${e.exercicios} exercícios${resultado ? ` (${resultado.meses.length} meses, de ${resultado.meses[0]} a ${resultado.meses[resultado.meses.length - 1]})` : ""}`);
  E("Versão da especificação", estudo.versao_especificacao);
  E("Versão do formato", estudo.versao_formato);
  const rev = e.revisoes_gerais.slice().sort((a, b) => (a.mes < b.mes ? -1 : 1));
  if (rev.length === 0) m.push(item("Revisão geral", "Revisões", `sem revisão geral após ${e.mes_posicao}`, "padrao"));
  for (const r of rev) m.push(item("Revisão geral", r.mes, pct(r.percentual)));
  const enc = (nome, v, padrao) => m.push(item("Encargos e saída", nome, v, v === padrao ? "padrao" : "usuario"));
  m.push(item("Encargos e saída", "Encargos patronais", pct(e.encargos_patronais)));
  enc("Encargos incidem no 13º", sn(e.encargos_incidem.decimo_terceiro), "sim");
  enc("Encargos incidem no 1/3 de férias", sn(e.encargos_incidem.terco_ferias), "não");
  enc("Taxa anual de saída", pct(e.taxa_saida_anual), "0%");
  const d = e.decimo_terceiro;
  if (!d.ativo) m.push(item("13º salário", "Cálculo", "sem 13º", "usuario"));
  else if (d.mes_primeira_parcela === null) m.push(item("13º salário", "Cronograma", "100% em dezembro", "padrao"));
  else m.push(item("13º salário", "Cronograma", `1ª parcela de ${pct(d.pct_primeira_parcela)} em ${d.mes_primeira_parcela}º mês; acerto em dezembro`));
  const f = e.ferias_terco;
  if (!f.ativo) m.push(item("1/3 de férias", "Cálculo", "sem 1/3 de férias", "usuario"));
  else if (f.distribuicao === "uniforme") m.push(item("1/3 de férias", "Distribuição", "uniforme (1/12 por mês)", "padrao"));
  else m.push(item("1/3 de férias", "Distribuição", f.meses.map((x) => `mês ${x.mes}: ${pct(x.percentual)}`).join("; ")));
  m.push(item("Base de cálculo", "Parcela fixa integra a remuneração", sn(e.fixa_integra_remuneracao), e.fixa_integra_remuneracao ? "padrao" : "usuario"));
  if (resultado) m.push(item("Resultado", "Avisos do cálculo", resultado.avisos.length));

  for (const c of estudo.carreiras) {
    const g = `Carreira ${c.nome}`;
    const idx = new Map(c.base.colunas.map((x, i) => [x, i]));
    const iq = idx.get("quantidade");
    const servidores = c.base.linhas.reduce((s, l) => s + (iq === undefined || l[iq] === null ? 1 : l[iq]), 0);
    m.push(item(g, "Linhas da base", c.base.linhas.length));
    m.push(item(g, "Servidores representados", servidores));
    for (const cen of c.cenarios) {
      const gc = `${g} / ${cen.nome}`;
      m.push(item(gc, "Papel", cen.papel));
      if (cen.papel === "proposta") {
        m.push(item(gc, "Início da vigência", cen.inicio_vigencia));
        m.push(item(gc, "Enquadramento", cen.enquadramento.tipo));
      }
      const r = cen.regras;
      m.push(item(gc, "Eixos", r.eixos.map((x) => `${x.nome} (${x.rotulos.length})`).join(" × ")));
      for (const v of r.versoes) {
        const ref = `início ${v.inicio_vigencia}, referência ${v.referencia_valores}`;
        if (v.modo === "digitada") m.push(item(gc, "Tabela", `${ref}, digitada`));
        else m.push(item(gc, "Tabela", `${ref}, gerador: base R$ ${v.gerador.valor_base}; eixo 1 ${descreverPct(v.gerador.pct_eixo1)}; eixo 2 ${descreverPct(v.gerador.pct_eixo2)}`));
      }
      for (const t of r.trilhas) {
        m.push(item(gc, `Trilha ${t.id}`,
          `eixo ${t.eixo}, ${t.passos} passo(s), interstício ${t.intersticio_meses} meses, êxito ${pct(t.taxa_exito)}, atraso ${t.atraso_efeito_meses} meses, ${t.regra_posicao_outro_eixo}`,
          "usuario"));
      }
      if (r.nao_acumulacao.length) m.push(item(gc, "Não acumulação", r.nao_acumulacao.join(" > ")));
      for (const p of r.parcelas) {
        const base = p.tipo === "titulacao"
          ? `titulação: ${Object.keys(p.codigos).map((k) => `${k} ${pct(p.codigos[k])}`).join("; ")}`
          : `tempo: ${pct(p.pct_por_bloco)} a cada ${p.bloco_meses} meses, no máximo ${p.max_blocos} blocos`;
        m.push({ grupo: gc, item: `Parcela ${p.nome}`, valor: `${base}; integra a remuneração: ${sn(p.integra_remuneracao)}`, origem: p.integra_remuneracao ? "padrao" : "usuario" });
      }
    }
  }
  return m;
}
