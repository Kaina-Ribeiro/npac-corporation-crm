import { Module } from '@nestjs/common';
import { FotoController } from './foto.controller.js';
import { PerfilController } from './perfil.controller.js';

/** Meu perfil (NPAC-53): foto, nome e e-mail da própria pessoa. */
@Module({ controllers: [FotoController, PerfilController] })
export class ContaModule {}
