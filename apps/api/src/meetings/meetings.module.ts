import { Module } from '@nestjs/common';
import { MeetingsController } from './meetings.controller.js';
import { MeetingsService } from './meetings.service.js';

@Module({ controllers: [MeetingsController], providers: [MeetingsService] })
export class MeetingsModule {}
