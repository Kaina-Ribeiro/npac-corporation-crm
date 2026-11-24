import {
  Body,
  Controller,
  Delete,
  Get,
  Global,
  Headers,
  HttpCode,
  Module,
  Post,
} from '@nestjs/common';
import { AllRoles } from '../auth/all-roles.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { ENV, type Env } from '../config/env.js';
import { BotApiTelegramSender, DisabledTelegramSender, TELEGRAM_SENDER } from './telegram.js';
import { TelegramService } from './telegram.service.js';

/** Meu perfil > "Avisos pelo Telegram" (NPAC-74). Todos os cargos, também o Acompanhamento. */
@AllRoles()
@Controller('me/telegram')
export class TelegramContaController {
  constructor(private readonly telegram: TelegramService) {}

  @Get()
  status(@CurrentUser() u: SessionUser) {
    this.telegram.assertEnabled();
    return this.telegram.status(u.id);
  }

  @Post('code')
  @HttpCode(200)
  code(@CurrentUser() u: SessionUser) {
    this.telegram.assertEnabled();
    return this.telegram.code(u.id);
  }

  @Post('test')
  @HttpCode(204)
  async test(@CurrentUser() u: SessionUser): Promise<void> {
    this.telegram.assertEnabled();
    await this.telegram.test(u.id);
  }

  @Delete()
  @HttpCode(204)
  async disconnect(@CurrentUser() u: SessionUser): Promise<void> {
    this.telegram.assertEnabled();
    await this.telegram.disconnect(u.id);
  }
}

@Controller('webhooks')
export class TelegramWebhookController {
  constructor(private readonly telegram: TelegramService) {}

  /**
   * Chamado pelo Telegram. O segredo do cabeçalho vem antes de olhar o corpo; com ele certo, sempre
   * 200 (o Telegram repete o que não recebe 2xx).
   */
  @Public()
  @Post('telegram')
  @HttpCode(200)
  async receive(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    this.telegram.assertSecret(secret);
    await this.telegram.receive(body);
    return { ok: true };
  }
}

/** Os testes trocam `TELEGRAM_SENDER` por um Telegram em memória. */
@Global()
@Module({
  controllers: [TelegramContaController, TelegramWebhookController],
  providers: [
    {
      provide: TELEGRAM_SENDER,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.TELEGRAM_BOT_TOKEN
          ? new BotApiTelegramSender(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_API_URL)
          : new DisabledTelegramSender(),
    },
    TelegramService,
  ],
  exports: [TelegramService],
})
export class TelegramModule {}
