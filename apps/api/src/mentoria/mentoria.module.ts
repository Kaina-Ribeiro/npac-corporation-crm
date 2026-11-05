import { join } from 'node:path';
import { Inject, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Db } from '@npac/db';
import { DB } from '../common/db/db.module.js';
import { ENV, type Env } from '../config/env.js';
import { BackupController } from './backup.controller.js';
import { EscritaService } from './escrita.service.js';
import { FichasController } from './fichas.controller.js';
import { FichasService } from './fichas.service.js';
import { ImportController } from './import.controller.js';
import { ImportService } from './import.service.js';
import { MEDIA_STORE, VolumeMediaStore, type MediaStore } from './media-store.js';
import { apagarPendentes } from './media-worker.js';
import { MentoradosController } from './mentorados.controller.js';
import { MentoriaCrypto } from './mentoria-crypto.js';
import { MentoriaGuard } from './mentoria.guard.js';
import { MentoriaService } from './mentoria.service.js';
import { MidiaController } from './midia.controller.js';
import { PessoasController, RegistrosController } from './registros.controller.js';
import { RdvController } from './rdv.controller.js';
import { RdvService } from './rdv.service.js';

/** Acompanhamento de mentorados: base à parte do comercial, só Diretoria e Acompanhamento. */
@Module({
  controllers: [
    MentoradosController,
    FichasController,
    RegistrosController,
    PessoasController,
    ImportController,
    MidiaController,
    BackupController,
    RdvController,
  ],
  providers: [
    RdvService,
    MentoriaService,
    EscritaService,
    FichasService,
    ImportService,
    MentoriaGuard,
    {
      provide: MentoriaCrypto,
      inject: [ENV],
      useFactory: (env: Env) => new MentoriaCrypto(env.MENTORADO_ENCRYPTION_KEY),
    },
    {
      provide: MEDIA_STORE,
      inject: [ENV],
      // Fora de produção, sem MEDIA_DIR: pasta local ignorada pelo git.
      useFactory: (env: Env) =>
        new VolumeMediaStore(env.MEDIA_DIR ?? join(process.cwd(), '.media')),
    },
  ],
})
export class MentoriaModule implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(MEDIA_STORE) private readonly store: MediaStore,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Worker da fila de exclusão de mídia a cada minuto (nos testes roda sob demanda). */
  onModuleInit() {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      void apagarPendentes(this.db, this.store).catch(() => {});
    }, 60_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }
}
