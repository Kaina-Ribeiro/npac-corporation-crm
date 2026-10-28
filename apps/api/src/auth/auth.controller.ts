import { All, Controller, Inject, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ENV, type Env } from '../config/env.js';
import { AUTH, type Auth } from './auth.js';
import { toHeaders } from './headers.js';
import { Public } from './public.decorator.js';

/** Encaminha /api/auth/* para o handler web do Better Auth. */
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @All('*')
  async handle(@Req() req: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && req.body !== undefined;
    const res = await this.auth.handler(
      new Request(new URL(req.url, this.env.WEB_ORIGIN), {
        method: req.method,
        headers: toHeaders(req),
        body: hasBody ? JSON.stringify(req.body) : undefined,
      }),
    );
    reply.status(res.status);
    res.headers.forEach((value, key) => {
      if (key !== 'set-cookie') reply.header(key, value);
    });
    const cookies = res.headers.getSetCookie();
    if (cookies.length > 0) reply.header('set-cookie', cookies);
    reply.send(await res.text());
  }
}
