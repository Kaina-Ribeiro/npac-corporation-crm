import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { MAIL_SENDER, SmtpMailSender } from './mail.js';

/** Envio de e-mail; os testes trocam `MAIL_SENDER` por uma caixa em memória. */
@Global()
@Module({
  providers: [
    { provide: MAIL_SENDER, inject: [ENV], useFactory: (env: Env) => new SmtpMailSender(env) },
  ],
  exports: [MAIL_SENDER],
})
export class MailModule {}
