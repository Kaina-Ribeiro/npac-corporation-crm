import type { MailMessage } from './mail.js';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Só o primeiro nome: é o único dado pessoal que vai no e-mail. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

/** Selo "N" da marca, em HTML de e-mail (sem fonte externa nem imagem). */
const mark = `<span style="display:inline-block;width:36px;height:36px;line-height:36px;border-radius:10px;background:#121110;color:#e2bb66;font-size:20px;font-weight:800;text-align:center">N</span>`;

/**
 * "Esqueci minha senha", com os textos do protótipo "Login da equipe" (canvas, tela 3): botão
 * "Criar senha nova" com o link de uso único. Sem usuário, e-mail ou outro dado além do primeiro nome.
 */
export function resetPasswordMail(
  to: string,
  name: string,
  url: string,
  /** Por extenso, ex.: "1 hora". */
  prazoTexto: string,
): MailMessage {
  const nome = firstName(name);
  const oi = nome ? `Oi, ${nome}.` : 'Oi.';
  const pedido =
    'Recebemos um pedido para criar uma senha nova no sistema da NPAC. Toque no botão para escolher a sua.';
  const prazo = `O link vale ${prazoTexto} e só funciona uma vez. Se não foi você, ignore este e-mail: a sua senha continua a mesma.`;
  const rodape = 'NPAC Corporation · Uso restrito à equipe da NPAC';
  const text = [oi, '', pedido, '', `Criar senha nova: ${url}`, '', prazo, '', rodape].join('\n');
  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px 12px;background:#f2f2f4;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1d1d1f">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:18px">
    <tr><td style="padding:26px 22px">
      <p style="margin:0 0 14px">${mark}</p>
      <p style="margin:0 0 14px;font-size:16px;font-weight:600">${esc(oi)}</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#333336">${esc(pedido)}</p>
      <p style="margin:0 0 18px"><a href="${esc(url)}" style="display:inline-block;padding:14px 22px;border-radius:13px;background:#1d1d1f;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">Criar senha nova</a></p>
      <p style="margin:0 0 14px;font-size:13px;line-height:1.55;color:#4f4f54">${esc(prazo)}</p>
      <p style="margin:0;padding-top:12px;border-top:1px solid #ececef;font-size:12px;color:#6a6a6f">${esc(rodape)}</p>
    </td></tr>
  </table>
</body>
</html>`;
  return { to, subject: 'Crie a sua senha nova', text, html };
}

/** E-mail curto do sistema (Meu perfil, NPAC-53): saudação, um destaque opcional e parágrafos. */
function simpleMail(
  to: string,
  subject: string,
  name: string,
  paragraphs: string[],
  highlight?: string,
): MailMessage {
  const nome = firstName(name);
  const oi = nome ? `Oi, ${nome}.` : 'Oi.';
  const rodape = 'NPAC Corporation · Uso restrito à equipe da NPAC';
  const text = [
    oi,
    '',
    ...(highlight ? [highlight, ''] : []),
    ...paragraphs.flatMap((p) => [p, '']),
    rodape,
  ].join('\n');
  const destaque = highlight
    ? `<p style="margin:0 0 18px;font-size:30px;font-weight:700;letter-spacing:6px;color:#1d1d1f">${esc(highlight)}</p>`
    : '';
  const corpo = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#333336">${esc(p)}</p>`,
    )
    .join('\n      ');
  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px 12px;background:#f2f2f4;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1d1d1f">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:18px">
    <tr><td style="padding:26px 22px">
      <p style="margin:0 0 14px">${mark}</p>
      <p style="margin:0 0 14px;font-size:16px;font-weight:600">${esc(oi)}</p>
      ${destaque}
      ${corpo}
      <p style="margin:0;padding-top:12px;border-top:1px solid #ececef;font-size:12px;color:#6a6a6f">${esc(rodape)}</p>
    </td></tr>
  </table>
</body>
</html>`;
  return { to, subject, text, html };
}

/** Código para confirmar o e-mail novo (vai ao endereço novo). Só o primeiro nome e o código. */
export function emailCodeMail(to: string, name: string, code: string): MailMessage {
  return simpleMail(
    to,
    'Seu código para trocar o e-mail',
    name,
    [
      'Use este código no sistema da NPAC para confirmar o seu e-mail novo. Vale por 10 minutos.',
      'Se não foi você, ignore este e-mail: nada muda na sua conta.',
    ],
    code,
  );
}

/** Aviso ao endereço antigo depois da troca, sem o endereço novo. */
export function emailChangedMail(to: string, name: string): MailMessage {
  return simpleMail(to, 'O e-mail da sua conta foi trocado', name, [
    'O e-mail da sua conta no sistema da NPAC acabou de ser trocado. Daqui em diante, os avisos vão para o endereço novo.',
    'Não foi você? Fale com a liderança.',
  ]);
}

/**
 * Convite (NPAC-54, texto aprovado pelo Gabriel em 19/11): usuário, senha temporária e o botão para a
 * tela de entrada da área. Só o primeiro nome; o sistema pede a troca da senha no primeiro acesso.
 */
export function inviteMail(
  to: string,
  name: string,
  username: string,
  password: string,
  url: string,
): MailMessage {
  const nome = firstName(name);
  const oi = nome ? `Oi, ${nome}.` : 'Oi.';
  const criada = 'A sua conta no sistema da NPAC foi criada. Use estes dados para entrar:';
  const troca = 'No primeiro acesso, o sistema pede para você trocar essa senha por uma sua.';
  const aviso = 'Não esperava este e-mail? Fale com a liderança.';
  const rodape = 'NPAC Corporation · Uso restrito à equipe da NPAC';
  const text = [
    oi,
    '',
    criada,
    '',
    `Usuário: ${username}`,
    `Senha temporária: ${password}`,
    '',
    `Entrar no sistema: ${url}`,
    '',
    troca,
    '',
    aviso,
    '',
    rodape,
  ].join('\n');
  const dado = (rotulo: string, valor: string) =>
    `<p style="margin:0 0 6px;font-size:14px;color:#4f4f54">${esc(rotulo)}: <b style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:16px;color:#1d1d1f">${esc(valor)}</b></p>`;
  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px 12px;background:#f2f2f4;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1d1d1f">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:18px">
    <tr><td style="padding:26px 22px">
      <p style="margin:0 0 14px">${mark}</p>
      <p style="margin:0 0 14px;font-size:16px;font-weight:600">${esc(oi)}</p>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#333336">${esc(criada)}</p>
      <div style="margin:0 0 18px;padding:14px 16px;border-radius:13px;background:#f6f6f8">
        ${dado('Usuário', username)}
        ${dado('Senha temporária', password)}
      </div>
      <p style="margin:0 0 18px"><a href="${esc(url)}" style="display:inline-block;padding:14px 22px;border-radius:13px;background:#1d1d1f;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">Entrar no sistema</a></p>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:#333336">${esc(troca)}</p>
      <p style="margin:0 0 14px;font-size:13px;line-height:1.55;color:#4f4f54">${esc(aviso)}</p>
      <p style="margin:0;padding-top:12px;border-top:1px solid #ececef;font-size:12px;color:#6a6a6f">${esc(rodape)}</p>
    </td></tr>
  </table>
</body>
</html>`;
  return { to, subject: 'Seu acesso ao sistema da NPAC', text, html };
}
