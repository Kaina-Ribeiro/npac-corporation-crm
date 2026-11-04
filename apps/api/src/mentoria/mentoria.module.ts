import { Module } from '@nestjs/common';
import { MentoradosController } from './mentorados.controller.js';
import { MentoriaGuard } from './mentoria.guard.js';
import { MentoriaService } from './mentoria.service.js';

/** Acompanhamento de mentorados: base à parte do comercial, só Diretoria e Acompanhamento. */
@Module({
  controllers: [MentoradosController],
  providers: [MentoriaService, MentoriaGuard],
})
export class MentoriaModule {}
