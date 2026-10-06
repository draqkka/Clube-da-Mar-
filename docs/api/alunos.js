// GET  /api/alunos?turma=3ºA  -> alunos de uma turma (sem "turma": todas)
// POST /api/alunos            -> grava/atualiza alunos em lote
//      corpo: { turma, alunos: [...], professor, substituir }
// GET  /api/alunos?ra=...     -> só o aluno com aquele RA (usado no painel do aluno)
const { db, turmaCanonica, raCanonico } = require('./_db');

// Tira < e > de todo texto: os painéis montam a tela com innerHTML, então
// isso impede que uma planilha com código malicioso vire problema.
function texto(v, max) {
    return String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, max || 200);
}

function numeroOuNulo(v) {
    if (v === '' || v == null) return null;
    const n = Number(String(v).replace('%', '').replace(',', '.'));
    return isFinite(n) ? n : null;
}

// Colunas extras da planilha (além das conhecidas) ficam guardadas aqui.
function limparExtras(extras) {
    const saida = {};
    if (!extras || typeof extras !== 'object') return saida;
    Object.keys(extras).slice(0, 30).forEach(function (chave) {
        const v = extras[chave];
        if (typeof v === 'number') saida[texto(chave, 60)] = v;
        else if (typeof v === 'string') saida[texto(chave, 60)] = texto(v, 300);
    });
    return saida;
}

// Nome de aluno de verdade tem pelo menos 2 letras. Isso barra lixo de
// importação mal lida (ex: códigos de matéria como 1100", 51004").
function nomeValido(nome) {
    return /[A-Za-zÀ-ÿ].*[A-Za-zÀ-ÿ]/.test(String(nome || ''));
}

function limparAluno(a, turma, professorPadrao) {
    const presenca = numeroOuNulo(a.presenca);
    return {
        ra: raCanonico(texto(a.ra, 40)),
        nome: texto(a.nome, 150),
        serie: texto(a.serie, 40),
        turma: turma,
        nota: numeroOuNulo(a.nota),
        presenca: presenca === null ? null : Math.round(presenca),
        comportamento: texto(a.comportamento, 30),
        professor: texto(a.professor || professorPadrao, 120),
        extras: limparExtras(a.extras)
    };
}

// Formato que o site já espera (nota/presenca vazias = '').
function paraCliente(l) {
    return {
        ra: l.ra,
        nome: l.nome,
        serie: l.serie,
        turma: l.turma,
        nota: l.nota === null ? '' : Number(l.nota),
        presenca: l.presenca === null ? '' : l.presenca,
        comportamento: l.comportamento,
        professor: l.professor,
        extras: l.extras || {}
    };
}

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    try {
        const sql = await db();

        if (req.method === 'GET') {
            const turma = req.query && req.query.turma ? turmaCanonica(req.query.turma) : '';
            const raBusca = req.query && req.query.ra ? raCanonico(req.query.ra) : '';
            if (req.query && req.query.ra && !raBusca) {
                return res.status(400).json({ erro: 'RA inválido.' });
            }
            if (raBusca) {
                const doAluno = await sql`SELECT ra, nome, serie, turma, nota, presenca, comportamento, professor, extras
                                          FROM alunos WHERE ra = ${raBusca}`;
                return res.status(200).json({ alunos: doAluno.filter(l => nomeValido(l.nome)).map(paraCliente) });
            }
            const linhas = turma
                ? await sql`SELECT ra, nome, serie, turma, nota, presenca, comportamento, professor, extras
                            FROM alunos WHERE turma = ${turma} ORDER BY nome`
                : await sql`SELECT ra, nome, serie, turma, nota, presenca, comportamento, professor, extras
                            FROM alunos ORDER BY turma, nome`;
            return res.status(200).json({ alunos: linhas.filter(l => nomeValido(l.nome)).map(paraCliente) });
        }

        if (req.method === 'POST') {
            const corpo = req.body || {};
            const turma = turmaCanonica(texto(corpo.turma, 30));
            if (!turma || !Array.isArray(corpo.alunos)) {
                return res.status(400).json({ erro: 'Informe a turma e a lista de alunos.' });
            }
            if (corpo.alunos.length > 2000) {
                return res.status(400).json({ erro: 'Lista grande demais (máximo 2000 alunos por envio).' });
            }

            // Se o mesmo RA aparecer duas vezes na planilha, vale a última linha.
            const porRa = new Map();
            corpo.alunos.forEach(function (a) {
                const limpo = limparAluno(a || {}, turma, corpo.professor);
                if (limpo.ra && limpo.nome && nomeValido(limpo.nome)) porRa.set(limpo.ra, limpo);
            });
            const lista = Array.from(porRa.values());
            if (!lista.length) {
                return res.status(400).json({ erro: 'Nenhum aluno válido (RA e Nome são obrigatórios).' });
            }
            const json = JSON.stringify(lista);

            const consultas = [
                sql`
                    INSERT INTO alunos (ra, nome, serie, turma, nota, presenca, comportamento, professor, extras)
                    SELECT ra, nome, serie, turma, nota, presenca, comportamento, professor, COALESCE(extras, '{}'::jsonb)
                    FROM jsonb_to_recordset(${json}::jsonb)
                        AS x(ra text, nome text, serie text, turma text, nota numeric, presenca integer,
                             comportamento text, professor text, extras jsonb)
                    ON CONFLICT (ra) DO UPDATE SET
                        nome = EXCLUDED.nome,
                        serie = COALESCE(NULLIF(EXCLUDED.serie, ''), alunos.serie),
                        -- Campo vazio na planilha NÃO apaga o que já estava salvo
                        -- (ex: reimportar uma planilha sem a coluna Presença).
                        nota = COALESCE(EXCLUDED.nota, alunos.nota),
                        presenca = COALESCE(EXCLUDED.presenca, alunos.presenca),
                        comportamento = COALESCE(NULLIF(EXCLUDED.comportamento, ''), alunos.comportamento),
                        professor = COALESCE(NULLIF(EXCLUDED.professor, ''), alunos.professor),
                        extras = alunos.extras || EXCLUDED.extras,
                        atualizado_em = now()
                    WHERE alunos.turma = EXCLUDED.turma
                    RETURNING ra`
            ];

            // Faxina: apaga do banco registros de importações antigas mal lidas
            // (nome sem letras, ex: 1100\", 51004\").
            consultas.push(sql`DELETE FROM alunos WHERE nome !~ '[A-Za-zÀ-ÿ].*[A-Za-zÀ-ÿ]' RETURNING ra`);

            // "Substituir a turma": remove quem não está na planilha enviada.
            if (corpo.substituir) {
                consultas.push(sql`
                    DELETE FROM alunos
                    WHERE turma = ${turma}
                      AND ra NOT IN (SELECT ra FROM jsonb_to_recordset(${json}::jsonb) AS x(ra text))
                    RETURNING ra`);
            }

            const resultados = await sql.transaction(consultas);
            const gravados = resultados[0].length;
            return res.status(200).json({
                gravados: gravados,
                // RA que já pertence a outra turma não é sobrescrito.
                ignorados: lista.length - gravados,
                removidos: corpo.substituir ? resultados[2].length : 0
            });
        }

        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ erro: 'Método não permitido.' });
    } catch (erro) {
        console.error(erro);
        return res.status(500).json({ erro: 'Falha ao acessar o banco de dados.' });
    }
};
