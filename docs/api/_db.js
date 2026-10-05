// Conexão com o Postgres da Vercel (Neon). Arquivos que começam com "_"
// dentro de /api não viram rota — este aqui é só um utilitário.
//
// A tabela "alunos" é criada sozinha na primeira chamada, não precisa
// rodar SQL na mão.
const { neon } = require('@neondatabase/serverless');

let sql = null;
let tabelaPronta = false;

// "3ºA", "3°A", "3A", "3 A", "3º ano A" -> sempre "3ºA". Assim a mesma turma
// nunca vira duas turmas diferentes por causa de símbolo, espaço ou acento.
// (Mantenha igual à turmaCanonica de planilha.js.)
function turmaCanonica(t) {
    const bruto = String(t == null ? '' : t).trim();
    const s = bruto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
        .replace(/\b(ANO|SERIE|TURMA)\b/g, ' ')
        .replace(/(\d)\s*O(?=\s*[A-Z])/, '$1'); // "3o A" (o no lugar do º)
    const m = s.match(/(\d+)[^\dA-Z]*([A-Z]+)/);
    return m ? m[1] + '\u00BA' + m[2] : bruto;
}

// RA sem pontos/traços/espaços, em maiúsculo e sem zeros à esquerda:
// "000108327708-X/SP" e "108327708xsp" viram o mesmo RA.
function raCanonico(r) {
    return String(r == null ? '' : r).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');
}

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

        // Arruma dados antigos (uma vez por inicialização). Se algo falhar,
        // só registra o erro — nunca derruba a API.
        try {
            const turmas = await sql`SELECT DISTINCT turma FROM alunos`;
            for (const linha of turmas) {
                const canon = turmaCanonica(linha.turma);
                if (canon && canon !== linha.turma) {
                    await sql`UPDATE alunos SET turma = ${canon} WHERE turma = ${linha.turma}`;
                }
            }
            await sql`
                UPDATE alunos a SET ra = c.canon
                FROM (SELECT ra, ltrim(upper(regexp_replace(ra, '[^A-Za-z0-9]', '', 'g')), '0') AS canon FROM alunos) c
                WHERE a.ra = c.ra AND c.ra <> c.canon AND c.canon <> ''
                  AND NOT EXISTS (SELECT 1 FROM alunos b WHERE b.ra = c.canon)`;
        } catch (e) {
            console.error('Normalização de turmas/RAs não concluída:', e.message);
        }
        tabelaPronta = true;
    }
    return sql;
}

module.exports = { db, turmaCanonica, raCanonico };
