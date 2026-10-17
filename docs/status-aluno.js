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
        'esperando-contato': 'A direção aprovou sua participação e fez o agendamento da visita da turma. Agora estamos esperando a aprovação do Clube da Maré.',
        'esperando-agendamento': 'A direção aprovou sua participação. Falta a direção agendar os dias da visita ao Clube da Maré.',
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


// Nome curto usado na saudação (painel do aluno e tela inicial):
// "Rebeca dos Santos Pereira" -> "Rebeca Pereira"; senão primeiro + último nome.
function nomeCurtoAluno(nomeCompleto) {
    var n = String(nomeCompleto || '').trim();
    var base = n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (base.indexOf('rebeca') === 0) return 'Rebeca Pereira';
    if (base.indexOf('julia') === 0) return 'Julia Victória';
    var partes = n.split(/\s+/);
    return partes.length > 1 ? partes[0] + ' ' + partes[partes.length - 1] : n;
}


// ==========================================================================
// LÓGICA ÚNICA DO PAINEL DO ALUNO — usada por dashboard-aluno.html E pelo
// cartão da tela inicial (index.html), pra os dois mostrarem sempre o mesmo.
// "resumo" é o objeto que o dashboard guarda (encontradoNaPlanilha, reprovado,
// mensagemReprovacao...).
// ==========================================================================
var MSG_ALUNO_APROVADO = 'Parabéns! Gosto assim, se superando, continue assim! :)';
var MSG_ALUNO_SEM_DADOS = 'O professor ainda não colocou suas notas e frequências.';

// Status que aparece no card "Status" (e o texto da caixa de solicitação).
function statusPainelAluno(solicitacao, resumo) {
    resumo = resumo || {};
    var info = statusDiretoria(solicitacao);
    if (!solicitacao && !resumo.encontradoNaPlanilha) {
        // O professor ainda não puxou a planilha: não há nota nem frequência deste aluno.
        info = { chave: 'aguardando-professor', classe: 'status-pendente', rotulo: 'Aguardando o professor',
                 texto: 'Aguardando o professor: ele ainda não colocou suas notas e frequências.' };
    } else if (!solicitacao && resumo.cadastradoPeloProfessor === false) {
        // Está na planilha, mas o professor não cadastrou o e-mail e a senha do aluno.
        info = { chave: 'aguardando-cadastro', classe: 'status-pendente', rotulo: 'Aguardando o professor',
                 texto: 'Aguardando o professor: ainda não há cadastro deste aluno no Clube da Maré.' };
    } else if (!solicitacao) {
        info = { chave: 'sem-solicitacao', classe: 'status-pendente', rotulo: 'Aguardando solicitação de participação do professor',
                 texto: 'Aguardando solicitação de participação do professor.' };
    }
    // Aluno reprovado: "Reprovado" no card e a mesma mensagem do painel.
    if (resumo.reprovado) {
        info = { chave: 'reprovado', classe: 'status-recusado', rotulo: 'Reprovado', texto: resumo.mensagemReprovacao || '' };
    }
    return info;
}

// Mensagem de resultado (aprovado / reprovado / sem dados na planilha).
function mensagemPainelAluno(resumo) {
    resumo = resumo || {};
    if (!resumo.encontradoNaPlanilha) return MSG_ALUNO_SEM_DADOS;
    return resumo.reprovado ? (resumo.mensagemReprovacao || '') : MSG_ALUNO_APROVADO;
}
