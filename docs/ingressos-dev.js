// Painel do Desenvolvedor: gerar ingresso avulso (monitor ou aluno).
// Não existe mais aprovação manual: o sistema confere o ingresso sozinho com os painéis
// (aluno confirmado, visita aprovada, escola e dias) e o aprova — ver api/ingressos.js.
// A lista de ingressos da turma fica em visita-clube.js (seção de agendamentos).
(function () {
    var form = document.getElementById('form-ingresso');
    if (!form) return;

    function aviso(t) { document.getElementById('msg-ingressos').textContent = t || ''; }
    function link(id) {
        return location.origin + location.pathname.replace(/[^\/]*$/, '') + 'ingresso.html?id=' + id;
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var corpo = { ingresso: {
            nome: document.getElementById('ing-nome').value,
            tipo: document.getElementById('ing-tipo').value,
            turma: document.getElementById('ing-turma').value,
            escola: document.getElementById('ing-escola').value,
            ra: document.getElementById('ing-ra').value
        } };
        fetch('/api/ingressos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
            .then(function (r) {
                return r.json().then(function (j) {
                    if (!r.ok) throw new Error(j.erro || 'Erro no servidor.');
                    return j;
                });
            })
            .then(function (j) {
                aviso('Ingresso criado. Link para enviar: ' + link(j.ingresso.id));
                form.reset();
                if (typeof vcRecarregarTudo === 'function') vcRecarregarTudo();
            })
            .catch(function (err) { aviso(err.message); });
    });
})();
