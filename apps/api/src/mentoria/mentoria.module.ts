import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { EscritaService } from './escrita.service.js';
import { FichasController } from './fichas.controller.js';
import { ImportController } from './import.controller.js';
import { ImportService } from './import.service.js';
import { MentoradosController } from './mentorados.controller.js';
import { MentoriaCrypto } from './mentoria-crypto.js';
import { MentoriaGuard } from './mentoria.guard.js';
import { MentoriaService } from './mentoria.service.js';
import { PessoasController, RegistrosController } from './registros.controller.js';

/** Acompanhamento de mentorados: base à parte do comercial, só Diretoria e Acompanhamento. */
@Module({
  controllers: [
    MentoradosController,
    FichasController,
    RegistrosController,
    PessoasController,
    ImportController,
  ],
  providers: [
    MentoriaService,
    EscritaService,
    ImportService,
    MentoriaGuard,
    {
      provide: MentoriaCrypto,
      inject: [ENV],
      useFactory: (env: Env) => new MentoriaCrypto(env.MENTORADO_ENCRYPTION_KEY),
    },
  ],
})
export class MentoriaModule {}
