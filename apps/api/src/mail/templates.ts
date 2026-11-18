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
