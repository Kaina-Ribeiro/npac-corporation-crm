# Revisão — Vendas, Dashboard e Relatórios

Plano 03 concluído em 28/10/2026, em execução direta.

## Entregas

- Catálogo de seis produtos reais, atribuição por closer e seed idempotente.
- Venda em passos na ficha do lead: produto/closer, forma de pagamento,
  entrada/parcelas e confirmação. O preço negociado e o catálogo são preservados
  como snapshot. Uma venda ativa por lead; o registro muda a etapa para VENDA.
- Recebimentos de parcelas na ficha e cobranças vencidas ou de hoje na aba Hoje.
- Estorno exclusivo de HEAD, auditado, com pagamentos/histórico preservados.
  Restaura a etapa anterior se o lead ainda estiver em VENDA. Exclusão de lead
  com venda ativa responde 409 e exige estorno prévio.
- Dashboard e Relatórios por papel, períodos Brasília e filtros por SDR, closer,
  origem, perfil, etapa e produto. Lista de leads paginada no servidor.
- Agregações SQL por SDR (incluindo P0/P1/P2 e direto/follow), closer (conversão e
  no-show) e produto (quantidade, faturamento e ticket médio em centavos).
- CSV com contatos somente para HEAD, auditado e protegido contra fórmulas;
  resumo copiável sem contatos; impressão/salvar PDF pelo navegador.
- Acesso móvel pelo menu Mais, mantendo os componentes glass e dourado existentes.

## Segurança e consistência

Runtime `npac_app` sem BYPASSRLS; transações com `withUser`. Leads invisíveis
continuam 404. Visibilidade financeira combina acesso atual ao lead e papel/
responsabilidade da venda. Trocar o responsável não concede automaticamente a
um SDR acesso a dados financeiros de outro. Identificadores de SDR/closer na venda
são snapshots; autorização não depende de nomes de pessoas.

Valores individuais são inteiros positivos, até 2 bilhões de centavos.
Entrada + parcelas devem fechar exatamente o total, tanto no servidor quanto
em constraint trigger diferida no COMMIT. Parcelas são positivas e futuras.
Agregados passam por validação de inteiro seguro; ticket médio é arredondado em SQL.

Registro usa chave idempotente e hash do corpo: repetir a mesma operação retorna
o resultado existente; reutilizar a chave com outro corpo responde 409. Baixas
exigem versão e chave estável. Parcelas/valores e registros pagos são imutáveis.
Recebimento e estorno compartilham advisory lock por venda, antes dos locks de
linha, evitando corrida e inversão de locks. RLS UPDATE também restringe
`SELECT FOR UPDATE`, portanto a baixa não exige um UPDATE indevido da venda.
Timeline e auditoria integram a transação, sem valores pessoais nos eventos.

Migrações 0011–0014 incluem schema, políticas, grants, índices e triggers. Fixtures
owner existem apenas nos testes; a integridade e as políticas também são
exercitadas com a role de runtime.

## Definição dos indicadores

Intervalos em `America/Sao_Paulo`, com início inclusivo e fim exclusivo.
Leads usam criação; agendamentos usam criação da reunião; realizadas/no-show usam
data do resultado; vendas usam fechamento; recebimentos usam data da baixa.
Vendas estornadas são excluídas dos indicadores financeiros.

Recebido soma baixas no período. A receber soma parcelas pendentes de vendas
fechadas no período, conforme os rótulos da interface. Portanto os indicadores
não representam necessariamente o mesmo conjunto de vendas. A aba Hoje mostra
cobranças pendentes até o fim do dia, incluindo atrasadas.

CTEs independentes impedem multiplicação de vendas pelo número de reuniões ou
parcelas. Relatórios usam transação repeatable-read para manter métricas e linhas
no mesmo snapshot. CSV recusa mais de 10 mil linhas em vez de truncar dados.
Consultas de relatório usam POST e respostas privadas no-store.

## Validação

- `pnpm turbo run lint typecheck test build`: 214 testes aprovados
  (87 shared, 51 banco, 76 API), além de lint, tipos e build.
- `pnpm --filter @npac/web e2e`: 20 cenários Chromium, incluindo fluxo financeiro
  no celular, relatório sem rolagem horizontal da página, baixa e estorno com MFA.
- Regressores cobrem soma inválida no COMMIT, idempotência, concorrência de
  recebimento/estorno, escopo por papel, proteção do CSV e paginação sem alterar totais.
- Primeira carga `/leads`: 140,5 KB gzip, limite 150 KB.
- `pnpm audit --audit-level high`: sem vulnerabilidades altas/críticas; uma moderada
  transitiva de esbuild no servidor de desenvolvimento do drizzle-kit, não utilizado.
- Migrations e seed aplicados no banco de desenvolvimento sem apagar volume.

Screenshots gerados nos e2e ficam em `apps/web/test-results/` (ignorados pelo Git).
`AGENTS.md` foi criado com arquitetura, regras financeiras/RLS, concorrência,
comandos, critérios de validação e próximos planos.

O recebimento é lançamento manual no CRM; integrações com bancos/adquirentes
não fazem parte desta entrega. Próximos planos: colaboração (04), Admin/LGPD (05)
e migração/deploy (06).
