# Estado de Zenvik

Corte de documentación: 29 de octubre de 2026. Fase actual: **MVP funcional local, con rediseño Zenvik 2.0; preparación de piloto pendiente**.

La aplicación conecta Next.js con Django y PostgreSQL reales. Incluye cuentas, negocios, membresías, trabajadores, turnos, solicitudes y dashboard. Las migraciones existentes forman parte del código; la base de desarrollo tiene 16 tablas, incluidas las internas de Django y las relaciones del usuario. No se publican bases de datos, volúmenes ni respaldos.

## Arquitectura

- Django conserva la autoridad sobre sesiones, permisos y reglas de negocio. Los roles de una empresa no conceden privilegios globales de Django Admin.
- Cada acceso de API resuelve una membresía activa y limita los objetos al negocio autorizado. EMPLOYEE consulta únicamente sus recursos según el endpoint.
- Los servicios de escritura utilizan transacciones y bloqueos cuando corresponde. No hay PostgreSQL RLS: SQL directo y operaciones masivas del ORM pueden omitir validaciones y no se soportan como vía alternativa para estas reglas.
- Next utiliza un proxy de servidor con destino fijo, cookies, CSRF, límites de tamaño y plazo. No guarda credenciales en localStorage.
- Las fechas operativas usan America/Santiago. Cancelaciones y bajas conservan información histórica.

## Evidencia local

Las comprobaciones se ejecutan en Windows con PostgreSQL local. Las capturas se generan con cuentas y negocios sintéticos en una base aislada. Ninguna captura acredita un despliegue público.

El último control del diseño aprobó TypeScript, ESLint, build de Next, check de Django, 36 pruebas Vitest y 26 escenarios Playwright. El total de navegador corresponde a 24 escenarios con Turnstile desactivado más 2 con proveedor simulado; esas dos pruebas se omiten en la primera fase y se ejecutan en la segunda.

La regresión Django repetida antes de esta publicación encontró 162 pruebas: 161 aprobadas y el wrapper E2E omitido por ser opt-in. El runner E2E se ejecutó por separado y aprobó los 26 escenarios indicados. Ambas suites usaron bases temporales aisladas que se eliminaron al finalizar. Las pruebas no constituyen una auditoría independiente ni garantizan ausencia de vulnerabilidades.

## Pendientes antes de producción

1. Validar versiones soportadas de Python y dependencias en el runtime objetivo y fijar el entorno de despliegue.
2. Implementar staging, TLS, servidor WSGI/ASGI, red privada y configuración de proxies confiables.
3. Configurar Turnstile real; no hay claves de proveedor cargadas para desarrollo.
4. Separar el rol PostgreSQL de ejecución del de migraciones y comprobar privilegios mínimos.
5. Automatizar respaldos, restauración, logs, métricas y alertas con responsables definidos.
6. Resolver recuperación de contraseña, verificación de correo, gestión de membresías y política de apertura del registro.
7. Completar revisión de CSP, límites de tasa detrás del proxy, despliegue y aceptación del piloto.
8. Definir licencia del proyecto y proceso de CI/revisión de cambios.

No se incluyen remuneraciones, nómina, asistencia electrónica, vacaciones legales, aplicaciones móviles nativas ni garantías de cumplimiento laboral. No hay implementación de cobros o suscripciones SaaS.

Ver [README](../README.md), [SECURITY](../SECURITY.md), [OPERATIONS](../OPERATIONS.md) y [TURNSTILE](../TURNSTILE.md).
