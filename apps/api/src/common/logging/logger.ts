import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';

const PII = ['password', 'phone', 'email', 'instagram'];

// Nada de dado pessoal nos logs: cookies, tokens e campos de contato são mascarados.
export const loggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
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

export function createLogger(destination?: DestinationStream): Logger {
  return destination ? pino(loggerOptions, destination) : pino(loggerOptions);
}
