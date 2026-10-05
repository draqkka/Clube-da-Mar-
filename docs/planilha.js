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
// servidor): "000108327708-X/SP", "108327708xsp" e "108327708X" são o mesmo RA
// (o "SP" do final é só a sigla do estado e é ignorado).
function raCanonico(r) {
    return _normalizarTexto(r).replace(/[^A-Z0-9]/g, '').replace(/^0+/, '').replace(/SP$/, '');
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

// ---- Arquivo .xlsx para baixar ---------------------------------------------

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
// PLANILHA OFICIAL — "REGISTRO E CONTROLE DO RENDIMENTO ESCOLAR"
//
// É a planilha que a escola exporta. O site só aceita arquivos que tenham
// esse título escrito dentro (nas primeiras linhas de cada aba).
//
//  • Cada ABA é lida separadamente e vira UMA turma — o site descobre a
//    turma pela coluna "Turma", por uma linha "Turma: 3ºA" no topo da aba
//    ou pelo nome da aba. Cada turma é salva à parte: importar a 3ºA nunca
//    mexe nos alunos da 2ºA.
//  • As colunas são achadas PELO NOME do cabeçalho (qualquer ordem):
//    Aluno/Nome, RA, Frequência (Fre%), Nota/Média, Situação, Curso.
//  • Situação "Ativo" = aluno da sala. Remanejado, transferido etc. = não
//    pertence mais à sala e NÃO aparece pro professor.
//  • Aprovado = Ativo + frequência >= 85% + nota >= 7 (ajuste abaixo).
// ==========================================================================

var TITULO_PLANILHA_OFICIAL = 'Registro e controle do rendimento escolar';
var CRITERIO_PRESENCA_MINIMA = 85;   // em %
var CRITERIO_NOTA_MINIMA = 7;        // nota de 0 a 10 (>= 7 aprova)
var EXTRA_SITUACAO = 'Situação';     // onde a situação fica guardada (extras)
var EXTRA_CURSO = 'Curso';           // onde o curso fica guardado (extras)

var _CHAVES_NOME = ['aluno', 'nome', 'nomedoaluno', 'nomecompleto', 'nomealuno'];
var _CHAVES_RA = ['ra', 'registroaluno', 'registrodoaluno', 'nrra', 'numerora'];
var _CHAVES_DIG = ['dig', 'digito', 'digra', 'dv', 'digitora'];
var _CHAVES_UF = ['uf', 'ufra'];
var _CHAVES_NOTA = ['mediafinal', 'notafinal', 'mediageral', 'media', 'nota', 'mf', 'notas'];
var _CHAVES_SITUACAO = ['situacao', 'situacaodoaluno', 'situacaoaluno', 'sit', 'status'];
var _CHAVES_TURMA = ['turma', 'classe'];
var _CHAVES_CURSO = ['curso', 'cursohabilitacao'];
var _CHAVES_SERIE = ['serie', 'ano', 'anoserie'];

function _semAcento(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function _textoCelula(v) {
    return String(v == null ? '' : v).trim();
}

function _turmaValida(t) {
    return /^\d+\u00BA[A-Z]+$/.test(String(t));
}

// O título pode estar numa célula só ou espalhado em células vizinhas.
function _contemTitulo(linhas) {
    var alvo = _chaveColuna(TITULO_PLANILHA_OFICIAL);
    for (var i = 0; i < Math.min(linhas.length, 20); i++) {
        var junto = linhas[i].map(function (c) { return _chaveColuna(c); }).join('');
        if (junto.indexOf(alvo) !== -1) return true;
    }
    return false;
}

// Linha/coluna do cabeçalho "Aluno"/"Nome".
function _acharCabecalho(linhas) {
    for (var i = 0; i < Math.min(linhas.length, 60); i++) {
        for (var c = 0; c < linhas[i].length; c++) {
            if (_CHAVES_NOME.indexOf(_chaveColuna(linhas[i][c])) !== -1) return { linha: i, coluna: c };
        }
    }
    return null;
}

// Primeira coluna da "banda" de cabeçalho cuja chave bate, respeitando a
// ordem de prioridade da lista de chaves. -1 se não achar.
function _colunaPorChaves(banda, chaves) {
    for (var k = 0; k < chaves.length; k++) {
        for (var i = 0; i < banda.length; i++) {
            if (banda[i].chave === chaves[k]) return banda[i].coluna;
        }
    }
    return -1;
}

// Colunas de frequência: "Fre(%)", "Frequência", "% Freq"... Ignora a
// frequência ANUAL ("Fre An(%)"). Prefere a que tem "%".
function _colunasFrequencia(banda) {
    var comPercentual = [], outras = [];
    banda.forEach(function (cel) {
        var t = _normalizarTexto(cel.texto);
        if (!/FRE|PRESEN/.test(t)) return;
        if (/ANU|\bAN\b|AN\(|FALTA|AUS/.test(t)) return;
        (t.indexOf('%') !== -1 ? comPercentual : outras).push(cel.coluna);
    });
    var lista = comPercentual.length ? comPercentual : outras;
    return lista.filter(function (c, i) { return lista.indexOf(c) === i; });
}

// Procura "ROTULO: valor" nas linhas de cima da aba (ou o valor na célula
// ao lado). Devolve o texto original (com acento) ou ''.
function _valorRotulo(linhas, limite, rotulo, paradas) {
    var rotuloU = rotulo.toUpperCase();
    var regexParada = new RegExp('\\b(' + paradas.join('|') + ')\\b');
    for (var i = 0; i < Math.min(linhas.length, limite); i++) {
        for (var c = 0; c < linhas[i].length; c++) {
            var original = _textoCelula(linhas[i][c]);
            if (!original) continue;
            var base = _semAcento(original).toUpperCase();
            var pos = base.indexOf(rotuloU);
            if (pos === -1) continue;

            var resto = original.slice(pos + rotuloU.length);
            var restoBase = base.slice(pos + rotuloU.length);
            var ini = restoBase.match(/^\s*[:\-\u2013]?\s*/)[0].length;
            resto = resto.slice(ini);
            restoBase = restoBase.slice(ini);

            var fim = restoBase.length;
            var kParada = restoBase.search(regexParada);
            if (kParada > 0 && kParada < fim) fim = kParada;
            var kEspacos = restoBase.search(/\s{3,}|\t/);
            if (kEspacos > 0 && kEspacos < fim) fim = kEspacos;

            var valor = resto.slice(0, fim).trim().replace(/[-\u2013|;,]\s*$/, '').trim();
            if (valor) return valor;

            for (var d = c + 1; d < linhas[i].length; d++) {
                var vizinho = _textoCelula(linhas[i][d]);
                if (vizinho) return vizinho;
            }
        }
    }
    return '';
}

// "DESENVOLVIMENTO DE SISTEMAS" -> "Desenvolvimento de Sistemas"
function _formatarCurso(texto) {
    var t = _textoCelula(texto).replace(/\s+/g, ' ');
    if (!t) return '';
    if (t !== t.toUpperCase()) return t; // já veio com maiúscula/minúscula normal
    var minusculas = ['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o'];
    return t.toLowerCase().split(' ').map(function (p, i) {
        if (i > 0 && minusculas.indexOf(p) !== -1) return p;
        return p.charAt(0).toUpperCase() + p.slice(1);
    }).join(' ');
}

// Frequência: aceita "92", "92%", "92,5" e também 0,92 (formato % do Excel).
function _presencaNormalizada(v) {
    var n = _numeroOuVazio(v);
    if (n === '' || (typeof n === 'number' && isNaN(n))) return n;
    if (n > 0 && n <= 1 && String(v).indexOf('%') === -1) n = n * 100;
    return n;
}

// Lê UMA aba (já convertida em linhas) e acrescenta o resultado em "res".
// Separada da leitura do arquivo pra poder ser testada sem o SheetJS.
function _processarAba(nomeAba, linhas, res) {
    if (!_contemTitulo(linhas)) {
        res.ignoradas.push({ aba: nomeAba, motivo: 'não tem o título "' + TITULO_PLANILHA_OFICIAL + '"' });
        return;
    }
    res.abasComTitulo++;

    var cab = _acharCabecalho(linhas);
    if (!cab) {
        res.ignoradas.push({ aba: nomeAba, motivo: 'não achei a coluna "Aluno" (ou "Nome")' });
        return;
    }

    // "Banda" de cabeçalho: a linha do Aluno + 1 acima e 2 abaixo (o
    // cabeçalho da escola costuma ocupar duas linhas).
    var banda = [];
    for (var i = Math.max(0, cab.linha - 1); i <= Math.min(linhas.length - 1, cab.linha + 2); i++) {
        linhas[i].forEach(function (cel, col) {
            var t = _textoCelula(cel);
            if (t) banda.push({ linha: i, coluna: col, texto: t, chave: _chaveColuna(t) });
        });
    }

    var colNome = cab.coluna;
    var colRa = _colunaPorChaves(banda, _CHAVES_RA);
    var colDig = _colunaPorChaves(banda, _CHAVES_DIG);
    var colUf = _colunaPorChaves(banda, _CHAVES_UF);
    var colsFreq = _colunasFrequencia(banda);
    var colNota = _colunaPorChaves(banda, _CHAVES_NOTA);
    var colSit = _colunaPorChaves(banda, _CHAVES_SITUACAO);
    var colTurma = _colunaPorChaves(banda, _CHAVES_TURMA);
    var colCurso = _colunaPorChaves(banda, _CHAVES_CURSO);
    var colSerie = _colunaPorChaves(banda, _CHAVES_SERIE);
    var colFreq = colsFreq.length ? colsFreq[0] : -1;

    var faltando = [];
    if (colRa === -1) faltando.push('RA');
    if (colFreq === -1) faltando.push('Frequência (ex: "Fre(%)")');
    if (colNota === -1) faltando.push('Nota ou Média');
    if (faltando.length) {
        var vistas = [];
        banda.forEach(function (b) { if (vistas.indexOf(b.texto) === -1 && vistas.length < 25) vistas.push(b.texto); });
        res.ignoradas.push({
            aba: nomeAba,
            motivo: 'faltou a coluna ' + faltando.join(', ') + '. Colunas que encontrei: ' + vistas.join(' | ')
        });
        return;
    }

    if (colsFreq.length > 1) {
        res.avisos.push('Aba "' + nomeAba + '": achei ' + colsFreq.length + ' colunas de frequência; usei a primeira. Se estiver errada, avise o desenvolvedor.');
    }
    if (colSit === -1) {
        res.avisos.push('Aba "' + nomeAba + '": não achei a coluna "Situação" — considerei todos os alunos como Ativos.');
    }

    // Turma e curso "da aba": linhas de cima (antes do cabeçalho) ou nome da aba.
    var turmaAba = '';
    var turmaMeta = _valorRotulo(linhas, cab.linha, 'TURMA', ['CURSO', 'SERIE', 'PERIODO', 'TURNO', 'ANO', 'ESCOLA', 'BIMESTRE', 'DISCIPLINA']);
    if (turmaMeta && _turmaValida(turmaCanonica(turmaMeta))) turmaAba = turmaCanonica(turmaMeta);
    if (!turmaAba && _turmaValida(turmaCanonica(nomeAba))) turmaAba = turmaCanonica(nomeAba);

    var cursoAba = _formatarCurso(_valorRotulo(linhas, cab.linha, 'CURSO', ['TURMA', 'SERIE', 'PERIODO', 'TURNO', 'ANO', 'ESCOLA', 'BIMESTRE', 'DISCIPLINA']));

    var grupos = {};
    var semTurma = 0;
    for (var l = cab.linha + 1; l < linhas.length; l++) {
        var linha = linhas[l];
        var nome = _textoCelula(linha[colNome]);
        if (!nome || _CHAVES_NOME.indexOf(_chaveColuna(nome)) !== -1) continue;

        var ra = _textoCelula(linha[colRa]);
        if (colDig !== -1) ra += _textoCelula(linha[colDig]);
        if (colUf !== -1) ra += _textoCelula(linha[colUf]);
        if (!raCanonico(ra)) continue; // linha de total/anotação, não é aluno

        var turma = turmaAba;
        if (colTurma !== -1) {
            var t = turmaCanonica(_textoCelula(linha[colTurma]));
            if (_turmaValida(t)) turma = t;
        }
        if (!turma) { semTurma++; continue; }

        var curso = colCurso !== -1 ? _formatarCurso(linha[colCurso]) : '';
        curso = curso || cursoAba;

        var nota = _numeroOuVazio(linha[colNota]);
        var presenca = _presencaNormalizada(linha[colFreq]);
        if (typeof nota === 'number' && isNaN(nota)) { nota = ''; }
        if (typeof presenca === 'number' && isNaN(presenca)) { presenca = ''; }
        if (typeof nota === 'number' && (nota < 0 || nota > 10)) {
            res.avisos.push('Aba "' + nomeAba + '", ' + nome + ': nota ' + nota + ' fora de 0 a 10 — ficou em branco.');
            nota = '';
        }
        if (typeof presenca === 'number' && (presenca < 0 || presenca > 100)) {
            res.avisos.push('Aba "' + nomeAba + '", ' + nome + ': frequência ' + presenca + ' fora de 0 a 100 — ficou em branco.');
            presenca = '';
        }
        // Math.floor: 84,9% NÃO pode virar 85% e aprovar sem ter chegado lá.
        if (typeof presenca === 'number') presenca = Math.floor(presenca);

        var extras = {};
        var situacao = colSit !== -1 ? _textoCelula(linha[colSit]) : '';
        if (situacao) extras[EXTRA_SITUACAO] = situacao;
        if (curso) extras[EXTRA_CURSO] = curso;

        if (!grupos[turma]) grupos[turma] = { turma: turma, curso: curso, aba: nomeAba, alunos: [] };
        if (!grupos[turma].curso && curso) grupos[turma].curso = curso;
        grupos[turma].alunos.push({
            ra: ra,
            nome: nome,
            serie: colSerie !== -1 ? _textoCelula(linha[colSerie]) : '',
            turma: turma,
            nota: nota,
            presenca: presenca,
            comportamento: comportamentoPorPresenca(presenca),
            extras: extras
        });
    }

    var turmasAchadas = Object.keys(grupos);
    if (!turmasAchadas.length) {
        res.ignoradas.push({
            aba: nomeAba,
            motivo: semTurma
                ? 'não consegui identificar a turma (coloque uma linha "Turma: 3ºA" no topo da aba, uma coluna "Turma" ou dê à aba o nome da turma, ex: "3ºA")'
                : 'nenhum aluno encontrado abaixo do cabeçalho'
        });
        return;
    }

    turmasAchadas.forEach(function (t) {
        if (res.turmas.some(function (g) { return g.turma === t; })) {
            var anterior = res.turmas.filter(function (g) { return g.turma === t; })[0];
            res.avisos.push('As abas "' + anterior.aba + '" e "' + nomeAba + '" apontam para a mesma turma (' + t +
                '). Usei só a primeira ("' + anterior.aba + '") pra uma não sobrepor a outra.');
        } else {
            res.turmas.push(grupos[t]);
        }
    });
}

// Lê o arquivo inteiro. Devolve { turmas: [{turma, curso, aba, alunos}],
// avisos: [...], ignoradas: [{aba, motivo}] }. Lança erro se o arquivo não
// for a planilha oficial.
function lerRegistroRendimento(arrayBuffer) {
    var pasta = _lerPasta(arrayBuffer);
    var res = { turmas: [], avisos: [], ignoradas: [], abasComTitulo: 0 };

    pasta.SheetNames.forEach(function (nomeAba) {
        var linhas = XLSX.utils.sheet_to_json(pasta.Sheets[nomeAba], { header: 1, defval: '' });
        _processarAba(nomeAba, linhas, res);
    });

    if (!res.abasComTitulo) {
        throw new Error('Essa não é a planilha oficial: o título "' + TITULO_PLANILHA_OFICIAL +
            '" não aparece dentro do arquivo. Adicione a planilha "Registro e controle do rendimento escolar" exportada pela escola.');
    }
    if (!res.turmas.length) {
        throw new Error('A planilha tem o título certo, mas não consegui ler nenhuma turma. ' +
            res.ignoradas.map(function (g) { return 'Aba "' + g.aba + '": ' + g.motivo + '.'; }).join(' '));
    }
    return res;
}

// ---- Critério de aprovação (usado no painel do professor e do aluno) ------

// Situação do aluno na sala. Sem informação = considera Ativo.
function situacaoDoAluno(a) {
    var s = _textoCelula((a.extras || {})[EXTRA_SITUACAO]);
    return s || 'Ativo';
}

// Só "Ativo" pertence à sala; Remanejado, Transferido etc. não.
function alunoAtivo(a) {
    return /^ATIV/.test(_normalizarTexto(situacaoDoAluno(a)));
}

function cursoDoAluno(a) {
    return _textoCelula((a.extras || {})[EXTRA_CURSO]);
}

function _temValor(v) { return v !== '' && v !== null && v !== undefined && !isNaN(Number(v)); }

// { ativo, presencaOk, notaOk, aprovado, motivos: [...] }
function avaliarAluno(a) {
    var ativo = alunoAtivo(a);
    var presencaOk = _temValor(a.presenca) && Number(a.presenca) >= CRITERIO_PRESENCA_MINIMA;
    var notaOk = _temValor(a.nota) && Number(a.nota) >= CRITERIO_NOTA_MINIMA;
    var motivos = [];
    if (!ativo) motivos.push('situação: ' + situacaoDoAluno(a));
    if (!_temValor(a.presenca)) motivos.push('sem frequência');
    else if (!presencaOk) motivos.push('frequência ' + a.presenca + '% (mínimo ' + CRITERIO_PRESENCA_MINIMA + '%)');
    if (!_temValor(a.nota)) motivos.push('sem nota');
    else if (!notaOk) motivos.push('nota ' + a.nota + ' (mínimo ' + CRITERIO_NOTA_MINIMA + ')');
    return { ativo: ativo, presencaOk: presencaOk, notaOk: notaOk, aprovado: ativo && presencaOk && notaOk, motivos: motivos };
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
