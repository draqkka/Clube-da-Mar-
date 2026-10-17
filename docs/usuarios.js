// ==========================================================================
// USUÁRIOS DO SISTEMA (login, senha, perfil) — direto no código, sem
// depender mais da aba "Usuarios" da planilha.
//
// COMO ADICIONAR/EDITAR UM USUÁRIO:
// Copie um objeto abaixo e ajuste os campos. Campos:
//   login   -> o que a pessoa digita pra entrar. É o E-MAIL da pessoa e é
//              ELE que identifica cada aluno(a) no sistema inteiro (painel
//              do aluno, solicitações do professor, Diretoria e
//              Desenvolvedor) — o RA não é mais usado pra isso.
//   senha   -> senha em texto puro (veja o aviso de segurança no chat)
//   perfil  -> 'estudante', 'diretoria', 'professor' ou
//              'desenvolvedor' (acesso total ao sistema — ver dashboard-
//              desenvolvedor.html)
//   nome    -> nome exibido no site
//   ra      -> OPCIONAL. Só ajuda a achar o aluno na planilha quando o RA
//              da planilha é o correto. Pode deixar '' sem problema: o
//              sistema acha o aluno pelo e-mail + nome + turma.
//   turmas  -> turmas separadas por vírgula, sem espaço (ex: '2ºA,3ºA').
//              Pra estudante, é a turma do próprio aluno. Todo estudante
//              cadastrado aqui já aparece pro professor da turma e na
//              Diretoria/Desenvolvedor, MESMO que ainda não esteja em
//              nenhuma planilha importada.
//              Pra professor, são as turmas que ele pode ver/editar.
//              Deixe '' pra diretoria e desenvolvedor (ambos veem todas).
//
// ⚠️ AVISO DE SEGURANÇA: como o site não tem servidor, este arquivo (com
// login/senha em texto puro) é lido pelo navegador de qualquer visitante —
// ou seja, qualquer pessoa consegue abrir "usuarios.js" e ver todas as
// senhas, inclusive a do desenvolvedor. Isso serve pra teste/demonstração,
// mas não é seguro pra um sistema real com dados sensíveis; o ideal depois
// é migrar login/senha pra um backend de verdade (ex.: Firebase Auth).
// ==========================================================================
var USUARIOS = [
    { login: 'prof.mariasoares@edu.sp.br', senha: 'Edu@2026', perfil: 'professor', nome: 'Maria Soares', ra: '', turmas: '1ºA,1ºB,2ºA,2ºB,3ºA' },
    { login: 'gabrieladiretoria@edu.sp.br', senha: 'Seduc@2026', perfil: 'diretoria', nome: 'Gabriela', ra: '', turmas: '' },
    { login: 'dev@clubedamare.com.br', senha: 'Maré@2026', perfil: 'desenvolvedor', nome: 'Desenvolvedor', ra: '', turmas: '' },
    { login: '0000108327708xsp@al.educacao.sp.gov.br', senha: 'Apparecid@25', perfil: 'estudante', nome: 'Julia Victória', ra: '108327708xsp', turmas: '3ºA' },
    { login: '00001104112772sp@al.educacao.sp.gov.br', senha: 'Apparecid@25', perfil: 'estudante', nome: 'Rebeca dos Santos Pereira', ra: '1104112772sp', turmas: '3ºA' }
];

// Procura um usuário que bata com login (sem diferenciar maiúscula/minúscula),
// senha (exata) e perfil. Retorna o objeto do usuário ou null.
function buscarUsuario(login, senha, perfil) {
    var encontrado = USUARIOS.find(function (u) {
        if (u.doBanco) return false;   // alunos do banco não têm senha aqui (ver loginUsuarioCadastrado)
        return String(u.login).trim().toLowerCase() === login.toLowerCase() &&
               String(u.senha) === senha &&
               String(u.perfil).trim().toLowerCase() === perfil;
    });
    return encontrado || null;
}


// ==========================================================================
// ALUNOS PELO E-MAIL (substitui o RA como identificador)
// ==========================================================================

// E-mail do usuário, sempre em minúsculo e sem espaços (é o "login").
function emailDoUsuario(u) {
    return String(u && u.login != null ? u.login : '').trim().toLowerCase();
}

// Primeira turma do usuário (ex: '2ºA,3ºA' -> '2ºA').
function primeiraTurmaDoUsuario(u) {
    return String(u && u.turmas != null ? u.turmas : '').split(',')[0].trim();
}

// Todos os usuários com perfil 'estudante' (opcionalmente só os de uma turma).
function listarEstudantes(turma) {
    return USUARIOS.filter(function (u) {
        if (String(u.perfil).trim().toLowerCase() !== 'estudante') return false;
        if (!turma) return true;
        var chave = function (t) { return String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };
        return String(u.turmas || '').split(',').some(function (t) { return chave(t) === chave(turma); });
    });
}

// Procura o estudante pelo e-mail (sem diferenciar maiúscula/minúscula).
function buscarEstudantePorEmail(email) {
    var alvo = String(email || '').trim().toLowerCase();
    if (!alvo) return null;
    return listarEstudantes().filter(function (u) { return emailDoUsuario(u) === alvo; })[0] || null;
}


// ==========================================================================
// ALUNOS CADASTRADOS PELO PROFESSOR (ficam no banco, não neste arquivo)
//
// O professor cadastra o e-mail institucional + senha do aluno pelo botão
// "Cadastrar e-mail e senha" do painel dele. Como o site publicado não consegue
// escrever dentro deste arquivo, esses cadastros são guardados no banco
// (/api/alunos-cadastrados) e entram na lista USUARIOS quando a página chama
// carregarUsuariosCadastrados() — a partir daí funcionam como qualquer
// estudante daqui (aparecem em listarEstudantes, buscarEstudantePorEmail...).
// A senha NÃO vem pro navegador; o login é conferido no servidor.
// ==========================================================================
var _usuariosCadastradosPromessa = null;

function carregarUsuariosCadastrados(forcar) {
    if (_usuariosCadastradosPromessa && !forcar) return _usuariosCadastradosPromessa;
    _usuariosCadastradosPromessa = fetch('/api/alunos-cadastrados', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : { usuarios: [] }; })
        .then(function (corpo) {
            for (var i = USUARIOS.length - 1; i >= 0; i--) {
                if (USUARIOS[i].doBanco) USUARIOS.splice(i, 1);
            }
            (corpo.usuarios || []).forEach(function (u) {
                var email = String(u.login || '').trim().toLowerCase();
                var jaTem = USUARIOS.some(function (x) { return emailDoUsuario(x) === email; });
                if (!email || jaTem) return;
                USUARIOS.push({ login: email, senha: null, perfil: 'estudante', nome: u.nome, ra: u.ra || '', turmas: u.turmas || '', doBanco: true });
            });
            return USUARIOS;
        })
        .catch(function () { return USUARIOS; });
    return _usuariosCadastradosPromessa;
}

// Login de aluno cadastrado pelo professor. Devolve o usuário ou null (senha errada).
function loginUsuarioCadastrado(email, senha) {
    return fetch('/api/alunos-cadastrados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'login', email: email, senha: senha })
    }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (corpo) {
            if (r.status === 401) return null;
            if (!r.ok) throw new Error(corpo.erro || ('Erro ' + r.status));
            return corpo.usuario || null;
        });
    });
}
