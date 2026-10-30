# API Zenvik v1

API JSON con sesiones Django. No hay JWT ni CORS abierto. El frontend Next.js
está en `apps/web` y consume esta API mediante un proxy del mismo origen. Todas las
consultas privadas requieren una sesión y se delimitan al negocio autorizado.
Las listas usan paginación de 50 registros (`count`, `next`, `previous`, `results`).

## Rutas

| Método | Ruta | Entrada / comportamiento |
| --- | --- | --- |
| GET | `/api/v1/auth/csrf/` | Obtiene cookie CSRF y `{csrfToken}`; público |
| POST | `/api/v1/auth/register/` | `username`, `email`, `password`; devuelve usuario, 201; no inicia sesión |
| POST | `/api/v1/auth/login/` | `username`, `password`; devuelve `{user, csrfToken}` y cookie de sesión |
| GET | `/api/v1/auth/me/` | Usuario de la sesión: `id`, `username`, `email` |
| POST | `/api/v1/auth/logout/` | Invalida sesión; 204 |
| GET, POST | `/api/v1/businesses/` | Lista negocios activos propios; crea con `name`, `rut` opcional |
| GET | `/api/v1/businesses/{id}/` | Negocio activo con membresía activa |
| GET, POST | `/api/v1/businesses/{business_id}/employees/` | Lista autorizada o crea ficha |
| GET, PATCH | `/api/v1/businesses/{business_id}/employees/{employee_id}/` | Consulta o actualiza ficha autorizada |

Campos de escritura de Employee: `first_name`, `last_name`, `email`, `hire_date`
(`YYYY-MM-DD` o null), `is_active`, `user` (UUID o null). Nombre y apellido son
obligatorios al crear. Los valores opcionales toman los defaults del modelo.
`business` viene exclusivamente de la URL. Cualquier campo desconocido o de solo
lectura, incluidos `business_id`, `role`, `id` y fechas automáticas, produce 400.
Los endpoints de trabajadores no ofrecen DELETE ni PUT. No hay endpoints para
cambiar membresías o roles. Los turnos admiten DELETE como cancelación lógica.

Business y su membresía OWNER se crean en una única transacción. El cliente no
elige al propietario ni obtiene permisos globales de Django. Los correos de
registro se pasan a minúsculas y se comprueba duplicación sin distinguir caso.
Se usan validadores de contraseña y `create_user`; nunca se serializan hashes.
La unicidad de correo en el modelo existente es sensible a mayúsculas: otras
importaciones deben respetar la normalización utilizada por este registro.

## Sesión y CSRF desde Next.js

Los negocios ahora incluyen `role` de solo lectura con el rol de la membresía
activa del usuario solicitante (OWNER, ADMIN o EMPLOYEE). No cambia el esquema ni
permite asignar roles desde HTTP. El contrato de creación sigue siendo name/rut.
La integración y los comandos locales están en [Web README](../web/README.md).

Preferir un único origen público: Next.js y `/api/` detrás del mismo proxy. En
desarrollo también puede usarse un proxy para `/api/`, preservando correctamente
Host/Origin y Set-Cookie. No basta añadir CSRF_TRUSTED_ORIGINS para habilitar CORS.

1. Hacer GET `/api/v1/auth/csrf/` con `credentials: 'include'` y sin caché.
2. Guardar `csrfToken` en memoria. La cookie CSRF es HttpOnly: no leerla con JS.
3. Incluir `X-CSRFToken` y `Content-Type: application/json` en cada POST/PATCH.
   También registro e inicio de sesión exigen CSRF, aunque el cliente sea anónimo.
4. Login rota la sesión y el secreto CSRF. Reemplazar el token en memoria por el
   devuelto en esa respuesta. Tokens anteriores dejan de servir.
5. Consultar `/auth/me/` al recuperar la sesión; renovar token mediante GET csrf
   después de recargar la página. Las respuestas privadas tienen `no-store`.
6. Logout exige POST con token válido e invalida la sesión en el servidor.

```javascript
let { csrfToken } = await fetch('/api/v1/auth/csrf/', {
  credentials: 'include', cache: 'no-store',
}).then(r => r.json());
const response = await fetch('/api/v1/auth/login/', {
  method: 'POST', credentials: 'include',
  headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
  body: JSON.stringify({ username, password }),
});
if (response.ok) ({ csrfToken } = await response.json());
```

Cookies de sesión y CSRF: HttpOnly, SameSite=Lax, dominio no ampliado a
subdominios. Sesión de 8 horas. En HTTP local `DJANGO_PRODUCTION=False` mantiene
Secure desactivado; en producción usar `DJANGO_PRODUCTION=True`, HTTPS,
`DEBUG=False` y ALLOWED_HOSTS concretos. Ese modo activa Secure y redirección
HTTPS. Configurar la terminación TLS para que Django reconozca HTTPS; no confiar
cabeceras reenviadas de clientes públicos. `DJANGO_BEHIND_PROXY=True` habilita
SECURE_PROXY_SSL_HEADER únicamente cuando Django está privado detrás de un proxy
que sobrescribe X-Forwarded-Proto. Su valor por defecto es False. Revisar
`manage.py check --deploy` al preparar el despliegue.

## Roles y política de errores

| Actor en el negocio | Lectura de trabajadores | Creación / PATCH |
| --- | --- | --- |
| OWNER o ADMIN activo | Todas sus fichas | Sí |
| EMPLOYEE activo | Solo ficha con `user=request.user` | No |
| Sin membresía activa | Ninguna | No |

Un ADMIN de A no recibe derechos en B. Tampoco un superusuario tiene bypass en
esta API: necesita membresía. Un negocio inactivo no permite acceso por API.
Para EMPLOYEE sin ficha vinculada la lista es vacía. La ficha inactiva conserva
su relación; el acceso depende de usuario, negocio y membresía activos.

- 403: sin sesión, credenciales inválidas, CSRF inválido o rol sin permiso de
  escritura. Es la política de SessionAuthentication de DRF; no se fuerza 401
  porque no se ofrece autenticación HTTP con `WWW-Authenticate`.
- 404: negocio ajeno/inexistente/inactivo, membresía ausente/inactiva o ficha
  fuera del queryset autorizado. No se indica si existe en otro negocio.
- 400: entrada inválida, campos protegidos, conflictos de unicidad o vinculación.
- 405: método no implementado. 429 + Retry-After: límite de autenticación.

El `user` de una ficha solo se acepta si tiene membresía activa en ese negocio;
usuarios ajenos e inexistentes reciben el mismo error. No se expone un catálogo
global de usuarios. Una cuenta solo puede tener una ficha por negocio.

## Límites de autenticación

`auth_rate_limits` guarda contadores con claves HMAC, no nombres, IP en claro,
contraseñas ni datos de sesión. Los bloqueos de fila PostgreSQL y las transacciones
comparten los límites entre procesos y evitan excederlos por concurrencia.

- Login: 5 intentos por nombre de usuario y 30 por IP, en ventanas de 15 minutos.
- Registro: 10 intentos por IP por hora.
- Se cuentan intentos válidamente formados, exitosos y fallidos. Login no reinicia
  contadores tras acertar. La comprobación precede al hash de contraseña.
- Las ventanas expiradas se reinician al usarse. Para limpiar filas caducadas,
  ejecutar periódicamente `python manage.py purge_auth_limits` (solo esa tabla).
- IP proviene de REMOTE_ADDR; X-Forwarded-For arbitrario no permite evadir el límite.
  Detrás de un proxy, configurar el servidor para obtener la IP real únicamente
  desde proxies confiables; de otro modo los clientes comparten el límite del proxy.

No sustituye protección de tráfico en el proxy. Un atacante puede consumir el
cupo temporal de una cuenta conocida; controlar este comportamiento antes de una
apertura pública. Django Admin conserva su login nativo y debe restringirse a
personal interno/red confiable, con límites en el proxy: el límite de esta API
no cubre `/admin/login/`. No se incluye recuperación de contraseña ni verificación
de correo en esta etapa.

## Integridad y límites del ORM

Los guardados de Employee y Membership bloquean la fila Business en una
transacción antes de comprobar la relación. Los servicios de escritura de la API
vuelven a comprobar membresía/rol bajo ese bloqueo. Se evita que una revocación
concurrente autorice un guardado con permisos obsoletos.

Usuario y negocio de una membresía existente son inmutables; también lo es el
negocio de una ficha. Para dar de baja una membresía vinculada, primero hacer
PATCH de la ficha con `user: null`, y luego desactivar la membresía desde el
Admin. `Membership.clean/save` rechaza la desactivación mientras exista vínculo;
`pre_delete` protege tanto `delete()` como `QuerySet.delete()` de membresías.
Una reducción de rol sigue permitida, pues no invalida la membresía activa.

`QuerySet.update`, `bulk_update`, `bulk_create` y SQL directo omiten estas
validaciones/bloqueos y no deben usarse para cambiar relaciones, estados o RUT.
La API no los usa para datos de negocio. Las FK, unicidad y checks de rol siguen
siendo garantías de PostgreSQL; no hay triggers, RLS ni autorización automática
para consultas ORM arbitrarias. Los listados API sí aplican el filtro de negocio
y rol, pero cualquier endpoint futuro debe reutilizarlo y ampliar las pruebas.

El Admin es global para personal autorizado, no un portal multiempresa. No se
otorgan permisos de Admin a propietarios de negocios mediante esta API.

## Validación y migración

`accounts.0002_auth_rate_limits` solo crea una tabla e índices; conserva las 13
tablas anteriores. No se crean cuentas de ejemplo en desarrollo. Las pruebas
usan una base PostgreSQL temporal separada, con APIClient y CSRF habilitado.

```powershell
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py test accounts businesses
.\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
.\.venv\Scripts\python.exe manage.py migrate --check
```

Referencias: [sesiones y CSRF en DRF](https://www.django-rest-framework.org/api-guide/authentication/),
[limitaciones de concurrencia del throttling nativo](https://www.django-rest-framework.org/api-guide/throttling/).

## Planificación de turnos

| Método | Ruta | Comportamiento |
| --- | --- | --- |
| GET | `/api/v1/businesses/{business_id}/shifts/` | Lista paginada por intervalo y permisos |
| POST | `/api/v1/businesses/{business_id}/shifts/` | Crea turno programado |
| GET | `/api/v1/businesses/{business_id}/shifts/{shift_id}/` | Consulta individual autorizada |
| PATCH | `/api/v1/businesses/{business_id}/shifts/{shift_id}/` | Cambia trabajador, horario o cancela |
| DELETE | `/api/v1/businesses/{business_id}/shifts/{shift_id}/` | Cancela sin borrar; devuelve 204, idempotente |

Entrada de creación:

```json
{
  "employee": "UUID de una ficha del negocio",
  "starts_at": "2026-10-26T22:00:00-03:00",
  "ends_at": "2026-10-27T06:00:00-03:00"
}
```

No es una solicitud ejecutada ni un dato de producción. Ambos instantes deben
incluir Z u offset explícito. Las fechas sin zona horaria se rechazan. PostgreSQL
almacena `timestamp with time zone`; Django trabaja con instantes conscientes de
zona y la API devuelve UTC. La UI presenta y convierte fechas en America/Santiago,
independientemente del huso del navegador. Fecha del turno significa fecha local
de inicio, derivada de starts_at; no se duplica en otra columna.

Respuesta: `id`, `business`, `employee`, `employee_name`, `starts_at`, `ends_at`,
`status`, `created_at`, `updated_at`. El nombre es el nombre actual de la ficha;
no se incluyen correos ni información de cuenta. Estados: SCHEDULED y CANCELLED.
POST crea SCHEDULED; PATCH `{ "status": "CANCELLED" }` también cancela. Una vez
cancelado no se edita/reactiva; se puede crear un turno nuevo en ese horario.
La UI pide confirmación antes de cancelar y mantiene visible el historial.

Filtrado: `?date_from=2026-10-26&date_to=2026-11-02`, fechas locales de Santiago,
inicio inclusivo y fin exclusivo. Deben enviarse ambos parámetros o ninguno.
Sin filtros, se consulta la semana actual de lunes a domingo en Santiago. Máximo
31 días por consulta como límite técnico, no regla laboral. Se incluyen turnos
que se intersectan con el intervalo, incluso los que comienzan antes de él y
continúan de noche. `employee=UUID` filtra una ficha dentro del queryset ya
autorizado; un UUID ajeno no revela su existencia. La paginación conserva 50 filas.

OWNER/ADMIN activos administran los turnos de su negocio. EMPLOYEE activo solo lee
turnos cuya ficha esté vinculada a su cuenta, incluidos los cancelados, sin
escritura. Negocios o membresías inactivos no permiten acceso. Se mantienen las
políticas de 400/403/404 y CSRF de los módulos anteriores. `business`, nombres
calculados, UUID del turno y fechas automáticas no son editables por HTTP.

### Conflictos e integridad

- El término debe ser posterior al inicio; se permiten turnos nocturnos y de
  varios días. No se imponen límites de jornada, descanso ni reglas de remuneración.
- Los turnos SCHEDULED de una misma ficha no pueden intersectarse. Se usan
  intervalos `[inicio, término)`: un turno puede comenzar exactamente cuando otro
  termina. Distintos trabajadores pueden compartir horario.
- La ficha debe pertenecer al negocio y estar activa al crear o modificar un turno
  programado. Una baja posterior de la ficha conserva los turnos existentes;
  pueden consultarse y cancelarse, pero no reprogramarse mientras siga inactiva.
- Los conflictos se comprueban por ficha/negocio, no por cuenta entre negocios.
- `write_shift` bloquea Business en una transacción, vuelve a comprobar permisos
  y guarda. `Shift.save` usa el mismo bloqueo que Employee y Membership y ejecuta
  `full_clean`. Así se serializan escrituras por negocio y se evita la carrera
  entre dos creaciones/actualizaciones compatibles por separado pero conflictivas
  al combinarse. La prueba concurrente usa conexiones independientes PostgreSQL.
- PostgreSQL garantiza FK, estado válido y duración positiva con constraints;
  la pertenencia y ausencia de superposición se garantizan en esos caminos de
  aplicación. SQL directo, `update`, `bulk_create` y `bulk_update` omiten estas
  validaciones: no deben emplearse para escribir turnos. No se agregaron triggers
  ni extensiones PostgreSQL. Si se incorporan otros escritores, será necesario
  compartir el servicio o evaluar restricciones de exclusión en la base.
- Dos ediciones del mismo turno se serializan; no se implementa versionado/ETag:
  la última escritura válida prevalece. El calendario se refresca al guardar y
  cambiar semana; no es una colaboración en tiempo real.

La migración `businesses.0003_shifts` crea exclusivamente la tabla `shifts`, sus
FK, dos índices compuestos y dos checks. No modifica ni recrea tablas anteriores.

Referencias técnicas: [zonas horarias de Django](https://docs.djangoproject.com/en/5.2/topics/i18n/timezones/),
[bloqueos de filas](https://docs.djangoproject.com/en/5.2/ref/models/querysets/#select-for-update).

## Solicitudes de permisos y ausencias

`businesses.0004_leave_requests` crea únicamente `leave_requests`. Sus UUID/FK
relacionan Business, Employee, el usuario solicitante (`requested_by`, inmutable)
y el revisor opcional (`reviewed_by`). Las FK usan PROTECT. Hay índices por
negocio/estado/fecha, trabajador/fecha y usuarios. PostgreSQL comprueba fechas,
categorías, estados y consistencia de los campos de revisión. No modifica turnos.

| Método | Ruta bajo `/api/v1/businesses/{business_id}/` | Contrato |
| --- | --- | --- |
| GET | `leave-requests/` | Lista paginada de 50 registros |
| POST | `leave-requests/` | Crea solicitud propia, 201 |
| GET | `leave-requests/{id}/` | Detalle e impacto actual en turnos para gestores |
| POST | `leave-requests/{id}/approve/` | Aprueba una pendiente, 200 |
| POST | `leave-requests/{id}/reject/` | Rechaza una pendiente, 200 |
| POST | `leave-requests/{id}/cancel/` | Cancela una pendiente propia, 200 |

Creación acepta exclusivamente `request_type` (PERSONAL, ABSENCE, DAY_OFF, OTHER),
`start_date`, `end_date` (YYYY-MM-DD) y `reason` opcional de hasta 1000 caracteres.
La identidad de trabajador, solicitante y negocio se deriva de sesión/URL, nunca
del cuerpo. Estos tipos son categorías operativas, no cálculos de derechos legales.
Las fechas incluyen ambos días completos de America/Santiago; un solo día es válido.
El 31-12-9999 no se admite como término para permitir calcular el límite siguiente.

Filtros opcionales: `status`, `date_from`, `date_to`, con límites inclusivos sobre
el intervalo solicitado (intersección, no fecha de creación). Se puede enviar un
solo límite. Sin filtros devuelve el historial autorizado, paginado y ordenado
por creación descendente. No se descargan todas las páginas desde la interfaz.

OWNER y ADMIN consultan todas las solicitudes de su negocio y pueden aprobar o
rechazar las ajenas. EMPLOYEE solo consulta y cancela las solicitadas por él.
Cualquier rol puede crear una solicitud **propia** si tiene ficha activa vinculada;
no se permite crear en representación de compañeros. Crear un negocio no crea
automáticamente una ficha de trabajador. Un gestor con ficha tampoco puede revisar
su propia solicitud: otro OWNER/ADMIN debe resolverla. Solo el solicitante cancela.

La identidad de `requested_by` conserva la propiedad del historial aunque la ficha
se desvincule de su cuenta; el nuevo usuario de esa ficha no hereda sus motivos.
Siempre se exige membresía y negocio activos. Una ficha que se desactive después
de solicitar conserva su historial: se pueden resolver/cancelar sus pendientes.
La API no expone requested_by, correo ni otros datos de cuenta del trabajador.
Del revisor muestra UUID y username para identificar la decisión, sin correo.

Se admiten solamente PENDING → APPROVED, REJECTED o CANCELLED. No hay PATCH, PUT,
DELETE, reactivación ni edición de solicitudes o decisiones. Una corrección de
fechas requiere cancelar la pendiente y crear otra. `pre_delete` evita eliminar
solicitudes por ORM; no hay un formulario de edición de solicitudes en Admin.
La respuesta incluye `can_cancel` y `can_review` derivados del actor, no editables.
Los endpoints de decisión aceptan exclusivamente `review_note` opcional (hasta
1000 caracteres); cancelación recibe `{}`. Autor y fecha se asignan en servidor.
Campos desconocidos/protegidos producen 400. Decisiones repetidas/obsoletas también
producen 400; la interfaz recarga el detalle para mostrar el estado actual.

Dos solicitudes PENDING o APPROVED del mismo trabajador no pueden compartir un día,
independientemente de categoría. REJECTED/CANCELLED liberan las fechas. La regla
es por ficha de negocio, no por cuenta entre empresas. `create_leave`,
`decide_leave` y `LeaveRequest.save` usan transacciones y el bloqueo Business que
comparten los módulos anteriores. Se revalida la autorización bajo bloqueo; la
decisión también bloquea LeaveRequest. Solo una de dos decisiones concurrentes
puede confirmar. El contenido original y las decisiones terminales son inmutables.

Detalle/decisión incluyen `affected_shifts: {visible, count, results}`. Para
OWNER/ADMIN contiene el número de turnos SCHEDULED que intersectan los días
solicitados y los primeros 20 (`id`, `starts_at`, `ends_at`); la UI enlaza al
calendario. Para EMPLOYEE, `visible=false`, count=0, results=[]: no es una consulta
de turnos y no expone planificación tras una desvinculación. Se incluyen turnos
nocturnos desde el día anterior y se respetan cambios de horario de Santiago.
Un turno que termina exactamente al comienzo de la ausencia no se considera
afectado. La advertencia se muestra antes de confirmar y se recalcula en la
respuesta: **aprobar nunca cancela ni cambia turnos**. El impacto es una consulta
actual, no una fotografía histórica. Turnos creados/editados después requieren
revisión manual; no se agregaron bloqueos de planificación ni notificaciones.

### Seguridad y límites de esta etapa

Se mantienen sesiones HttpOnly, CSRF, `no-store`, filtros por negocio y política
403/404 sin revelar UUID ajenos. Motivos/notas se presentan como texto, sin HTML.
Evitar introducir datos médicos innecesarios; no se incorporan adjuntos ni permisos
especiales de información clínica. Definir retención y acceso antes de producción.

Los caminos autorizados usan servicios/modelos; `bulk_create`, `update`, SQL
directo y clientes externos pueden omitir autorización, inmutabilidad o checks
de solapamiento de aplicación. No se implementan RLS, triggers ni restricciones
de exclusión. No usar estos caminos para solicitudes; evaluar garantías de base
adicionales si aparecen otros escritores. No hay edición de decisiones terminales:
un procedimiento de corrección auditado queda fuera de esta etapa.

Pruebas en `businesses/test_leave.py` cubren roles, BOLA/IDOR, fechas, estados,
inmutabilidad, filtros, CSRF, impacto nocturno/DST, checks SQL y carreras con
conexiones PostgreSQL independientes. Pruebas E2E usan únicamente la base temporal
del runner. Auditoría de dependencias el 29-10-2026: `npm audit` sin avisos y consulta
OSV de los ocho paquetes fijados en requirements sin vulnerabilidades informadas.
Es una consulta de avisos conocidos en esa fecha, no una garantía de ausencia de
vulnerabilidades. No se agregaron dependencias ni se ejecutaron escaneos externos.

Verificación final de etapa 6 (29-10-2026): 127 pruebas backend descubiertas,
126 aprobadas y el wrapper E2E omitido por ser opt-in; ejecutado por separado,
el wrapper aprobó sus 17 escenarios Chromium y destruyó su base temporal.
29 pruebas backend corresponden a solicitudes. Frontend: 19 pruebas unitarias,
TypeScript, ESLint y build Next.js correctos. `check`, `makemigrations --check
--dry-run` y `migrate --check` correctos. La migración dejó 16 tablas, sin cambiar
los conteos de usuarios, negocios, membresías, trabajadores o turnos existentes,
y cero solicitudes de ejemplo en desarrollo. No se ejecutaron comandos Git.

## Seguridad y operación — etapa 7

Informe de hallazgos, evidencia y límites: [SECURITY.md](../../SECURITY.md).
Variables por entorno, roles de base de datos, respaldo/restauración e incidentes:
[OPERATIONS.md](../../OPERATIONS.md).

Las entradas API ahora tienen límite de 64 KiB antes del parser (413 al excederlo)
y los errores incluyen no-store. El proxy Next limita bytes reales de entrada,
tiempo total y tamaño de respuesta; solo construye destinos bajo auth/businesses.
Las excepciones internas no controladas devuelven 500 genérico y un evento mínimo
sin texto de excepción, cookies, cuerpos o datos de cuenta.

En DJANGO_PRODUCTION=True se rechaza DEBUG=True, hosts comodín y claves débiles;
se activan Secure/HTTPS/HSTS, y Admin/registro público están cerrados por defecto.
Los flags DJANGO_ADMIN_ENABLED y PUBLIC_REGISTRATION_ENABLED permiten habilitación
explícita tras revisar los controles de perímetro. El modo local sigue admitiendo
HTTP. POSTGRES_HOST, POSTGRES_PORT y POSTGRES_SSLMODE son configurables por entorno.

La etapa no crea migraciones ni modifica roles o registros de desarrollo. El
ensayo `verify_restore.py` crea, verifica y elimina únicamente dos bases sintéticas.

## Filtros para Zenvik 2.0

El directorio admite `?search=nombre%20apellido&is_active=true`. Search busca cada
término (AND) en nombre, apellido o correo (OR), sin distinguir mayúsculas, en todo
el queryset autorizado, antes de paginar. Máximo 150 caracteres; no hay búsqueda
de cuentas globales ni normalización de acentos adicional. is_active es opcional;
su ausencia devuelve ambos estados. Las escrituras no cambian de contrato.

Turnos admite `status=SCHEDULED` o `status=CANCELLED`, además de los filtros de
intervalo/employee existentes. Solicitudes admite `employee=UUID` combinado con
estado y fechas. Los tres filtros se aplican después del aislamiento por negocio
y actor: no conceden acceso adicional ni revelan UUID de otras empresas.

No se incorporaron migraciones ni dependencias. Evidencia y flujos de interfaz:
[ZENVIK-2.0.md](../../ZENVIK-2.0.md).

## Cloudflare Turnstile

Login y registro admiten el campo opcional de contrato `turnstile_token`, exigido
si TURNSTILE_ENABLED=True. El servidor valida acción, hostname y resultado con
Cloudflare antes de permitir la operación. CSRF y límites de intentos se conservan.
La respuesta GET csrf añade la configuración pública `turnstile`, sin secreto.
Sin claves reales permanece desactivado en desarrollo. Activación, errores y
pruebas: [TURNSTILE.md](../../TURNSTILE.md).
