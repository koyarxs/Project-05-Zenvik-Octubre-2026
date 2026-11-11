export const eventLabels = { CLOCK_IN: 'Inicio de turno', BREAK_START: 'Inicio de colación', BREAK_END: 'Término de colación', CLOCK_OUT: 'Término de turno' } as const;
export type EventType = keyof typeof eventLabels;
export const stateLabels = { NOT_STARTED: 'Sin iniciar', WORKING: 'En jornada', ON_BREAK: 'En colación', FINISHED: 'Jornada finalizada' } as const;
export const geoLabels: Record<string, string> = { INSIDE: 'Dentro de una zona autorizada', OUTSIDE: 'Fuera de zona: incidencia registrada', UNCERTAIN_BOUNDARY: 'Cerca del límite: ubicación por revisar', LOW_ACCURACY: 'Precisión insuficiente: incidencia registrada', MISSING_LOCATION: 'Sin ubicación: incidencia registrada', NO_GEOFENCE: 'Ubicación recibida; sin geocercas configuradas' };
export type Point = { latitude: number; longitude: number; accuracy_meters: number };
export type LocationResult = { location: Point | null; location_status: 'AVAILABLE' | 'DENIED' | 'UNAVAILABLE' | 'TIMEOUT' | 'UNSUPPORTED' | 'INSECURE'; message?: string };
export type Site = { id?: string; name: string; latitude: number; longitude: number; radius_meters: number; is_active: boolean };
export type Policy = { version: number; location_required: boolean; max_accuracy_meters: number; retention_days: number | null; sites: Site[] };
export type Receipt = { timezone_name?: string; id: string; session: string; employee_name: string; business_name: string; event_type: EventType; recorded_at: string; sequence: number; location_status: string; geo_result: string; accuracy_meters: number | null; exception_reason: string; integrity_hash: string; previous_hash: string };
export type AttendanceSession = { id: string; work_date: string; timezone_name: string; state: keyof typeof stateLabels; version: number; shift: string | null; shift_snapshot: { starts_at?: string; ends_at?: string }; created_at: string; updated_at: string; events: Receipt[] };
export type AttendanceCurrent = { server_now: string; date: string; timezone: string; employee_name: string | null; eligible: boolean; state: keyof typeof stateLabels; allowed_actions: EventType[]; today_events: Receipt[]; session: AttendanceSession | null; planned_shift: { id?: string; starts_at?: string; ends_at?: string }; policy: Policy };
export type MarkInput = { event_type: EventType; session_id: string | null; expected_version: number; request_id: string; exception_reason: string } & Pick<LocationResult, 'location' | 'location_status'>;

export async function locateOnce(secure = window.isSecureContext, geolocation: Geolocation | undefined = navigator.geolocation): Promise<LocationResult> {
  if (!secure) return { location: null, location_status: 'INSECURE', message: 'La ubicación requiere HTTPS. Abre la conexión segura o registra una incidencia.' };
  if (!geolocation) return { location: null, location_status: 'UNSUPPORTED', message: 'Este navegador no ofrece geolocalización.' };
  return new Promise(resolve => {
    try { geolocation.getCurrentPosition(position => {
      const { latitude, longitude, accuracy } = position.coords;
      if (![latitude, longitude, accuracy].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy < 0 || accuracy > 100000) {
        resolve({ location: null, location_status: 'UNAVAILABLE', message: 'El dispositivo no entregó una ubicación válida.' }); return;
      }
      resolve({ location: { latitude, longitude, accuracy_meters: accuracy }, location_status: 'AVAILABLE' });
    }, error => resolve({ location: null, location_status: error.code === 1 ? 'DENIED' : error.code === 3 ? 'TIMEOUT' : 'UNAVAILABLE', message: error.code === 1 ? 'No autorizaste la ubicación. Puedes revisar los permisos del navegador o registrar una incidencia.' : error.code === 3 ? 'Se agotó el tiempo para obtener ubicación.' : 'Ubicación no disponible. Revisa si el GPS está activado.' }), { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
    } catch { resolve({ location: null, location_status: 'UNAVAILABLE', message: 'El navegador no pudo iniciar la solicitud de ubicación.' }); }
  });
}

export function attendanceTime(value: string, zone = 'America/Santiago') { return new Intl.DateTimeFormat('es-CL', { timeZone: zone, hourCycle: 'h23', dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value)); }
