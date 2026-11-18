# Achados de design de 17/11/2026: cores, contraste e páginas

Origem: crítica de design do canvas "Telas da mentoria" (17/11) e o canvas de comparação
"Contraste antes e depois" (https://claude.ai/artifact/Cg1kPUfq4EfQnDty5WRHET). Gabriel: "ajustar
tudo, inclusive os outros achados e os 3 bugs" (17/11/2026).

Ferramentas prontas (scratchpad da sessão coordenadora, só leitura):
- Auditoria de contraste (WCAG AA, claro e escuro, 1440 e 375):
  `C:\Users\gabri\AppData\Local\Temp\claude\ee6095b999d86eed\9a12ef9d-adde-45a5-b945-dd567e6119f8\scratchpad\cap\contraste.mjs`
  (troque `BASE` pela porta do seu servidor; grava `contraste.json` ao lado; agrupe com `analisar.py`).
- CSS que gerou o "depois" do canvas: `...\scratchpad\cap\correcao.css` (ponto de partida da Fase 1).
- Falsos positivos conhecidos da auditoria: texto sobre a foto do login, "conseguir." em degradê, o "N" do
  logo, iniciais brancas sobre avatar em degradê, botões desativados.

## Status

| Fase | O quê | Status |
|---|---|---|
| 1 | Cores, contraste e os 3 bugs do tema escuro | ✅ feito na branch `fix/NPAC-43-cores-contraste` → `release/v0.17` (auditoria local sem falhas reais; login medido por pixel; ITODEV conferido depois do rc) |
| 2 | Layout das páginas | ⏳ pendente (depois da Fase 1: mexe nos mesmos CSS) |
| — | Texto do login para o Acompanhamento | ❓ esperando o texto do Gabriel |

## Fase 1: cores, contraste e tema escuro (um PR)

Decidido (não rediscutir):
1. **Tokens** (`apps/web/app/globals.css`): claro `--ink2 #5f5f64`, `--ink3 #6a6a6f`, `--danger #c01f40`;
   escuro `--ink3 #9a9aa0`, `--danger #ff5a77`. Novo `--gold-text` (claro `#7a560f`, escuro `var(--gold)`) para
   texto dourado: `.pl-link`, `.pl-n`, `.rn-abrir`, `.pme-tarefa.enc .pme-orig` ("Corrigir", "Anexar comprovante").
   `--gold-deep` fica para barras, bordas e marca.
2. **Bug 1 e 2**: `.field` (`globals.css:218`) ganha versão escura: fundo `rgba(255,255,255,.07)`, texto `var(--ink)`,
   `color-scheme: dark`, borda `rgba(235,235,245,.14)`; foco `.11`. Corrige o campo Mês do Controle mensal e as
   caixas das Mensagens-modelo.
3. **Bug 3**: caixa do login (`components/login/auth-shell.tsx:36`) é sempre clara: fixa os tokens de tema claro
   nela (texto, placeholders e `.field` dentro dela), também com o tema escuro.
4. **Um vermelho só**: `--tag-bad` vira a mesma família do `--danger` (claro texto `#b3203f` sobre `#fde5e9`;
   escuro `#ff8fa3` sobre `rgba(255,90,119,.16)`). "Atrasada", "Parado há", "1 parado", "Faltam" e "36 dias" no
   mesmo vermelho. **"Cancelado" vira etiqueta neutra** (cinza): cancelar não é erro.
5. **Dourado só para marca, progresso e seleção**: "Pausado" e "1 a cobrar" viram etiqueta neutra; "Completar a
   ficha (N)" em Mentorados vira chip de filtro igual aos outros filtros (com contador).
6. **Etiqueta da mentoria** (RDV, 2M, 6M) cinza neutra em todas as telas (hoje dourada na Ficha, na Reunião e no
   Controle mensal).
7. **Barra das metas** dourada como as de jornada e PME (hoje azul `--viz-2`, `modulo.css` ~3652). Link "Meta: …"
   (`.tr-meta`) em `--tag-info`.
8. **Avatares** (`corDe` em `components/acompanhamento/ui.tsx:121` + classes `.ava.gN`): mesma variedade de matiz,
   bem menos saturação, para não brigar com as cores de status. "Toda a carteira" (`fila.tsx:413` e `:532`):
   ícone de grupo em círculo neutro, sem o ponto.
9. **Botão desativado** (`globals.css` ~293 e ~326): mantém o fundo do botão (escuro no primário) com opacidade
   ~0,45 e texto branco; nunca cinza sobre cinza.
10. **Toque no celular** (< 768 px): links pequenos (`.pl-link`, "Corrigir", "Anexar comprovante") com área de
    toque ≥ 44 px.
11. **Fila**: "X dias" em vermelho só acima de 14 dias de atraso; até 14, `--ink2` com peso 600
    (`components/acompanhamento/fila.tsx:187`; o cabeçalho "Atrasados" continua vermelho). O limite vira constante
    nomeada.

Feito quando:
- `contraste.mjs` não acusa nada fora dos falsos positivos conhecidos, no claro e no escuro, em 1440 e 375.
- Capturas em 375 / 768 / 1024 / 1440, claro e escuro, das telas do canvas de comparação (Login, Controle mensal,
  Mensagens-modelo, Fila, Ficha, Mentorados) **e de 3 telas comerciais** (Leads, Pipeline, Hoje): os tokens são
  globais.
- `pnpm lint`, `pnpm typecheck`, e2e do Acompanhamento e `mobile-layout` passando; teste do JS de `/leads` < 150 KB.
- `CLAUDE.md` ganha a regra de cores (dourado = marca/progresso/seleção; vermelho único = atraso/erro; neutro =
  estado sem alarme) no mesmo PR.

## Fase 2: layout das páginas (um PR, depois da Fase 1)

Decidido:
1. **Plano > Esta semana** (`components/acompanhamento/plano-semana.tsx:74` e `:97`): Atrasadas primeiro, na coluna
   larga; "Vence esta semana" vazio vira uma linha compacta com o período.
2. **Reunião aberta** (`reuniao-registro.tsx:276` + `metas.tsx`): metas como linhas compactas (descrição, pilar,
   barra e %); clicar abre a edição, uma por vez; "Nova meta" abre o formulário. A página encolhe muito no celular.
3. **Um estilo de campo por tela**: os campos das metas iguais aos de "Tarefas da semana".
4. **Agenda da reunião**: os campos editáveis (Link e os demais) com cara de campo; hoje parecem texto.
5. **Configurações > Perfis** (`perfis-admin.tsx`): "Admin do Acompanhamento" vira título de coluna, uma vez; cada
   interruptor mantém o rótulo acessível.
6. **Ficha > Jornada**: com todas as etapas "Antes do sistema", o card Onboarding vira uma linha ("Onboarding feito
   antes do sistema"), sem ocupar a coluna.

Feito quando: capturas em 375 / 768 / 1024 / 1440 das telas mexidas, e2e do Acompanhamento passando (ajustar os que
dependem do layout antigo), lint e typecheck.

## Pendente com o Gabriel

- Texto do login para quem é do Acompanhamento (hoje: "Área comercial", "O pipeline, a agenda dos closers…", "Uso
  restrito à equipe comercial"). Não inventar: esperar a resposta.
