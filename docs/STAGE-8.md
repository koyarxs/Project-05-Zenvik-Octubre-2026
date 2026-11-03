# Etapa 8 — espacio privado de Zenvik

Implementación local del 31 de octubre de 2026, revisada contra la especificación ampliada que incluye la preparación de Zenvik Asistencia. No se ejecutaron comandos Git, commits, despliegues ni instalaciones de dependencias. Se conservaron las credenciales, las sesiones Django, las cookies HttpOnly, el proxy y CSRF.

## Antes y después

| Área | Antes | Después |
|---|---|---|
| Mis negocios | Banner fotográfico, portada compartida por todas las tarjetas y segundo panel grande de registro | Encabezado «Tus negocios», una sola acción de registro, iniciales, nombre, RUT disponible, rol y estado reales; vistas tarjetas/lista |
| Navegación | Menú sin persistencia y contexto implícito cuando existía un solo negocio | Selección explícita, Inicio contextual, estado activo, preferencia visual en sessionStorage, menú móvil con foco contenido y fondo inerte |
| Dashboard | Descarga de todas las páginas semanales y cálculos en navegador | Un resumen acotado, conteos en SQL, siete días de agenda, vistas previas de hoy, próximos turnos y solicitudes; enlaces a módulos paginados |
| Portal del trabajador | Bloque azul oscuro prominente | Resumen claro y compacto, exclusivamente con turnos y solicitudes propios |
| Marca | Símbolo geométrico existente | Se conserva BrandMark SVG y wordmark en variantes clara, oscura y compacta |

## Archivos y componentes

Frontend modificado:
- `apps/web/src/components/app-shell.tsx`: navegación desde catálogo, selección explícita, título contextual, breadcrumbs, persistencia visual, accesibilidad móvil y menú de cuenta.
- `apps/web/src/components/business-workspaces.tsx`: BusinessWorkspaces y BusinessCard reconstruidos; se elimina el panel duplicado de registro del renderizado.
- `apps/web/src/components/operations-dashboard.tsx`: métricas, errores, actualización manual, fecha del servidor, acciones y vistas previas conectadas al resumen; métricas en dos columnas también en móvil.
- `apps/web/src/components/operations-panels.tsx`: WeekAgenda utiliza conteos completos; ShiftList admite dos columnas; PendingList recibe solo campos necesarios.
- `apps/web/src/components/workspace-provider.tsx`: actualización al recuperar foco, cancelación de consultas anteriores y errores específicos de API.
- `apps/web/src/components/business-gate.tsx`: remonta el contenido al cambiar el negocio para reiniciar estados y formularios.
- `apps/web/src/hooks/use-resource.ts`: descarta respuestas tardías de peticiones canceladas.
- `apps/web/src/lib/data.ts`: propaga AbortSignal a todas las páginas del listado de negocios.
- `apps/web/src/app/globals.css`: paleta y composición responsive de negocios.
- `apps/web/vitest.config.ts`: descubrimiento de pruebas TSX y alias del proyecto.
- `apps/web/e2e/workspaces.spec.ts`, `apps/web/e2e/zenvik.spec.ts`: pruebas ajustadas a la nueva interfaz y cobertura adicional.

Archivos nuevos:
- `apps/web/src/lib/workspace-navigation.ts`: catálogo de módulos implementados y resolución de títulos, estado activo y breadcrumbs por rol.
- `apps/web/src/components/workspace-breadcrumbs.tsx`: navegación semántica con padres enlazados y página actual.
- `apps/web/src/lib/workspace-navigation.test.ts`: selección explícita, rutas, roles, ficha/edición, prefijos y configuración.
- `apps/web/src/lib/data.test.ts`: paginación cancelable sin resultados parciales.
- `apps/api/businesses/dashboard_views.py`: DashboardView.
- `apps/api/businesses/test_dashboard.py`: permisos, aislamiento, límites, conteos, turnos nocturnos, cancelaciones, estado vacío y solo lectura.
- `apps/web/src/components/business-workspaces.test.tsx`: estado vacío, identidad real y agenda agregada.

Documentación actualizada: `apps/api/API.md`, `WORKSPACE-VISUAL.md`, este informe y `docs/NAVIGATION-AND-ATTENDANCE-ROADMAP.md`.

Backend modificado: `apps/api/businesses/urls.py` registra el resumen. `apps/api/businesses/test_browser.py` separa la fase funcional y la fase Turnstile en dos casos LiveServerTestCase con fixtures independientes. No se requieren migraciones. Los componentes visuales existentes se reutilizaron y ampliaron; no se introdujo otro sistema de diseño.

## Rutas y contratos

Se conservan `/app`, `/app/nuevo-negocio`, `/app/configuracion`, `/app/[businessId]` y las rutas existentes de turnos, trabajadores y permisos. No hay módulos ni rutas ficticios.

Nuevo `GET /api/v1/businesses/<uuid>/dashboard/`:
- Fecha actual determinada por el servidor en America/Santiago.
- `active_employees`: conteo real para OWNER/ADMIN, null para EMPLOYEE.
- `today_count`, `week_count`, `pending_count`: conteos completos.
- `today_shifts`, `upcoming_shifts`: hasta seis elementos cada uno; próximos incluye turnos en curso.
- `pending_requests`: hasta cuatro solicitudes, las más antiguas primero; no incluye motivos, correos ni notas privadas.
- `days`: siete fechas con conteos de turnos que intersectan cada día, incluidos nocturnos.
- Solo turnos SCHEDULED; límites temporales calculados en Santiago. Se conserva la semántica de solapamiento de los endpoints existentes.
- IsAuthenticated + BusinessScopedPermission; membresía y negocio activos obligatorios. EMPLOYEE se restringe a sus turnos y solicitudes; terceros reciben 404 igual que UUID inexistente. Sin caché HTTP. Solo GET/HEAD/OPTIONS.
- Las vistas previas son deliberadamente acotadas; los enlaces conducen a los módulos con paginación. No se descargan listas completas para estadísticas.

Se reutilizan `GET /api/v1/businesses/`, `/auth/me/`, `/auth/csrf/` y `POST /auth/logout/`. Los formularios y módulos operativos conservan sus endpoints.

El estado de los recursos se separa por URL del negocio y se aborta al desmontar/cambiar ruta. No se persisten datos empresariales ni secretos en almacenamiento del navegador. sessionStorage contiene únicamente la preferencia expandido/contraído del menú.

## Validación final

| Verificación | Resultado final |
|---|---|
| TypeScript | Aprobado |
| ESLint | Aprobado, sin advertencias |
| Build Next.js | Aprobado |
| Unitarias frontend | 49/49 aprobadas, 9 archivos |
| Suite Django | 169 casos descubiertos: 167 aprobados y 2 casos E2E omitidos en esta ejecución |
| Runner E2E Django | Los 2 casos omitidos arriba se ejecutaron aquí y aprobaron |
| Playwright funcional/seguridad | 29/29 aprobadas; Turnstile se reserva para la siguiente fase |
| Playwright Turnstile | 2/2 aprobadas con proveedor controlado |

Total de pruebas de navegador: 31 aprobadas. Fallos pendientes en las verificaciones ejecutadas: 0. Ninguna prueba obligatoria quedó sin ejecutar; las omisiones por fase se ejecutaron mediante el runner correspondiente.

Registros verificables: [backend](../.artifacts/stage8-review-backend.log) y [E2E](../.artifacts/stage8-review-e2e.log).

Comandos del frontend, desde `apps/web`: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`. En PowerShell se usa npm.cmd porque la política local bloquea npm.ps1; no se cambió esa política.

Backend, desde `apps/api`: `.venv/Scripts/python.exe manage.py test --noinput`. Navegador: `.venv/Scripts/python.exe run_browser_tests.py`; este runner crea una base con nombre único, usa la API Django real y ejecuta la compilación de producción de Next.js. En esta máquina se establecieron solo para el proceso `POSTGRES_PORT=55438`, `POSTGRES_USER=zenvik_stage8`, `POSTGRES_DB=postgres`, correspondientes al clúster aislado. No se cambió la configuración del proyecto.

Fallos encontrados y corregidos durante el trabajo:
- Fixtures iniciales del resumen con correos vacíos duplicados: corregidas con correos sintéticos únicos.
- Selector genérico role=alert encontraba también el anunciador de Next.js: se delimita por el error esperado.
- La prueba nueva de actualización esperaba una respuesta 200 con barra final. Next.js redirige a la ruta normalizada sin esa barra; el botón sí ejecutaba la consulta. La prueba ahora comprueba la URL normalizada y el estado 200. También se utiliza el título real del directorio al comprobar el retorno desde el breadcrumb.
- El test de método no permitido se envía como JSON para atravesar el control existente de Content-Type y comprobar el 405.

La ampliación de la suite detectó además contaminación del contador de intentos de autenticación entre las fases funcional y Turnstile: la segunda recibió HTTP 429 después de los inicios de sesión de la primera. Se separaron ambas fases en casos LiveServerTestCase con fixtures independientes, sin elevar, borrar manualmente ni desactivar límites de seguridad.

No se eliminaron pruebas ni se desactivaron controles para hacer pasar las suites. Los interceptores utilizados en pruebas de errores y latencia viven solo en Playwright; el producto consulta datos reales.

## Capturas revisadas

- [Mis negocios — escritorio](../.artifacts/workspaces/desktop.png)
- [Mis negocios — móvil](../.artifacts/workspaces/mobile.png)
- [Dashboard — escritorio](../.artifacts/release/v2-dashboard.png)
- [Dashboard a 320 px](../.artifacts/release/stage8-dashboard-320.png)
- [Dashboard del trabajador — móvil](../.artifacts/release/v2-worker-mobile.png)
- [Navegación y permisos — tablet](../.artifacts/release/v2-tablet.png)

## Criterios de aceptación de la especificación ampliada

| # | Criterio | Estado |
|---|---|---|
| 1 | Dashboard con rediseño profesional claramente visible | COMPLETADO |
| 2 | Logo de Zenvik integrado correctamente | COMPLETADO |
| 3 | Navegación funcional | COMPLETADO |
| 4 | Selector de negocios funcional | COMPLETADO |
| 5 | Dashboard con información real | COMPLETADO |
| 6 | Interfaz responsive en desktop, tablet y móvil | COMPLETADO |
| 7 | Roles y permisos respetados | COMPLETADO |
| 8 | Aislamiento entre negocios | COMPLETADO |
| 9 | Pruebas relacionadas satisfactorias | COMPLETADO |
| 10 | Problemas pendientes documentados | COMPLETADO |

## Entorno y límites

Al iniciar la validación, el PostgreSQL configurado en 5435 no respondió. En la comprobación final, ese puerto ya aceptaba conexiones; las suites de esta entrega se ejecutaron en el clúster aislado descrito a continuación. El servicio existente en 5432 no aceptó las credenciales del proyecto. Se usaron los binarios PostgreSQL 18 instalados para iniciar una instancia aislada en 127.0.0.1:55438, con datos exclusivamente sintéticos bajo `.artifacts/pg-stage8`. No se modificó `.env` ni la base de desarrollo. Las suites usan bases temporales propias de Django. La configuración del proyecto declara PostgreSQL 17: conviene repetir la validación en esa versión en CI.

La validación de contraste cubre tokens y badges; teclado, foco, menú y desbordamiento se verifican con Playwright. No equivale a una auditoría completa con lectores de pantalla. Las capturas no contienen datos de usuarios reales. Las fotografías anteriores permanecen en disco, pero no se muestran en Mis negocios.


## Checklist solicitado en la especificación ampliada

| Área | Estado | Evidencia |
|---|---|---|
| Integración del logo | COMPLETADO | BrandMark SVG existente; variantes clara, oscura y compacta |
| Layout y sidebar | COMPLETADO | Menú contraíble, preferencia visual, selección explícita y foco móvil |
| Header y navegación | COMPLETADO | Catálogo de rutas reales, breadcrumb enlazado, títulos internos y menú de cuenta |
| Selector de negocios | COMPLETADO | Roles/datos reales, tarjetas/lista, registro, vacío, error y cambio de contexto |
| Dashboard operativo | COMPLETADO | Resumen agregado, agenda, pendientes, próximos turnos y acciones autorizadas |
| Responsive | COMPLETADO | Escritorio, tablet, móvil de 390 y 320 px; sin desborde en pruebas |
| Accesibilidad de controles principales | COMPLETADO | Teclado, Escape, foco contenido/restaurado, salto al main, labels, estados y contraste de tokens |
| Seguridad multiempresa | COMPLETADO | Backend por membresía/rol, 404 uniforme, CSRF, cookies, cancelación y separación del estado |
| Pruebas automatizadas | COMPLETADO | Ver resultados finales y registros |

## Preparación de Asistencia y continuación a Etapa 9

La arquitectura de navegación ya permite incorporar otro módulo mediante su definición de ruta, etiquetas por rol e icono. [Diseño de extensión y límites de Asistencia](NAVIGATION-AND-ATTENDANCE-ROADMAP.md).

Asistencia no está implementada: no hay reloj control, entradas, salidas, descansos, marcaciones simuladas ni nuevos modelos. Esto es el alcance solicitado, no una funcionalidad incompleta de esta etapa. No se declara autorización por la Dirección del Trabajo.

Pendientes de entorno y validación adicional:
- Repetir las pruebas en PostgreSQL 17 del compose/CI; aquí se verificó PostgreSQL 18 aislado porque el puerto configurado no estaba disponible.
- Una auditoría integral de lectores de pantalla y navegadores distintos de Chromium queda fuera de la validación automatizada efectuada. No se afirma certificación WCAG completa.
- No se hicieron pruebas de carga con volúmenes de producción. El resumen limita las vistas previas y hace los conteos en SQL.
- El dashboard muestra planificación y solicitudes reales; no se inventa un historial general de actividad, ni tendencias ni asistencia efectiva.

No hay un bloqueo funcional conocido para desarrollar la Etapa 9 con los resultados finales aprobados de este informe. La comprobación final de disponibilidad del puerto habitual fue positiva; no se modificaron sus credenciales ni se ejecutaron estas suites contra esa instancia.

La instancia temporal de PostgreSQL se detuvo al concluir. Sus archivos sintéticos se conservaron en `.artifacts/pg-stage8`; no se modificaron credenciales ni datos del entorno habitual.
