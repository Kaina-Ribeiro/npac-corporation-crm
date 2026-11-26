# Spec: gestão do Acompanhamento, bloco 2 — Renovações (NPAC-79)

Status: **rascunho, 26/11/2026, aguardando o Gabriel** (decisões G1–G6 abaixo). Perguntas e respostas da Eduarda:
`docs/acompanhamento/perguntas-gestao-bloco-2-2026-11-25.md` (**1A, 2C, 3B, 4B, 5A, 6A, 7A, 8A**). Plano:
`docs/plans/npac-79-renovacoes.md`.

## Contexto

- PDF de 07/11, aba 11 "Renovações e gestão": "mentorados que chegam ao 12º mês nos próximos 60 dias, status da conversa
  de renovação, indicadores gerais". Os indicadores gerais já existem (Dashboard NPAC-75, Reuniões > Controle mensal,
  Agenda, "Sem reunião há mais de 30 dias", PMEs e ciclos); este bloco faz a parte de renovação.
- Já existe e será reaproveitado: a ação do 12º mês do RDV "Celebração e renovação" (0050, reunião RENOVACAO, conclui
  com a reunião realizada), o campo "Quer renovar?" (`mentoria_reunioes.interesse_renovar`, só RENOVACAO), o término
  previsto (início + 12 meses, empurrado pelas pausas) e `mentoria_gerar_acoes`, que cria as ações do plano-modelo até o
  término e não repete as que já existem.
- O desenho v2 (§11, Fase 4) já previa "`renovacoes` (muda `termino_previsto`)" e as pulseiras da 2M e da 6M dos meses
  19, 25, 37 e 61 "nascem com a renovação". A resposta 4B confirma esse caminho.

## Respostas da Eduarda → regra

| Resp. | Regra |
|---|---|
| 1A | RDV, 2M e 6M entram na lista; todas com ciclo de 12 meses. |
| 2C | Ao renovar, escolhe a mentoria: a mesma ou outra (RDV, 2M, 6M). |
| 3B | A renovação não passa pelo comercial: a equipe registra na ficha ("Registrar renovação"). A venda nova de quem já é mentorado continua abrindo outra ficha (bloco 1, M3), sem mudança. |
| 4B | Mesma ficha: o término anda 12 meses; meses 13 a 24 (25 a 36 na 2ª renovação…). |
| 5A | Situação da conversa calculada pelo que a equipe registra (abaixo). |
| 6A | Nada novo na Fila nem no push. |
| 7A | Admin e Acompanhamento; "só a carteira" vê só a carteira (RLS). |
| 8A | Números no topo: chegando, já tiveram a reunião, renovaram, não renovaram, % de renovação. |

## O que muda

### 1. Aba "Renovações e gestão" (`/acompanhamento/renovacoes`)

Sai de "Em breve" (menu lateral, Ctrl+K, Mais do celular); `/acompanhamento/em-breve/renovacoes` redireciona.

**Números no topo** (8A), sobre o que a pessoa vê:
- **Chegando**: quantos estão na lista sem renovação registrada.
- **Já tiveram a reunião**: desses, quantos têm a reunião de renovação realizada.
- **Renovaram**: renovações registradas nos últimos 12 meses (G4).
- **Não renovaram**: fichas marcadas "Concluído" nos últimos 12 meses (G4).
- **% de renovação** = Renovaram ÷ (Renovaram + Não renovaram), inteiro; sem base, "—".

**Lista "Chegando na renovação"** (1A, PDF): fichas **Ativo** com término previsto, cujo **último mês do ciclo começa
nos próximos 60 dias ou já começou** (`término − 1 mês ≤ hoje + 60`), e as que **renovaram nos últimos 60 dias** (G6).
Pausado fica fora (o término anda com a pausa e volta quando retoma). Concluído e Cancelado saem. Quem passou do término
e não foi resolvido continua, com "Terminou em DD/MM". Ordem: término mais próximo primeiro.

Cada linha: nome (abre a ficha), mentoria e variante, responsável (com foto), "Mês 12 de 12" ou "O 12º mês começa em
DD/MM", término, e a **situação da conversa** (5A).

**Situação da conversa** (5A), pela reunião de Renovação do ciclo atual (início ≥ término − 12 meses; a remarcada não
conta, vale a nova; a mais recente):

| O que está registrado | Mostra |
|---|---|
| Renovação registrada (últimos 60 dias) | **Renovou em DD/MM** (para 2M: "Renovou para 2M") |
| Reunião realizada e "Quer renovar?" = Sim | **Quer renovar** |
| Reunião realizada e "Quer renovar?" = Não | **Não quer renovar** |
| Reunião realizada sem a resposta | **Reunião feita, falta o "Quer renovar?"** (texto nosso, ver G-texto) |
| Agendada, confirmada ou link enviado | **Reunião marcada para DD/MM** |
| Nenhuma, ou a última faltou | **Sem reunião** (se faltou: "Sem reunião · faltou em DD/MM") |

Filtros (lembrados, como as outras abas): situação da conversa e responsável. "Só a carteira" não vê o filtro de
responsável.

### 2. "Registrar renovação" na ficha (3B, 4B, 2C)

Botão na ficha, no topo da aba Jornada, para Admin e Acompanhamento (área nova `RENOVACAO` de `mentoria_edita`, com o
recorte da carteira), quando a ficha está **Ativo** ou **Concluído** e já tem término. Janelinha com:
- **Renova para**: RDV, 2M ou 6M (começa na mentoria atual).
- **Data da renovação**: hoje por padrão; não pode ser futura nem de mais de 1 ano atrás.

Ao confirmar, numa transação só (`mentoria_renovar`, SECURITY DEFINER, advisory lock da inscrição):
1. Grava `mentoria_renovacoes` (inscrição, número do ano: 2, 3…, data, mentoria anterior e nova, término anterior e
   novo, quem registrou).
2. Término previsto = término atual + 12 meses (G3).
3. Mentoria = a escolhida (a variante fica como está; a equipe ajusta na aba Inscrição).
4. Gera as ações do plano-modelo da mentoria escolhida **só dos meses do novo ano** (13 a 24 na 1ª renovação), com o
   responsável da ficha, como hoje. Sem isso, trocar RDV → 2M criaria as ações dos meses 1 a 12 da 2M, todas atrasadas.
5. Concluído volta a **Ativo**.
6. Histórico `inscricao.renovada` (só os nomes dos campos, como o resto do histórico) e rearma os avisos.

A ficha passa a mostrar o selo dourado **"Renovado em DD/MM"** ao lado do status (G1) e o mês como **"Mês 14 de 24"**;
"Jornada concluída" só depois do último mês do término. A faixa "Os 12 meses" mostra o ano atual (13 a 24, com "2º ano").

**Desfazer** (G5): Admin desfaz a última renovação enquanto nenhuma ação do novo ano foi feita: volta término, mentoria
e status, e apaga as ações pendentes que ela criou (pela função, histórico `inscricao.renovacao_desfeita`).

### 3. Status "Renovado" e "Concluído"

- **G1/G2**: a ficha renovada **continua "Ativo"**. "Renovado" deixa de ser escolha manual no status (API 400 "Para
  renovar, use Registrar renovação."); fichas que já estiverem em "Renovado" ficam como estão. Motivo: Fila, semáforo,
  check-ins, PMEs, envios, push e transferência só tratam "Ativo" (mais de 20 funções do banco e 13 arquivos da API);
  com status "Renovado" a pessoa sumiria de tudo no 2º ano.
- "Concluído" ganha a data em que foi marcado (`concluida_em`, gravada por gatilho; sai se voltar a outro status), para o
  número "Não renovaram". Os concluídos de antes não têm data e ficam fora da conta.

### 4. Plano e PMEs do 2º ano

- O plano-modelo já aceita meses até 120 (Configurações > Plano-modelo). Hoje o modelo do 2º ano é quase vazio: o RDV
  não tem nada depois do mês 12; a 2M e a 6M têm só a pulseira do mês 19 (as do mês 13 — reunião trimestral da 2M e
  pulseira — já nascem antes, porque a data delas cai no próprio término). A Admin completa os meses 13 a 24 no
  plano-modelo quando quiser (pergunta 2 da Parte 3).
- PMEs vão de 1 a 12 por ficha (`mentoria_ciclos_numero`, catálogo 0–12). **PME no 2º ano fica para a Parte 3**, com a
  pergunta à Eduarda (mensagem pronta no plano). Até lá, depois do 12º PME não há "Enviar 13º PME".

## Quem vê e quem faz

| Perfil | Aba Renovações | Registrar renovação | Desfazer |
|---|---|---|---|
| Admin (e Diretoria) | todas | sim | sim |
| Acompanhamento | todas | sim | não |
| Acompanhamento "só a carteira" | só a carteira | só na carteira | não |
| Operação, Especialista, Envios, Mentor | 404, sem item no menu | não | não |

## Decisões para o Gabriel (o que as respostas não cobrem)

| # | Decisão | Recomendação | Alternativa |
|---|---|---|---|
| G1 | Status da ficha renovada | **Continua "Ativo" + selo "Renovado em DD/MM"** | Status "Renovado" valendo como ativo em todas as 20+ funções (grande e arriscado) |
| G2 | "Renovado" no select de status | **Sai (só pela renovação)** | Fica, mas tira a pessoa da Fila |
| G3 | Novo término | **Término anterior + 12 meses** (o calendário segue contínuo) | Data da renovação + 12 meses (os meses ficariam desalinhados do início) |
| G4 | Período dos números | **Últimos 12 meses; "não renovou" = marcado Concluído** | Desde sempre; ou "não renovou" = respondeu "Não" na reunião |
| G5 | Desfazer renovação | **Sim, só a Admin, enquanto nada do novo ano foi feito** | Sem desfazer (corrige término e mentoria à mão; as ações criadas ficam) |
| G6 | Quem renovou na lista | **Fica 60 dias como "Renovou em DD/MM"** | Some na hora |
| G-texto | Rótulos não escritos pela Duda | "Reunião feita, falta o 'Quer renovar?'", "Terminou em DD/MM", "Renovado em DD/MM", "2º ano", "Registrar renovação", "Renova para" | Ajustar com ela |

## Fora do escopo

- PMEs do 2º ano (Parte 3, depende da Eduarda); valor e forma de pagamento da renovação (não pedidos: a ficha já tem
  "Valor" e "Forma de pagamento" editáveis); CSV da aba; aviso na Fila (6A); renovação pelo comercial (3B).

## Testes

- Banco: `mentoria_renovar` (término, mentoria, ações só do novo ano, Concluído → Ativo, quem pode, carteira, desfazer),
  `concluida_em`, a leitura da lista e dos números com RLS (Admin, Acompanhamento, carteira, Operação nada), caso no
  `rls-por-consulta` para a tabela nova.
- API e2e: rotas, 404 por perfil, 400 de datas e de status "Renovado" manual, histórico.
- e2e: Duda → menu → Renovações → abre a ficha → Registrar renovação → volta e vê "Renovou em"; "só a carteira" vê só
  os dela; Operação sem o item. Celular 375/768 sem rolagem lateral.
