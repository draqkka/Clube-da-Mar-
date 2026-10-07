// ==========================================================================
// RESUMO DO ALUNO (nome, média, frequência e status da Diretoria)
// Usado pelo painel do aluno (dashboard-aluno.html) e pela tela inicial
// (index.html), pra mostrar as MESMAS informações nos dois lugares.
//
// Ao clicar em "Sair", o painel guarda um resumo no navegador; a tela
// inicial lê esse resumo e mostra o cartão. O login em si é encerrado
// normalmente (cdm_sessao é apagada) — só o resumo fica visível.
// ==========================================================================
var CHAVE_RESUMO_ALUNO = 'cdm_resumo_aluno';

function lerResumoAluno() {
    try { return JSON.parse(localStorage.getItem(CHAVE_RESUMO_ALUNO) || 'null'); }
    catch (e) { return null; }
}

function salvarResumoAluno(resumo) {
    try { localStorage.setItem(CHAVE_RESUMO_ALUNO, JSON.stringify(resumo)); } catch (e) {}
}

function apagarResumoAluno() {
    try { localStorage.removeItem(CHAVE_RESUMO_ALUNO); } catch (e) {}
}

// Traduz o status interno da solicitação para o que o aluno vê. Os nomes
// vêm de status-solicitacao.js (infoStatusSolicitacao), os MESMOS que o
// professor e a direção veem:
//   Pendente                 -> Aguardando a direção
//   Aguardando Desenvolvedor -> Esperando contato equipe Clube da Maré
//   Aprovado                 -> Confirmada pela equipe Clube da Maré
//   Recusado                 -> Reprovada (pela direção ou pela equipe)
//   (sem solicitação)        -> Aguardando envio
function statusDiretoria(solicitacao) {
    var i = infoStatusSolicitacao(solicitacao);
    var textos = {
        'aprovado': 'O contato com o Clube da Maré foi aceito! Sua participação está confirmada. 🎉',
        'reprovado': i.mensagem,
        'esperando-contato': 'A direção aprovou sua participação. Agora estamos esperando contato da equipe Clube da Maré.',
        'analise': 'O professor enviou sua participação e a direção ainda está analisando.',
        'sem-solicitacao': 'Sua participação ainda não foi enviada para análise da direção.'
    };
    var rotulos = { 'sem-solicitacao': 'Aguardando envio' };
    return {
        chave: i.chave,
        classe: i.classe,
        rotulo: rotulos[i.chave] || i.rotulo,
        texto: textos[i.chave] || i.mensagem
    };
}

function formatarMedia(v) {
    return (v === '' || v === null || v === undefined) ? '—' : String(v).replace('.', ',');
}
function formatarFrequencia(v) {
    return (v === '' || v === null || v === undefined) ? '—' : v + '%';
}
