# Plano 02 — CRM base: entrega e validação

## Implementado

- Tabelas `lead_notes`, `lead_tasks` e `lead_timeline`, com RLS, índices e autoria
  imutável. Timeline append-only guarda tipos de evento e nomes de campos, não valores.
- PATCH de lead exige versão; conflitos retornam 409. SDR edita próprios dados;
  closer move etapa sem editar dados pessoais; só HEAD transfere ou exclui.
- Deduplicação de contato também na edição, com locks por contato e exclusão do próprio ID.
- Reuniões com agendamento, reagendamento, cancelamento, resultado e versão.
  Datas são instantes UTC, apresentados e filtrados no fuso de São Paulo.
- Cadastro, ficha, notas, tarefas, histórico e ações de reunião no web.
- Busca privada, filtros de origem/perfil/etapa/SDR/closer/período, ordenação e paginação SQL.
- Pipeline com etapas vindas do banco, arrastar no desktop, seletor no mobile,
  escolha de colunas e carregamento paginado de cada coluna.
- Hoje reúne atrasados, contatos, reuniões e tarefas; HEAD filtra por SDR/closer.
  Tarefas pessoais podem existir sem lead e têm controle de acesso próprio.
- SSE autenticado invalida as consultas. O payload contém somente `{ type }`;
  os dados continuam sendo consultados pela API com RLS.

## Contratos principais

| Rota | Função |
|---|---|
| `PATCH /api/leads/:id` | Alterar campos permitidos, com `version` |
| `DELETE /api/leads/:id` | Soft delete HEAD, com `version` no corpo |
| `GET /api/leads/catalog` | Etapas e membros ativos, sem e-mail/contato |
| `GET /api/leads/:id/activity` | Notas, tarefas e timeline |
| `POST /api/leads/:id/notes` / `PATCH .../notes/:noteId` | Notas; edição pelo autor ou HEAD |
| `POST /api/leads/:id/tasks` / `PATCH .../tasks/:taskId` | Tarefas vinculadas ao lead |
| `POST /api/tasks` / `PATCH /api/tasks/:id` | Tarefas pessoais sem lead |
| `POST /api/meetings` / `PATCH /api/meetings/:id` | Agendar/remarcar; troca de closer só HEAD |
| `POST /api/meetings/:id/cancel` / `.../outcome` | Cancelar/registrar resultado, com versão |
| `GET /api/leads/pipeline` / `POST /api/leads/pipeline/search` | Colunas e filtros privados |
| `POST /api/today/search` | Filas do dia no escopo autorizado |
| `GET /api/events` | SSE, sem conteúdo pessoal |

## Casos críticos verificados

- Duas edições com a mesma versão: uma salva e a outra recebe 409.
- Rascunho aberto mantém a versão original mesmo após SSE atualizar a ficha.
  Outro usuário não perde alterações por uma troca silenciosa de versão no cliente.
- Transferir SDR retira o lead da lista do antigo responsável.
- Trocar closer ou cancelar a última reunião revoga o acesso à ficha/atividades.
- O comando SQL `cancel_meeting` permite somente essa transição, com usuário ativo,
  papel/posse válidos e versão esperada. É necessário porque o cancelamento revoga
  a própria política SELECT do closer; não aceita campos livres.
- Nenhum POST/PATCH aceita campos arbitrários de autoria ou pertencimento.
- Timeline não recebe texto de notas nem valores de contato.
- SSE detecta mudança de escopo mesmo sem um evento de timeline visível ao antigo closer.
- Desativação encerra o stream e a sessão aberta; reconexão revalida acesso.
- Duas sessões de navegador comprovam atualização de nota e perda da ficha sem reload manual.

## Evidências

- `pnpm turbo run lint typecheck test build`: verde.
- Shared: **85** testes; banco: **48**; API: **63**.
- Playwright: **18** cenários verdes, incluindo desktop/mobile, MFA de ambos HEADs,
  fluxo CRM, tarefa pessoal, filtros, privacidade, conflitos e tempo real.
- `/leads`: **140,5 KB gzip** de JavaScript na primeira carga.
- Telas de ficha, Hoje e Pipeline desktop/mobile inspecionadas por screenshots.
- Migrations aplicadas em bancos vazios pelos testes; atualização do banco local
  usa o comando `migrate`, sem recriar o volume ou apagar dados.

## Decisões e limites

- A ficha usa página completa adaptada ao mobile, com link direto e navegação de
  retorno, em vez de um drawer. O escopo e os testes de acesso são os mesmos.
- O stream calcula uma revisão no banco a cada **2 segundos**, por sessão, usando
  consultas sujeitas a RLS. Funciona entre processos; não depende de um barramento
  em memória. Para a escala inicial do time, evita infraestrutura adicional.
- Filas de Hoje, reuniões da ficha e atividades são limitadas aos 100 primeiros
  registros por consulta; Pipeline e Leads têm paginação. Timeline mostra os 100 mais recentes.
- A interface permite acrescentar notas e criar/concluir/reabrir tarefas. Edição
  de texto de notas/tarefas também existe na API, com controle de versão.
- Dashboard, vendas/cobranças/relatórios, chat, Admin/LGPD e implantação permanecem
  nos planos seguintes. Sem aprovação de deploy ou integração real com Firebase.
- A dependência moderada do esbuild transitivo do Drizzle Kit continua registrada
  na revisão da Fundação; este plano não acrescentou dependências externas.
