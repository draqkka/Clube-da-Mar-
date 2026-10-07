// ==========================================================================
// STATUS DA SOLICITAÇÃO — rótulos, trilha de etapas e pop-up de aviso.
// Usado por TODOS os painéis (professor, direção, aluno, desenvolvedor) e
// pela tela inicial, pra o nome de cada status ser o MESMO em todo lugar.
//
// O status interno (em solicitacoes-local.js) continua o mesmo:
//   'Pendente'                 -> professor enviou, aguardando a direção
//   'Aguardando Desenvolvedor' -> direção aprovou; falta a equipe Clube da Maré
//   'Aprovado'                 -> confirmada pela equipe Clube da Maré (final)
//   'Recusado'                 -> reprovada (pela direção OU pela equipe)
//
// O que cada pessoa LÊ na tela:
//   Pendente                 -> 🟡 Aguardando a direção
//   Aguardando Desenvolvedor -> 🟢 Aprovado pela direção › 🔵 Esperando contato equipe Clube da Maré
//   Aprovado                 -> 🟢 Aprovado pela direção › 🟢 Confirmada pela equipe Clube da Maré
//   Recusado (direção)       -> 🔴 Reprovada pela direção
//   Recusado (equipe)        -> 🟢 Aprovado pela direção › 🔴 Reprovada pela equipe Clube da Maré
// A ÚLTIMA etapa é o botão: ao clicar, abre um pop-up com o aviso.
// ==========================================================================

function _escSolic(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

// A solicitação já passou pela aprovação da direção?
function solicitacaoPassouDirecao(s) {
    if (!s) return false;
    return !!(s.aprovadoDirecao || s.status === 'Aguardando Desenvolvedor' || s.status === 'Aprovado' ||
        (s.status === 'Recusado' && s.respondidoPor === 'Desenvolvedor'));
}

// O Desenvolvedor só enxerga o que a DIREÇÃO encaminhou (ou o que ele mesmo já decidiu).
// As solicitações "Pendente" do professor e as recusadas pela direção não aparecem pra ele.
function solicitacaoVisivelParaDesenvolvedor(s) {
    if (!s) return false;
    if (s.status === 'Aguardando Desenvolvedor') return true;
    if (s.status === 'Aprovado') return true;
    if (s.status === 'Recusado') return solicitacaoPassouDirecao(s);
    return false;
}

function _quemRespondeu(s) {
    if (!s || !s.respondidoPor) return '';
    return s.respondidoPor === 'Desenvolvedor' ? 'Equipe Clube da Maré' : 'Direção';
}

// { chave, classe, emoji, rotulo, titulo, mensagem, etapas:[{emoji,texto}] }
// A última etapa de "etapas" é a situação atual.
function infoStatusSolicitacao(s) {
    if (!s) {
        return {
            chave: 'sem-solicitacao', classe: 'status-pendente', emoji: '⚪', rotulo: 'Ainda não solicitada',
            titulo: 'Ainda não solicitada',
            mensagem: 'O professor ainda não enviou esta participação para a direção.',
            etapas: [{ emoji: '⚪', texto: 'Ainda não solicitada' }]
        };
    }
    var prof = { emoji: '🟢', texto: 'Enviada pelo professor' };
    var dirOk = { emoji: '🟢', texto: 'Aprovado pela direção' };
    var passou = solicitacaoPassouDirecao(s);

    if (s.status === 'Aprovado') {
        return {
            chave: 'aprovado', classe: 'status-aprovado', emoji: '🟢', rotulo: 'Confirmada pela equipe Clube da Maré',
            titulo: 'Confirmada pela equipe Clube da Maré',
            mensagem: 'O contato com o Clube da Maré foi aceito! 🎉 A participação está confirmada.',
            etapas: [prof, dirOk, { emoji: '🟢', texto: 'Confirmada pela equipe Clube da Maré' }]
        };
    }
    if (s.status === 'Recusado') {
        if (passou) {
            return {
                chave: 'reprovado', classe: 'status-recusado', emoji: '🔴', rotulo: 'Reprovada pela equipe Clube da Maré',
                titulo: 'Reprovada pela equipe Clube da Maré',
                mensagem: 'A direção aprovou, mas a equipe Clube da Maré não aceitou o contato desta vez.',
                etapas: [prof, dirOk, { emoji: '🔴', texto: 'Reprovada pela equipe Clube da Maré' }]
            };
        }
        return {
            chave: 'reprovado', classe: 'status-recusado', emoji: '🔴', rotulo: 'Reprovada pela direção',
            titulo: 'Reprovada pela direção',
            mensagem: 'A direção não aprovou esta participação.',
            etapas: [prof, { emoji: '🔴', texto: 'Reprovada pela direção' }]
        };
    }
    if (s.status === 'Aguardando Desenvolvedor') {
        return {
            chave: 'esperando-contato', classe: 'status-aguardando-dev', emoji: '🔵', rotulo: 'Esperando contato equipe Clube da Maré',
            titulo: 'Esperando contato equipe Clube da Maré',
            mensagem: 'A direção já aprovou. Agora falta a equipe Clube da Maré confirmar o contato — assim que ela responder, o status muda aqui.',
            etapas: [prof, dirOk, { emoji: '🔵', texto: 'Esperando contato equipe Clube da Maré' }]
        };
    }
    return {
        chave: 'analise', classe: 'status-pendente', emoji: '🟡', rotulo: 'Aguardando a direção',
        titulo: 'Aguardando a direção',
        mensagem: 'A solicitação foi enviada pelo professor e está aguardando a análise da direção.',
        etapas: [prof, { emoji: '🟡', texto: 'Aguardando a direção' }]
    };
}

// Etapas a mostrar. "semProfessor" tira o "Enviada pelo professor" (o próprio
// professor e a direção já sabem disso) — mas nunca deixa a lista vazia.
function _etapasVisiveis(info, opcoes) {
    var etapas = info.etapas;
    if (opcoes && opcoes.semProfessor && etapas.length > 1) etapas = etapas.slice(1);
    return etapas;
}

// Versão em texto puro (pra tabelas): "🟢 Aprovado pela direção › 🔵 Esperando contato..."
function textoStatusSolicitacao(s, opcoes) {
    var info = infoStatusSolicitacao(s);
    return _etapasVisiveis(info, opcoes).map(function (e) { return e.emoji + ' ' + e.texto; }).join(' › ');
}

// Trilha em HTML. Só a ÚLTIMA etapa (situação atual) é um botão que abre o pop-up.
function htmlStatusSolicitacao(s, opcoes) {
    var info = infoStatusSolicitacao(s);
    var etapas = _etapasVisiveis(info, opcoes);
    var partes = etapas.map(function (e, i) {
        var ultima = i === etapas.length - 1;
        if (ultima && s) {
            return '<button type="button" class="btn-status-solic ' + info.classe + '" data-id="' + _escSolic(s.id) +
                '" title="Clique para ver o aviso">' + e.emoji + ' ' + _escSolic(e.texto) + '</button>';
        }
        return '<span class="chip-etapa-solic">' + e.emoji + ' ' + _escSolic(e.texto) + '</span>';
    });
    return '<span class="trilha-status-solic">' + partes.join('<span class="seta-etapa-solic">›</span>') + '</span>';
}

// ---- Pop-up de aviso ------------------------------------------------------
var _popupAviso = null;

function _montarPopupAviso() {
    if (_popupAviso) return _popupAviso;
    var el = document.createElement('div');
    el.className = 'popup-aviso';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'popup-aviso-titulo');
    el.innerHTML = '<div class="popup-aviso-caixa">' +
        '<div class="popup-aviso-emoji" id="popup-aviso-emoji"></div>' +
        '<h2 id="popup-aviso-titulo"></h2>' +
        '<p class="popup-aviso-mensagem" id="popup-aviso-mensagem"></p>' +
        '<div class="popup-aviso-detalhes" id="popup-aviso-detalhes"></div>' +
        '<button type="button" class="popup-aviso-ok" id="popup-aviso-ok">Entendi</button>' +
        '</div>';
    document.body.appendChild(el);

    function fechar() { el.hidden = true; }
    el.addEventListener('click', function (e) { if (e.target === el) fechar(); });
    el.querySelector('#popup-aviso-ok').addEventListener('click', fechar);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !el.hidden) fechar(); });

    _popupAviso = el;
    return el;
}

// opcoes: { emoji, titulo, mensagem, linhas: ['<html>', ...], classe }
function mostrarPopupAviso(opcoes) {
    var el = _montarPopupAviso();
    el.querySelector('.popup-aviso-caixa').className = 'popup-aviso-caixa ' + (opcoes.classe || '');
    el.querySelector('#popup-aviso-emoji').textContent = opcoes.emoji || '';
    el.querySelector('#popup-aviso-titulo').textContent = opcoes.titulo || '';
    el.querySelector('#popup-aviso-mensagem').textContent = opcoes.mensagem || '';
    el.querySelector('#popup-aviso-detalhes').innerHTML = (opcoes.linhas || []).map(function (l) {
        return '<p>' + l + '</p>';
    }).join('');
    el.hidden = false;
    el.querySelector('#popup-aviso-ok').focus();
}

// Escola da solicitação: a que foi gravada no envio; se for uma solicitação
// antiga (sem escola), cada página pode definir window.resolverEscolaSolicitacao
// pra procurar nos dados dos alunos.
function escolaDaSolicitacao(s) {
    if (!s) return '';
    if (s.escola) return s.escola;
    if (typeof window.resolverEscolaSolicitacao === 'function') {
        try { return window.resolverEscolaSolicitacao(s) || ''; } catch (e) { return ''; }
    }
    return '';
}

// Pop-up do status ATUAL da solicitação (o que abre ao clicar no botão).
function abrirPopupStatus(s) {
    if (!s) return;
    var info = infoStatusSolicitacao(s);
    var linhas = ['<strong>Aluno(a):</strong> ' + _escSolic(s.nomeAluno) + ' (' + _escSolic(s.turma) + ')'];
    var escola = escolaDaSolicitacao(s);
    if (escola) linhas.push('<strong>Escola:</strong> ' + _escSolic(escola));
    linhas.push('<strong>Andamento:</strong> ' + _escSolic(textoStatusSolicitacao(s)));
    if (s.resposta) linhas.push('<strong>Resposta (' + _escSolic(_quemRespondeu(s)) + '):</strong> “' + _escSolic(s.resposta) + '”');
    mostrarPopupAviso({
        emoji: info.emoji, titulo: info.titulo, mensagem: info.mensagem,
        linhas: linhas, classe: 'popup-' + info.chave
    });
}

// Um único "ouvinte" resolve os botões de todas as páginas.
document.addEventListener('click', function (e) {
    var botao = e.target.closest ? e.target.closest('.btn-status-solic') : null;
    if (!botao) return;
    var id = botao.getAttribute('data-id');
    var s = _lerSolicitacoes().filter(function (x) { return x.id === id; })[0];
    if (s) abrirPopupStatus(s);
});
