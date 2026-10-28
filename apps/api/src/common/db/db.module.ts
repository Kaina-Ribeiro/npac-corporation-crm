import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDb, type DbClient } from '@npac/db';
import { ENV, loadEnv, type Env } from '../../config/env.js';
import { FieldCrypto } from '../crypto/field-crypto.js';

/** `Db` conectado como npac_app (sujeito a RLS). */
export const DB = Symbol('DB');
const DB_CLIENT = Symbol('DB_CLIENT');

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv(process.env) },
    {
      provide: DB_CLIENT,
      inject: [ENV],
      useFactory: (env: Env) => createDb(env.APP_DATABASE_URL),
    },
    { provide: DB, inject: [DB_CLIENT], useFactory: (c: DbClient) => c.db },
    {
      provide: FieldCrypto,
      inject: [ENV],
      useFactory: (env: Env) => new FieldCrypto(env.FIELD_ENCRYPTION_KEY, env.BLIND_INDEX_KEY),
    },
  ],
  exports: [ENV, DB, FieldCrypto],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DB_CLIENT) private readonly client: DbClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.close();
  }
}
