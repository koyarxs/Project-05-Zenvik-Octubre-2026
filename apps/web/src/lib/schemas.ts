import { z } from 'zod';
export const loginSchema = z.object({ username: z.string().trim().min(1, 'Ingresa tu usuario.').max(150), password: z.string().min(1, 'Ingresa tu contraseña.').max(128) });
export const registerSchema = loginSchema.extend({ email: z.email('Ingresa un correo válido.'), password: z.string().min(8, 'Usa al menos 8 caracteres.').max(128) });
export const businessSchema = z.object({ name: z.string().trim().min(1, 'Ingresa el nombre comercial.').max(255), rut: z.string().trim().max(12, 'Revisa el formato del RUT.') });
export const employeeSchema = z.object({
  first_name: z.string().trim().min(1, 'Ingresa el nombre.').max(150),
  last_name: z.string().trim().min(1, 'Ingresa el apellido.').max(150),
  email: z.union([z.literal(''), z.email('Ingresa un correo válido.')]),
  hire_date: z.union([z.literal(''), z.iso.date('Ingresa una fecha válida.')]),
  is_active: z.boolean(),
});
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type BusinessInput = z.infer<typeof businessSchema>;
export type EmployeeInput = z.infer<typeof employeeSchema>;
