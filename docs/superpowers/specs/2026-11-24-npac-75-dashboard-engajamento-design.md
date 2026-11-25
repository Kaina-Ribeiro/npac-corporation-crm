# NPAC-75 — Dashboard de engajamento do Acompanhamento

Pedido da Duda (Eduarda), 24/11/2026, WhatsApp com prints do gerenciador antigo. Respostas 1A, 2B, 3C, 4B; protótipo
opção A (canvas "Onboarding com engajamento", https://claude.ai/artifact/S14Fu4AwXkaXVqoh8YVf4P; capturas em
`docs/acompanhamento/prototipo/npac-75/`). Pedido completo em `docs/pedidos/caixa.md` (pasta principal), seção NPAC-75.

## O que muda

1. A tela **Onboarding** passa a se chamar **Dashboard** (menu lateral, Ctrl+K, Mais do celular, título da página).
   O endereço fica `/acompanhamento/onboarding` (decisão nossa: mantém cookies lembrados `npac_f_ac_onb`, links da
   Fila e do Mais e os e2e; ninguém vê o endereço).
2. No topo, o bloco **Engajamento**: cartão escuro "Total de mentorados" + Engajados, Em atenção, Em risco e Sem
   marcação, cada um com "N% do total"; barra com a proporção; quatro listas com o nome (abre a ficha) e
   "Casal/Individual, mentoria / variante"; "Tipos de mentoria" com a contagem por mentoria + variante.
3. Embaixo, o funil das 6 etapas como era, com o subtítulo "Onboarding" e "N em onboarding." No celular o funil é
   grade de 3 colunas (nunca rola para o lado). No celular, os cartões dos grupos são botões: tocar mostra a lista
   daquele grupo (5 primeiros + "Ver todos os N").
4. Na ficha, aside "Inscrição", logo depois de Status: campo **Engajamento** (select: Sem marcação, Engajado, Em
   atenção, Em risco), salva ao sair do campo como os outros, com a bolinha da cor.

## Regras

- **Coluna** `mentoria_inscricoes.engajamento` (texto, CHECK `ENGAJADO`/`EM_ATENCAO`/`EM_RISCO`, nulo = "Sem
  marcação"). Todos começam nulos: o `legado.statusEngajamento` não é usado (2B). Sem conta automática (1A); o
  semáforo (0069) não muda.
- **Total** (3C) = inscrições que a pessoa vê com status diferente de CANCELADO e CONCLUIDO (Onboarding, Ativo,
  Pausado, Renovado). Os quatro grupos somam o Total. % arredondado ao inteiro.
- **Tipos de mentoria** (4B) = contagem por `mentoria` + `mentoria_variante` no mesmo universo do Total. A variante é
  comparada sem diferença de maiúsculas e espaços (`trim`, espaços seguidos viram um); o rótulo mostrado é a primeira
  forma encontrada na ordem dos nomes. Sem variante, só a mentoria ("2M"). Ordem: maior contagem primeiro, empate pelo
  rótulo.
- **Quem vê e quem marca** (S2): Admin e Acompanhamento marcam (área nova `ENGAJAMENTO` de `mentoria_edita`, com o
  recorte "só a carteira"); Operação só vê; Especialista não vê o bloco (a rota do painel já é 404 para ela) nem o campo
  (a ficha manda `engajamento: null` e `pode.verEngajamento = false`, por `mentoria_ve_engajamento()` no SQL); "só a
  carteira" vê só as inscrições da carteira (a RLS da inscrição já recorta: nenhuma política nova).
- **Banco garante**: gatilho `mentoria_inscricoes_engajamento_guarda` recusa (42501) mudar `engajamento` sem
  `mentoria_edita('ENGAJAMENTO', id)` e zera o valor no INSERT de quem não é o dono do banco. A API confere antes
  (`exigirEdicao`, 404 como as outras áreas) para dar a resposta certa.
- **Histórico**: `inscricao.editada` com o campo `engajamento` (só o nome, nunca o valor), rótulo "Engajamento".
- **Cores** ("Cores e contraste"): Engajado `--tag-ok`/`--sem-verde`; Em atenção `--tag-warn`/`--sem-amarelo` (o
  amarelo do semáforo, único amarelo permitido no módulo); Em risco `--tag-bad`/`--sem-vermelho`; Sem marcação cinza
  neutro (`--ink2`). Todo texto ≥ 4,5:1 no claro e no escuro.
- Sem dado real em teste, captura ou log; o CSV não muda.

## Fora do escopo / diferenças assumidas do protótipo

- A barra do celular continua Fila · Mentorados · + · Reuniões · Mais; o Dashboard entra pelo Mais (o protótipo
  simplificou a barra; tirar Reuniões dela seria mudança não pedida). Pergunta registrada para o Gabriel.
- Filtro por engajamento na lista de Mentorados e no CSV: não pedidos.
