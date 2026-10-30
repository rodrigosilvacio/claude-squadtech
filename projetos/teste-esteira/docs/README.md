# Controle de presença em workshops (teste da esteira)

App web para registrar presença nos workshops de IA para executivos, sem papel.
O participante faz o próprio check-in lendo o QR projetado no telão, e o dono também pode marcar manualmente pelo celular.
Mostra faltantes, taxa de presença, histórico por participante e exporta CSV pronto para o Excel.

## Link de acesso

- Área do dono: https://rodrigosilvacio.github.io/claude-squadtech/projetos/teste-esteira/
- Página pública de check-in: aberta só pelo QR da sessão (`checkin.html?sessao=...&token=...`). Não precisa divulgar esse link.

## Como usar

### Dono do workshop (único administrador)

**Antes do workshop**
1. Entre com seu e-mail e senha (conta criada no Supabase Auth).
2. Em **Workshops**, crie a turma (nome e data) e cadastre as sessões (nome, data e hora de início).
3. Abra **Inscritos**, baixe o **modelo CSV**, preencha a partir da sua planilha (colunas `nome,email,empresa`, vírgula ou ponto e vírgula, UTF-8) e importe.
4. Confira o relatório: inseridos, atualizados e rejeitados (com número da linha e motivo). Corrija as rejeitadas e importe de novo, se quiser.

**No dia**
1. Abra a sessão. Você vê a lista em ordem alfabética, a busca e o contador "presentes X de Y".
2. Toque em **Projetar QR** e coloque essa tela no projetor. O QR ocupa a maior parte da tela, com a URL e o contador.
3. **Importante:** mantenha uma tela sua logada aberta durante todo o check-in (a do QR já serve). É ela que processa os check-ins feitos pelo QR (ver Limitações).
4. Quem não conseguir usar o QR: busque o nome e toque em marcar. Quem não estiver na lista: use **Adicionar** na própria tela de check-in.
5. Errou? Toque em desfazer (vale também para check-ins feitos por QR).
6. Desconfia de QR repassado? Use **Novo token**: o QR antigo para de funcionar na hora e o novo aparece no telão.
7. Ao final, toque em **Encerrar sessão**. Quem ficou sem check-in vira faltante e o QR deixa de aceitar check-ins. Se precisar corrigir, **Reabrir** reativa o QR.

**Depois**
1. **Faltantes**: veja nome e empresa, com link de e-mail por pessoa e um link com todos em cópia oculta (Cco). O e-mail abre no seu cliente de e-mail, o envio é seu.
2. **Workshop**: veja a taxa de presença (só sessões encerradas) e o detalhe por sessão.
3. **Exportar CSV**: uma linha por inscrito por sessão, com status, horário e origem (QR ou manual). Abre direto no Excel com acentos corretos.
4. **Participante**: clique no nome para ver o histórico em todos os workshops.
5. Pedido de exclusão de um titular: em Inscritos, exclua o participante e confirme. Some tudo dele, inclusive presenças.

### Participante
1. Aponte a câmera do celular para o QR no telão.
2. Digite o e-mail da inscrição e toque em **Confirmar presença**.
3. Mensagens possíveis:
   - "Presença confirmada"
   - "Sua presença já estava registrada"
   - "Não encontramos sua inscrição nesta sessão. Procure o organizador."
   - "Check-in encerrado para esta sessão"
   - "Recebemos seu pedido, confira com o organizador" (aparece se nenhuma tela do dono responder em 20 s)

Não precisa de conta. A página não mostra nome nem dados de ninguém.

## Como testar os critérios principais

Use dois celulares (ou um celular e um notebook): um logado como dono, outro como participante.

| O que testar | Como | Resultado esperado |
|---|---|---|
| Login obrigatório | Abra o link numa aba anônima | Só a tela de login |
| Importação | CSV com 40 linhas, 2 e-mails inválidos e 1 já cadastrado | 37 inseridos, 1 atualizado, 2 rejeitados com linha |
| Ponto e vírgula | Importe um CSV separado por `;` | Campos lidos corretamente |
| Check-in manual | Busque um nome e marque | Presente, origem manual, contador +1, em menos de 10 s |
| Desfazer | Desfaça uma marcação e marque de novo | Volta a ausente; depois vale o novo horário |
| QR | Projetar QR, ler com a câmera, digitar e-mail com maiúsculas e espaços | "Presença confirmada" e em até 5 s aparece na tela do dono com origem QR |
| QR repetido | Confirme de novo com o mesmo e-mail | "Sua presença já estava registrada", horário original mantido |
| Não inscrito | Use um e-mail fora da lista | Mensagem para procurar o organizador, nada gravado |
| Novo token | Gere novo token e use o QR antigo (foto) | "Check-in encerrado para esta sessão" |
| Sessão encerrada | Encerre e use o QR | "Check-in encerrado para esta sessão" |
| Faltantes | Encerre uma sessão com ausentes | Lista dos ausentes, mailto por pessoa e Cco com todos |
| Taxa | 20 inscritos, 2 sessões encerradas, 34 check-ins | 85% |
| Exportação | Exporte e abra no Excel | Acentos corretos, origem preenchida nos presentes |
| Exclusão | Exclua um participante com presenças | Some de listas, taxas e CSV |
| Sem tela do dono | Feche todas as telas do dono e faça check-in pelo QR | Após 20 s, "Recebemos seu pedido...", nada gravado em presenças |

O resultado dos testes do squad está em `docs/RELATORIO-TESTES.md`.

## Onde ficam os dados e LGPD

- Dados no Supabase (Postgres), em tabelas com prefixo `sq_teste_esteira_9f79_` e RLS ativa em todas.
- Só a conta do dono lê e altera os dados. Outro usuário logado no mesmo projeto não vê nada.
- O visitante anônimo (página pública) só consegue registrar um pedido de check-in e ler o status do próprio pedido. Não lê inscritos, sessões nem tokens.
- No navegador só existe a chave publishable. Nenhum segredo no repositório.
- Coleta mínima: nome, e-mail e empresa. Base legal: execução do contrato do workshop.
- Pedidos de check-in (e-mail digitado no QR) são apagados ao encerrar a sessão e, por garantia, os com mais de 1 dia somem quando o dono abre o app.
- Exclusão a pedido do titular: tela Inscritos, excluir participante.
- Retenção: uma vez por ano, revise e exclua participantes sem workshop nos últimos 24 meses. Coloque um lembrete na agenda, não é automático.
- O CSV exportado contém dados pessoais: guarde com o mesmo cuidado.

## Limitações conhecidas

- **Check-in por QR depende de uma tela do dono aberta.** Por limitação do ambiente (sem funções no banco), quem valida e grava o check-in é o navegador do dono. Sem tela logada aberta, o participante recebe a mensagem de contingência e precisa ser marcado à mão. Essa adaptação do RF15 precisa do seu aval.
- A atualização automática é por consulta a cada 2 s, não instantânea.
- Não há prova de presença física: alguém pode repassar foto do QR ou digitar o e-mail de um colega. Mitigação: novo token, origem registrada e conferir o contador com a sala.
- Quem tiver o QR consegue testar se um e-mail está inscrito (pela mensagem). Risco aceito no PRD.
- Precisa de internet no local, para dono e participantes. Leve o CSV exportado como contingência.
- E-mails com grafias diferentes (ex.: apelido) viram participantes diferentes.
- Link com todos em Cco pode falhar em alguns clientes de e-mail com muitos destinatários (baixo risco até 40 pessoas).
- Um único administrador.

## Fica para depois (backlog)

- Acesso de equipe com papéis.
- QR rotativo ou validação de presença física.
- Modo offline.
- Inscrito em só algumas sessões.
- Envio automático de e-mail aos faltantes e certificados.
- Painel anual consolidado.
- Exclusão automática por prazo de retenção.
- Check-in por QR sem depender da tela do dono (quando houver função no banco).

## Estrutura da pasta

```
teste-esteira/
├── index.html               área do dono (rotas por hash)
├── checkin.html             página pública do QR
├── css/estilo.css           estilos (celular, desktop e projetor)
├── js/
│   ├── app.js               roteador, guarda de login, processador global
│   ├── supabase.js          clientes do dono e público, login
│   ├── dados.js             acesso a dados, taxa, histórico, exportação
│   ├── csv.js               importação e exportação de CSV
│   ├── telas-workshops.js   login, workshops, inscritos
│   ├── telas-sessao.js      check-in, QR, faltantes
│   ├── telas-participante.js histórico
│   ├── processador-qr.js    processamento dos check-ins por QR
│   └── checkin-publico.js   lógica da página pública
└── docs/
    ├── PRD.md
    ├── ARQUITETURA.md
    └── RELATORIO-TESTES.md
```
