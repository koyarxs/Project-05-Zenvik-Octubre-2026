# Propuesta para Zenvik Asistencia — Etapa 12

> Documento histórico de diseño de la Etapa 11. La implementación vigente y sus contratos definitivos se describen en [STAGE-12.md](STAGE-12.md); las propuestas siguientes no sustituyen ese contrato.

Este documento define una propuesta técnica; no describe funcionalidades operativas. La Etapa 11 no registra asistencia, no pide ubicación y no ofrece una ruta de asistencia.

## Integración e identidad

Agregar «Mi asistencia» al catálogo de navegación y a los destinos móviles del trabajador solamente cuando exista el módulo completo. Su pantalla se integrará en `BusinessGate` y `AppShell`, con la misma sesión Django y los mismos componentes accesibles. Evaluar cinco destinos móviles o integrar el acceso desde Inicio si la densidad perjudica los 320 px. No reemplazar la planificación con registros efectivos.

El servidor obtiene el usuario de `request.user`; resuelve la membresía activa con acceso habilitado y negocio activo, y después la ficha activa del mismo usuario y negocio. Rechazar ausencia de vínculo, vínculo inactivo y negocio no autorizado. No aceptar `user`, `employee`, rol ni negocio alternativo en el cuerpo para decidir la identidad. Revalidar permisos dentro de la transacción; un cambio de acceso concurrente no debe permitir marcar. La sesión y CSRF siguen siendo obligatorios.

La planificación actual usa `Business.planning_timezone = America/Santiago`. Conservar instantes UTC y zona IANA de referencia; presentar fechas locales considerando cambios de horario y turnos que cruzan medianoche. Un turno programado es una referencia opcional validada contra la ficha, no prueba de asistencia ni límite automático de una sesión efectiva.

## Estados propuestos

Una sesión efectiva tendrá identidad propia, independiente del día calendario:

| Estado anterior | Evento | Estado siguiente |
| --- | --- | --- |
| Sin sesión abierta | `SHIFT_START` — Inicio de turno | `WORKING` |
| `WORKING` | `BREAK_START` — Inicio de colación | `ON_BREAK` |
| `ON_BREAK` | `BREAK_END` — Término de colación | `WORKING` |
| `WORKING` | `SHIFT_END` — Término de turno | `CLOSED` |

Propuesta inicial: impedir sesiones simultáneas, eventos duplicados y fin de turno durante una colación abierta. Explicar el conflicto sin inventar una marcación intermedia. Confirmar política de múltiples colaciones, jornadas extensas, turnos sin planificación y regularización antes de implementar. Una sesión cerrada no se reabre por el trabajador; las correcciones requieren un flujo separado, autorización y auditoría, preservando el evento original.

## Contratos propuestos, todavía no registrados

Posibles recursos futuros bajo `/api/v1/businesses/{business_id}/attendance/`: `current/` (estado propio), `events/` (creación propia e historial paginado). Estas URLs no existen en el router actual y no deben anunciarse en la interfaz hasta completar implementación y pruebas.

Ejemplo conceptual de creación:

```json
{
  "event_type": "BREAK_START",
  "idempotency_key": "UUID generado para esta intención",
  "expected_version": 3,
  "planned_shift_id": null,
  "device_reported_at": "2026-11-01T15:00:00Z",
  "location": {
    "latitude": -33.45,
    "longitude": -70.66,
    "accuracy_meters": 25,
    "captured_at": "2026-11-01T15:00:00Z"
  }
}
```

Valores ilustrativos para especificar tipos, nunca datos operativos. `location` será nullable según política explícita: no sustituir una ubicación denegada por coordenadas ficticias. Validar números finitos, latitud ±90, longitud ±180, precisión no negativa y antigüedad máxima configurable. No confiar en hora, ubicación ni ID de turno enviados por el dispositivo. El timestamp autoritativo será `server_received_at`; la hora declarada por el dispositivo se conserva por separado para diagnóstico. No admitir marcación offline silenciosa como si hubiera sido recibida a tiempo.

La respuesta devolverá evento UUID, sesión UUID, estado/version nuevos, instante del servidor y zona IANA. El historial de consulta normal no necesita devolver coordenadas exactas. Usar transacción y bloqueo para evaluar estado, insertar evento y avanzar versión. Una clave repetida con el mismo contenido retorna el resultado anterior; contenido diferente o versión obsoleta produce conflicto. Rechazar campos de identidad y privilegios. Definir respuestas de validación, sesión expirada, acceso denegado, estado incompatible y ubicación requerida con mensajes accionables, sin divulgar recursos ajenos.

## Geolocalización puntual y privacidad

- Solicitar permiso del navegador únicamente tras una acción explícita de marcación y una explicación de finalidad, información capturada y acceso. Requiere contexto seguro HTTPS y una política de permisos restrictiva al origen necesario.
- Una lectura puntual por evento; no usar vigilancia continua, captura en segundo plano ni geocercas en este alcance.
- Diferenciar permiso denegado, timeout, dispositivo sin soporte, señal imprecisa y desconexión. Explicar la alternativa definida por el negocio; no bloquear silenciosamente ni fingir éxito.
- El GPS del cliente puede ser alterado y su precisión es variable. No equivale a una certificación de presencia o identidad; cualquier evaluación adicional requiere diseño y revisión independientes.
- Minimizar almacenamiento y acceso: coordenadas solo cuando sean necesarias, cifrado en tránsito, controles de almacenamiento, retención definida, auditoría de consultas y exportación autorizada. Excluir ubicación, cookies y motivos de permisos de logs, analítica, trazas y URLs.
- Definir quién accede a coordenadas exactas, por cuánto tiempo, cómo se informa al trabajador y qué procedimiento corrige errores antes de activar el módulo. La revisión técnica no reemplaza la revisión normativa y de privacidad aplicable; no se declara autorización de la Dirección del Trabajo.

## Pruebas y decisiones que habilitan la implementación

Cubrir los cuatro eventos y transiciones prohibidas; repetición/concurrencia/idempotencia; revocación de acceso; aislamiento entre empleados y negocios; CSRF y sesión vencida; turnos nocturnos y cambios de hora; reloj del dispositivo alterado; denegación GPS, baja precisión y timeout; red interrumpida y doble toque; navegación por teclado, lector de pantalla, movimiento reducido y 320 px. Verificar que no se capturen coordenadas antes de la acción y que no aparezcan en respuestas o logs innecesarios.

Antes de producción se requieren decisiones sobre retención, acceso a ubicación, política ante GPS no disponible, correcciones, desconexión y revisión normativa. La arquitectura actual permite implementar el módulo; no constituye una implementación ni una certificación de asistencia.
