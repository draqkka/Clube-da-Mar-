// Conexão com o Postgres da Vercel (Neon). Arquivos que começam com "_"
// dentro de /api não viram rota — este aqui é só um utilitário.
//
// A tabela "alunos" é criada sozinha na primeira chamada, não precisa
// rodar SQL na mão.
const { neon } = require('@neondatabase/serverless');

let sql = null;
let tabelaPronta = false;

async function db() {
    if (!sql) {
        const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
        if (!url) throw new Error('Banco não configurado: falta a variável DATABASE_URL no projeto da Vercel.');
        sql = neon(url);
    }
    if (!tabelaPronta) {
        await sql`
            CREATE TABLE IF NOT EXISTS alunos (
                ra            text PRIMARY KEY,
                nome          text NOT NULL,
                serie         text NOT NULL DEFAULT '',
                turma         text NOT NULL,
                nota          numeric,
                presenca      integer,
                comportamento text NOT NULL DEFAULT '',
                professor     text NOT NULL DEFAULT '',
                extras        jsonb NOT NULL DEFAULT '{}'::jsonb,
                atualizado_em timestamptz NOT NULL DEFAULT now()
            )`;
        await sql`CREATE INDEX IF NOT EXISTS alunos_turma_idx ON alunos (turma)`;
        tabelaPronta = true;
    }
    return sql;
}

module.exports = { db };