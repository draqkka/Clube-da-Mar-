// ==========================================================================
// LOGOUT NOS PAINÉIS (aluno, professor, diretoria e desenvolvedor)
//
// O botão "Logout" fica no canto direito da faixa azul do topo, ao lado do
// "Voltar ao site". Diferente do "Voltar ao site" (que deixa a faixa do painel
// na tela inicial), o Logout encerra o perfil de verdade: apaga a sessão e os
// resumos guardados e volta pro menu inicial sem nenhum painel.
// ==========================================================================
(function () {
    var botao = document.getElementById('botao-logoff');
    if (!botao) return;
    botao.addEventListener('click', function (e) {
        e.preventDefault();
        window.cdmLogoff = true;   // impede os painéis de guardar o resumo de novo
        try { sessionStorage.removeItem('cdm_sessao'); } catch (x) {}
        try {
            localStorage.removeItem('cdm_resumo_painel');
            localStorage.removeItem('cdm_resumo_aluno');
        } catch (x) {}
        window.location.href = 'index.html#inicio';
    });
})();
