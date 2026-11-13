// Ingressos digitais do Clube da Maré (o QR Code aponta para ingresso.html?id=XYZ).
//
// NÃO HÁ MAIS APROVAÇÃO MANUAL. Quem aprova é o próprio sistema: a cada leitura
// do QR Code (e a cada geração de ingresso) ele CONFERE o ingresso com os painéis:
//   1) o ingresso existe e não foi cancelado;
//   2) o aluno foi confirmado pelo Clube da Maré (solicitação "Aprovado") — ou é
//      monitor cadastrado;
//   3) a turma tem visita APROVADA pelo Clube (agendamentos);
//   4) a escola e a turma do ingresso conferem com a visita;
//   5) hoje é um dos dias da visita.
// Enquanto algo falta, o ingresso fica "Pendente" e a tela do ingresso continua
// carregando. Bateu tudo: vira "Aprovado" ("Verificação concluída").
// Se o Clube reabrir/cancelar a visita, o ingresso volta a "Pendente" sozinho.
//
// GET  /api/ingressos?id=XYZ  -> { ingresso: {..., visita}, verificacao: { estado, motivo, itens } }
// GET  /api/ingressos         -> { ingressos, visitas, turmas, escolas }   (?turma= &escola= &status=)
// POST /api/ingressos         -> { ingresso: { nome, turma, escola, ra, chave, tipo } }  cria e já confere
//      (com "chave" = e-mail do aluno, cada aluno tem um só ingresso)
// POST /api/ingressos         -> { id, status: 'Recusado' }  cancela o ingresso
//                                { id, status: 'Pendente' }  reativa (o sistema confere de novo)
// POST /api/ingressos         -> { acao: 'gerar-lote', turma, escola }
//      cria os ingressos de TODOS os alunos da turma confirmados pelo Clube da Maré
//      e já os confere (os que baterem ficam Aprovados, com QR Code liberado).
// DELETE /api/ingressos?id=XYZ -> apaga um ingresso
const crypto = require('crypto');
const { db, turmaCanonica, raCanonico } = require('./_db');

// true: o acesso só é liberado nos dias da visita da turma (fora deles a tela
// mostra um aviso amarelo). Ponha false para testar em qualquer data.
const EXIGIR_DATA_DA_VISITA = true;

function texto(v, max) {
    return String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, max || 200);
}
function idLimpo(v) {
    return texto(v, 60).replace(/[^A-Za-z0-9_-]/g, '');
}
function igual(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}
function normNome(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function hojeBR() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });   // AAAA-MM-DD
}
function dataBR(iso) {
    const p = String(iso || '').split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '';
}

let tabelasProntas = false;
async function banco() {
    const sql = await db();
    if (!tabelasProntas) {
        await sql`CREATE TABLE IF NOT EXISTS ingressos (id text PRIMARY KEY, dados jsonb NOT NULL, atualizado_em timestamptz NOT NULL DEFAULT now())`;
        await sql`CREATE TABLE IF NOT EXISTS agendamentos (id text PRIMARY KEY, dados jsonb NOT NULL, atualizado_em timestamptz NOT NULL DEFAULT now())`;
        await sql`CREATE TABLE IF NOT EXISTS solicitacoes (id text PRIMARY KEY, dados jsonb NOT NULL, atualizado_em timestamptz NOT NULL DEFAULT now())`;
        tabelasProntas = true;
    }
    return sql;
}

async function gravar(sql, i) {
    const dados = JSON.stringify(i);
    await sql`
        INSERT INTO ingressos (id, dados) VALUES (${i.id}, ${dados}::jsonb)
        ON CONFLICT (id) DO UPDATE SET dados = EXCLUDED.dados, atualizado_em = now()`;
}

// ---- dados dos painéis (visitas e alunos confirmados) ----------------------
async function carregarContexto(sql) {
    const ag = await sql`SELECT dados FROM agendamentos`;
    const so = await sql`SELECT dados FROM solicitacoes`;
    return {
        visitas: ag.map(function (x) { return x.dados; })
            .filter(function (a) { return a && (a.status === 'Aprovado' || a.status === 'Pendente'); }),
        sols: so.map(function (x) { return x.dados; })
            .filter(function (s) { return s && s.status === 'Aprovado'; })
    };
}

function visitaPublica(a) {
    return {
        id: a.id,
        turma: turmaCanonica(a.turma),
        escola: a.escola || '',
        status: a.status,
        dataInicio: a.dataInicio,
        dataFim: a.dataFim,
        entrada: a.entrada,
        saida: a.saidaConcedida || a.saida,          // o que o Clube concedeu
        saidaPedida: a.saida,
        saidaAlterada: !!(a.saidaConcedida && a.saidaConcedida !== a.saida)
    };
}

// Aprovada e ainda por vir > aprovada já passada > pendente.
// Com soAprovada, ignora as pendentes.
function escolherVisita(visitas, turma, escola, soAprovada) {
    const t = turmaCanonica(turma);
    let c = visitas.filter(function (a) {
        return turmaCanonica(a.turma) === t && (!soAprovada || a.status === 'Aprovado');
    });
    if (escola) {
        const mesma = c.filter(function (a) { return igual(a.escola, escola); });
        if (mesma.length) c = mesma;
    }
    const hoje = hojeBR();
    const nota = function (a) { return (a.status === 'Aprovado' ? 0 : 2) + (a.dataFim >= hoje ? 0 : 1); };
    c.sort(function (x, y) { return nota(x) - nota(y) || (x.dataInicio < y.dataInicio ? -1 : 1); });
    return c[0] || null;
}

function solicitacaoDoIngresso(ing, sols) {
    const t = turmaCanonica(ing.turma);
    const nome = normNome(ing.nome);
    return sols.filter(function (s) {
        if (turmaCanonica(s.turma) !== t) return false;
        if (ing.chave && ing.chave === String(s.emailAluno || s.ra || '').trim().toLowerCase()) return true;
        if (ing.ra && s.ra && raCanonico(ing.ra) && raCanonico(ing.ra) === raCanonico(s.ra)) return true;
        return !!nome && nome === normNome(s.nomeAluno);
    })[0] || null;
}

// ---- a conferência ---------------------------------------------------------
// estado: 'ok' | 'fora-do-periodo' | 'aguardando' | 'divergente' | 'recusado'
function verificar(ing, ctx) {
    if (ing.status === 'Recusado') {
        return { estado: 'recusado', motivo: 'Ingresso cancelado pela organização do Clube da Maré.', itens: [], visita: null };
    }
    const turma = turmaCanonica(ing.turma);
    const itens = [{ rotulo: 'Ingresso registrado no sistema', estado: 'ok' }];

    let pessoaOk = true;
    if (ing.tipo === 'Monitor') {
        itens.push({ rotulo: 'Monitor cadastrado pelo Clube da Maré', estado: 'ok' });
    } else {
        pessoaOk = !!solicitacaoDoIngresso(ing, ctx.sols);
        itens.push({ rotulo: 'Aluno confirmado pelo Clube da Maré', estado: pessoaOk ? 'ok' : 'pend' });
    }

    const visita = escolherVisita(ctx.visitas, turma, ing.escola, true);
    itens.push({ rotulo: 'Visita da turma ' + turma + ' aprovada pelo Clube', estado: visita ? 'ok' : 'pend' });

    let escolaOk = true, dentro = true;
    if (visita) {
        escolaOk = !ing.escola || !visita.escola || igual(ing.escola, visita.escola);
        itens.push({ rotulo: 'Escola e turma conferem com a visita', estado: escolaOk ? 'ok' : 'erro' });
        if (EXIGIR_DATA_DA_VISITA) {
            const hoje = hojeBR();
            dentro = hoje >= visita.dataInicio && hoje <= visita.dataFim;
            itens.push({ rotulo: 'Hoje é dia da visita', estado: dentro ? 'ok' : 'aviso' });
        }
    }

    const v = visita ? visitaPublica(visita) : null;
    if (!escolaOk) {
        return { estado: 'divergente', motivo: 'A escola do ingresso não confere com a visita da turma. Procure a organização do Clube da Maré.', itens: itens, visita: v };
    }
    if (!visita) {
        return { estado: 'aguardando', motivo: 'Aguardando o Clube da Maré aprovar a visita da turma ' + turma + '.', itens: itens, visita: null };
    }
    if (!pessoaOk) {
        return { estado: 'aguardando', motivo: 'Aguardando o Clube da Maré confirmar a participação do aluno.', itens: itens, visita: v };
    }
    if (!dentro) {
        const quando = visita.dataInicio === visita.dataFim ? dataBR(visita.dataInicio) : dataBR(visita.dataInicio) + ' e ' + dataBR(visita.dataFim);
        return { estado: 'fora-do-periodo', motivo: 'Ingresso válido, mas hoje não é dia da visita da turma (' + quando + ').', itens: itens, visita: v };
    }
    return { estado: 'ok', motivo: 'Acesso liberado.', itens: itens, visita: v };
}

// Confere e grava o resultado no ingresso: bateu = Aprovado; faltou algo = Pendente.
async function conferir(sql, ing, ctx) {
    const v = verificar(ing, ctx);
    let mudou = false;
    if (ing.status !== 'Recusado') {
        const novo = (v.estado === 'ok' || v.estado === 'fora-do-periodo') ? 'Aprovado' : 'Pendente';
        if (ing.status !== novo) {
            ing.status = novo;
            ing.respondidoEm = Date.now();
            if (novo === 'Aprovado') ing.verificadoEm = Date.now();
            mudou = true;
        }
    }
    if (!ing.escola && v.visita && v.visita.escola) { ing.escola = v.visita.escola; mudou = true; }
    if (mudou) await gravar(sql, ing);
    return v;
}

function publico(i) {
    const p = Object.assign({}, i);
    delete p.chave;   // o e-mail do aluno não sai pela API
    return p;
}

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const sql = await banco();

        if (req.method === 'GET') {
            const id = idLimpo(req.query && req.query.id);
            const ctx = await carregarContexto(sql);

            if (id) {
                const l = await sql`SELECT dados FROM ingressos WHERE id = ${id}`;
                if (!l.length) return res.status(404).json({ erro: 'Ingresso não encontrado.' });
                const ing = l[0].dados;
                const ver = await conferir(sql, ing, ctx);
                const saida = publico(ing);
                saida.visita = ver.visita;
                return res.status(200).json({ ingresso: saida, verificacao: { estado: ver.estado, motivo: ver.motivo, itens: ver.itens } });
            }

            const q = req.query || {};
            const fTurma = q.turma ? turmaCanonica(texto(q.turma, 20)) : '';
            const fEscola = texto(q.escola, 200);
            const fStatus = ['Pendente', 'Aprovado', 'Recusado'].indexOf(q.status) !== -1 ? q.status : '';

            const linhas = await sql`SELECT dados FROM ingressos`;
            const brutos = linhas.map(function (l) { return l.dados; });
            for (const ing of brutos) await conferir(sql, ing, ctx);   // mantém os status em dia com os painéis
            let todos = brutos.map(publico);

            const turmas = [];
            const escolas = [];
            const somar = function (lista, v) { v = String(v || '').trim(); if (v && lista.indexOf(v) === -1) lista.push(v); };
            todos.forEach(function (i) { somar(turmas, turmaCanonica(i.turma)); somar(escolas, i.escola); });
            ctx.visitas.forEach(function (a) { somar(turmas, turmaCanonica(a.turma)); somar(escolas, a.escola); });
            turmas.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
            escolas.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });

            todos = todos.filter(function (i) {
                if (fTurma && turmaCanonica(i.turma) !== fTurma) return false;
                if (fEscola && i.escola && !igual(i.escola, fEscola)) return false;
                if (fStatus && i.status !== fStatus) return false;
                return true;
            }).sort(function (a, b) {
                return String(a.turma).localeCompare(String(b.turma), 'pt-BR') ||
                    String(a.nome).localeCompare(String(b.nome), 'pt-BR');
            });

            return res.status(200).json({
                ingressos: todos,
                visitas: ctx.visitas.map(visitaPublica),
                turmas: turmas,
                escolas: escolas
            });
        }

        if (req.method === 'POST') {
            const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

            // ---- Gerar (e já conferir) os ingressos da turma toda de uma vez --------
            if (corpo.acao === 'gerar-lote') {
                const turma = turmaCanonica(texto(corpo.turma, 20));
                if (!turma) return res.status(400).json({ erro: 'Escolha a turma.' });
                const escolaFiltro = texto(corpo.escola, 200);

                const ctx = await carregarContexto(sql);
                const visita = escolherVisita(ctx.visitas, turma, escolaFiltro, false);
                const escolaPadrao = escolaFiltro || (visita && visita.escola) || '';

                const ings = (await sql`SELECT dados FROM ingressos`).map(function (l) { return l.dados; });
                const daTurma = ings.filter(function (i) {
                    return turmaCanonica(i.turma) === turma && (!escolaFiltro || !i.escola || igual(i.escola, escolaFiltro));
                });

                const sols = ctx.sols.filter(function (s) {
                    return turmaCanonica(s.turma) === turma && (!escolaFiltro || !s.escola || igual(s.escola, escolaFiltro));
                });

                const jaTem = function (s) {
                    const chave = String(s.emailAluno || s.ra || '').trim().toLowerCase();
                    return daTurma.some(function (i) {
                        if (chave && i.chave === chave) return true;
                        return !!(s.ra && i.ra && raCanonico(i.ra) && raCanonico(i.ra) === raCanonico(s.ra));
                    });
                };

                let criados = 0;
                const vistos = {};
                for (const s of sols) {
                    const chave = String(s.emailAluno || s.ra || '').trim().toLowerCase();
                    const nome = texto(s.nomeAluno, 150);
                    if (!nome || (chave && vistos[chave])) continue;
                    if (chave) vistos[chave] = true;
                    if (jaTem(s)) continue;
                    const novo = {
                        id: crypto.randomBytes(9).toString('hex'),
                        nome: nome,
                        turma: turma,
                        escola: texto(s.escola, 200) || escolaPadrao,
                        ra: texto(s.ra, 30),
                        tipo: 'Aluno',
                        status: 'Pendente',
                        criadoEm: Date.now(),
                        respondidoEm: 0
                    };
                    if (chave) novo.chave = chave;
                    await gravar(sql, novo);
                    daTurma.push(novo);
                    criados++;
                }

                let aprovados = 0, pendentes = 0;
                for (const i of daTurma) {
                    if (!i.escola && escolaPadrao) i.escola = escolaPadrao;
                    await conferir(sql, i, ctx);
                    if (i.status === 'Aprovado') aprovados++;
                    else if (i.status === 'Pendente') pendentes++;
                }

                return res.status(200).json({
                    ok: true, criados: criados, aprovados: aprovados, pendentes: pendentes,
                    ingressos: daTurma.map(publico).sort(function (a, b) {
                        return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
                    })
                });
            }

            // ---- Cancelar / reativar um ingresso ------------------------------------
            if (corpo.id) {
                const id = idLimpo(corpo.id);
                const l = await sql`SELECT dados FROM ingressos WHERE id = ${id}`;
                if (!l.length) return res.status(404).json({ erro: 'Ingresso não encontrado.' });
                const i = l[0].dados;
                if (corpo.status === 'Recusado') {
                    i.status = 'Recusado';
                    i.respondidoEm = Date.now();
                    await gravar(sql, i);
                } else {
                    i.status = 'Pendente';          // reativar: o sistema confere de novo
                    i.respondidoEm = Date.now();
                    await conferir(sql, i, await carregarContexto(sql));
                    await gravar(sql, i);
                }
                return res.status(200).json({ ok: true, ingresso: publico(i) });
            }

            // ---- Criar ingresso novo (já passa pela conferência) --------------------
            const novo = corpo.ingresso || {};
            const nome = texto(novo.nome, 150);
            if (!nome) return res.status(400).json({ erro: 'Informe o nome do aluno/monitor.' });
            const chave = texto(novo.chave, 120).toLowerCase();
            const ctx = await carregarContexto(sql);
            if (chave) {
                const ja = await sql`SELECT dados FROM ingressos WHERE dados->>'chave' = ${chave} LIMIT 1`;
                if (ja.length) {
                    const existente = ja[0].dados;
                    await conferir(sql, existente, ctx);
                    return res.status(200).json({ ok: true, existente: true, ingresso: publico(existente) });
                }
            }
            const turma = turmaCanonica(texto(novo.turma, 20));
            let escola = texto(novo.escola, 200);
            if (!escola) {
                const v = escolherVisita(ctx.visitas, turma, '', false);
                if (v) escola = v.escola || '';
            }
            const i = {
                id: crypto.randomBytes(9).toString('hex'),
                nome: nome,
                turma: turma,
                escola: escola,
                ra: texto(novo.ra, 30),
                tipo: novo.tipo === 'Monitor' ? 'Monitor' : 'Aluno',
                status: 'Pendente',
                criadoEm: Date.now(),
                respondidoEm: 0
            };
            if (chave) i.chave = chave;
            await gravar(sql, i);
            await conferir(sql, i, ctx);
            return res.status(200).json({ ok: true, ingresso: publico(i) });
        }

        if (req.method === 'DELETE') {
            const id = idLimpo(req.query && req.query.id);
            if (!id) return res.status(400).json({ erro: 'Informe o id.' });
            await sql`DELETE FROM ingressos WHERE id = ${id}`;
            try { await sql`DELETE FROM chamada WHERE id = ${id}`; } catch (e) { /* tabela da chamada ainda não existe */ }
            return res.status(200).json({ ok: true });
        }

        res.setHeader('Allow', 'GET, POST, DELETE');
        return res.status(405).json({ erro: 'Método não permitido.' });
    } catch (erro) {
        console.error('Erro em /api/ingressos:', erro);
        return res.status(500).json({ erro: erro.message || 'Erro no servidor.' });
    }
};
