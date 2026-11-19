// Caixa de e-mail falsa para testes e dev: um servidor SMTP que aceita tudo e guarda na memória,
// e um HTTP para ler o que chegou. Nada sai da máquina.
//
//   node scripts/caixa-falsa.mts            # SMTP 2525, HTTP 2526 (CAIXA_SMTP_PORT, CAIXA_HTTP_PORT)
//   API com SMTP_HOST=localhost SMTP_PORT=2525 MAIL_FROM="NPAC <crm@npac.test>"
//   GET  http://localhost:2526/mensagens    # [{ to, subject, text, html }], mais nova por último
//   DELETE http://localhost:2526/mensagens  # esvazia
//
// Só sintaxe que o Node 24 executa direto (tipos são apagados): sem enum nem parameter properties.
import { createServer as createHttp, type Server as HttpServer } from 'node:http';
import { createServer as createSmtp, type Server as SmtpServer } from 'node:net';
import { pathToFileURL } from 'node:url';

export type Mensagem = { to: string[]; subject: string; text: string; html: string };

function decode(headers: string, body: string): string {
  const cte = /content-transfer-encoding:\s*([\w-]+)/i.exec(headers)?.[1]?.toLowerCase();
  if (cte === 'base64') return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  if (cte === 'quoted-printable')
    return Buffer.from(
      body
        .replace(/=\r?\n/g, '')
        .replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16))),
      'latin1',
    ).toString('utf8');
  return body;
}

/** Partes de texto de uma mensagem MIME (o suficiente para o que o nodemailer gera). */
function parts(raw: string): { type: string; content: string }[] {
  const cut = raw.indexOf('\r\n\r\n');
  const headers = (cut < 0 ? raw : raw.slice(0, cut)).replace(/\r\n[ \t]+/g, ' ');
  const body = cut < 0 ? '' : raw.slice(cut + 4);
  const type =
    /content-type:\s*([^;\r\n]+)/i.exec(headers)?.[1]?.trim().toLowerCase() ?? 'text/plain';
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(headers)?.[1];
  if (type.startsWith('multipart/') && boundary)
    return body
      .split(`--${boundary}`)
      .slice(1)
      .filter((p) => !p.startsWith('--'))
      .flatMap((p) => parts(p.replace(/^\r\n/, '')));
  return [{ type, content: decode(headers, body) }];
}

function decodeWords(s: string): string {
  return s.replace(/=\?utf-8\?([bq])\?([^?]*)\?=/gi, (_, enc: string, text: string) =>
    enc.toLowerCase() === 'b'
      ? Buffer.from(text, 'base64').toString('utf8')
      : decode('content-transfer-encoding: quoted-printable', text.replace(/_/g, ' ')),
  );
}

function parse(raw: string, to: string[]): Mensagem {
  const cut = raw.indexOf('\r\n\r\n');
  const headers = raw.slice(0, cut < 0 ? raw.length : cut).replace(/\r\n[ \t]+/g, ' ');
  const subject = decodeWords(/^subject:\s*(.*)$/im.exec(headers)?.[1]?.trim() ?? '');
  const all = parts(raw);
  return {
    to,
    subject,
    text: all.find((p) => p.type === 'text/plain')?.content ?? '',
    html: all.find((p) => p.type === 'text/html')?.content ?? '',
  };
}

export type CaixaFalsa = {
  mensagens: Mensagem[];
  smtpPort: number;
  httpPort: number;
  close(): Promise<void>;
};

/** Sobe a caixa. Porta 0 = qualquer livre (os testes leem `smtpPort`/`httpPort`). */
export async function startCaixaFalsa(opts: { smtpPort?: number; httpPort?: number } = {}) {
  const mensagens: Mensagem[] = [];
  const smtp: SmtpServer = createSmtp((socket) => {
    let buffer = '';
    let data: string[] | null = null;
    let to: string[] = [];
    let authSteps = 0;
    const reply = (line: string) => socket.write(`${line}\r\n`);
    reply('220 caixa-falsa ESMTP');
    socket.on('error', () => socket.destroy());
    socket.on('data', (chunk) => {
      buffer += chunk.toString('latin1');
      let i: number;
      while ((i = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        if (data) {
          if (line === '.') {
            mensagens.push(parse(data.join('\r\n'), to));
            data = null;
            to = [];
            reply('250 guardado');
          } else data.push(line.startsWith('..') ? line.slice(1) : line);
          continue;
        }
        if (authSteps > 0) {
          authSteps -= 1;
          reply(authSteps > 0 ? '334 UGFzc3dvcmQ6' : '235 ok');
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO') reply('250-caixa-falsa\r\n250-AUTH PLAIN LOGIN\r\n250 OK');
        else if (cmd === 'HELO') reply('250 caixa-falsa');
        else if (cmd === 'AUTH') {
          // Aceita qualquer login: PLAIN numa linha ou em duas; LOGIN pede usuário e senha.
          const [, mech = '', initial] = line.split(' ');
          authSteps = mech.toUpperCase() === 'LOGIN' ? (initial ? 1 : 2) : initial ? 0 : 1;
          reply(authSteps === 0 ? '235 ok' : authSteps === 2 ? '334 VXNlcm5hbWU6' : '334 ');
        } else if (cmd === 'RCPT') {
          to.push(/<([^>]*)>/.exec(line)?.[1] ?? '');
          reply('250 OK');
        } else if (cmd === 'DATA') {
          data = [];
          reply('354 pode mandar');
        } else if (cmd === 'QUIT') {
          reply('221 tchau');
          socket.end();
        } else reply('250 OK');
      }
    });
  });
  const http: HttpServer = createHttp((req, res) => {
    if (req.url !== '/mensagens') {
      res.writeHead(404).end();
      return;
    }
    if (req.method === 'DELETE') mensagens.length = 0;
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(req.method === 'DELETE' ? [] : mensagens));
  });
  const listen = (s: SmtpServer | HttpServer, port: number) =>
    new Promise<number>((resolve, reject) => {
      s.once('error', reject);
      s.listen(port, '127.0.0.1', () => {
        const a = s.address();
        resolve(typeof a === 'object' && a ? a.port : port);
      });
    });
  const smtpPort = await listen(smtp, opts.smtpPort ?? 0);
  const httpPort = await listen(http, opts.httpPort ?? 0);
  const close = () =>
    Promise.all(
      [smtp, http].map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
    ).then(() => undefined);
  const caixa: CaixaFalsa = { mensagens, smtpPort, httpPort, close };
  return caixa;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const caixa = await startCaixaFalsa({
    smtpPort: Number(process.env.CAIXA_SMTP_PORT ?? 2525),
    httpPort: Number(process.env.CAIXA_HTTP_PORT ?? 2526),
  });
  console.log(
    `caixa falsa: SMTP localhost:${caixa.smtpPort}, mensagens em http://localhost:${caixa.httpPort}/mensagens`,
  );
}
