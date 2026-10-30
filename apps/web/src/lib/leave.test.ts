import { describe, expect, it } from 'vitest';
import { leaveSchema } from './leave';
const values = { request_type: 'PERSONAL', start_date: '2026-10-29', end_date: '2026-10-29', reason: '' };
describe('solicitudes por días completos', () => {
  it('permite un día y motivo vacío', () => { expect(leaveSchema.safeParse(values).success).toBe(true); });
  it('rechaza fechas invertidas', () => { expect(leaveSchema.safeParse({ ...values, end_date: '2026-10-28' }).success).toBe(false); });
  it('rechaza fechas inexistentes', () => { expect(leaveSchema.safeParse({ ...values, start_date: '2026-02-30' }).success).toBe(false); });
  it('restringe categorías y longitud del motivo', () => {
    expect(leaveSchema.safeParse({ ...values, request_type: 'VACATION' }).success).toBe(false);
    expect(leaveSchema.safeParse({ ...values, reason: 'a'.repeat(1001) }).success).toBe(false);
  });
});
