// Barra do estudo aberto, no topo da área principal: tipo de dados, estado do salvamento (especificação, seção 2) e
// impressão digital do estudo (O3, parecer de segurança): código curto que muda se qualquer parâmetro mudar.
import { anexar, criar, esvaziar } from './dom.js';
import { botao, seloTipo } from './componentes.js';
import { assinar, estado, estudoAberto, nomeDoEstudo, salvarAgora } from './estado.js';
import { hora } from './formatar.js';

function textoSalvamento() {
  const s = estado.salvamento;
  switch (s.tipo) {
    case 'salvo': return { icone: '✔', classe: 'ok', texto: s.hora ? `Salvo às ${hora(s.hora)}` : 'Salvo' };
    case 'salvando': return { icone: '●', classe: 'neutro', texto: 'Salvando…' };
    case 'pendente': return { icone: '●', classe: 'neutro', texto: 'Alterações ainda não gravadas (gravação automática em instantes)' };
    case 'invalido': return { icone: '▲', classe: 'aviso', texto: `Não salvo: corrija ${s.mensagem || 'os problemas'} para gravar` };
    case 'conflito': return { icone: '▲', classe: 'aviso', texto: 'Estudo alterado em outra aba: nada foi gravado. Reabra o estudo para ver a versão mais recente.' };
    case 'erro': return { icone: '▲', classe: 'aviso', texto: s.mensagem ? `Sem conexão ou erro: não salvo. ${s.mensagem}` : 'Sem conexão: não salvo' };
    default: return { icone: '', classe: 'neutro', texto: '' };
  }
}

export function iniciarBarra(raiz = document) {
  const no = raiz.getElementById('barra');
  const desenhar = () => {
    esvaziar(no);
    if (!estudoAberto()) { no.hidden = true; return; }
    no.hidden = false;
    const t = textoSalvamento();
    const pode = ['pendente', 'erro'].includes(estado.salvamento.tipo);
    anexar(no,
      criar('p', { class: 'barra-nome' }, criar('strong', {}, nomeDoEstudo()), ' ', seloTipo(estado.estudo.tipo_dados)),
      criar('p', { class: `barra-status barra-${t.classe}`, id: 'estado-salvamento', role: 'status' },
        t.icone ? criar('span', { 'aria-hidden': 'true' }, `${t.icone} `) : null, t.texto),
      pode ? botao('Salvar agora', { aoClicar: () => salvarAgora(), atributos: { id: 'btn-salvar-agora' } }) : null,
      criar('p', { class: 'barra-digital small muted', title: 'Código curto do conteúdo do estudo. Se não bater com o do último JSON exportado, o estudo foi alterado.' },
        'Impressão digital do estudo: ', criar('code', { id: 'impressao-digital' }, estado.impressao ?? '—')),
    );
  };
  assinar((tipo) => { if (['salvamento', 'estudo', 'impressao'].includes(tipo)) desenhar(); });
  desenhar();
}
