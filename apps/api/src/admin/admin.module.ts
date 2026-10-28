import { Module } from '@nestjs/common';
import { AdminCatalogController, AdminCatalogService } from './catalog.js';
import { LgpdController, LgpdService } from './lgpd.js';
import { AdminUsersController, AdminUsersService } from './users.js';

@Module({
  controllers: [AdminUsersController, AdminCatalogController, LgpdController],
  providers: [AdminUsersService, AdminCatalogService, LgpdService],
})
export class AdminModule {}
