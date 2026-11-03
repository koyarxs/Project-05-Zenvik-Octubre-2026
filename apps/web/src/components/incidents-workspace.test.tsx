import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { IncidentsWorkspace, IncidentForm, IncidentDetailPanel } from './incidents-workspace';
import { NotificationsWorkspace, NotificationBell } from './attendance-notifications';
import { useResource } from '@/hooks/use-resource';
import type { Business } from '@/lib/types';
vi.mock('@/hooks/use-resource', () => ({ useResource: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
const business: Business = { id: 'a', name: 'Negocio', role: 'EMPLOYEE', rut:'',is_active:true,created_at:'',updated_at:'' };
const policy = { version:0, categories:{ OTHER:'Otra situación' }, request_days:null, admin_review_enabled:true, notifications_enabled:true, exceptional_alerts:false, incomplete_after_minutes:null, review_guidance:'' };
const mock = (data: unknown, error?: Error) => vi.mocked(useResource).mockReturnValue({data,error,retry:vi.fn()});
describe('incidencias y notificaciones', () => {
  it('presenta carga y filtros sin decisiones administrativas al trabajador', () => {
    mock(undefined); const html = renderToStaticMarkup(<IncidentsWorkspace business={business} />);
    expect(html).toContain('Mis incidencias'); expect(html).toContain('Consultando incidencias'); expect(html).not.toContain('Política de incidencias'); expect(html).not.toContain('Auditoría');
  });
  it('lista estados reales, filtros y vacío', () => {
    mock({count:0,results:[],summary:{},policy,next:null,previous:null}); const html = renderToStaticMarkup(<IncidentsWorkspace business={business} />);
    expect(html).toContain('No hay solicitudes'); expect(html).toContain('En revisión'); expect(html).toContain('Filtrar categoría');
  });
  it('muestra errores recuperables', () => {
    mock(undefined,new Error('Sin conexión')); expect(renderToStaticMarkup(<IncidentsWorkspace business={business} />)).toContain('Sin conexión');
  });
  it('formulario diferencia hora declarada y exige ficha propia', () => {
    vi.mocked(useResource).mockImplementation(path => ({data:path.includes('policy') ? policy : {eligible:true,sessions:[],shifts:[]},error:undefined,retry:vi.fn()}));
    const html = renderToStaticMarkup(<IncidentForm base="/api/v1/businesses/a/attendance" onCreated={() => {}} />);
    expect(html).toContain('Fecha y hora declarada'); expect(html).toContain('no una captura del servidor'); expect(html).toContain('Enviar solicitud'); expect(html).not.toContain('latitude');
  });
  it('detalle final expone evidencia y oculta acciones no autorizadas', () => {
    mock({id:'i',category_label:'Olvido',employee_name:'Persona',business_name:'Negocio',work_date:'2026-11-01',status:'APPROVED',reason:'Declaración real',observations:'',declared_at:null,original_session:null,correction:null,decisions:[{id:'d',actor_name:'Admin',recorded_at:'2026-11-02T12:00:00Z',previous_state:'PENDING',state:'APPROVED',reason:'Evidencia verificada',request_id:'uuid'}],can_review:false,can_cancel:false});
    const html = renderToStaticMarkup(<IncidentDetailPanel base="/api/v1/businesses/a/attendance" id="i" business={business} />);
    expect(html).toContain('Evidencia verificada'); expect(html).toContain('Sin jornada capturada'); expect(html).not.toContain('Confirmar decisión');
  });
  it('notificaciones propias con enlace y estado no leído', () => {
    mock({count:1,next:null,previous:null,unread_count:1,results:[{id:'n',code:'INCIDENT_APPROVED',incident_id:'i',session_id:null,manager_only:false,created_at:'2026-11-02T12:00:00Z',read_at:null}]});
    const html = renderToStaticMarkup(<NotificationsWorkspace business={business} />);
    expect(html).toContain('Solicitud aprobada'); expect(html).toContain('/app/a/incidencias?id=i'); expect(html).toContain('Marcar como leída');
    expect(renderToStaticMarkup(<NotificationBell business={business} />)).toContain('1 sin leer');
  });
  it('bandeja vacía sin datos inventados', () => {
    mock({count:0,results:[],next:null,previous:null,unread_count:0}); expect(renderToStaticMarkup(<NotificationsWorkspace business={business} />)).toContain('No hay notificaciones');
  });
});
