// ==========================================================================
// COMPORTAMENTO AUTOMÁTICO (emoji amarelo + legenda)
//
// Este arquivo é carregado pelos painéis (aluno, professor, diretoria e
// desenvolvedor) e fornece:
//   comportamentoDoAluno(aluno) -> { chave, texto, emoji, classe }
//   htmlComportamento(aluno)    -> HTML do "selo" (emoji + texto)
//
// O comportamento é calculado pela PRESENÇA e pela NOTA (média):
//   - cada uma gera uma faixa (Bom / Regular / Péssimo);
//   - vale a PIOR das duas (ex: presença 95% mas nota 4 = Péssimo).
// Se só uma das duas existir na planilha, vale só ela.
// Pra mudar as faixas, edite os números logo abaixo.
// ==========================================================================

// Presença (em %)
var COMP_PRESENCA_BOM = 90;       // 90% ou mais = Bom
var COMP_PRESENCA_REGULAR = 75;   // 75% a 89%   = Regular; abaixo = Péssimo
// Nota (média de 0 a 10)
var COMP_NOTA_BOM = 7;            // 7 ou mais   = Bom
var COMP_NOTA_REGULAR = 5;        // 5 a 6,9     = Regular; abaixo = Péssimo

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

function _temNumero(v) {
    return v !== '' && v !== null && v !== undefined && !isNaN(Number(v));
}

// 2 = bom, 1 = regular, 0 = péssimo
function _nivel(valor, minBom, minRegular) {
    var n = Number(valor);
    return n >= minBom ? 2 : (n >= minRegular ? 1 : 0);
}

function comportamentoDoAluno(aluno) {
    var niveis = [];
    if (aluno && _temNumero(aluno.presenca)) niveis.push(_nivel(aluno.presenca, COMP_PRESENCA_BOM, COMP_PRESENCA_REGULAR));
    if (aluno && _temNumero(aluno.nota)) niveis.push(_nivel(aluno.nota, COMP_NOTA_BOM, COMP_NOTA_REGULAR));

    if (niveis.length) {
        var pior = Math.min.apply(null, niveis);
        return pior === 2 ? COMPORTAMENTOS.bom : (pior === 1 ? COMPORTAMENTOS.regular : COMPORTAMENTOS.ruim);
    }

    // Sem presença nem nota: usa o texto que veio da planilha, se houver.
    var t = _normalizarComportamento(aluno ? aluno.comportamento : '');
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
        '<strong>Comportamento (calculado pela presença e pela nota — vale a pior das duas):</strong><br>' +
        '<span class="comp-selo comp-bom"><span class="comp-emoji" aria-hidden="true">😄</span>Bom: presença ' + COMP_PRESENCA_BOM + '% ou mais e nota ' + COMP_NOTA_BOM + ' ou mais</span> ' +
        '<span class="comp-selo comp-regular"><span class="comp-emoji" aria-hidden="true">😐</span>Regular: presença ' + COMP_PRESENCA_REGULAR + '% a ' + (COMP_PRESENCA_BOM - 1) + '% ou nota ' + COMP_NOTA_REGULAR + ' a ' + (COMP_NOTA_BOM - 0.1).toFixed(1).replace('.', ',') + '</span> ' +
        '<span class="comp-selo comp-ruim"><span class="comp-emoji" aria-hidden="true">😟</span>Péssimo: presença abaixo de ' + COMP_PRESENCA_REGULAR + '% ou nota abaixo de ' + COMP_NOTA_REGULAR + '</span>';
});
