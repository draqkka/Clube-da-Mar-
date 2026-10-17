// ==========================================================================
// AGENDAMENTO DA VISITA AO CLUBE DA MARÉ (2 dias seguidos por turma)
//
// FLUXO (parecido com marcar uma consulta, mas pra turma inteira):
//   1) A DIRETORIA preenche o pedido (turma, escola, dia de início — o 2º dia
//      é sempre o dia seguinte —, horário de entrada e de saída, responsável,
//      contato, nº de alunos/acompanhantes, transporte, observações).
//      O pedido nasce "Pendente": precisa da AUTORIZAÇÃO do Clube da Maré.
//   2) O CLUBE DA MARÉ (painel do Desenvolvedor) confere a disponibilidade e
//      APROVA ou REPROVA (podendo sugerir outra data e escrever uma resposta).
//   3) Diretoria, professor da turma e alunos da turma veem o status na hora
//      (a tela se atualiza sozinha a cada poucos segundos).
//
// Os dados ficam no banco (/api/agendamentos), igual às solicitações de
// participação (solicitacoes-local.js): cópia em memória + reserva no
// localStorage + busca automática no servidor.
//
// Este arquivo NÃO depende de solicitacoes-local.js (todos os nomes aqui
// começam com "_ag" / "ag" pra não esbarrar nos de lá).
// ==========================================================================

// ---- CONFIGURAÇÃO (edite aqui) ---------------------------------------------
var AGENDAMENTO_DIAS = 2;                    // a visita dura 2 dias seguidos
var AGENDAMENTO_ANTECEDENCIA_MIN_DIAS = 1;   // 1 = o primeiro dia pode ser a partir de amanhã
var AGENDAMENTO_HORA_ENTRADA_PADRAO = '08:00';
var AGENDAMENTO_HORA_SAIDA_PADRAO = '17:00';
var AGENDAMENTO_TRANSPORTES = ['Ônibus fretado', 'Ônibus escolar', 'Transporte público', 'Van / carros particulares', 'Outro'];
var AGENDAMENTO_CARGOS = ['Diretor(a)', 'Vice-diretor(a)', 'Coordenador(a) pedagógico(a)', 'Outro'];
// ----------------------------------------------------------------------------

var CHAVE_AGENDAMENTOS = 'cdm_agendamentos';
var URL_AGENDAMENTOS = '/api/agendamentos';
var INTERVALO_AGENDAMENTOS_MS = 5000;

var _agOuvintes = [];
var _agCache = null;        // lista em memória (null = ainda não carregou)
var _agGravando = 0;        // gravações a caminho do servidor
var _agVersao = 0;          // sobe a cada alteração local (descarta busca "velha")
var _agTimer = null;
var _agAtualizouUmaVez = false;

// ---- utilidades ------------------------------------------------------------
function _agEsc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

// "2ºA", "2A", "2 a" -> sempre "2ºA" (usa turmaCanonica de planilha.js se existir).
function _agTurma(t) {
    if (typeof turmaCanonica === 'function') return turmaCanonica(t);
    var m = String(t == null ? '' : t).toUpperCase().replace(/\s+/g, '').match(/(\d+)[^\dA-Z]*([A-Z]+)/);
    return m ? m[1] + '\u00BA' + m[2] : String(t || '').trim();
}

function _agGerarId() {
    return 'ag' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---- datas (sempre texto "AAAA-MM-DD", em horário local) ------------------
function agIso(d) {
    var m = String(d.getMonth() + 1), dia = String(d.getDate());
    return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (dia.length < 2 ? '0' + dia : dia);
}

function agParseIso(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return null;
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);   // meio-dia: foge de problema de fuso/horário de verão
    return isNaN(d.getTime()) ? null : d;
}

function agSomarDias(iso, n) {
    var d = agParseIso(iso);
    if (!d) return '';
    d.setDate(d.getDate() + n);
    return agIso(d);
}

function agHoje() { return agIso(new Date()); }

// Primeiro dia que a Diretoria pode escolher (hoje + antecedência mínima).
function agPrimeiroDiaPermitido() { return agSomarDias(agHoje(), AGENDAMENTO_ANTECEDENCIA_MIN_DIAS); }

// Último dia da visita: início + (dias - 1).
function agDataFim(inicio) { return agSomarDias(inicio, AGENDAMENTO_DIAS - 1); }

var _AG_DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function agDataBR(iso) {
    var p = String(iso || '').split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '';
}

function agDiaSemana(iso) {
    var d = agParseIso(iso);
    return d ? _AG_DIAS_SEMANA[d.getDay()] : '';
}

// "sexta, 13/11/2026"
function agDataCompleta(iso) {
    var s = agDiaSemana(iso);
    return (s ? s + ', ' : '') + agDataBR(iso);
}

// "quinta 12/11 e sexta 13/11/2026"
function agPeriodoTexto(a) {
    if (!a || !a.dataInicio) return '';
    var i = agDataBR(a.dataInicio), f = agDataBR(a.dataFim || agDataFim(a.dataInicio));
    return agDiaSemana(a.dataInicio) + ' ' + i.slice(0, 5) + ' e ' + agDiaSemana(a.dataFim || agDataFim(a.dataInicio)) + ' ' + f;
}

// "12/11 e 13/11" (curto, pra cartões pequenos)
function agPeriodoCurto(a) {
    if (!a || !a.dataInicio) return '';
    return agDataBR(a.dataInicio).slice(0, 5) + ' e ' + agDataBR(a.dataFim || agDataFim(a.dataInicio)).slice(0, 5);
}

// "17/10/2026 às 14:35" a partir de um carimbo de tempo (ms). Sempre no
// horário de Brasília, não importa o fuso do computador de quem está olhando.
function agDataHora(ms) {
    var n = Number(ms);
    if (!isFinite(n) || n <= 0) return '';
    try {
        var partes = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false
        }).formatToParts(new Date(n));
        var v = {};
        partes.forEach(function (p) { v[p.type] = p.value; });
        return v.day + '/' + v.month + '/' + v.year + ' às ' + (v.hour === '24' ? '00' : v.hour) + ':' + v.minute;
    } catch (e) {
        var d = new Date(n);
        function z(x) { return (x < 10 ? '0' : '') + x; }
        return z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear() + ' às ' + z(d.getHours()) + ':' + z(d.getMinutes());
    }
}

// A visita já terminou? (usado pra não bloquear a turma depois da data)
function agJaPassou(a) {
    return !!a && !!a.dataFim && a.dataFim < agHoje();
}

// ---- armazenamento (memória + localStorage + servidor) ---------------------
function _agLerReserva() {
    try { return JSON.parse(localStorage.getItem(CHAVE_AGENDAMENTOS) || '[]'); }
    catch (e) { return []; }
}

function _agGuardarReserva() {
    try { localStorage.setItem(CHAVE_AGENDAMENTOS, JSON.stringify(_agCache || [])); } catch (e) {}
}

function _agLista() {
    if (_agCache === null) _agCache = _agLerReserva();
    return _agCache.map(function (a) { return Object.assign({}, a); });   // cópia: quem chama pode mexer à vontade
}

function _agAvisar() {
    _agOuvintes.forEach(function (atualizar) { atualizar(); });
    // O status das solicitações dos alunos depende do agendamento da turma
    // (ver status-solicitacao.js): redesenha essas telas também.
    if (typeof _avisarOuvintes === 'function') _avisarOuvintes();
}

function _agSalvarLista(lista) {
    _agCache = lista;
    _agVersao++;
    _agGuardarReserva();
    _agAvisar();
}

function _agApi(metodo, url, corpo) {
    return fetch(url, {
        method: metodo,
        headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
        body: corpo ? JSON.stringify(corpo) : undefined,
        cache: 'no-store'
    }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
            if (!r.ok) throw new Error(j.erro || ('Erro ' + r.status));
            return j;
        });
    });
}

function _agEnviar(promessa) {
    _agGravando++;
    return promessa.then(function (r) { _agGravando--; return r; },
        function (e) { _agGravando--; console.warn('Agendamentos: não consegui salvar no servidor —', e.message); throw e; });
}

function _agGravarNoServidor(agendamento) {
    return _agEnviar(_agApi('POST', URL_AGENDAMENTOS, { agendamento: agendamento }));
}

// Busca a lista no banco e atualiza as telas (só se algo mudou).
function _agAtualizarDoServidor() {
    if (_agGravando > 0) return Promise.resolve();
    var versaoNoInicio = _agVersao;
    return _agApi('GET', URL_AGENDAMENTOS).then(function (resp) {
        if (versaoNoInicio !== _agVersao || _agGravando > 0) return;   // a pessoa mexeu enquanto a busca ia e voltava
        var doServidor = resp.agendamentos || [];
        var antes = JSON.stringify(_agCache || []);
        var depois = JSON.stringify(doServidor);
        _agCache = doServidor;
        _agGuardarReserva();
        if (antes !== depois || !_agAtualizouUmaVez) { _agAtualizouUmaVez = true; _agAvisar(); }
    }).catch(function (e) {
        console.warn('Agendamentos: não consegui buscar no servidor —', e.message);
    });
}

function _agIniciarAtualizacao() {
    if (_agTimer) return;
    _agAtualizarDoServidor();
    _agTimer = setInterval(_agAtualizarDoServidor, INTERVALO_AGENDAMENTOS_MS);
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) _agAtualizarDoServidor();
    });
    // Duas abas no mesmo navegador: a reserva local mudou -> mostra já.
    window.addEventListener('storage', function (evento) {
        if (evento.key === CHAVE_AGENDAMENTOS) {
            _agCache = _agLerReserva();
            _agAvisar();
        }
    });
}

function _agRegistrar(atualizar) {
    _agOuvintes.push(atualizar);
    atualizar();   // mostra já o que há na reserva local
    _agIniciarAtualizacao();
}

function _agAlterar(id, mudar) {
    var lista = _agLista();
    var ag = lista.filter(function (a) { return a.id === id; })[0];
    if (!ag) return Promise.resolve();
    mudar(ag);
    _agSalvarLista(lista);
    return _agGravarNoServidor(ag).catch(function () {});
}

// ---- LEITURA (ao vivo) -----------------------------------------------------
// Todos os agendamentos, mais recentes primeiro (Diretoria e Clube da Maré).
function escutarAgendamentos(aoAtualizar) {
    _agRegistrar(function () {
        aoAtualizar(_agLista().sort(function (a, b) { return b.criadoEm - a.criadoEm; }));
    });
}

// Só os de UMA turma (professor e aluno). "obterTurma" pode ser um texto ou uma
// função (o professor troca de turma sem recarregar a página).
function escutarAgendamentosDaTurma(obterTurma, aoAtualizar) {
    _agRegistrar(function () {
        var turma = _agTurma(typeof obterTurma === 'function' ? obterTurma() : obterTurma);
        aoAtualizar(agendamentosDaTurma(_agLista(), turma));
    });
}

function agendamentosDaTurma(lista, turma) {
    var chave = _agTurma(turma);
    return (lista || []).filter(function (a) { return chave && _agTurma(a.turma) === chave; })
        .sort(function (a, b) { return b.criadoEm - a.criadoEm; });
}

// O agendamento que representa a turma agora: o pedido em andamento ou a
// visita aprovada que ainda não passou; senão, o mais recente (ex.: reprovado).
function agendamentoAtualDaTurma(lista, turma) {
    var da = agendamentosDaTurma(lista, turma);
    var ativo = da.filter(function (a) { return (a.status === 'Pendente' || a.status === 'Aprovado') && !agJaPassou(a); })[0];
    return ativo || da[0] || null;
}

// Mesma regra, pra uma lista de uma turma só, mas só devolvendo o que ainda importa.
function agendamentoAtivoDaTurma(lista, turma) {
    return agendamentosDaTurma(lista, turma)
        .filter(function (a) { return (a.status === 'Pendente' || a.status === 'Aprovado') && !agJaPassou(a); })[0] || null;
}

// ---- VALIDAÇÃO + DISPONIBILIDADE -------------------------------------------
// As datas [ini, fim] de dois agendamentos se cruzam?
function agSobrepoe(iniA, fimA, iniB, fimB) {
    return iniA <= fimB && iniB <= fimA;
}

// Agendamentos APROVADOS (de qualquer turma) que ocupam alguma das datas.
function agConflitosAprovados(inicio, lista, ignorarId) {
    var fim = agDataFim(inicio);
    return (lista || []).filter(function (a) {
        return a.id !== ignorarId && a.status === 'Aprovado' && !agJaPassou(a) &&
            agSobrepoe(inicio, fim, a.dataInicio, a.dataFim);
    });
}

// Pedidos de OUTRAS turmas ainda aguardando o Clube nessas datas (só aviso).
function agConcorrentesPendentes(inicio, turma, lista, ignorarId) {
    var fim = agDataFim(inicio);
    var chave = _agTurma(turma);
    return (lista || []).filter(function (a) {
        return a.id !== ignorarId && a.status === 'Pendente' && _agTurma(a.turma) !== chave && !agJaPassou(a) &&
            agSobrepoe(inicio, fim, a.dataInicio, a.dataFim);
    });
}

// Períodos já reservados no Clube (aprovados e futuros), pra Diretoria ver
// antes de escolher a data. Não mostra de quem é a reserva.
function agPeriodosReservados(lista) {
    return (lista || []).filter(function (a) { return a.status === 'Aprovado' && !agJaPassou(a); })
        .sort(function (a, b) { return a.dataInicio < b.dataInicio ? -1 : 1; });
}

function _agSoDigitos(t) { return String(t || '').replace(/\D/g, ''); }

// Devolve uma lista de erros em português (vazia = pode enviar).
function validarAgendamento(d, lista) {
    var erros = [];
    if (!_agTurma(d.turma)) erros.push('Escolha a turma.');
    if (!String(d.escola || '').trim()) erros.push('Informe o nome da escola.');

    if (!d.dataInicio || !agParseIso(d.dataInicio)) {
        erros.push('Escolha o primeiro dia da visita.');
    } else if (d.dataInicio < agPrimeiroDiaPermitido()) {
        erros.push('O primeiro dia precisa ser a partir de ' + agDataBR(agPrimeiroDiaPermitido()) + '.');
    } else {
        var conflitos = agConflitosAprovados(d.dataInicio, lista, d.id);
        if (conflitos.length) {
            erros.push('O Clube da Maré já tem uma visita aprovada nesses dias (' + agPeriodoCurto(conflitos[0]) +
                '). Escolha outras datas.');
        }
    }

    if (!d.entrada || !d.saida) {
        erros.push('Informe o horário de entrada e o de saída.');
    } else if (d.saida <= d.entrada) {
        erros.push('O horário de saída precisa ser depois do de entrada.');
    }

    if (!String(d.responsavel || '').trim()) erros.push('Informe o nome do responsável pelo pedido.');
    if (_agSoDigitos(d.telefone).length < 10) erros.push('Informe um telefone com DDD (10 ou 11 números).');
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) erros.push('O e-mail parece inválido.');
    if (!(Number(d.numAlunos) > 0)) erros.push('Informe quantos alunos vão.');
    if (!(Number(d.numAcompanhantes) > 0)) erros.push('Informe quantos acompanhantes (professores/monitores) vão — pelo menos 1.');
    if (!String(d.transporte || '').trim()) erros.push('Escolha o transporte.');

    var ativo = agendamentoAtivoDaTurma(lista, d.turma);
    if (ativo && ativo.id !== d.id) {
        erros.push('A turma ' + _agTurma(d.turma) + ' já tem um agendamento ' +
            (ativo.status === 'Aprovado' ? 'aprovado' : 'em análise') + ' (' + agPeriodoCurto(ativo) +
            '). Cancele-o antes de fazer um novo pedido.');
    }
    return erros;
}

// ---- DIRETORIA: cria o pedido (nasce "Pendente") ---------------------------
function criarAgendamento(d) {
    var novo = {
        id: _agGerarId(),
        turma: _agTurma(d.turma),
        escola: String(d.escola || '').trim(),
        dataInicio: d.dataInicio,
        dataFim: agDataFim(d.dataInicio),            // sempre o dia seguinte
        entrada: d.entrada,
        saida: d.saida,
        responsavel: String(d.responsavel || '').trim(),
        cargo: d.cargo || '',
        telefone: String(d.telefone || '').trim(),
        email: String(d.email || '').trim().toLowerCase(),
        numAlunos: Number(d.numAlunos) || 0,
        numAcompanhantes: Number(d.numAcompanhantes) || 0,
        transporte: d.transporte || '',
        observacao: String(d.observacao || '').trim(),
        criadoPor: d.criadoPor || '',
        status: 'Pendente',
        resposta: '',
        dataSugerida: '',
        respondidoEm: 0,
        criadoEm: Date.now()
    };
    var lista = _agLista();
    lista.push(novo);
    _agSalvarLista(lista);
    // O erro SOBE (a tela mostra "não foi possível enviar") e o pedido que não
    // chegou ao banco é tirado da lista.
    return _agGravarNoServidor(novo).then(function () { return novo; }, function (erro) {
        _agSalvarLista(_agLista().filter(function (a) { return a.id !== novo.id; }));
        throw new Error('não consegui salvar no servidor (' + erro.message + ')');
    });
}

// ---- CLUBE DA MARÉ (Desenvolvedor): responde ------------------------------
function aprovarAgendamento(id, resposta) {
    return _agAlterar(id, function (a) {
        a.status = 'Aprovado';
        a.resposta = resposta || '';
        a.dataSugerida = '';
        a.respondidoEm = Date.now();
    });
}

function recusarAgendamento(id, resposta, dataSugerida) {
    return _agAlterar(id, function (a) {
        a.status = 'Recusado';
        a.resposta = resposta || '';
        a.dataSugerida = dataSugerida || '';
        a.respondidoEm = Date.now();
    });
}

// Clube da Maré volta atrás: a decisão vira "Pendente" de novo.
function reabrirAgendamento(id) {
    return _agAlterar(id, function (a) {
        a.status = 'Pendente';
        a.resposta = '';
        a.dataSugerida = '';
        a.respondidoEm = 0;
    });
}

// ---- DIRETORIA: desiste do pedido ou da visita ------------------------------
function cancelarAgendamento(id) {
    return _agAlterar(id, function (a) {
        a.status = 'Cancelado';
        a.respondidoEm = Date.now();
    });
}

// ---- DIRETORIA: apaga o agendamento de vez (some do banco pra todo mundo) ---
// Diferente de cancelar (que mantém o registro como "Cancelado"), aqui o
// agendamento é removido. Se o servidor falhar, a lista local é restaurada
// e o erro sobe pra tela avisar.
function apagarAgendamento(id) {
    var antes = _agLista();
    var depois = antes.filter(function (a) { return a.id !== id; });
    if (depois.length === antes.length) return Promise.resolve();
    _agSalvarLista(depois);
    return _agEnviar(_agApi('DELETE', URL_AGENDAMENTOS + '?id=' + encodeURIComponent(id)))
        .catch(function (erro) {
            _agSalvarLista(antes);
            throw erro;
        });
}

// ---- Desenvolvedor: apaga tudo (uso em testes) ----------------------------
function limparTodosAgendamentos() {
    _agSalvarLista([]);
    return _agEnviar(_agApi('DELETE', URL_AGENDAMENTOS + '?todos=1')).catch(function () {});
}

// ---- STATUS (os mesmos textos em todos os painéis) -------------------------
//   Pendente  -> 🟡 Aguardando o Clube da Maré
//   Aprovado  -> 🟢 Data aprovada pelo Clube da Maré
//   Recusado  -> 🔴 Data reprovada pelo Clube da Maré
//   Cancelado -> ⚪ Cancelado pela direção
function infoStatusAgendamento(a) {
    if (!a) {
        return { chave: 'sem-agendamento', classe: 'status-pendente', emoji: '📅', rotulo: 'Visita ainda não agendada',
                 curto: 'Não agendada', mensagem: 'A direção ainda não pediu a data da visita ao Clube da Maré.' };
    }
    if (a.status === 'Aprovado') {
        return { chave: 'aprovado', classe: 'status-aprovado', emoji: '🟢', rotulo: 'Data aprovada pelo Clube da Maré',
                 curto: 'Aprovada', mensagem: 'O Clube da Maré autorizou a visita nas datas pedidas. 🎉' };
    }
    if (a.status === 'Recusado') {
        return { chave: 'reprovado', classe: 'status-recusado', emoji: '🔴', rotulo: 'Data reprovada pelo Clube da Maré',
                 curto: 'Reprovada', mensagem: 'O Clube da Maré não tem disponibilidade nessas datas. A direção pode pedir outras datas.' };
    }
    if (a.status === 'Cancelado') {
        return { chave: 'cancelado', classe: 'status-cancelado', emoji: '⚪', rotulo: 'Cancelado pela direção',
                 curto: 'Cancelada', mensagem: 'A direção cancelou este pedido de visita.' };
    }
    return { chave: 'analise', classe: 'status-aguardando-dev', emoji: '🟡', rotulo: 'Agendado pela direção — aguardando aprovação do Clube da Maré',
             curto: 'Aguardando o Clube', mensagem: 'A direção fez o agendamento da visita e está esperando a aprovação do Clube da Maré.' };
}

// Contagem por status (cartões de resumo).
function contarAgendamentosPorStatus(lista) {
    var c = { total: 0, pendente: 0, aprovado: 0, recusado: 0, cancelado: 0 };
    (lista || []).forEach(function (a) {
        c.total++;
        if (a.status === 'Pendente') c.pendente++;
        else if (a.status === 'Aprovado') c.aprovado++;
        else if (a.status === 'Recusado') c.recusado++;
        else if (a.status === 'Cancelado') c.cancelado++;
    });
    return c;
}

// ---- HTML do cartão de um agendamento (Diretoria, professor, aluno e Clube) --
// opcoes: { mostrarTurma: true, mostrarContato: true, titulo: 'texto' }
function htmlCartaoAgendamento(a, opcoes) {
    opcoes = opcoes || {};
    var info = infoStatusAgendamento(a);
    if (!a) {
        return '<div class="cartao-agendamento ' + info.classe + '">' +
            '<p class="cartao-agendamento-titulo">' + info.emoji + ' ' + _agEsc(info.rotulo) + '</p>' +
            '<p class="detalhe-solicitacao">' + _agEsc(info.mensagem) + '</p></div>';
    }
    var linhas = [];
    linhas.push('<p class="cartao-agendamento-datas"><i class="fa-solid fa-calendar-days" aria-hidden="true"></i> ' +
        '<strong>' + _agEsc(agPeriodoTexto(a)) + '</strong> <span class="cartao-agendamento-dias">(' + AGENDAMENTO_DIAS + ' dias seguidos)</span></p>');
    linhas.push('<p><i class="fa-solid fa-clock" aria-hidden="true"></i> Entrada <strong>' + _agEsc(a.entrada) +
        '</strong> · Saída <strong>' + _agEsc(a.saida) + '</strong></p>');
    if (a.escola) linhas.push('<p><i class="fa-solid fa-school" aria-hidden="true"></i> ' + _agEsc(a.escola) + '</p>');
    if (opcoes.mostrarTurma) linhas.push('<p><i class="fa-solid fa-users" aria-hidden="true"></i> Turma <strong>' + _agEsc(a.turma) + '</strong></p>');
    var grupo = [];
    if (a.numAlunos) grupo.push(a.numAlunos + ' aluno(s)');
    if (a.numAcompanhantes) grupo.push(a.numAcompanhantes + ' acompanhante(s)');
    if (a.transporte) grupo.push(_agEsc(a.transporte));
    if (grupo.length) linhas.push('<p class="detalhe-solicitacao">' + grupo.join(' · ') + '</p>');
    if (opcoes.mostrarContato !== false && (a.responsavel || a.telefone || a.email)) {
        var cont = [];
        if (a.responsavel) cont.push(_agEsc(a.responsavel) + (a.cargo ? ' (' + _agEsc(a.cargo) + ')' : ''));
        if (a.telefone) cont.push(_agEsc(a.telefone));
        if (a.email) cont.push(_agEsc(a.email));
        linhas.push('<p class="detalhe-solicitacao">Responsável: ' + cont.join(' · ') + '</p>');
    }
    if (a.observacao) linhas.push('<p class="detalhe-solicitacao">Obs. da direção: ' + _agEsc(a.observacao) + '</p>');

    // Linha do tempo: quando a direção agendou e quando o Clube da Maré respondeu.
    var historico = [];
    if (a.criadoEm) {
        historico.push('<p class="agendamento-historico agendamento-historico-direcao"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> ' +
            'Agendado pela direção em <strong>' + _agEsc(agDataHora(a.criadoEm)) + '</strong>' +
            (a.criadoPor ? ' <span class="cartao-agendamento-dias">(por ' + _agEsc(a.criadoPor) + ')</span>' : '') + '</p>');
    }
    if (a.respondidoEm) {
        var quando = _agEsc(agDataHora(a.respondidoEm));
        if (a.status === 'Aprovado') {
            historico.push('<p class="agendamento-historico agendamento-historico-aprovado"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ' +
                'Aprovado pelo Clube da Maré em <strong>' + quando + '</strong></p>');
        } else if (a.status === 'Recusado') {
            historico.push('<p class="agendamento-historico agendamento-historico-recusado"><i class="fa-solid fa-circle-xmark" aria-hidden="true"></i> ' +
                'Reprovado pelo Clube da Maré em <strong>' + quando + '</strong></p>');
        } else if (a.status === 'Cancelado') {
            historico.push('<p class="agendamento-historico"><i class="fa-solid fa-ban" aria-hidden="true"></i> ' +
                'Cancelado pela direção em <strong>' + quando + '</strong></p>');
        }
    } else if (a.status === 'Pendente') {
        historico.push('<p class="agendamento-historico"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> Aguardando a aprovação do Clube da Maré</p>');
    }
    if (historico.length) linhas.push('<div class="agendamento-historico-caixa">' + historico.join('') + '</div>');

    var resposta = '';
    if (a.resposta) {
        resposta += '<p class="cartao-agendamento-resposta"><strong>Resposta do Clube da Maré:</strong> ' + _agEsc(a.resposta) + '</p>';
    }
    if (a.status === 'Recusado' && a.dataSugerida) {
        resposta += '<p class="cartao-agendamento-resposta"><strong>Data sugerida pelo Clube:</strong> ' +
            _agEsc(agPeriodoTexto({ dataInicio: a.dataSugerida, dataFim: agDataFim(a.dataSugerida) })) + '</p>';
    }

    return '<div class="cartao-agendamento ' + info.classe + '" data-ag-id="' + _agEsc(a.id) + '">' +
        '<p class="cartao-agendamento-titulo">' + info.emoji + ' ' + _agEsc(opcoes.titulo || info.rotulo) + '</p>' +
        linhas.join('') + resposta + '</div>';
}
