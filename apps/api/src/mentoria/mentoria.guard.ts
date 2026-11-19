import {
  applyDecorators,
  Controller,
  Inject,
  Injectable,
  NotFoundException,
  UseGuards,
  UseInterceptors,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Db } from '@npac/db';
import type { FastifyRequest } from 'fastify';
import { AllRoles } from '../auth/all-roles.decorator.js';
import { RequiresMfa } from '../auth/requires-mfa.decorator.js';
import { DB } from '../common/db/db.module.js';
import { AvisosRearme } from './avisos.scheduler.js';
import { acessoDoPedido, PerfilGuard } from './perfil.guard.js';

/**
 * Só a Diretoria e quem tem vínculo no Acompanhamento enxergam o módulo (D1; NPAC-54 Fase 4: pelo
 * vínculo em `area_membros`, não pelo resumo `role`, para quem está nas duas áreas). Os demais
 * recebem 404, não 403: o módulo não se revela (D14). A RLS (mentoria_perfil, mentoria_admin)
 * repete a regra no banco.
 */
@Injectable()
export class MentoriaGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Db) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const eu = await acessoDoPedido(this.db, ctx.switchToHttp().getRequest<FastifyRequest>());
    if (!eu.membro) throw new NotFoundException();
    return true;
  }
}

/**
 * Controller do módulo: prefixo `mentoria/...`, MFA obrigatório (default-deny, D18), guarda de
 * cargo e de perfil, e o rearme do push da Fila depois de cada escrita. Todo controller do módulo
 * usa este decorator; um teste varre as rotas.
 */
export const MentoriaController = (path: string) =>
  applyDecorators(
    Controller(`mentoria/${path}`),
    AllRoles(),
    RequiresMfa(),
    UseGuards(MentoriaGuard, PerfilGuard),
    UseInterceptors(AvisosRearme),
  );
