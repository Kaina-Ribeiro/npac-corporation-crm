import { describe, expect, it } from 'vitest';
import { ACTIONS, can } from '../src/permissions.js';

const SDR_ALLOWED = [
  'lead:create',
  'lead:update',
  'lead:move',
  'meeting:schedule',
  'meeting:reschedule',
  'meeting:outcome',
  'sale:register',
  'note:write',
  'task:write',
  'report:view',
  'export:whatsapp',
  'chat:use',
];
const CLOSER_ALLOWED = [
  'lead:move',
  'meeting:reschedule',
  'meeting:outcome',
  'sale:register',
  'note:write',
  'task:write',
  'report:view',
  'export:whatsapp',
  'chat:use',
];

describe('can', () => {
  it.each(ACTIONS)('HEAD pode %s', (a) => expect(can({ role: 'HEAD' }, a)).toBe(true));
  it.each(ACTIONS)('SDR e %s', (a) =>
    expect(can({ role: 'SDR' }, a)).toBe(SDR_ALLOWED.includes(a)),
  );
  it.each(ACTIONS)('CLOSER e %s', (a) =>
    expect(can({ role: 'CLOSER' }, a)).toBe(CLOSER_ALLOWED.includes(a)),
  );
});
