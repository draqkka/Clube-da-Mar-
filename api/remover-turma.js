// Remove TODOS os alunos de uma turma (usado pelo botão "Remover todos os
// alunos desta turma" dos painéis do professor e do desenvolvedor).
//
// Por que existe: o /api/alunos recusa uma lista vazia ("Nenhum aluno válido"),
// então ele não serve pra esvaziar uma turma. Este aqui só apaga.
//
// Chamada: POST /api/remover-turma   corpo: { "turma": "3ºA" }
// Resposta: { removidos: <quantos alunos foram apagados> }
const { db, turmaCanonica } = require('./_db');

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'POST' && req.method !== 'DELETE') {
        res.status(405).json({ erro: 'Use POST.' });
        return;
    }

    try {
        let corpo = req.body || {};
        if (typeof corpo === 'string') {
            try { corpo = JSON.parse(corpo); } catch (e) { corpo = {}; }
        }
        const turma = turmaCanonica((corpo && corpo.turma) || (req.query && req.query.turma) || '');
        if (!turma) {
            res.status(400).json({ erro: 'Informe a turma.' });
            return;
        }

        const sql = await db();
        const apagados = await sql`DELETE FROM alunos WHERE turma = ${turma} RETURNING ra`;
        res.status(200).json({ removidos: apagados.length });
    } catch (erro) {
        res.status(500).json({ erro: erro.message || 'Erro ao remover a turma.' });
    }
};
