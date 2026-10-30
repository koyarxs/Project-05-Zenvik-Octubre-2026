export type Role = 'OWNER' | 'ADMIN' | 'EMPLOYEE';
export type User = { id: string; username: string; email: string };
export type Business = { id: string; name: string; rut: string; is_active: boolean; role: Role; created_at: string; updated_at: string };
export type Employee = { id: string; business: string; user: string | null; first_name: string; last_name: string; email: string; hire_date: string | null; is_active: boolean; created_at: string; updated_at: string };
export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };
export type Shift = { id: string; business: string; employee: string; employee_name: string; starts_at: string; ends_at: string; status: 'SCHEDULED' | 'CANCELLED'; created_at: string; updated_at: string };
export const roleLabels: Record<Role, string> = { OWNER: 'Propietario', ADMIN: 'Administrador', EMPLOYEE: 'Trabajador' };
export const canManage = (role: Role) => role === 'OWNER' || role === 'ADMIN';
