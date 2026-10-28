import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Can } from '../auth/can.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { entityId, validate } from '../common/validate.js';
import { ChatService } from './chat.service.js';

const message = z
  .object({ body: z.string().trim().min(1).max(2000), leadId: z.uuid().optional() })
  .strict();
const dm = z.object({ userId: z.string().min(1) }).strict();
const read = z.object({ lastReadId: z.number().int().nonnegative() }).strict();
const cursor = z.coerce.number().int().positive().optional();

@Controller('chat')
@Can('chat:use')
export class ChatController {
  constructor(private readonly chat: ChatService) {}
  @Get('channels') channels(@CurrentUser() u: SessionUser) {
    return this.chat.channels(u);
  }
  @Get('users') users(@CurrentUser() u: SessionUser) {
    return this.chat.users(u);
  }
  @Post('dm') dm(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.chat.openDm(u, validate(dm, body).userId);
  }
  @Get('channels/:id/messages') messages(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Query('before') before?: string,
  ) {
    return this.chat.messages(u, entityId(id), validate(cursor, before));
  }
  @Post('channels/:id/messages') send(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.chat.send(u, entityId(id), validate(message, body));
  }
  @Post('channels/:id/read') @HttpCode(200) read(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.chat.read(u, entityId(id), validate(read, body).lastReadId);
  }
}
