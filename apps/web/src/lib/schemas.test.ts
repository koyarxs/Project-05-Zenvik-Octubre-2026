import { describe, expect, it } from 'vitest';
import { businessSchema, employeeSchema, registerSchema } from './schemas';
import { canManage } from './types';
describe('Formularios y roles', () => {
  it('rechaza un registro incompleto y una contraseña corta', () => { expect(registerSchema.safeParse({ username: '', email: 'no', password: '123' }).success).toBe(false); });
  it('acepta un negocio sin RUT', () => { expect(businessSchema.parse({ name: ' Negocio ', rut: '' })).toEqual({ name: 'Negocio', rut: '' }); });
  it('acepta trabajador sin correo ni fecha', () => { expect(employeeSchema.safeParse({ first_name: 'Ana', last_name: 'Pérez', email: '', hire_date: '', is_active: true }).success).toBe(true); });
  it('rechaza una fecha inexistente', () => { expect(employeeSchema.safeParse({ first_name: 'Ana', last_name: 'Pérez', email: '', hire_date: '2026-02-31', is_active: true }).success).toBe(false); });
  it('solo permite gestión a OWNER y ADMIN', () => { expect(canManage('OWNER')).toBe(true); expect(canManage('ADMIN')).toBe(true); expect(canManage('EMPLOYEE')).toBe(false); });
});
