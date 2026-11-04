import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { MentoradosController } from './mentorados.controller.js';
import { MentoriaCrypto } from './mentoria-crypto.js';
import { MentoriaGuard } from './mentoria.guard.js';
import { MentoriaService } from './mentoria.service.js';

/** Acompanhamento de mentorados: base à parte do comercial, só Diretoria e Acompanhamento. */
@Module({
  controllers: [MentoradosController],
  providers: [
    MentoriaService,
    MentoriaGuard,
    {
      provide: MentoriaCrypto,
      inject: [ENV],
      useFactory: (env: Env) => new MentoriaCrypto(env.MENTORADO_ENCRYPTION_KEY),
    },
  ],
})
export class MentoriaModule {}
