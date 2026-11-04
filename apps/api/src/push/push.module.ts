import { Body, Controller, Get, Global, HttpCode, Module, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ENV, type Env } from '../config/env.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { validate } from '../common/validate.js';
import { PUSH_SENDER, PushService, WebPushSender } from './push.service.js';
import { REMINDER_CLOCK, ReminderScheduler, systemClock } from './reminders.js';

const endpoint = z.url().startsWith('https://').max(1000);
const subscription = z
  .object({
    endpoint,
    keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  })
  .strip();

/** Navegador e sistema, resumidos (ex.: "Chrome · Android"), para a pessoa reconhecer o aparelho. */
function shortAgent(ua: string | undefined): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Navegador';
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS/.test(ua)
          ? 'macOS'
          : 'Outro';
  return `${browser} · ${os}`;
}

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}
  @Get('key') key() {
    return this.push.publicKey();
  }
  @Post('subscriptions') @HttpCode(200) subscribe(
    @CurrentUser() u: SessionUser,
    @Body() body: unknown,
    @Req() req: FastifyRequest,
  ) {
    const s = validate(subscription, body);
    return this.push.subscribe(
      u.id,
      { endpoint: s.endpoint, ...s.keys },
      shortAgent(req.headers['user-agent']),
    );
  }
  @Post('subscriptions/remove') @HttpCode(200) remove(
    @CurrentUser() u: SessionUser,
    @Body() body: unknown,
  ) {
    return this.push.unsubscribe(u.id, validate(z.object({ endpoint }).strict(), body).endpoint);
  }
}

@Global()
@Module({
  controllers: [PushController],
  providers: [
    { provide: PUSH_SENDER, inject: [ENV], useFactory: (env: Env) => new WebPushSender(env) },
    { provide: REMINDER_CLOCK, useValue: systemClock },
    PushService,
    ReminderScheduler,
  ],
  exports: [PushService, ReminderScheduler],
})
export class PushModule {}
