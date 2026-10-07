// Solicitações de participação guardadas no banco (Postgres/Neon), pra que
// professor, direção, desenvolvedor e aluno vejam a MESMA lista mesmo
// usando computadores diferentes.
//
// GET    /api/solicitacoes            -> { solicitacoes: [...] }
// POST   /api/solicitacoes            -> grava/atualiza UMA solicitação
//        corpo: { solicitacao: {...} }  ou várias: { lote: [{...}, ...] }
// DELETE /api/solicitacoes?id=XYZ     -> apaga uma solicitação
// DELETE /api/solicitacoes?todas=1    -> apaga todas (uso em testes)
//
// A tabela "solicitacoes" é criada sozinha na primeira chamada.
const { db } = require('./_db');

const STATUS_VALIDOS = ['Pendente', 'Aguardando Desenvolvedor', 'Aprovado', 'Recusado'];
const RESPONDIDO_POR = ['', 'Diretoria', 'Desenvolvedor'];

// Os painéis montam a tela com innerHTML: tira < e > de todo texto.
function texto(v, max) {
    return String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, max || 200);
}

// Só os campos conhecidos entram no banco (nada de campo inventado).
function limpar(s) {
    if (!s || typeof s !== 'object') return null;
    const id = texto(s.id, 60).replace(/[^A-Za-z0-9_-]/g, '');
    if (!id) return null;
    const status = STATUS_VALIDOS.indexOf(s.status) !== -1 ? s.status : 'Pendente';
    const respondidoPor = RESPONDIDO_POR.indexOf(s.respondidoPor) !== -1 ? s.respondidoPor : '';
    const criadoEm = Number(s.criadoEm);
    return {
        id: id,
        ra: texto(s.ra, 40),
        nomeAluno: texto(s.nomeAluno, 150),
        turma: texto(s.turma, 20),
        escola: texto(s.escola, 200),
        professor: texto(s.professor, 120),
        observacao: texto(s.observacao, 1000),
        status: status,
        resposta: texto(s.resposta, 1000),
        respondidoPor: respondidoPor,
        aprovadoDirecao: !!s.aprovadoDirecao,
        criadoEm: isFinite(criadoEm) && criadoEm > 0 ? criadoEm : Date.now()
    };
}

let tabelaPronta = false;

async function banco() {
    const sql = await db();
    if (!tabelaPronta) {
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

async function gravar(sql, s) {
    const dados = JSON.stringify(s);
    await sql`
        INSERT INTO solicitacoes (id, dados) VALUES (${s.id}, ${dados}::jsonb)
        ON CONFLICT (id) DO UPDATE SET dados = EXCLUDED.dados, atualizado_em = now()`;
}

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    try {
        const sql = await banco();

        if (req.method === 'GET') {
            const linhas = await sql`SELECT dados FROM solicitacoes`;
            const lista = linhas.map(function (l) { return l.dados; })
                .sort(function (a, b) { return (b.criadoEm || 0) - (a.criadoEm || 0); });
            return res.status(200).json({ solicitacoes: lista });
        }

        if (req.method === 'POST') {
            const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
            if (Array.isArray(corpo.lote)) {
                const itens = corpo.lote.slice(0, 500).map(limpar).filter(Boolean);
                for (const s of itens) await gravar(sql, s);
                return res.status(200).json({ ok: true, gravadas: itens.length });
            }
            const s = limpar(corpo.solicitacao);
            if (!s) return res.status(400).json({ erro: 'Solicitação inválida.' });
            await gravar(sql, s);
            return res.status(200).json({ ok: true });
        }

        if (req.method === 'DELETE') {
            if (req.query && req.query.todas) {
                await sql`DELETE FROM solicitacoes`;
                return res.status(200).json({ ok: true });
            }
            const id = texto(req.query && req.query.id, 60).replace(/[^A-Za-z0-9_-]/g, '');
            if (!id) return res.status(400).json({ erro: 'Informe o id.' });
            await sql`DELETE FROM solicitacoes WHERE id = ${id}`;
            return res.status(200).json({ ok: true });
        }

        res.setHeader('Allow', 'GET, POST, DELETE');
        return res.status(405).json({ erro: 'Método não permitido.' });
    } catch (erro) {
        console.error('Erro em /api/solicitacoes:', erro);
        return res.status(500).json({ erro: erro.message || 'Erro no servidor.' });
    }
};
