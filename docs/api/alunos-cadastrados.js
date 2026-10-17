// Alunos cadastrados PELO PROFESSOR (e-mail institucional + senha), guardados
// no banco (Postgres/Neon). O site não consegue escrever dentro do arquivo
// usuarios.js depois de publicado, então estes cadastros ficam aqui e o
// usuarios.js os junta à lista na hora de abrir a página.
//
// GET  /api/alunos-cadastrados                    -> { usuarios: [{ login, nome, turmas, ra, perfil }] }
//                                          (não devolve senha)
// GET  /api/alunos-cadastrados?senhas=1           -> igual, mas com o campo "senha" (usado só pelo painel do desenvolvedor)
//                                          (alunas cadastradas antes desta versão vêm com senha vazia)
// POST /api/alunos-cadastrados  { acao: 'cadastrar', solicitacaoId, email, senha, professor }
//        -> cadastra o aluno dessa solicitação (nome e turma vêm da própria
//           solicitação). Só funciona se a participação já foi solicitada.
// DELETE /api/alunos-cadastrados?email=...  -> remove o aluno cadastrado (o professor pode cadastrar de novo)
// POST /api/alunos-cadastrados  { acao: 'login', email, senha }
//        -> { usuario: {...} } se e-mail e senha conferem (senha guardada com hash).
//
// A tabela "usuarios_cadastrados" é criada sozinha na primeira chamada.
const crypto = require('crypto');
const { db } = require('./_db');

function texto(v, max) {
    return String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, max || 200);
}

function emailValido(e) {
    return e.length <= 150 && /^[^\s@"']+@[^\s@"']+\.[^\s@"']+$/.test(e);
}

// "JULIA VICTÓRIA SANTOS SILVA" -> "Julia Victória Santos Silva"
function nomeBonito(n) {
    const pequenas = ['de', 'da', 'do', 'das', 'dos', 'e'];
    return String(n || '').toLowerCase().split(/\s+/).filter(Boolean).map(function (p, i) {
        return (i > 0 && pequenas.indexOf(p) !== -1) ? p : p.charAt(0).toUpperCase() + p.slice(1);
    }).join(' ');
}

function criarHash(senha) {
    const sal = crypto.randomBytes(16).toString('hex');
    return sal + ':' + crypto.scryptSync(senha, sal, 64).toString('hex');
}

function senhaConfere(senha, guardado) {
    const partes = String(guardado || '').split(':');
    if (partes.length !== 2) return false;
    const esperado = Buffer.from(partes[1], 'hex');
    const atual = crypto.scryptSync(senha, partes[0], 64);
    return esperado.length === atual.length && crypto.timingSafeEqual(esperado, atual);
}

// Cópia criptografada (AES-256-GCM) da senha, só pra o painel do desenvolvedor
// poder "mostrar". O login continua conferindo pelo hash (senha_hash).
// Defina SENHAS_CHAVE na Vercel (qualquer texto longo); sem ela usa a string do banco.
function chaveSenhas() {
    const base = process.env.SENHAS_CHAVE || process.env.POSTGRES_URL || process.env.DATABASE_URL || 'clube-da-mare';
    return crypto.createHash('sha256').update(String(base)).digest();
}

function cifrarSenha(senha) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', chaveSenhas(), iv);
    const dados = Buffer.concat([c.update(String(senha), 'utf8'), c.final()]);
    return [iv.toString('hex'), c.getAuthTag().toString('hex'), dados.toString('hex')].join(':');
}

function decifrarSenha(guardado) {
    try {
        const p = String(guardado || '').split(':');
        if (p.length !== 3) return '';
        const d = crypto.createDecipheriv('aes-256-gcm', chaveSenhas(), Buffer.from(p[0], 'hex'));
        d.setAuthTag(Buffer.from(p[1], 'hex'));
        return Buffer.concat([d.update(Buffer.from(p[2], 'hex')), d.final()]).toString('utf8');
    } catch (e) {
        return '';
    }
}

let tabelaPronta = false;

async function banco() {
    const sql = await db();
    if (!tabelaPronta) {
        await sql`
            CREATE TABLE IF NOT EXISTS usuarios_cadastrados (
                email          text PRIMARY KEY,
                nome           text NOT NULL,
                turma          text NOT NULL DEFAULT '',
                ra             text NOT NULL DEFAULT '',
                senha_hash     text NOT NULL,
                solicitacao_id text NOT NULL DEFAULT '',
                professor      text NOT NULL DEFAULT '',
                criado_em      timestamptz NOT NULL DEFAULT now()
            )`;
        await sql`ALTER TABLE usuarios_cadastrados ADD COLUMN IF NOT EXISTS senha_cripto text NOT NULL DEFAULT ''`;
        // a solicitação é consultada aqui; garante que a tabela dela existe
        await sql`
            CREATE TABLE IF NOT EXISTS solicitacoes (
                id            text PRIMARY KEY,
                dados         jsonb NOT NULL,
                atualizado_em timestamptz NOT NULL DEFAULT now()
            )`;
        tabelaPronta = true;
    }
    return sql;
}

function paraUsuario(l) {
    return { login: l.email, nome: l.nome, turmas: l.turma, ra: l.ra, perfil: 'estudante' };
}

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    try {
        const sql = await banco();

        if (req.method === 'GET') {
            const linhas = await sql`SELECT email, nome, turma, ra, senha_cripto FROM usuarios_cadastrados ORDER BY nome`;
            const comSenha = req.query && req.query.senhas === '1';
            return res.status(200).json({
                usuarios: linhas.map(function (l) {
                    const u = paraUsuario(l);
                    if (comSenha) u.senha = decifrarSenha(l.senha_cripto);
                    return u;
                })
            });
        }

        if (req.method === 'POST') {
            const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
            const email = texto(corpo.email, 150).toLowerCase();
            const senha = String(corpo.senha == null ? '' : corpo.senha);

            if (corpo.acao === 'login') {
                if (!email || !senha) return res.status(400).json({ erro: 'Preencha login e senha.' });
                const l = (await sql`SELECT * FROM usuarios_cadastrados WHERE email = ${email}`)[0];
                if (!l || !senhaConfere(senha, l.senha_hash)) {
                    return res.status(401).json({ erro: 'Login, senha ou perfil incorretos.' });
                }
                return res.status(200).json({ usuario: paraUsuario(l) });
            }

            if (corpo.acao === 'cadastrar') {
                const idSolic = texto(corpo.solicitacaoId, 60).replace(/[^A-Za-z0-9_-]/g, '');
                if (!idSolic) return res.status(400).json({ erro: 'Solicitação não informada.' });
                if (!emailValido(email)) return res.status(400).json({ erro: 'Digite um e-mail institucional válido.' });
                if (senha.length < 6 || senha.length > 100) {
                    return res.status(400).json({ erro: 'A senha precisa ter de 6 a 100 caracteres.' });
                }

                // Só cadastra quem já teve a participação solicitada pelo professor.
                const linhaSolic = (await sql`SELECT dados FROM solicitacoes WHERE id = ${idSolic}`)[0];
                if (!linhaSolic) {
                    return res.status(404).json({ erro: 'Esta participação ainda não foi solicitada (ou a solicitação foi cancelada).' });
                }
                const s = linhaSolic.dados;
                const prof = texto(corpo.professor, 120).toLowerCase();
                if (prof && s.professor && String(s.professor).toLowerCase() !== prof) {
                    return res.status(403).json({ erro: 'Esta solicitação foi enviada por outro professor.' });
                }

                if ((await sql`SELECT 1 FROM usuarios_cadastrados WHERE email = ${email}`).length) {
                    return res.status(409).json({ erro: 'Este e-mail já está cadastrado.' });
                }
                if ((await sql`SELECT 1 FROM usuarios_cadastrados WHERE solicitacao_id = ${idSolic}`).length) {
                    return res.status(409).json({ erro: 'Este aluno já tem e-mail e senha cadastrados.' });
                }

                const nome = nomeBonito(s.nomeAluno);
                await sql`
                    INSERT INTO usuarios_cadastrados (email, nome, turma, ra, senha_hash, senha_cripto, solicitacao_id, professor)
                    VALUES (${email}, ${nome}, ${texto(s.turma, 20)}, '', ${criarHash(senha)}, ${cifrarSenha(senha)}, ${idSolic}, ${texto(s.professor, 120)})`;

                // Liga a solicitação ao e-mail do aluno (é assim que o painel dele a encontra).
                await sql`
                    UPDATE solicitacoes
                    SET dados = jsonb_set(dados, '{emailAluno}', to_jsonb(${email}::text)), atualizado_em = now()
                    WHERE id = ${idSolic}`;

                return res.status(200).json({ ok: true, nome: nome, turma: s.turma, email: email });
            }

            return res.status(400).json({ erro: 'Ação inválida.' });
        }

        if (req.method === 'DELETE') {
            const emailRemover = texto(req.query && req.query.email, 150).toLowerCase();
            if (!emailRemover) return res.status(400).json({ erro: 'Informe o e-mail.' });
            const achado = (await sql`SELECT solicitacao_id FROM usuarios_cadastrados WHERE email = ${emailRemover}`)[0];
            if (!achado) return res.status(404).json({ erro: 'Aluno cadastrado não encontrado.' });
            await sql`DELETE FROM usuarios_cadastrados WHERE email = ${emailRemover}`;
            // Solta a solicitação do e-mail removido (o professor poderá cadastrar de novo).
            if (achado.solicitacao_id) {
                await sql`
                    UPDATE solicitacoes
                    SET dados = jsonb_set(dados, '{emailAluno}', '""'::jsonb), atualizado_em = now()
                    WHERE id = ${achado.solicitacao_id} AND dados->>'emailAluno' = ${emailRemover}`;
            }
            return res.status(200).json({ ok: true });
        }

        res.setHeader('Allow', 'GET, POST, DELETE');
        return res.status(405).json({ erro: 'Método não permitido.' });
    } catch (erro) {
        console.error('Erro em /api/alunos-cadastrados:', erro);
        return res.status(500).json({ erro: erro.message || 'Erro no servidor.' });
    }
};
