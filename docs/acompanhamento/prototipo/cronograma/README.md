# Protótipo do NPAC-60 — Cronograma do PME

Desenho: `docs/superpowers/specs/2026-11-24-cronograma-design.md`. Capturas feitas sobre as telas reais do dev
(conta `duda`), com as partes novas encaixadas por `prototipo.js`. Nomes = mentorados fictícios do seed; itens =
textos genéricos do banco da planilha (nenhum desafio pessoal). **Não é código do produto.**

A história das capturas é uma só: Mentorado Fictício 01 fez o RDV, está na 2M e recebe o 2º PME.

| Arquivo | Tela | O que mostrar |
|---|---|---|
| `envio-*.png` | Ficha → card PME atual → "Registrar envio" | janela "Enviar o 2º PME" com as sugestões do modelo da planilha, "Trocar", "Tirar", "Adicionar EAP", "Item só desta pessoa" e o selo "Estava na planilha para este PME" |
| `envio-trocar-*.png` | a mesma janela, trocando o desafio | busca no banco; o que a pessoa já recebeu (no 1º PME ou no RDV) aparece apagado |
| `card-*.png` | Ficha → Jornada → PME atual | tarefas do cronograma agrupadas abaixo das extras, com Feita/Não feita/Pendente e comprovante; a % do PME conta todas |
| `aba-*.png` | Ficha → aba "Cronograma" | resumo por bloco, PME a PME, "Antes do sistema · da planilha", "No RDV" (outra inscrição) e "Já tinha antes" |
| `banco-*.png` | Configurações → Cronograma (Admin) | os 5 blocos, busca, "Novo …", Editar, Esconder/Mostrar, "Enviado N vezes" |
| `importacao-*.png` | Configurações → Importação (Admin) | card "Planilha do cronograma" depois do da carteira: prévia, dúvidas (RDV × 2M), sem ficha, "Importar" |

Larguras 1440, 1024, 768 e 375; `escuro` em envio, card e aba (1440 e 375). Os números da importação são de exemplo
(o arquivo real tem 293 itens, 249 colunas, 6 "não fez" e 113 "já tinha"; o casamento com as fichas só se sabe na
hora).

Refazer (dev no ar na porta 3000, na raiz do repositório):

```sh
node docs/acompanhamento/prototipo/cronograma/capturar.mjs [envio|envio-trocar|card|aba|banco|importacao]
```

## Versão 2 (24/11, depois da crítica de designer)

Achatada no padrão que o sistema já usa, como Linear e Attio: uma caixa com linhas separadas por fio fino
(`.pl-lista`/`.pl-mod`, de Configurações → PMEs), o seletor cinza `.seg` (de Envios), títulos "Nome N" (`.ob-h`) e a
escala de letra 13/15/17. A janela de envio é uma lista: tocar no item troca, "+ Adicionar" é uma linha discreta por
bloco. A troca no computador é uma caixa suspensa presa ao item, com a busca primeiro (como o menu de status do
Linear); no celular, tela própria com "Voltar" e linhas tocáveis, sem botão "Escolher". A aba "Cronograma" é uma lista
agrupada por PME, sem quadros de números. O banco é igual a Configurações → PMEs (número, texto, "43 envios", ›). A
importação vem em 3 passos (Arquivo → Revisar colunas → Importar). As revisões anteriores ficam no histórico do git.
