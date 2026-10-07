// ==========================================================================
// SOLICITAÇÕES DE PARTICIPAÇÃO — guardadas no BANCO (/api/solicitacoes).
//
// Professor, direção, desenvolvedor e aluno veem a MESMA lista, mesmo em
// computadores diferentes. Como funciona:
//   - a página mantém uma cópia em memória (_cache), que é o que as telas
//     leem — por isso as funções continuam rápidas e com os mesmos nomes;
//   - toda alteração aparece na hora (cópia local) e é enviada ao banco;
//   - a cada poucos segundos (e quando a aba volta a ficar visível) a página
//     busca a lista do banco, então a resposta de outra pessoa aparece
//     sozinha, sem recarregar;
//   - uma cópia fica salva no localStorage só como reserva (abre rápido e
//     funciona se a internet cair por um instante).
//
// Na primeira vez que a página abre depois dessa mudança, as solicitações que
// estavam salvas SÓ neste navegador são enviadas ao banco (uma vez só).
// ==========================================================================
var CHAVE_SOLICITACOES = 'cdm_solicitacoes';
var CHAVE_MIGRADAS = 'cdm_solicitacoes_migradas';
var URL_SOLICITACOES = '/api/solicitacoes';
var INTERVALO_ATUALIZACAO_MS = 5000;

var _ouvintes = [];
var _cache = null;          // lista em memória (null = ainda não carregou)
var _gravandoAgora = 0;     // quantas gravações estão a caminho do servidor
var _versaoLocal = 0;       // sobe a cada alteração local (descarta busca "velha")
var _timerAtualizacao = null;
var _migracaoFeita = false;

function _lerReservaLocal() {
    try { return JSON.parse(localStorage.getItem(CHAVE_SOLICITACOES) || '[]'); }
    catch (e) { return []; }
}

function _guardarReservaLocal() {
    try { localStorage.setItem(CHAVE_SOLICITACOES, JSON.stringify(_cache || [])); } catch (e) {}
}

// Lista atual (cópia em memória). Antes da primeira busca, usa a reserva local.
function _lerSolicitacoes() {
    if (_cache === null) _cache = _lerReservaLocal();
    return _cache.map(function (s) { return _completarEmailSolicitacao(Object.assign({}, s)); }); // cópia: quem chama pode mexer à vontade
}

function _avisarOuvintes() {
    _ouvintes.forEach(function (atualizar) { atualizar(); });
}

// Troca a lista em memória, guarda a reserva e avisa as telas.
function _salvarSolicitacoes(lista) {
    _cache = lista;
    _versaoLocal++;
    _guardarReservaLocal();
    _avisarOuvintes();
}

function _chamarApi(metodo, url, corpo) {
    return fetch(url, {
        method: metodo,
        headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
        body: corpo ? JSON.stringify(corpo) : undefined
    }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
            if (!r.ok) throw new Error(j.erro || ('Erro ' + r.status));
            return j;
        });
    });
}

// Envia uma gravação ao banco. Se falhar, a próxima busca devolve a verdade
// do servidor (a tela se corrige sozinha).
function _enviarAoServidor(promessa) {
    _gravandoAgora++;
    return promessa.then(function (r) { _gravandoAgora--; return r; },
        function (e) { _gravandoAgora--; console.warn('Solicitações: não consegui salvar no servidor —', e.message); throw e; });
}

function _gravarNoServidor(solicitacao) {
    return _enviarAoServidor(_chamarApi('POST', URL_SOLICITACOES, { solicitacao: solicitacao }));
}

// Busca a lista no banco e atualiza as telas (só se algo mudou).
function _atualizarDoServidor() {
    if (_gravandoAgora > 0) return Promise.resolve();
    var versaoNoInicio = _versaoLocal;
    return _chamarApi('GET', URL_SOLICITACOES).then(function (resp) {
        // Se a pessoa mexeu em algo enquanto a busca ia e voltava, essa
        // resposta já está velha — a próxima rodada resolve.
        if (versaoNoInicio !== _versaoLocal || _gravandoAgora > 0) return;
        var doServidor = resp.solicitacoes || [];

        // Migração única: solicitações que só existiam neste navegador.
        var jaMigrou = false;
        try { jaMigrou = localStorage.getItem(CHAVE_MIGRADAS) === '1'; } catch (e) {}
        if (!jaMigrou && !_migracaoFeita) {
            _migracaoFeita = true;
            var idsServidor = {};
            doServidor.forEach(function (s) { idsServidor[s.id] = true; });
            var soLocais = _lerReservaLocal().filter(function (s) { return s && s.id && !idsServidor[s.id]; });
            if (soLocais.length) {
                return _enviarAoServidor(_chamarApi('POST', URL_SOLICITACOES, { lote: soLocais })).then(function () {
                    try { localStorage.setItem(CHAVE_MIGRADAS, '1'); } catch (e) {}
                    return _atualizarDoServidor();
                }, function () { _migracaoFeita = false; });
            }
            try { localStorage.setItem(CHAVE_MIGRADAS, '1'); } catch (e) {}
        }

        var antes = JSON.stringify(_cache || []);
        var depois = JSON.stringify(doServidor);
        _cache = doServidor;
        _guardarReservaLocal();
        if (antes !== depois || !_atualizouUmaVez) { _atualizouUmaVez = true; _avisarOuvintes(); }
    }).catch(function (e) {
        console.warn('Solicitações: não consegui buscar no servidor —', e.message);
    });
}
var _atualizouUmaVez = false;

function _iniciarAtualizacaoAutomatica() {
    if (_timerAtualizacao) return;
    _atualizarDoServidor();
    _timerAtualizacao = setInterval(_atualizarDoServidor, INTERVALO_ATUALIZACAO_MS);
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) _atualizarDoServidor();
    });
    // Duas abas no mesmo navegador: a reserva local mudou -> mostra já.
    window.addEventListener('storage', function (evento) {
        if (evento.key === CHAVE_SOLICITACOES) {
            _cache = _lerReservaLocal();
            _avisarOuvintes();
        }
    });
}

function _registrarOuvinte(atualizar) {
    _ouvintes.push(atualizar);
    atualizar(); // mostra o estado atual (reserva local) assim que a página chama escutarXxx
    _iniciarAtualizacaoAutomatica();
}

// Altera UMA solicitação (função "mudar" recebe o objeto) e grava no banco.
function _alterarSolicitacao(id, mudar) {
    var lista = _lerSolicitacoes();
    var solicitacao = lista.filter(function (s) { return s.id === id; })[0];
    if (!solicitacao) return Promise.resolve();
    mudar(solicitacao);
    _salvarSolicitacoes(lista);
    return _gravarNoServidor(solicitacao).catch(function () {});
}

// Compara RA ignorando maiúscula/minúscula, pontuação e zeros à esquerda
// (o RA do login pode vir escrito diferente do RA da planilha).
function _raChave(r) {
    return String(r == null ? '' : r).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '').replace(/SP$/, '');
}

function _gerarId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---- IDENTIFICAÇÃO DO ALUNO PELO E-MAIL ------------------------------------
// O aluno é identificado pelo E-MAIL do login (usuarios.js), não pelo RA —
// o RA vindo da planilha podia estar errado ou nem existir (virava "NOME" +
// nome do aluno). Cada solicitação guarda "emailAluno". Solicitações antigas,
// que só têm nome/RA, são ligadas ao e-mail pelo NOME + turma.
function _textoSemAcento(t) {
    return String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/\s+/g, ' ').trim();
}

function _turmaChaveSolic(t) {
    return _textoSemAcento(t).replace(/[^A-Z0-9]/g, '');
}

function _palavrasDoNome(n) {
    return _textoSemAcento(n).replace(/[^A-Z ]/g, ' ').split(' ').filter(function (p) {
        return p && ['DE', 'DA', 'DO', 'DAS', 'DOS', 'E'].indexOf(p) === -1;
    });
}

// "Julia Victória" e "JULIA VICTÓRIA SANTOS SILVA" são a mesma pessoa:
// vale se todas as palavras do nome mais curto (mín. 2) estão no mais longo.
function nomesCompativeis(a, b) {
    var pa = _palavrasDoNome(a), pb = _palavrasDoNome(b);
    if (!pa.length || !pb.length) return false;
    var curto = pa.length <= pb.length ? pa : pb;
    var longo = pa.length <= pb.length ? pb : pa;
    if (curto.length < 2 && curto.length !== longo.length) return false;
    return curto.every(function (p) { return longo.indexOf(p) !== -1; });
}

// A solicitação "s" é desse aluno? "aluno" pode ser um registro de aluno ou
// { email, nome, turma, ra }. Ordem: e-mail (se os dois têm) > RA > nome+turma.
function solicitacaoDoMesmoAluno(s, aluno) {
    if (!s || !aluno) return false;
    var es = String(s.emailAluno || '').trim().toLowerCase();
    var ea = String(aluno.email || '').trim().toLowerCase();
    if (es && ea) return es === ea;

    var raS = _raChave(s.ra), raA = _raChave(aluno.ra);
    if (raS && raA && raS === raA) return true;

    var nomeA = aluno.nome || aluno.nomeAluno;
    if (nomeA && s.nomeAluno && nomesCompativeis(nomeA, s.nomeAluno)) {
        return !aluno.turma || !s.turma || _turmaChaveSolic(aluno.turma) === _turmaChaveSolic(s.turma);
    }
    return false;
}

// Solicitação antiga sem e-mail: tenta descobrir o e-mail pelo nome + turma
// entre os estudantes de usuarios.js (só se achar UM estudante, sem dúvida).
function _completarEmailSolicitacao(s) {
    if (s.emailAluno || typeof listarEstudantes !== 'function') return s;
    var candidatos = listarEstudantes().filter(function (u) {
        var turmaU = typeof primeiraTurmaDoUsuario === 'function' ? primeiraTurmaDoUsuario(u) : '';
        return nomesCompativeis(u.nome, s.nomeAluno) &&
            (!turmaU || !s.turma || _turmaChaveSolic(turmaU) === _turmaChaveSolic(s.turma));
    });
    if (candidatos.length === 1) s.emailAluno = String(candidatos[0].login).trim().toLowerCase();
    return s;
}

// ---- FLUXO DE APROVAÇÃO EM DUAS ETAPAS -----------------------------------
// status possíveis de uma solicitação:
//   'Pendente'              -> professor enviou, aguardando a Diretoria
//   'Aguardando Desenvolvedor' -> Diretoria já aprovou; falta a confirmação
//                                 final do Desenvolvedor (ele fica "acima"
//                                 da Diretoria nessa decisão)
//   'Aprovado'              -> confirmado pelo Desenvolvedor (final)
//   'Recusado'              -> recusado (por Diretoria OU Desenvolvedor)
// Na TELA, cada status tem um nome (ver status-solicitacao.js):
//   Aguardando Desenvolvedor -> "Aprovado pela direção" + "Esperando contato
//   equipe Clube da Maré"; Aprovado -> "Confirmada pela equipe Clube da Maré".
// O Desenvolvedor só enxerga o que a direção encaminhou (aprovadoDirecao).
// O campo "respondidoPor" guarda quem tomou a última decisão ('Diretoria'
// ou 'Desenvolvedor'), pra ficar registrado quem decidiu de verdade.
// ---------------------------------------------------------------------------

// ---- Professor: cria uma nova solicitação (sempre nasce "Pendente") ------
function criarSolicitacao(dados) {
    var nova = {
        id: _gerarId(),
        emailAluno: String(dados.emailAluno || '').trim().toLowerCase(),   // identifica o aluno
        ra: String(dados.ra == null ? '' : dados.ra),                      // só de reserva (pode estar errado)
        nomeAluno: dados.nomeAluno,
        turma: dados.turma,
        escola: dados.escola || '',
        professor: dados.professor,
        observacao: dados.observacao || '',
        status: 'Pendente',
        resposta: '',
        respondidoPor: '',
        aprovadoDirecao: false,
        criadoEm: Date.now()
    };
    var lista = _lerSolicitacoes();
    lista.push(nova);
    _salvarSolicitacoes(lista);
    // Aqui o erro SOBE (a tela do professor mostra "não foi possível enviar") e
    // a solicitação que não chegou ao banco é tirada da lista.
    return _gravarNoServidor(nova).catch(function (erro) {
        _salvarSolicitacoes(_lerSolicitacoes().filter(function (s) { return s.id !== nova.id; }));
        throw new Error('não consegui salvar no servidor (' + erro.message + ')');
    });
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
// aprovadoDirecao -> true quando a solicitação já passou pela aprovação da
//                    direção (é isso que faz ela aparecer pro Desenvolvedor)
function responderSolicitacao(id, novoStatus, resposta, respondidoPor, aprovadoDirecao) {
    return _alterarSolicitacao(id, function (s) {
        s.status = novoStatus;
        s.resposta = resposta || '';
        s.respondidoPor = respondidoPor || '';
        s.aprovadoDirecao = !!aprovadoDirecao;
    });
}

// ---- Diretoria: aprova uma solicitação pendente. Isso NÃO é a aprovação
// final — só passa a solicitação pra etapa de confirmação do Desenvolvedor.
function aprovarComoDiretoria(id, resposta) {
    return responderSolicitacao(id, 'Aguardando Desenvolvedor', resposta, 'Diretoria', true);
}

// ---- Diretoria: recusa uma solicitação pendente (decisão final dela) -----
function recusarComoDiretoria(id, resposta) {
    return responderSolicitacao(id, 'Recusado', resposta, 'Diretoria', false);
}

// ---- Desenvolvedor: confirmação final — aprova ou recusa qualquer
// solicitação que ainda não esteja com decisão final (Pendente ou
// Aguardando Desenvolvedor). Como o Desenvolvedor está acima da Diretoria
// nessa hierarquia, ele também pode agir direto numa "Pendente" sem
// esperar a Diretoria, se precisar.
function aprovarComoDesenvolvedor(id, resposta) {
    return responderSolicitacao(id, 'Aprovado', resposta, 'Desenvolvedor', true);
}

function recusarComoDesenvolvedor(id, resposta) {
    return responderSolicitacao(id, 'Recusado', resposta, 'Desenvolvedor', true);
}

// ---- Diretoria: reabre uma solicitação que ELA MESMA recusou, pra
// reavaliar (volta pra "Pendente" e limpa a resposta anterior). Só faz
// sentido pra decisões que ainda são dela — uma vez que o Desenvolvedor
// decide (Aprovado/Recusado por ele), só o próprio Desenvolvedor reabre.
function reabrirSolicitacao(id) {
    return _alterarSolicitacao(id, function (s) {
        s.status = 'Pendente';
        s.resposta = '';
        s.respondidoPor = '';
        s.aprovadoDirecao = false;
    });
}

// ---- Desenvolvedor: reabre uma decisão dele (Aprovado/Recusado) — volta
// pra "Aguardando Desenvolvedor", ou seja, pra fila DELE (não pra direção).
function reabrirComoDesenvolvedor(id) {
    return _alterarSolicitacao(id, function (s) {
        s.status = 'Aguardando Desenvolvedor';
        s.resposta = '';
        s.respondidoPor = '';
        s.aprovadoDirecao = true;
    });
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
    return _alterarSolicitacao(id, function (s) {
        s.status = 'Pendente';
        s.observacao = novaObservacao || s.observacao;
        s.resposta = '';
        s.respondidoPor = '';
        s.aprovadoDirecao = false;
        s.criadoEm = Date.now(); // volta pro topo da fila da Diretoria
    });
}

// ---- Professor: cancela (remove) uma solicitação enviada -----------------
function cancelarSolicitacao(id) {
    _salvarSolicitacoes(_lerSolicitacoes().filter(function (s) { return s.id !== id; }));
    return _enviarAoServidor(_chamarApi('DELETE', URL_SOLICITACOES + '?id=' + encodeURIComponent(id))).catch(function () {});
}

// ---- Desenvolvedor: apaga TODAS as solicitações do banco (uso em testes) --
function limparTodasSolicitacoes() {
    _salvarSolicitacoes([]);
    return _enviarAoServidor(_chamarApi('DELETE', URL_SOLICITACOES + '?todas=1')).catch(function () {});
}

// ---- Aluno: status da solicitação mais recente do PRÓPRIO ALUNO -----------
// "aluno" = { email, nome, turma, ra } (o e-mail é o que vale). Por
// compatibilidade, ainda aceita só um texto (RA).
function escutarStatusAluno(aluno, aoAtualizar) {
    if (typeof aluno !== 'object' || aluno === null) aluno = { ra: aluno };
    _registrarOuvinte(function () {
        var doAluno = _lerSolicitacoes()
            .filter(function (s) { return solicitacaoDoMesmoAluno(s, aluno); })
            .sort(function (a, b) { return b.criadoEm - a.criadoEm; });
        aoAtualizar(doAluno[0] || null);
    });
}
