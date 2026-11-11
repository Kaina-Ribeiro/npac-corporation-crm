import { join } from 'node:path';
import { Inject, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Db } from '@npac/db';
import { DB } from '../common/db/db.module.js';
import { ENV, type Env } from '../config/env.js';
import { MEDIA_STORE, VolumeMediaStore, type MediaStore } from './media-store.js';
import { apagarPendentes } from './media-worker.js';
import { FichaService } from './ficha.service.js';
import { InscricoesController } from './inscricoes.controller.js';
import { InscricoesService } from './inscricoes.service.js';
import { MentoriaCrypto } from './mentoria-crypto.js';
import { MentoriaGuard } from './mentoria.guard.js';
import { MidiaController } from './midia.controller.js';
import { PerfilGuard } from './perfil.guard.js';
import { PerfisController } from './perfis.controller.js';
import { PerfisService } from './perfis.service.js';

/** Acompanhamento de mentorados: base à parte do comercial, só Diretoria e Acompanhamento. */
@Module({
  controllers: [PerfisController, InscricoesController, MidiaController],
  providers: [
    MentoriaGuard,
    PerfilGuard,
    PerfisService,
    InscricoesService,
    FichaService,
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
