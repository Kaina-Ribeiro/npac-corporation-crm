import { Body, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { caixaSchema, etapaDispensarSchema, etapaPatchSchema } from '@npac/shared';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { entityId, validate } from '../common/validate.js';
import { validarComAviso } from './erros.js';
import { MentoriaController } from './mentoria.guard.js';
import { OnboardingService } from './onboarding.service.js';
import { Perfis } from './perfil.guard.js';

@MentoriaController('')
@Perfis('ACOMPANHAMENTO', 'OPERACAO')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post('onboarding/painel')
  @HttpCode(200)
  painel(@CurrentUser() u: SessionUser) {
    return this.onboarding.painel(u);
  }

  @Patch('onboarding/:etapaId')
  atualizar(
    @CurrentUser() u: SessionUser,
    @Param('etapaId') etapaId: string,
    @Body() body: unknown,
  ) {
    return this.onboarding.atualizar(u, entityId(etapaId), validarComAviso(etapaPatchSchema, body));
  }

  @Post('onboarding/:etapaId/dispensar')
  @HttpCode(200)
  dispensar(
    @CurrentUser() u: SessionUser,
    @Param('etapaId') etapaId: string,
    @Body() body: unknown,
  ) {
    return this.onboarding.dispensar(
      u,
      entityId(etapaId),
      validate(etapaDispensarSchema, body).version,
    );
  }

  @Put('inscricoes/:id/caixa')
  caixa(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.onboarding.salvarCaixa(u, entityId(id), validarComAviso(caixaSchema, body));
  }
}
