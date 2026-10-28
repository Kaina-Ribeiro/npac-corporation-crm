import 'reflect-metadata';
import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';

/** Monta a app (usado pelo main e pelos testes e2e). */
export async function createApp(opts: { logger?: false } = {}): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: opts.logger !== false,
    logger: opts.logger,
  });
  if (opts.logger !== false) app.useLogger(app.get(Logger));
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
  return app;
}
