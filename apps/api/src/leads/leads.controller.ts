import {
  BadRequestException,
  Body,
  Delete,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  leadCreateSchema,
  leadUpdateSchema,
  LEAD_SOURCES,
  STAGE_KEYS,
  TIERS,
  type LeadDTO,
  type Page,
} from '@npac/shared';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Can } from '../auth/can.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { LeadsService, type RequestMeta } from './leads.service.js';
import { LeadMutationsService } from './lead-mutations.service.js';

const MAX_PAGE_SIZE = 100;

const listQuerySchema = z.object({
  search: z.string().max(200).optional(),
  stage: z.enum(STAGE_KEYS).optional(),
  tier: z.enum(TIERS).optional(),
  sdrId: z.string().optional(),
  closerId: z.string().optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  period: z.enum(['TODAY', 'TOMORROW', 'WEEK', 'OVERDUE', 'NO_DATE', 'RANGE']).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  sort: z.enum(['createdAt', 'name', 'nextContactAt', 'meetingAt']).optional(),
  direction: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .default(20)
    .transform((n) => Math.min(n, MAX_PAGE_SIZE)),
});

const uuid = z.uuid();

function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new BadRequestException({ message: 'Dados inválidos', issues: z.flattenError(r.error) });
  }
  return r.data;
}

const meta = (req: FastifyRequest): RequestMeta => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'],
});

@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly mutations: LeadMutationsService,
  ) {}

  @Patch(':id')
  @Can('lead:move')
  update(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest,
  ) {
    if (!uuid.safeParse(id).success) throw new NotFoundException();
    return this.mutations.update(u, id, parse(leadUpdateSchema, body), meta(req));
  }

  @Delete(':id')
  @Can('lead:delete')
  remove(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest,
  ) {
    if (!uuid.safeParse(id).success) throw new NotFoundException();
    return this.mutations.remove(
      u,
      id,
      parse(z.object({ version: z.number().int().positive() }).strict(), body).version,
      meta(req),
    );
  }

  @Post()
  @HttpCode(201)
  @Can('lead:create')
  create(
    @CurrentUser() u: SessionUser,
    @Body() body: unknown,
    @Req() req: FastifyRequest,
  ): Promise<{ id: string }> {
    return this.leads.create(u, parse(leadCreateSchema, body), meta(req));
  }

  @Get('catalog')
  catalog(@CurrentUser() u: SessionUser) {
    return this.leads.catalog(u);
  }

  @Get('pipeline')
  pipeline(@CurrentUser() u: SessionUser, @Req() req: FastifyRequest) {
    return this.leads.pipeline(u, { page: 1, pageSize: 30 }, meta(req));
  }

  @Post('pipeline/search')
  @HttpCode(200)
  pipelineSearch(@CurrentUser() u: SessionUser, @Body() body: unknown, @Req() req: FastifyRequest) {
    return this.leads.pipeline(u, parse(listQuerySchema, body), meta(req));
  }

  @Get()
  list(
    @CurrentUser() u: SessionUser,
    @Query() query: unknown,
    @Req() req: FastifyRequest,
  ): Promise<Page<LeadDTO>> {
    // Pesquisa pessoal só por POST: não fica em histórico, URL ou logs de proxy.
    return this.leads.list(
      u,
      parse(listQuerySchema.omit({ search: true }).strict(), query),
      meta(req),
    );
  }

  @Post('search')
  @HttpCode(200)
  search(
    @CurrentUser() u: SessionUser,
    @Body() body: unknown,
    @Req() req: FastifyRequest,
  ): Promise<Page<LeadDTO>> {
    return this.leads.list(u, parse(listQuerySchema, body), meta(req));
  }

  @Get(':id')
  get(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Req() req: FastifyRequest,
  ): Promise<LeadDTO> {
    if (!uuid.safeParse(id).success) throw new NotFoundException();
    return this.leads.get(u, id, meta(req));
  }
}
