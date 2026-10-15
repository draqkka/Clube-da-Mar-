// ==========================================================================
// CARTÃO DE RETORNO AO PAINEL (aluno, professor e diretoria)
//
// Quando a pessoa clica em "Sair" (aluno) ou "Voltar ao site" (professor e
// diretoria), o painel guarda aqui um RESUMO + os dados da sessão. A tela
// inicial (index.html) mostra esse resumo num cartão; clicar em QUALQUER
// parte do cartão (ou no nome) restaura a sessão e abre o painel inteiro.
// O "×" do cartão esconde o resumo e apaga a sessão guardada.
//
// Usado por: dashboard-aluno.html, dashboard-professor.html,
//            dashboard-diretoria.html e index.html.
//
// ⚠️ Como o login do site é feito só no navegador (ver aviso em
// usuarios.js), quem usar este mesmo navegador consegue abrir o painel pelo
// cartão sem digitar a senha. Pra um sistema real, isso deve virar uma
// sessão com expiração no servidor.
// ==========================================================================
var CHAVE_RESUMO_PAINEL = 'cdm_resumo_painel';
var CHAVE_RESUMO_ALUNO_LIMPAR = 'cdm_resumo_aluno';   // o do aluno (status-aluno.js)

// Página de cada perfil (a mesma do login-formulario.html)
var DESTINO_PAINEL = {
    estudante: 'dashboard-aluno.html',
    professor: 'dashboard-professor.html',
    diretoria: 'dashboard-diretoria.html',
    desenvolvedor: 'dashboard-desenvolvedor.html'
};

function lerResumoPainel() {
    try { return JSON.parse(localStorage.getItem(CHAVE_RESUMO_PAINEL) || 'null'); }
    catch (e) { return null; }
}

function apagarResumoPainel() {
    try { localStorage.removeItem(CHAVE_RESUMO_PAINEL); } catch (e) {}
}

// Guarda o resumo do professor/diretoria. "cartoes" é uma lista de
// { rotulo, valor } que aparece no cartão da tela inicial.
function guardarResumoPainel(sessao, cartoes, texto) {
    if (!sessao || !sessao.perfil) return;
    try {
        // só um cartão por vez na tela inicial: o do aluno sai
        localStorage.removeItem(CHAVE_RESUMO_ALUNO_LIMPAR);
        localStorage.setItem(CHAVE_RESUMO_PAINEL, JSON.stringify({
            perfil: sessao.perfil,
            nome: sessao.nome || '',
            destino: DESTINO_PAINEL[sessao.perfil] || 'login.html',
            cartoes: cartoes || [],
            texto: texto || '',
            sessao: sessao
        }));
    } catch (e) {}
}

// Restaura a sessão guardada e abre o painel (usado ao clicar no cartão).
function abrirPainelGuardado(resumo) {
    if (!resumo || !resumo.sessao) { window.location.href = 'login.html'; return; }
    try { sessionStorage.setItem('cdm_sessao', JSON.stringify(resumo.sessao)); } catch (e) {}
    window.location.href = resumo.destino || DESTINO_PAINEL[resumo.sessao.perfil] || 'login.html';
}

// Torna o cartão inteiro clicável (mouse e teclado), menos o botão "×".
function tornarCartaoClicavel(secao, aoAbrir, rotuloAcessivel) {
    secao.classList.add('resumo-clicavel');
    secao.setAttribute('role', 'link');
    secao.setAttribute('tabindex', '0');
    secao.setAttribute('aria-label', rotuloAcessivel);
    secao.addEventListener('click', function (evento) {
        if (evento.target.closest('.resumo-aluno-fechar')) return;
        aoAbrir();
    });
    secao.addEventListener('keydown', function (evento) {
        if (evento.target !== secao) return;
        if (evento.key === 'Enter' || evento.key === ' ') {
            evento.preventDefault();
            aoAbrir();
        }
    });
}

// Contagem de solicitações por status (usada pelo professor e pela diretoria).
function contarSolicitacoesPorStatus(lista) {
    var c = { total: 0, pendente: 0, esperando: 0, confirmada: 0, recusada: 0 };
    (lista || []).forEach(function (s) {
        c.total++;
        if (s.status === 'Pendente') c.pendente++;
        else if (s.status === 'Aguardando Desenvolvedor') c.esperando++;
        else if (s.status === 'Aprovado') c.confirmada++;
        else if (s.status === 'Recusado') c.recusada++;
    });
    return c;
}
