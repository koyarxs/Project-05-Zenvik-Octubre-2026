 'use client';
import { useState } from 'react';
import { usePagedResource } from '@/hooks/use-paged-resource';
import { api } from '@/lib/http';
import { accessSummary } from '@/lib/personnel';
import { employeePath } from '@/lib/data';
import { canManage, roleLabels, type Business, type Employee } from '@/lib/types';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
import { ErrorNotice, Loading, Field } from './feedback';
type Account = { id: string; name: string; role: 'ADMIN' | 'EMPLOYEE'; access_enabled: boolean; linked: boolean };
type Revision = { id: string; action: string; actor_name: string | null; created_at: string; snapshot: Record<string, unknown> };
const selectClass = 'h-11 w-full rounded-lg border border-input bg-white px-3 text-sm';
export function EmployeeAccess({ business, employee, onSaved }: { business: Business; employee: Employee; onSaved: () => void }) {
  return <section className="surface mt-6 p-6"><h2 className="text-sm font-bold">Acceso al sistema</h2><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3"><div><dt className="text-xs text-muted-foreground">Cuenta vinculada</dt><dd className="mt-1 break-words">{employee.account_name || 'Sin cuenta vinculada'}</dd></div><div><dt className="text-xs text-muted-foreground">Rol de acceso</dt><dd className="mt-1">{employee.access_role ? roleLabels[employee.access_role] : 'Sin rol asignado'}</dd></div><div><dt className="text-xs text-muted-foreground">Estado de acceso</dt><dd className="mt-1">{!employee.user ? 'Sin acceso vinculado' : employee.access_enabled ? 'Habilitado' : 'Suspendido'}</dd></div></dl><p className="mt-4 text-xs leading-6 text-muted-foreground">El cargo laboral y el estado administrativo de la ficha no cambian los permisos de la cuenta.</p>{business.role === 'OWNER' && employee.access_role !== 'OWNER' && <AccessEditor key={employee.updated_at} business={business} employee={employee} onSaved={onSaved} />}{canManage(business.role) && <EmployeeHistory businessId={business.id} employee={employee} />}</section>;
}
function AccessEditor({ business, employee, onSaved }: { business: Business; employee: Employee; onSaved: () => void }) {
  const accounts = usePagedResource<Account>(`/api/v1/businesses/${business.id}/accounts/`);
  const [open, setOpen] = useState(false); const [user, setUser] = useState(employee.user ?? '');
  const [role, setRole] = useState(employee.access_role === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE');
  const [enabled, setEnabled] = useState(employee.access_enabled ?? true);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setError('');
    try {
      await api(`${employeePath(business.id, employee.id)}access/`, { method: 'PATCH', body: { user: user || null, ...(user ? { role, access_enabled: enabled } : {}), expected_updated_at: employee.updated_at } });
      setOpen(false); onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos cambiar el acceso.'); } finally { setBusy(false); }
  }
  return <><Button variant="outline" className="mt-4" onClick={() => setOpen(true)}>Gestionar acceso</Button><Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }} title="Gestionar acceso del trabajador" description="Solo se pueden vincular cuentas que ya pertenecen a este negocio. No se crean usuarios ni contraseñas."><form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>{error && <ErrorNotice message={error} />}{accounts.error ? <ErrorNotice message={accounts.error.message} retry={accounts.reload} /> : !accounts.data ? <Loading label="Consultando cuentas autorizadas…" /> : <><Field id="employee-account" label="Cuenta del negocio"><select id="employee-account" value={user} className={selectClass} onChange={event => { const value = event.target.value; const account = accounts.data?.find(row => row.id === value); setUser(value); setRole(account?.role ?? 'EMPLOYEE'); setEnabled(account?.access_enabled ?? true); }}><option value="">Sin cuenta vinculada</option>{accounts.data.filter(account => !account.linked || account.id === employee.user).map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field>{user && <><Field id="employee-role" label="Rol de acceso"><select id="employee-role" className={selectClass} value={role} onChange={event => setRole(event.target.value)}><option value="EMPLOYEE">Trabajador</option><option value="ADMIN">Administrador</option></select></Field><label className="flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />Acceso habilitado al negocio</label></>}<p className="rounded-lg bg-muted p-3 text-xs leading-6">Confirma la cuenta y el rol antes de guardar. Administrador permite gestionar personal, turnos y solicitudes. Suspender el acceso bloquea este negocio en la próxima petición, sin cerrar la cuenta global ni modificar otros negocios. Desvincular una ficha no revoca la membresía.</p><Button disabled={busy}>{busy ? 'Guardando…' : 'Confirmar cambio de acceso'}</Button></>}</form></Dialog></>;
}
function EmployeeHistory({ businessId, employee }: { businessId: string; employee: Employee }) {
  const history = usePagedResource<Revision>(`${employeePath(businessId, employee.id)}history/?version=${encodeURIComponent(employee.updated_at)}`);
  const labels: Record<string, string> = { first_name: 'Nombre', last_name: 'Apellido', email: 'Correo', phone: 'Teléfono', job_title: 'Cargo', employee_code: 'Código interno', work_schedule: 'Jornada', admin_notes: 'Observaciones', hire_date: 'Incorporación', is_active: 'Activo', account_name: 'Cuenta vinculada' };
  return <details className="mt-6 border-t border-border pt-4"><summary className="cursor-pointer text-sm font-semibold">Historial de cambios del trabajador</summary>{history.error ? <ErrorNotice message={history.error.message} retry={history.reload} /> : !history.data ? <Loading label="Consultando historial…" /> : history.data.length ? <ol className="mt-4 max-h-96 space-y-4 overflow-auto">{history.data.map(row => <li key={row.id} className="rounded-lg border border-border p-4 text-xs"><strong>{{ CREATE: 'Registro', UPDATE: 'Edición', ACCESS: 'Cambio de acceso', BASELINE: 'Estado previo' }[row.action] ?? row.action}</strong><p className="my-2">{new Date(row.created_at).toLocaleString('es-CL', { timeZone: 'America/Santiago' })} · {row.actor_name ?? 'Sin autor registrado'}</p>{row.action === 'ACCESS' ? <p className="break-words">Antes: {accessSummary(row.snapshot.before)}. Después: {accessSummary(row.snapshot.after)}.</p> : <dl className="grid gap-2 sm:grid-cols-2">{Object.entries(labels).map(([field, label]) => <div key={field}><dt className="text-muted-foreground">{label}</dt><dd className="break-words">{row.snapshot[field] === 'True' ? 'Sí' : row.snapshot[field] === 'False' ? 'No' : String(row.snapshot[field] || 'No informado')}</dd></div>)}</dl>}</li>)}</ol> : <p className="mt-3 text-xs text-muted-foreground">Sin cambios registrados desde la incorporación de esta auditoría.</p>}</details>;
}
