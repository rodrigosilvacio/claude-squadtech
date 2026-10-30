// Roteiro da demonstração (Fase 0): um projeto exemplo encenado do briefing à entrega,
// com os mesmos tipos de evento que a esteira real vai gravar em squad_eventos.
// Os portões são de verdade: a demo para e espera você aprovar ou pedir ajustes.

const fala = (agente, para, texto) => ({ tipo: 'fala', agente, para, texto });
const estado = (agentes, valor, painel) => ({ tipo: 'estado', agente: agentes[0], dados: { agentes, estado: valor, painel } });
const sistema = (texto, dados) => ({ tipo: 'sistema', texto, dados });
const fase = (sala, texto) => ({ tipo: 'fase', sala, texto });
const handoff = (agente, para, artefato, texto) => ({ tipo: 'handoff', agente, para, texto, dados: { artefato } });
const artefato = (dados) => ({ tipo: 'artefato', agente: dados.autor, dados });

export const DEMO = {
  nome: 'Reembolso de Visitas Comerciais',
  slug: 'reembolso-visitas',
  briefing: 'Os vendedores fazem visitas a clientes com carro próprio e hoje pedem reembolso de quilometragem por planilha e WhatsApp. Quero um app web simples onde o vendedor registra a visita (cliente, data, km rodados, observação), o sistema calcula o valor do reembolso e o gestor aprova ou recusa.',
};

const PERGUNTAS = [
  { pergunta: 'Quantos vendedores e gestores vão usar no início?', porque: 'Define login, permissões e volume.', sugestao: '12 vendedores e 2 gestores.' },
  { pergunta: 'Qual o valor pago por km e ele muda com frequência?', porque: 'Decide se o valor fica fixo no código ou configurável.', sugestao: 'R$ 1,20 por km. Muda uma vez por ano.' },
  { pergunta: 'O gestor precisa de algum relatório?', porque: 'Separa o que é MVP do que é fase 2.', sugestao: 'Total do mês por vendedor, com exportação em CSV.' },
  { pergunta: 'Como saberemos que deu certo?', porque: 'Sem métrica de sucesso, não fecho o PRD.', sugestao: 'Zero pedidos por WhatsApp em 30 dias e aprovação em até 2 dias úteis.' },
];

function prd(versao, ajuste) {
  return `# PRD · Reembolso de Visitas Comerciais

**Owner:** Rodrigo Silva · **Versão:** ${versao}${ajuste ? ` · **Ajuste aplicado:** ${ajuste}` : ''}

## Problema
Pedidos de reembolso de km chegam por planilha e WhatsApp, sem padrão, sem histórico e sem trilha de aprovação.

## Usuários
- **Vendedor** (12): registra visitas e acompanha o status do reembolso.
- **Gestor** (2): aprova ou recusa e fecha o mês.

## Objetivos
1. Registro de visita em menos de 1 minuto.
2. Cálculo automático: km × R$ 1,20 (valor configurável pelo gestor).
3. Aprovação com histórico e motivo da recusa.

## Não objetivos
- App mobile nativo (o web responsivo basta).
- Integração com a folha de pagamento.
- Rotas por GPS.

## Métricas de sucesso
| Métrica | Meta |
|---|---|
| Pedidos fora do app | 0 em 30 dias |
| Tempo até a aprovação | ≤ 2 dias úteis |

## Critérios de aceite
- **Dado** um vendedor logado, **quando** registra 35 km, **então** vê o reembolso de R$ 42,00 com status *pendente*.
- **Dado** um gestor, **quando** recusa um pedido, **então** precisa informar o motivo.
- **Dado** o fim do mês, **quando** o gestor exporta, **então** recebe um CSV com o total por vendedor.
`;
}

function arquitetura(versao, ajuste) {
  return `# Arquitetura · Reembolso de Visitas Comerciais

**Versão:** ${versao}${ajuste ? ` · **Ajuste aplicado:** ${ajuste}` : ''} · **Proposta:** Carla · **Revisão:** Diego

## Stack
HTML + CSS + JavaScript (ES modules), sem build. Publicado no GitHub Pages. Dados no Supabase com RLS.

## Telas
1. **Login** (Supabase Auth)
2. **Minhas visitas** (vendedor): formulário + lista com status
3. **Aprovações** (gestor): fila de pendentes, aprovar/recusar, exportar CSV

## Arquivos
\`\`\`
projetos/reembolso-visitas/
├── index.html
├── css/estilo.css
├── js/app.js        telas e eventos
├── js/dados.js      cliente Supabase
└── docs/
\`\`\`

## Modelo de dados
\`\`\`sql
create table public.sq_reembolso_visitas_visitas (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null default auth.uid() references auth.users,
  cliente text not null,
  data date not null,
  km numeric(6,1) not null check (km > 0 and km <= 2000),
  valor numeric(8,2) not null,
  status text not null default 'pendente' check (status in ('pendente','aprovado','recusado')),
  motivo text
);
alter table public.sq_reembolso_visitas_visitas enable row level security;
create policy "vendedor vê as próprias" on public.sq_reembolso_visitas_visitas
  for select using (vendedor_id = auth.uid());
\`\`\`

## Segurança (revisão do Diego)
- Só a chave publishable no front. RLS em todas as tabelas.
- O valor é recalculado no banco (trigger), nunca confiado ao navegador.

## Plano de tarefas
| # | Tarefa | Dev |
|---|---|---|
| 1 | Layout e estilos | Fernanda |
| 2 | Telas e eventos (app.js) | Gabriel |
| 3 | Cliente Supabase (dados.js) | Helena |
| 4 | Login, perfis e integração | Eduardo |
`;
}

const CODIGO = {
  'index.html': `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reembolso de Visitas</title>
  <link rel="stylesheet" href="css/estilo.css">
</head>
<body>
  <main id="app" aria-live="polite"></main>
  <script type="module" src="js/app.js"></script>
</body>
</html>`,
  'css/estilo.css': `:root { --fundo: #f7f7fb; --texto: #1d1d2b; --destaque: #3a86ff; }
body { margin: 0; font-family: Inter, system-ui, sans-serif; background: var(--fundo); color: var(--texto); }
main { max-width: 720px; margin: 0 auto; padding: 16px; }
.cartao { background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px #0001; }`,
  'js/dados.js': `import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.5/+esm';
const supabase = createClient(URL_PROJETO, CHAVE_PUBLISHABLE);

export async function listarVisitas() {
  const { data, error } = await supabase.from('sq_reembolso_visitas_visitas').select('*').order('data', { ascending: false });
  if (error) throw error;
  return data;
}

export async function registrarVisita({ cliente, data, km }) {
  const { error } = await supabase.from('sq_reembolso_visitas_visitas').insert({ cliente, data, km });
  if (error) throw error;
}`,
  'js/app.js': `import { listarVisitas, registrarVisita } from './dados.js';

const real = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function linha(v) {
  const li = document.createElement('li');
  li.textContent = \`\${v.cliente} · \${v.km} km · \${real.format(v.valor)} · \${v.status}\`;
  return li;
}

export async function renderizar() {
  const lista = document.querySelector('#visitas');
  lista.replaceChildren(...(await listarVisitas()).map(linha));
}`,
};

// ---------- roteiro ----------

export function roteiroDemo() {
  return [
    sistema(`Novo projeto: ${DEMO.nome}`),
    artefato({ tipo: 'briefing', titulo: 'Briefing do cliente', autor: null, conteudo: `# Briefing\n\n${DEMO.briefing}` }),
    fase('produto', 'Sala 1 · Produto recebe o briefing'),
    estado(['ana'], 'lendo'),
    fala('ana', 'bruno', 'Chegou o briefing do reembolso de visitas. Li duas vezes: o problema é claro, o escopo ainda não.'),
    fala('bruno', 'ana', 'Quais lacunas você vê antes de falar com o cliente?'),
    fala('ana', 'bruno', 'Não sabemos quantos usuários são, qual o valor por km, nem se o gestor precisa de relatório.'),
    fala('bruno', 'ana', 'Pergunte também a métrica de sucesso. Sem ela eu não fecho o PRD.'),
    estado(['ana'], 'digitando'),
    artefato({ tipo: 'perguntas', titulo: 'Perguntas da Ana', autor: 'ana', conteudo: PERGUNTAS.map((p, i) => `${i + 1}. **${p.pergunta}**  \n_${p.porque}_`).join('\n\n') }),
    fala('ana', 'usuario', 'Tenho 4 perguntas para você antes de seguirmos. Deixei sugestões preenchidas; ajuste o que quiser.'),
    {
      tipo: 'portao', agente: 'ana',
      dados: {
        tipo: 'perguntas', titulo: 'Perguntas da Ana', subtitulo: 'Sala 1 · Produto',
        intro: 'Responda com o máximo de contexto. Se preferir, marque "Decida você" e o squad escolhe o melhor caminho.',
        perguntas: PERGUNTAS,
        continuar: (d) => [
          artefato({ tipo: 'respostas', titulo: 'Suas respostas', autor: null, conteudo: d.respostas.map((r, i) => `${i + 1}. **${r.pergunta}**  \n${r.resposta ?? '_Decisão delegada ao squad_'}`).join('\n\n') }),
          ...etapaPRD(1),
        ],
      },
    },
  ];
}

function etapaPRD(versao, ajuste) {
  return [
    fala('ana', 'bruno', ajuste ? `O cliente pediu ajuste: "${ajuste}". Vamos revisar.` : 'Respostas recebidas. 12 vendedores, 2 gestores, R$ 1,20 por km e a meta é zerar o WhatsApp.'),
    estado(['bruno'], 'digitando'),
    fala('bruno', 'ana', 'Escrevendo o PRD: problema, usuários, objetivos, não objetivos, métricas e critérios de aceite.'),
    fala('ana', 'bruno', 'Faltou um não objetivo: nada de app mobile nativo, o web responsivo resolve.'),
    fala('bruno', 'ana', 'Bem lembrado. Incluí também "sem integração com a folha" para proteger o escopo.'),
    artefato({ tipo: 'prd', titulo: 'PRD', autor: 'bruno', conteudo: prd(versao, ajuste) }),
    fala('bruno', 'usuario', `PRD v${versao} pronto. Preciso da sua aprovação para seguir para a Arquitetura.`),
    {
      tipo: 'portao', agente: 'bruno',
      dados: {
        tipo: 'prd', titulo: `Aprovar PRD (v${versao})`, subtitulo: 'Portão 1 · nada avança sem a sua decisão',
        conteudo: prd(versao, ajuste),
        continuar: (d) => (d.aprovado ? etapaArquitetura(1) : etapaPRD(versao + 1, d.comentario)),
      },
    },
  ];
}

function etapaArquitetura(versao, ajuste) {
  const abertura = versao === 1
    ? [
      fala('bruno', 'ana', 'PRD aprovado! Vou levar para a Arquitetura.'),
      handoff('bruno', 'carla', 'o PRD', 'Carla, aqui está o PRD aprovado. A métrica principal é zerar os pedidos por WhatsApp.'),
      fase('arquitetura', 'Sala 2 · Arquitetura desenha a solução'),
      estado(['carla'], 'lendo'),
    ]
    : [fala('carla', 'diego', `Ajuste do cliente: "${ajuste}". Vou refletir isso na proposta.`)];
  return [
    ...abertura,
    fala('carla', 'diego', 'Proposta: HTML, CSS e JS puros no Pages, dados no Supabase e login pelo Supabase Auth.'),
    fala('diego', 'carla', 'Funciona no Pages. Só a chave publishable no front, certo? Nada de service role.'),
    fala('carla', 'diego', 'Isso. Uma tabela sq_reembolso_visitas_visitas, com RLS por vendedor.'),
    fala('diego', 'carla', 'O valor não pode vir do navegador. Recalcule no banco com trigger, senão alguém edita o reembolso.'),
    fala('carla', 'diego', 'Ótimo ponto. Trigger incluído e o plano dividido em 4 tarefas para o Eduardo.'),
    estado(['carla'], 'digitando'),
    artefato({ tipo: 'arquitetura', titulo: 'Arquitetura e plano', autor: 'carla', conteudo: arquitetura(versao, ajuste) }),
    fala('carla', 'usuario', `Arquitetura v${versao} pronta, com o SQL. Aprova para começarmos o desenvolvimento?`),
    {
      tipo: 'portao', agente: 'carla',
      dados: {
        tipo: 'arquitetura', titulo: `Aprovar arquitetura (v${versao})`, subtitulo: 'Portão 2 · o SQL só é aplicado depois da sua aprovação',
        conteudo: arquitetura(versao, ajuste),
        continuar: (d) => (d.aprovado ? etapaDev() : etapaArquitetura(versao + 1, d.comentario)),
      },
    },
  ];
}

function etapaDev() {
  return [
    handoff('carla', 'eduardo', 'a arquitetura', 'Eduardo, arquitetura aprovada. O plano tem 4 tarefas e o SQL já passou pelo Diego.'),
    fase('desenvolvimento', 'Sala 3 · Desenvolvimento'),
    sistema('Migração aplicada: 1 tabela sq_reembolso_visitas_* com RLS (validada pelo executor seguro)'),
    estado(['eduardo'], 'lendo'),
    { tipo: 'reunir', agente: 'eduardo', dados: { agentes: ['eduardo', 'fernanda', 'gabriel', 'helena'] } },
    fala('eduardo', 'fernanda', 'Time, são 4 tarefas. Fernanda, layout e estilos. Gabriel, telas e eventos. Helena, o cliente Supabase. Eu fico com login e integração.'),
    fala('fernanda', 'eduardo', 'Pego o index.html e o CSS. Mobile primeiro, que vendedor usa no carro.'),
    fala('gabriel', 'eduardo', 'Fico com o app.js: formulário, lista e a fila de aprovação.'),
    fala('helena', 'gabriel', 'Gabriel, vou exportar listarVisitas e registrarVisita. Te passo as assinaturas já.'),
    estado(['fernanda', 'gabriel', 'helena', 'eduardo'], 'digitando'),
    artefato({ tipo: 'arquivo', caminho: 'index.html', titulo: 'index.html', autor: 'fernanda', formato: 'codigo', conteudo: CODIGO['index.html'] }),
    artefato({ tipo: 'arquivo', caminho: 'css/estilo.css', titulo: 'css/estilo.css', autor: 'fernanda', formato: 'codigo', conteudo: CODIGO['css/estilo.css'] }),
    artefato({ tipo: 'arquivo', caminho: 'js/dados.js', titulo: 'js/dados.js', autor: 'helena', formato: 'codigo', conteudo: CODIGO['js/dados.js'] }),
    fala('gabriel', 'helena', 'Recebi. Já estou importando as duas funções.'),
    artefato({ tipo: 'arquivo', caminho: 'js/app.js', titulo: 'js/app.js', autor: 'gabriel', formato: 'codigo', conteudo: CODIGO['js/app.js'] }),
    estado(['eduardo'], 'lendo'),
    fala('eduardo', 'gabriel', 'Integração revisada: imports batem, nada de segredo no código. Vai para Testes.'),
    ...etapaTestes(1),
  ];
}

function etapaTestes(rodada) {
  const vaiAoQA = handoff('eduardo', 'igor', `o código (rodada ${rodada})`, rodada === 1 ? 'Igor, 4 arquivos prontos para teste.' : 'Corrigido: textContent no lugar de innerHTML e ordenação por data.');
  const comum = [
    vaiAoQA,
    fase('testes', `Sala 4 · Testes (rodada ${rodada})`),
    estado(['igor'], 'digitando', 'rodando'),
    estado(['julia'], 'lendo'),
  ];
  if (rodada === 1) {
    return [
      ...comum,
      fala('igor', 'julia', 'Escrevi 6 testes: carrega sem erro, formulário, cálculo de R$ 42,00 para 35 km, lista, recusa com motivo e CSV.'),
      fala('julia', 'igor', 'Revisão de código: sem segredos expostos e RLS ok. Mas achei um innerHTML com o nome do cliente: risco de XSS.'),
      fala('igor', 'julia', '5 de 6 passaram. A lista não está ordenada por data.'),
      { tipo: 'sistema', texto: 'Testes no navegador: 5 de 6 passaram', dados: { painel: 'falha' } },
      artefato({ tipo: 'relatorio_testes', titulo: 'Relatório de testes', autor: 'igor', conteudo: '# Relatório de testes · rodada 1\n\n**Resultado:** reprovado (5/6)\n\n| Teste | Resultado |\n|---|---|\n| Página carrega sem erro no console | ✅ |\n| Formulário registra visita | ✅ |\n| 35 km = R$ 42,00 | ✅ |\n| Lista ordenada por data | ❌ |\n| Recusa exige motivo | ✅ |\n| Exporta CSV | ✅ |\n\n## Revisão de código (Júlia)\n- ❌ `innerHTML` com dado do usuário em app.js (XSS). Trocar por `textContent`.' }),
      handoff('igor', 'eduardo', '2 bugs', 'Eduardo, voltando com 2 bugs: ordenação da lista e um innerHTML inseguro. Detalhes no relatório.'),
      fase('desenvolvimento', 'Sala 3 · Correções (rodada 2)'),
      fala('eduardo', 'gabriel', 'Gabriel, os dois bugs são no app.js. textContent no lugar de innerHTML e ordenar por data.'),
      estado(['gabriel'], 'digitando'),
      fala('gabriel', 'eduardo', 'Corrigido e testado localmente.'),
      ...etapaTestes(2),
    ];
  }
  return [
    ...comum,
    fala('igor', 'julia', 'Rodada 2: 6 de 6 passaram no navegador.'),
    { tipo: 'sistema', texto: 'Testes no navegador: 6 de 6 passaram', dados: { painel: 'ok' } },
    fala('julia', 'igor', 'Revisão de código aprovada. Nenhum innerHTML com dado do usuário.'),
    artefato({ tipo: 'relatorio_testes', titulo: 'Relatório de testes', autor: 'igor', conteudo: '# Relatório de testes · rodada 2\n\n**Resultado:** aprovado (6/6)\n\n| Teste | Resultado |\n|---|---|\n| Página carrega sem erro no console | ✅ |\n| Formulário registra visita | ✅ |\n| 35 km = R$ 42,00 | ✅ |\n| Lista ordenada por data | ✅ |\n| Recusa exige motivo | ✅ |\n| Exporta CSV | ✅ |\n\n## Revisão de código (Júlia)\n- ✅ Sem segredos, sem XSS, RLS em todas as tabelas.' }),
    ...etapaDelivery(),
  ];
}

function etapaDelivery() {
  return [
    handoff('igor', 'lucas', 'o pacote aprovado', 'Lucas, tudo verde. Pode entregar.'),
    fase('delivery', 'Sala 5 · Delivery'),
    estado(['lucas'], 'digitando'),
    fala('lucas', 'usuario', 'Montando a pasta: o app, e em docs/ o README, o PRD, a arquitetura e o relatório de testes.'),
    artefato({ tipo: 'entrega', titulo: 'README da entrega', autor: 'lucas', conteudo: `# ${DEMO.nome}\n\n## Como usar\n1. Abra o link do app no GitHub Pages.\n2. Entre com seu usuário.\n3. Vendedor: registre a visita. Gestor: aprove em *Aprovações*.\n\n## Conteúdo da pasta\n- \`index.html\`, \`css/\`, \`js/\`: o app\n- \`docs/PRD.md\`, \`docs/ARQUITETURA.md\`, \`docs/RELATORIO-TESTES.md\`` }),
    fala('lucas', 'usuario', `Commit feito em projetos/${DEMO.slug}/. O Pages publica em cerca de 1 minuto.`),
    estado(['lucas'], 'livre'),
    {
      tipo: 'fim', agente: 'lucas',
      dados: {
        resumo: 'Demonstração concluída. Na esteira real (a partir da Fase 3), estes links abrem o app publicado e a pasta no GitHub.',
        links: [
          { rotulo: `App: /projetos/${DEMO.slug}/`, nota: 'demonstração: o app não foi gerado de verdade' },
          { rotulo: `Pasta no GitHub: projetos/${DEMO.slug}/`, nota: 'demonstração' },
          { rotulo: 'Download em zip', nota: 'demonstração' },
        ],
        arquivos: `projetos/${DEMO.slug}/\n├── index.html\n├── css/estilo.css\n├── js/app.js\n├── js/dados.js\n└── docs/\n    ├── README.md\n    ├── PRD.md\n    ├── ARQUITETURA.md\n    └── RELATORIO-TESTES.md`,
      },
    },
  ];
}
