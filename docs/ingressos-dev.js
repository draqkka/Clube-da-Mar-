// Painel do Desenvolvedor: gerar ingressos e APROVAR (liberar o acesso).
// Enquanto o ingresso está "Pendente", a tela do aluno/monitor (ingresso.html)
// fica carregando; ao aprovar aqui, ela muda para "Acesso liberado".
(function () {
    var area = document.getElementById('lista-ingressos');
    if (!area) return;

    function esc(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function link(id) {
        return location.origin + location.pathname.replace(/[^\/]*$/, '') + 'ingresso.html?id=' + id;
    }
    function aviso(t) { document.getElementById('msg-ingressos').textContent = t || ''; }

    function chamar(metodo, url, corpo) {
        return fetch(url, {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: corpo ? JSON.stringify(corpo) : undefined
        }).then(function (r) {
            return r.json().then(function (j) {
                if (!r.ok) throw new Error(j.erro || 'Erro no servidor.');
                return j;
            });
        });
    }

    function desenhar(lista) {
        var filtro = document.getElementById('filtro-status-ingresso').value;
        var itens = lista.filter(function (i) { return !filtro || i.status === filtro; });
        document.getElementById('sem-ingressos').style.display = itens.length ? 'none' : 'block';
        area.innerHTML = itens.map(function (i) {
            var cor = i.status === 'Aprovado' ? '#19d263' : (i.status === 'Recusado' ? '#ff5a5a' : '#ffc800');
            var botoes = '';
            if (i.status !== 'Aprovado') botoes += '<button type="button" class="btn-ing" data-acao="Aprovado" data-id="' + esc(i.id) + '">Aprovar</button>';
            if (i.status !== 'Recusado') botoes += '<button type="button" class="btn-ing sec" data-acao="Recusado" data-id="' + esc(i.id) + '">Recusar</button>';
            botoes += '<button type="button" class="btn-ing sec" data-copiar="' + esc(i.id) + '">Copiar link</button>';
            botoes += '<button type="button" class="btn-ing sec" data-qr="' + esc(i.id) + '">QR Code</button>';
            botoes += '<button type="button" class="btn-ing sec" data-apagar="' + esc(i.id) + '">Apagar</button>';
            return '<div class="linha-ingresso">' +
                '<div><strong>' + esc(i.nome) + '</strong> <small>(' + esc(i.tipo || 'Aluno') + (i.turma ? ' • ' + esc(i.turma) : '') + (i.ra ? ' • RA ' + esc(i.ra) : '') + ')</small>' +
                '<br><span style="color:' + cor + ';font-weight:700;">' + esc(i.status) + '</span></div>' +
                '<div class="botoes-ing">' + botoes + '</div></div>';
        }).join('');
    }

    var cache = [];
    function carregar() {
        return chamar('GET', '/api/ingressos').then(function (j) {
            cache = j.ingressos || [];
            desenhar(cache);
        }).catch(function (e) { aviso('Não foi possível carregar os ingressos: ' + e.message); });
    }

    document.getElementById('form-ingresso').addEventListener('submit', function (e) {
        e.preventDefault();
        var corpo = { ingresso: {
            nome: document.getElementById('ing-nome').value,
            tipo: document.getElementById('ing-tipo').value,
            turma: document.getElementById('ing-turma').value,
            ra: document.getElementById('ing-ra').value
        } };
        chamar('POST', '/api/ingressos', corpo).then(function (j) {
            aviso('Ingresso criado (Pendente). Link: ' + link(j.ingresso.id));
            e.target.reset();
            return carregar();
        }).catch(function (err) { aviso(err.message); });
    });

    document.getElementById('filtro-status-ingresso').addEventListener('change', function () { desenhar(cache); });

    area.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.acao) {
            chamar('POST', '/api/ingressos', { id: b.dataset.id, status: b.dataset.acao })
                .then(carregar).catch(function (err) { aviso(err.message); });
        } else if (b.dataset.copiar) {
            var l = link(b.dataset.copiar);
            (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject())
                .then(function () { aviso('Link copiado.'); })
                .catch(function () { aviso('Link: ' + l); });
        } else if (b.dataset.qr) {
            var caixa = document.getElementById('caixa-qr');
            caixa.innerHTML = '';
            if (window.QRCode) new QRCode(caixa, { text: link(b.dataset.qr), width: 200, height: 200 });
            caixa.insertAdjacentHTML('beforeend', '<p style="margin:8px 0 0;word-break:break-all;font-size:.75rem;">' + esc(link(b.dataset.qr)) + '</p>');
            caixa.style.display = 'block';
        } else if (b.dataset.apagar) {
            if (confirm('Apagar este ingresso?')) {
                chamar('DELETE', '/api/ingressos?id=' + encodeURIComponent(b.dataset.apagar))
                    .then(carregar).catch(function (err) { aviso(err.message); });
            }
        }
    });

    carregar();
    setInterval(carregar, 10000);   // novos pedidos aparecem sozinhos
})();
