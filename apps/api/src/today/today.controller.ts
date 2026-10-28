import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { validate } from '../common/validate.js';
import { TodayService } from './today.service.js';

@Controller('today')
export class TodayController {
  constructor(private readonly today: TodayService) {}
  @Post('search')
  @HttpCode(200)
  search(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.today.search(
      u,
      validate(
        z.object({ sdrId: z.string().optional(), closerId: z.string().optional() }).strict(),
        body,
      ),
    );
  }
}
