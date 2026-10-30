# Relatório de testes · Teste da esteira (pode apagar)

**Situação:** 6 de 8 testes automáticos passando no navegador, em 3 rodadas de QA.

## Testes automáticos no navegador (Igor)

| Teste | Resultado |
|---|---|
| C1 · index.html carrega sem erros | passou |
| C2 · checkin.html carrega sem erros | passou |
| T1 · RF1: sem login só aparece a tela de login | passou |
| T2 · RF15: página pública sem sessão ou token mostra encerrado | passou |
| T3 · RF15: e-mail inválido na página pública e sem dados pessoais | passou |
| T4 · RF2/RF5/RF13: criar workshop, adicionar e excluir inscrito | passou |
| T5 · RF6/RF7: marcar e desfazer presença manual | falhou no passo 13: O texto "Presentes 0 de 1" não apareceu na tela. |
| T6 · RF8/RF9: encerrar sessão e ver faltantes | falhou no passo 13: O texto "Presentes 0 de 1" não apareceu na tela. |

## Pendências

- Nenhuma.

## Correções feitas pelo QA

- **js/telas-workshops.js**: O login é por senha, mas não existe o fluxo Esqueci minha senha exigido pelas regras do app: não há resetPasswordForEmail, nem tratamento do evento PASSWORD_RECOVERY, nem formulário com updateUser. Se o dono esquecer a senha, fica sem acesso aos dados. _Correção:_ Em telaLogin, adicionar o botão #login-esqueci (type=button). Ele valida o e-mail e chama supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }), mostrando uma mensagem neutra. Em app.js, no onAuthStateChange, tratar 'PASSWORD_RECOVERY': parar o roteamento normal e montar em #app um form com #nova-senha-campo (label, type=password, autocomplete=new-password, mínimo 8) e #nova-senha-salvar. Ele chama supabase.auth.updateUser({ password }), trata o erro com mensagem amigável e depois navega para #/workshops. Garantir que o rotear não troque o hash de recuperação antes de o Supabase processá-lo.
- **js/telas-sessao.js**: Condição de corrida em recarregar(). A consulta periódica, recarregar(false), guarda a lista estado.inscritos (ainda vazia) antes dos awaits. Ao adicionar um participante, recarregar(true) traz [Bruno], mas a consulta de 2 s que já estava em voo termina depois e grava a lista antiga em estado.inscritos. Como as próximas consultas não são completas, a lista fica vazia para sempre: o contador mostra 'Presentes 0 de 0' e a tela diz 'Nenhum inscrito neste workshop ainda.'. O mesmo acontece com quem for adicionado por outra tela durante a sessão. _Correção:_ Criar um contador de versão: let seq = 0; no início de recarregar, const minha = ++seq; depois dos awaits, se minha !== seq, descartar o resultado. Se a consulta não for completa, ler estado.inscritos só depois dos awaits, nunca antes. Outra opção é recarregar sempre os inscritos (são até 40, custo baixo), o que também resolve inscrições feitas fora desta tela. Manter a checagem de operacoes > 0.

## Revisão de código e segurança (Júlia): melhorias sugeridas

- **js/checkin-publico.js**: O supabase-js devolve falha de rede em res.error, sem lançar exceção. Por isso qualquer erro no insert que não seja navigator.onLine === false vira Check-in encerrado para esta sessão. Uma oscilação de 4G leva o participante a desistir achando que a sessão fechou. _Correção:_ Diferenciar o erro: se error.code for '23503' (FK, sessão inexistente) ou houver erro de permissão de RLS, mostrar encerrado. Se a mensagem contiver fetch, network ou Failed, ou se não houver code, mostrar erro_rede para a pessoa tentar de novo.
- **js/processador-qr.js**: Um pedido elegível como travado é identificado por criado_em antigo, não pelo momento da reivindicação. Pedidos que ficaram mais de 30 s na fila podem ser reivindicados por duas abas ao mesmo tempo, gerando trabalho em dobro. O unique e o definirStatus condicional evitam dano real. _Correção:_ Adicionar uma coluna processando_em timestamptz e gravá-la na reivindicação. Usar processando_em < agora - 30 s como critério de travado, em vez de criado_em.
- **js/telas-sessao.js**: Ao encerrar, limparPedidosSessao apaga todos os pedidos da sessão, inclusive um que o processador global esteja processando naquele instante ou que tenha chegado logo depois do último processamento. O participante fica sem resposta e vê a mensagem de contingência. _Correção:_ Antes de apagar, parar o processador global ou rodar processarPendentes depois de encerrarSessao (os novos pedidos recebem encerrado). Depois apagar só os pedidos com status final, deixando a limpeza de 1 dia remover o restante.
- **js/telas-sessao.js**: recarregar chama renderLista a cada 2 s mesmo sem mudança. A lista inteira é recriada, o que atrapalha leitor de tela, pode perder um toque no meio da recriação e faz o contador com aria-live ser reanunciado. _Correção:_ Comparar uma assinatura simples (ids das presenças com registrado_em e quantidade de inscritos) com a anterior e só renderizar quando mudar. Atualizar o contador só se o texto for diferente.
- **js/app.js**: Em mostrarAviso, o tipo 'info' recebe a classe 'sucesso' (verde). Um aviso neutro, como Nada para exportar, parece confirmação de sucesso. _Correção:_ Criar o tratamento de info, por exemplo uma classe neutra no CSS com contraste AA, ou reaproveitar .cartao, em vez de mapear info para sucesso.
- **js/checkin-publico.js**: A política de insert do anon aceita qualquer volume de pedidos para uma sessao_id válida. Quem tiver o QR pode inundar a tabela de pedidos, além da enumeração já aceita no PRD. _Correção:_ Na página, limitar a um envio a cada poucos segundos por aba. No processador, limitar o lote por ciclo (já há limit 200) e registrar o volume. Documentar o risco, já que sem funções não há rate limit no banco.

## Roteiro de teste manual

- [ ] RF14: abrir uma sessão, tocar em Projetar QR, ler com a câmera do celular e confirmar que abre checkin.html da sessão; QR ocupa 60% da altura.
- [ ] RF15: com a tela do dono aberta, confirmar pelo QR com e-mail em maiúsculas e espaços: ver 'Presença confirmada', sem nome, origem QR, em menos de 30 s.
- [ ] RF15: repetir o check-in e ver 'Sua presença já estava registrada' com horário original; e-mail não inscrito mostra a mensagem do organizador.
- [ ] RF14/RF8: gerar novo QR ou encerrar a sessão e usar o QR antigo: ver 'Check-in encerrado para esta sessão' e nada gravado.
- [ ] RF16: com dois dispositivos, check-in pelo QR aparece na tela do dono e no telão em até 5 s sem recarregar.
- [ ] Sem tela do dono aberta, o participante vê 'Recebemos seu pedido, confira com o organizador' após 20 s.
- [ ] RF3/RF4: importar CSV de 40 linhas (2 inválidas, 1 existente) e conferir 37/1/2 com número da linha; repetir com separador ponto e vírgula.
- [ ] RF10: workshop com 20 inscritos, 2 sessões encerradas e 34 check-ins mostra 85%.
- [ ] RF11: participante em 2 workshops mostra cada sessão presente ou ausente no histórico.
- [ ] RF12: exportar CSV e abrir no Excel: acentos corretos, uma linha por inscrito por sessão, coluna origem preenchida.
- [ ] Segurança: com outro usuário e com anon, consultar as tabelas direto e receber zero registros ou erro.
- [ ] Limpeza: excluir pelo app os workshops 'Check-in {{qa}}' e 'Faltas {{qa}}' criados nos testes.

## Revisão de integração (Eduardo)

- Nenhum problema de integração encontrado.

## Verificação automática final

Imports, referências do HTML, contratos de export, caminhos relativos e padrões inseguros.

- Sem alertas.
