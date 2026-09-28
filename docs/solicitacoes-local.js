// ==========================================================================
// SOLICITAÇÕES DE PARTICIPAÇÃO — sem backend, guardadas no localStorage.
//
// ⚠️ LIMITAÇÃO IMPORTANTE: como não existe mais nenhum servidor (nem
// Firebase, nem Apps Script), essas solicitações só ficam salvas NO MESMO
// NAVEGADOR/COMPUTADOR que criou ou respondeu a elas. Se o professor usa um
// computador e a Diretoria usa outro, cada um vê uma lista diferente — a
// solicitação de um NÃO aparece pro outro. Só funciona de verdade se todo
// mundo acessar do mesmo navegador (ex: um computador/Chromebook único da
// secretaria) ou pra fins de teste/demonstração.
// ==========================================================================
var CHAVE_SOLICITACOES = 'cdm_solicitacoes';

// Quem chamou uma das funções "escutar..." fica registrado aqui. Toda vez
// que os dados mudam (nesta aba OU em outra), todo mundo é avisado — assim
// a lista se atualiza sozinha sem precisar recarregar a página.
var _ouvintes = [];

function _lerSolicitacoes() {
    try {
        return JSON.parse(localStorage.getItem(CHAVE_SOLICITACOES) || '[]');
    } catch (e) {
        return [];
    }
}

function _salvarSolicitacoes(lista) {
    localStorage.setItem(CHAVE_SOLICITACOES, JSON.stringify(lista));
    _ouvintes.forEach(function (atualizar) { atualizar(); });
}

function _registrarOuvinte(atualizar) {
    _ouvintes.push(atualizar);
    atualizar(); // mostra o estado atual assim que a página chama escutarXxx
    // Cobre o caso de duas abas abertas no MESMO navegador (ex: professor
    // testando em duas abas). Entre computadores diferentes isso não dispara.
    window.addEventListener('storage', function (evento) {
        if (evento.key === CHAVE_SOLICITACOES) atualizar();
    });
}

function _gerarId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---- FLUXO DE APROVAÇÃO EM DUAS ETAPAS -----------------------------------
// status possíveis de uma solicitação:
//   'Pendente'              -> professor enviou, aguardando a Diretoria
//   'Aguardando Desenvolvedor' -> Diretoria já aprovou; falta a confirmação
//                                 final do Desenvolvedor (ele fica "acima"
//                                 da Diretoria nessa decisão)
//   'Aprovado'              -> confirmado pelo Desenvolvedor (final)
//   'Recusado'              -> recusado (por Diretoria OU Desenvolvedor)
// O campo "respondidoPor" guarda quem tomou a última decisão ('Diretoria'
// ou 'Desenvolvedor'), pra ficar registrado quem decidiu de verdade.
// ---------------------------------------------------------------------------

// ---- Professor: cria uma nova solicitação (sempre nasce "Pendente") ------
function criarSolicitacao(dados) {
    var lista = _lerSolicitacoes();
    lista.push({
        id: _gerarId(),
        ra: String(dados.ra),
        nomeAluno: dados.nomeAluno,
        turma: dados.turma,
        professor: dados.professor,
        observacao: dados.observacao || '',
        status: 'Pendente',
        resposta: '',
        respondidoPor: '',
        criadoEm: Date.now()
    });
    _salvarSolicitacoes(lista);
    return Promise.resolve();
}

// ---- Diretoria: lista as pendentes, ao vivo dentro do mesmo navegador ----
function escutarSolicitacoesPendentes(aoAtualizar) {
    _registrarOuvinte(function () {
        var pendentes = _lerSolicitacoes().filter(function (s) { return s.status === 'Pendente'; });
        aoAtualizar(pendentes);
    });
}

// ---- Diretoria/Desenvolvedor: lista TODAS as solicitações (qualquer
// status), mais recentes primeiro.
function escutarTodasSolicitacoes(aoAtualizar) {
    _registrarOuvinte(function () {
        var todas = _lerSolicitacoes().sort(function (a, b) { return b.criadoEm - a.criadoEm; });
        aoAtualizar(todas);
    });
}

// ---- Diretoria/Desenvolvedor: registra uma decisão -----------------------
// novoStatus  -> o novo status da solicitação (ver lista acima)
// resposta    -> texto opcional pro professor (motivo/orientação)
// respondidoPor -> 'Diretoria' ou 'Desenvolvedor', quem decidiu de fato
function responderSolicitacao(id, novoStatus, resposta, respondidoPor) {
    var lista = _lerSolicitacoes();
    var solicitacao = lista.find(function (s) { return s.id === id; });
    if (solicitacao) {
        solicitacao.status = novoStatus;
        solicitacao.resposta = resposta || '';
        solicitacao.respondidoPor = respondidoPor || '';
    }
    _salvarSolicitacoes(lista);
    return Promise.resolve();
}

// ---- Diretoria: aprova uma solicitação pendente. Isso NÃO é a aprovação
// final — só passa a solicitação pra etapa de confirmação do Desenvolvedor.
function aprovarComoDiretoria(id, resposta) {
    return responderSolicitacao(id, 'Aguardando Desenvolvedor', resposta, 'Diretoria');
}

// ---- Diretoria: recusa uma solicitação pendente (decisão final dela) -----
function recusarComoDiretoria(id, resposta) {
    return responderSolicitacao(id, 'Recusado', resposta, 'Diretoria');
}

// ---- Desenvolvedor: confirmação final — aprova ou recusa qualquer
// solicitação que ainda não esteja com decisão final (Pendente ou
// Aguardando Desenvolvedor). Como o Desenvolvedor está acima da Diretoria
// nessa hierarquia, ele também pode agir direto numa "Pendente" sem
// esperar a Diretoria, se precisar.
function aprovarComoDesenvolvedor(id, resposta) {
    return responderSolicitacao(id, 'Aprovado', resposta, 'Desenvolvedor');
}

function recusarComoDesenvolvedor(id, resposta) {
    return responderSolicitacao(id, 'Recusado', resposta, 'Desenvolvedor');
}

// ---- Diretoria: reabre uma solicitação que ELA MESMA recusou, pra
// reavaliar (volta pra "Pendente" e limpa a resposta anterior). Só faz
// sentido pra decisões que ainda são dela — uma vez que o Desenvolvedor
// decide (Aprovado/Recusado por ele), só o próprio Desenvolvedor reabre.
function reabrirSolicitacao(id) {
    var lista = _lerSolicitacoes();
    var solicitacao = lista.find(function (s) { return s.id === id; });
    if (solicitacao) {
        solicitacao.status = 'Pendente';
        solicitacao.resposta = '';
        solicitacao.respondidoPor = '';
    }
    _salvarSolicitacoes(lista);
    return Promise.resolve();
}

// ---- Professor: lista TODAS as solicitações que ele mesmo criou (não só
// as pendentes), pra mostrar em "Minhas Solicitações Enviadas".
function escutarSolicitacoesProfessor(professorLogin, aoAtualizar) {
    _registrarOuvinte(function () {
        var minhas = _lerSolicitacoes()
            .filter(function (s) { return s.professor === professorLogin; })
            .sort(function (a, b) { return b.criadoEm - a.criadoEm; });
        aoAtualizar(minhas);
    });
}

// ---- Professor: reabre uma solicitação já respondida (volta pra
// "Pendente" com uma nova observação, pra Diretoria reavaliar).
function reavaliarSolicitacaoProfessor(id, novaObservacao) {
    var lista = _lerSolicitacoes();
    var solicitacao = lista.find(function (s) { return s.id === id; });
    if (solicitacao) {
        solicitacao.status = 'Pendente';
        solicitacao.observacao = novaObservacao || solicitacao.observacao;
        solicitacao.resposta = '';
        solicitacao.respondidoPor = '';
        solicitacao.criadoEm = Date.now(); // volta pro topo da fila da Diretoria
    }
    _salvarSolicitacoes(lista);
    return Promise.resolve();
}

// ---- Professor: cancela (remove) uma solicitação enviada -----------------
function cancelarSolicitacao(id) {
    var lista = _lerSolicitacoes().filter(function (s) { return s.id !== id; });
    _salvarSolicitacoes(lista);
    return Promise.resolve();
}

// ---- Desenvolvedor: apaga todas as solicitações salvas (uso em testes) ---
function limparTodasSolicitacoes() {
    _salvarSolicitacoes([]);
    return Promise.resolve();
}

// ---- Aluno/Responsável: status da solicitação mais recente do próprio RA -
function escutarStatusAluno(ra, aoAtualizar) {
    _registrarOuvinte(function () {
        var doAluno = _lerSolicitacoes()
            .filter(function (s) { return String(s.ra) === String(ra); })
            .sort(function (a, b) { return b.criadoEm - a.criadoEm; });
        aoAtualizar(doAluno[0] || null);
    });
}
