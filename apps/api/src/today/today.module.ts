import { Module } from '@nestjs/common';
import { TodayController } from './today.controller.js';
import { TodayService } from './today.service.js';
import { TasksController } from './tasks.controller.js';

@Module({ controllers: [TodayController, TasksController], providers: [TodayService] })
export class TodayModule {}
