// T2, abas "3 Trilhas" e "4 Parcelas" (CA-04): trilhas de movimento (no máximo uma por eixo) e parcelas percentuais.
import { CHAVES_PROIBIDAS, LIMITES } from '../../motor/constantes.js';
import { acoes, botao, campo, faixa, razao, secao, vazio } from '../componentes.js';
import { criar } from '../dom.js';
import { campoParaDecimal, decimalParaCampo } from '../formatar.js';
import { trilhaNova } from '../modelo.js';
import { campoModelo, inteiroOuTexto } from './campos-modelo.js';

// ----------------------------------------------------------------------------- 3 Trilhas

export function painelTrilhas(p, amb) {
  const a = amb.sel.a;
  const b = amb.sel.b;
  const base = `${amb.P()}.regras`;
  const r = amb.regras();
  const R = (e) => e.carreiras[a].cenarios[b].regras;
  const eixoNome = (n) => r.eixos[n - 1]?.nome ?? `Eixo ${n}`;
  const usados = new Set(r.trilhas.map((t) => t.eixo));
  const livre = [1, 2].find((n) => !usados.has(n));

  if (!r.trilhas.length) {
    p.append(vazio('Sem trilhas', 'A carreira não evolui sem ao menos uma trilha.',
      botao('Adicionar trilha', { variante: 'prim', atributos: { id: 'btn-nova-trilha' }, aoClicar: () => { amb.mudar((e) => R(e).trilhas.push(trilhaNova(R(e), 2))); amb.redesenhar(); } })));
  }

  r.trilhas.forEach((t, i) => {
    const c = `${base}.trilhas[${i}]`;
    const eixo = campo({
      rotulo: 'Eixo em que a trilha se move', tipo: 'selecao', valor: String(t.eixo),
      opcoes: [1, 2].map((n) => ({ valor: String(n), texto: `${n}: ${eixoNome(n)}`, desabilitado: n !== t.eixo && usados.has(n) })),
      aoMudar: (v) => { amb.mudar((e) => { R(e).trilhas[i].eixo = Number(v); }); amb.redesenhar(); },
    });
    amb.formulario.adicionar(`${c}.eixo`, eixo);
    const passos = campoModelo(amb, `${c}.passos`, {
      rotulo: 'Passos por evento', inputmode: 'numeric', ler: () => String(t.passos), escrever: (e, v) => { R(e).trilhas[i].passos = inteiroOuTexto(v); },
    });
    const inter = campoModelo(amb, `${c}.intersticio_meses`, {
      rotulo: 'Interstício (meses)', inputmode: 'numeric', ler: () => String(t.intersticio_meses),
      escrever: (e, v) => { R(e).trilhas[i].intersticio_meses = inteiroOuTexto(v); },
    });
    const exito = campoModelo(amb, `${c}.taxa_exito`, {
      rotulo: 'Taxa de êxito (%)', inputmode: 'decimal', ler: () => decimalParaCampo(t.taxa_exito),
      escrever: (e, v) => { R(e).trilhas[i].taxa_exito = campoParaDecimal(v); },
    });
    const atraso = campoModelo(amb, `${c}.atraso_efeito_meses`, {
      rotulo: 'Atraso do efeito financeiro (meses)', inputmode: 'numeric', ler: () => String(t.atraso_efeito_meses),
      escrever: (e, v) => { R(e).trilhas[i].atraso_efeito_meses = inteiroOuTexto(v); },
      ajuda: '0 = efeito no mês seguinte ao cumprimento do interstício.',
    });
    const regra = campo({
      rotulo: `Posição em ${eixoNome(t.eixo === 1 ? 2 : 1)} ao mudar de ${eixoNome(t.eixo)}`, tipo: 'selecao', valor: t.regra_posicao_outro_eixo,
      opcoes: [{ valor: 'manter', texto: 'Mantém a mesma posição' }, { valor: 'primeiro_maior', texto: 'Primeira posição com valor maior' }],
      aoMudar: (v) => amb.mudar((e) => { R(e).trilhas[i].regra_posicao_outro_eixo = v; }),
    });
    amb.formulario.adicionar(`${c}.regra_posicao_outro_eixo`, regra);
    const rem = botao('Remover trilha', {
      variante: 'perigo', atributos: { 'aria-label': `Remover a trilha ${i + 1}` },
      aoClicar: () => {
        amb.mudar((e) => {
          const reg = R(e);
          const [tirada] = reg.trilhas.splice(i, 1);
          reg.nao_acumulacao = reg.nao_acumulacao.filter((id) => id !== tirada.id);
        });
        amb.redesenhar();
      },
    });
    p.append(secao(`Trilha ${i + 1}: ${eixoNome(t.eixo)}`,
      criar('div', { class: 'grade g3' }, eixo.no, passos.no, inter.no),
      criar('div', { class: 'grade g3' }, exito.no, atraso.no, regra.no),
      acoes(rem)));
  });

  if (r.trilhas.length) {
    const add = botao('Adicionar trilha', {
      desabilitado: r.trilhas.length >= LIMITES.trilhas, atributos: { id: 'btn-nova-trilha' },
      aoClicar: () => { amb.mudar((e) => R(e).trilhas.push(trilhaNova(R(e), livre ?? 1))); amb.redesenhar(); },
    });
    p.append(acoes(add, r.trilhas.length >= LIMITES.trilhas ? razao(add, 'No máximo uma trilha por eixo.') : null));
  }

  if (r.trilhas.length === 2) {
    const [t1, t2] = r.trilhas;
    const atual = r.nao_acumulacao.length === 2 ? r.nao_acumulacao[0] : '';
    const na = campo({
      rotulo: 'Quando as duas trilhas vencem no mesmo mês', tipo: 'selecao', valor: atual,
      opcoes: [
        { valor: '', texto: 'As duas valem' },
        { valor: t1.id, texto: `Só a trilha 1 vale (${eixoNome(t1.eixo)})` },
        { valor: t2.id, texto: `Só a trilha 2 vale (${eixoNome(t2.eixo)})` },
      ],
      aoMudar: (v) => amb.mudar((e) => {
        const reg = R(e);
        const [x, y] = reg.trilhas;
        reg.nao_acumulacao = v === '' ? [] : v === x.id ? [x.id, y.id] : [y.id, x.id];
      }),
      ajuda: 'Regra de não acumulação: a outra trilha é descartada naquele mês e o contador dela zera.',
    });
    amb.formulario.adicionar(`${base}.nao_acumulacao`, na);
    p.append(secao('Não acumulação', na.no));
  }
  p.append(criar('p', { class: 'small muted' }, 'Os meses cumpridos da base só valem de 0 até interstício + atraso de cada trilha.'));
}

// ----------------------------------------------------------------------------- 4 Parcelas

export function painelParcelas(p, amb) {
  const a = amb.sel.a;
  const b = amb.sel.b;
  const base = `${amb.P()}.regras`;
  const r = amb.regras();
  const R = (e) => e.carreiras[a].cenarios[b].regras;

  p.append(faixa('info', criar('strong', {}, 'Sem efeito cascata.'), ' Uma parcela incide sobre o vencimento da tabela, nunca sobre outra parcela. A parcela fixa em reais vem da coluna "valor_parcela_fixa" da base.'));

  if (!r.parcelas.length) {
    p.append(vazio('Nenhuma parcela cadastrada', 'Parcelas percentuais são opcionais.'));
  }

  r.parcelas.forEach((parc, i) => {
    const c = `${base}.parcelas[${i}]`;
    const nome = campoModelo(amb, `${c}.nome`, {
      rotulo: 'Nome da parcela', maxlength: 60, ler: () => parc.nome, escrever: (e, v) => { R(e).parcelas[i].nome = v.trim(); },
    });
    const integra = campo({
      rotulo: 'Integra a remuneração (entra na base do 13º e do 1/3 de férias)', tipo: 'caixa', valor: parc.integra_remuneracao,
      aoMudar: (v) => amb.mudar((e) => { R(e).parcelas[i].integra_remuneracao = v; }),
    });
    const rem = botao('Remover parcela', {
      variante: 'perigo', atributos: { 'aria-label': `Remover a parcela ${parc.nome}` },
      aoClicar: () => { amb.mudar((e) => { R(e).parcelas.splice(i, 1); }); amb.redesenhar(); },
    });
    const corpo = [criar('div', { class: 'grade g2' }, nome.no, integra.no)];
    if (parc.tipo === 'titulacao') {
      corpo.push(criar('h3', {}, 'Percentual por código de titulação'));
      Object.entries(parc.codigos).forEach(([cod, pct]) => {
        const cc = `${c}.codigos.${cod}`;
        const codCampo = campo({
          rotulo: `Código ${cod}`, valor: cod, maxlength: 20,
          aoMudar: (v) => {
            const novo = v.trim();
            if (CHAVES_PROIBIDAS.has(novo)) { codCampo.definirErro('Código não aceito.'); return; }
            amb.mudar((e) => {
              const antigos = R(e).parcelas[i].codigos;
              const nova = {};
              for (const [k, val] of Object.entries(antigos)) {
                if (k === cod) Object.defineProperty(nova, novo, { value: val, enumerable: true, writable: true, configurable: true });
                else Object.defineProperty(nova, k, { value: val, enumerable: true, writable: true, configurable: true });
              }
              R(e).parcelas[i].codigos = nova;
            });
            amb.redesenhar();
          },
        });
        const pctCampo = campoModelo(amb, cc, {
          rotulo: `Percentual do código ${cod} (%)`, inputmode: 'decimal', ler: () => decimalParaCampo(pct),
          escrever: (e, v) => { R(e).parcelas[i].codigos[cod] = campoParaDecimal(v); },
        });
        const tira = botao('Remover código', {
          atributos: { 'aria-label': `Remover o código ${cod}` },
          aoClicar: () => { amb.mudar((e) => { delete R(e).parcelas[i].codigos[cod]; }); amb.redesenhar(); },
        });
        corpo.push(criar('div', { class: 'grade g3 linha-codigo' }, codCampo.no, pctCampo.no, criar('div', { class: 'campo' }, tira)));
      });
      corpo.push(acoes(botao('Adicionar código', {
        aoClicar: () => {
          amb.mudar((e) => {
            const cods = R(e).parcelas[i].codigos;
            const usados = new Set(r.parcelas.flatMap((x) => (x.tipo === 'titulacao' ? Object.keys(x.codigos) : [])));
            let n = 1;
            while (usados.has(`T${n}`) || Object.hasOwn(cods, `T${n}`)) n++;
            cods[`T${n}`] = '0';
          });
          amb.redesenhar();
        },
      })));
    } else {
      corpo.push(criar('div', { class: 'grade g3' },
        campoModelo(amb, `${c}.pct_por_bloco`, {
          rotulo: 'Percentual por bloco (%)', inputmode: 'decimal', ler: () => decimalParaCampo(parc.pct_por_bloco),
          escrever: (e, v) => { R(e).parcelas[i].pct_por_bloco = campoParaDecimal(v); },
        }).no,
        campoModelo(amb, `${c}.bloco_meses`, {
          rotulo: 'Meses por bloco', inputmode: 'numeric', ler: () => String(parc.bloco_meses),
          escrever: (e, v) => { R(e).parcelas[i].bloco_meses = inteiroOuTexto(v); },
        }).no,
        campoModelo(amb, `${c}.max_blocos`, {
          rotulo: 'Máximo de blocos', inputmode: 'numeric', ler: () => String(parc.max_blocos),
          escrever: (e, v) => { R(e).parcelas[i].max_blocos = inteiroOuTexto(v); },
        }).no));
      corpo.push(criar('p', { class: 'small muted' }, 'Percentual da parcela = percentual por bloco × blocos completos de tempo de serviço (da base, mais os meses projetados), até o máximo.'));
    }
    corpo.push(acoes(rem));
    p.append(secao(`Parcela ${i + 1}: ${parc.nome} (${parc.tipo === 'titulacao' ? 'por titulação' : 'por tempo de serviço'})`, ...corpo));
  });

  const cheio = r.parcelas.length >= LIMITES.parcelas;
  p.append(acoes(
    botao('Adicionar parcela por titulação', {
      desabilitado: cheio, atributos: { id: 'btn-parcela-titulacao' },
      aoClicar: () => {
        amb.mudar((e) => {
          const usados = new Set(R(e).parcelas.flatMap((x) => (x.tipo === 'titulacao' ? Object.keys(x.codigos) : [])));
          let n = 1;
          while (usados.has(`T${n}`)) n++;
          R(e).parcelas.push({ nome: `Titulação ${R(e).parcelas.length + 1}`, tipo: 'titulacao', integra_remuneracao: true, codigos: { [`T${n}`]: '0' } });
        });
        amb.redesenhar();
      },
    }),
    botao('Adicionar parcela por tempo de serviço', {
      desabilitado: cheio, atributos: { id: 'btn-parcela-tempo' },
      aoClicar: () => {
        amb.mudar((e) => { R(e).parcelas.push({ nome: `Tempo ${R(e).parcelas.length + 1}`, tipo: 'tempo', integra_remuneracao: true, pct_por_bloco: '1', bloco_meses: 60, max_blocos: 7 }); });
        amb.redesenhar();
      },
    })));
}
