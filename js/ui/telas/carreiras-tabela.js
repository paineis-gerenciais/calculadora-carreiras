// T2, aba "2 Tabela": tabela digitada célula a célula (com colar do Excel) ou gerada por percentuais (constante, lista ou
// faixas), tabela resultante conferível e comparação com a tabela publicada (CA-02, CA-22, CA-24).
import { centavosDeTexto } from '../../motor/numero.js';
import { acoes, botao, campo, faixa, novoIdDom, secao, semCaminho, tabela } from '../componentes.js';
import { criar, esvaziar } from '../dom.js';
import { campoParaDecimal, decimalParaCampo, reais } from '../formatar.js';
import { compararComPublicada, lerColado, matrizParaValores, tabelaDaVersao } from '../modelo.js';
import { campoModelo } from './campos-modelo.js';

export function painelTabela(p, amb) {
  const a = amb.sel.a;
  const b = amb.sel.b;
  const vi = amb.sel.versao;
  const r = amb.regras();
  const v = r.versoes[vi];
  const V = `${amb.P()}.regras.versoes[${vi}]`;
  const getV = (e) => e.carreiras[a].cenarios[b].regras.versoes[vi];
  const rot1 = r.eixos[0].rotulos;
  const rot2 = r.eixos[1].rotulos;

  const sec = secao('Tabela de valores');
  const seletores = criar('div', { class: 'grade g2' });
  if (r.versoes.length > 1) {
    seletores.append(campo({
      rotulo: 'Versão da tabela', tipo: 'selecao', valor: String(vi),
      opcoes: r.versoes.map((x, i) => ({ valor: String(i), texto: `Versão ${i + 1} (início ${x.inicio_vigencia})` })),
      aoMudar: (x) => { amb.sel.versao = Number(x); amb.redesenhar(); },
    }).no);
  }
  const modo = campo({
    rotulo: 'Como informar a tabela', tipo: 'selecao', valor: v.modo,
    opcoes: [{ valor: 'digitada', texto: 'Digitar célula a célula' }, { valor: 'gerador', texto: 'Gerar por percentuais' }],
    aoMudar: (m) => {
      amb.mudar((e) => {
        const x = getV(e);
        const antes = tabelaDaVersao(x, e.carreiras[a].cenarios[b].regras.eixos);
        if (m === 'gerador') {
          const v0 = antes.ok ? matrizParaValores(antes.matriz)[0][0] : '1000.00';
          x.modo = 'gerador';
          x.gerador = { valor_base: v0, pct_eixo1: { constante: '0' }, pct_eixo2: { constante: '0' } };
          delete x.valores;
        } else {
          x.modo = 'digitada';
          x.valores = antes.ok ? matrizParaValores(antes.matriz) : rot1.map(() => rot2.map(() => ''));
          delete x.gerador;
        }
      });
      amb.redesenhar();
    },
  });
  seletores.append(modo.no);
  sec.append(seletores, criar('p', { class: 'small muted' }, `Valores em reais, mês de referência ${v.referencia_valores}.`));
  p.append(sec);

  if (v.modo === 'digitada') painelDigitada(sec, amb, { V, getV, rot1, rot2, v, r });
  else painelGerador(p, sec, amb, { V, getV, rot1, rot2, v, r, a, b, vi });
  p.append(blocoComparar(amb, { rot1, rot2 }));
}

// ----------------------------------------------------------------------------- digitada

function painelDigitada(sec, amb, { V, getV, rot1, rot2, v, r }) {
  const idErros = novoIdDom('erros-tabela');
  const listaErros = criar('div', { class: 'erro-campo', id: idErros, hidden: true });
  const celulas = [];
  const linhas = rot1.map((x, i) => {
    const tds = rot2.map((y, j) => {
      const entrada = criar('input', {
        type: 'text', inputmode: 'decimal', class: 'celula', autocomplete: 'off', 'aria-label': `${x}-${y}`,
        'data-i': i, 'data-j': j,
      });
      entrada.value = decimalParaCampo(v.valores?.[i]?.[j] ?? '');
      celulas.push(entrada);
      const obj = {
        entrada,
        definirErro: (m) => {
          if (m) { entrada.setAttribute('aria-invalid', 'true'); entrada.setAttribute('aria-describedby', idErros); } else { entrada.removeAttribute('aria-invalid'); entrada.removeAttribute('aria-describedby'); }
        },
      };
      amb.formulario.adicionar(`${V}.valores[${i}][${j}]`, obj);
      entrada.addEventListener('change', () => amb.mudar((e) => { getV(e).valores[i][j] = campoParaDecimal(entrada.value); }));
      entrada.addEventListener('paste', (ev) => {
        const t = ev.clipboardData?.getData('text') ?? '';
        if (!/[\t\n;]/.test(t.trim())) return;
        ev.preventDefault();
        const dados = lerColado(t);
        amb.mudar((e) => {
          const alvo = getV(e).valores;
          dados.forEach((linha, di) => linha.forEach((cel, dj) => {
            if (i + di < rot1.length && j + dj < rot2.length) alvo[i + di][j + dj] = campoParaDecimal(cel);
          }));
        });
        dados.forEach((linha, di) => linha.forEach((cel, dj) => {
          const alvo = celulas[(i + di) * rot2.length + (j + dj)];
          if (i + di < rot1.length && j + dj < rot2.length && alvo) alvo.value = campoParaDecimal(cel).replace('.', ',');
        }));
      });
      return criar('td', {}, entrada);
    });
    return criar('tr', {}, criar('th', { scope: 'row' }, x), tds);
  });
  const cab = criar('tr', {}, criar('th', { scope: 'col' }, `${r.eixos[0].nome} \\ ${r.eixos[1].nome}`), rot2.map((y) => criar('th', { scope: 'col', class: 'n' }, y)));
  amb.formulario.aoAplicar((erros) => {
    esvaziar(listaErros);
    const dela = erros.filter((e) => e.caminho.startsWith(`${V}.valores`));
    listaErros.hidden = dela.length === 0;
    if (!dela.length) return;
    listaErros.append(criar('ul', { class: 'lista-simples' }, dela.slice(0, 10).map((e) => {
      const m = /valores\[(\d+)\]\[(\d+)\]/.exec(e.caminho);
      const rotulo = m ? `Célula ${rot1[Number(m[1])] ?? '?'}-${rot2[Number(m[2])] ?? '?'}` : 'Tabela';
      return criar('li', {}, `${rotulo}: ${semCaminho(e.mensagem)}`);
    }), dela.length > 10 ? criar('li', {}, `E mais ${dela.length - 10}.`) : null));
  });
  sec.append(
    criar('p', { class: 'small muted' }, 'Digite ou cole do Excel (ctrl+V na célula inicial). Todas as células precisam de um valor maior que zero.'),
    criar('div', { class: 'rolagem' }, criar('table', { class: 'matriz matriz-editavel' },
      criar('caption', {}, `Matriz ${r.eixos[0].nome} × ${r.eixos[1].nome} (R$)`), criar('thead', {}, cab), criar('tbody', {}, linhas))),
    listaErros);
}

// ----------------------------------------------------------------------------- gerador

const modoDe = (spec) => (Object.hasOwn(spec, 'constante') ? 'constante' : Object.hasOwn(spec, 'lista') ? 'lista' : 'faixas');

function painelGerador(p, sec, amb, { V, getV, rot1, rot2, v, r, a, b, vi }) {
  const resultado = criar('div', { class: 'resultado-tabela' });
  const atualizar = () => {
    esvaziar(resultado);
    const x = amb.regras().versoes[vi];
    const t = tabelaDaVersao(x, amb.regras().eixos);
    if (!t.ok) { resultado.append(criar('p', { class: 'small muted' }, `A tabela ainda não pode ser montada: ${t.mensagem}`)); return; }
    resultado.append(tabela({
      legenda: `Tabela resultante, ${r.eixos[0].nome} × ${r.eixos[1].nome} (R$)`,
      colunas: [{ texto: `${r.eixos[0].nome} \\ ${r.eixos[1].nome}` }, ...rot2.map((y) => ({ texto: y, num: true }))],
      linhas: rot1.map((x1, i) => [x1, ...rot2.map((_, j) => reais(t.matriz[i][j]))]),
      classe: 'matriz',
    }));
  };
  const mudar = (fn) => { amb.mudar(fn); atualizar(); };
  const gv = (e) => getV(e).gerador;

  const base = campoModelo({ ...amb, mudar }, `${V}.gerador.valor_base`, {
    rotulo: 'Valor-base (R$): primeira posição, primeira posição', inputmode: 'decimal', ler: () => decimalParaCampo(v.gerador.valor_base),
    escrever: (e, x) => { gv(e).valor_base = campoParaDecimal(x); },
  });
  sec.append(criar('div', { class: 'grade g3' }, base.no));
  sec.append(criar('p', { class: 'small muted' }, 'Cada valor = valor-base × composição dos percentuais de cada eixo, arredondado ao centavo uma só vez (regras de cálculo, seção 3).'));

  for (const k of [1, 2]) {
    const chave = `pct_eixo${k}`;
    const spec = v.gerador[chave];
    const rots = k === 1 ? rot1 : rot2;
    const outro = k === 1 ? rot2 : rot1;
    const nomeEixo = r.eixos[k - 1].nome;
    const bloco = criar('div', { class: 'bloco-pct' });
    const opcoes = [{ valor: 'constante', texto: 'Mesmo percentual a cada passo' }, { valor: 'lista', texto: 'Um percentual por passo' }];
    if (k === 2) opcoes.push({ valor: 'faixas', texto: `Percentual por faixa de ${r.eixos[0].nome}` });
    const modoSel = campo({
      rotulo: `Eixo ${k} (${nomeEixo}): percentual composto`, tipo: 'selecao', valor: modoDe(spec), opcoes,
      aoMudar: (m) => {
        amb.mudar((e) => {
          const g = gv(e);
          const velho = g[chave];
          const c0 = Object.hasOwn(velho, 'constante') ? velho.constante : Object.hasOwn(velho, 'lista') ? (velho.lista[0] ?? '0') : (velho.faixas?.[0]?.percentual ?? '0');
          if (m === 'constante') g[chave] = { constante: c0 };
          else if (m === 'lista') g[chave] = { lista: Array.from({ length: Math.max(0, rots.length - 1) }, () => c0) };
          else g[chave] = { faixas: [{ de: rot1[0], ate: rot1[rot1.length - 1], percentual: c0 }] };
        });
        amb.redesenhar();
      },
    });
    bloco.append(modoSel.no);
    const caminho = `${V}.gerador.${chave}`;
    if (Object.hasOwn(spec, 'constante')) {
      bloco.append(campoModelo({ ...amb, mudar }, `${caminho}.constante`, {
        rotulo: `${nomeEixo}: percentual por passo (%)`, inputmode: 'decimal', classe: 'campo-curto', ler: () => decimalParaCampo(spec.constante),
        escrever: (e, x) => { gv(e)[chave].constante = campoParaDecimal(x); },
      }).no);
    } else if (Object.hasOwn(spec, 'lista')) {
      const grade = criar('div', { class: 'grade g4' });
      spec.lista.forEach((pct, i) => {
        grade.append(campoModelo({ ...amb, mudar }, `${caminho}.lista[${i}]`, {
          rotulo: `De ${rots[i]} para ${rots[i + 1]} (%)`, inputmode: 'decimal', ler: () => decimalParaCampo(pct),
          escrever: (e, x) => { gv(e)[chave].lista[i] = campoParaDecimal(x); },
        }).no);
      });
      bloco.append(grade);
    } else {
      const erroGeral = criar('div', { class: 'erro-campo', hidden: true });
      const faixasNo = spec.faixas.map((f, i) => {
        const de = campo({
          rotulo: `Faixa ${i + 1}: de (${r.eixos[0].nome})`, tipo: 'selecao', valor: f.de, opcoes: outro.map((x) => ({ valor: x, texto: x })),
          aoMudar: (x) => mudar((e) => { gv(e)[chave].faixas[i].de = x; }),
        });
        const ate = campo({
          rotulo: `Faixa ${i + 1}: até`, tipo: 'selecao', valor: f.ate, opcoes: outro.map((x) => ({ valor: x, texto: x })),
          aoMudar: (x) => mudar((e) => { gv(e)[chave].faixas[i].ate = x; }),
        });
        const pct = campoModelo({ ...amb, mudar }, `${caminho}.faixas[${i}].percentual`, {
          rotulo: `Faixa ${i + 1}: percentual por passo (%)`, inputmode: 'decimal', ler: () => decimalParaCampo(f.percentual),
          escrever: (e, x) => { gv(e)[chave].faixas[i].percentual = campoParaDecimal(x); },
        });
        const rem = botao('Remover faixa', {
          variante: 'perigo', desabilitado: spec.faixas.length < 2, atributos: { 'aria-label': `Remover a faixa ${i + 1}` },
          aoClicar: () => { amb.mudar((e) => { gv(e)[chave].faixas.splice(i, 1); }); amb.redesenhar(); },
        });
        amb.formulario.adicionar(`${caminho}.faixas[${i}].de`, de);
        amb.formulario.adicionar(`${caminho}.faixas[${i}].ate`, ate);
        return criar('div', { class: 'grade g4 linha-faixa' }, de.no, ate.no, pct.no, criar('div', { class: 'campo' }, rem));
      });
      amb.formulario.adicionar(`${caminho}.faixas`, {
        entrada: bloco,
        definirErro: (m) => { erroGeral.textContent = m ?? ''; erroGeral.hidden = !m; },
      });
      bloco.append(faixasNo, erroGeral, acoes(botao('Adicionar faixa', {
        aoClicar: () => { amb.mudar((e) => { gv(e)[chave].faixas.push({ de: rot1[0], ate: rot1[0], percentual: '0' }); }); amb.redesenhar(); },
      })));
    }
    sec.append(bloco);
  }

  sec.append(acoes(botao('Converter em tabela digitada', {
    aoClicar: () => {
      amb.mudar((e) => {
        const x = getV(e);
        const t = tabelaDaVersao(x, e.carreiras[a].cenarios[b].regras.eixos);
        if (!t.ok) return;
        x.modo = 'digitada';
        x.valores = matrizParaValores(t.matriz);
        delete x.gerador;
      });
      amb.redesenhar();
    },
  })));
  p.append(secao('Tabela resultante', criar('p', { class: 'small muted' }, 'Confira célula a célula com a lei.'), resultado));
  atualizar();
}

// ----------------------------------------------------------------------------- comparar com a tabela publicada

function blocoComparar(amb, { rot1, rot2 }) {
  const det = criar('details', { class: 'cartao' });
  const area = campo({
    rotulo: 'Tabela publicada (cole do Excel ou da lei)', tipo: 'area', linhas: 6, placeholder: '2135,64\t2189,03\t…',
    ajuda: `${rot1.length} linhas × ${rot2.length} colunas, na mesma ordem dos rótulos. Pode incluir a linha e a coluna de títulos.`,
  });
  const saida = criar('div', { role: 'status', class: 'resultado-comparacao' });
  const comparar = () => {
    esvaziar(saida);
    let linhas = lerColado(area.entrada.value);
    if (linhas.length === rot1.length + 1 && linhas.every((l) => l.length === rot2.length + 1)) linhas = linhas.slice(1).map((l) => l.slice(1));
    if (linhas.length !== rot1.length || linhas.some((l) => l.length !== rot2.length)) {
      saida.append(faixa('erro', `A tabela colada tem ${linhas.length} linha(s) e ${linhas[0]?.length ?? 0} coluna(s); esperado ${rot1.length} × ${rot2.length}.`));
      return;
    }
    const atual = amb.regras();
    const t = tabelaDaVersao(atual.versoes[amb.sel.versao], atual.eixos);
    if (!t.ok) { saida.append(faixa('erro', t.mensagem)); return; }
    const tol = Number(centavosDeTexto(amb.estudo().estudo.tolerancia_conferencia));
    const c = compararComPublicada(t.matriz, linhas, tol);
    const total = rot1.length * rot2.length;
    if (c.fora === 0 && c.invalidas === 0) {
      saida.append(faixa('ok', criar('strong', {}, `Todas as ${total} células coincidem`), ` com a tabela publicada (tolerância ${reais(tol)}).`));
      return;
    }
    saida.append(faixa('erro', criar('strong', {}, `${c.fora + c.invalidas} de ${total} células não coincidem`), ` (tolerância ${reais(tol)}${c.invalidas ? `; ${c.invalidas} não são valores válidos` : ''}).`));
    const diferentes = c.celulas.filter((x) => !x.dentro);
    saida.append(tabela({
      legenda: 'Células com diferença',
      colunas: [{ texto: 'Posição' }, { texto: 'Calculado', num: true }, { texto: 'Publicado', num: true }, { texto: 'Diferença', num: true }],
      linhas: diferentes.slice(0, 50).map((x) => [`${rot1[x.i]}-${rot2[x.j]}`, reais(x.gerado), x.publicado === null ? 'inválido' : reais(x.publicado), x.diferenca === null ? '-' : reais(x.diferenca)]),
    }));
  };
  det.append(criar('summary', {}, 'Comparar com tabela publicada'), area.no,
    acoes(botao('Comparar', { variante: 'prim', aoClicar: comparar, atributos: { id: 'btn-comparar-tabela' } })), saida);
  return det;
}
