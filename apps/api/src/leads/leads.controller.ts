import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { leadCreateSchema, STAGE_KEYS, TIERS, type LeadDTO, type Page } from '@npac/shared';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Can } from '../auth/can.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { LeadsService, type RequestMeta } from './leads.service.js';

const MAX_PAGE_SIZE = 100;

const listQuerySchema = z.object({
  search: z.string().max(200).optional(),
  stage: z.enum(STAGE_KEYS).optional(),
  tier: z.enum(TIERS).optional(),
  sdrId: z.string().optional(),
  closerId: z.string().optional(),
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
  constructor(private readonly leads: LeadsService) {}

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

  @Get()
  list(@CurrentUser() u: SessionUser, @Query() query: unknown): Promise<Page<LeadDTO>> {
    return this.leads.list(u, parse(listQuerySchema, query));
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
