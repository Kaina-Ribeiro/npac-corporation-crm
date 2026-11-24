import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';

const PII = ['password', 'phone', 'email', 'instagram'];

// Nada de dado pessoal nos logs: cookies, tokens e campos de contato são mascarados.
export const loggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  serializers: {
    // Não serializa headers, corpo, IP ou query string em logs de acesso.
    req: (req: { method?: string; url?: string }) => ({
      method: req.method,
      url: req.url?.split('?')[0],
    }),
    // Só o status: os cabeçalhos de resposta (~1 KB por linha) enchiam o log e as linhas de push
    // sumiam em minutos (NPAC-71).
    res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
    // Exceções de drivers podem conter SQL e parâmetros com dados pessoais.
    err: (err: { name?: string }) => ({ type: err.name ?? 'Error' }),
  },
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      ...PII,
      ...PII.map((f) => `*.${f}`),
      ...PII.map((f) => `*.*.${f}`),
    ],
    censor: '[redacted]',
  },
};

/**
 * Pedidos que não entram no log de acesso: a checagem de saúde roda a cada poucos segundos e não
 * diz nada (NPAC-71). Erro dela continua aparecendo no log de erro do Nest.
 */
export const semLogDeAcesso = (req: { url?: string }) => req.url?.split('?')[0] === '/api/health';

export function createLogger(destination?: DestinationStream): Logger {
  return destination ? pino(loggerOptions, destination) : pino(loggerOptions);
}
