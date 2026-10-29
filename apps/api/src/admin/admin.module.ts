import { Module } from '@nestjs/common';
import { AccessRequestsController, AccessRequestsService } from './access-requests.js';
import { AdminCatalogController, AdminCatalogService } from './catalog.js';
import { LgpdController, LgpdService } from './lgpd.js';
import { AdminUsersController, AdminUsersService } from './users.js';

@Module({
  controllers: [
    AdminUsersController,
    AdminCatalogController,
    LgpdController,
    AccessRequestsController,
  ],
  providers: [AdminUsersService, AdminCatalogService, LgpdService, AccessRequestsService],
})
export class AdminModule {}
