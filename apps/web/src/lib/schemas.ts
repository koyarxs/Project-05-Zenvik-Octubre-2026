import { z } from 'zod';
export const loginSchema = z.object({ username: z.string().trim().min(1, 'Ingresa tu usuario.').max(150), password: z.string().min(1, 'Ingresa tu contraseña.').max(128) });
export const registrationEmailSchema = z.object({ email: z.string().trim().max(254).pipe(z.email('Ingresa un correo válido.')) });
export const registerSchema = loginSchema.extend({
  ...registrationEmailSchema.shape,
  first_name: z.string().trim().min(1, 'Ingresa tus nombres.').max(150),
  last_name: z.string().trim().min(1, 'Ingresa tus apellidos.').max(150),
  phone: z.string().trim().max(30),
  password: z.string().refine(value => Array.from(value).length >= 15, 'Usa al menos 15 caracteres.')
    .refine(value => Array.from(value).length <= 128, 'Usa como máximo 128 caracteres.'),
  passwordConfirmation: z.string().min(1, 'Repite tu contraseña.'),
}).refine(data => !data.passwordConfirmation || data.password === data.passwordConfirmation, {
  path: ['passwordConfirmation'], message: 'Las contraseñas no coinciden.',
});
export const businessSchema = z.object({ name: z.string().trim().min(1, 'Ingresa el nombre comercial.').max(255), rut: z.string().trim().max(12, 'Revisa el formato del RUT.') });
export const employeeSchema = z.object({
  first_name: z.string().trim().min(1, 'Ingresa el nombre.').max(150),
  last_name: z.string().trim().min(1, 'Ingresa el apellido.').max(150),
  email: z.union([z.literal(''), z.email('Ingresa un correo válido.')]),
  hire_date: z.union([z.literal(''), z.iso.date('Ingresa una fecha válida.')]),
  is_active: z.boolean(),
  phone: z.string().trim().max(32).regex(/^[0-9+() .-]*$/, 'Indica un teléfono válido.').optional(),
  job_title: z.string().trim().max(120).optional(),
  employee_code: z.string().trim().max(64).optional(),
  work_schedule: z.string().trim().max(120).optional(),
  admin_notes: z.string().trim().max(1000).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type BusinessInput = z.infer<typeof businessSchema>;
export type EmployeeInput = z.infer<typeof employeeSchema>;
