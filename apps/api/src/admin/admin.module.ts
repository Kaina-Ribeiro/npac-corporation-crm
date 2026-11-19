import { Module } from '@nestjs/common';
import { AcessosController, AcessosService } from './acessos.js';
import { AccessRequestsController, AccessRequestsService } from './access-requests.js';
import { GerenteGuard } from './areas.js';
import { AdminCatalogController, AdminCatalogService } from './catalog.js';
import { LgpdController, LgpdService } from './lgpd.js';
import { AdminUsersController, AdminUsersService } from './users.js';

@Module({
  controllers: [
    AdminUsersController,
    AdminCatalogController,
    LgpdController,
    AccessRequestsController,
    AcessosController,
  ],
  providers: [
    AdminUsersService,
    AdminCatalogService,
    LgpdService,
    AccessRequestsService,
    AcessosService,
    GerenteGuard,
  ],
})
export class AdminModule {}
