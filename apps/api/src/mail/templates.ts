import type { MailMessage } from './mail.js';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Só o primeiro nome: é o único dado pessoal que vai no e-mail. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

/**
 * "Esqueci minha senha": botão "Criar nova senha" com o link de uso único. Sem usuário, e-mail ou
 * qualquer dado além do primeiro nome.
 */
export function resetPasswordMail(
  to: string,
  name: string,
  url: string,
  /** Por extenso, ex.: "1 hora". */
  prazoTexto: string,
): MailMessage {
  const nome = firstName(name);
  const ola = nome ? `Olá, ${nome}.` : 'Olá.';
  const text = [
    ola,
    '',
    'Recebemos um pedido para criar uma nova senha para a sua conta na NPAC.',
    '',
    `Criar nova senha: ${url}`,
    '',
    `O link vale por ${prazoTexto} e só funciona uma vez.`,
    'Se não foi você, ignore este e-mail: a sua senha continua a mesma.',
  ].join('\n');
  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1d1d1f">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px">
    <tr><td style="padding:32px 28px">
      <p style="margin:0 0 16px;font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#8a6d1f">NPAC</p>
      <p style="margin:0 0 12px;font-size:16px">${esc(ola)}</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.5">Recebemos um pedido para criar uma nova senha para a sua conta na NPAC.</p>
      <p style="margin:0 0 24px"><a href="${esc(url)}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#1d1d1f;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none">Criar nova senha</a></p>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#333336">O link vale por ${esc(prazoTexto)} e só funciona uma vez.</p>
      <p style="margin:0;font-size:14px;line-height:1.5;color:#333336">Se não foi você, ignore este e-mail: a sua senha continua a mesma.</p>
    </td></tr>
  </table>
</body>
</html>`;
  return { to, subject: 'Criar nova senha', text, html };
}
