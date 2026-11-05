import { z } from 'zod';

const key32 = (name: string) =>
  z
    .string({ error: `${name} é obrigatória` })
    .transform((v) => Buffer.from(v, 'base64'))
    .refine((b) => b.length === 32, `${name} precisa decodificar (base64) para 32 bytes`);

const envSchema = z
  .object({
    APP_DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    FIELD_ENCRYPTION_KEY: key32('FIELD_ENCRYPTION_KEY'),
    BLIND_INDEX_KEY: key32('BLIND_INDEX_KEY'),
    /** Chave própria do Acompanhamento (cifra v2 com AAD); distinta da chave dos contatos. */
    MENTORADO_ENCRYPTION_KEY: key32('MENTORADO_ENCRYPTION_KEY'),
    API_PORT: z.coerce.number().int().positive().default(4000),
    WEB_ORIGIN: z.url(),
    /** Origens adicionais aceitas no login (ex.: túnel de teste), separadas por vírgula. */
    EXTRA_TRUSTED_ORIGINS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.url())),
    /** Web Push (VAPID, base64url). Sem as duas chaves o push fica desligado; a tela continua avisando. */
    VAPID_PUBLIC_KEY: z.string().min(1).optional(),
    VAPID_PRIVATE_KEY: z.string().min(1).optional(),
    /** Contato do remetente exigido pelo Web Push (https: ou mailto:); padrão: WEB_ORIGIN. */
    VAPID_SUBJECT: z.string().min(1).optional(),
    /** Diretório da mídia do Acompanhamento (fora do banco). Obrigatório em produção. */
    MEDIA_DIR: z.string().min(1).optional(),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  })
  .refine((e) => !e.MENTORADO_ENCRYPTION_KEY.equals(e.FIELD_ENCRYPTION_KEY), {
    message: 'MENTORADO_ENCRYPTION_KEY precisa ser distinta de FIELD_ENCRYPTION_KEY',
    path: ['MENTORADO_ENCRYPTION_KEY'],
  })
  .refine((e) => e.NODE_ENV !== 'production' || !!e.MEDIA_DIR, {
    message: 'MEDIA_DIR é obrigatória em produção (diretório da mídia do Acompanhamento)',
    path: ['MEDIA_DIR'],
  });

export type Env = z.infer<typeof envSchema>;

/** Valida o ambiente na subida; qualquer chave ausente ou inválida derruba o processo. */
export function loadEnv(raw: NodeJS.ProcessEnv | Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Configuração inválida:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export const ENV = Symbol('ENV');
