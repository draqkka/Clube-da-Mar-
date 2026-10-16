// ==========================================================================
// CONFETE DE BOAS-VINDAS (todos os dashboards)
//
// Quando a pessoa abre um dashboard, o confete aparece por 5 segundos e
// some sozinho. Não bloqueia cliques (pointer-events: none).
//
// Usado por: dashboard-aluno.html, dashboard-professor.html,
//            dashboard-diretoria.html e dashboard-desenvolvedor.html.
//
// MODO:
//   'pinterest' → usa o embed do Pinterest (o iframe que você escolheu)
//   'canvas'    → confete desenhado pelo próprio site, com fundo transparente
//                 (não depende de ninguém e cobre a tela inteira)
// ==========================================================================
(function () {
    var MODO = 'pinterest';
    var DURACAO_MS = 5000;
    var URL_PINTEREST = 'https://assets.pinterest.com/ext/embed.html?id=184577284716692138';

    function criarCamada() {
        var camada = document.createElement('div');
        camada.id = 'confete-boas-vindas';
        camada.setAttribute('aria-hidden', 'true');
        camada.style.cssText =
            'position:fixed;inset:0;z-index:3000;pointer-events:none;' +
            'display:flex;align-items:center;justify-content:center;' +
            'opacity:1;transition:opacity .4s ease;';
        document.body.appendChild(camada);
        return camada;
    }

    function iniciarPinterest(camada) {
        var iframe = document.createElement('iframe');
        iframe.src = URL_PINTEREST;
        iframe.width = 600;
        iframe.height = 438;
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('scrolling', 'no');
        iframe.style.cssText = 'border:0;max-width:100%;max-height:100%;pointer-events:none;';
        camada.appendChild(iframe);
    }

    function iniciarCanvas(camada) {
        var canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
        camada.appendChild(canvas);
        var ctx = canvas.getContext('2d');
        var largura = canvas.width = window.innerWidth;
        var altura = canvas.height = window.innerHeight;

        var cores = ['#1e88e5', '#26c6da', '#ff9800', '#43a047', '#ff5252', '#ffd54f'];
        var pecas = [];
        for (var i = 0; i < 160; i++) {
            pecas.push({
                x: Math.random() * largura,
                y: -20 - Math.random() * altura * 0.6,
                w: 6 + Math.random() * 8,
                h: 10 + Math.random() * 10,
                cor: cores[Math.floor(Math.random() * cores.length)],
                vy: 2 + Math.random() * 3.5,
                vx: -1.5 + Math.random() * 3,
                giro: Math.random() * Math.PI,
                vgiro: -0.2 + Math.random() * 0.4
            });
        }

        var inicio = performance.now();
        function quadro(agora) {
            if (!document.body.contains(canvas)) return;
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
    }

    function mostrar() {
        var camada = criarCamada();
        if (MODO === 'canvas') iniciarCanvas(camada); else iniciarPinterest(camada);

        // Some suavemente no final e é removido da página aos 5 segundos
        setTimeout(function () { camada.style.opacity = '0'; }, DURACAO_MS - 400);
        setTimeout(function () { camada.remove(); }, DURACAO_MS);
    }

    if (document.body) mostrar();
    else document.addEventListener('DOMContentLoaded', mostrar);
})();
