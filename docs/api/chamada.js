// Chamada (checklist) da visita ao Clube da Maré.
//
// O monitor/professor marca, aluno por aluno, dois momentos:
//   d1-chegada  -> chegou ao Clube da Maré no 1º dia
//   d2-retorno  -> voltou para a escola no fim do 2º dia
// Ninguém digita horário: quem marca só toca no botão e o SERVIDOR grava a hora
// (e o nome de quem marcou). Diretoria e Desenvolvedor só leem.
//
// GET  /api/chamada                     -> { registros: [{ ingressoId, marcas: { momento: { em, por } } }] }
// POST /api/chamada  { ingressoId, marca, presente, por }
// POST /api/chamada  { ingressoIds: [...], marca, presente, por }   (marcar vários de uma vez)
const { db } = require('./_db');

const MARCAS = ['d1-chegada', 'd2-retorno'];

function texto(v, max) {
    return String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, max || 150);
}
function idLimpo(v) {
    return texto(v, 60).replace(/[^A-Za-z0-9_-]/g, '');
}

let pronta = false;
async function banco() {
    const sql = await db();
    if (!pronta) {
        await sql`CREATE TABLE IF NOT EXISTS ingressos (id text PRIMARY KEY, dados jsonb NOT NULL, atualizado_em timestamptz NOT NULL DEFAULT now())`;
        await sql`CREATE TABLE IF NOT EXISTS chamada (id text PRIMARY KEY, dados jsonb NOT NULL, atualizado_em timestamptz NOT NULL DEFAULT now())`;
        pronta = true;
    }
    return sql;
}

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const sql = await banco();

        if (req.method === 'GET') {
            const linhas = await sql`SELECT dados FROM chamada`;
            return res.status(200).json({ registros: linhas.map(function (l) { return l.dados; }) });
        }

        if (req.method === 'POST') {
            const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
            if (MARCAS.indexOf(corpo.marca) === -1) return res.status(400).json({ erro: 'Momento inválido.' });
            const ids = (Array.isArray(corpo.ingressoIds) ? corpo.ingressoIds : [corpo.ingressoId])
                .map(idLimpo).filter(Boolean).slice(0, 500);
            if (!ids.length) return res.status(400).json({ erro: 'Informe o aluno.' });
            const presente = corpo.presente !== false;
            const por = texto(corpo.por, 150);
            const agora = Date.now();   // hora automática, do servidor

            let alterados = 0;
            for (const id of ids) {
                const ing = await sql`SELECT dados FROM ingressos WHERE id = ${id}`;
                if (!ing.length) continue;
                if (ing[0].dados.status !== 'Aprovado') continue;   // só quem tem ingresso aprovado entra na chamada
                const atual = await sql`SELECT dados FROM chamada WHERE id = ${id}`;
                const reg = atual.length ? atual[0].dados : { ingressoId: id, marcas: {} };
                if (!reg.marcas) reg.marcas = {};
                if (presente) {
                    if (reg.marcas[corpo.marca] && ids.length > 1) continue;   // em lote, não sobrescreve a hora de quem já foi marcado
                    reg.marcas[corpo.marca] = { em: agora, por: por };
                } else {
                    delete reg.marcas[corpo.marca];
                }
                reg.atualizadoEm = agora;
                const dados = JSON.stringify(reg);
                await sql`
                    INSERT INTO chamada (id, dados) VALUES (${id}, ${dados}::jsonb)
                    ON CONFLICT (id) DO UPDATE SET dados = EXCLUDED.dados, atualizado_em = now()`;
                alterados++;
            }
            return res.status(200).json({ ok: true, alterados: alterados, em: agora });
        }

        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ erro: 'Método não permitido.' });
    } catch (erro) {
        console.error('Erro em /api/chamada:', erro);
        return res.status(500).json({ erro: erro.message || 'Erro no servidor.' });
    }
};
