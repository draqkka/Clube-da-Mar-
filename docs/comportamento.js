// ==========================================================================
// COMPORTAMENTO AUTOMÁTICO (emoji amarelo + legenda)
//
// Este arquivo é carregado pelos painéis (aluno, professor, diretoria e
// desenvolvedor) e fornece:
//   comportamentoDoAluno(aluno) -> { chave, texto, emoji, classe }
//   htmlComportamento(aluno)    -> HTML do "selo" (emoji + texto)
//
// A faixa (Bom/Regular/Péssimo) vem de planilha.js (comportamentoPorPresenca)
// e já é gravada em aluno.comportamento. Aqui só transformamos em visual.
// Pra mudar emoji ou texto, edite a tabela COMPORTAMENTOS abaixo.
// ==========================================================================

var COMPORTAMENTOS = {
    bom:     { chave: 'bom',     texto: 'Bom',     emoji: '😄', classe: 'comp-bom' },
    regular: { chave: 'regular', texto: 'Regular', emoji: '😐', classe: 'comp-regular' },
    ruim:    { chave: 'ruim',    texto: 'Péssimo', emoji: '😟', classe: 'comp-ruim' },
    nenhum:  { chave: '',        texto: '—',       emoji: '',   classe: '' }
};

function _normalizarComportamento(valor) {
    return String(valor === null || valor === undefined ? '' : valor)
        .trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function comportamentoDoAluno(aluno) {
    var bruto = aluno ? aluno.comportamento : '';

    // Se a planilha não trouxe comportamento, calcula pela presença.
    if ((bruto === '' || bruto === null || bruto === undefined) && aluno &&
        typeof comportamentoPorPresenca === 'function') {
        bruto = comportamentoPorPresenca(aluno.presenca);
    }

    var t = _normalizarComportamento(bruto);
    if (!t) return COMPORTAMENTOS.nenhum;
    if (t.indexOf('bom') === 0 || t.indexOf('otimo') === 0 || t.indexOf('excelente') === 0) return COMPORTAMENTOS.bom;
    if (t.indexOf('regular') === 0 || t.indexOf('medio') === 0) return COMPORTAMENTOS.regular;
    if (t.indexOf('pessimo') === 0 || t.indexOf('ruim') === 0 || t.indexOf('mau') === 0) return COMPORTAMENTOS.ruim;
    return COMPORTAMENTOS.nenhum;
}

function htmlComportamento(aluno) {
    var c = comportamentoDoAluno(aluno);
    if (!c.chave) return '—';
    return '<span class="comp-selo ' + c.classe + '">' +
           '<span class="comp-emoji" aria-hidden="true">' + c.emoji + '</span>' +
           c.texto + '</span>';
}

// Legenda geral: preenche qualquer <div id="legenda-comportamento"> da página.
document.addEventListener('DOMContentLoaded', function () {
    var caixa = document.getElementById('legenda-comportamento');
    if (!caixa) return;
    caixa.className = 'comp-legenda-geral';
    caixa.innerHTML =
        '<strong>Comportamento (calculado pela presença):</strong> ' +
        '<span class="comp-selo comp-bom"><span class="comp-emoji" aria-hidden="true">😄</span>Bom: 90% ou mais</span> ' +
        '<span class="comp-selo comp-regular"><span class="comp-emoji" aria-hidden="true">😐</span>Regular: 75% a 89%</span> ' +
        '<span class="comp-selo comp-ruim"><span class="comp-emoji" aria-hidden="true">😟</span>Péssimo: abaixo de 75%</span>';
});
