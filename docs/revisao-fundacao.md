# Revisão do Plano 01 — Fundação

Revisão do código herdado: shared, schema/migrations/RLS, seed, autenticação,
auditoria/logs, leads, web, testes e CI. Execução direta, sem subagentes.

## Correções

| Achado | Correção e evidência |
|---|---|
| Closer conseguia ler/alterar reunião de outro closer quando ambos atendiam o mesmo lead | Migration `0005_agenda_scope.sql`; teste SQL como `npac_app` verifica leitura e escrita negadas |
| Closer podia editar nome e demais dados pessoais do lead | Trigger restringe UPDATE à etapa/versionamento; notas/tarefas terão tabelas próprias no Plano 02 |
| Dois cadastros concorrentes passavam pela deduplicação | Advisory locks por contato dentro da transação, em ordem determinística; teste concorrente exige 201 + 409 |
| Busca colocava contato na URL do navegador | Busca por POST, somente em memória; GET com search rejeitado; teste de navegador verifica URL/localStorage |
| Query/body podiam chegar aos logs de acesso | Serializer de requisição mantém só método e caminho; serializer de erro omite SQL/parâmetros |
| Testes antigos de logs eram inócuos porque LOG_LEVEL=silent | Captura ativa nível info; teste verifica tanto presença de log quanto ausência de dados pessoais |
| Lista expunha contatos sem auditar leitura | Evento `lead.list` armazena IDs/paginação, sem termo de busca |
| CI não rodava o navegador | Instala Chromium, roda e2e e publica traces em falhas |
| Fastify/Drizzle/Vitest tinham alertas altos/críticos | Fastify 5.12.7, Drizzle 0.45.4, Vitest 5.0.5; overrides alinham dependências transitivas |
| Tema tinha tokens mas nenhum controle | Botão de alternância com teste no navegador |
| Postgres/Redis expostos nas interfaces de rede locais | Compose publica portas só em 127.0.0.1 |

## Validação

- 85 testes shared; 45 banco; 48 API.
- 14 testes Playwright: isolamento do SDR, erro genérico, ausência de sessão,
  mobile, privacidade, CSP, busca/tema, MFA completo de **ambos** HEADs,
  troca obrigatória de senha, orçamento de JS e logout.
- `/leads`: **139 KB gzip** de JavaScript na primeira carga, medido pelo navegador.
- Screenshots de login, leads desktop e mobile inspecionadas.
- Auditoria de dependências: nenhum alerta alto/crítico. Resta um moderado em
  esbuild 0.18 transitivo do Drizzle Kit (`GHSA-67mh-4wv8-2f99`), referente ao
  servidor de desenvolvimento do esbuild; o projeto não inicia esse servidor.

## Decisões e limites

- Busca por POST substitui o GET com termo previsto no plano: prevalece a regra
  global de não colocar dados pessoais em URL. Paginação também usa estado em memória.
- Next 16 usa `proxy.ts` no lugar de `middleware.ts`.
- Visual segue o protótipo aprovado: stack SF/Geist e Anton no monograma,
  fontes hospedadas pelo próprio build, glass claro e ouro líquido no login.
- Componentes visuais desta casca são próprios em Tailwind; shadcn/ui não foi
  introduzido apenas para substituir esses controles simples.
- Locks de duplicidade protegem o caminho de criação da API. Futuras escritas de
  contato/importadores devem manter a mesma disciplina de locks/deduplicação.
- Testes locais verdes não confirmam uma execução remota do GitHub Actions.
- Fundação não equivale a CRM completo nem a implantação pronta para produção.
  Retenção, pedidos LGPD, backups e go-live pertencem aos planos seguintes.
