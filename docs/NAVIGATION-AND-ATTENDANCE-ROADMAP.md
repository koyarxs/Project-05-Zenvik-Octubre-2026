# Navegación del espacio privado y futura Asistencia

## Estado implementado

`apps/web/src/lib/workspace-navigation.ts` es el catálogo de módulos implementados. Define identificador, segmento de ruta, etiquetas por rol y roles admitidos. `businessNavigation` genera destinos únicamente para un negocio seleccionado; `workspaceLocation` resuelve módulo activo, título y breadcrumb. `AppShell` se ocupa de la presentación de iconos y del comportamiento responsive; no contiene contratos de futuros módulos.

Los módulos actuales son Inicio/Mi día, Trabajadores/Mi ficha, Turnos/Mis turnos y Permisos/Mis solicitudes. Mis negocios y Configuración pertenecen a la cuenta. No se agrega navegación operativa cuando no hay negocio seleccionado.

La lista de roles controla visibilidad y nombres de opciones; no sustituye autorización. Django valida sesión, membresía activa y negocio activo en cada consulta. Los empleados reciben solo sus registros según las políticas existentes.

`WorkspaceBreadcrumbs` ofrece enlaces a los padres y marca el elemento actual con aria-current. Reconoce ficha, registro y edición de trabajadores sin mostrar UUID como etiquetas. El menú móvil encierra el foco, admite Escape, bloquea el contenido de fondo y se cierra al pasar al breakpoint de escritorio. El enlace para saltar al contenido dirige el foco al main.

Los recursos se identifican por URL del negocio. BusinessGate remonta el contenido al cambiar el ID; useResource ignora respuestas canceladas y WorkspaceProvider cancela listados anteriores, incluida la paginación. La preferencia visual del menú es el único dato que se guarda en sessionStorage.

## Incorporación futura de Zenvik Asistencia

Esta etapa solo prepara la extensión de navegación. No existen rutas, botones deshabilitados de anticipo, modelos, tablas, endpoints ni datos de asistencia creados por esta revisión. Los turnos son planificación y no se presentan como asistencia efectiva.

Cuando se implemente Asistencia en una etapa posterior:

1. Definir el dominio de entradas, salidas y descansos, reglas de corrección y supervisión, conservación de historial y límites por rol/negocio.
2. Implementar modelos, API y validación backend con aislamiento multiempresa, sesión y CSRF existentes. No reutilizar el estado SCHEDULED como una marcación.
3. Implementar las pantallas reales y sus estados de carga, error, vacío y autorización.
4. Añadir entonces la entrada al catálogo de navegación y su icono, con etiquetas por rol; extender los breadcrumbs internos si fueran necesarios. No es necesario rehacer sidebar o header.
5. Agregar pruebas de permiso, cambio de negocio, concurrencia, fechas y zona horaria, trazabilidad y navegación responsive antes de habilitar la sección.

No se afirma autorización, certificación ni cumplimiento regulatorio ante la Dirección del Trabajo. Cualquier requisito de esa naturaleza deberá verificarse dentro del alcance de la etapa de Asistencia.
