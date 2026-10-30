# PRD · Teste da esteira: controle de presença em workshops

Owner: Rodrigo Silva · Versão 3.1 · Data: 30/10/2026

## 1. Resumo executivo
App web estático para registrar a presença nos workshops de IA para executivos: o participante faz o próprio check-in pelo QR da sessão projetado no telão, e o dono também pode marcar manualmente pelo celular.
Substitui a lista em papel e a digitação posterior na planilha, com faltantes, taxa de presença, histórico e exportação CSV.
Projeto tratado como teste da esteira do SquadTech: escopo mínimo, um único administrador, GitHub Pages + Supabase.

## 2. Contexto e problema
Hoje o dono marca presença em papel e depois transcreve para uma planilha. Isso gera retrabalho, erro de digitação, fila na chegada e demora para saber quem faltou e contatar faltantes. Não há histórico consolidado por participante entre workshops.

## 3. Usuários e jobs to be done
| Usuário | Job to be done |
|---|---|
| Dono do workshop (único administrador) | Quando a sessão começa, quero projetar um QR no telão, para os participantes fazerem o próprio check-in sem fila. |
| Dono do workshop | Quando alguém não consegue usar o QR, quero marcar presença em segundos no celular. |
| Dono do workshop | Antes do workshop, quero importar os inscritos da minha planilha, para não digitar de novo. |
| Dono do workshop | Depois da sessão, quero ver e contatar os faltantes, para dar seguimento. |
| Dono do workshop | Ao fechar uma turma, quero a taxa de presença e um CSV completo, para não refazer planilha. |
| Participante | Quando chego, quero ler o QR e confirmar minha presença com meu e-mail em poucos segundos, sem criar conta. |
| Participante (titular de dados) | Ter seus dados tratados só para o workshop e poder pedir exclusão. |

## 4. Objetivos e não objetivos
**Objetivos**
- Check-in de uma turma inteira sem papel, por QR (autoatendimento) ou manual pelo dono.
- Lista de faltantes por sessão com contato por e-mail (mailto).
- Taxa de presença por turma e histórico simples por participante.
- Exportação CSV da lista completa.

**Não objetivos**
- Acesso de equipe ou múltiplos administradores (fase futura).
- Conta, login ou área do participante. A página de check-in por QR é a única página pública e só registra presença.
- Prova de presença física (geolocalização, selfie, QR que muda a cada segundo).
- Modo offline.
- Envio automático de e-mail ou WhatsApp (exige segredo no servidor; usamos link mailto).
- Backend próprio, app nativo ou integração direta com Google Sheets.
- Certificados, pagamentos ou inscrição online.

## 5. Métricas de sucesso
| Métrica | Meta |
|---|---|
| Turma com check-in feito 100% no app | 1 turma completa sem papel |
| Check-ins feitos pelo QR | pelo menos 80% da turma |
| Tempo do participante (ler QR, digitar e-mail, confirmar) | menos de 30 segundos |
| Tempo por check-in manual (abrir lista, buscar, marcar) | menos de 10 segundos por pessoa |
| CSV exportado usado sem ajuste manual | 0 retrabalho na planilha |
| Linhas válidas importadas do CSV | 100% (inválidas listadas no relatório) |

## 6. Requisitos funcionais
- **RF1 · Login:** o dono entra com e-mail via Supabase Auth (link mágico ou senha). Sem login, nenhuma tela de dados é exibida. A única página pública é a de check-in por QR (RF15), que não exibe dados de inscritos.
- **RF2 · Workshops:** o dono cria, edita e exclui workshops (turmas) com nome e data. Cada workshop tem uma ou mais sessões (nome, data e hora de início).
- **RF3 · Importar inscritos:** na tela "Inscritos" do workshop, o dono baixa um modelo CSV e importa arquivo UTF-8, separado por vírgula ou ponto e vírgula, com cabeçalho nome,email,empresa. O separador é detectado automaticamente.
- **RF4 · Regras de importação:** o e-mail (normalizado em minúsculas e sem espaços) é a chave do participante. E-mail já existente atualiza nome e empresa. Linha sem e-mail válido é rejeitada. Ao final aparece um relatório: inseridos, atualizados, rejeitados (com número da linha e motivo).
- **RF5 · Adicionar na hora:** o dono adiciona um inscrito manualmente (nome e e-mail obrigatórios, empresa opcional), inclusive na tela de check-in.
- **RF6 · Tela de check-in:** ao abrir uma sessão, o dono vê a lista de inscritos em ordem alfabética, com busca por nome, e-mail ou empresa, contador "presentes X de Y" e botão grande de marcar presença por pessoa. Cada presença mostra a origem (QR ou manual).
- **RF7 · Marcar e desfazer:** marcar registra presença com data e hora do servidor e origem "manual". O dono pode desfazer qualquer marcação, inclusive as feitas por QR. Se marcar de novo, vale o horário do último check-in.
- **RF8 · Encerrar sessão:** o dono encerra a sessão. Quem está sem check-in passa a ser faltante e o QR da sessão deixa de aceitar check-ins. O dono pode reabrir a sessão para corrigir, o que reativa o QR.
- **RF9 · Faltantes:** tela "Faltantes" por sessão encerrada, com nome, empresa e link mailto por pessoa, além de um link mailto com todos os faltantes em cópia oculta (Cco).
- **RF10 · Taxa de presença:** na tela do workshop, taxa = check-ins ÷ (inscritos × sessões), em %, com o detalhe por sessão. Considera só sessões encerradas.
- **RF11 · Histórico do participante:** tela do participante lista os workshops e sessões em que esteve inscrito, com status presente (horário e origem) ou ausente.
- **RF12 · Exportar CSV:** o dono exporta o CSV completo do workshop (UTF-8 com BOM, separador ponto e vírgula): nome, email, empresa, sessão, data da sessão, status, horário do check-in, origem (QR ou manual).
- **RF13 · Excluir participante:** o dono exclui um participante e todos os seus registros de presença, com confirmação explícita.
- **RF14 · QR da sessão no telão:** na sessão aberta, o botão "Projetar QR" abre uma tela cheia com o QR (mínimo 60% da altura da tela), nome da sessão, a URL curta por extenso e o contador "presentes X de Y". O QR aponta para a página pública com o id da sessão e um token aleatório (mínimo 128 bits) gerado ao criar a sessão. O dono pode gerar um novo token, o que invalida o QR anterior.
- **RF15 · Check-in pelo participante:** a página pública pede só o e-mail e tem o botão "Confirmar presença". O registro é feito por uma função no Supabase (RPC) que valida token, sessão aberta e e-mail inscrito no workshop, e grava presença com horário do servidor e origem "QR". Respostas: "Presença confirmada"; "Sua presença já estava registrada" (mantém o horário original); "Não encontramos sua inscrição nesta sessão. Procure o organizador."; "Check-in encerrado para esta sessão". A página não exibe nome, empresa nem qualquer dado do inscrito, e não lista nem sugere inscritos.
- **RF16 · Atualização automática:** a tela de check-in do dono e a tela do QR atualizam presenças e contador em até 5 segundos após um check-in por QR, sem recarregar a página.

## 7. Requisitos não funcionais
- **Stack:** HTML, CSS e JavaScript (ES modules) sem build, no GitHub Pages. Supabase JS e biblioteca de geração de QR via CDN com versão fixa.
- **Segurança:** RLS ativa em todas as tabelas, com acesso restrito a auth.uid() do dono. O papel anônimo não lê nem grava nenhuma tabela: só pode executar a função de check-in (RF15), que grava um único registro e devolve apenas o status (sem nome ou outro dado pessoal). Só a chave publishable no front. Nenhum segredo no repositório. O token do QR fica fora do alcance do papel anônimo.
- **LGPD:** base legal é execução do contrato do workshop. Coleta mínima (nome, e-mail, empresa). Só o dono acessa os dados. A página pública não exibe dados de terceiros. Retenção: dados mantidos enquanto o dono usar o histórico, com exclusão sob pedido do titular (RF13) e revisão anual (ver Premissas).
- **Acessibilidade:** contraste AA, botões de check-in com área mínima de 44x44 px, navegação por teclado, rótulos em campos e campo de e-mail com teclado de e-mail no celular.
- **Responsivo:** pensado primeiro para celular (360 px), funcional no desktop. A tela do QR é pensada para projetor (16:9).
- **Desempenho:** lista de 40 inscritos carrega em até 2 segundos em 4G. Marcação manual reflete na tela em até 1 segundo. Página pública carrega em até 2 segundos em 4G e suporta 40 check-ins simultâneos.
- **Volume:** até 40 inscritos por turma e 50 workshops por ano.

## 8. Critérios de aceite
- **RF1:** Dado que não estou logado, quando abro qualquer URL do app exceto a de check-in por QR, então vejo só a tela de login.
- **RF1/Segurança:** Dado outro usuário autenticado no mesmo projeto, quando consulta as tabelas, então não recebe nenhum registro do dono.
- **Segurança:** Dado um usuário anônimo com a chave publishable, quando tenta ler ou gravar as tabelas diretamente, então recebe zero registros ou erro de permissão.
- **RF3/RF4:** Dado um CSV com 40 linhas, 2 com e-mail inválido e 1 com e-mail já cadastrado, quando importo, então vejo 37 inseridos, 1 atualizado e 2 rejeitados com número da linha.
- **RF3:** Dado um CSV separado por ponto e vírgula, quando importo, então os campos são lidos corretamente.
- **RF5:** Dado que estou na tela de check-in, quando adiciono um participante com nome e e-mail, então ele aparece na lista e pode receber check-in.
- **RF6/RF7:** Dado uma sessão aberta, quando busco um nome e toco em marcar, então a pessoa fica como presente com o horário e origem manual, e o contador sobe 1, em menos de 10 segundos no total.
- **RF7:** Dado um check-in feito por engano (manual ou QR), quando desfaço, então a pessoa volta a ausente e o contador desce 1. Se marcar de novo, o horário exibido é o da última marcação.
- **RF8/RF9:** Dado uma sessão com 30 presentes de 35, quando encerro, então a tela Faltantes mostra os 5 ausentes com link mailto cada um e um link com todos em Cco.
- **RF10:** Dado um workshop com 20 inscritos, 2 sessões encerradas e 34 check-ins, então a taxa exibida é 85%.
- **RF11:** Dado um participante inscrito em 2 workshops, quando abro o histórico, então vejo cada sessão com presente ou ausente.
- **RF12:** Dado um workshop com sessões, quando exporto, então o CSV abre no Excel com acentos corretos, uma linha por inscrito por sessão e a coluna origem preenchida para os presentes.
- **RF13:** Dado um participante com presenças, quando confirmo a exclusão, então ele e seus registros somem de listas, taxas e exportações.
- **RF14:** Dado uma sessão aberta, quando toco em "Projetar QR", então vejo o QR em tela cheia e, ao lê-lo com a câmera do celular, abre a página de check-in da sessão.
- **RF14:** Dado que gerei um novo token, quando alguém usa o QR antigo, então vê "Check-in encerrado para esta sessão" e nada é gravado.
- **RF15:** Dado um inscrito na sessão aberta, quando digita seu e-mail (com maiúsculas ou espaços) e confirma, então vê "Presença confirmada", sem nome nem outro dado pessoal, e fica presente com origem QR, em menos de 30 segundos no total.
- **RF15:** Dado um inscrito já presente, quando confirma de novo, então vê "Sua presença já estava registrada" e o horário original não muda.
- **RF15:** Dado um e-mail não inscrito no workshop, quando confirma, então vê a mensagem para procurar o organizador e nada é gravado.
- **RF15/RF8:** Dado uma sessão encerrada, quando alguém usa o QR dela, então vê "Check-in encerrado para esta sessão" e nada é gravado.
- **RF16:** Dado que a tela de check-in do dono está aberta, quando um participante confirma pelo QR, então em até 5 segundos ele aparece como presente e o contador sobe 1, sem recarregar.

## 9. Premissas assumidas
- Projeto tratado como teste da esteira (decisão delegada): escopo mínimo, sem equipe.
- Métricas de sucesso definidas pelo squad (delegado), conforme seção 5.
- Só o dono administra, com uma conta no Supabase Auth. O participante só usa a página pública de check-in, sem conta.
- O participante se identifica pelo e-mail da inscrição. Não há verificação de presença física: o QR no telão e o token por sessão são a barreira, e o dono revisa e desfaz o que estiver errado.
- A confirmação pública não mostra o nome do participante (decisão do squad para não expor dados de inscritos a quem tiver o QR).
- Retenção (decisão do squad): os dados ficam guardados enquanto o dono usar o histórico de presença. O titular pode pedir exclusão a qualquer momento e o dono a executa pelo RF13. Uma vez por ano o dono revisa e exclui participantes sem workshop nos últimos 24 meses.
- Um único QR por sessão, válido enquanto a sessão estiver aberta.
- Todo inscrito em um workshop é esperado em todas as sessões dele.
- Faltante é quem não tem check-in quando o dono encerra a sessão.
- O participante é único por e-mail entre workshops, o que permite o histórico.
- Há conexão de internet no local do workshop, para o dono e para os participantes.

## 10. Riscos e dependências
- **Sem internet no local:** check-in fica impossível. Mitigação: testar o local antes e ter o CSV exportado como contingência em papel.
- **Check-in de quem não está na sala:** alguém pode fotografar o QR e repassar, ou digitar o e-mail de um colega. Mitigação: QR só vale com a sessão aberta, novo token a qualquer momento, origem registrada e conferência do contador com a sala.
- **Descoberta de inscritos:** quem tiver o QR pode testar e-mails e saber se estão inscritos, pela diferença entre as respostas. O nome não é exposto, pois a confirmação não mostra o primeiro nome (RF15). Com token secreto por sessão e público restrito, o risco é baixo e aceito nesta versão.
- **Participante com e-mail diferente do cadastrado:** cai na mensagem para procurar o organizador. Mitigação: check-in manual e cadastro na hora (RF5).
- **Fila na chegada:** reduzida pelo QR. Mitigação extra: check-in manual com meta de menos de 10 s.
- **CSV fora do padrão** (encoding, colunas trocadas): mitigado com modelo para baixar e relatório de rejeições.
- **E-mails duplicados com grafia diferente:** normalização em minúsculas reduz, mas não elimina.
- **Revisão anual de retenção esquecida:** dados podem ficar além do necessário. Mitigação: lembrete na agenda do dono; exclusão automática fica no backlog.
- **Dependências:** projeto Supabase (plano gratuito, incluindo Realtime ou consulta periódica para RF16), GitHub Pages, CDN do supabase-js e da biblioteca de QR, projetor no local.
- **Limite de mailto:** muitos destinatários podem estourar o tamanho da URL em alguns clientes de e-mail. Com até 40 pessoas, o risco é baixo.

## 11. Fora desta versão (backlog)
- Acesso de equipe com papéis (marcar presença por outra pessoa).
- QR rotativo ou validação de presença física (geolocalização, código falado na sala).
- Modo offline (PWA com sincronização).
- Inscrito em apenas algumas sessões do workshop.
- Envio automático de e-mail aos faltantes e certificados de presença.
- Painel consolidado anual de presença.
- Exclusão automática de participantes inativos por prazo de retenção.
