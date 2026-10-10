// Assistente virtual do Clube da Maré (AssistLoop)
// Carrega o widget oficial e inicia o agente.
// O Agent ID é público (NEXT_PUBLIC_...), então pode ficar neste arquivo.
(function () {
    var AGENT_ID = "6fdcbab8-01c0-4546-8512-6eaf5cebdf8e";
    var WIDGET_URL = "https://assistloop.ai/assistloop-widget.js";

    function iniciar() {
        if (window.AssistLoopWidget && typeof window.AssistLoopWidget.init === "function") {
            window.AssistLoopWidget.init({ agentId: AGENT_ID });
        } else {
            console.error("[AssistLoop] O widget carregou, mas AssistLoopWidget não foi encontrado.");
        }
    }

    // Evita carregar duas vezes se a página chamar este arquivo mais de uma vez
    if (window.__assistloopCarregado) return;
    window.__assistloopCarregado = true;

    var script = document.createElement("script");
    script.src = WIDGET_URL;
    script.async = true;
    script.onload = iniciar;
    script.onerror = function () {
        console.error("[AssistLoop] Não foi possível carregar " + WIDGET_URL);
    };
    document.body.appendChild(script);
})();
