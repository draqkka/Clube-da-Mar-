// Agendamentos de visita ao Clube da Maré (2 dias seguidos por turma),
// guardados no banco (Postgres/Neon) pra que a Diretoria, o Clube da Maré
// (Desenvolvedor), o professor e o aluno vejam o MESMO status mesmo usando
// computadores diferentes.
//
// GET    /api/agendamentos            -> { agendamentos: [...] }
// POST   /api/agendamentos            -> grava/atualiza UM agendamento
//        corpo: { agendamento: {...} }  ou vários: { lote: [{...}, ...] }
// DELETE /api/agendamentos?id=XYZ     -> apaga um agendamento
// DELETE /api/agendamentos?todos=1    -> apaga todos (uso em testes)
//
// A tabela "agendamentos" é criada sozinha na primeira chamada (igual à
// de solicitações) — não precisa rodar SQL na mão.
const { db, turmaCanonica } = require('./_db');

// Pendente  -> a Diretoria pediu; aguardando a autorização do Clube da Maré
// Aprovado  -> Clube da Maré autorizou (disponibilidade aprovada)
// Recusado  -> Clube da Maré reprovou a disponibilidade
// Cancelado -> a Diretoria desistiu do pedido / da visita
const STATUS_VALIDOS = ['Pendente', 'Aprovado', 'Recusado', 'Cancelado'];

// Os painéis montam a tela com innerHTML: tira < e > de todo texto.
function texto(v, max) {
    return String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, max || 200);
}

function dataIso(v) {
    const t = String(v == null ? '' : v).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : '';
}

function hora(v) {
    const t = String(v == null ? '' : v).trim();
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : '';
}

function inteiro(v, max) {
    const n = parseInt(v, 10);
    return isFinite(n) && n >= 0 ? Math.min(n, max || 5000) : 0;
}

// Só os campos conhecidos entram no banco (nada de campo inventado).
function limpar(a) {
    if (!a || typeof a !== 'object') return null;
    const id = texto(a.id, 60).replace(/[^A-Za-z0-9_-]/g, '');
    if (!id) return null;
    const dataInicio = dataIso(a.dataInicio);
    const dataFim = dataIso(a.dataFim);
    const entrada = hora(a.entrada);
    const saida = hora(a.saida);
    if (!dataInicio || !dataFim || !entrada || !saida) return null;   // sem data/horário válido não grava
    const status = STATUS_VALIDOS.indexOf(a.status) !== -1 ? a.status : 'Pendente';
    const criadoEm = Number(a.criadoEm);
    const respondidoEm = Number(a.respondidoEm);
    return {
        id: id,
        turma: turmaCanonica(texto(a.turma, 20)),
        escola: texto(a.escola, 200),
        dataInicio: dataInicio,
        dataFim: dataFim,
        entrada: entrada,
        saida: saida,
        responsavel: texto(a.responsavel, 150),
        cargo: texto(a.cargo, 80),
        telefone: texto(a.telefone, 40),
        email: texto(a.email, 150).toLowerCase(),
        numAlunos: inteiro(a.numAlunos, 500),
        numAcompanhantes: inteiro(a.numAcompanhantes, 100),
        transporte: texto(a.transporte, 80),
        observacao: texto(a.observacao, 1000),
        criadoPor: texto(a.criadoPor, 150),
        status: status,
        resposta: texto(a.resposta, 1000),
        dataSugerida: dataIso(a.dataSugerida),               // o Clube pode sugerir outra data ao reprovar
        respondidoEm: isFinite(respondidoEm) && respondidoEm > 0 ? respondidoEm : 0,
        criadoEm: isFinite(criadoEm) && criadoEm > 0 ? criadoEm : Date.now()
    };
}

let tabelaPronta = false;

async function banco() {
    const sql = await db();
    if (!tabelaPronta) {
        await sql`
            CREATE TABLE IF NOT EXISTS agendamentos (
                id            text PRIMARY KEY,
                dados         jsonb NOT NULL,
                atualizado_em timestamptz NOT NULL DEFAULT now()
            )`;
        tabelaPronta = true;
    }
    return sql;
}

async function gravar(sql, a) {
    const dados = JSON.stringify(a);
    await sql`
        INSERT INTO agendamentos (id, dados) VALUES (${a.id}, ${dados}::jsonb)
        ON CONFLICT (id) DO UPDATE SET dados = EXCLUDED.dados, atualizado_em = now()`;
}

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    try {
        const sql = await banco();

        if (req.method === 'GET') {
            const linhas = await sql`SELECT dados FROM agendamentos`;
            const lista = linhas.map(function (l) { return l.dados; })
                .sort(function (a, b) { return (b.criadoEm || 0) - (a.criadoEm || 0); });
            return res.status(200).json({ agendamentos: lista });
        }

        if (req.method === 'POST') {
            const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
            if (Array.isArray(corpo.lote)) {
                const itens = corpo.lote.slice(0, 500).map(limpar).filter(Boolean);
                for (const a of itens) await gravar(sql, a);
                return res.status(200).json({ ok: true, gravados: itens.length });
            }
            const a = limpar(corpo.agendamento);
            if (!a) return res.status(400).json({ erro: 'Agendamento inválido (confira datas e horários).' });
            await gravar(sql, a);
            return res.status(200).json({ ok: true });
        }

        if (req.method === 'DELETE') {
            if (req.query && req.query.todos) {
                await sql`DELETE FROM agendamentos`;
                return res.status(200).json({ ok: true });
            }
            const id = texto(req.query && req.query.id, 60).replace(/[^A-Za-z0-9_-]/g, '');
            if (!id) return res.status(400).json({ erro: 'Informe o id.' });
            await sql`DELETE FROM agendamentos WHERE id = ${id}`;
            return res.status(200).json({ ok: true });
        }

        res.setHeader('Allow', 'GET, POST, DELETE');
        return res.status(405).json({ erro: 'Método não permitido.' });
    } catch (erro) {
        console.error('Erro em /api/agendamentos:', erro);
        return res.status(500).json({ erro: erro.message || 'Erro no servidor.' });
    }
};
