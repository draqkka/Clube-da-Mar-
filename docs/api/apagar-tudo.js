// Apaga ABSOLUTAMENTE TODOS os dados do banco (botão de teste do painel do Desenvolvedor).
// Esvazia: alunos, solicitações, agendamentos, ingressos, chamada e os alunos
// cadastrados pelo professor (usuarios_cadastrados). Não apaga as tabelas, só os dados.
//
// IMPORTANTE: este arquivo precisa ficar em docs/api/ (só o que está nessa pasta vira rota).
//
// Chamada: POST /api/apagar-tudo   corpo: { "confirmar": true }
// Resposta: { ok: true, apagados: { alunos: N, solicitacoes: N, ... } }
const { db } = require('./_db');

// Cada tabela tem a sua consulta fixa (o driver da Neon só aceita consultas no formato sql`...`).
const APAGAR = {
    alunos: function (sql) { return sql`DELETE FROM alunos RETURNING 1`; },
    solicitacoes: function (sql) { return sql`DELETE FROM solicitacoes RETURNING 1`; },
    agendamentos: function (sql) { return sql`DELETE FROM agendamentos RETURNING 1`; },
    ingressos: function (sql) { return sql`DELETE FROM ingressos RETURNING 1`; },
    chamada: function (sql) { return sql`DELETE FROM chamada RETURNING 1`; },
    usuarios_cadastrados: function (sql) { return sql`DELETE FROM usuarios_cadastrados RETURNING 1`; }
};

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ erro: 'Use POST.' });
    }
    try {
        let corpo = req.body || {};
        if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch (e) { corpo = {}; } }
        if (corpo.confirmar !== true) {
            return res.status(400).json({ erro: 'Confirmação ausente. Nada foi apagado.' });
        }
        const sql = await db();
        const apagados = {};
        for (const tabela of Object.keys(APAGAR)) {
            try {
                const linhas = await APAGAR[tabela](sql);
                apagados[tabela] = linhas.length;
            } catch (e) {
                apagados[tabela] = 0;   // a tabela ainda não existe: não tem o que apagar
            }
        }
        return res.status(200).json({ ok: true, apagados: apagados });
    } catch (erro) {
        console.error('Erro em /api/apagar-tudo:', erro);
        return res.status(500).json({ erro: erro.message || 'Erro no servidor.' });
    }
};
