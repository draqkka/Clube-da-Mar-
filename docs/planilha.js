// ==========================================================================
// LEITURA DA PLANILHA LOCAL (Excel) — usada só para NOTAS, PRESENÇA e
// COMPORTAMENTO. O login agora vem de usuarios.js (direto no código), não
// depende mais desta planilha nem de nenhum backend.
//
// IMPORTANTE: o arquivo abaixo precisa estar na MESMA PASTA que os arquivos
// .html do site. Toda vez que o professor atualizar as notas, o arquivo
// baixado deve substituir este aqui na pasta do site.
//
// Depende do SheetJS (xlsx.full.min.js) — inclua esse <script> ANTES deste
// arquivo no <head> de cada página que usa carregarPlanilha().
// ==========================================================================
var NOME_ARQUIVO_PLANILHA = 'planilha-clube-da-mare-modelo.xlsx';

var _planilhaCache = null; // evita reler o arquivo várias vezes na mesma página

// Deixa toda chave de objeto em minúsculo (RA -> ra, Nota -> nota, etc.)
// pra não depender de acentuação/maiúscula exata das colunas do Excel.
function _normalizarChaves(objeto) {
    var novo = {};
    Object.keys(objeto).forEach(function (chave) {
        novo[chave.trim().toLowerCase()] = objeto[chave];
    });
    return novo;
}

function carregarPlanilha() {
    if (_planilhaCache) return Promise.resolve(_planilhaCache);

    return fetch(NOME_ARQUIVO_PLANILHA)
        .then(function (resposta) {
            if (!resposta.ok) {
                throw new Error('Não encontrei o arquivo "' + NOME_ARQUIVO_PLANILHA + '" nesta pasta.');
            }
            return resposta.arrayBuffer();
        })
        .then(function (buffer) {
            var pasta = XLSX.read(new Uint8Array(buffer), { type: 'array' });

            function lerAba(nomeAba) {
                var aba = pasta.Sheets[nomeAba];
                if (!aba) return [];
                return XLSX.utils.sheet_to_json(aba, { defval: '' }).map(_normalizarChaves);
            }

            _planilhaCache = {
                // "pasta" fica guardada pra podermos gerar um Excel atualizado
                // depois (importação de notas), preservando as outras abas.
                pasta: pasta,
                notas: lerAba('Notas').filter(function (n) { return n.ra && n.nome && n.turma; })
            };
            return _planilhaCache;
        });
}

// Usado depois de importar notas novas, pra atualizar o cache em memória
// sem precisar reler o arquivo (o arquivo em disco só muda quando alguém
// baixa e substitui manualmente).
function atualizarCacheNotas(novasNotas) {
    if (_planilhaCache) _planilhaCache.notas = novasNotas;
}
