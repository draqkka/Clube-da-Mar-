// ==========================================================================
// INGRESSOS DA TURMA e CHAMADA DA VISITA ao Clube da Maré.
// Usado nos painéis do professor/monitor, da Diretoria e do Desenvolvedor
// (o aluno não usa este módulo). São DUAS telas independentes, cada uma com a
// sua seção na página (modo 'ingressos' e modo 'chamada').
//
// Modo 'ingressos': escolha a escola e a turma e veja quem vai, com o QR Code
//   de cada ingresso. Não existe aprovação manual: o próprio sistema confere
//   cada ingresso com os painéis (aluno confirmado + visita aprovada) e o
//   aprova. No painel do Desenvolvedor há também "Gerar ingressos da turma",
//   cancelar/reativar e apagar.
//
// Modo 'chamada': checklist em 2 momentos — chegada ao Clube (dia 1) e volta
//   à escola (dia 2). Só o PROFESSOR/MONITOR marca (um toque no botão P). A
//   hora é gravada sozinha pelo servidor: ninguém digita nada. Diretoria e
//   Desenvolvedor veem em tempo real, só leitura.
//
// Uso (precisa de agendamentos-local.js carregado antes):
//   <div id="ingressos-turma"></div> <div id="chamada-visita"></div>
//   <script src="visita-clube.js"></script>
//   <script>
//     iniciarVisitaClube({ destino: 'ingressos-turma', modo: 'ingressos', perfil: 'professor', nome: sessao.nome, turmas: sessao.turmas });
//     iniciarVisitaClube({ destino: 'chamada-visita',  modo: 'chamada',   perfil: 'professor', nome: sessao.nome, turmas: sessao.turmas });
//   </script>
// Com filtrosExternos: true a seção não mostra os seletores de escola/turma
// (quem manda é a página, via o objeto devolvido: definirFiltro(escola, turma)).
// ==========================================================================
var VC_MOMENTOS = [
    { chave: 'd1-chegada', dia: 1, tipo: 'chegada', rotulo: 'Dia 1 · Chegada ao Clube', curto: 'Dia 1 · Chegou' },
    { chave: 'd2-retorno', dia: 2, tipo: 'retorno', rotulo: 'Dia 2 · Volta à escola', curto: 'Dia 2 · Voltou' }
];
var VC_INTERVALO_MS = 5000;
var VC_ROTULO_STATUS = { Aprovado: 'Verificado', Pendente: 'Aguardando verificação', Recusado: 'Cancelado' };
var _vcInstancias = [];
var _vcQrCache = {};

function _vcEsc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}
function _vcTurma(t) {
    if (typeof turmaCanonica === 'function') return turmaCanonica(t);
    var m = String(t == null ? '' : t).toUpperCase().replace(/\s+/g, '').match(/(\d+)[^\dA-Z]*([A-Z]+)/);
    return m ? m[1] + '\u00BA' + m[2] : String(t || '').trim();
}
function _vcIgual(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }
function _vcHora(ms) {
    try {
        return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
    } catch (e) { var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
}
function _vcApi(metodo, url, corpo) {
    return fetch(url, {
        method: metodo, cache: 'no-store',
        headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
        body: corpo ? JSON.stringify(corpo) : undefined
    }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
            if (!r.ok) throw new Error(j.erro || ('Erro ' + r.status));
            return j;
        });
    });
}
function vcLinkIngresso(id) {
    return location.origin + location.pathname.replace(/[^\/]*$/, '') + 'ingresso.html?id=' + id;
}

// ---- QR Code (carrega a biblioteca sozinho se a página ainda não tiver) -------
var _vcFilaQR = null;
function _vcGarantirQR(depois) {
    if (window.QRCode) { depois(); return; }
    if (_vcFilaQR) { _vcFilaQR.push(depois); return; }
    _vcFilaQR = [depois];
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = function () { var f = _vcFilaQR; _vcFilaQR = null; f.forEach(function (fn) { fn(); }); };
    s.onerror = function () { _vcFilaQR = null; };
    document.head.appendChild(s);
}
function vcQrDataUrl(id, lado) {
    var chave = id + ':' + lado;
    if (_vcQrCache[chave]) return _vcQrCache[chave];
    if (!window.QRCode) return '';
    var caixa = document.createElement('div');
    new QRCode(caixa, { text: vcLinkIngresso(id), width: lado, height: lado, correctLevel: QRCode.CorrectLevel.M });
    var c = caixa.querySelector('canvas');
    var url = c ? c.toDataURL('image/png') : '';
    if (url) _vcQrCache[chave] = url;
    return url;
}

function vcRecarregarTudo() { _vcInstancias.forEach(function (i) { i.recarregar(); }); }
window._vcRecarregar = vcRecarregarTudo;

// ---- Gerar os ingressos da turma toda (o servidor já confere e aprova os que baterem) ----
// Cria o ingresso de cada aluno confirmado pelo Clube da Maré que ainda não tem um.
function vcGerarLote(turma, escola) {
    return _vcApi('POST', '/api/ingressos', { acao: 'gerar-lote', turma: turma, escola: escola || '' })
        .then(function (r) { vcRecarregarTudo(); return r; });
}

function _vcCss() {
    if (document.getElementById('vc-css')) return;
    var st = document.createElement('style');
    st.id = 'vc-css';
    st.textContent =
        '.vc-caixa{margin-top:30px;padding:20px;background:rgba(255,255,255,.05);border-radius:12px;}' +
        '.vc-caixa.interno{margin-top:14px;padding:0;background:none;}' +
        '.vc-filtros{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0;}' +
        '.vc-filtros label{display:flex;flex-direction:column;gap:4px;font-weight:700;font-size:.9rem;flex:1 1 220px;}' +
        '.vc-filtros select{padding:10px 12px;border-radius:8px;width:100%;}' +
        '.vc-visita{padding:12px 14px;border-radius:10px;margin:8px 0 14px;background:rgba(255,255,255,.08);border-left:5px solid #ffc800;line-height:1.5;}' +
        '.vc-visita.ok{border-left-color:#19d263;}.vc-visita.sem{border-left-color:#ff5a5a;}' +
        '.vc-cards{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0;}' +
        '.vc-card{flex:1 1 110px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.08);text-align:center;}' +
        '.vc-card b{display:block;font-size:1.6rem;line-height:1.1;}.vc-card span{font-size:.8rem;opacity:.85;}' +
        '.vc-momentos{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0;}' +
        '.vc-mom{flex:1 1 140px;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.35);background:transparent;color:inherit;cursor:pointer;text-align:center;font-weight:700;}' +
        '.vc-mom small{display:block;font-weight:400;opacity:.85;margin-top:2px;}' +
        '.vc-mom.ativo{background:#19d263;border-color:#19d263;color:#06210f;}' +
        '.vc-busca{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:8px;margin:6px 0 10px;}' +
        '.vc-linha{display:flex;align-items:center;gap:12px;padding:10px 12px;margin:6px 0;border-radius:10px;background:rgba(255,255,255,.08);}' +
        '.vc-nome{flex:1;min-width:0;}.vc-nome strong{display:block;}.vc-nome small{opacity:.85;display:block;line-height:1.35;}' +
        '.vc-p{min-width:46px;height:36px;border-radius:8px;border:2px solid rgba(255,255,255,.45);background:transparent;color:inherit;font-weight:800;font-size:1rem;}' +
        'button.vc-p{cursor:pointer;}.vc-p.sim{background:#19d263;border-color:#19d263;color:#06210f;}' +
        '.vc-ing{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:12px;margin:8px 0;border-radius:10px;background:rgba(255,255,255,.08);}' +
        '.vc-ing img{width:96px;height:96px;border-radius:8px;background:#fff;padding:4px;}' +
        '.vc-ing .vc-qr-vazio{width:96px;height:96px;border-radius:8px;border:2px dashed rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;text-align:center;font-size:.7rem;padding:6px;box-sizing:border-box;}' +
        '.vc-tag{display:inline-block;padding:2px 9px;border-radius:99px;font-weight:700;font-size:.8rem;}' +
        '.vc-tag.Aprovado{background:#19d263;color:#06210f;}.vc-tag.Pendente{background:#ffc800;color:#3a2c00;}.vc-tag.Recusado{background:#ff5a5a;color:#fff;}' +
        '.vc-btn{background:#19d263;color:#06210f;border:none;border-radius:8px;padding:9px 14px;font-weight:700;cursor:pointer;}' +
        '.vc-btn.sec{background:transparent;color:inherit;border:1px solid rgba(255,255,255,.4);}' +
        '.vc-btn:disabled{opacity:.6;cursor:wait;}' +
        '.vc-acoes{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0;}' +
        '.vc-botoes{display:flex;flex-wrap:wrap;gap:6px;}' +
        '.vc-msg{margin:8px 0;font-weight:700;min-height:1.2em;}' +
        '.vc-nota{font-size:.85rem;opacity:.85;margin:4px 0 0;}';
    document.head.appendChild(st);
}

function iniciarVisitaClube(cfg) {
    var raiz = document.getElementById(cfg.destino);
    if (!raiz) return null;
    _vcCss();

    var modo = cfg.modo === 'chamada' ? 'chamada' : 'ingressos';
    var perfil = cfg.perfil;
    var dev = perfil === 'desenvolvedor';
    var editavel = modo === 'chamada' && perfil === 'professor';
    var externo = !!cfg.filtrosExternos;

    var P = {
        dados: { ingressos: [], visitas: [], turmas: [], escolas: [] },
        chamada: {}, escola: '', turma: '', escolaEscolhida: false,
        momento: 'd1-chegada', momentoEscolhido: false, busca: '',
        assinatura: '', carregou: false
    };
    var q = function (sel) { return raiz.querySelector(sel); };

    // ---- casca da tela (montada uma vez) ----
    var titulo = modo === 'chamada'
        ? '<i class="fa-solid fa-clipboard-check" aria-hidden="true"></i> Chamada da visita'
        : '<i class="fa-solid fa-ticket" aria-hidden="true"></i> Ingressos da turma';
    var dica = modo === 'chamada'
        ? (editavel
            ? 'Escolha a escola e a turma e faça a <strong>chamada</strong>: toque no <strong>P</strong> de cada aluno quando ele <strong>chegar ao Clube da Maré (dia 1)</strong> e quando <strong>voltar para a escola (dia 2)</strong>. A hora é registrada sozinha — você não digita nada.'
            : 'Escolha a escola e a turma para ver o que o professor/monitor já marcou na chamada: quem chegou ao Clube da Maré (dia 1) e quem voltou para a escola (dia 2). A tela se atualiza sozinha.')
        : 'Escolha a escola e a turma para ver os ingressos de quem vai. O sistema confere cada ingresso sozinho com os painéis (aluno confirmado e visita aprovada pelo Clube) — não precisa aprovar nada.';

    var html = '<section class="vc-caixa' + (externo ? ' interno' : '') + '">';
    if (!externo) {
        html += '<h2>' + titulo + '</h2><p class="dica-importar">' + dica + '</p>' +
            '<div class="vc-filtros">' +
            '<label>Escola<select class="vc-escola form-login-campo"></select></label>' +
            '<label>Turma<select class="vc-turma form-login-campo"></select></label></div>' +
            '<div class="vc-visita"></div>';
    }
    html += '<div class="vc-msg" role="status"></div>';
    if (modo === 'chamada') {
        html += '<div class="vc-momentos"></div>' +
            '<input class="vc-busca form-login-campo" type="search" placeholder="🔍 Buscar aluno pelo nome" autocomplete="off">' +
            '<div class="vc-lista"></div><div class="vc-totais vc-cards"></div>' +
            '<p class="vc-nota">' + (editavel ? 'Salva automaticamente. Para desfazer uma marcação errada, toque no P de novo.' : 'Somente leitura: quem marca é o professor/monitor da turma.') + '</p>';
    } else {
        html += '<div class="vc-painel"></div>';
    }
    raiz.innerHTML = html + '</section>';

    // ---- dados derivados ----
    function visitaDaTurma() {
        var t = _vcTurma(P.turma);
        var c = P.dados.visitas.filter(function (v) { return _vcTurma(v.turma) === t; });
        if (P.escola) { var m = c.filter(function (v) { return _vcIgual(v.escola, P.escola); }); if (m.length) c = m; }
        c.sort(function (a, b) {
            var na = a.status === 'Aprovado' ? 0 : 1, nb = b.status === 'Aprovado' ? 0 : 1;
            return na - nb || (a.dataInicio < b.dataInicio ? -1 : 1);
        });
        return c[0] || null;
    }
    function ingressosFiltrados() {
        var t = _vcTurma(P.turma);
        return P.dados.ingressos.filter(function (i) {
            if (t && _vcTurma(i.turma) !== t) return false;
            if (P.escola && i.escola && !_vcIgual(i.escola, P.escola)) return false;
            return true;
        });
    }
    function opcoesTurma() {
        var lista = [];
        function somar(t) { t = _vcTurma(t); if (t && lista.indexOf(t) === -1) lista.push(t); }
        if (perfil === 'professor') (cfg.turmas || []).forEach(somar);
        else { P.dados.turmas.forEach(somar); (cfg.turmas || []).forEach(somar); }
        return lista.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
    }
    function preencher(sel, opcoes, atual) {
        var h = opcoes.map(function (o) { return '<option value="' + _vcEsc(o.v) + '">' + _vcEsc(o.t) + '</option>'; }).join('');
        if (sel.innerHTML !== h) sel.innerHTML = h;
        sel.value = atual;
    }
    function aviso(t) { q('.vc-msg').textContent = t || ''; }

    // ---- desenho ----
    function desenhar(limparMsg) {
        if (limparMsg) aviso('');
        if (!externo) {
            var escolas = P.dados.escolas.slice();
            if (P.escola && escolas.indexOf(P.escola) === -1) P.escola = '';
            if (!P.escolaEscolhida && !P.escola && escolas.length === 1) P.escola = escolas[0];
            preencher(q('.vc-escola'), [{ v: '', t: 'Todas as escolas' }].concat(escolas.map(function (e) { return { v: e, t: e }; })), P.escola);
            var turmas = opcoesTurma();
            if (!P.turma || turmas.indexOf(P.turma) === -1) {
                var comIng = turmas.filter(function (t) { return P.dados.ingressos.some(function (i) { return _vcTurma(i.turma) === t; }); })[0];
                P.turma = comIng || turmas[0] || '';
            }
            preencher(q('.vc-turma'), turmas.length ? turmas.map(function (t) { return { v: t, t: t }; }) : [{ v: '', t: 'Nenhuma turma ainda' }], P.turma);

            var v = P.turma ? visitaDaTurma() : null;
            var caixa = q('.vc-visita');
            if (!P.turma) {
                caixa.className = 'vc-visita'; caixa.innerHTML = '';
            } else if (v && v.status === 'Aprovado') {
                var periodo = typeof agPeriodoTexto === 'function' ? agPeriodoTexto(v) : v.dataInicio + ' e ' + v.dataFim;
                caixa.className = 'vc-visita ok';
                caixa.innerHTML = '🟢 <strong>Visita aprovada pelo Clube da Maré</strong><br>🏫 ' + _vcEsc(v.escola || 'Escola não informada') +
                    '<br>📅 ' + _vcEsc(periodo) + ' (2 dias)<br>🕗 Entrada <strong>' + _vcEsc(v.entrada) + '</strong> · Saída <strong>' + _vcEsc(v.saida) + '</strong>' +
                    (v.saidaAlterada ? ' <span class="vc-nota">(saída concedida pelo Clube; a direção pediu ' + _vcEsc(v.saidaPedida) + ')</span>' : ' <span class="vc-nota">(saída concedida pelo Clube)</span>');
            } else if (v) {
                caixa.className = 'vc-visita';
                caixa.innerHTML = '🟡 A visita da turma <strong>' + _vcEsc(P.turma) + '</strong> ainda está <strong>aguardando a aprovação do Clube da Maré</strong>.';
            } else {
                caixa.className = 'vc-visita sem';
                caixa.innerHTML = '📅 A turma <strong>' + _vcEsc(P.turma) + '</strong> ainda não tem visita agendada pela Diretoria.';
            }
        }
        // momento sugerido pelo dia de hoje (só até a pessoa escolher um)
        if (modo === 'chamada' && !P.momentoEscolhido) {
            var vis = P.turma ? visitaDaTurma() : null;
            var hoje = typeof agHoje === 'function' ? agHoje() : '';
            P.momento = (vis && vis.status === 'Aprovado' && hoje && hoje >= vis.dataFim) ? 'd2-retorno' : 'd1-chegada';
        }
        if (modo === 'chamada') desenharChamada(); else desenharIngressos();
    }

    function desenharIngressos() {
        var area = q('.vc-painel');
        if (externo && !P.turma) { area.innerHTML = '<p>Selecione uma turma acima para ver os ingressos dela.</p>'; return; }
        var lista = ingressosFiltrados();
        var aprov = lista.filter(function (i) { return i.status === 'Aprovado'; }).length;
        var pend = lista.filter(function (i) { return i.status === 'Pendente'; }).length;
        var html = '<div class="vc-cards">' +
            '<div class="vc-card"><b>' + lista.length + '</b><span>Ingressos da turma</span></div>' +
            '<div class="vc-card"><b>' + aprov + '</b><span>Verificados (QR liberado)</span></div>' +
            '<div class="vc-card"><b>' + pend + '</b><span>Aguardando verificação</span></div></div>';

        var acoes = '';
        if (dev) acoes += '<button type="button" class="vc-btn" data-acao="gerar"' + (P.turma ? '' : ' disabled') + '>🎟️ Gerar ingressos da turma' + (P.turma ? ' (' + _vcEsc(P.turma) + ')' : '') + '</button>';
        if (aprov) acoes += '<button type="button" class="vc-btn sec" data-acao="imprimir">🖨️ Imprimir / salvar PDF dos QR Codes</button>';
        if (acoes) html += '<div class="vc-acoes">' + acoes + '</div>';

        if (!lista.length) {
            html += '<p>Nenhum ingresso para esta turma' + (P.escola ? ' nesta escola' : '') + ' ainda. Os ingressos são gerados quando o Clube da Maré aprova a visita da turma' +
                (dev ? ' (ou use o botão acima).' : '.') + '</p>';
        }
        var precisaQR = false;
        html += lista.map(function (i) {
            var img;
            if (i.status === 'Aprovado') {
                var url = vcQrDataUrl(i.id, 160);
                if (url) img = '<img src="' + url + '" alt="QR Code de ' + _vcEsc(i.nome) + '">';
                else { precisaQR = true; img = '<div class="vc-qr-vazio">Gerando QR...</div>'; }
            } else {
                img = '<div class="vc-qr-vazio">' + (i.status === 'Recusado' ? 'Ingresso cancelado' : 'QR libera quando o sistema conferir') + '</div>';
            }
            var botoes = '<a class="vc-btn sec" style="text-decoration:none;" target="_blank" rel="noopener" href="' + _vcEsc(vcLinkIngresso(i.id)) + '">Abrir ingresso</a>';
            if (dev) {
                botoes += i.status === 'Recusado'
                    ? '<button type="button" class="vc-btn sec" data-reativar="' + _vcEsc(i.id) + '">Reativar</button>'
                    : '<button type="button" class="vc-btn sec" data-cancelar="' + _vcEsc(i.id) + '">Cancelar</button>';
                botoes += '<button type="button" class="vc-btn sec" data-apagar="' + _vcEsc(i.id) + '">Apagar</button>';
            }
            return '<div class="vc-ing">' + img + '<div class="vc-nome"><strong>' + _vcEsc(i.nome) + '</strong>' +
                '<small>' + _vcEsc(i.tipo || 'Aluno') + ' · Turma ' + _vcEsc(i.turma) + (i.escola ? ' · ' + _vcEsc(i.escola) : '') + (i.ra ? ' · RA ' + _vcEsc(i.ra) : '') + '</small>' +
                '<span class="vc-tag ' + _vcEsc(i.status) + '">' + _vcEsc(VC_ROTULO_STATUS[i.status] || i.status) + '</span></div>' +
                '<div class="vc-botoes">' + botoes + '</div></div>';
        }).join('');
        area.innerHTML = html;
        if (precisaQR) _vcGarantirQR(desenharIngressos);
    }

    function aprovadosDaTurma() { return ingressosFiltrados().filter(function (i) { return i.status === 'Aprovado'; }); }
    function marcou(id, m) { return !!(P.chamada[id] && P.chamada[id][m]); }

    function desenharChamada() {
        var alunos = P.turma || !externo ? aprovadosDaTurma() : [];
        var atual = VC_MOMENTOS.filter(function (m) { return m.chave === P.momento; })[0] || VC_MOMENTOS[0];

        q('.vc-momentos').innerHTML = VC_MOMENTOS.map(function (m) {
            var n = alunos.filter(function (a) { return marcou(a.id, m.chave); }).length;
            return '<button type="button" class="vc-mom' + (m.chave === atual.chave ? ' ativo' : '') + '" data-momento="' + m.chave + '">' +
                _vcEsc(m.rotulo) + '<small>' + n + ' de ' + alunos.length + (m.tipo === 'chegada' ? ' chegaram' : ' voltaram') + '</small></button>';
        }).join('');

        var termo = P.busca.trim().toLowerCase();
        var vis = alunos.filter(function (a) { return !termo || String(a.nome).toLowerCase().indexOf(termo) !== -1; });
        var presentes = alunos.filter(function (a) { return marcou(a.id, atual.chave); }).length;

        var html = '';
        if (!alunos.length) {
            html = '<p>Nenhum aluno com ingresso <strong>verificado</strong> nesta turma ainda. A chamada só lista quem tem o ingresso conferido pelo sistema (aluno confirmado e visita aprovada pelo Clube da Maré).</p>';
        } else if (editavel) {
            html += '<div class="vc-acoes"><button type="button" class="vc-btn sec" data-acao="marcar-todos">Marcar todos como presentes (' + _vcEsc(atual.curto) + ')</button></div>';
        }
        html += vis.map(function (a) {
            var marcas = P.chamada[a.id] || {};
            var resumo = VC_MOMENTOS.filter(function (m) { return marcas[m.chave]; }).map(function (m) {
                return _vcEsc(m.curto) + ' ' + _vcHora(marcas[m.chave].em);
            }).join(' · ');
            var m = marcas[atual.chave];
            var botao = editavel
                ? '<button type="button" class="vc-p' + (m ? ' sim' : '') + '" data-aluno="' + _vcEsc(a.id) + '" aria-pressed="' + (m ? 'true' : 'false') + '" aria-label="' + _vcEsc(atual.rotulo) + ': ' + _vcEsc(a.nome) + '">P</button>'
                : '<span class="vc-p' + (m ? ' sim' : '') + '" style="display:inline-flex;align-items:center;justify-content:center;" title="' + (m ? 'Marcado' : 'Ainda não marcado') + '">' + (m ? 'P' : '–') + '</span>';
            return '<div class="vc-linha"><i class="fa-solid fa-circle-user" style="font-size:1.7rem;" aria-hidden="true"></i>' +
                '<div class="vc-nome"><strong>' + _vcEsc(a.nome) + '</strong><small>' + _vcEsc(a.tipo || 'Aluno') +
                (m ? ' · ' + (atual.tipo === 'chegada' ? 'chegou' : 'voltou') + ' às ' + _vcHora(m.em) + (m.por ? ' (marcado por ' + _vcEsc(m.por) + ')' : '') : ' · ainda não marcado') + '</small>' +
                (resumo && VC_MOMENTOS.length > 1 && Object.keys(marcas).length > 1 ? '<small>' + resumo + '</small>' : '') + '</div>' + botao + '</div>';
        }).join('');
        if (alunos.length && !vis.length) html += '<p>Nenhum aluno com esse nome.</p>';
        q('.vc-lista').innerHTML = html;

        q('.vc-totais').innerHTML =
            '<div class="vc-card"><b>' + presentes + '</b><span>' + (atual.tipo === 'chegada' ? 'Chegaram' : 'Voltaram') + '</span></div>' +
            '<div class="vc-card"><b>' + (alunos.length - presentes) + '</b><span>' + (atual.tipo === 'chegada' ? 'Faltam chegar' : 'Faltam voltar') + '</span></div>' +
            '<div class="vc-card"><b>' + alunos.length + '</b><span>Total com ingresso</span></div>';
    }

    function marcar(ids, momento, presente) {
        var agora = Date.now();
        var antes = JSON.parse(JSON.stringify(P.chamada));
        ids.forEach(function (id) {
            if (!P.chamada[id]) P.chamada[id] = {};
            if (presente) { if (!P.chamada[id][momento] || ids.length === 1) P.chamada[id][momento] = { em: agora, por: cfg.nome || '' }; }
            else delete P.chamada[id][momento];
        });
        desenharChamada();
        var corpo = { marca: momento, presente: presente, por: cfg.nome || '' };
        if (ids.length === 1) corpo.ingressoId = ids[0]; else corpo.ingressoIds = ids;
        return _vcApi('POST', '/api/chamada', corpo).then(function () { P.assinatura = ''; }).catch(function (e) {
            P.chamada = antes;   // não gravou: volta como estava
            desenharChamada();
            aviso('Não consegui salvar a marcação (' + e.message + '). Tente de novo.');
        });
    }

    function imprimir() {
        var lista = aprovadosDaTurma();
        if (!lista.length) return;
        var v = visitaDaTurma();
        var cab = '<h1>Clube da Maré — Ingressos da turma ' + _vcEsc(P.turma) + '</h1>' +
            (v && v.status === 'Aprovado' ? '<p>' + _vcEsc(v.escola) + ' · ' + _vcEsc(typeof agPeriodoTexto === 'function' ? agPeriodoTexto(v) : '') + ' · Entrada ' + _vcEsc(v.entrada) + ' · Saída ' + _vcEsc(v.saida) + '</p>' : '');
        var cartoes = lista.map(function (i) {
            return '<div class="c"><img src="' + vcQrDataUrl(i.id, 240) + '" alt=""><b>' + _vcEsc(i.nome) + '</b><small>' + _vcEsc(i.tipo || 'Aluno') + ' · ' + _vcEsc(i.turma) +
                '<br>' + _vcEsc(i.escola || '') + '<br>Ingresso #' + _vcEsc(String(i.id).slice(0, 6).toUpperCase()) + '</small></div>';
        }).join('');
        var w = window.open('', '_blank');
        if (!w) { aviso('O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente de novo.'); return; }
        w.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Ingressos ' + _vcEsc(P.turma) + '</title><style>' +
            'body{font-family:Arial,sans-serif;margin:16px;color:#0b2a5b}h1{font-size:1.3rem;margin:0 0 4px}p{margin:0 0 14px}' +
            '.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}' +
            '.c{border:2px solid #0b2a5b;border-radius:12px;padding:10px;text-align:center;break-inside:avoid}' +
            '.c img{width:150px;height:150px}.c b{display:block;margin-top:6px}.c small{color:#44536b}' +
            '</style></head><body>' + cab + '<div class="g">' + cartoes + '</div><script>window.onload=function(){setTimeout(function(){window.print();},400);};<\/script></body></html>');
        w.document.close();
    }

    // ---- eventos ----
    raiz.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.momento) { P.momento = b.dataset.momento; P.momentoEscolhido = true; desenharChamada(); return; }
        if (b.dataset.aluno && editavel) { marcar([b.dataset.aluno], P.momento, !marcou(b.dataset.aluno, P.momento)); return; }
        if (b.dataset.acao === 'marcar-todos' && editavel) {
            var faltam = aprovadosDaTurma().filter(function (a) { return !marcou(a.id, P.momento); }).map(function (a) { return a.id; });
            if (!faltam.length) { aviso('Todos já estão marcados.'); return; }
            if (confirm('Marcar os ' + faltam.length + ' alunos que faltam como presentes agora? Confira se todos realmente estão com você.')) marcar(faltam, P.momento, true);
        } else if (b.dataset.acao === 'imprimir') {
            _vcGarantirQR(imprimir);
        } else if (b.dataset.acao === 'gerar' && dev) {
            if (!P.turma) return;
            b.disabled = true; aviso('Gerando os ingressos e conferindo com os painéis...');
            vcGerarLote(P.turma, P.escola).then(function (r) {
                aviso('✅ ' + r.criados + ' ingresso(s) novo(s). ' + r.aprovados + ' verificado(s) e liberado(s)' + (r.pendentes ? ', ' + r.pendentes + ' aguardando a confirmação do aluno/visita' : '') + '.');
            }).catch(function (err) { aviso('Não foi possível gerar: ' + err.message); b.disabled = false; });
        } else if (dev && (b.dataset.cancelar || b.dataset.reativar)) {
            var idc = b.dataset.cancelar || b.dataset.reativar;
            _vcApi('POST', '/api/ingressos', { id: idc, status: b.dataset.cancelar ? 'Recusado' : 'Pendente' })
                .then(vcRecarregarTudo).catch(function (err) { aviso(err.message); });
        } else if (dev && b.dataset.apagar) {
            if (confirm('Apagar este ingresso?')) _vcApi('DELETE', '/api/ingressos?id=' + encodeURIComponent(b.dataset.apagar)).then(vcRecarregarTudo).catch(function (err) { aviso(err.message); });
        }
    });
    if (!externo) {
        q('.vc-escola').addEventListener('change', function () { P.escola = this.value; P.escolaEscolhida = true; P.momentoEscolhido = false; desenhar(true); });
        q('.vc-turma').addEventListener('change', function () { P.turma = this.value; P.momentoEscolhido = false; desenhar(true); });
    }
    if (modo === 'chamada') q('.vc-busca').addEventListener('input', function () { P.busca = this.value; desenharChamada(); });

    // ---- carregar e atualizar sozinho ----
    function carregar() {
        var pedidos = [_vcApi('GET', '/api/ingressos')];
        if (modo === 'chamada') pedidos.push(_vcApi('GET', '/api/chamada'));
        return Promise.all(pedidos).then(function (r) {
            var ass = JSON.stringify(r);
            if (P.carregou && ass === P.assinatura) return;
            P.assinatura = ass; P.carregou = true;
            P.dados = { ingressos: r[0].ingressos || [], visitas: r[0].visitas || [], turmas: r[0].turmas || [], escolas: r[0].escolas || [] };
            if (r[1]) { P.chamada = {}; (r[1].registros || []).forEach(function (x) { P.chamada[x.ingressoId] = x.marcas || {}; }); }
            desenhar(false);
        }).catch(function (e) { aviso('Não foi possível carregar agora (' + e.message + '). Tentando de novo...'); });
    }

    var api = {
        recarregar: function () { P.assinatura = ''; return carregar(); },
        definirFiltro: function (escola, turma) {
            P.escola = escola || ''; P.turma = turma ? _vcTurma(turma) : ''; P.escolaEscolhida = true; P.momentoEscolhido = false;
            if (P.carregou) desenhar(true);
        }
    };
    _vcInstancias.push(api);
    carregar();
    setInterval(function () { if (!document.hidden) carregar(); }, VC_INTERVALO_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) carregar(); });
    return api;
}
