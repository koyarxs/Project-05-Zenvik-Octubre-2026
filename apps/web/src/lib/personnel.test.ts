import { describe, it, expect } from 'vitest';
import { accessSummary } from './personnel';
import { employeeSchema } from './schemas';
const basic = { first_name: 'Ana', last_name: 'Test', email: '', hire_date: '', is_active: true };
describe('perfiles laborales', () => {
  it('permite ficha sin cuenta ni cargo', () => expect(employeeSchema.safeParse(basic).success).toBe(true));
  it('acepta cargo propio y jornada descriptiva', () => expect(employeeSchema.safeParse({ ...basic, job_title: 'Encargada de apertura', work_schedule: 'Según acuerdo', phone: '+56 (9) 1234-5678' }).success).toBe(true));
  it('valida teléfono', () => expect(employeeSchema.safeParse({ ...basic, phone: 'javascript:123' }).success).toBe(false));
  it('limita observaciones', () => expect(employeeSchema.safeParse({ ...basic, admin_notes: 'x'.repeat(1001) }).success).toBe(false));
  it('limita cargo y código', () => { expect(employeeSchema.safeParse({ ...basic, job_title: 'x'.repeat(121) }).success).toBe(false); expect(employeeSchema.safeParse({ ...basic, employee_code: 'x'.repeat(65) }).success).toBe(false); });
  it('no presenta datos de cuenta inexistente', () => expect(accessSummary(null)).toBe('Sin cuenta vinculada'));
  it('distingue rol y suspensión', () => expect(accessSummary({ user_id: 'secret-uuid', account_name: 'ana', role: 'ADMIN', access_enabled: false })).toBe('ana · Administrador · Suspendido'));
  it('oculta identificadores técnicos en historial', () => expect(accessSummary({ user_id: 'secret-uuid', role: 'EMPLOYEE', access_enabled: true })).not.toContain('secret-uuid'));
  it('no inventa un rol desconocido', () => expect(accessSummary({ user_id: 'id', role: 'UNKNOWN' })).toContain('Sin rol'));
});
