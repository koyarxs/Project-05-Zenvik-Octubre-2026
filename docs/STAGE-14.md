# Zenvik — Etapa 14: incidencias, regularizaciones y notificaciones

Fecha de revisión: 2 de noviembre de 2026 (America/Santiago).

**Estado actualizado al 3 de noviembre de 2026:** la base habitual configurada en `127.0.0.1:5435` volvió a estar disponible. Se aplicaron correctamente las migraciones 0009 y 0010, `migrate --check` confirmó que no quedan migraciones pendientes y Django pasó sus comprobaciones. El backend local quedó activo en `127.0.0.1:8000` y el endpoint CSRF respondió HTTP 200. La tarea periódica `Zenvik-AttendanceAlerts-Stage14` se ejecutó contra esa base con `LastTaskResult=0`; el detector terminó con cero avisos nuevos. Esto resuelve los bloqueos técnicos de conexión, migración y automatización local descritos en el historial siguiente. No se cambiaron credenciales ni se sustituyó la base configurada. Se mantienen los límites de uso oficial y las condiciones de un futuro despliegue.

## Auditoría inicial y decisiones de alcance

Se revisaron los informes de etapas 8–13 y el código de usuarios, membresías, fichas, permisos, planificación, eventos de asistencia, geocercas, revisiones y exportaciones. Etapas 11–13 tienen implementación real, comprobada mediante sus servicios, endpoints y pruebas. No había infraestructura de notificaciones internas ni solicitudes formales de regularización. Se reutilizan AttendanceSession, AttendanceEvent, AttendanceReview, AttendancePolicyRevision y EmployeeRevision; no se duplican marcaciones, turnos ni permisos.

Una incidencia y su solicitud de regularización se representan mediante un mismo expediente, AttendanceIncident. La decisión, el ajuste, la auditoría y la notificación son entidades separadas con responsabilidades distintas. La revisión simple de jornada de etapa 13 se conserva y ahora produce auditoría y aviso al trabajador cuando se resuelve.

**Los originales no se modifican.** Una aprobación con hora declarada genera un ajuste OPERATIONAL_ONLY. Se consulta en una vista separada, identificando original, declaración, autor, motivo y fechas de aprobación/aplicación. No sustituye timestamps, coordenadas, hashes, estados de la máquina de marcación ni exportaciones originales. La aplicación con efectos laborales oficiales permanece deshabilitada y no existe un parámetro cliente para habilitarla.

## Arquitectura y archivos

Backend:

- `attendance/models.py`: seis entidades nuevas descritas abajo.
- `attendance/incidents.py`: creación, idempotencia, decisiones transaccionales, políticas, auditoría y generación de notificaciones.
- `attendance/incident_views.py`: contratos estrictos, scopes, listas, detalle, contexto propio, ajustes, políticas, auditoría y bandeja.
- `attendance/urls.py`: rutas del módulo dentro de asistencia existente.
- `attendance/services.py`: alerta configurable de evento excepcional; auditoría de cambios de política/geocercas con referencia a la revisión original.
- `attendance/supervision.py`: auditoría y notificación al resolver una revisión de jornada de etapa 13.
- `businesses/personnel_views.py`: auditoría de cambios de cuenta, rol y acceso a negocio, vinculada a EmployeeRevision.
- `attendance/management/commands/scan_attendance_alerts.py`: detector idempotente de jornadas incompletas según política.
- `attendance/test_incidents.py`: seguridad, flujo, inmutabilidad, migración y concurrencia.
- `run_backend_tests.py`: admite etiquetas opcionales; sin argumentos sigue ejecutando toda la suite y siempre crea una base temporal única.

Frontend:

- `lib/incidents.ts`: contratos y etiquetas.
- `components/incidents-workspace.tsx`: bandeja, formulario, detalle, historial, política, ajustes operativos y auditoría.
- `components/attendance-notifications.tsx`: indicador global y bandeja paginada propia por negocio.
- Rutas `/app/[businessId]/incidencias` y `/app/[businessId]/notificaciones`, protegidas por BusinessGate.
- Catálogo de navegación y sidebar; accesos desde el portal, asistencia personal, historial de jornadas y supervisión.
- `components/incidents-workspace.test.tsx` y `e2e/incidents.spec.ts`.

No se añadieron dependencias, proveedores pagos, adjuntos, correo, SMS ni WhatsApp. No se envió ningún mensaje fuera de las notificaciones internas de las bases sintéticas de prueba.

## Modelos y migraciones

| Modelo | Responsabilidad y protección |
|---|---|
| IncidentPolicy | Configuración por negocio y versión: plazo opcional, autorización de ADMIN, notificaciones, alertas, categorías y criterios. OWNER conserva revisión y es el único rol que configura permisos. |
| AttendanceIncident | Identidad propia resuelta en servidor, jornada/evento/turno opcionales, fecha laboral, categoría y nombre histórico, hora declarada, motivo y observaciones. Solo estado/versión/actualización pueden cambiar. |
| IncidentDecision | Historial inmutable con actor, estado anterior/nuevo, motivo, fecha servidor, versión, UUID de petición y hash del contenido. |
| AttendanceCorrection | Ajuste inmutable uno-a-uno con expediente aprobado; original opcional, declaración aprobada, actor, motivo, aprobación/aplicación y estado OPERATIONAL_ONLY. Identidad, negocio, jornada y marcación se obtienen por FK protegida al expediente inmutable. |
| AttendanceAudit | Acciones append-only, actor, negocio, instante servidor, recurso, correlación y metadata mínima. |
| AttendanceNotification | Destinatario y negocio, referencia al expediente/jornada, código, clave de deduplicación, fecha y lectura. El contenido no puede sobrescribirse ni borrarse; solo puede registrarse la primera lectura. |

Migraciones aditivas:

- `0009_incidentpolicy_attendanceincident_and_more.py`: tablas, FK PROTECT, índices por negocio/estado/fecha, solicitante/fecha y destinatario/lectura; unicidad de petición, decisión/versión y entrega.
- `0010_incident_integrity.py`: triggers PostgreSQL para preservar declaraciones, decisiones, ajustes, auditoría y contenido de avisos; verifica identidad/empresa de las relaciones y transiciones de estado.

La migración se prueba desde el esquema de etapa 13, conservando todos los campos de una marcación existente. No se genera historial ficticio para acciones anteriores: sus revisiones existentes permanecen en los módulos originales.

## Flujo y autorizaciones

1. El usuario con ficha propia activa registra la solicitud. Puede relacionar una jornada o un turno suyo, indicar un evento existente o declarar una marca faltante. Sin jornada, el expediente no crea una jornada ficticia.
2. Se comprueban identidad, negocio, pertenencia del turno/evento, fecha laboral, categoría habilitada y plazo configurado. La hora declarada exige un offset explícito; la interfaz convierte America/Santiago y pide elegir ocurrencia si hay ambigüedad DST. No se admiten coordenadas ni identidad enviada por el cliente.
3. Se crea PENDING, auditoría y notificaciones a revisores activos autorizados, excluyendo al solicitante.
4. OWNER o ADMIN habilitado pueden pasar a IN_REVIEW, APPROVED o REJECTED con motivo obligatorio. No pueden aprobar/rechazar solicitudes propias, tampoco si se les reasignó la ficha. El solicitante solo puede CANCELLED mientras está PENDING.
5. Estados finales no admiten decisiones posteriores. Bloqueo transaccional por negocio y `expected_version` evitan decisiones simultáneas incompatibles. Repetir UUID/contenido devuelve el mismo resultado; reutilizarlo con otro contenido devuelve 409.
6. Una aprobación con hora declarada valida la secuencia respecto de eventos y ajustes anteriores. No permite sobrescribir un ajuste ya aprobado para el mismo evento o hueco. Genera el registro operativo separado y su auditoría; no genera GPS ni marcación original.
7. El trabajador consulta estado, motivos de revisión y resolución, historial y ajuste. Recibe avisos internos de revisión, aprobación, rechazo y cambios relevantes.

El panel ofrece búsqueda, fechas, trabajador mediante selector paginado, categoría, estado, orden y paginación de diez resultados. La ficha muestra evidencia original, turno, coincidencia con permiso aprobado, declaración, decisiones y acciones autorizadas. El contexto de formulario está limitado a 50 jornadas/turnos por fecha con aviso explícito; la bandeja y el historial principal siguen paginados.

## API

Prefijo `/api/v1/businesses/{business_id}/attendance/`.

| Ruta | Métodos | Acceso y función |
|---|---|---|
| `incidents/` | GET, POST | Lista propia para EMPLOYEE, del negocio para OWNER/ADMIN; creación siempre propia |
| `incidents/{id}/` | GET | Detalle autorizado y acciones permitidas calculadas por servidor |
| `incidents/{id}/transition/` | POST | Decisión o cancelación, UUID idempotente y versión obligatorios |
| `incidents/context/?date=` | GET | Jornadas y turnos de la ficha propia para el formulario |
| `incidents/policy/` | GET, PUT | Lectura de reglas; escritura solo OWNER y versión vigente |
| `incidents/corrections/` | GET | Vista paginada de ajustes operativos aprobados, con el mismo scope |
| `audit/` | GET | OWNER/ADMIN; filtros opcionales acción/recurso, paginación |
| `notifications/` | GET | Solo destinatario y negocio; lectura/no lectura, conteo y paginación |
| `notifications/{id}/read/` | POST | Primera lectura, idempotente y exclusivamente propia |
| `notifications/scan/` | POST | Administración; evaluación explícita de jornadas incompletas según política |

Filtros de incidencias/ajustes: `date_from`, `date_to`, `search`, `employee`, `session`, `category`, `status`, `ordering`, `page`. Parámetros desconocidos se rechazan. Los errores de UUID ajeno no revelan existencia (404); faltas de rol/CSRF producen 403. Las respuestas son no-store.

Límite de API: 120 consultas GET/minuto y 30 escrituras/minuto por usuario/negocio/método; evaluación manual de incompletas, 2/minuto por negocio. Se reutilizan las reservas PostgreSQL existentes.

## Auditoría y privacidad

Acciones registradas: creación, inicio de revisión, aprobación, rechazo, cancelación, ajuste operativo, cambio de reglas de incidencias, política/geocercas, acceso administrativo y resolución de revisión de jornada. Las decisiones comparten su UUID de correlación con los ajustes asociados. Políticas de ubicación y acceso enlazan sus revisiones previas; el log general no duplica GPS ni notas privadas.

Los motivos y observaciones permanecen en el expediente autorizado; la notificación contiene un código y referencias, no el motivo. No se almacenan contraseñas, tokens, payload GPS, IP ni archivos adjuntos. La evidencia de marcación usa EventRead, que excluye coordenadas exactas. No hay seguimiento continuo.

Una cuenta EMPLOYEE solo ve expedientes de su identidad original, incluso si posteriormente se reasigna su ficha. Las notificaciones administrativas se ocultan si se retira el rol o permiso de decisión. La membresía activa y acceso al negocio se comprueban en cada petición y de nuevo dentro de las escrituras transaccionales.

## Notificaciones y operación

Las notificaciones de solicitudes se crean en la misma transacción que la acción, con clave única de entrega por destinatario. Los reintentos no duplican filas. La campana consulta únicamente el negocio seleccionado, refresca cada 60 segundos con pestaña visible y al marcar avisos leídos. BusinessGate/useResource mantienen separación de estado, abortos y descarte de respuestas tardías.

Las alertas de GPS excepcional están deshabilitadas por defecto; OWNER puede habilitarlas. No se crean expedientes automáticamente por pequeñas diferencias de horario. Las jornadas incompletas requieren un umbral explícito en minutos tras el fin programado; sin turno/snapshot no se inventa un cierre esperado.

La evaluación de incompletas se ejecuta desde «Revisar jornadas incompletas» o mediante:

```text
python manage.py scan_attendance_alerts
python manage.py scan_attendance_alerts --business <uuid>
```

El comando se ejecuta mediante la tarea local de Windows `Zenvik-AttendanceAlerts-Stage14`, instalada el 3 de noviembre durante el cierre operativo. Evalúa cada cinco minutos mientras el usuario mantiene una sesión abierta; también se activa al iniciar sesión. No necesita contraseña guardada ni privilegios elevados. Para operación de servidor sin sesión de usuario se requiere configurar el planificador de ese entorno. Las notificaciones de solicitudes y marcaciones excepcionales se generan al ocurrir su transacción y no dependen de ese planificador.

## Entorno de validación

La conexión PostgreSQL habitual no respondió; Docker no está disponible en esta sesión. Se creó una instancia **PostgreSQL 18.6**, aislada en `127.0.0.1:55444`, directorio `.artifacts/pg-stage14`, con usuario técnico nuevo de pruebas, sin alterar credenciales existentes. Los runners usan bases UUID únicas con fixtures sintéticos y las eliminan al terminar. Las variables de conexión se establecieron solo en cada proceso, no en `.env`.

Las migraciones nuevas se validan en esas bases aisladas. **No se aplicaron a la base habitual desconectada.** Repetir la validación en PostgreSQL 17 del compose y aplicar `manage.py migrate` cuando esa conexión esté disponible es una condición de activación local pendiente; no se presenta como realizada.

## Brechas normativas y restricciones de uso

Se consultó nuevamente la [Resolución Exenta 38, texto oficial BCN](https://www.bcn.cl/leychile/navegar?idNorma=1203415), especialmente el régimen de correcciones del artículo 39, y el [ORD. 408 de la DT, 11-09-2026](https://www.dt.gob.cl/legislacion/1624/w3-article-129729.html). La resolución contempla comunicaciones y participación del trabajador en la consolidación de cambios; una decisión de administrador y un aviso interno no acreditan por sí solos el cumplimiento de ese procedimiento. El ordinario distingue registrar ubicación y alertar de usar geocercas para impedir marcaciones.

Por ello esta etapa entrega **gestión operativa**, sin habilitar consolidación oficial, cálculo de remuneraciones, sanciones, ni modificación de timestamps capturados. No se afirma autorización de la Dirección del Trabajo ni certificación. Se mantiene la matriz de brechas de `STAGE-12-COMPLIANCE.md`; deben revisarse comunicaciones, oposición/aceptación, conservación, evidencia, continuidad, fiscalización y autorización antes de uso oficial.

Los ajustes no cierran automáticamente una jornada original que permanece abierta; el estado capturado se conserva. La aplicación formal de correcciones a la máquina de asistencia y cálculos posteriores requiere un diseño validado que no confunda hechos capturados con declaraciones.

## Riesgos y preparación para etapa 15

- Probar PostgreSQL 17 y aplicar migraciones en el entorno habitual cuando esté disponible.
- La ejecución periódica local quedó instalada el 3 de noviembre. En un futuro despliegue, configurar un planificador de servidor que no dependa de una sesión interactiva de Windows.
- Revisar retención, restauración, cifrado, accesos especializados y auditoría independiente antes de escalar. Inmutabilidad SQL no protege frente a un superusuario que altere funciones o infraestructura.
- Medir consultas y crecimiento de auditoría/notificaciones con carga real; no se ejecutó benchmark de producción ni auditoría WCAG integral.
- El contexto de formulario limita 50 registros de una fecha y las decisiones son finales; una revocación o modificación posterior exige un nuevo procedimiento formal, no sobrescritura.
- No se implementó facturación, cobros, planes, suscripciones ni control de cuotas comerciales. **La arquitectura está preparada para incorporar planes y suscripciones por negocio**, mediante una capa de permisos comerciales independiente de roles y evidencia. Debe permitir siempre consultar originales e historial, aun cuando un plan termine; no usar una cuota para falsificar o eliminar marcaciones.

No se ejecutaron comandos Git, commits, push, despliegues, cambios de credenciales existentes, servicios pagos ni eliminación de datos reales.

## Validación final y evidencia

Resultado del 2 de noviembre de 2026, con datos sintéticos y PostgreSQL aislado:

| Verificación | Resultado | Evidencia |
|---|---|---|
| Backend completo | 263 descubiertas: 256 aprobadas y 7 envoltorios E2E omitidos en este runner | `.artifacts/stage14-backend-final.log` |
| Navegador integrado | 7 fases Django aprobadas, 40 escenarios Playwright aprobados | `.artifacts/stage14-e2e-final.log` |
| Frontend | 99 pruebas aprobadas, 15 archivos | `.artifacts/stage14-vitest.log` |
| TypeScript | Sin errores | `.artifacts/stage14-typecheck.log` |
| ESLint | Sin errores | `.artifacts/stage14-lint.log` |
| Build Next | Compilación y rutas generadas | `.artifacts/stage14-build.log` |
| Migraciones/modelos y chequeo Django | Sin cambios pendientes de generar ni problemas de configuración | `.artifacts/stage14-django-check.log` |

Los 7 envoltorios omitidos por el runner backend se ejecutaron después en el runner de navegador. La fase general de Playwright omite 11 escenarios especializados por configuración; estos se ejecutaron en sus fases específicas (3 asistencia, 1 incidencias, 2 personal, 1 planificación, 2 portal, 2 Turnstile). No se desactivaron pruebas para obtener resultados favorables. El log de navegador contiene `NativeCommandError` de PowerShell al redirigir stderr informativo de Django («Creating test database»); termina con las siete fases `OK`, sin fallos de pruebas.

Las nuevas pruebas backend cubren aislamiento por trabajador/negocio, campos falsificados, permisos revocados, aprobación propia, transiciones finales, reintentos, versiones obsoletas, cronología de ajustes, concurrencia real, notificaciones deduplicadas, CSRF y paginación. Incluyen rechazo SQL de cambios a evidencia y migración de una marcación existente desde 0008 hasta las migraciones nuevas, conservándola.

Se corrigieron durante la validación referencias SQL a nombres de tablas personalizados, fixtures duplicados, comparación de instantes con distinto offset y selectores/interceptores de navegador. La regresión final se ejecutó después de esas correcciones.

Evidencia visual revisada en escritorio y móvil de 320 px:

- [Formulario móvil](screenshots/stage14/stage14-worker-form-320.png).
- [Detalle aprobado y evidencia original](screenshots/stage14/stage14-approved-detail.png).
- [Ajustes separados](screenshots/stage14/stage14-corrections-desktop.png).
- [Auditoría administrativa](screenshots/stage14/stage14-audit-desktop.png).
- [Notificaciones móviles](screenshots/stage14/stage14-notifications-320.png).

## Checklist de aceptación

| Criterio | Evidencia y resultado |
|---|---|
| 1. Registrar incidencias propias | API, formulario y E2E de olvido de salida aprobados |
| 2. Consultar estado | Lista, filtros y detalle; pruebas frontend/backend/E2E |
| 3. Revisión administrativa | Evidencia original, jornada y decisiones; E2E |
| 4. Aprobaciones/rechazos controlados | Transiciones, autorización, motivos, versiones y concurrencia probados |
| 5. Preservar originales | E2E compara comprobante antes/después; pruebas SQL y migración |
| 6. Trazabilidad | Decisiones/auditoría inmutables, actor, fecha, motivo y correlación |
| 7. Notificaciones internas | Generación, destinatario, lectura, deduplicación y revocación probados |
| 8. Incidencias reales en panel | Datos persistidos de API, filtros y paginación; sin datos ficticios en producto |
| 9. Jornadas y turnos | Referencias validadas, contexto, enlaces y evidencia; alertas configurables |
| 10. Aislamiento multiempresa | Backend y E2E rechazan referencias y accesos ajenos |
| 11. Responsive y accesibilidad | Capturas 320 px/escritorio, controles etiquetados, diálogos y regresión de teclado; sin afirmar auditoría WCAG integral |
| 12. Pruebas relevantes | Backend, frontend, 40 E2E, lint, tipos y build aprobados |
| 13. Brechas normativas | Documentadas arriba; aplicación oficial deshabilitada |

La implementación y validación de estos criterios están terminadas en el entorno aislado. La activación en la base habitual y la automatización de avisos por vencimiento conservan las condiciones operativas descritas; no se declara despliegue ni certificación.

## Cierre de la reanudación — 3 de noviembre de 2026

Se verificó con `pg_ctl status` que la instancia temporal `.artifacts/pg-stage14` ya no está ejecutándose. El intento de detenerla al cierre anterior no se ejecutó porque el servicio de revisión automática agotó su cuota; la comprobación actual confirma que no queda ese servidor pendiente de cierre. Se conservan los archivos de evidencia.

Se volvió a intentar una conexión de solo lectura a la base configurada por Django, con tiempo de conexión limitado y sin mostrar credenciales: continúa inaccesible. No se aplicaron migraciones ni se modificaron datos en esa base. Una vez disponible, desde `apps/api`, con el entorno virtual y la configuración habituales:

```powershell
.\.venv\Scripts\python.exe manage.py migrate --plan
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py check
```

Los comandos anteriores son instrucciones de activación pendientes, no evidencia de ejecución. Las migraciones ya fueron ejecutadas y verificadas en bases aisladas durante las pruebas. El informe, el contrato API y las evidencias de pruebas quedan cerrados; no hay implementación adicional pendiente de esta etapa. Permanecen las dependencias operativas y regulatorias identificadas expresamente en este documento.

## Automatización local instalada — 3 de noviembre de 2026

Se confirmó que Docker no está instalado y que PostgreSQL 18 está activo en `127.0.0.1:5432`. El puerto configurado previamente, 5435, no responde. La conexión a 5432 con las credenciales existentes fue rechazada por autenticación; no se cambió ninguna contraseña. El usuario eligió usar PostgreSQL local y está actualizando `.env`. No se reemplazó ni creó una base alternativa para ocultar este bloqueo.

La tarea `Zenvik-AttendanceAlerts-Stage14` quedó registrada y verificada con intervalo `PT5M`, principal `Interactive` y política `IgnoreNew`. Sus archivos reproducibles son:

- `scripts/install_attendance_alerts.ps1`: instalación idempotente; rechaza sobrescribir otra tarea con acción distinta.
- `scripts/run_attendance_alerts.py`: invoca el detector usando el Python del proyecto, conexión limitada a cinco segundos y ejecución limitada a 240 segundos. Registra resultado sin copiar diagnósticos de conexión ni credenciales. Conserva hasta tres respaldos de 1 MB.
- `.artifacts/attendance-alerts.log`: historial local de ejecución. Un fallo devuelve código distinto de cero; la tarea vuelve a intentar en el siguiente intervalo.

Se verificaron éxito, fallo del detector, timeout, omisión de diagnósticos sensibles y liberación de handlers con un proceso de prueba y subprocess simulado. El detector real se ejecutó y devolvió fallo de conexión, correctamente registrado. La instalación de la tarea no demuestra todavía entrega de avisos en la base habitual: esa comprobación depende de la conexión válida.

Para inspeccionar o detener reversiblemente esta automatización local:

```powershell
Get-ScheduledTaskInfo -TaskName 'Zenvik-AttendanceAlerts-Stage14'
Get-Content .artifacts/attendance-alerts.log -Tail 20
Disable-ScheduledTask -TaskName 'Zenvik-AttendanceAlerts-Stage14'
# Para reactivarla:
Enable-ScheduledTask -TaskName 'Zenvik-AttendanceAlerts-Stage14'
```

La tarea no cambia políticas del negocio ni fabrica incidencias: solo genera avisos cuando la política existente habilita notificaciones y define un umbral de jornada incompleta. No ejecuta migraciones automáticamente.

## Verificación de arranque y cierre técnico — 3 de noviembre de 2026

La inspección encontró la base habitual accesible en 5435, migraciones hasta 0008 aplicadas y el puerto 8000 sin servidor. El plan contenía únicamente las migraciones nuevas de asistencia 0009 y 0010; ambas se aplicaron con resultado OK. `manage.py check` no reportó problemas y `manage.py migrate --check` terminó con código cero.

Se inició el backend local en segundo plano, sin recarga automática, con el Python del proyecto. Se verificó `GET /api/v1/auth/csrf/` con HTTP 200. Evidencia de arranque y peticiones: `.artifacts/backend-local.stdout.log` y `.artifacts/backend-local.stderr.log`; identificador del proceso en `.artifacts/backend-local.pid`. El aviso estándar de servidor de desarrollo y «System check identified no issues (0 silenced)» no son errores.

El detector se ejecutó directamente y desde el Programador de tareas. Ambos finalizaron correctamente; la ejecución programada registró `LastTaskResult=0` y `Notifications created: 0`. No se crearon datos ficticios para forzar avisos. La tarea queda periódica y respeta las políticas existentes. Los errores de conexión antiguos permanecen en el log como historial, seguidos de ejecuciones exitosas.

No se necesita iniciar una segunda instancia en 8000 mientras esta siga activa. Para consultar su salida desde una terminal:

```powershell
Get-Content .artifacts/backend-local.stdout.log -Tail 20
Get-Content .artifacts/backend-local.stderr.log -Tail 20 -Wait
```
