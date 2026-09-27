// ==========================================================================
// USUÁRIOS DO SISTEMA (login, senha, perfil) — direto no código, sem
// depender mais da aba "Usuarios" da planilha.
//
// COMO ADICIONAR/EDITAR UM USUÁRIO:
// Copie um objeto abaixo e ajuste os campos. Campos:
//   login   -> o que a pessoa digita pra entrar (e-mail, RA ou CPF)
//   senha   -> senha em texto puro (veja o aviso de segurança no chat)
//   perfil  -> 'estudante', 'responsavel', 'diretoria' ou 'professor'
//   nome    -> nome exibido no site
//   ra      -> RA do aluno (obrigatório pra estudante/responsavel; deixe
//              '' pra diretoria/professor)
//   turmas  -> turmas separadas por vírgula, sem espaço (ex: '2ºA,3ºA').
//              Pra estudante/responsavel, é a turma do próprio aluno.
//              Pra professor, são as turmas que ele pode ver/editar.
//              Deixe '' pra diretoria (ela vê todas).
// ==========================================================================
var USUARIOS = [
    { login: 'prof.mariasoares@edu.sp.br', senha: 'Edu@2026', perfil: 'professor', nome: 'Maria Soares', ra: '', turmas: '2ºA,3ºA' },
    { login: 'gabrieladiretoria@edu.sp.br', senha: 'Seduc@2026', perfil: 'diretoria', nome: 'Gabriela', ra: '', turmas: '' },
    { login: '0000108327708xsp@al.educacao.sp.gov.br', senha: 'Apparecid@2025', perfil: 'estudante', nome: 'Julia Victória', ra: '108327708xsp', turmas: '3ºA' },
    { login: '456.789.123-64', senha: 'Apparecid@2025', perfil: 'responsavel', nome: 'Elen (Mãe da Julia Victória)', ra: '108327708xsp', turmas: '3ºA' },
    { login: '00001104112772sp@al.educacao.sp.gov.br', senha: 'Apparecid@2025', perfil: 'estudante', nome: 'Rebeca Pereira', ra: '1104112772sp', turmas: '2ºA' },
    { login: '987.654.321-00', senha: 'Apparecid@2025', perfil: 'responsavel', nome: 'Joana (Mãe da Rebeca Pereira)', ra: '1104112772sp', turmas: '2ºA' }
];

// Procura um usuário que bata com login (sem diferenciar maiúscula/minúscula),
// senha (exata) e perfil. Retorna o objeto do usuário ou null.
function buscarUsuario(login, senha, perfil) {
    var encontrado = USUARIOS.find(function (u) {
        return String(u.login).trim().toLowerCase() === login.toLowerCase() &&
               String(u.senha) === senha &&
               String(u.perfil).trim().toLowerCase() === perfil;
    });
    return encontrado || null;
}
