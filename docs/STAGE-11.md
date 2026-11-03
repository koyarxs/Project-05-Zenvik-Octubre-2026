# Zenvik — Etapa 11: portal privado del trabajador

Estado: implementación completada y verificada localmente. Los diez criterios de aceptación tienen evidencia descrita abajo.

## Auditoría y alcance

Se revisaron `STAGE-8.md`, `STAGE-9.md` y `STAGE-10.md`, además del código de sesiones, roles, membresías, trabajadores, planificación, solicitudes, vistas y pruebas. Se verificó que las etapas anteriores tienen implementación real: calendario semanal/mensual/agenda, turnos nocturnos, filtros, perfiles laborales, control de acceso, solicitudes y decisiones auditadas. No se consideraron completas solo por sus informes.

Se conserva la arquitectura Next.js/React + Django REST Framework + PostgreSQL. No se agregaron dependencias, modelos, migraciones, endpoints ni servicios. No se ejecutaron comandos Git, commits, push ni despliegues; no se cambiaron credenciales ni datos reales. Las pruebas usan bases temporales con registros sintéticos.

## Implementación

- Dashboard exclusivo para EMPLOYEE, separado del centro de operaciones de OWNER/ADMIN. Bienvenida con nombre de la ficha, negocio y fecha del servidor en Santiago.
- Próximo turno real, incluido uno en curso o posterior a los próximos siete días: fecha, horario nocturno, negocio, zona, colación, notas y advertencia por permiso aprobado. Su estado describe planificación y no asistencia efectiva.
- Vista previa de hasta seis próximos turnos y agenda de siete días. Enlaces al calendario existente para consultar semana, cambiar semana y abrir detalles; sin herramientas de escritura para EMPLOYEE.
- Conteos propios de pendientes, aprobadas y rechazadas sobre todo el historial; enlaces por estado y acceso al historial completo, incluidos los cancelados existentes.
- Accesos funcionales a turnos, solicitud, historial y perfil. Sin ficha activa, se explica la situación y no se ofrece crear una solicitud desde Inicio; el servidor mantiene su validación en el módulo de permisos.
- Perfil personal con contacto autorizado, información laboral y cuenta separados. No se muestran notas administrativas. Se mantiene la política vigente: EMPLOYEE consulta su ficha y solicita correcciones a administración; no se introdujeron privilegios de edición.
- Permisos reutilizan fechas, categoría, motivo/observaciones, errores, confirmaciones, consulta y cancelación de pendientes existentes. No hay aprobación propia ni transiciones nuevas.
- Navegación inferior de cuatro destinos en móvil/tablet, con indicador de página actual, controles de 48 px y área segura inferior; se oculta en escritorio. El menú conserva Escape, devolución de foco y bloqueo de contenido con `inert`.
- Se reutilizan logo, colores, tipografía, tarjetas, botones, avisos, diálogos, calendario y estados de carga. La composición móvil reduce encabezados y espacios de días vacíos; conserva foco visible y movimiento reducido.

## Componentes y rutas

| Archivo/componente | Responsabilidad |
| --- | --- |
| `worker-dashboard.tsx`: `WorkerDashboard`, `WorkerHome` | Consulta, carga/error/actualización y presentación del inicio personal |
| `worker-profile.tsx`: `WorkerProfile`, `WorkerProfileContent` | Consulta de ficha propia y presentación personal/laboral/cuenta |
| `lib/worker-portal.ts` | Contrato del resumen, destinos móviles y estado horario |
| `app-shell.tsx` | Barra inferior y espacio para evitar ocultar el final del contenido |
| `employee-detail.tsx` | Reutiliza presentación personal al abrir la ficha por ID como EMPLOYEE |
| `operations-dashboard.tsx` | Conserva centro de operaciones administrativo separado |
| `globals.css` | Jerarquía y calendario compactos en móvil |

Rutas existentes reutilizadas: `/app` (selector), `/app/[businessId]` (inicio según rol), `/turnos`, `/trabajadores` (perfil propio para EMPLOYEE), `/trabajadores/[employeeId]`, `/permisos`, bajo ese negocio; `/app/configuracion` para cuenta. Las rutas de alta/edición conservan restricciones. No existe ruta funcional de asistencia.

## API y base de datos

Se amplió únicamente `GET /api/v1/businesses/{id}/dashboard/`: añade `server_now`, `timezone`, perfil mínimo propio, `next_shift` y conteos por estado. Los campos personales son nulos para administradores; el resto del contrato administrativo permanece disponible. Se aplican filtros de negocio y usuario antes de agregados y previews. Respuesta `no-store`.

Se reutilizan `employees/`, `employees/{id}/`, `shifts/`, `shifts/{id}/`, `leave-requests/` y sus acciones existentes. La identidad se resuelve con sesión, membresía y vínculo en servidor, no con IDs elegidos por el cliente. La colección de empleados devuelve solo la ficha propia para EMPLOYEE.

No hay N+1 por empleado en el resumen: `select_related` y prefetch de permisos aprobados para serializar conflictos. La prueba compara el número de consultas con uno y seis empleados. Los previews están limitados; los conteos se agregan en PostgreSQL y los módulos completos mantienen paginación. La retención y volumen de permisos aprobados deberán medirse con datos de producción; no se hizo un benchmark de carga masiva.

`makemigrations --check --dry-run`: sin cambios detectados. Se conservan las migraciones anteriores. `SHOW server_version` confirmó PostgreSQL 17.11 local.

## Seguridad

Se mantienen sesiones Django, cookies HttpOnly, CSRF y permisos de servidor. `active_membership` exige usuario, negocio activo, membresía activa y acceso habilitado. Las fichas y turnos ajenos no se exponen; editar turnos y ficha sigue restringido a los roles autorizados. Las notas administrativas no se serializan para trabajadores y el resumen no incluye motivos de solicitudes.

`BusinessGate` remonta por negocio; los hooks descartan y cancelan consultas anteriores al cambiar ruta. La prueba E2E cambia a otro negocio del mismo usuario sin ficha y verifica ausencia de turno/nombre anteriores. Los errores de autorización no confirman si existe un recurso ajeno. Se conservan pruebas de escalamiento de privilegios, negocio ajeno, CSRF, acceso suspendido y sesión expirada.

Riesgos residuales: el estado visible puede quedar desactualizado hasta actualizar o navegar; la autorización se vuelve a comprobar en cada solicitud. No se implementa invalidación por WebSocket. Las capturas contienen exclusivamente datos de prueba; no se guardan cookies ni trazas. La revisión automatizada y visual no equivale a una certificación formal de accesibilidad o seguridad.

## Pruebas y evidencia

Validación local de esta etapa:

| Verificación | Resultado |
| --- | --- |
| Backend: `.venv/Scripts/python.exe run_backend_tests.py` desde `apps/api` | 216 descubiertas: 211 aprobadas y 5 lanzadores E2E omitidos deliberadamente en este modo |
| Vitest: `npm.cmd --prefix apps/web test` | 74 aprobadas, 12 archivos |
| TypeScript: `npm.cmd --prefix apps/web run typecheck` | Aprobado |
| ESLint: `npm.cmd --prefix apps/web run lint` | Aprobado, sin advertencias |
| Next.js: `npm.cmd --prefix apps/web run build` | Aprobado |
| E2E: `run_browser_tests.py` y repetición dirigida del portal | 36 casos aprobados: 29 generales, 2 personal, 1 planificación, 2 Turnstile y 2 portal |

Pruebas nuevas: próximo turno fuera de la semana, privacidad del perfil, conteos de todos los estados con decisiones válidas, ausencia/inactividad de ficha, acceso suspendido, consultas constantes, estados vacíos, destinos por rol y estado horario nocturno. El E2E nuevo recorre login → inicio → detalle de turno → semanas → perfil → creación y consulta de permiso pendiente → rechazo de acceso ajeno y funciones administrativas, a 320 px. Otro caso cubre negocio diferente, ausencia de ficha, error recuperable, carga y escritorio/tablet. La regresión preserva las suites anteriores; no se eliminaron pruebas.

Durante la validación se corrigieron problemas de los tests nuevos: la fixture debe crear permisos pendientes y decidirlos mediante el servicio, y la espera de error debe apuntar al aviso del contenido, evitando confundir el anunciador de rutas de Next.js con el error real. La pantalla de alta prohibida se comprueba mediante su encabezado «Acceso restringido». Se conserva la comprobación de recuperación y carga. El primer recorrido completo tuvo un fallo de selector en el caso nuevo del portal; las cuatro fases anteriores aprobaron. Se repitió la fase del portal con `run_browser_tests.py businesses.test_browser.FrontendBrowserTests.test_portal_frontend_against_isolated_api` y sus dos casos aprobaron. Los siete skips de Playwright en la fase general corresponden a casos ejecutados en fases aisladas; no hay casos descartados para obtener aprobación.

Logs: `.artifacts/stage11-backend.log`, `.artifacts/stage11-e2e.log` (ejecución completa, incluido el fallo inicial del selector nuevo) y `.artifacts/stage11-portal-e2e.log` (fase corregida aprobada). TypeScript y ESLint se repitieron después de corregir los tests.

Capturas sintéticas disponibles y revisadas visualmente:

- [Inicio 320 px](../.artifacts/stage11/portal-home-320.png).
- [Turnos 320 px](../.artifacts/stage11/portal-shifts-320.png).
- [Perfil 320 px](../.artifacts/stage11/portal-profile-320.png).
- [Solicitudes 320 px](../.artifacts/stage11/portal-requests-320.png).
- [Inicio desktop](../.artifacts/stage11/portal-home-desktop.png).
- [Inicio tablet](../.artifacts/stage11/portal-home-tablet.png).

Las capturas son de página completa: la barra fija aparece a la altura del borde inferior del viewport original; el contenido se desplaza bajo ella y tiene espacio inferior para alcanzar el último control. El recorrido interactúa con los módulos usando esa barra. No se detectó desbordamiento horizontal en las vistas móviles verificadas.

## Asistencia futura

La propuesta completa está en [ATTENDANCE-CONTRACT-PROPOSAL.md](ATTENDANCE-CONTRACT-PROPOSAL.md): identidad servidor, integración de «Mi asistencia», cuatro eventos, máquina de estados, UTC/zona IANA, idempotencia, concurrencia, contratos, correcciones, GPS puntual, denegaciones y minimización/retención de datos.

La arquitectura está preparada para implementar el módulo en la Etapa 12. No hay marcaciones, GPS, geocercas, seguimiento continuo, horas efectivas inventadas ni declaración de autorización de la Dirección del Trabajo. Antes de activar el futuro módulo deben decidirse políticas de ubicación, retención, corrección y desconexión, además de la revisión normativa correspondiente.

## Checklist de aceptación

| Criterio | Evidencia |
| --- | --- |
| 1. Dashboard privado funcional | `WorkerHome`, API de resumen, unitarias y E2E del portal |
| 2. Consulta de turnos | Calendario reutilizado, tests de turnos y detalle nocturno E2E |
| 3. Consulta del perfil | Perfil personal, scope backend y recorrido móvil |
| 4. Solicitudes de permisos | Servicio existente y creación real en E2E |
| 5. Historial de solicitudes | Filtros, conteos y suites de permisos |
| 6. Navegación responsive y accesible | 320 px, tablet/desktop, teclado/Escape, movimiento reducido y capturas |
| 7. Autorización | Pruebas de rol, CSRF, acceso deshabilitado y escritura denegada |
| 8. Aislamiento entre trabajadores/negocios | Tests de APIs, recurso ajeno y cambio de negocio E2E |
| 9. Pruebas relevantes aprobadas | 211 backend + 74 frontend + 36 E2E; TypeScript, ESLint y build aprobados |
| 10. Preparación de asistencia | Contratos y estados documentados, sin funciones ficticias |

## Pendientes y recomendación

No quedan bloqueos conocidos dentro del alcance de la Etapa 11. Se mantienen limitaciones anteriores: zona operativa Santiago y perfil del trabajador de solo consulta. No bloquean el alcance solicitado. Continuar con implementación transaccional y auditable de asistencia en Etapa 12 después de confirmar las decisiones del contrato propuesto.
