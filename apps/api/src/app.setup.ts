import 'reflect-metadata';
import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';

/** Configuração comum (main e testes e2e): segurança, prefixo e no-store. */
export async function configureApp(app: NestFastifyApplication): Promise<void> {
  await app.register(helmet);
  app.setGlobalPrefix('api');
  // Respostas podem carregar dado pessoal: nada vai para cache.
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onSend', async (_req, reply) => {
      reply.header('Cache-Control', 'no-store');
    });
  app.enableShutdownHooks();
}

export async function createApp(opts: { logger?: false } = {}): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // Atrás do proxy (Caddy) o IP real vem do X-Forwarded-For.
    new FastifyAdapter({ trustProxy: process.env.TRUST_PROXY === 'true' }),
    { bufferLogs: opts.logger !== false, logger: opts.logger },
  );
  if (opts.logger !== false) app.useLogger(app.get(Logger));
  await configureApp(app);
  return app;
}
