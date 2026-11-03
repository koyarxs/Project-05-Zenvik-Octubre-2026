# Zenvik — Etapa 13: supervisión administrativa de asistencia

## Alcance y auditoría

Se inspeccionaron las etapas 8–12, modelos, servicios, permisos, calendario, geocercas, rutas, hooks y pruebas existentes. La etapa 12 tiene implementación real de CLOCK_IN, BREAK_START, BREAK_END y CLOCK_OUT; jornadas abiertas cruzan medianoche, los originales son inmutables en PostgreSQL y la planificación se conserva como snapshot. Se reutilizan estas entidades, las sesiones Django, CSRF y el aislamiento por membresía activa.

El panel administrativo se incorpora en `/app/[businessId]/asistencia/supervision`, separado de `/asistencia` («Mi asistencia»). OWNER y ADMIN ven ambos accesos; EMPLOYEE no monta consultas administrativas y el backend rechaza su acceso aunque manipule la URL. Inicio contiene un resumen real y un enlace a supervisión.

No es un reloj oficialmente autorizado. No se implementan seguimiento permanente, reconstrucción de recorridos, sanciones, remuneraciones ni correcciones de originales.

## Implementación

- `apps/api/attendance/supervision.py`: autorización, filtros estrictos, roster paginado, agregados SQL, historial individual, revisión y reportes.
- `apps/api/attendance/models.py`: revisión administrativa independiente e índices de supervisión.
- `apps/api/attendance/urls.py`: rutas administrativas nuevas bajo el módulo existente.
- `apps/web/src/components/attendance-supervision.tsx`: panel compacto responsive, filtros, indicadores, detalle cronológico, geocercas históricas, revisión y CSV.
- `apps/web/src/app/app/[businessId]/asistencia/supervision/page.tsx`: página con BusinessGate.
- Catálogo de navegación, iconos del sidebar y resumen del dashboard general integrados.
- `use-resource.ts`: callback de reintento estable; se mantienen AbortController y descarte de respuestas tardías.
- Pruebas: `attendance/test_supervision.py`, `attendance-supervision.test.tsx`, navegación y recorrido E2E de asistencia ampliado.

## API

Prefijo `/api/v1/businesses/{business_id}/attendance/supervision/`:

| Ruta | Método | Función |
|---|---|---|
| raíz | GET | Trabajadores, última jornada relevante, indicadores y estados |
| `people/{employee_id}/` | GET | Todas las jornadas de una fecha laboral, paginadas |
| `reviews/{session_id}/` | POST | Añadir revisión, motivo y estado; control de versión obligatorio |
| `reports/` | GET | Reporte diario/semanal/mensual, paginado |
| `export/` | GET | CSV UTF-8 con BOM, separado por punto y coma |

Filtros: `date`, `period` (daily/weekly/monthly), `search`, `job_title`, `state`, `ordering`, `page`. Fechas operativas entre 2000 y 2100; páginas de diez resultados. La semana empieza lunes; mensual comprende el mes de la fecha seleccionada. Los filtros se validan y ejecutan en servidor. No se descargan todos los trabajadores al navegador.

Se mantienen intactos current, events, history, receipts y policy del portal personal. Consultar geocercas no otorga acceso a comprobantes ajenos por las rutas personales.

## Reglas explícitas

- Última jornada relevante para el panel diario; en la fecha actual incluye jornadas anteriores aún abiertas. La fecha laboral original permanece visible. El detalle y los reportes contienen todas las jornadas registradas, incluso varias en un día.
- Sin jornada: permiso aprobado, entrada pendiente solo después de comenzar el turno, turno futuro o sin turno programado. No se etiqueta automáticamente «ausente».
- Trabajando/en colación/finalizada describe eventos registrados, no presencia física comprobada.
- Comparación con el snapshot del turno al marcar. Diferencias positivas de entrada son «posibles atrasos», sin tolerancias inventadas ni sanciones. Falta de salida se destaca después del final programado. Sin turno asociado no se inventa una duración esperada.
- Colación ausente se informa como «sin registro»; no se supone obligatoria. Se conservan múltiples ciclos de descanso.
- Resultados GPS, explicación del trabajador, precisión y distancias se muestran por evento. Distancias calculadas con las geocercas históricas conservadas; no con zonas actuales que pudieron cambiar. No se entregan coordenadas personales exactas en las nuevas respuestas ni en CSV.
- Revisiones PENDING/REVIEWING/RESOLVED guardan autor, instante, motivo y estado previo/nuevo. Una revisión no elimina una incidencia original. Las escrituras se serializan con el bloqueo de negocio y `expected_review`; una revisión obsoleta devuelve 409.
- Refresco manual y cada 60 segundos con pestaña visible, pausado mientras se revisa el detalle. Las respuestas tardías no se reutilizan al cambiar de negocio y una exportación pendiente se aborta al desmontar.

## Consultas, migraciones y límites

Se usan Employee, Shift, LeaveRequest, AttendanceSession y AttendanceEvent existentes. Subquery/Exists derivan la última jornada y la planificación; Count obtiene indicadores sobre toda la selección. Eventos y revisiones usan prefetch. Los reportes cuentan segmentos diarios y aplican límites SQL antes de hidratar eventos; no serializan todo el mes para una sola página.

Migraciones aditivas:

- 0004: AttendanceReview.
- 0005: trigger de inmutabilidad para revisiones, reutilizando la función PostgreSQL existente.
- 0006: índices negocio/trabajador/fecha laboral y negocio/fecha laboral.

Reportes acotados a un día, semana o mes. Exportaciones hasta 10.000 filas; rangos superiores deben acotarse mediante filtros. Límite de solicitudes por usuario/negocio: 120/minuto para supervisión y 12/minuto para reportes/exportaciones, usando reservas de PostgreSQL existentes. No se agregaron dependencias ni servicios pagos.

CSV incluye negocio, generación, zona, filtros, fechas, horarios, cuatro tipos de marcación, diferencias e incidencias. Neutraliza prefijos de fórmula en celdas textuales. No incluye coordenadas exactas. Las fechas ISO conservan sus offsets; America/Santiago identifica la zona operativa del negocio.

## Validación

Las pruebas usan exclusivamente bases temporales y fixtures sintéticos; GPS simulado. No se eliminan ni desactivan pruebas.

## Riesgos y continuación

- El panel no sustituye una evaluación laboral ni prueba identidad o presencia física mediante GPS.
- La vista operativa resume una jornada relevante por trabajador; detalle/reportes conservan las demás. La planificación mostrada para una persona sin jornada es el primer turno del día. No consolida ausencias por cada bloque de una jornada partida.
- Los reportes usan la planificación y las fichas disponibles al consultar; el snapshot conserva el turno de jornadas registradas, pero no constituye un cierre contable histórico de toda la plantilla.
- No se realizaron pruebas de carga con volumen de producción ni auditoría formal de lectores de pantalla. Reportes mensuales efectúan conteos por día; medir y agrupar consultas antes de escalar a plantillas grandes.
- Originales y revisiones están protegidos contra UPDATE/DELETE normales, no contra un superusuario que modifique la infraestructura.
- Definir conservación de datos, accesos especializados y procedimientos formales de corrección antes del uso regulado. Se mantienen las brechas de `STAGE-12-COMPLIANCE.md`; no se afirma certificación ni asesoría jurídica nueva.
- Preparado para añadir notificaciones y auditoría avanzada mediante identidades estables y revisiones append-only. La gestión formal de incidencias/correcciones de etapa 14 requiere estados, responsables, evidencias y eventos vinculados; no debe alterar originales ni convertir automáticamente señales en sanciones.

## Restricciones

No hubo commits, push, despliegues, cambios de credenciales ni eliminación de datos reales. Excepción registrada: la primera inspección ejecutó `git status --short` antes de leer el adjunto; fue solo lectura, se informó y no se ejecutaron más comandos Git. Las migraciones son aditivas y las pruebas no usan datos operativos.

## Intentos rechazados

Se añadió AttendanceRejection para registrar, desde esta etapa, conflictos reales de clave duplicada o transición/versión incompatible. Se persisten después de revertir la transacción de la marcación fallida, con usuario, trabajador, negocio, tipo e instante; sin cuerpo, coordenadas, IP ni huellas de dispositivo. Un replay idempotente válido no se registra como rechazo. El panel cuenta trabajadores con intentos rechazados y el detalle muestra el total y hasta veinte recientes de la fecha. No se reconstruyen intentos históricos que nunca fueron almacenados.

Migraciones adicionales: 0007 crea AttendanceRejection con índice negocio/trabajador/instante; 0008 añade su trigger de inmutabilidad. Esto prepara la gestión formal de incidencias sin transformar solicitudes rechazadas en marcaciones válidas. La revisión administrativa actual se asocia a jornadas existentes; un rechazo sin jornada no crea una jornada ficticia.

## Resultados verificados

| Comprobación | Resultado |
|---|---|
| Backend completo | 246 descubiertas: **240 aprobadas**, 6 lanzadores E2E ejecutados por separado |
| Vitest | **92 aprobadas**, 14 archivos |
| TypeScript | Aprobado |
| ESLint | Aprobado, sin advertencias |
| Build Next.js | Aprobado; incluye ruta de supervisión |
| Playwright | **39 casos aprobados** entre la regresión general y la repetición de asistencia |
| Migraciones | 0004–0008 aplicadas en PostgreSQL **17.11**, sin diferencias pendientes |
| Integridad de datos anteriores | Conteos y hashes de nueve modelos idénticos antes/después de migrar |

Comandos desde `apps/api`: `.venv/Scripts/python.exe run_backend_tests.py`, `.venv/Scripts/python.exe run_browser_tests.py` y repetición focalizada `run_browser_tests.py businesses.test_browser.FrontendBrowserTests.test_attendance_frontend_against_isolated_api`. Desde `apps/web`: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`.

Evidencia:

- [Backend final](../.artifacts/stage13-backend-final.log).
- [Vitest](../.artifacts/stage13-vitest.log), [TypeScript](../.artifacts/stage13-typecheck.log), [ESLint](../.artifacts/stage13-lint.log), [build](../.artifacts/stage13-build.log).
- [Regresión de navegador](../.artifacts/stage13-e2e-final.log): 29 generales, 2 personal, 1 planificación, 2 portal y 2 Turnstile aprobadas. Conserva el fallo inicial de la fase de asistencia, posteriormente corregido.
- [Asistencia aprobada](../.artifacts/stage13-attendance-e2e-evidence.log): 3 casos. Se ejecutaron los diez pasos solicitados del recorrido trabajador/administrador, revisión y exportación.
- [Migración e integridad](../.artifacts/stage13-migration.log).

Cobertura backend nueva: resumen, cuatro estados/eventos, turno futuro/iniciado, permiso aprobado, noche y fecha laboral, diferencias y marcación incompleta, GPS, revisión y concurrencia de versión, inmutabilidad SQL, filtros/paginación, reportes diarios/semanales/mensuales, múltiples jornadas y filtro de estado, CSV BOM/formulas/privacidad, rol/negocio/IDs, CSRF y límites. Se conserva la cobertura anterior de geocercas, colaciones múltiples, concurrencia e idempotencia.

Frontend: rechazo de montaje para EMPLOYEE, carga, filtros, error recuperable y vacío real; E2E de cuatro marcas compartidas entre dos sesiones de navegador, detalle/cronología/geocerca, revisión persistida, descarga mensual, escritorio y móvil de 320 px, filtros vacíos, conexión fallida, permisos y negocio ajeno. El cambio de negocio y el descarte de respuestas tardías conservan BusinessGate/useResource y la regresión de workspaces/portal.

Fallos encontrados y corregidos: creación directa de permiso aprobado en fixture (debe crearse pendiente y decidirse); expectativas de navegación anteriores a la nueva ruta; tipo TypeScript del evento ampliado; codificación de tildes al generar pruebas desde PowerShell; nombre accesible del selector de revisión; comprobación del ancho antes de terminar la transición del sidebar. No se eliminaron pruebas ni se relajaron permisos. Se espera el fin de la transición mediante una aserción repetida de ancho, conservando la comprobación de no desborde.

Un primer runner quedó bloqueado al cerrar procesos en Windows; se detuvieron únicamente sus procesos temporales y se repitió con permisos de cierre. La compilación final se verificó antes de ejecutar la repetición estable. Los avisos de colores de Node y broken pipe durante el cierre del navegador no afectaron las aserciones finales.

## Evidencia visual revisada

Datos exclusivamente sintéticos:

- [Panel escritorio](../.artifacts/stage13/stage13-desktop.png).
- [Panel móvil 320 px](../.artifacts/stage13/stage13-mobile.png).
- [Detalle y línea de tiempo](../.artifacts/stage13/stage13-detail.png).
- [Revisión e historial](../.artifacts/stage13/stage13-review.png).

La consulta móvil adapta las filas a tarjetas, conserva labels y controles y no presenta desbordamiento horizontal una vez terminado el cambio de viewport. Dialog reutiliza Radix para foco, teclado y Escape. No se declara auditoría WCAG integral.

## Checklist de aceptación

| # | Criterio | Evidencia |
|---|---|---|
| 1 | Panel administrativo funcional | Ruta, API y E2E real |
| 2 | Estados reales | SQL, pruebas de transición y dos sesiones de navegador |
| 3 | Cuatro marcaciones consultables | Detalle y E2E |
| 4 | Detalle individual | Jornadas paginadas y cronología original |
| 5 | Resultados geográficos | Validación, precisión y distancias a zonas históricas; sin GPS continuo |
| 6 | Comparación planificación/marcaciones | Snapshot y diferencias, tests nocturnos |
| 7 | Incidencias operativas | GPS, excepciones, falta de salida, diferencias, conflictos rechazados; límites de planificación partida descritos |
| 8 | Reportes diarios/semanales/mensuales | API paginada, filtros y pruebas |
| 9 | Exportación funcional | CSV protegido, pruebas y descarga E2E |
| 10 | Resumen en Inicio | AttendanceSummary conectado al backend |
| 11 | Permisos y aislamiento | Rol, UUID ajeno, CSRF, membresía y pruebas |
| 12 | Responsive y accesibilidad básica | 320 px, teclado/Escape, labels y capturas; sin certificación formal |
| 13 | Pruebas relevantes | 240 backend + 92 frontend + 39 navegador, TypeScript/lint/build |
| 14 | Riesgos y pendientes normativos | Secciones anteriores y matriz de etapa 12 |

El módulo está preparado técnicamente para incorporar notificaciones, auditoría avanzada y gestión formal de incidencias. Esas capacidades de etapa 14 no se presentan como ya implementadas. Los límites expresos de esta entrega —planificación partida, retención, roles especializados y procesos normativos— permanecen abiertos.

La comprobación final de revisión espera el HTTP 201 definitivo después de la redirección de normalización de Next.js y verifica `PENDING → RESOLVED` en el historial recibido del servidor. La captura de revisión muestra ese historial, no solo el texto previo del formulario. La fase final de asistencia aprobó sus tres casos; no quedan fallos conocidos en las verificaciones ejecutadas.
