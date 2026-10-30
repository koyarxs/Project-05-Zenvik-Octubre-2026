# Zenvik 2.0 — implementación y verificación

Fecha: 29-10-2026. Rediseño aplicado al código Next.js existente y a sus APIs
reales. Sin despliegue, nuevas dependencias de aplicación, migraciones, cambios
de credenciales ni comandos Git. La operación de desarrollo conserva sus datos.

## Auditoría y dirección visual

La inspección confirmó autenticación, negocios, trabajadores, turnos y solicitudes.
Se detectaron un dashboard centrado solo en fichas, búsqueda limitada a la página
actual, perfiles sin actividad, navegación sin contracción y composición visual
uniforme. Se revisaron rutas, API.md, permisos, formularios, estados y componentes.
Línea base: 141 pruebas backend aprobadas (un wrapper E2E omitido) y 27 unitarias
frontend; la suite Chromium de seguridad de etapa 7 ya estaba disponible.

Se adoptó azul noche #14263D, petróleo #203B52, turquesa #18A999 y superficies
claras. El color de acción se oscureció a #126D67 para mantener contraste con
texto blanco. Manrope para títulos e Inter para interfaz, archivos variables
locales con licencias OFL de Google Fonts; no se consultan fuentes externas en
el navegador. No hay fotografías inventadas, métricas simuladas ni notificaciones.

El diseño diferencia tablas, agenda, planificación, perfiles y formularios, con
jerarquía compacta, bordes discretos, iniciales y estados semánticos. Los botones,
campos, diálogo, títulos, skeletons, avisos, toast y badges comparten tokens y estilo.

## Fases completadas

| Fase | Implementación verificable |
| --- | --- |
| A · Auditoría | Inventario de rutas/componentes/endpoints, brechas y línea base |
| B · Sistema/layout | Fuentes locales, tokens, sidebar azul noche contraíble, selector de negocio, navegación móvil con teclado, contexto y cuenta |
| C · Dashboard | Personas activas, turnos de hoy, pendientes, próximos 7 días, agenda y accesos rápidos con datos reales |
| D · Turnos | Semana/agenda, fecha, hoy, filtro por persona, mostrar cancelados, bloques nocturnos, CRUD autorizado y confirmación |
| E · Trabajadores | Búsqueda en todo el directorio autorizado, filtro activo/inactivo, tabla adaptable, perfil con actividad y confirmación de baja |
| F · Solicitudes | Pestañas por estado, fechas, historial, presentación de pendientes, revisión y formularios conectados |
| G · Portal personal | Próximo turno, calendario propio, solicitudes y ficha; sin indicadores corporativos para EMPLOYEE |
| H · Autenticación/negocios | Login/registro con identidad propia, visibilidad de contraseña, selección/cambio de negocio y alta guiada |
| I · QA | Regresión backend, unitarias, contraste, typecheck/lint/build, E2E y revisión de capturas |

`/app/configuracion` es una vista real de consulta de la cuenta y espacios
disponibles, con actualización desde la API de sesión y un toast de confirmación
que puede cerrarse y desaparece a los cinco segundos. No aparenta editar datos o
gestionar roles que la API no ofrece. El menú solo enlaza destinos implementados.

## Datos y funcionalidad

- Dashboard usa employees?is_active=true, shifts por intervalo de siete días y
  leave-requests?status=PENDING. Recorre las páginas del intervalo de turnos para
  calcular el total real de registros únicos. Las vistas previas muestran hasta
  seis turnos y cuatro solicitudes con enlace al módulo completo.
- Fechas y límites de jornadas se calculan en America/Santiago, independientemente
  del navegador, preservando los cambios de horario. El reloj del dashboard se
  actualiza cada minuto; no se implementa colaboración o notificación en tiempo real.
- Agenda diaria cuenta cada turno que intersecta ese día; un turno nocturno puede
  aparecer en dos días. El indicador de siete días cuenta UUID únicos.
- Las acciones rápidas abren el formulario de turno/solicitud o el detalle real
  mediante parámetros de navegación; no ejecutan escrituras automáticamente.
- Directorio busca nombre/apellido/correo en todas las páginas autorizadas, con
  espera de 250 ms durante escritura y paginación de servidor. Filtros no cambian
  pertenencia ni permisos. Al cambiar de negocio se remontan las vistas con su ID.
- Perfil consulta turnos programados de siete días y últimas solicitudes de esa
  ficha; puede revisar solicitudes cuando el backend lo autoriza. Desactivar una
  ficha pide confirmación y conserva su historial y turnos existentes.
- Cancelar un turno conserva el registro: no se presenta como borrado físico.
  La aprobación de una ausencia sigue advirtiendo turnos afectados sin modificarlos.

## Ajustes mínimos de API

No se agregaron tablas ni endpoints. Se ampliaron filtros sobre querysets que
ya aplicaban la autorización por negocio y rol:

| Endpoint existente | Nuevo filtro |
| --- | --- |
| GET businesses/{id}/employees/ | search (hasta 150 caracteres) e is_active |
| GET businesses/{id}/shifts/ | status=SCHEDULED o CANCELLED |
| GET businesses/{id}/leave-requests/ | employee=UUID |

El filtro booleano opcional conserva la ausencia del parámetro; no convierte
una consulta sin filtro en is_active=false por las convenciones HTML de DRF.
Valores inválidos se rechazan con 400. UUID ajenos no revelan registros; EMPLOYEE
sigue limitado a sus fichas/turnos y solicitudes propias. Cinco pruebas nuevas
comprueban búsqueda más allá de 50 filas, filtros y aislamiento.

## Verificaciones

| Comprobación | Resultado |
| --- | --- |
| manage.py test accounts businesses | 147 descubiertas, **146 aprobadas**, wrapper E2E omitido por ejecución separada |
| npm test | **36 aprobadas**, incluidas 9 comprobaciones de contraste |
| npm run typecheck / lint / build | Correctos |
| run_browser_tests.py | **22 escenarios Chromium aprobados**, wrapper correcto |
| Django check | Sin incidencias |
| makemigrations --check --dry-run / migrate --check | Sin cambios ni pendientes |
| PostgreSQL | Conectado, 16 tablas; sin migraciones nuevas |

Las pruebas E2E incluyen autenticación, roles, CSRF, XSS, UUID ajenos, sesiones,
creación/edición/cancelación, aprobación/rechazo, búsqueda, desactivación confirmada,
sidebar contraíble, accesos rápidos, tablet 834 px y móvil 390 px. No se eliminó
cobertura previa; se ajustó un selector de logout para distinguir los dos accesos
reales que ahora existen.

Se comprobaron contraste >=4.5:1 para texto principal/secundario, botón primario
y cinco badges; foco visible, etiquetas, navegación de teclado, Escape/retorno de
foco, diálogo Radix y prefers-reduced-motion. No se afirma una certificación WCAG
completa ni validación con todos los lectores de pantalla o Safari/Firefox.

Las capturas usan exclusivamente fixtures en la base temporal del runner. Antes:
`.artifacts/zenvik2/before/`. Después: `.artifacts/zenvik2/after/`. No se publican
como recursos de Next ni se siembran estos datos en desarrollo. Las capturas
incluyen escritorio, autenticación, calendario, directorio, perfil, portal móvil
y solicitudes en tablet. Los estados vacíos proceden de respuestas reales.

## Archivos intervenidos

- `.gitignore`, `ZENVIK-2.0.md`, `apps/api/API.md`, `apps/web/README.md`.
- Backend: businesses/views.py, directory_serializers.py, shift_serializers.py,
  shift_views.py, leave_serializers.py, leave_views.py, test_directory.py y
  test_browser.py.
- Estilos/tipografía: src/app/globals.css, layout.tsx y fonts/ (Inter, Manrope,
  sus licencias).
- Layout/sistema: app-shell, page-heading, feedback, empty-state y ui/
  (button, card, dialog, status-badge, toast).
- Dashboard/perfil: operations-dashboard, operations-panels, employee-activity,
  employee-detail, employee-form; hooks/use-clock y use-debounced-value.
- Módulos: shifts/shift-calendar, leaves/leave-workspace, auth-form.
- Rutas: app/page, app/nuevo-negocio/page, app/configuracion/page,
  app/[businessId]/page y app/[businessId]/trabajadores/page.
- QA: lib/design-contrast.test.ts, e2e/redesign.spec.ts y e2e/zenvik.spec.ts.

## Pendientes y siguiente paso

No existen edición de cuenta/negocio, recuperación de contraseña, invitaciones o
administración de membresías en la API actual; no se añadieron controles ficticios.
Los formularios de trabajador conservan los campos existentes y no exponen un
catálogo global de cuentas. La API puede vincular cuentas bajo sus reglas previas;
un flujo seguro de invitación requiere una etapa propia.

No hay drag-and-drop, gráficos sin propósito ni notificaciones de actividad.
Para equipos muy grandes, evaluar un resumen agregado en backend en lugar de
descargar las páginas del intervalo semanal. Mejorar CSP de scripts y ampliar QA
a lectores de pantalla y otros navegadores como siguientes trabajos de plataforma.

Antes de un piloto comercial, siguen vigentes los requisitos operativos de
[SECURITY.md](SECURITY.md) y [OPERATIONS.md](OPERATIONS.md): rol DB mínimo, HTTPS
validado, respaldos automáticos y monitoreo. El rediseño no cambia esa evaluación.
