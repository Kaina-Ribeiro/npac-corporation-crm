import type { Tx } from './client.js';
import { playbookScripts } from './schema/index.js';

// Conteúdo inicial; os HEADs editam pelo app. O seed nunca sobrescreve edições.
const SCRIPTS = [
  [
    'Preço',
    'Está caro',
    'Entendo. Caro comparado a quê? Vamos olhar quanto custa continuar como está hoje e quanto tempo leva para o investimento se pagar.',
  ],
  [
    'Preço',
    'Não tenho dinheiro agora',
    'Faz sentido querer segurança. Se o valor coubesse no seu mês, isso seria prioridade agora? Temos entrada + parcelas para caber no fluxo.',
  ],
  [
    'Tempo',
    'Não tenho tempo',
    'É justamente por isso que o método existe: organizar a rotina para render mais em menos horas. Quantas horas por semana você consegue reservar?',
  ],
  [
    'Confiança',
    'Preciso pensar',
    'Claro. O que exatamente você precisa pensar? Se for valor, formato ou resultado, a gente resolve agora enquanto as dúvidas estão frescas.',
  ],
  [
    'Confiança',
    'Já tentei e não funcionou',
    'O que você tentou e o que faltou? Aqui o acompanhamento é próximo, com metas semanais e alguém cobrando o resultado com você.',
  ],
  [
    'Decisão',
    'Preciso falar com meu cônjuge',
    'Ótimo que vocês decidem juntos. Vamos marcar uma conversa rápida com os dois para tirar as dúvidas dele(a) direto com a gente?',
  ],
] as const;

export async function seedPlaybook(tx: Tx) {
  await tx
    .insert(playbookScripts)
    .values(SCRIPTS.map(([topic, title, body], position) => ({ topic, title, body, position })))
    .onConflictDoNothing({ target: [playbookScripts.topic, playbookScripts.title] });
}
