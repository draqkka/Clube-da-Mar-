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

// Traduz o status interno da solicitação para o que o aluno vê.
//   Aprovado                          -> Aprovado pela Diretoria
//   Recusado                          -> Reprovado pela Diretoria
//   Pendente / Aguardando Desenvolvedor -> Em análise pela Diretoria
//   (sem solicitação)                 -> Aguardando envio à Diretoria
function statusDiretoria(solicitacao) {
    var s = solicitacao ? solicitacao.status : '';
    if (s === 'Aprovado') {
        return { chave: 'aprovado', classe: 'status-aprovado', rotulo: 'Aprovado',
                 texto: 'Sua participação no Beach Club foi aprovada pela Diretoria! 🎉' };
    }
    if (s === 'Recusado') {
        return { chave: 'reprovado', classe: 'status-recusado', rotulo: 'Reprovado',
                 texto: 'Sua participação não foi aprovada pela Diretoria.' };
    }
    if (s === 'Pendente' || s === 'Aguardando Desenvolvedor') {
        return { chave: 'analise', classe: 'status-pendente', rotulo: 'Em análise',
                 texto: 'A Diretoria ainda está analisando sua participação.' };
    }
    return { chave: 'sem-solicitacao', classe: 'status-pendente', rotulo: 'Aguardando envio',
             texto: 'Sua participação ainda não foi enviada para análise da Diretoria.' };
}

function formatarMedia(v) {
    return (v === '' || v === null || v === undefined) ? '—' : String(v).replace('.', ',');
}
function formatarFrequencia(v) {
    return (v === '' || v === null || v === undefined) ? '—' : v + '%';
}
