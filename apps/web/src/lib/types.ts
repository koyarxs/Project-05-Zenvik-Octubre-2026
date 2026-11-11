export type Role = 'OWNER' | 'ADMIN' | 'EMPLOYEE';
export type SessionTimes = { session_started_at: number; session_expires_at: number; session_server_time: number };
export type User = { id: string; username: string; email: string; is_platform_admin?: boolean } & Partial<SessionTimes>;
export type Business = { id: string; name: string; rut: string; is_active: boolean; role: Role; created_at: string; updated_at: string };
export type Employee = { phone?: string; job_title?: string; employee_code?: string; work_schedule?: string; admin_notes?: string; access_role?: Role | null; access_enabled?: boolean; account_name?: string | null; id: string; business: string; user: string | null; first_name: string; last_name: string; email: string; hire_date: string | null; is_active: boolean; created_at: string; updated_at: string };
export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };
export type Shift = { break_minutes?: number; break_included?: boolean; notes?: string; planned_minutes?: number; approved_leave_conflict?: boolean; id: string; business: string; employee: string; employee_name: string; starts_at: string; ends_at: string; status: 'SCHEDULED' | 'CANCELLED'; created_at: string; updated_at: string };
export const roleLabels: Record<Role, string> = { OWNER: 'Propietario', ADMIN: 'Administrador', EMPLOYEE: 'Trabajador' };
export const canManage = (role: Role) => role === 'OWNER' || role === 'ADMIN';
