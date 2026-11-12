// Ingressos digitais do Clube da Maré (o QR Code aponta para ingresso.html?id=XYZ).
// O ingresso nasce "Pendente"; quando o Desenvolvedor aprova no painel dele,
// vira "Aprovado" e a tela do aluno/monitor muda de "carregando" para
// "Verificação concluída — Acesso liberado".
//
// GET  /api/ingressos?id=XYZ  -> { ingresso: {...} }   (tela do aluno/monitor)
// GET  /api/ingressos         -> { ingressos: [...] }  (painel do Desenvolvedor)
// POST /api/ingressos         -> { ingresso: { nome, turma, ra } }  cria (Pendente)
// POST /api/ingressos         -> { id, status }  muda o status (Aprovado/Pendente/Recusado)
// DELETE /api/ingressos?id=XYZ -> apaga um ingresso
const crypto = require('crypto');
const { db, turmaCanonica } = require('./_db');

const STATUS_VALIDOS = ['Pendente', 'Aprovado', 'Recusado'];

function texto(v, max) {
    return String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, max || 200);
}
function idLimpo(v) {
    return texto(v, 60).replace(/[^A-Za-z0-9_-]/g, '');
}

let tabelaPronta = false;
async function banco() {
    const sql = await db();
    if (!tabelaPronta) {
        await sql`
            CREATE TABLE IF NOT EXISTS ingressos (
                id            text PRIMARY KEY,
                dados         jsonb NOT NULL,
                atualizado_em timestamptz NOT NULL DEFAULT now()
            )`;
        tabelaPronta = true;
    }
    return sql;
}

async function gravar(sql, i) {
    const dados = JSON.stringify(i);
    await sql`
        INSERT INTO ingressos (id, dados) VALUES (${i.id}, ${dados}::jsonb)
        ON CONFLICT (id) DO UPDATE SET dados = EXCLUDED.dados, atualizado_em = now()`;
}

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const sql = await banco();

        if (req.method === 'GET') {
            const id = idLimpo(req.query && req.query.id);
            if (id) {
                const l = await sql`SELECT dados FROM ingressos WHERE id = ${id}`;
                if (!l.length) return res.status(404).json({ erro: 'Ingresso não encontrado.' });
                return res.status(200).json({ ingresso: l[0].dados });
            }
            const linhas = await sql`SELECT dados FROM ingressos`;
            const lista = linhas.map(function (l) { return l.dados; })
                .sort(function (a, b) { return (b.criadoEm || 0) - (a.criadoEm || 0); });
            return res.status(200).json({ ingressos: lista });
        }

        if (req.method === 'POST') {
            const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

            // Mudar o status (aprovação do Desenvolvedor)
            if (corpo.id) {
                const id = idLimpo(corpo.id);
                if (STATUS_VALIDOS.indexOf(corpo.status) === -1) {
                    return res.status(400).json({ erro: 'Status inválido.' });
                }
                const l = await sql`SELECT dados FROM ingressos WHERE id = ${id}`;
                if (!l.length) return res.status(404).json({ erro: 'Ingresso não encontrado.' });
                const i = l[0].dados;
                i.status = corpo.status;
                i.respondidoEm = Date.now();
                await gravar(sql, i);
                return res.status(200).json({ ok: true, ingresso: i });
            }

            // Criar ingresso novo (sempre começa Pendente)
            const novo = corpo.ingresso || {};
            const nome = texto(novo.nome, 150);
            if (!nome) return res.status(400).json({ erro: 'Informe o nome do aluno/monitor.' });
            const i = {
                id: crypto.randomBytes(9).toString('hex'),   // difícil de adivinhar (ingresso nominal)
                nome: nome,
                turma: turmaCanonica(texto(novo.turma, 20)),
                ra: texto(novo.ra, 30),
                tipo: novo.tipo === 'Monitor' ? 'Monitor' : 'Aluno',
                status: 'Pendente',
                criadoEm: Date.now(),
                respondidoEm: 0
            };
            await gravar(sql, i);
            return res.status(200).json({ ok: true, ingresso: i });
        }

        if (req.method === 'DELETE') {
            const id = idLimpo(req.query && req.query.id);
            if (!id) return res.status(400).json({ erro: 'Informe o id.' });
            await sql`DELETE FROM ingressos WHERE id = ${id}`;
            return res.status(200).json({ ok: true });
        }

        res.setHeader('Allow', 'GET, POST, DELETE');
        return res.status(405).json({ erro: 'Método não permitido.' });
    } catch (erro) {
        console.error('Erro em /api/ingressos:', erro);
        return res.status(500).json({ erro: erro.message || 'Erro no servidor.' });
    }
};
