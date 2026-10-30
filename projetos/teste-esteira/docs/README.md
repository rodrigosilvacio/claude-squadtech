# Teste da esteira · Controle de presença em workshops

App web para registrar presença nos workshops de IA para executivos.
O participante faz o próprio check-in pelo QR projetado no telão, e o dono pode marcar manualmente pelo celular.
Mostra faltantes, taxa de presença, histórico por participante e exporta CSV.

> Projeto de teste da esteira do SquadTech. Pode apagar quando terminar.

## Acesso

- Área do dono: https://rodrigosilvacio.github.io/claude-squadtech/projetos/teste-esteira/
- Página pública de check-in: `checkin.html?s=...&t=...` (o link sai pronto no botão **Projetar QR**; não precisa montar à mão)

## Como entrar

- Use a mesma conta do SquadTech: e-mail e senha do Supabase do Rodrigo.
- **Esqueci minha senha:** na tela de login, digite o e-mail e toque em "Esqueci minha senha". Chega um link por e-mail; ao abrir, o app mostra o campo de nova senha (mínimo 8 caracteres).
- **Outras pessoas:** esta versão tem um único administrador. Se alguém criar outra conta no mesmo projeto Supabase (painel do Supabase > Authentication > Add user), ela entra no app, mas vê uma área vazia: cada conta só enxerga os próprios workshops. Não há acesso de equipe.
- O participante não tem conta: usa só a página pública do QR.

## Como usar

### Dono do workshop

1. **Criar o workshop:** em Workshops, informe nome e data. Dentro dele, crie as sessões (nome, data e hora).
2. **Inscritos:** abra "Inscritos", baixe o modelo CSV, preencha `nome,email,empresa` (vírgula ou ponto e vírgula, UTF-8) e importe. O relatório mostra inseridos, atualizados e rejeitados com número da linha. Também dá para adicionar um por um.
3. **No dia:** abra a sessão. Você vê a lista em ordem alfabética, a busca e o contador "Presentes X de Y".
4. **Projetar QR:** toque em "Projetar QR" e leve a tela para o projetor. Mantenha uma tela do dono aberta (a de check-in ou a do QR): é ela que processa os check-ins (ver Limitações).
5. **Check-in manual:** busque a pessoa e toque em marcar. Para corrigir, desfaça (vale também para check-ins por QR). Quem chegou sem inscrição pode ser adicionado ali mesmo.
6. **Novo QR:** se suspeitar que o QR foi repassado, gere um novo token. O QR antigo para de funcionar.
7. **Encerrar:** ao fim, encerre a sessão. Quem ficou sem check-in vira faltante e o QR para de aceitar. Dá para reabrir para corrigir.
8. **Faltantes:** veja a lista com link de e-mail por pessoa e um link com todos em cópia oculta (Cco).
9. **Fechar a turma:** na tela do workshop, veja a taxa de presença (só sessões encerradas) e exporte o CSV para o Excel.
10. **Histórico e exclusão:** abra um participante para ver presenças e ausências em todos os workshops, ou excluí-lo com todos os registros.

### Participante

1. Ler o QR do telão com a câmera do celular.
2. Digitar o e-mail da inscrição e tocar em "Confirmar presença".
3. Ver uma das mensagens: "Presença confirmada", "Sua presença já estava registrada", "Não encontramos sua inscrição nesta sessão. Procure o organizador." ou "Check-in encerrado para esta sessão". Se ninguém responder em 20 s: "Recebemos seu pedido, confira com o organizador".

## Situação dos testes

**6 de 8 testes automáticos passaram** no navegador, em 3 rodadas de QA.

| Teste | Resultado |
|---|---|
| Páginas carregam sem erro (index e checkin) | passou |
| Sem login só aparece o login (RF1) | passou |
| Página pública sem token mostra encerrado; e-mail inválido sem dados pessoais (RF15) | passou |
| Criar workshop, adicionar e excluir inscrito (RF2, RF5, RF13) | passou |
| Marcar e desfazer presença manual (RF6, RF7) | **falhou** |
| Encerrar sessão e ver faltantes (RF8, RF9) | **falhou** |

Os dois que falharam pararam no mesmo ponto: depois de adicionar um inscrito na tela de check-in, o contador não mostrou "Presentes 0 de 1". O QA identificou uma condição de corrida na atualização automática e aplicou correção, mas o reteste automático não confirmou. **Confira à mão antes de usar numa turma real:** adicione um inscrito na tela da sessão e veja se ele aparece e o contador sobe. Se não aparecer, recarregar a página resolve.

O fluxo do QR (o coração do app) não tem teste automático: depende de dois dispositivos e câmera. Faça o roteiro abaixo.

Detalhes em `docs/RELATORIO-TESTES.md`.

### Roteiro de teste manual

- [ ] Adicionar inscrito na tela da sessão e ver "Presentes 0 de 1"; marcar, desfazer e marcar de novo (horário da última marcação).
- [ ] Encerrar uma sessão e ver os faltantes com mailto individual e em Cco.
- [ ] RF14: Projetar QR, ler com o celular e abrir a página de check-in; QR ocupa 60% da altura.
- [ ] RF15: com a tela do dono aberta, confirmar com e-mail em maiúsculas e espaços: "Presença confirmada", sem nome, origem QR, em menos de 30 s.
- [ ] RF15: repetir e ver "Sua presença já estava registrada" com o horário original; e-mail não inscrito mostra a mensagem do organizador.
- [ ] RF14/RF8: gerar novo QR ou encerrar e usar o QR antigo: "Check-in encerrado para esta sessão", nada gravado.
- [ ] RF16: check-in pelo QR aparece na tela do dono e no telão em até 5 s, sem recarregar.
- [ ] Sem tela do dono aberta, o participante vê "Recebemos seu pedido, confira com o organizador" após 20 s.
- [ ] RF3/RF4: importar CSV de 40 linhas (2 inválidas, 1 existente): 37/1/2 com número da linha; repetir com ponto e vírgula.
- [ ] RF10: 20 inscritos, 2 sessões encerradas e 34 check-ins mostram 85%.
- [ ] RF11: participante em 2 workshops mostra cada sessão presente ou ausente.
- [ ] RF12: CSV abre no Excel com acentos, uma linha por inscrito por sessão e coluna origem.
- [ ] Esqueci minha senha: receber o e-mail, definir nova senha e entrar.
- [ ] Segurança: com outro usuário e sem login, consultar as tabelas direto e receber zero registros ou erro.
- [ ] Limpeza: excluir os workshops "Check-in ..." e "Faltas ..." criados pelos testes automáticos.

## Onde ficam os dados e LGPD

- Banco no Supabase do Rodrigo, tabelas com prefixo `sq_teste_esteira_9f79_` (workshops, sessões, participantes, inscrições, presenças e pedidos de check-in). RLS ativa em todas.
- Só a conta do dono lê os dados. O navegador usa apenas a chave publishable; não há segredo no repositório.
- Sem login, só é possível enviar um pedido de check-in e ler o status do próprio pedido. A página pública nunca mostra nome, empresa ou lista de inscritos.
- Base legal: execução do contrato do workshop. Coleta mínima: nome, e-mail e empresa.
- **Pedido de exclusão do titular:** abra o participante e exclua; somem as presenças, taxas e exportações.
- **Retenção:** pedidos de check-in são apagados ao encerrar a sessão e, os que sobrarem, após 1 dia. Os demais dados ficam enquanto o histórico for útil. Uma vez por ano, exclua quem não participa há 24 meses (manual; coloque um lembrete na agenda).
- O CSV exportado tem dados pessoais: guarde com o mesmo cuidado.

## Limitações e pendências conhecidas

- **Check-in por QR depende de uma tela do dono aberta.** O executor de banco não aceita funções, então não há RPC: a página pública deixa um pedido e uma tela logada do dono o processa a cada 2 s. Sem tela aberta, o participante vê a mensagem de contingência e nada é gravado. Adaptação aprovada na arquitetura; mantenha o celular ou o telão com o app aberto.
- **Atualização da lista após adicionar inscrito:** ver Situação dos testes. Correção aplicada, ainda sem confirmação automática.
- **Oscilação de rede no celular do participante** pode aparecer como "Check-in encerrado" em vez de "Tente de novo". Se acontecer, peça para tentar de novo ou marque manualmente.
- **Encerrar a sessão no exato momento de um check-in** pode deixar esse participante sem resposta (vê a mensagem de contingência). Confira o contador antes de encerrar.
- **Sem prova de presença física:** alguém pode repassar o QR ou digitar o e-mail de um colega. Mitigação: gerar novo QR, conferir o contador com a sala e desfazer o que estiver errado.
- **Descoberta de inscritos:** quem tiver o QR pode testar e-mails e saber se estão inscritos pela resposta. Risco aceito no PRD.
- **Sem limite de envios no banco:** quem tiver o QR pode enviar muitos pedidos. Baixo risco com público restrito.
- Melhorias sugeridas pela revisão e não feitas: lista redesenhada a cada 2 s (atrapalha leitor de tela), aviso neutro aparece verde como sucesso, critério de pedido travado por horário de criação.
- Precisa de internet no local, para o dono e para os participantes. Leve o CSV exportado como contingência em papel.
- Links mailto com muitos destinatários podem falhar em alguns clientes de e-mail (baixo risco com até 40 pessoas).

## Fica para depois

- Acesso de equipe com papéis.
- QR rotativo ou validação de presença física.
- Modo offline (PWA com sincronização).
- Inscrito em só algumas sessões.
- Envio automático de e-mail aos faltantes e certificados.
- Painel anual consolidado.
- Exclusão automática por prazo de retenção.

## Estrutura da pasta

```
index.html               área do dono (rotas por hash)
checkin.html             página pública do QR
css/estilo.css           estilos (celular primeiro, tela de projetor)
js/config.js             URL e chave publishable do Supabase
js/supabase.js           clientes Supabase e autenticação
js/app.js                roteador, login e processador dos check-ins por QR
js/dados.js              acesso ao banco, taxa, histórico e exportação
js/csv.js                importação e geração de CSV
js/processador-qr.js     valida e grava os pedidos de check-in
js/telas-workshops.js    login, workshops e inscritos
js/telas-sessao.js       check-in, QR e faltantes
js/telas-participante.js histórico do participante
js/checkin-publico.js    lógica da página pública
docs/PRD.md              requisitos
docs/ARQUITETURA.md      arquitetura e banco
docs/RELATORIO-TESTES.md resultado dos testes
```
