# Zenvik — auditoría local de seguridad, etapa 7

Fecha: 29-10-2026. Evaluación: **NO APTO para despliegue comercial público todavía**.
La aplicación supera la regresión funcional y las pruebas locales de aislamiento;
faltan controles operativos y un entorno de despliegue verificable. Puede continuar
el desarrollo local. Esto no es certificación ASVS ni garantía de invulnerabilidad.

## Alcance y evidencia

Se inspeccionaron autenticación, negocios, trabajadores, turnos, solicitudes y
dashboard realmente implementados, modelos, migraciones, API.md, configuraciones
y dependencias. No existen recuperación de contraseña, verificación de correo,
MFA, despliegue/staging identificado ni automatización de respaldos verificable.
No se probaron funciones inexistentes ni servicios externos de producción.

Pruebas HTTP locales con Django APIClient y Chromium/Playwright en PostgreSQL
temporal, sin datos de clientes. No se ejecutaron Git, ataques de carga, fuerza
bruta agresiva, cambios de roles en la base principal ni borrado de sus datos.
Solo se eliminaron bases y archivos sintéticos creados por los runners.

Referencias de control: [OWASP Top 10:2025](https://top10.owasp.org/),
[API Security Top 10:2023](https://api-security.owasp.org/editions/2023/en/0x11-t10/),
[ASVS 5.0.0](https://asvs.owasp.org/),
[checklist Django](https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/).
Se evaluó un subconjunto basado en riesgo, no todos los requisitos ASVS.

## Hallazgos y tratamiento

| ID | Gravedad | Evidencia / causa | Estado |
| --- | --- | --- | --- |
| DB-01 | Alta para producción | El rol conectado tiene SUPERUSER, CREATEDB, CREATEROLE y BYPASSRLS; podría superar permisos e integridad de aplicación si se compromete | Pendiente: separar migrador/runtime en el despliegue; no se alteró el rol de desarrollo |
| API-01 | Media | Next cargaba todo `arrayBuffer()` antes de comprobar 64 KiB; DRF usa parsing de flujo, sin un límite de aplicación equivalente explícito | Corregido: lectura acotada por chunks, comprobación real de bytes, plazo de 15 s, middleware Django antes del parser |
| API-02 | Media, defensa del proxy | `new URL` normaliza segmentos `..`, pudiendo salir de `/api/v1/` en la construcción de destino; no se afirma explotación remota a través de todas las normalizaciones de Next | Corregido: solo prefijos auth/businesses y segmentos alfanuméricos, guion y guion bajo; pruebas de regresión rechazan puntos/separadores codificados |
| CFG-01 | Media | DJANGO_PRODUCTION no impedía DEBUG=True, hosts comodín o clave débil | Corregido: rechazo al iniciar, sin imprimir valores secretos; registro público y Admin desactivados por defecto en producción |
| WEB-01 | Media | La configuración Next no añadía cabeceras de protección a sus páginas HTML; las de Django no protegen ese documento | Corregido: DENY, nosniff, same-origin, Permissions-Policy y CSP parcial con frame-ancestors/base-uri/object-src/form-action |
| OPS-01 | Media | No hay respaldo automático, retención externa o alerta de respaldo verificables | Procedimiento y restauración sintética probados; automatización pendiente |
| OPS-02 | Media | No hay colector, alertas, SLO o guardia operativa configurados | Eventos mínimos añadidos sin contenido sensible; operación pendiente |
| AUTH-01 | Media si se abre registro | Registro distingue éxito/duplicado; sin verificación de correo no puede prometerse resistencia completa a enumeración | Mitigado en producción por registro cerrado por defecto; límite existente conservado; si se habilita, riesgo pendiente |
| WEB-02 | Baja | CSP no restringe scripts mediante nonce; no se detectó ejecución del payload XSS probado | Pendiente como defensa adicional; React presenta entradas como texto |
| ORM-01 | Informativa | No hay RLS; SQL directo/bulk/update pueden omitir validaciones de negocio | Usar servicios transaccionales. No se detectó bypass entre negocios en API; nuevos escritores requieren revisión |
| QA-01 | Baja, evidencia de pruebas | Las trazas Playwright pueden guardar cookies/cuerpos | Traces desactivadas; capturas solo de fixtures sintéticos |
| QA-02 | Baja | La guarda inicial del ensayo de restauración usaba assert, eliminable con Python -O | Corregido: comprobación explícita que lanza error, conservada con optimización |

No se confirmó un hallazgo crítico en el alcance probado. La gravedad se refiere
al impacto potencial, no a que exista una intrusión. El acceso local limitado al
puerto PostgreSQL reduce exposición actual, pero no justifica usar superusuario
como identidad de aplicación comercial. [Roles PostgreSQL](https://www.postgresql.org/docs/17/role-attributes.html).

## Controles comprobados

- Autenticación: hashing nativo, validadores, rotación de sesión/CSRF, cookies
  HttpOnly/Lax, expiración y rechazo de cookie reutilizada tras logout. Errores
  de login equivalentes para usuario desconocido, contraseña incorrecta e inactivo.
- Autorización/API1/API3/API5: OWNER/ADMIN/EMPLOYEE, membresía y negocio activos,
  UUID ajenos, asignación masiva, estados, autoaprobación y transacciones. La
  cancelación/aprobación concurrente conserva una única transición válida.
- Entrada/API4: límites 64 KiB, 50 filas por página, fechas/UUID/JSON, sin confiar
  en `page_size` arbitrario. Proxy limita respuesta upstream a 1 MiB y 15 s totales.
  No reemplaza límites de conexiones/tasa en el perímetro.
- Inyección/XSS: ORM parametrizado; cadena SQL se guarda como dato en base
  temporal, payload HTML se presenta como texto sin crear imagen ni ejecutar JS.
  No se encontró uso de HTML arbitrario, eval o consultas SQL de cliente sin
  parametrizar en los endpoints revisados.
- CSRF/CORS: métodos de escritura requieren token, Origin ajeno rechazado,
  no Access-Control-Allow-Origin abierto. API privada y errores usan no-store.
- Errores: respuestas API 500 genéricas. Logger `zenvik.security` registra clase
  de error/estado/método, nunca cuerpo, contraseña, cookie, usuario o query string.
  Los logs del servidor/proxy externos aún requieren su propia política de filtrado.
- Secretos: `.env`/`.venv` excluidos por `.gitignore`; sin Git no se afirma nada
  sobre historial. Búsqueda en 152 archivos fuente/bundles públicos de los valores
  actuales de clave Django y contraseña DB: cero coincidencias (sin imprimirlos).
  No es un escáner exhaustivo de secretos desconocidos o históricos.

## Resultados reproducibles

Desde `apps/api`, usando `.venv/Scripts/python.exe`:

| Comprobación | Resultado |
| --- | --- |
| Línea base `manage.py test accounts businesses` | 127 descubiertas: 126 aprobadas, wrapper E2E omitido |
| Suite final del mismo comando | 142 descubiertas: **141 aprobadas**, wrapper E2E omitido |
| `accounts.test_security` | 15 pruebas nuevas aprobadas, incluidas en las 141 |
| `manage.py check` | Sin incidencias |
| `makemigrations --check --dry-run`, `migrate --check` | Sin cambios ni pendientes; no se generaron migraciones |
| `run_browser_tests.py` | Wrapper aprobado, **18 escenarios Chromium** aprobados |
| `verify_restore.py --pg-bin "C:\Program Files\PostgreSQL\18\bin"` | Dump/restore de datos sintéticos, 16 tablas y conteos, decisión y constraints verificados |
| `pip check` | Sin dependencias rotas |
| `npm test` en apps/web | **27 pruebas** aprobadas |
| `npm run typecheck`, `npm run lint`, `npm run build` | Correctos |

`check --deploy` local informa HTTP/cookies/HSTS esperados para desarrollo. En un
subproceso con configuración HTTPS sintética de producción, clave temporal y hosts
explícitos quedaron únicamente W005/W021: includeSubDomains y preload desactivados
intencionalmente. `--fail-level WARNING` por ello devuelve 1; no se ocultaron avisos.
No activar esas opciones sin validar todos los subdominios y las consecuencias de
preload. Esa comprobación no demuestra que haya TLS, certificados o proxy desplegados.

`npm audit`: cero avisos conocidos entre 563 dependencias resueltas. Consulta OSV:
cero avisos para asgiref 3.13.0, Django 5.2.18, django-environ 0.14.0,
djangorestframework 3.18.3, psycopg/psycopg-binary 3.3.6, sqlparse 0.6.0 y
tzdata 2026.6. Sin actualizaciones necesarias ni nuevas dependencias de aplicación.
Son resultados puntuales de los registros consultados, no una garantía futura.

Bandit se instaló únicamente en una carpeta temporal, sin modificar requirements
ni el entorno virtual de aplicación. Analizó 1486 líneas del backend excluyendo
tests y .venv. Tras las correcciones no quedaron avisos altos o medios; quedaron
dos bajos B404/B603 por importar/ejecutar subprocess en `verify_restore.py`.
Revisión manual: ejecutables locales pg_dump/pg_restore elegidos por el operador,
argumentos en lista, sin shell, contraseña solo por entorno y bases con UUID de
esta ejecución. No se suprimieron avisos. El aviso inicial B608 se resolvió con
`psycopg.sql.Identifier` en lugar de construcción de cadenas SQL; la guarda assert
también se sustituyó por una comprobación explícita. Se repitió el ensayo completo
de restauración con éxito. No se afirma que Bandit detecte toda vulnerabilidad.

PostgreSQL observado: 17.11, 16 tablas. Compose (`compose.yml`) y socket local
coinciden en `127.0.0.1:5435`; conexión local sin TLS. Docker CLI no estaba disponible,
por lo que no se afirma haber inspeccionado imagen efectiva, digest ni aislamiento
del contenedor. No había ZAP disponible; se usaron pruebas HTTP/E2E equivalentes
para los escenarios enumerados, no un escaneo DAST exhaustivo. Accesibilidad básica
de teclado, diálogos y móvil cubierta por E2E; sin auditoría WCAG completa ni Safari/Firefox.

## Prioridades antes de piloto con datos reales

1. Separar identidad runtime/migraciones, desplegar detrás de HTTPS con Django
   privado, secretos distintos por entorno y registro público cerrado.
2. Configurar respaldos cifrados externos, retención y alertas; ensayar restauración
   en staging autorizado y acordar RPO/RTO.
3. Colectar logs filtrados, monitorizar salud/5xx/429/DB/disco/respaldos y probar
   alertas; definir responsable de incidentes y mantenimiento.
4. Repetir smoke/security tests con el proxy real, cookies Secure y certificados;
   verificar IP efectiva y límites de autenticación compartidos detrás del proxy.
5. Definir retención de datos personales, acceso administrativo y procedimientos
   de recuperación de cuenta/corrección auditada antes de ofrecerlos comercialmente.

Procedimientos y variables: [OPERATIONS.md](OPERATIONS.md). No se ejecutaron
operaciones destructivas sobre desarrollo ni se creó infraestructura comercial.

## Archivos de esta intervención

- `.env.example`.
- `apps/api/config/{settings.py,urls.py,api.py,deployment.py,middleware.py}`.
- `apps/api/accounts/{views.py,test_security.py}`.
- `apps/api/businesses/test_browser.py`, `apps/api/verify_restore.py`.
- `apps/web/next.config.ts`, `apps/web/playwright.config.ts`.
- `apps/web/src/app/api/v1/[...path]/route.ts`.
- `apps/web/src/lib/{proxy-security.ts,proxy-security.test.ts}`.
- `apps/web/e2e/security.spec.ts`.
- `SECURITY.md`, `OPERATIONS.md`, documentación API y frontend.
