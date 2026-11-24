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

## Revisão de design (24/11)

Depois da crítica: rodapé fixo com "Enviar" e a contagem de itens na janela; "Adicionar" em cada bloco (com
"escrever um … só para esta pessoa" dentro da busca); comprovante só em quem marcou Feita, no card; etiqueta "Não fez"
no próprio item da planilha e texto inteiro (sem cortar) na aba; "Escondido" como etiqueta no banco; "Para você
decidir" destacado na importação; toque de 44 px no celular e cinza médio nas linhas apagadas (contraste).
