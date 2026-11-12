// Ingressos digitais do Clube da Maré (o QR Code aponta para ingresso.html?id=XYZ).
// O ingresso nasce "Pendente"; quando o Desenvolvedor aprova no painel dele,
// vira "Aprovado" e a tela do aluno/monitor muda de "carregando" para
// "Verificação concluída — Acesso liberado".
//
// Cada ingresso também mostra os dados da VISITA da turma (escola, dias e
// horários), que vêm do agendamento APROVADO pelo Clube da Maré
// (tabela "agendamentos"). O horário de saída mostrado é o que o Clube
// concedeu à Diretoria (saidaConcedida; se o Clube não mexeu, é o pedido).
//
// GET  /api/ingressos?id=XYZ  -> { ingresso: {..., visita} }   (tela do aluno/monitor)
// GET  /api/ingressos         -> { ingressos, visitas, turmas, escolas }
//      filtros opcionais: ?turma=3ºA&escola=Nome&status=Aprovado
// POST /api/ingressos         -> { ingresso: { nome, turma, escola, ra, chave } }  cria (Pendente)
//      Com "chave" (e-mail do aluno), cada aluno tem um só ingresso.
// POST /api/ingressos         -> { id, status }  muda o status (Aprovado/Pendente/Recusado)
// POST /api/ingressos         -> { acao: 'gerar-lote', turma, escola, aprovar }
//      Gera os ingressos de TODOS os alunos da turma confirmados pelo Clube da Maré
//      (solicitações "Aprovado") que ainda não têm ingresso e, se aprovar = true,
//      aprova de uma vez todos os ingressos pendentes da turma.
// DELETE /api/ingressos?id=XYZ -> apaga um ingresso
const crypto = require('crypto');
const { db, turmaCanonica, raCanonico } = require('./_db');

const STATUS_VALIDOS = ['Pendente', 'Aprovado', 'Recusado'];

function texto(v, max) {
    return String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, max || 200);
}
function idLimpo(v) {
    return texto(v, 60).replace(/[^A-Za-z0-9_-]/g, '');
}
function igual(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}
function hojeBR() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });   // AAAA-MM-DD
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

async function visitasValidas(sql) {
    const l = await sql`SELECT dados FROM agendamentos`;
    return l.map(function (x) { return x.dados; })
        .filter(function (a) { return a && (a.status === 'Aprovado' || a.status === 'Pendente'); });
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
            const visitas = await visitasValidas(sql);

            if (id) {
                const l = await sql`SELECT dados FROM ingressos WHERE id = ${id}`;
                if (!l.length) return res.status(404).json({ erro: 'Ingresso não encontrado.' });
                const ing = publico(l[0].dados);
                const aprovada = escolherVisita(visitas, ing.turma, ing.escola, true);
                const qualquer = aprovada || escolherVisita(visitas, ing.turma, ing.escola, false);
                if (!ing.escola && qualquer) ing.escola = qualquer.escola || '';
                ing.visita = aprovada ? visitaPublica(aprovada) : null;
                return res.status(200).json({ ingresso: ing });
            }

            const q = req.query || {};
            const fTurma = q.turma ? turmaCanonica(texto(q.turma, 20)) : '';
            const fEscola = texto(q.escola, 200);
            const fStatus = STATUS_VALIDOS.indexOf(q.status) !== -1 ? q.status : '';

            const linhas = await sql`SELECT dados FROM ingressos`;
            let todos = linhas.map(function (l) { return publico(l.dados); });

            const turmas = [];
            const escolas = [];
            const somar = function (lista, v) { v = String(v || '').trim(); if (v && lista.indexOf(v) === -1) lista.push(v); };
            todos.forEach(function (i) { somar(turmas, turmaCanonica(i.turma)); somar(escolas, i.escola); });
            visitas.forEach(function (a) { somar(turmas, turmaCanonica(a.turma)); somar(escolas, a.escola); });
            turmas.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
            escolas.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });

            todos = todos.map(function (i) {
                if (!i.escola) {
                    const v = escolherVisita(visitas, i.turma, '', false);
                    if (v) i.escola = v.escola || '';
                }
                return i;
            }).filter(function (i) {
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
                visitas: visitas.map(visitaPublica),
                turmas: turmas,
                escolas: escolas
            });
        }

        if (req.method === 'POST') {
            const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

            // ---- Gerar (e aprovar) os ingressos da turma toda de uma vez ----------
            if (corpo.acao === 'gerar-lote') {
                const turma = turmaCanonica(texto(corpo.turma, 20));
                if (!turma) return res.status(400).json({ erro: 'Escolha a turma.' });
                const escolaFiltro = texto(corpo.escola, 200);
                const aprovar = !!corpo.aprovar;

                const visitas = await visitasValidas(sql);
                const visita = escolherVisita(visitas, turma, escolaFiltro, false);
                const escolaPadrao = escolaFiltro || (visita && visita.escola) || '';

                const ings = (await sql`SELECT dados FROM ingressos`).map(function (l) { return l.dados; });
                const daTurma = ings.filter(function (i) {
                    return turmaCanonica(i.turma) === turma && (!escolaFiltro || !i.escola || igual(i.escola, escolaFiltro));
                });

                const sols = (await sql`SELECT dados FROM solicitacoes`).map(function (l) { return l.dados; })
                    .filter(function (s) {
                        return s.status === 'Aprovado' && turmaCanonica(s.turma) === turma &&
                            (!escolaFiltro || !s.escola || igual(s.escola, escolaFiltro));
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

                let aprovados = 0;
                for (const i of daTurma) {
                    let mudou = false;
                    if (!i.escola && escolaPadrao) { i.escola = escolaPadrao; mudou = true; }
                    if (aprovar && i.status === 'Pendente') {
                        i.status = 'Aprovado';
                        i.respondidoEm = Date.now();
                        aprovados++;
                        mudou = true;
                    }
                    if (mudou) await gravar(sql, i);
                }

                return res.status(200).json({
                    ok: true, criados: criados, aprovados: aprovados,
                    ingressos: daTurma.map(publico).sort(function (a, b) {
                        return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
                    })
                });
            }

            // ---- Mudar o status (aprovação do Desenvolvedor) -----------------------
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
                return res.status(200).json({ ok: true, ingresso: publico(i) });
            }

            // ---- Criar ingresso novo (sempre começa Pendente) ---------------------
            const novo = corpo.ingresso || {};
            const nome = texto(novo.nome, 150);
            if (!nome) return res.status(400).json({ erro: 'Informe o nome do aluno/monitor.' });
            const chave = texto(novo.chave, 120).toLowerCase();
            if (chave) {
                const ja = await sql`SELECT dados FROM ingressos WHERE dados->>'chave' = ${chave} LIMIT 1`;
                if (ja.length) return res.status(200).json({ ok: true, existente: true, ingresso: publico(ja[0].dados) });
            }
            const turma = turmaCanonica(texto(novo.turma, 20));
            let escola = texto(novo.escola, 200);
            if (!escola) {
                const v = escolherVisita(await visitasValidas(sql), turma, '', false);
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
