// ==========================================================================
// SOLICITAÇÕES DE PARTICIPAÇÃO — com Histórico e Reavaliação
// ==========================================================================
var CHAVE_SOLICITACOES = 'cdm_solicitacoes';

function _lerSolicitacoes() {
    try {
        return JSON.parse(localStorage.getItem(CHAVE_SOLICITACOES) || '[]');
    } catch (e) {
        return [];
    }
}

function _salvarSolicitacoes(lista) {
    localStorage.setItem(CHAVE_SOLICITACOES, JSON.stringify(lista));
}

function _gerarId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---- Professor: cria uma nova solicitação ------
function criarSolicitacao(dados) {
    var lista = _lerSolicitacoes();
    lista.push({
        id: _gerarId(),
        ra: String(dados.ra),
        nomeAluno: dados.nomeAluno,
        turma: dados.turma,
        professor: dados.professor,
        observacao: dados.observacao || '',
        respostaDiretoria: '',
        status: 'Pendente',
        criadoEm: Date.now()
    });
    _salvarSolicitacoes(lista);
    return Promise.resolve();
}

// ---- Diretoria: escuta solicitações Pendentes ou Todas ------
function escutarTodasSolicitacoes(aoAtualizar) {
    function atualizar() {
        aoAtualizar(_lerSolicitacoes());
    }
    atualizar();
    window.addEventListener('storage', function (evento) {
        if (evento.key === CHAVE_SOLICITACOES) atualizar();
    });
}

// ---- Diretoria: aprova ou recusa com resposta ao professor --------------------------
function responderSolicitacao(id, novoStatus, respostaTexto) {
    var lista = _lerSolicitacoes();
    var solicitacao = lista.find(function (s) { return s.id === id; });
    if (solicitacao) {
        solicitacao.status = novoStatus;
        solicitacao.respostaDiretoria = respostaTexto || '';
        solicitacao.atualizadoEm = Date.now();
    }
    _salvarSolicitacoes(lista);
    return Promise.resolve();
}

// ---- Diretoria: Permite refazer / reavaliar solicitação já decidida ------------------
function reabrirSolicitacao(id) {
    var lista = _lerSolicitacoes();
    var solicitacao = lista.find(function (s) { return String(s.id) === String(id); });
    if (solicitacao) {
        solicitacao.status = 'Pendente';
        solicitacao.respostaDiretoria = ''; // Limpa a resposta anterior
        solicitacao.atualizadoEm = Date.now();
        _salvarSolicitacoes(lista);
        
        // Dispara um evento personalizado local para atualizar a tela na mesma aba/janela imediatamente
        window.dispatchEvent(new Event('solicitacoes_atualizadas'));
    }
    return Promise.resolve();
}

function responderSolicitacao(id, novoStatus, respostaTexto) {
    var lista = _lerSolicitacoes();
    var solicitacao = lista.find(function (s) { return String(s.id) === String(id); });
    if (solicitacao) {
        solicitacao.status = novoStatus;
        solicitacao.respostaDiretoria = respostaTexto || '';
        solicitacao.atualizadoEm = Date.now();
        _salvarSolicitacoes(lista);
        
        // Dispara o evento de atualização local
        window.dispatchEvent(new Event('solicitacoes_atualizadas'));
    }
    return Promise.resolve();
}

function escutarTodasSolicitacoes(aoAtualizar) {
    function atualizar() {
        aoAtualizar(_lerSolicitacoes());
    }
    atualizar();
    
    // Escuta atualizações de outras abas
    window.addEventListener('storage', function (evento) {
        if (evento.key === CHAVE_SOLICITACOES) atualizar();
    });
    
    // Escuta atualizações na mesma aba
    window.addEventListener('solicitacoes_atualizadas', function () {
        atualizar();
    });
}


// ---- Professor: escuta atualizações e respostas da diretoria pra ele ---------------
function escutarSolicitacoesProfessor(professorLogin, aoAtualizar) {
    function atualizar() {
        var minhas = _lerSolicitacoes().filter(function (s) {
            return s.professor === professorLogin;
        });
        aoAtualizar(minhas);
    }
    atualizar();
    window.addEventListener('storage', function (evento) {
        if (evento.key === CHAVE_SOLICITACOES) atualizar();
    });
}

// ==========================================================================
// SOLICITAÇÕES DE PARTICIPAÇÃO — com Histórico, Reavaliação e Edição pelo Professor
// ==========================================================================
var CHAVE_SOLICITACOES = 'cdm_solicitacoes';

function _lerSolicitacoes() {
    try {
        return JSON.parse(localStorage.getItem(CHAVE_SOLICITACOES) || '[]');
    } catch (e) {
        return [];
    }
}

function _salvarSolicitacoes(lista) {
    localStorage.setItem(CHAVE_SOLICITACOES, JSON.stringify(lista));
    window.dispatchEvent(new Event('solicitacoes_atualizadas'));
}

function _gerarId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---- Professor: cria uma nova solicitação ------
function criarSolicitacao(dados) {
    var lista = _lerSolicitacoes();
    lista.push({
        id: _gerarId(),
        ra: String(dados.ra),
        nomeAluno: dados.nomeAluno,
        turma: dados.turma,
        professor: dados.professor,
        observacao: dados.observacao || '',
        respostaDiretoria: '',
        status: 'Pendente',
        criadoEm: Date.now()
    });
    _salvarSolicitacoes(lista);
    return Promise.resolve();
}

// ---- Professor: Reabre/Edita uma solicitação (Volta para Pendente com nova observação) ----
function reavaliarSolicitacaoProfessor(id, novaObservacao) {
    var lista = _lerSolicitacoes();
    var solicitacao = lista.find(function (s) { return String(s.id) === String(id); });
    if (solicitacao) {
        solicitacao.status = 'Pendente';
        solicitacao.observacao = novaObservacao !== undefined ? novaObservacao : solicitacao.observacao;
        solicitacao.respostaDiretoria = ''; // Limpa resposta antiga da diretoria ao refazer
        solicitacao.atualizadoEm = Date.now();
        _salvarSolicitacoes(lista);
    }
    return Promise.resolve();
}

// ---- Professor: Cancela/Exclui uma solicitação enviada ----
function cancelarSolicitacao(id) {
    var lista = _lerSolicitacoes().filter(function (s) { return String(s.id) !== String(id); });
    _salvarSolicitacoes(lista);
    return Promise.resolve();
}

// ---- Diretoria: escuta solicitações Pendentes ou Todas ------
function escutarTodasSolicitacoes(aoAtualizar) {
    function atualizar() {
        aoAtualizar(_lerSolicitacoes());
    }
    atualizar();
    window.addEventListener('storage', function (evento) {
        if (evento.key === CHAVE_SOLICITACOES) atualizar();
    });
    window.addEventListener('solicitacoes_atualizadas', function () {
        atualizar();
    });
}

// ---- Diretoria: aprova ou recusa com resposta ao professor --------------------------
function responderSolicitacao(id, novoStatus, respostaTexto) {
    var lista = _lerSolicitacoes();
    var solicitacao = lista.find(function (s) { return String(s.id) === String(id); });
    if (solicitacao) {
        solicitacao.status = novoStatus;
        solicitacao.respostaDiretoria = respostaTexto || '';
        solicitacao.atualizadoEm = Date.now();
        _salvarSolicitacoes(lista);
    }
    return Promise.resolve();
}

// ---- Diretoria: Permite refazer / reavaliar solicitação já decidida ------------------
function reabrirSolicitacao(id) {
    var lista = _lerSolicitacoes();
    var solicitacao = lista.find(function (s) { return String(s.id) === String(id); });
    if (solicitacao) {
        solicitacao.status = 'Pendente';
        solicitacao.respostaDiretoria = '';
        solicitacao.atualizadoEm = Date.now();
        _salvarSolicitacoes(lista);
    }
    return Promise.resolve();
}

// ---- Professor: escuta atualizações e respostas da diretoria pra ele ---------------
function escutarSolicitacoesProfessor(professorLogin, aoAtualizar) {
    function atualizar() {
        var minhas = _lerSolicitacoes().filter(function (s) {
            return s.professor === professorLogin;
        });
        aoAtualizar(minhas);
    }
    atualizar();
    window.addEventListener('storage', function (evento) {
        if (evento.key === CHAVE_SOLICITACOES) atualizar();
    });
    window.addEventListener('solicitacoes_atualizadas', function () {
        atualizar();
    });
}

// ---- Aluno/Responsável: status da solicitação mais recente do próprio RA -------------
function escutarStatusAluno(ra, aoAtualizar) {
    function atualizar() {
        var doAluno = _lerSolicitacoes()
            .filter(function (s) { return String(s.ra) === String(ra); })
            .sort(function (a, b) { return (b.atualizadoEm || b.criadoEm) - (a.atualizadoEm || a.criadoEm); });
        aoAtualizar(doAluno[0] || null);
    }
    atualizar();
    window.addEventListener('storage', function (evento) {
        if (evento.key === CHAVE_SOLICITACOES) atualizar();
    });
    window.addEventListener('solicitacoes_atualizadas', function () {
        atualizar();
    });
}



// ---- Aluno/Responsável: status da solicitação mais recente do próprio RA -------------
function escutarStatusAluno(ra, aoAtualizar) {
    function atualizar() {
        var doAluno = _lerSolicitacoes()
            .filter(function (s) { return String(s.ra) === String(ra); })
            .sort(function (a, b) { return (b.atualizadoEm || b.criadoEm) - (a.atualizadoEm || a.criadoEm); });
        aoAtualizar(doAluno[0] || null);
    }
    atualizar();
    window.addEventListener('storage', function (evento) {
        if (evento.key === CHAVE_SOLICITACOES) atualizar();
    });
}