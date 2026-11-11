'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight, BriefcaseBusiness, CalendarDays, Clock, Plus, Search, Users, X } from 'lucide-react';
import { WorkerProfile } from '@/components/worker-profile';
import { BusinessGate } from '@/components/business-gate';
import styles from './workers.module.css';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Input } from '@/components/ui/input';
import { ErrorNotice, Loading } from '@/components/feedback';

import { usePagedResource } from '@/hooks/use-paged-resource';
import { useResource } from '@/hooks/use-resource';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { employeePath } from '@/lib/data';
import { dateLabel } from '@/lib/shift-time';
import { canManage, roleLabels, type Business, type Employee, type Page as PageData } from '@/lib/types';
function WorkerCardArt() {
  return <span className={styles.cardArt} aria-hidden="true">
    <svg viewBox="0 0 90 48" fill="none">
      <circle cx="19" cy="13" r="9" fill="#77b1ff" />
      <path d="M3 40a16 16 0 0 1 32 0v3H3z" fill="#428ef9" />
      <path d="M46 11h34M46 23h34M46 35h23" stroke="#9bc4ff" strokeWidth="5" strokeLinecap="round" />
    </svg>
  </span>;
}

function WorkersHeading({ manager }: { manager: boolean }) {
  return <header className={styles.hero}>
    <h1>Trabajadores</h1>
    <p>{manager ? 'Gestiona el equipo de tu negocio, sus roles y accesos.' : 'Consulta tu ficha y tu información laboral.'}</p>
    <span className={styles.accent} aria-hidden="true" />
    <svg className={styles.heroWave} viewBox="0 0 700 140" preserveAspectRatio="none" aria-hidden="true">
      <path fill="#cce0ff" fillOpacity=".68" d="M0 140C146 124 154 16 296 38S420 145 550 52 655 9 700 63V140Z" />
      <path fill="#78b6ff" fillOpacity=".57" d="M185 140C302 72 384 146 477 85S576-25 648 27 678 68 700 81V140Z" />
      <path fill="#2080ff" fillOpacity=".57" d="M350 140C468 136 489 63 565 41S652 48 700 91V140Z" />
    </svg>
    <WorkerCardArt />
  </header>;
}

type TeamSummary = { total: number; active: number; scheduled_today: number; on_leave: number };
const teamMetrics = [
  { key: 'total', label: 'Total equipo', icon: Users, tone: 'blue' },
  { key: 'active', label: 'Activos', icon: BriefcaseBusiness, tone: 'green' },
  { key: 'scheduled_today', label: 'En turno hoy', icon: Clock, tone: 'orange' },
  { key: 'on_leave', label: 'Con permisos', icon: CalendarDays, tone: 'purple' },
] as const;

function TeamMetrics({ businessId }: { businessId: string }) {
  const { data, error, retry } = useResource<{ team_summary: TeamSummary | null }>(`/api/v1/businesses/${businessId}/dashboard/`);
  return <>
    <div className={styles.metrics} role="group" aria-label="Resumen del equipo">
      {teamMetrics.map(({ key, label, icon: Icon, tone }) => (
        <div key={key} className={styles.metric} data-tone={tone}>
          <span className={styles.metricIcon}><Icon aria-hidden="true" /></span>
          <span><span className={styles.metricLabel}>{label}</span><strong className={styles.metricValue}>{data?.team_summary?.[key] ?? '—'}</strong></span>
        </div>
      ))}
    </div>
    {error && <ErrorNotice message="No pudimos cargar el resumen del equipo." retry={retry} />}
  </>;
}

function Employees({ business }: { business: Business }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ is_active: '', job_title: '', ordering: 'created_at' });
  const jobs = usePagedResource<{ id: string; name: string }>(`/api/v1/businesses/${business.id}/job-titles/`);
  const term = useDebouncedValue(search);
  const manage = canManage(business.role);
  const base = `/app/${business.id}/trabajadores`;
  const filterCount = Object.entries(filters).filter(([key, value]) => key !== 'ordering' && value).length;
  const hasFilters = !!search || filterCount > 0;
  const params = new URLSearchParams({ page: String(page) });
  if (term) params.set('search', term);
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const { data, error, retry } = useResource<PageData<Employee>>(`${employeePath(business.id)}?${params}`);

  function updateFilter(key: keyof typeof filters, value: string) {
    setFilters(current => ({ ...current, [key]: value }));
    setPage(1);
  }

  function clear() {
    setSearch('');
    setFilters({ is_active: '', job_title: '', ordering: 'created_at' });
    setPage(1);
  }

  return <div className={styles.screen}>
    <WorkersHeading manager />
    <TeamMetrics businessId={business.id} />
    {jobs.error && <ErrorNotice message="No pudimos cargar los cargos." retry={jobs.reload} />}
    <section className={styles.directory}>
      <div className={styles.toolbar}>
        <div className="flex items-center gap-3">
          <span className={styles.metricIcon}><Users className="size-4" /></span>
          <div><h2 className="text-sm font-bold">Directorio del equipo</h2>
            <p role="status" className="mt-1 text-[10px] text-muted-foreground">
              {term !== search ? 'Buscando…' : data ? `${data.count} ${data.count === 1 ? 'ficha encontrada' : 'fichas encontradas'}` : 'Consultando directorio…'}
            </p>
          </div>
        </div>
        <div className={styles.filters}>
          <div className="relative min-w-0 flex-1 sm:w-64">
            <label className="sr-only" htmlFor="search">Buscar trabajadores</label>
            <Search className="absolute top-3.5 left-3 size-3.5 text-muted-foreground" />
            <Input id="search" className="h-10 pl-9 text-xs" placeholder="Buscar nombre o correo…" value={search}
              maxLength={150} onChange={event => { setSearch(event.target.value); setPage(1); }} />
          </div>
          <select aria-label="Estado del trabajador" className={styles.filterInput} value={filters.is_active} onChange={event => updateFilter('is_active', event.target.value)}>
            <option value="">Todos los estados</option><option value="true">Activos</option><option value="false">Inactivos</option>
          </select>
          <select aria-label="Filtrar por cargo" className={styles.filterInput} value={filters.job_title} onChange={event => updateFilter('job_title', event.target.value)}>
            <option value="">Todos los cargos</option>
            {jobs.data?.map(row => <option key={row.id} value={row.name}>{row.name}</option>)}
          </select>
          <select aria-label="Ordenar trabajadores" className={styles.filterInput} value={filters.ordering} onChange={event => updateFilter('ordering', event.target.value)}>
            <option value="created_at">Orden de registro</option><option value="name">Nombre A–Z</option><option value="-name">Nombre Z–A</option>
            <option value="hire_date">Incorporación más antigua</option><option value="-hire_date">Incorporación más reciente</option><option value="job_title">Cargo</option>
          </select>
          {(hasFilters || filters.ordering !== 'created_at') && <Button variant="ghost" size="icon" aria-label="Limpiar filtros" onClick={clear}><X /></Button>}
        </div>
      </div>
    {error ? <div className="p-5"><ErrorNotice message={error.message} retry={retry} /></div> : !data ? <Loading label="Cargando trabajadores…" /> : data.results.length === 0 ? <div className={styles.empty}>
      <WorkerCardArt />
      <h3>{hasFilters ? 'No encontramos coincidencias' : 'Todavía no hay trabajadores'}</h3>
      <p>{hasFilters ? 'Prueba con otro nombre, correo o estado.' : 'Registra a la primera persona para comenzar a construir tu equipo.'}</p>
      {hasFilters ? <Button variant="outline" onClick={clear}>Limpiar filtros</Button>
        : <Button className={styles.action} asChild><Link href={`${base}/nuevo`}><Plus />Registrar primer trabajador</Link></Button>}
    </div> : <>
      <table className={`directory-table ${styles.records}`}>
        <caption className="sr-only">Trabajadores de {business.name}</caption>
        <thead><tr>
          <th scope="col">Persona</th>
          <th scope="col">Contacto</th>
          <th scope="col">Estado</th>
          <th scope="col">Ficha</th>
        </tr></thead>
        <tbody>
          {data.results.map(employee => (
            <tr key={employee.id}>
              <td>
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="avatar shrink-0">{employee.first_name[0]}{employee.last_name[0]}</span>
                  <div className="min-w-0">
                    <Link href={`${base}/${employee.id}`} className="font-semibold hover:underline">
                      {employee.first_name} {employee.last_name}
                    </Link>
                    <span className={styles.recordDetail}>{employee.job_title || 'Sin cargo informado'}</span>
                    <span className={styles.recordDetail}>Código: {employee.employee_code || 'Sin informar'}</span>
                    <span className={styles.recordDetail}>Negocio: {business.name}</span>
                  </div>
                </div>
              </td>
              <td>
                <span className={styles.mobileLabel}>Contacto</span>
                <span>{employee.email || 'Correo sin informar'}</span>
                <span className={styles.recordDetail}>Teléfono: {employee.phone || 'Sin informar'}</span>
              </td>
              <td>
                <span className={styles.mobileLabel}>Estado</span>
                <StatusBadge tone={employee.is_active ? 'success' : 'muted'}>{employee.is_active ? 'Activo' : 'Inactivo'}</StatusBadge>
                <span className={styles.recordDetail}>Jornada: {employee.work_schedule || 'Sin informar'}</span>
                <span className={styles.recordDetail}>
                  {employee.access_role ? `Cuenta: ${roleLabels[employee.access_role]}` : employee.user ? 'Cuenta vinculada' : 'Sin cuenta vinculada'}
                  {employee.user && !employee.access_enabled && ' · Acceso suspendido'}
                </span>
              </td>
              <td>
                <span className={styles.mobileLabel}>Ficha</span>
                <Link href={`${base}/${employee.id}`} className="text-link" aria-label={`Ver ficha de ${employee.first_name} ${employee.last_name}`}>
                  Ver ficha<ArrowUpRight className="size-3.5" />
                </Link>
                <span className={styles.recordDetail}>Incorporación: {employee.hire_date
                  ? dateLabel(employee.hire_date, { day: 'numeric', month: 'long', year: 'numeric' })
                  : 'Sin informar'}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between gap-2 border-t border-border p-5"><span className="text-[10px] text-muted-foreground">Página {page} · {data.count} resultados</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={!data.previous} onClick={() => setPage(p => p - 1)}>Anterior</Button><Button variant="outline" size="sm" disabled={!data.next} onClick={() => setPage(p => p + 1)}>Siguiente</Button></div></div>
    </>}</section>
    {manage && !!data?.count && <div className="flex justify-end"><Button className={styles.action} asChild><Link href={`${base}/nuevo`}><Plus />Registrar trabajador</Link></Button></div>}
  </div>;
}
export default function Page() { return <BusinessGate>{business => business.role === 'EMPLOYEE' ? <div className={styles.screen}><WorkersHeading manager={false} /><div className={styles.directory}><div className="p-5"><WorkerProfile business={business} /></div></div></div> : <Employees key={business.id} business={business} />}</BusinessGate>; }
