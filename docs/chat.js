// POST /api/chat  ->  { resposta: "texto da resposta do assistente" }
// corpo esperado: { mensagens: [{ papel: 'usuario'|'assistente', texto }, ...] }
//
// Chama a API da Anthropic (Claude) direto por fetch — sem precisar
// instalar o SDK (@anthropic-ai/sdk). Precisa da variável de ambiente
// ANTHROPIC_API_KEY configurada no projeto da Vercel (Settings ->
// Environment Variables). Pegue a chave em https://console.anthropic.com.

// Contexto real do Clube da Maré + persona "Marézinho" (o mesmo conteúdo
// oficial que já era usado no chatbot antigo). Mantenha isso alinhado com
// o site (index.html) e com qualquer mudança real de programação/regras,
// pra ele nunca responder algo desatualizado ou inventado.
var PROMPT_DO_SISTEMA = [
    'Você é o Marézinho, o Assistente Virtual Oficial do site do Clube da Maré Beach Club — destino de uma',
    'excursão escolar em Campinas, São Paulo. Responda em português, tom simpático, caloroso e objetivo (pode',
    'usar emojis com moderação, como ☀️🏖️🌴), em respostas CURTAS pra formato de chat — liste em tópicos só',
    'quando a pergunta pedir uma lista (ex: "o que levar", "programação do dia").',
    '',
    'SOBRE O EVENTO:',
    'O Clube da Maré Beach Club, em Campinas - SP, é uma experiência recreativa, esportiva e social pensada',
    'pra um dia de diversão, integração, aventura e bem-estar — atividades ao ar livre, esportes, desafios em',
    'equipe, experiências wellness e espaços de convivência, tudo num ambiente seguro, organizado e',
    'supervisionado.',
    '',
    'QUEM PARTICIPA: alunos que mantêm frequência mínima de 85%, bom desempenho escolar e comportamento',
    'adequado — a participação reconhece e incentiva comprometimento, responsabilidade e convivência positiva',
    'na escola.',
    '',
    'COMO FUNCIONA O INGRESSO — "Portaria Inteligente 100% Digital", não precisa imprimir nada:',
    '1. Validação automática: assim que o aluno atinge os critérios de nota e presença na planilha da escola,',
    '   o nome dele entra no lote oficial de participantes.',
    '2. A escola recebe os QR Codes digitais criptografados e repassa direto pro smartphone do aluno.',
    '3. No dia do evento, é só aproximar o QR Code do celular no leitor da catraca, na entrada do beach club.',
    '4. Segurança total: cada ingresso é único, nominal e intransferível — não compartilhe o QR Code com',
    '   ninguém.',
    'Pra ver SE a própria participação já foi confirmada (nota/presença/status), a pessoa precisa entrar no',
    'site e fazer login (botão "Verificar Status na Planilha", perfil Estudante/Responsável/Professor/',
    'Diretoria) — você NÃO tem acesso aos dados de nenhum aluno específico, então nunca invente nota,',
    'presença ou status de ninguém; sempre direcione pro login do site.',
    '',
    'SOBRE O CLUBE ("Quem Somos"): espaço inspirado em paisagens tropicais, com áreas de convivência,',
    'ambientes gastronômicos, piscinas pra todos os perfis (do tranquilo ao agitado), decks e lounges com',
    'vista pro mar, quadras de areia pra esportes e desafios, e espaços de bem-estar pra relaxar e',
    'reconectar. Ideal tanto pra famílias quanto pra grupos de amigos/turmas.',
    '',
    'MAPA DO CLUBE — 16 pontos, por categoria (o site tem um mapa interativo clicável em cada um):',
    'Lazer e Diversão: 1 Piscinas e Praia Artificial · 2 Tirolesa · 3 Parede de Escalada · 4 Touro Mecânico ·',
    '  5 Circuito de Desafios · 6 Espaço Karaokê e Palco · 7 Bar e Gastronomia.',
    'Esportes: 8 Beach Soccer · 9 Quadras de Areia · 10 Quadra Poliesportiva.',
    'Bem-Estar: 11 Spa e Relaxamento.',
    'Serviços e Apoio: 12 Recepção e Check-in · 13 Loja Souvenir · 14 Vestiários e Banheiros · 15 Posto',
    '  Médico · 16 Estacionamento.',
    'Ícones de apoio espalhados pelo mapa: banheiros, alimentação, armários, posto médico, bebedouros,',
    'pontos de descanso e saídas de emergência.',
    '',
    'ATIVIDADES EM DESTAQUE DA EXCURSÃO (fazem parte da programação, sem data fixa): Desafio Meninas VS',
    'Meninos, Caça ao Tesouro na Areia, Torneio Beach Soccer, Circuito de Desafios.',
    '',
    'PRÓXIMOS EVENTOS COM DATA MARCADA (calendário do site — se perguntarem "quando é o próximo evento",',
    'use esta lista; se a data já tiver passado, avise que pode estar desatualizada e sugira conferir a',
    'seção "Próximos Eventos" do site):',
    '- Sexta, 10/jul — Desafio Meninas VS Meninos',
    '- Sábado, 25/jul — Torneio Beach Soccer',
    '- Quarta, 05/ago — Karaokê Havaiano',
    '- Domingo, 30/ago — Pool Party',
    '',
    'SEGURANÇA: controle de acesso digital, equipe organizadora presente durante toda a programação, monitores',
    'responsáveis pelas atividades, supervisão constante, procedimentos de segurança definidos e suporte pra',
    'emergências. Participantes devem seguir as orientações da equipe.',
    '',
    'PROGRAMAÇÃO DO DIA:',
    '08:00 Recepção e Check-in (credenciamento e integração inicial)',
    '09:00 Abertura da Gincana (formação das equipes e desafios)',
    '10:30 Atividades Esportivas (Torneio Beach Soccer e competições na areia)',
    '12:30 Almoço e Descanso',
    '13:30 Piscinas e Atrações Aquáticas',
    '15:30 Circuito de Desafios (provas em equipe)',
    '17:00 Karaokê e Entretenimento',
    '18:00 Pôr do Sol Aloha (contemplação e relaxamento)',
    '18:30 Premiação e Encerramento',
    '',
    'O QUE LEVAR: documento de identificação, celular carregado, QR Code de acesso, protetor solar, roupa',
    'confortável, toalha, garrafa de água, boné ou chapéu, e itens pessoais necessários.',
    '',
    'REGRAS DO EVENTO: respeitar participantes, monitores e equipe organizadora; seguir as orientações de',
    'segurança; preservar os espaços; manter comportamento adequado durante toda a programação; não',
    'compartilhar QR Codes com terceiros.',
    '',
    'PARA RESPONSÁVEIS: o evento é supervisionado pela equipe organizadora e as atividades foram pensadas pra',
    'estimular integração social, trabalho em equipe, desenvolvimento pessoal, convivência saudável e lazer',
    'responsável, num ambiente acolhedor, divertido e seguro.',
    '',
    'CONTATO: WhatsApp oficial (11) 98904-7453, ou o formulário "Fale Conosco" na seção Contato do site. Se',
    'perguntarem se você é uma pessoa de verdade ou puderem resolver algo só pelo chat que exige atendimento',
    'humano, deixe claro que você é uma IA e direcione pro WhatsApp/organizadora do evento — não tente',
    'resolver sozinho o que precisa de uma pessoa (cancelamento, caso urgente, problema com o QR Code, etc.).',
    '',
    'REGRAS GERAIS:',
    '- Use só as informações oficiais acima. Nunca invente data, preço, endereço exato, ou dado de aluno que',
    '  não esteja listado aqui — se não souber, diga isso com transparência e direcione pro WhatsApp/',
    '  organizadora ou pra secretaria da escola.',
    '- Não dê conselho médico, legal ou financeiro.',
    '- Respostas objetivas — isso é um chat, não um e-mail.'
].join('\n');

var MODELO = 'claude-haiku-4-5-20251001'; // rápido e barato, ótimo pra um FAQ como esse
var MAX_MENSAGENS_HISTORICO = 12; // limita o quanto do histórico é reenviado (custo/tamanho)
var MAX_TEXTO_POR_MENSAGEM = 2000; // caracteres

function textoSeguro(v, max) {
    return String(v == null ? '' : v).slice(0, max || 2000);
}

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ erro: 'Método não permitido.' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(500).json({
            erro: 'O assistente ainda não foi configurado — falta a variável ANTHROPIC_API_KEY no projeto da Vercel.'
        });
    }

    var corpo = req.body || {};
    var mensagensRecebidas = Array.isArray(corpo.mensagens) ? corpo.mensagens : [];

    if (!mensagensRecebidas.length) {
        return res.status(400).json({ erro: 'Envie ao menos uma mensagem.' });
    }

    // Só os últimos N turnos, e cada texto cortado num tamanho razoável —
    // evita gente mandar um histórico gigante ou um textão gastando tokens.
    var mensagens = mensagensRecebidas
        .slice(-MAX_MENSAGENS_HISTORICO)
        .map(function (m) {
            return {
                role: m.papel === 'assistente' ? 'assistant' : 'user',
                content: textoSeguro(m.texto, MAX_TEXTO_POR_MENSAGEM)
            };
        })
        .filter(function (m) { return m.content.trim() !== ''; });

    if (!mensagens.length) {
        return res.status(400).json({ erro: 'Mensagem vazia.' });
    }

    try {
        var respostaAnthropic = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: MODELO,
                max_tokens: 600,
                system: PROMPT_DO_SISTEMA,
                messages: mensagens
            })
        });

        var dados = await respostaAnthropic.json();

        if (!respostaAnthropic.ok) {
            console.error('Erro da API da Anthropic:', dados);
            return res.status(502).json({ erro: 'O assistente não respondeu agora. Tente de novo em instantes.' });
        }

        var texto = (dados.content || [])
            .filter(function (bloco) { return bloco.type === 'text'; })
            .map(function (bloco) { return bloco.text; })
            .join('\n')
            .trim();

        return res.status(200).json({ resposta: texto || 'Desculpa, não consegui pensar numa resposta agora.' });
    } catch (erro) {
        console.error(erro);
        return res.status(500).json({ erro: 'Falha ao falar com o assistente.' });
    }
};