// ==========================================================================
// DADOS DOS ALUNOS (notas, presença, comportamento, série, turma...)
//
// Agora os dados ficam no BANCO DE DADOS (Vercel Postgres), acessado pela
// API em /api/alunos. O professor escolhe a planilha no computador, o
// site lê e SALVA direto no banco — não precisa mais baixar arquivo nem
// colocar nada na pasta do site. Todo mundo (aluno, diretoria,
// desenvolvedor) passa a ver a mudança na hora.
//
// O login continua vindo de usuarios.js.
//
// Depende do SheetJS (xlsx.full.min.js) — inclua esse <script> ANTES deste
// arquivo no <head> de cada página que usa as funções abaixo.
// ==========================================================================

// Turmas que aparecem no sistema mesmo sem alunos ainda. Turmas novas que
// já tenham alunos no banco aparecem sozinhas para Diretoria/Desenvolvedor.
var TURMAS_DO_SISTEMA = ['2ºA', '3ºA'];

var _planilhaCachePorTurma = {}; // turma -> { pasta, arquivo, turma, novaTurma, notas }

// Deixa toda chave de objeto em minúsculo (RA -> ra, Nota -> nota, etc.)
// pra não depender de acentuação/maiúscula exata das colunas do Excel.
function _normalizarChaves(objeto) {
    var novo = {};
    Object.keys(objeto).forEach(function (chave) {
        novo[chave.trim().toLowerCase()] = objeto[chave];
    });
    return novo;
}

// Tira acento e padroniza maiúsculas/espaços — usado tanto pro nome do
// arquivo quanto pra comparar nomes de aluno entre planilhas diferentes.
function _normalizarTexto(texto) {
    return String(texto || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/\s+/g, ' ').trim();
}

// "2ºA" -> "2A", "3ºA" -> "3A" (tira tudo que não for letra/número).
function _slugTurma(turma) {
    return _normalizarTexto(turma).replace(/[^A-Z0-9]/g, '');
}

// "3ºA", "3°A", "3A", "3 A", "3º ano A" -> sempre "3ºA" (igual ao servidor).
function turmaCanonica(t) {
    var bruto = String(t == null ? '' : t).trim();
    var s = _normalizarTexto(bruto).replace(/\b(ANO|SERIE|TURMA)\b/g, ' ')
        .replace(/(\d)\s*O(?=\s*[A-Z])/, '$1'); // "3o A" (o no lugar do º)
    var m = s.match(/(\d+)[^\dA-Z]*([A-Z]+)/);
    return m ? m[1] + '\u00BA' + m[2] : bruto;
}
function mesmaTurma(a, b) { return turmaCanonica(a) === turmaCanonica(b); }

// RA sem pontos/traços/espaços, maiúsculo e sem zeros à esquerda (igual ao
// servidor): "000108327708-X/SP" e "108327708xsp" são o mesmo RA.
function raCanonico(r) {
    return _normalizarTexto(r).replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');
}
function mesmoRa(a, b) {
    var ra = raCanonico(a);
    return ra !== '' && ra === raCanonico(b);
}

function nomeArquivoPlanilha(turma) {
    return 'planilha-' + _slugTurma(turma) + '.xlsx';
}

// ---- Comportamento automático a partir da Presença -----------------------
// Ajuste os números abaixo se a escola quiser outra faixa.
function comportamentoPorPresenca(presenca) {
    var p = Number(presenca);
    if (presenca === '' || presenca === null || presenca === undefined || isNaN(p)) return '';
    if (p >= 90) return 'Bom';
    if (p >= 75) return 'Regular';
    return 'Péssimo';
}

// ---- Comunicação com o banco (via /api/alunos) -----------------------------

function _requisicaoApi(url, opcoes) {
    return fetch(url, opcoes).then(function (resposta) {
        return resposta.json().catch(function () { return {}; }).then(function (corpo) {
            if (!resposta.ok) throw new Error(corpo.erro || ('Erro ' + resposta.status));
            return corpo;
        });
    });
}

// Evita que texto vindo de planilha vire HTML na tela.
function escaparHtml(valor) {
    return String(valor == null ? '' : valor)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Carrega os alunos de UMA turma (nome exato, ex: "3ºA"). Devolve o mesmo
// formato de antes, então os outros painéis continuam funcionando.
// novaTurma = true quando a turma ainda não tem nenhum aluno cadastrado.
function carregarPlanilha(turma) {
    if (!turma) return Promise.reject(new Error('Informe a turma pra carregar a planilha.'));
    turma = turmaCanonica(turma);
    if (_planilhaCachePorTurma[turma]) return Promise.resolve(_planilhaCachePorTurma[turma]);

    return _requisicaoApi('/api/alunos?turma=' + encodeURIComponent(turma)).then(function (corpo) {
        var notas = corpo.alunos || [];
        var dados = {
            pasta: null,
            arquivo: nomeArquivoPlanilha(turma), // só usado no nome da cópia de segurança
            turma: turma,
            novaTurma: notas.length === 0,
            notas: notas
        };
        _planilhaCachePorTurma[turma] = dados;
        return dados;
    });
}

// Esquece o que estava em memória e busca de novo no banco.
function recarregarPlanilha(turma) {
    turma = turmaCanonica(turma);
    delete _planilhaCachePorTurma[turma];
    return carregarPlanilha(turma);
}

function atualizarCacheNotas(turma, novasNotas) {
    if (_planilhaCachePorTurma[turma]) _planilhaCachePorTurma[turma].notas = novasNotas;
}

// Busca UM aluno pelo RA (qualquer formato: maiúsculo/minúsculo, com ou sem
// zeros à esquerda, pontos ou traços). Devolve o aluno ou null.
function carregarAlunoPorRa(ra) {
    if (!raCanonico(ra)) return Promise.resolve(null);
    return _requisicaoApi('/api/alunos?ra=' + encodeURIComponent(ra)).then(function (corpo) {
        return (corpo.alunos && corpo.alunos[0]) || null;
    });
}

// Grava alunos no banco (novos entram, existentes são atualizados pelo RA).
// opcoes: { professor, substituir } — substituir=true remove da turma quem
// não estiver na lista enviada. Devolve { gravados, ignorados, removidos }.
function salvarAlunos(turma, alunos, opcoes) {
    opcoes = opcoes || {};
    return _requisicaoApi('/api/alunos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            turma: turma,
            alunos: alunos,
            professor: opcoes.professor || '',
            substituir: !!opcoes.substituir
        })
    });
}

// Carrega TODAS as turmas de uma vez (Diretoria e Desenvolvedor). Uma
// única chamada ao banco. Turmas de TURMAS_DO_SISTEMA sem alunos entram
// com lista vazia; turmas que existem no banco mas não estão na lista
// também aparecem.
function carregarTodasAsTurmas() {
    return _requisicaoApi('/api/alunos').then(function (corpo) {
        var todas = corpo.alunos || [];
        var nomesTurmas = TURMAS_DO_SISTEMA.map(turmaCanonica);
        todas.forEach(function (a) {
            var t = turmaCanonica(a.turma);
            if (nomesTurmas.indexOf(t) === -1) nomesTurmas.push(t);
        });

        var resultados = nomesTurmas.map(function (turma) {
            var notas = todas.filter(function (a) { return turmaCanonica(a.turma) === turma; });
            var dados = { pasta: null, arquivo: nomeArquivoPlanilha(turma), turma: turma, novaTurma: notas.length === 0, notas: notas };
            _planilhaCachePorTurma[turma] = dados;
            return dados;
        });
        return { porTurma: resultados, notas: todas };
    });
}

// Lê o arquivo escolhido: .xlsx/.xls (binário) ou .csv (texto). CSV pode vir
// em UTF-8 ou Windows-1252 (Excel brasileiro) e com ";" como separador —
// sem tratar isso, "Série" virava "SÃ©rie" e a coluna não era reconhecida.
function _lerPasta(arrayBuffer) {
    var bytes = new Uint8Array(arrayBuffer);
    var ehZip = bytes[0] === 0x50 && bytes[1] === 0x4B;   // .xlsx
    var ehOle = bytes[0] === 0xD0 && bytes[1] === 0xCF;   // .xls
    if (ehZip || ehOle) return XLSX.read(bytes, { type: 'array' });

    var texto;
    try { texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (e) { texto = new TextDecoder('windows-1252').decode(bytes); }
    texto = texto.replace(/^\uFEFF/, '');

    var primeira = texto.split(/\r?\n/)[0] || '';
    var separador = (primeira.split(';').length > primeira.split(',').length) ? ';'
        : (primeira.split('\t').length > primeira.split(',').length ? '\t' : ',');
    // raw:true mantém o texto como está (não transforma RA em número).
    return XLSX.read(texto, { type: 'string', raw: true, FS: separador });
}

// ---- Leitura da planilha que o professor escolhe no computador -------------
// As colunas são achadas PELO NOME do cabeçalho (qualquer ordem, com ou sem
// acento). RA e Nome são obrigatórias. Colunas que o sistema não conhece
// (ex: Turno, Responsável) não são perdidas: ficam salvas em "extras".

var _ALIASES_COLUNAS = {
    ra: ['ra', 'registroaluno', 'registrodoaluno'],
    nome: ['nome', 'nomedoaluno', 'nomecompleto', 'aluno'],
    serie: ['serie', 'ano', 'anoserie'],
    turma: ['turma', 'classe'],
    nota: ['nota', 'media'],
    presenca: ['presenca', 'frequencia', 'freq'],
    comportamento: ['comportamento'],
    professor: ['professor']
};

function _chaveColuna(texto) {
    return _normalizarTexto(texto).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function _campoConhecido(cabecalho) {
    var chave = _chaveColuna(cabecalho);
    var achado = null;
    Object.keys(_ALIASES_COLUNAS).forEach(function (campo) {
        if (_ALIASES_COLUNAS[campo].indexOf(chave) !== -1) achado = campo;
    });
    return achado;
}

function _numeroOuVazio(valor) {
    if (valor === '' || valor === null || valor === undefined) return '';
    var n = Number(String(valor).replace('%', '').replace(',', '.').trim());
    return isNaN(n) ? NaN : n;
}

// Devolve { alunos, avisos, temColunaTurma }. Lança erro se não achar RA e Nome.
function lerPlanilhaDeAlunos(arrayBuffer) {
    var pasta = _lerPasta(arrayBuffer);
    var aba = pasta.Sheets[pasta.SheetNames[0]];
    var linhas = XLSX.utils.sheet_to_json(aba, { header: 1, defval: '' });

    // Cabeçalho = primeira linha (entre as 10 primeiras) que tem RA e Nome.
    var indiceCabecalho = -1, mapa = null;
    for (var i = 0; i < Math.min(linhas.length, 10) && indiceCabecalho === -1; i++) {
        var tentativa = { ra: -1, nome: -1 };
        linhas[i].forEach(function (celula, coluna) {
            var campo = _campoConhecido(celula);
            if (campo && tentativa[campo] === undefined) tentativa[campo] = coluna;
            else if (campo && tentativa[campo] === -1) tentativa[campo] = coluna;
        });
        if (tentativa.ra !== -1 && tentativa.nome !== -1) { indiceCabecalho = i; mapa = tentativa; }
    }
    if (indiceCabecalho === -1) {
        throw new Error('Não encontrei a linha de cabeçalho com as colunas "RA" e "Nome" — baixe o modelo em branco e confira.');
    }

    var cabecalho = linhas[indiceCabecalho];
    var colunasExtras = [];
    cabecalho.forEach(function (celula, coluna) {
        var nomeColuna = String(celula).trim();
        if (nomeColuna && !_campoConhecido(nomeColuna)) colunasExtras.push({ coluna: coluna, nome: nomeColuna });
    });

    function valor(linha, campo) { return mapa[campo] === undefined ? '' : linha[mapa[campo]]; }

    var alunos = [], avisos = [];
    for (var l = indiceCabecalho + 1; l < linhas.length; l++) {
        var linha = linhas[l];
        var ra = String(valor(linha, 'ra')).trim();
        var nome = String(valor(linha, 'nome')).trim();
        if (!ra || !nome) continue; // linha vazia ou anotação solta

        var nota = _numeroOuVazio(valor(linha, 'nota'));
        var presenca = _numeroOuVazio(valor(linha, 'presenca'));
        if (typeof nota === 'number' && isNaN(nota)) { avisos.push('Linha ' + (l + 1) + ' (' + nome + '): nota inválida, ficou em branco.'); nota = ''; }
        if (typeof presenca === 'number' && isNaN(presenca)) { avisos.push('Linha ' + (l + 1) + ' (' + nome + '): presença inválida, ficou em branco.'); presenca = ''; }
        if (typeof nota === 'number' && (nota < 0 || nota > 10)) avisos.push('Linha ' + (l + 1) + ' (' + nome + '): nota ' + nota + ' fora de 0 a 10.');
        if (typeof presenca === 'number' && (presenca < 0 || presenca > 100)) avisos.push('Linha ' + (l + 1) + ' (' + nome + '): presença ' + presenca + ' fora de 0 a 100.');

        var comportamento = String(valor(linha, 'comportamento')).trim() || comportamentoPorPresenca(presenca);

        var extras = {};
        colunasExtras.forEach(function (c) {
            var v = linha[c.coluna];
            if (v !== '' && v !== null && v !== undefined) extras[c.nome] = v;
        });

        alunos.push({
            ra: ra,
            nome: nome,
            serie: String(valor(linha, 'serie')).trim(),
            turma: String(valor(linha, 'turma')).trim(),
            nota: nota,
            presenca: presenca,
            comportamento: comportamento,
            extras: extras
        });
    }

    return { alunos: alunos, avisos: avisos, temColunaTurma: mapa.turma !== undefined };
}

// ---- Arquivos .xlsx para baixar --------------------------------------------

// Planilha em branco só com o cabeçalho, pro professor preencher.
function baixarModeloPlanilha() {
    var pasta = XLSX.utils.book_new();
    var aba = XLSX.utils.aoa_to_sheet([
        ['RA', 'Nome', 'Série', 'Turma', 'Nota', 'Presença', 'Comportamento']
    ]);
    aba['!cols'] = [{ wch: 16 }, { wch: 34 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(pasta, aba, 'Notas');
    XLSX.writeFile(pasta, 'modelo-planilha-turma.xlsx');
}

// Cópia de segurança da turma (o que está salvo no site agora).
function baixarPlanilhaTurma(turma) {
    var dados = _planilhaCachePorTurma[turma];
    if (!dados) return;

    var nomesExtras = [];
    dados.notas.forEach(function (n) {
        Object.keys(n.extras || {}).forEach(function (k) { if (nomesExtras.indexOf(k) === -1) nomesExtras.push(k); });
    });

    var cabecalho = ['RA', 'Nome', 'Série', 'Turma', 'Nota', 'Presença', 'Comportamento', 'Professor'].concat(nomesExtras);
    var linhas = dados.notas.map(function (n) {
        return [n.ra, n.nome, n.serie || '', n.turma, n.nota, n.presenca, n.comportamento, n.professor || '']
            .concat(nomesExtras.map(function (k) { return (n.extras || {})[k] || ''; }));
    });

    var pasta = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(pasta, XLSX.utils.aoa_to_sheet([cabecalho].concat(linhas)), 'Notas');
    XLSX.writeFile(pasta, dados.arquivo);
}

// ==========================================================================
// PLANILHA B — o boletim/"Mapão" que a escola exporta (tem uma coluna
// "ALUNO" e uma coluna de frequência tipo "Fre(%)"). O sistema acha essas
// colunas PELO TEXTO do cabeçalho, não pela posição, porque a posição muda
// conforme quantas matérias a turma tem.
// ==========================================================================

// Lê o arquivo (ArrayBuffer) e devolve uma lista [{nome, nomeNormalizado,
// frequencia}, ...]. Lança erro se não achar as colunas esperadas.
function lerFrequenciaExterna(arrayBuffer) {
    var pasta = _lerPasta(arrayBuffer);
    var aba = pasta.Sheets[pasta.SheetNames[0]];
    var linhas = XLSX.utils.sheet_to_json(aba, { header: 1, defval: '' });

    // Acha a linha/coluna do cabeçalho "ALUNO".
    var linhaAluno = -1, colAluno = -1;
    for (var i = 0; i < linhas.length; i++) {
        for (var c = 0; c < linhas[i].length; c++) {
            if (String(linhas[i][c]).trim().toUpperCase() === 'ALUNO') {
                linhaAluno = i; colAluno = c; break;
            }
        }
        if (linhaAluno !== -1) break;
    }
    if (linhaAluno === -1) {
        throw new Error('Não encontrei a coluna "ALUNO" nesse arquivo — confira se é o Mapão/boletim exportado certo.');
    }

    // A coluna de frequência do bimestre ("Fre(%)") costuma ficar 1 linha
    // abaixo de "ALUNO" (cabeçalho em duas linhas). Evita pegar a "Fre
    // An(%)" (anual) sem querer — se preferir usar a anual, troque a
    // condição abaixo pra procurar por "an" em vez de excluir.
    var colFreq = -1;
    for (var linhaBusca = linhaAluno; linhaBusca <= linhaAluno + 2 && linhaBusca < linhas.length; linhaBusca++) {
        for (var c2 = 0; c2 < linhas[linhaBusca].length; c2++) {
            var texto = String(linhas[linhaBusca][c2]).trim().toLowerCase();
            if (texto.indexOf('fre') !== -1 && texto.indexOf('%') !== -1 && texto.indexOf('an') === -1) {
                colFreq = c2;
                break;
            }
        }
        if (colFreq !== -1) break;
    }
    if (colFreq === -1) {
        throw new Error('Não encontrei a coluna de frequência ("Fre(%)") nesse arquivo.');
    }

    var alunos = [];
    for (var l = linhaAluno + 1; l < linhas.length; l++) {
        var nome = String(linhas[l][colAluno] || '').trim();
        if (!nome) break; // primeira linha em branco = acabou a lista de alunos
        var freqTexto = String(linhas[l][colFreq] || '').replace('%', '').replace(',', '.').trim();
        var freq = parseFloat(freqTexto);
        if (isNaN(freq)) continue;
        alunos.push({ nome: nome, nomeNormalizado: _normalizarTexto(nome), frequencia: Math.round(freq) });
    }
    return alunos;
}

// Acha, numa lista já lida pela lerFrequenciaExterna, o registro que bate
// com um nome da Planilha A — primeiro por igualdade exata, senão por um
// nome "conter" as mesmas palavras do outro (cobre nome curto vs nome
// completo, ex: "Julia Victória" x "JULIA VICTÓRIA SANTOS SILVA").
// Devolve null se não achar, ou se achar mais de um (nome ambíguo).
function encontrarFrequenciaPorNome(nomeAlunoPlanilhaA, listaFrequenciaExterna) {
    var alvo = _normalizarTexto(nomeAlunoPlanilhaA);

    var exatos = listaFrequenciaExterna.filter(function (a) { return a.nomeNormalizado === alvo; });
    if (exatos.length === 1) return exatos[0];
    if (exatos.length > 1) return null; // ambíguo

    var palavrasAlvo = alvo.split(' ').filter(Boolean);
    var parciais = listaFrequenciaExterna.filter(function (a) {
        var palavrasA = a.nomeNormalizado.split(' ').filter(Boolean);
        return palavrasAlvo.every(function (p) { return palavrasA.indexOf(p) !== -1; }) ||
               palavrasA.every(function (p) { return palavrasAlvo.indexOf(p) !== -1; });
    });
    if (parciais.length === 1) return parciais[0];

    return null;
}
