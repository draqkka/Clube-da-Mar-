// ==========================================================================
// CONFETE DE BOAS-VINDAS (todos os dashboards)
//
// Quando a pessoa abre um dashboard, o confete cai por 5 segundos e some
// sozinho. O fundo é transparente (só os papeizinhos aparecem) e não
// bloqueia cliques (pointer-events: none).
//
// Usado por: dashboard-aluno.html, dashboard-professor.html,
//            dashboard-diretoria.html e dashboard-desenvolvedor.html.
// ==========================================================================
(function () {
    var DURACAO_MS = 5000;
    var QUANTIDADE = 220;
    var CORES = ['#1e88e5', '#26c6da', '#ff9800', '#43a047', '#ff5252', '#ffd54f', '#ab47bc'];

    function mostrar() {
        var canvas = document.createElement('canvas');
        canvas.id = 'confete-boas-vindas';
        canvas.setAttribute('aria-hidden', 'true');
        canvas.style.cssText =
            'position:fixed;inset:0;width:100%;height:100%;' +
            'z-index:3000;pointer-events:none;transition:opacity .4s ease;';
        document.body.appendChild(canvas);

        var ctx = canvas.getContext('2d');
        var largura = canvas.width = window.innerWidth;
        var altura = canvas.height = window.innerHeight;

        // Começa com os papeizinhos espalhados acima da tela e já caindo
        var pecas = [];
        for (var i = 0; i < QUANTIDADE; i++) {
            pecas.push({
                x: Math.random() * largura,
                y: -Math.random() * altura * 0.8,
                w: 6 + Math.random() * 8,
                h: 10 + Math.random() * 10,
                cor: CORES[Math.floor(Math.random() * CORES.length)],
                vy: 3 + Math.random() * 4,
                vx: -1.5 + Math.random() * 3,
                giro: Math.random() * Math.PI,
                vgiro: -0.2 + Math.random() * 0.4
            });
        }

        var inicio = performance.now();
        function quadro(agora) {
            if (!canvas.isConnected) return;
            ctx.clearRect(0, 0, largura, altura);
            pecas.forEach(function (p) {
                p.x += p.vx;
                p.y += p.vy;
                p.giro += p.vgiro;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.giro);
                ctx.fillStyle = p.cor;
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();
            });
            if (agora - inicio < DURACAO_MS) requestAnimationFrame(quadro);
        }
        requestAnimationFrame(quadro);

        // Some suavemente no final e é removido da página aos 5 segundos
        setTimeout(function () { canvas.style.opacity = '0'; }, DURACAO_MS - 400);
        setTimeout(function () { canvas.remove(); }, DURACAO_MS);
    }

    if (document.body) mostrar();
    else document.addEventListener('DOMContentLoaded', mostrar);
})();
