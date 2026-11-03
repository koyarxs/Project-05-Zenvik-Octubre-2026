# Zenvik — Etapa 9: planificación avanzada de turnos

## Estado de entrega

Los diez criterios de aceptación obligatorios están implementados y verificados. El catálogo opcional de plantillas persistentes con nombre queda PENDIENTE y se identifica expresamente abajo. No incluye control de asistencia efectiva ni declaraciones de cumplimiento legal.

## Auditoría inicial y reutilización

Se inspeccionaron `models.py`, permisos, serializadores, servicios y vistas de turnos y solicitudes; pruebas backend, Vitest y Playwright; calendario/formulario, utilidades de fecha, hooks y diseño documentado en `STAGE-8.md`.

La base ya tenía CRUD con cancelación lógica, UUID estables, intervalos conscientes de zona horaria, validación de pertenencia/actividad del trabajador, detección de solapamientos, bloqueo transaccional por negocio, roles y consulta individual del trabajador. Se reutilizaron estas funciones, las sesiones/CSRF, los componentes visuales de la Etapa 8, la paginación completa y la protección contra respuestas tardías al cambiar de negocio.

Faltaban vista mensual, colación, observaciones, reglas configurables, historial de modificaciones, control de edición obsoleta, operaciones masivas e integración de permisos aprobados en el calendario.

## Funcionalidades implementadas

- Semana principal, agenda y mes real de 28–31 días, alineado de lunes a domingo en escritorio. Navegación de semanas/meses, fecha, Hoy, trabajador y estados programado/cancelado/todos. Los turnos que atraviesan medianoche aparecen en cada día afectado.
- Formulario de creación/edición con colación en minutos, decisión explícita de incluirla o descontarla del tiempo programado y observaciones de hasta 1000 caracteres. El negocio es el espacio activo de la ruta y se determina en servidor.
- Duplicar cualquier turno como borrador editable, sin reactivar el original; asignar un mismo horario a varios trabajadores; copiar una semana con filtro de trabajador. Confirmación de copia y cancelación.
- Lotes de 1–100 turnos: una transacción, bloqueo del negocio y las mismas validaciones individuales. Un conflicto revierte todas las filas y sus revisiones.
- Reintentos idempotentes mediante UUID y huella del contenido. Repetir clave y contenido devuelve los mismos registros; reutilizar la clave para otro contenido se rechaza. El formulario conserva la clave mientras el contenido no cambie.
- Edición web con `expected_updated_at`: una edición obsoleta no sobrescribe cambios de otro administrador. El parámetro es opcional para compatibilidad con consumidores anteriores.
- Reglas por negocio: duración máxima total en minutos, opcional, y bloqueo de asignaciones sobre permisos aprobados. No se impone una duración laboral legal universal. El límite técnico del campo de configuración es 31 días; no representa una jornada permitida por ley.
- Permisos aprobados: indicador explícito en tarjetas/detalles; bloqueo por defecto para nuevas escrituras incompatibles o advertencia si el administrador desactiva la restricción. La resolución usa reasignación, cambio de horario o cancelación autorizados. Nunca se cambia automáticamente una solicitud pendiente o aprobada.
- Historial de creación, edición y cancelación, con fecha, autor cuando existe y fotografía del horario, trabajador, colación y notas. Consulta paginada exclusiva de administradores. Las cancelaciones conservan el UUID y no permiten nuevas modificaciones.
- EMPLOYEE conserva consulta exclusiva de sus propios turnos, sin duplicación, reglas, copia, edición, cancelación ni historial administrativo.

## Fechas, duración y asistencia futura

La zona del negocio queda explícita como `America/Santiago`, igual que el producto actual. Esta etapa no habilita negocios con zonas distintas: hacerlo exige adaptar también dashboard y permisos, no solamente este calendario. Los instantes se almacenan con zona/UTC. El formulario conserva el tratamiento existente de horas inexistentes y repetidas por DST.

La copia semanal mantiene las horas locales, no suma semanas de segundos UTC. Las horas inexistentes o ambiguas del destino se rechazan y deben planificarse individualmente con la selección explícita de ocurrencia. Solo se copian turnos que **comienzan** en la semana origen; un turno que continúa desde la semana anterior no se duplica dos veces. El límite y los conflictos se vuelven a validar en servidor.

`planned_minutes` es duración programada menos colación cuando corresponde. No es tiempo efectivamente trabajado, remuneración, horas extra ni asistencia. No se implementaron marcaciones, geolocalización, biometría o reloj control. UUID, relaciones trabajador/negocio, instantes y revisiones quedan disponibles para una futura integración de Etapa 12.

## Ampliaciones evaluadas

| Función | Decisión |
|---|---|
| Duplicación | Implementada con borrador editable y nueva identidad. |
| Copia semanal | Implementada mediante lote atómico y preservación de hora local. |
| Asignación a varias personas | Implementada con validación por trabajador y reversión total. |
| Plantillas persistentes con nombre | **PENDIENTE, opcional**. Duplicar reutiliza un horario real. No se añadió un catálogo con versionado, vigencia y mantenimiento de plantillas en esta etapa; requiere definir esas reglas de producto para evitar plantillas desactualizadas. |
| Vista diaria independiente | No incorporada: agenda y secciones por día cubren consulta y creación; no se duplicó otro modo de navegación. |
| Arrastrar y soltar | No necesario; todas las operaciones tienen controles y formularios accesibles por teclado. |

## API y modelos

Rutas relativas a `/api/v1/businesses/{business_id}/`:

| Ruta | Métodos | Cambios |
|---|---|---|
| `shifts/` | GET, POST | Nuevos datos de colación/notas/minutos/conflicto; reintento opcional en creación. |
| `shifts/{id}/` | GET, PATCH, DELETE | Actualización con versión opcional; cancelación lógica y revisiones. |
| `shifts/batch/` | POST | `request_id` requerido y `shifts` de 1–100 elementos; solo OWNER/ADMIN. |
| `shifts/{id}/history/` | GET | Historial paginado, solo OWNER/ADMIN y negocio autorizado. |
| `planning-settings/` | GET, PATCH | Lectura a miembros; escritura a OWNER/ADMIN con comprobación bajo bloqueo. |

`Business`: `planning_timezone`, `planning_max_minutes`, `planning_block_leave`.
`Shift`: `break_minutes`, `break_included`, `notes`.
`ShiftRevision`: FK protegida al turno/autor, acción, fotografía JSON, fecha.
`PlanningOperation`: negocio, UUID de petición, huella y UUID de turnos; unicidad `(business, request_id)`.

Se conservan índices existentes negocio/inicio y trabajador/inicio. Se usan prefetch de permisos aprobados y select_related para evitar una consulta adicional por turno en los listados. El historial y las operaciones aprovechan índices de claves foráneas y la restricción única. Hay una prueba que compara el número de consultas con uno y diez turnos.

## Migración y conservación de información

`businesses/0005_advanced_planning.py` es aditiva: seis campos y dos tablas, sin borrar ni reescribir horarios existentes. Colación inicial 0, incluida, y observaciones vacías mantienen la duración programada anterior. El bloqueo de permisos afecta escrituras posteriores; no cancela turnos existentes.

Se prueba explícitamente migrar de 0004 a 0005 con un turno anterior, conservar identidad/horario/estado y crear una revisión `BASELINE` antes de su primera edición. No se inventa historial anterior ni autor para registros históricos. Las revisiones nuevas tienen autor cuando la operación entra por el servicio autenticado; operaciones internas directas pueden tener autor nulo.

Aplicada a la base local PostgreSQL 17.11. Se compararon los recuentos de negocios, trabajadores, turnos y solicitudes antes y después: se conservaron. `makemigrations --check --dry-run` no detecta diferencias de esquema. No se ha desplegado a ningún entorno externo.

## Seguridad y concurrencia

Autenticación por sesiones, cookies HttpOnly, CSRF y límites existentes conservados. No se modificaron credenciales. Negocio y rol se verifican antes de escribir y dentro de los servicios bajo bloqueo. Las claves manipuladas y empleados de otro negocio se rechazan. La consulta de conflictos no devuelve motivos privados de permisos.

La unicidad de la operación, el bloqueo por negocio y la transacción protegen contra lotes simultáneos y reintentos. Una prueba con dos conexiones confirma un solo turno y una sola revisión para la misma operación. La prueba anterior de solapamientos concurrentes permanece. No se expone borrado físico de turnos o revisiones.

## Archivos modificados o añadidos

Backend:
- `apps/api/businesses/models.py`
- `apps/api/businesses/shift_serializers.py`
- `apps/api/businesses/shift_services.py`
- `apps/api/businesses/shift_views.py`
- `apps/api/businesses/urls.py`
- `apps/api/businesses/migrations/0005_advanced_planning.py`
- `apps/api/businesses/test_planning.py`
- `apps/api/businesses/test_browser.py`
- `apps/api/run_backend_tests.py`
- `apps/api/run_browser_tests.py` (permite seleccionar una fase para comprobaciones focalizadas)

Frontend:
- `apps/web/src/components/shifts/shift-calendar.tsx`
- `apps/web/src/components/shifts/shift-form.tsx`
- `apps/web/src/components/shifts/planning-tools.tsx`
- `apps/web/src/lib/types.ts`
- `apps/web/src/lib/planning.ts`
- `apps/web/src/lib/planning.test.ts`
- `apps/web/e2e/planning.spec.ts`

Informe: `docs/STAGE-9.md`. Evidencia sintética y registros en `.artifacts/`.

## Verificación

El servidor local disponible informa **PostgreSQL 17.11**. Los runners crean bases temporales con UUID, verifican que el nombre no exista y dejan a Django eliminarlas al terminar. No se utilizan datos operativos para las pruebas ni se cambian los límites de autenticación. Playwright usa fases separadas con fixtures nuevos para planificación, recorridos generales y Turnstile.

Resultados finales:

| Comprobación | Resultado |
|---|---|
| Backend completo | **188 aprobadas**, 3 wrappers E2E omitidos en este runner (191 descubiertas), 41,090 s. |
| Vitest | **60 aprobadas**, 10 archivos. |
| Playwright | **32 aprobadas**: 1 de planificación, 29 recorridos generales y 2 Turnstile, en tres fases aisladas. Los tres casos omitidos en la fase general se ejecutan en sus respectivas fases. |
| Runner Django E2E | 3 pruebas de integración aprobadas, 111,615 s. |
| TypeScript | Aprobado (`tsc --noEmit`). |
| ESLint | Aprobado sin errores ni advertencias. |
| Build Next.js | Aprobado. |
| Migraciones | `makemigrations --check --dry-run`: sin cambios pendientes. 0005 aplicada en la base local. |
| PostgreSQL | **17.11**, incluyendo migración con datos anteriores y concurrencia real. |

Registros: `.artifacts/stage9-backend.log`, `.artifacts/stage9-e2e-final.log` y `.artifacts/stage9-visual.log`. La primera ejecución del navegador se descartó como resultado final: tuvo cierre bloqueado de procesos en Windows y un timeout de Turnstile. Se repitió completa con el build estable y permisos para cerrar sus propios servidores; las tres fases aprobaron sin modificar el rate limiting. La regeneración visual ejecuta de nuevo únicamente la fase de planificación, con animaciones desactivadas al capturar.

Comandos:

```powershell
# apps/api
.\.venv\Scripts\python.exe run_backend_tests.py
.\.venv\Scripts\python.exe run_browser_tests.py
.\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
# apps/web
npm.cmd test -- --run
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Cobertura nueva: colación incluida/descontada/inválida, límite configurable, permisos aprobados/pendientes/nocturnos y límites de día, reglas por rol, lote inválido sin escrituras parciales, CSRF masivo, pertenencia de trabajadores, reintentos y claves reutilizadas, actualización obsoleta, historial, cancelados inmutables, mes completo, concurrencia, migración y ausencia de consultas N+1. Frontend verifica meses cortos/largos/bisiestos, cambio de año, copia nocturna y DST. El nuevo recorrido E2E cubre mes, creación, colación, duplicación, historial, copia, filtros, límite, tablet y móvil; permanecen los recorridos de trabajador, cambios de negocio, fallos, teclado y sesiones.

Evidencia visual revisada, únicamente de datos sintéticos:
- `.artifacts/stage9/planning-month-desktop.png`: mes completo con turnos.
- `.artifacts/stage9/planning-month-mobile.png`: consulta mensual en móvil.
- `.artifacts/stage9/planning-tablet.png`: semana en dos columnas.
- `.artifacts/release/shifts-desktop.png`, `shifts-mobile.png`, `shifts-mobile-form.png`: recorridos de edición/cancelación y formulario móvil.

Las capturas nuevas desactivan animaciones durante la captura para evitar estados intermedios al redimensionar.

## Criterios de aceptación

| # | Criterio | Estado |
|---|---|---|
| 1 | Calendario semanal | VERIFICADO |
| 2 | Navegación mensual | VERIFICADO |
| 3 | Creación y edición | VERIFICADO |
| 4 | Conflictos de horarios | VERIFICADO |
| 5 | Integración de permisos | VERIFICADO |
| 6 | Roles y aislamiento | VERIFICADO |
| 7 | Consulta del trabajador | VERIFICADO |
| 8 | Responsive y accesibilidad | VERIFICADO |
| 9 | Pruebas relevantes | VERIFICADO |
| 10 | Preparación para asistencia | VERIFICADO |

## Límites y recomendaciones para Etapa 10

- El catálogo de plantillas nombradas queda pendiente como ampliación opcional; no se anuncia como implementado.
- Mantener la zona Santiago hasta que exista un diseño transversal de múltiples zonas y migración de reglas de permisos/calendarios.
- La copia semanal tiene límite explícito de 100 turnos; usar filtro de trabajador para reducir lotes. La API también lo impone.
- Las revisiones y claves de idempotencia crecen con el uso. Antes de volumen elevado, definir retención/archivo sin perder auditoría ni semántica de reintentos.
- Esta validación incluye teclado, foco, responsive y movimiento reducido heredados; no equivale a certificación formal de accesibilidad ni a cumplimiento laboral automático.
- La planificación es fuente programada para Etapa 12. No inferir asistencia real de un turno ni alterar retrospectivamente sus versiones al implementar marcaciones.
- No se ejecutaron comandos Git, commits, push ni despliegues. No se borraron datos reales ni se eliminaron pruebas existentes.
