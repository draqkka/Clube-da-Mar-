// ==========================================================================
// INGRESSOS + CHAMADA DA VISITA AO CLUBE DA MARÉ (painéis do professor/monitor,
// da Diretoria e do Desenvolvedor — o aluno não usa este módulo).
//
// O que aparece aqui:
//   1) Escola e turma: todos escolhem nos dois seletores (professor só vê as
//      turmas dele). Tudo abaixo é filtrado por eles.
//   2) Resumo da VISITA da turma: escola, os 2 dias, entrada e a saída que o
//      Clube da Maré concedeu à Diretoria.
//   3) INGRESSOS da turma (quem vai), com QR Code de cada um.
//      O Desenvolvedor também tem "Aprovar todos e gerar QR Codes".
//   4) CHAMADA (checklist) em 2 momentos: chegada ao Clube (dia 1) e volta
//      à escola (dia 2). Só o PROFESSOR/MONITOR marca (um toque no botão P). A hora é
//      gravada sozinha pelo servidor — ninguém digita nada. Diretoria e
//      Desenvolvedor veem em tempo real, só leitura.
//
// Como usar na página (precisa de agendamentos-local.js carregado antes):
//   <div id="visita-clube"></div>
//   <script src="visita-clube.js"></script>
//   <script>iniciarVisitaClube({ destino: 'visita-clube', perfil: 'professor',
//            nome: sessao.nome, turmas: sessao.turmas });</script>
// ==========================================================================
var VC_MOMENTOS = [
    { chave: 'd1-chegada', dia: 1, tipo: 'chegada', rotulo: 'Dia 1 · Chegada ao Clube', curto: 'Dia 1 · Chegou' },
    { chave: 'd2-retorno', dia: 2, tipo: 'retorno', rotulo: 'Dia 2 · Volta à escola', curto: 'Dia 2 · Voltou' }
];
var VC_INTERVALO_MS = 5000;

var _vc = {
    cfg: null, raiz: null,
    dados: { ingressos: [], visitas: [], turmas: [], escolas: [] },
    chamada: {},            // ingressoId -> { momento: { em, por } }
    escola: '', turma: '', aba: 'ingressos', momento: 'd1-chegada', busca: '',
    momentoEscolhido: false, assinatura: '', carregou: false, qr: {}, timer: null
};

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
function _vcGarantirQR(depois) {
    if (window.QRCode) { depois(); return; }
    if (_vc._carregandoQR) { _vc._carregandoQR.push(depois); return; }
    _vc._carregandoQR = [depois];
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = function () { var f = _vc._carregandoQR; _vc._carregandoQR = null; f.forEach(function (fn) { fn(); }); };
    s.onerror = function () { _vc._carregandoQR = null; };
    document.head.appendChild(s);
}
function vcQrDataUrl(id, lado) {
    var chave = id + ':' + lado;
    if (_vc.qr[chave]) return _vc.qr[chave];
    if (!window.QRCode) return '';
    var caixa = document.createElement('div');
    new QRCode(caixa, { text: vcLinkIngresso(id), width: lado, height: lado, correctLevel: QRCode.CorrectLevel.M });
    var c = caixa.querySelector('canvas');
    var url = c ? c.toDataURL('image/png') : '';
    if (url) _vc.qr[chave] = url;
    return url;
}

// ---- Gerar ingressos da turma toda (usado pelo painel do Desenvolvedor) -------
// aprovar = false: só cria os ingressos (Pendente). aprovar = true: cria e APROVA todos.
function vcGerarLote(turma, escola, aprovar) {
    return _vcApi('POST', '/api/ingressos', { acao: 'gerar-lote', turma: turma, escola: escola || '', aprovar: !!aprovar })
        .then(function (r) { if (window._vcRecarregar) window._vcRecarregar(); return r; });
}

// ---- dados derivados ----------------------------------------------------------
function _vcVisita(turma, escola) {
    var t = _vcTurma(turma);
    var c = _vc.dados.visitas.filter(function (v) { return _vcTurma(v.turma) === t; });
    if (escola) { var m = c.filter(function (v) { return _vcIgual(v.escola, escola); }); if (m.length) c = m; }
    c.sort(function (a, b) {
        var na = a.status === 'Aprovado' ? 0 : 1, nb = b.status === 'Aprovado' ? 0 : 1;
        return na - nb || (a.dataInicio < b.dataInicio ? -1 : 1);
    });
    return c[0] || null;
}
function _vcIngressosFiltrados() {
    var t = _vcTurma(_vc.turma);
    return _vc.dados.ingressos.filter(function (i) {
        if (t && _vcTurma(i.turma) !== t) return false;
        if (_vc.escola && i.escola && !_vcIgual(i.escola, _vc.escola)) return false;
        return true;
    });
}
function _vcOpcoesTurma() {
    var lista = [];
    function somar(t) { t = _vcTurma(t); if (t && lista.indexOf(t) === -1) lista.push(t); }
    if (_vc.cfg.perfil === 'professor') {
        (_vc.cfg.turmas || []).forEach(somar);
    } else {
        _vc.dados.turmas.forEach(somar);
        (_vc.cfg.turmas || []).forEach(somar);
    }
    return lista.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
}

// ---- casca da tela (montada uma vez) ------------------------------------------
function _vcCss() {
    if (document.getElementById('vc-css')) return;
    var st = document.createElement('style');
    st.id = 'vc-css';
    st.textContent =
        '.vc-caixa{margin-top:30px;padding:20px;background:rgba(255,255,255,.05);border-radius:12px;}' +
        '.vc-filtros{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0;}' +
        '.vc-filtros label{display:flex;flex-direction:column;gap:4px;font-weight:700;font-size:.9rem;flex:1 1 220px;}' +
        '.vc-filtros select{padding:10px 12px;border-radius:8px;width:100%;}' +
        '.vc-visita{padding:12px 14px;border-radius:10px;margin:8px 0 14px;background:rgba(255,255,255,.08);border-left:5px solid #ffc800;line-height:1.5;}' +
        '.vc-visita.ok{border-left-color:#19d263;}.vc-visita.sem{border-left-color:#ff5a5a;}' +
        '.vc-abas{display:flex;gap:8px;margin:6px 0 14px;flex-wrap:wrap;}' +
        '.vc-aba{flex:1 1 150px;padding:11px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.35);background:transparent;color:inherit;font-weight:700;cursor:pointer;font-size:1rem;}' +
        '.vc-aba.ativa{background:#0a5cff;border-color:#0a5cff;color:#fff;}' +
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
        '.vc-msg{margin:8px 0;font-weight:700;min-height:1.2em;}' +
        '.vc-nota{font-size:.85rem;opacity:.85;margin:4px 0 0;}';
    document.head.appendChild(st);
}

function iniciarVisitaClube(cfg) {
    var raiz = document.getElementById(cfg.destino);
    if (!raiz) return;
    _vc.cfg = cfg; _vc.raiz = raiz;
    _vc.cfg.editavel = cfg.perfil === 'professor';
    _vcCss();
    raiz.innerHTML =
        '<section class="vc-caixa">' +
        '<h2><i class="fa-solid fa-ticket" aria-hidden="true"></i> Ingressos e chamada da visita</h2>' +
        '<p class="dica-importar">' + (_vc.cfg.editavel
            ? 'Escolha a escola e a turma. Aqui você vê os ingressos de quem vai e faz a <strong>chamada</strong>: toque no <strong>P</strong> de cada aluno quando ele chegar ao Clube da Maré e quando voltar para a escola. A hora é registrada sozinha — você não digita nada.'
            : 'Escolha a escola e a turma para ver os ingressos de quem vai e o que o professor/monitor já marcou na chamada. A tela se atualiza sozinha.') + '</p>' +
        '<div class="vc-filtros">' +
        '<label>Escola<select id="vc-escola" class="form-login-campo"></select></label>' +
        '<label>Turma<select id="vc-turma" class="form-login-campo"></select></label></div>' +
        '<div id="vc-visita"></div>' +
        '<div class="vc-abas"><button type="button" class="vc-aba" data-aba="ingressos">🎟️ Ingressos da turma</button>' +
        '<button type="button" class="vc-aba" data-aba="chamada">✅ Chamada (chegada e volta)</button></div>' +
        '<div id="vc-msg" class="vc-msg" role="status"></div>' +
        '<div id="vc-painel-ingressos"></div>' +
        '<div id="vc-painel-chamada" hidden>' +
        '<div id="vc-momentos" class="vc-momentos"></div>' +
        '<input id="vc-busca" class="vc-busca form-login-campo" type="search" placeholder="🔍 Buscar aluno pelo nome" autocomplete="off">' +
        '<div id="vc-lista-chamada"></div>' +
        '<div id="vc-totais" class="vc-cards"></div>' +
        '<p class="vc-nota">' + (_vc.cfg.editavel ? 'Salva automaticamente. Para desfazer uma marcação errada, toque no P de novo.' : 'Somente leitura: quem marca é o professor/monitor da turma.') + '</p>' +
        '</div></section>';

    document.getElementById('vc-escola').addEventListener('change', function () { _vc.escola = this.value; _vc.escolaEscolhida = true; _vc.momentoEscolhido = false; _vcDesenhar(true); });
    document.getElementById('vc-turma').addEventListener('change', function () { _vc.turma = this.value; _vc.momentoEscolhido = false; _vcDesenhar(true); });
    document.getElementById('vc-busca').addEventListener('input', function () { _vc.busca = this.value; _vcDesenharChamada(); });
    raiz.addEventListener('click', _vcClique);

    window._vcRecarregar = _vcCarregar;
    _vcCarregar();
    _vc.timer = setInterval(function () { if (!document.hidden) _vcCarregar(); }, VC_INTERVALO_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) _vcCarregar(); });
}

function _vcCarregar() {
    return Promise.all([_vcApi('GET', '/api/ingressos'), _vcApi('GET', '/api/chamada')]).then(function (r) {
        var ass = JSON.stringify([r[0], r[1]]);
        if (_vc.carregou && ass === _vc.assinatura) return;
        _vc.assinatura = ass; _vc.carregou = true;
        _vc.dados = { ingressos: r[0].ingressos || [], visitas: r[0].visitas || [], turmas: r[0].turmas || [], escolas: r[0].escolas || [] };
        _vc.chamada = {};
        (r[1].registros || []).forEach(function (x) { _vc.chamada[x.ingressoId] = x.marcas || {}; });
        _vcDesenhar(false);
    }).catch(function (e) {
        document.getElementById('vc-msg').textContent = 'Não foi possível carregar agora (' + e.message + '). Tentando de novo...';
    });
}

function _vcPreencherSelect(sel, opcoes, atual) {
    var html = opcoes.map(function (o) { return '<option value="' + _vcEsc(o.v) + '">' + _vcEsc(o.t) + '</option>'; }).join('');
    if (sel.innerHTML !== html) sel.innerHTML = html;
    sel.value = atual;
}

function _vcDesenhar(limparMsg) {
    if (limparMsg) document.getElementById('vc-msg').textContent = '';
    // escola
    var escolas = _vc.dados.escolas.slice();
    if (_vc.escola && escolas.indexOf(_vc.escola) === -1) _vc.escola = '';
    if (!_vc.escolaEscolhida && !_vc.escola && escolas.length === 1) _vc.escola = escolas[0];
    _vcPreencherSelect(document.getElementById('vc-escola'),
        [{ v: '', t: 'Todas as escolas' }].concat(escolas.map(function (e) { return { v: e, t: e }; })), _vc.escola);
    // turma
    var turmas = _vcOpcoesTurma();
    if (!_vc.turma || turmas.indexOf(_vc.turma) === -1) {
        var comIng = turmas.filter(function (t) { return _vc.dados.ingressos.some(function (i) { return _vcTurma(i.turma) === t; }); })[0];
        _vc.turma = comIng || turmas[0] || '';
    }
    _vcPreencherSelect(document.getElementById('vc-turma'),
        turmas.length ? turmas.map(function (t) { return { v: t, t: t }; }) : [{ v: '', t: 'Nenhuma turma ainda' }], _vc.turma);

    // visita
    var v = _vc.turma ? _vcVisita(_vc.turma, _vc.escola) : null;
    var caixa = document.getElementById('vc-visita');
    if (!_vc.turma) {
        caixa.innerHTML = '';
    } else if (v && v.status === 'Aprovado') {
        var periodo = typeof agPeriodoTexto === 'function' ? agPeriodoTexto(v) : v.dataInicio + ' e ' + v.dataFim;
        caixa.className = 'vc-visita ok';
        caixa.innerHTML = '🟢 <strong>Visita aprovada pelo Clube da Maré</strong><br>🏫 ' + _vcEsc(v.escola || 'Escola não informada') +
            '<br>📅 ' + _vcEsc(periodo) + ' (2 dias)<br>🕗 Entrada <strong>' + _vcEsc(v.entrada) + '</strong> · Saída <strong>' + _vcEsc(v.saida) + '</strong>' +
            (v.saidaAlterada ? ' <span class="vc-nota">(saída concedida pelo Clube; a direção pediu ' + _vcEsc(v.saidaPedida) + ')</span>' : ' <span class="vc-nota">(saída concedida pelo Clube)</span>');
    } else if (v) {
        caixa.className = 'vc-visita';
        caixa.innerHTML = '🟡 A visita da turma <strong>' + _vcEsc(_vc.turma) + '</strong> ainda está <strong>aguardando a aprovação do Clube da Maré</strong>.';
    } else {
        caixa.className = 'vc-visita sem';
        caixa.innerHTML = '📅 A turma <strong>' + _vcEsc(_vc.turma) + '</strong> ainda não tem visita agendada pela Diretoria.';
    }

    // momento sugerido pelo dia de hoje (só até a pessoa escolher um)
    if (!_vc.momentoEscolhido && v && v.status === 'Aprovado') {
        var hoje = typeof agHoje === 'function' ? agHoje() : '';
        if (hoje && hoje >= v.dataFim) _vc.momento = 'd2-retorno';
        else _vc.momento = 'd1-chegada';
    }

    [].forEach.call(document.querySelectorAll('.vc-aba'), function (b) { b.classList.toggle('ativa', b.dataset.aba === _vc.aba); });
    document.getElementById('vc-painel-ingressos').hidden = _vc.aba !== 'ingressos';
    document.getElementById('vc-painel-chamada').hidden = _vc.aba !== 'chamada';
    _vcDesenharIngressos();
    _vcDesenharChamada();
}

// ---- aba Ingressos -----------------------------------------------------------
function _vcDesenharIngressos() {
    var area = document.getElementById('vc-painel-ingressos');
    var lista = _vcIngressosFiltrados();
    var aprov = lista.filter(function (i) { return i.status === 'Aprovado'; }).length;
    var pend = lista.filter(function (i) { return i.status === 'Pendente'; }).length;
    var html = '<div class="vc-cards">' +
        '<div class="vc-card"><b>' + lista.length + '</b><span>Ingressos da turma</span></div>' +
        '<div class="vc-card"><b>' + aprov + '</b><span>Aprovados (QR liberado)</span></div>' +
        '<div class="vc-card"><b>' + pend + '</b><span>Aguardando o Clube</span></div></div>';

    var acoes = '';
    if (_vc.cfg.perfil === 'desenvolvedor') {
        acoes += '<button type="button" class="vc-btn" data-acao="aprovar-todos"' + (_vc.turma ? '' : ' disabled') + '>✅ Aprovar todos e gerar QR Codes' + (_vc.turma ? ' (' + _vcEsc(_vc.turma) + ')' : '') + '</button>';
    }
    if (aprov) acoes += '<button type="button" class="vc-btn sec" data-acao="imprimir">🖨️ Imprimir / salvar PDF dos QR Codes</button>';
    if (acoes) html += '<div class="vc-acoes">' + acoes + '</div>';

    if (!lista.length) {
        html += '<p>Nenhum ingresso para esta turma' + (_vc.escola ? ' nesta escola' : '') + ' ainda. Os ingressos são gerados quando o Clube da Maré aprova a visita e confirma os alunos' +
            (_vc.cfg.perfil === 'desenvolvedor' ? ' — ou use o botão acima.' : '.') + '</p>';
    }
    var precisaQR = false;
    html += lista.map(function (i) {
        var img = '';
        if (i.status === 'Aprovado') {
            var url = vcQrDataUrl(i.id, 160);
            if (url) img = '<img src="' + url + '" alt="QR Code de ' + _vcEsc(i.nome) + '">';
            else { precisaQR = true; img = '<div class="vc-qr-vazio">Gerando QR...</div>'; }
        } else {
            img = '<div class="vc-qr-vazio">QR libera quando o Clube aprovar</div>';
        }
        return '<div class="vc-ing">' + img + '<div class="vc-nome"><strong>' + _vcEsc(i.nome) + '</strong>' +
            '<small>' + _vcEsc(i.tipo || 'Aluno') + ' · Turma ' + _vcEsc(i.turma) + (i.escola ? ' · ' + _vcEsc(i.escola) : '') + (i.ra ? ' · RA ' + _vcEsc(i.ra) : '') + '</small>' +
            '<span class="vc-tag ' + _vcEsc(i.status) + '">' + _vcEsc(i.status) + '</span></div>' +
            '<a class="vc-btn sec" style="text-decoration:none;" target="_blank" rel="noopener" href="' + _vcEsc(vcLinkIngresso(i.id)) + '">Abrir ingresso</a></div>';
    }).join('');
    area.innerHTML = html;
    if (precisaQR) _vcGarantirQR(function () { _vcDesenharIngressos(); });
}

// ---- aba Chamada --------------------------------------------------------------
function _vcAprovadosDaTurma() {
    return _vcIngressosFiltrados().filter(function (i) { return i.status === 'Aprovado'; });
}
function _vcMarcou(id, momento) { return !!(_vc.chamada[id] && _vc.chamada[id][momento]); }

function _vcDesenharChamada() {
    if (_vc.aba !== 'chamada') return;
    var alunos = _vcAprovadosDaTurma();
    var atual = VC_MOMENTOS.filter(function (m) { return m.chave === _vc.momento; })[0] || VC_MOMENTOS[0];

    document.getElementById('vc-momentos').innerHTML = VC_MOMENTOS.map(function (m) {
        var n = alunos.filter(function (a) { return _vcMarcou(a.id, m.chave); }).length;
        return '<button type="button" class="vc-mom' + (m.chave === atual.chave ? ' ativo' : '') + '" data-momento="' + m.chave + '">' +
            _vcEsc(m.rotulo) + '<small>' + n + ' de ' + alunos.length + (m.tipo === 'chegada' ? ' chegaram' : ' voltaram') + '</small></button>';
    }).join('');

    var termo = _vc.busca.trim().toLowerCase();
    var vis = alunos.filter(function (a) { return !termo || String(a.nome).toLowerCase().indexOf(termo) !== -1; });
    var presentes = alunos.filter(function (a) { return _vcMarcou(a.id, atual.chave); }).length;

    var html = '';
    if (!alunos.length) {
        html = '<p>Nenhum aluno com ingresso <strong>aprovado</strong> nesta turma ainda. A chamada só lista quem teve o ingresso aprovado pelo Clube da Maré.</p>';
    } else if (_vc.cfg.editavel) {
        html += '<div class="vc-acoes"><button type="button" class="vc-btn sec" data-acao="marcar-todos">Marcar todos como presentes (' + _vcEsc(atual.curto) + ')</button></div>';
    }
    html += vis.map(function (a) {
        var marcas = _vc.chamada[a.id] || {};
        var resumo = VC_MOMENTOS.filter(function (m) { return marcas[m.chave]; }).map(function (m) {
            return _vcEsc(m.curto) + ' ' + _vcHora(marcas[m.chave].em);
        }).join(' · ');
        var m = marcas[atual.chave];
        var botao = _vc.cfg.editavel
            ? '<button type="button" class="vc-p' + (m ? ' sim' : '') + '" data-aluno="' + _vcEsc(a.id) + '" aria-pressed="' + (m ? 'true' : 'false') + '" aria-label="' + _vcEsc(atual.rotulo) + ': ' + _vcEsc(a.nome) + '">P</button>'
            : '<span class="vc-p' + (m ? ' sim' : '') + '" style="display:inline-flex;align-items:center;justify-content:center;" title="' + (m ? 'Marcado' : 'Ainda não marcado') + '">' + (m ? 'P' : '–') + '</span>';
        return '<div class="vc-linha"><i class="fa-solid fa-circle-user" style="font-size:1.7rem;" aria-hidden="true"></i>' +
            '<div class="vc-nome"><strong>' + _vcEsc(a.nome) + '</strong><small>' + _vcEsc(a.tipo || 'Aluno') +
            (m ? ' · ' + (atual.tipo === 'chegada' ? 'chegou' : 'voltou') + ' às ' + _vcHora(m.em) + (m.por ? ' (marcado por ' + _vcEsc(m.por) + ')' : '') : ' · ainda não marcado') + '</small>' +
            (resumo ? '<small>' + resumo + '</small>' : '') + '</div>' + botao + '</div>';
    }).join('');
    if (alunos.length && !vis.length) html += '<p>Nenhum aluno com esse nome.</p>';
    document.getElementById('vc-lista-chamada').innerHTML = html;

    document.getElementById('vc-totais').innerHTML =
        '<div class="vc-card"><b>' + presentes + '</b><span>' + (atual.tipo === 'chegada' ? 'Chegaram' : 'Voltaram') + '</span></div>' +
        '<div class="vc-card"><b>' + (alunos.length - presentes) + '</b><span>' + (atual.tipo === 'chegada' ? 'Faltam chegar' : 'Faltam voltar') + '</span></div>' +
        '<div class="vc-card"><b>' + alunos.length + '</b><span>Total com ingresso</span></div>';
}

function _vcMarcar(ids, momento, presente) {
    var agora = Date.now();
    var antes = JSON.parse(JSON.stringify(_vc.chamada));
    ids.forEach(function (id) {
        if (!_vc.chamada[id]) _vc.chamada[id] = {};
        if (presente) { if (!_vc.chamada[id][momento] || ids.length === 1) _vc.chamada[id][momento] = { em: agora, por: _vc.cfg.nome || '' }; }
        else delete _vc.chamada[id][momento];
    });
    _vcDesenharChamada();
    var corpo = { marca: momento, presente: presente, por: _vc.cfg.nome || '' };
    if (ids.length === 1) corpo.ingressoId = ids[0]; else corpo.ingressoIds = ids;
    return _vcApi('POST', '/api/chamada', corpo).then(function () { _vc.assinatura = ''; }).catch(function (e) {
        _vc.chamada = antes;   // não gravou: volta como estava
        _vcDesenharChamada();
        document.getElementById('vc-msg').textContent = 'Não consegui salvar a marcação (' + e.message + '). Tente de novo.';
    });
}

function _vcImprimir() {
    var lista = _vcIngressosFiltrados().filter(function (i) { return i.status === 'Aprovado'; });
    if (!lista.length) return;
    var v = _vcVisita(_vc.turma, _vc.escola);
    var cab = '<h1>Clube da Maré — Ingressos da turma ' + _vcEsc(_vc.turma) + '</h1>' +
        (v && v.status === 'Aprovado' ? '<p>' + _vcEsc(v.escola) + ' · ' + _vcEsc(typeof agPeriodoTexto === 'function' ? agPeriodoTexto(v) : '') + ' · Entrada ' + _vcEsc(v.entrada) + ' · Saída ' + _vcEsc(v.saida) + '</p>' : '');
    var cartoes = lista.map(function (i) {
        return '<div class="c"><img src="' + vcQrDataUrl(i.id, 240) + '" alt=""><b>' + _vcEsc(i.nome) + '</b><small>' + _vcEsc(i.tipo || 'Aluno') + ' · ' + _vcEsc(i.turma) +
            '<br>' + _vcEsc(i.escola || '') + '<br>Ingresso #' + _vcEsc(String(i.id).slice(0, 6).toUpperCase()) + '</small></div>';
    }).join('');
    var w = window.open('', '_blank');
    if (!w) { document.getElementById('vc-msg').textContent = 'O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente de novo.'; return; }
    w.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Ingressos ' + _vcEsc(_vc.turma) + '</title><style>' +
        'body{font-family:Arial,sans-serif;margin:16px;color:#0b2a5b}h1{font-size:1.3rem;margin:0 0 4px}p{margin:0 0 14px}' +
        '.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}' +
        '.c{border:2px solid #0b2a5b;border-radius:12px;padding:10px;text-align:center;break-inside:avoid}' +
        '.c img{width:150px;height:150px}.c b{display:block;margin-top:6px}.c small{color:#44536b}' +
        '</style></head><body>' + cab + '<div class="g">' + cartoes + '</div><script>window.onload=function(){setTimeout(function(){window.print();},400);};<\/script></body></html>');
    w.document.close();
}

function _vcClique(e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.aba) { _vc.aba = b.dataset.aba; _vcDesenhar(false); return; }
    if (b.dataset.momento) { _vc.momento = b.dataset.momento; _vc.momentoEscolhido = true; _vcDesenharChamada(); return; }
    if (b.dataset.aluno && _vc.cfg.editavel) {
        _vcMarcar([b.dataset.aluno], _vc.momento, !_vcMarcou(b.dataset.aluno, _vc.momento));
        return;
    }
    var msg = document.getElementById('vc-msg');
    if (b.dataset.acao === 'marcar-todos' && _vc.cfg.editavel) {
        var faltam = _vcAprovadosDaTurma().filter(function (a) { return !_vcMarcou(a.id, _vc.momento); }).map(function (a) { return a.id; });
        if (!faltam.length) { msg.textContent = 'Todos já estão marcados.'; return; }
        if (confirm('Marcar os ' + faltam.length + ' alunos que faltam como presentes agora? Confira se todos realmente estão com você.')) _vcMarcar(faltam, _vc.momento, true);
    } else if (b.dataset.acao === 'imprimir') {
        _vcGarantirQR(_vcImprimir);
    } else if (b.dataset.acao === 'aprovar-todos') {
        if (!_vc.turma) return;
        if (!confirm('Aprovar TODOS os ingressos da turma ' + _vc.turma + ' e gerar o QR Code de cada aluno confirmado pelo Clube da Maré?')) return;
        b.disabled = true; msg.textContent = 'Gerando e aprovando os ingressos...';
        vcGerarLote(_vc.turma, _vc.escola, true).then(function (r) {
            msg.textContent = '✅ ' + r.aprovados + ' ingresso(s) aprovado(s) e ' + r.criados + ' novo(s) gerado(s) para a turma ' + _vc.turma + '. Os QR Codes já aparecem abaixo e nos painéis do professor e da Diretoria.';
        }).catch(function (err) { msg.textContent = 'Não foi possível aprovar: ' + err.message; b.disabled = false; });
    }
}
