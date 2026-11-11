export const featureLabels: Record<string, string> = {
  employees: 'Gestión de trabajadores', shifts: 'Planificación de turnos', leaves: 'Permisos y ausencias',
  worker_portal: 'Portal del trabajador', attendance: 'Asistencia operativa', geolocation: 'Ubicación puntual',
  geofences: 'Ubicaciones y geocercas', reports: 'Reportes operativos', exports: 'Exportación de datos',
  incidents: 'Incidencias y solicitudes', notifications: 'Notificaciones internas',
};
export const limitLabels: Record<string, string> = { active_employees: 'Trabajadores activos', active_sites: 'Ubicaciones activas', administrators: 'Propietarios y administradores activos' };
export const stateLabels: Record<string, string> = { PENDING: 'Pendiente de contratación', TRIALING: 'En período de prueba', ACTIVE: 'Activa', PAST_DUE: 'Pago pendiente', CANCELLED: 'Cancelada', EXPIRED: 'Vencida', SUSPENDED: 'Suspendida' };
export type BillingPrice = { id: string; amount: number; currency: string; interval: 'MONTH' | 'YEAR'; effective_at: string };
export type BillingPlan = { id: string; code: string; name: string; description: string; version_id: string; version: number; features: string[]; limits: Record<string, number | null>; trial_days: number; prices: BillingPrice[] };
export type PlanCatalog = { plans: BillingPlan[]; checkout_enabled: boolean; payment_environment: 'disabled' | 'sandbox' };
export type Subscription = { id: string; legacy_access: boolean; state: string; revision: number; plan: string | null; version_id: string | null; price: BillingPrice | null; period_start: string | null; period_end: string | null; cancel_at_period_end: boolean; features: string[]; limits: Record<string, number | null>; usage: Record<string, number>; writable: boolean; checkout_enabled: boolean; changes: { id: string; action: string; effective_at: string; applied: boolean }[] };
export type Payment = { id: string; amount: number; currency: string; state: string; provider: string; period_start: string; period_end: string; paid_at: string | null; created_at: string };
export function money(amount: number, currency = 'CLP') { return new Intl.NumberFormat('es-CL', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount); }
export function billingDate(value: string | null) { return value ? new Date(value).toLocaleDateString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'medium' }) : 'Sin período contratado'; }
export function safeCheckout(url: string) {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && parsed.hostname === 'sandbox.flow.cl' && !parsed.username && !parsed.password && !parsed.port; } catch { return false; }
}
// A public plan code is a navigation preference, never a grant of paid rights.
export function rememberPlan(code: string) { try { sessionStorage.setItem('zenvik:selected-plan', code); } catch {} }
export function selectedPlan() { try { const code = sessionStorage.getItem('zenvik:selected-plan'); return code && /^[a-z0-9_-]{1,50}$/.test(code) ? code : null; } catch { return null; } }
export function clearSelectedPlan() { try { sessionStorage.removeItem('zenvik:selected-plan'); } catch {} }
