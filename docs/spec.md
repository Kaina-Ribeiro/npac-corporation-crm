# NPAC Corporation — Especificação do Produto

> Recriação do `sdr-cockpit.html` como CRM real: seguro, multiusuário, LGPD, mobile-first.
> Regra geral: **tudo que existe hoje continua existindo**, só que funcionando de verdade e mais bonito.

---

## 1. Pessoas e papéis

| Pessoa  | Papel            | Prospecta? | Faz reunião (closer)? |
|---------|------------------|:----------:|:---------------------:|
| Ana     | **HEAD** (Pré-vendas / SDRs) | ✅ | — |
| Ronaldo | **HEAD** (Vendedores / Closers) | — | ✅ (Mentorias P0) |
| Ale     | SDR              | ✅ | — |
| Murilo  | SDR              | ✅ | — |
| Igor    | SDR              | ✅ | — |
| Sônia   | CLOSER           | — | ✅ (Nação Milionária P1/P2) |

Modelo: cada usuário tem **um papel** (`HEAD`, `SDR`, `CLOSER`) + duas flags (`can_prospect`, `can_close`).
Assim Ana é HEAD que prospecta e Ronaldo é HEAD que fecha, sem `if nome === 'Ana'` no código.
Time, closers e produtos são **dados no banco**, não código: contratou alguém, cadastra e pronto.

## 2. Matriz de acesso

**Visibilidade de lead** (aplicada na API **e** no Postgres via RLS):

```
HEAD    → todos os leads
SDR     → leads onde sdr_id = eu
CLOSER  → leads com reunião (futura ou já feita) onde closer_id = eu
```

| Ação | HEAD | SDR (próprios) | CLOSER (da agenda) |
|---|:-:|:-:|:-:|
| Ver dashboard | tudo | só os números dele | só os números dela |
| Criar lead | ✅ (escolhe SDR) | ✅ (SDR = ele, fixo) | — |
| Editar dados do lead | ✅ | ✅ | notas/tarefas |
| Mover no pipeline | ✅ | ✅ | ✅ |
| Agendar reunião com closer | ✅ | ✅ | — |
| Reagendar reunião | ✅ | ✅ | ✅ |
| Marcar realizada / no-show | ✅ | ✅ | ✅ |
| **Registrar venda** | ✅ | ✅ | ✅ |
| Notas e tarefas | ✅ | ✅ | ✅ |
| Trocar SDR/closer do lead | ✅ | — | — |
| Excluir lead (soft delete) | ✅ | — | — |
| Relatórios | todos | escopo próprio | escopo próprio |
| Exportar CSV com contato | ✅ | — | — |
| Copiar resumo p/ WhatsApp (sem telefone) | ✅ | escopo próprio | escopo próprio |
| Chat interno | ✅ | ✅ | ✅ |
| Usuários, produtos, etapas | ✅ | — | — |
| Log de auditoria / LGPD | ✅ | — | — |

## 3. Regra de entrada do lead

Só entra no CRM quem tem **renda ≥ R$ 5 mil/mês**. O form exige a **faixa de renda**:

- `5k–8k` · `8k–15k` · `15k–50k` · `50k+`

Não existe opção abaixo de 5k → o lead simplesmente não é cadastrado.
Guarda-se a faixa, nunca o valor exato (minimização — LGPD art. 6º, III).

## 4. Pipeline (8 etapas — iguais às de hoje)

1. Criando Relacionamento (`SONDAGEM`)
2. Agendado Direto (`AGENDADO_DIRETO`)
3. Em Follow-up (`EM_FOLLOW`)
4. Agendado do Follow (`AGENDADO_FOLLOW`)
5. Agendou Pagamento 💳 (`AGENDOU_PAGAMENTO`)
6. No-Show (`NO_SHOW`)
7. Venda Fechada 🏆 (`VENDA`)
8. Sem Perfil (`PERDIDO`)

Etapas ficam em tabela (`pipeline_stages`), editáveis pelos HEADs. Desktop: kanban com arrastar.
Mobile: abas de etapa com scroll horizontal + botão "Mover para…".

Melhoria: **origem do agendamento** (direto/follow) e **resultado** (realizada/no-show) passam a viver na
**reunião**, não no status. Isso elimina a contagem dupla das métricas atuais.

## 5. Telas

Navegação mobile: barra inferior com **Hoje · Pipeline · Leads · Chat · Mais**.
Desktop: sidebar com as mesmas seções + Dashboard e Relatórios.

### 5.1 Login
E-mail + senha (cada um tem o seu). MFA (TOTP) obrigatório para HEADs. Sem cadastro aberto: HEAD convida.

### 5.2 Dashboard (Cockpit)
Seletor **Hoje / Mês / Período**. KPIs: leads novos, P0/P1/P2, agendados (direto × follow), no-show %,
comparecimento %, vendas, conversão, faturamento, **recebido × a receber**. Blocos por SDR e por closer
(cada um vê só o próprio; HEAD vê todos). Frase do dia mantida.

### 5.3 Hoje (Tarefas & Follow-up)
Uma lista priorizada do dia, com filtro por SDR/closer (HEAD):
- 🚨 **Atrasados** — próximo contato já passou e lead ainda aberto
- 📞 **Contatos de hoje** — follow-ups agendados para hoje
- 📅 **Reuniões de hoje** — fila do closer, com ações *Realizada* / *No-show* / *Agendou pagamento*
- 💳 **Cobranças** — saldos de vendas parciais vencendo
- ✅ Tarefas avulsas

Ações rápidas em cada card: abrir WhatsApp, concluir, reagendar, abrir ficha.

### 5.4 Pipeline
Kanban descrito na seção 4, com filtros (SDR, closer, tipo) e presets de colunas visíveis.

### 5.5 Leads (tabela)
Busca + filtros: **SDR, tipo (P0/P1/P2), origem, closer, status, período** (hoje, amanhã, semana,
atrasados, sem data, intervalo). Ordenação: próximo contato, data da call, criado em, nome.
Paginação no servidor. No mobile vira lista de cards.

### 5.6 Ficha do lead
Dados · faixa de renda · timeline (tudo que aconteceu) · notas · tarefas · reuniões · venda/pagamentos.
Botões: **Copiar handoff p/ closer**, **Adicionar ao Google Agenda**, **Registrar venda**, WhatsApp.

### 5.7 Novo lead (form)
Nome* · WhatsApp · Instagram · **Faixa de renda*** · Origem do lead (Instagram, WhatsApp, indicação, outro) ·
Responsável SDR · Perfil (P0 Mentoria VIP / P1 Nação Milionária / P2 Nação Moderado) · Closer (sugerido
automaticamente: P0 → Ronaldo, P1/P2 → Sônia) · Status inicial · Data/hora da call · Próximo contato ·
Notas / dor principal. Detecção de duplicado por telefone/Instagram antes de salvar.

### 5.8 Registrar venda (form) — foco
Fluxo em passos, rápido no celular:
1. **Closer** (Ronaldo / Sônia — pré-selecionado pelo perfil do lead)
2. **Produto** (da tabela de produtos, filtrado pelo closer, com preço padrão):
   - Ronaldo: Mentoria RDV (R$ 18.000) · Mentoria 2 Meses (R$ 30.000) · Mentoria 6 Meses (R$ 80.000)
   - Sônia: Nação Promocional (R$ 2.500) · Nação Padrão (R$ 3.000) · Nação Completo (R$ 3.500)
3. **Valor total** (editável — negociação)
4. **Forma de pagamento**: Cartão · Pix · Boleto parcelado · **Parcial** (entrada hoje + saldo)
5. Se parcial/boleto: **valor de entrada** + **parcelas** (valor e vencimento de cada uma) —
   saldo calculado ao vivo
6. Confirmação com resumo → salva em transação única:
   lead → `VENDA`, cria `deal` + `payments`, cria tarefa de cobrança por parcela, timeline, auditoria,
   e posta 🏆 no chat geral (opcional).

Validações: valor > 0, entrada < total no parcial, soma das parcelas = saldo, vencimentos futuros.
Dinheiro sempre em **centavos** (inteiro). Venda pode ser estornada só por HEAD (fica registrado).

### 5.9 Relatórios — foco
Filtros: **período** (hoje, ontem, data, intervalo, mês) · **SDR/responsável** · **closer** · **status** ·
**tipo** · **origem**. Mostra:
- Funil: leads → agendados → realizadas → vendas, com taxas entre etapas
- Por SDR: leads, agendados direto/follow, no-show, vendas, P0/P1/P2
- Por closer: reuniões, no-show %, vendas, conversão, faturamento
- Por produto: quantidade, faturamento, ticket médio
- Financeiro: vendido × recebido × a receber (com vencimentos)
- Lista de leads do filtro

Saídas: **CSV** (HEAD), **Copiar relatório p/ WhatsApp** (sem telefones), impressão/PDF.
Todo export é registrado na auditoria.

### 5.10 Chat interno
Canal **Geral** + **DMs 1-para-1**, em tempo real, com não-lidas, menção a lead (`#lead` vira link e só
abre para quem tem acesso). DMs realmente privadas (checadas no servidor).

### 5.11 Equipe
Cards dos membros com papel, canal e números do período.

### 5.12 Playbook (Léo)
Scripts de objeção por tema com busca e "copiar". Conteúdo editável pelos HEADs.

### 5.13 Admin (HEAD)
Usuários (convidar, desativar, resetar MFA) · Produtos e preços · Etapas · Log de auditoria ·
Pedidos LGPD (acesso, correção, eliminação).

## 6. Definição das métricas (sem contagem dupla)

| Métrica | Definição |
|---|---|
| Leads novos | `leads.created_at` no período |
| Agendados | reuniões **criadas** no período (direto/follow pela `meetings.origin`) |
| Realizadas | reuniões com `outcome = DONE` no período |
| No-show % | `NO_SHOW / (DONE + NO_SHOW)` |
| Vendas | `deals.closed_at` no período (não estornadas) |
| Conversão | vendas / realizadas |
| Faturamento | soma de `deals.total_cents` |
| Recebido | soma de `payments` pagos no período |
| A receber | soma de `payments` pendentes |

## 7. Não-funcionais

- **Leve**: páginas server-rendered, JS mínimo no cliente, meta < 150 KB JS na primeira carga.
- **Mobile-first**: tudo utilizável com uma mão; formulários em passos; PWA instalável.
- **Bonito e organizado**: shadcn/ui + Tailwind, fonte Plus Jakarta Sans (identidade atual), modo escuro.
- **Tempo real**: pipeline, Hoje e chat atualizam sozinhos.
- **Segurança/LGPD**: ver plano de arquitetura (RBAC + RLS, auditoria, criptografia de contato,
  retenção, direitos do titular, nada de dado pessoal no navegador).

## 8. Fora do escopo da v1
Integração direta com WhatsApp/Instagram API, IA no playbook, metas/comissões. Ficam para depois.
