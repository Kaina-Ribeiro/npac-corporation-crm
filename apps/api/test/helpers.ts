import { Controller, Get } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Can } from '../src/auth/can.decorator.js';
import { TEST_PASSWORD } from './global-setup.js';

export { TEST_PASSWORD };
export const owner = ownerSql('npac_test_api');
export const ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
export const protectedRoute = '/api/_test/protected';
export const leadCreateRoute = '/api/_test/lead-create';

/** Rotas que só existem no módulo de teste (sem @Public). */
@Controller('_test')
class TestOnlyController {
  @Get('protected')
  protected(): { ok: true } {
    return { ok: true };
  }

  @Get('lead-create')
  @Can('lead:create')
  leadCreate(): { ok: true } {
    return { ok: true };
  }
}

export async function createTestApp(): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [TestOnlyController],
  }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    // TEST_LOGS=1 mostra exceções da API ao depurar testes.
    logger: process.env.TEST_LOGS ? ['error'] : false,
  });
  await configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

export async function closeTestApp(app: NestFastifyApplication): Promise<void> {
  await app.close();
  await closeTestConnections();
}

/** Zera o estado de auth entre testes: sessões, rate limit, auditoria, MFA e flags. */
export async function resetAuthState(): Promise<void> {
  await owner`truncate session, rate_limit, audit_log, two_factor, verification`;
  await owner`update "user" set active = true, must_change_password = true, two_factor_enabled = false`;
}

export type Cookie = string;

export function cookiesOf(res: request.Response): Cookie {
  const set = res.headers['set-cookie'] as unknown as string[] | undefined;
  return (set ?? []).map((c) => c.split(';')[0]).join('; ');
}

export function api(app: NestFastifyApplication) {
  const server = app.getHttpServer();
  const get = (path: string, cookie?: Cookie) => {
    const r = request(server).get(path).set('Origin', ORIGIN);
    return cookie ? r.set('Cookie', cookie) : r;
  };
  const post = (path: string, body: object, cookie?: Cookie) => {
    const r = request(server).post(path).set('Origin', ORIGIN).send(body);
    return cookie ? r.set('Cookie', cookie) : r;
  };
  const patch = (path: string, body: object, cookie: Cookie) =>
    request(server).patch(path).set('Origin', ORIGIN).set('Cookie', cookie).send(body);
  const del = (path: string, body: object, cookie: Cookie) =>
    request(server).delete(path).set('Origin', ORIGIN).set('Cookie', cookie).send(body);
  /** Login por usuário; os testes passam o e-mail e o usuário é a parte antes do @. */
  const signInRaw = (email: string, password = TEST_PASSWORD) =>
    post('/api/auth/sign-in/username', { username: email.split('@')[0], password });
  /** Faz login (zerando a troca obrigatória de senha) e devolve o cookie de sessão. */
  const signIn = async (email: string): Promise<Cookie> => {
    await owner`update "user" set must_change_password = false where email = ${email}`;
    const res = await signInRaw(email);
    if (res.status !== 200) throw new Error(`login falhou (${res.status}): ${res.text}`);
    return cookiesOf(res);
  };
  return { get, post, patch, del, signIn, signInRaw };
}

export async function auditCount(action: string): Promise<number> {
  const [r] = await owner<
    { n: number }[]
  >`select count(*)::int as n from audit_log where action = ${action}`;
  return r?.n ?? 0;
}

export async function deactivate(email: string): Promise<void> {
  await owner`update "user" set active = false where email = ${email}`;
}
