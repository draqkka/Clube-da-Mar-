// Abre/fecha o painel do menu (o ícone de 3 linhas — "hambúrguer" — no canto direito).
// Usado em todas as páginas do site — o HTML de cada página só precisa ter
// um botão com id="menu-icone" e um painel com id="menu-dropdown".
(function () {
    var botao = document.getElementById('menu-icone');
    var painel = document.getElementById('menu-dropdown');
    if (!botao || !painel) return;

    var simbolo = document.getElementById('menu-icone-simbolo');

    // Fechado = 3 linhas (fa-bars); aberto = X (fa-xmark)
    function trocarSimbolo(aberto) {
        if (simbolo) {
            simbolo.classList.toggle('fa-bars', !aberto);
            simbolo.classList.toggle('fa-xmark', aberto);
        }
        botao.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
    }

    function fechar() {
        painel.classList.remove('aberto');
        botao.setAttribute('aria-expanded', 'false');
        trocarSimbolo(false);
    }

    function alternar() {
        var vaiAbrir = !painel.classList.contains('aberto');
        painel.classList.toggle('aberto', vaiAbrir);
        botao.setAttribute('aria-expanded', String(vaiAbrir));
        trocarSimbolo(vaiAbrir);
    }

    botao.addEventListener('click', function (evento) {
        evento.stopPropagation();
        alternar();
    });

    // Fecha o painel assim que a pessoa clica em algum link dele
    painel.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', fechar);
    });

    // Fecha ao clicar fora do painel/ícone
    document.addEventListener('click', function (evento) {
        if (!painel.contains(evento.target) && evento.target !== botao) {
            fechar();
        }
    });

    // Fecha com a tecla Esc
    document.addEventListener('keydown', function (evento) {
        if (evento.key === 'Escape') fechar();
    });
})();
