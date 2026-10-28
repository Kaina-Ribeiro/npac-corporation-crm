# Plano 03 — Vendas, Dashboard e Relatórios

**Status: proposta para aprovação; implementação não iniciada.**

Parte do CRM real do Plano 02: `withUser`, permissões `sale:register`/`sale:reverse`,
timeline/auditoria transacionais, reuniões com `outcomeAt`, filtros privados,
SSE de invalidação e interface responsiva.

## Entregas propostas

| # | Entrega | Critério de pronto |
|---|---|---|
| 1 | Produtos, vendas, pagamentos e cobranças, com migrations/RLS | Dinheiro em centavos inteiros; FK/checks e isolamento comprovados como npac_app |
| 2 | Catálogo dos produtos reais por closer | Produtos/preços no banco, seed idempotente; nenhuma regra baseada no nome da pessoa |
| 3 | Registro de venda em transação única | Produto/closer válidos, total positivo, entrada/parcelas fecham saldo; lead muda para VENDA; timeline/auditoria e cobranças consistentes |
| 4 | Estorno somente por HEAD | Estorno auditado, sem apagar pagamentos/histórico; repetição da requisição não duplica efeitos |
| 5 | Formulário Registrar venda em passos | Disponível a HEAD/SDR/CLOSER no escopo permitido; parcial/parcelado com resumo antes de confirmar |
| 6 | Dashboard por papel | SQL calcula métricas sem contagem dupla; períodos BRT; tudo/próprio SDR/próprio closer |
| 7 | Relatórios, CSV e resumo WhatsApp | Mesmos filtros/escopos; CSV com contato só HEAD e auditado; resumo sem telefones; proteção contra fórmulas no CSV |
| 8 | Recebido x a receber e regressão | Baixa de parcela com versão/idempotência; cobrança em Hoje; e2e de venda parcial, recebimento e estorno; orçamento de JS conferido |

## Produtos iniciais da spec

- Mentoria RDV: R$ 18.000; Mentoria 2 Meses: R$ 30.000; Mentoria 6 Meses: R$ 80.000.
- Nação Promocional: R$ 2.500; Nação Padrão: R$ 3.000; Nação Completo: R$ 3.500.
- Atribuição aos closers é dado do seed; preços negociados ficam na venda,
  preservando o preço de catálogo e o histórico.

## Regras preservadas

- Mesmas permissões/RLS, 404 para lead invisível e MFA obrigatório para HEAD.
- SDR também registra venda de lead próprio; CLOSER registra no escopo da agenda.
- Requisições financeiras não aceitam valores derivados do navegador como fonte
  de verdade: saldo e soma das parcelas são validados no servidor.
- Nada pessoal em URLs/logs/storage persistente; relatórios usam filtros no corpo.
- Métricas usam eventos próprios: leads.createdAt, reuniões.createdAt/outcomeAt,
  vendas.closedAt e pagamentos.paidAt. Etapa do pipeline não substitui evento financeiro.
- Teste que falha → implementação → validação focada → commit; execução direta.

## Pronto

Lint, typecheck, testes, build e e2e verdes. Cada papel registra e vê apenas o
escopo permitido; vendido/recebido/a receber conciliam com parcelas; CSV é
restrito e auditado; nenhuma métrica depende de contagem no cliente.
