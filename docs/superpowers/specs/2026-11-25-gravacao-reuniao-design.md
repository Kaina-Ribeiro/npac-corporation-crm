# NPAC-78: gravação da reunião pelo link do Drive (desenho curto)

Aprovado pelo Gabriel em 25/11/2026 ("Começa pela 2", "vamos colar o link do drive invés de fazer upload do vídeo", "sim").

## Por quê

A Eduarda pediu "armazenar as gravações das reuniões no sistema". As gravações já ficam no Google Drive (resposta "A").
Subir o vídeo daria centenas de GB por mês; o link resolve "achar a gravação pela reunião" sem custo de armazenamento.

## Abordagens

| | Como | Troca |
|---|---|---|
| 1. Só o link | campo + "Abrir no Drive" | mais simples; sai do sistema para ver |
| **2. Link + player (escolhida)** | campo + vídeo tocando dentro da reunião (`drive.google.com/file/d/<id>/preview`) | ~1 dia; quem assiste precisa de acesso ao arquivo no Drive |
| 3. Automático (Google) | o sistema puxa a gravação do Meet sozinho | 1–2 semanas, depende de Workspace; fica para depois |

## O que entra

- Card **"Gravação"** na página da reunião (`/acompanhamento/reunioes/[id]`), abaixo de "Registro", só com a reunião
  **Realizada**: campo "Link da gravação (Google Drive)" (salva ao sair do campo), o player 16:9, "Abrir no Drive" e a dica
  "Quem for assistir precisa ter acesso ao arquivo no Drive."
- Quem cola: quem edita o registro (`mentoria_edita_reuniao`). Quem assiste: quem vê a reunião (RLS de hoje; Especialista
  só as que conduz).
- Só link do Google Drive de arquivo (`drive.google.com/file/d/<id>` ou `drive.google.com/open?id=<id>`); outro dá 400
  "Cole o link da gravação no Google Drive". Campo vazio apaga.
- Coluna `mentoria_reunioes.gravacao` **cifrada** com AAD (como os textos do registro); fora do CSV; histórico só com o
  nome do campo ("Gravação"); a anonimização (LGPD) apaga.
- CSP: `frame-src https://drive.google.com` (hoje cai no `default-src 'self'`).

## Fica de fora

Selo "tem gravação" em listas e na ficha; puxar do Google sozinho (opção 3); outros provedores (Zoom, YouTube).

## Decisões minhas (o Gabriel pode corrigir)

- Card só em Realizada; link cifrado; só Drive; guarda o link como colado (sem espaços nas pontas); o id sai do link na
  leitura pela mesma função pura (`idDoDrive` em `sh/mentoria/reunioes.ts`), usada pela validação e pela tela.
