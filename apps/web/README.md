# Zenvik Web

Frontend Next.js App Router conectado a la API Django real. No utiliza datos de
demostración, JWT, localStorage ni endpoints alternativos de autenticación.

## Requisitos y dependencias

- Node.js 24 LTS y npm (verificado con Node 24.22.0).
- Next.js 16.4.3, React/React DOM 19.3.1 y TypeScript estricto.
- Tailwind CSS 4, componentes oficiales shadcn/ui copiados y adaptados localmente,
  Radix UI, Lucide, React Hook Form y Zod.
- ESLint, Vitest y Playwright como herramientas de desarrollo.
- `package-lock.json` fija las versiones resueltas; usar `npm.cmd ci` para repetir
  la instalación. Los componentes `src/components/ui` pertenecen al proyecto y
  se pueden ajustar sin depender de un servicio externo.

## Levantar localmente (PowerShell)

Desde la raíz `Project-05-Zenvik-Octubre-2026`, iniciar PostgreSQL:

```powershell
docker compose up -d db
```

Terminal 1, desde la misma raíz:

```powershell
cd apps/api
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Terminal 2, desde la raíz:

```powershell
cd apps/web
npm.cmd ci
npm.cmd run dev
```

Abrir **http://127.0.0.1:3000**. Los valores predeterminados permiten comenzar sin
crear otro archivo de configuración. Usar `npm.cmd` evita la restricción de
ejecución de `npm.ps1` en Windows. La base debe tener aplicadas las migraciones
del backend, incluidas `0003_shifts` y `0004_leave_requests`.
Si las dependencias ya están instaladas, se puede omitir `npm.cmd ci`.

Registro no inicia sesión automáticamente. Crear una cuenta desde `/registrarse`,
iniciar sesión y registrar un negocio. Su creador recibe OWNER desde Django.
No se crean cuentas predefinidas ni contraseñas compartidas en desarrollo.

## Variables de entorno

Para cambiar puertos/dominio, copiar `.env.example` a `.env.local` dentro de
`apps/web` y ajustar:

| Variable solo servidor | Local | Uso |
| --- | --- | --- |
| `DJANGO_API_URL` | `http://127.0.0.1:8000` | Dirección privada del backend |
| `APP_ORIGIN` | `http://127.0.0.1:3000` | Origen público exacto del navegador |

No usar `NEXT_PUBLIC_` para secretos, cookies o direcciones privadas. Si se abre
`localhost` en vez de `127.0.0.1`, cambiar APP_ORIGIN para que coincida y añadir ese
host a ALLOWED_HOSTS de Django. No usar dominios comodín ni reescribir Origin para
sortear un rechazo CSRF.

## Proxy y seguridad

La ruta servidor `src/app/api/v1/[...path]/route.ts` reenvía al backend configurado,
sin aceptar destinos del cliente. Usa el transporte HTTP/HTTPS nativo de Node
porque el `fetch` de Next sustituye Host por el del destino. El transporte elegido
conserva el host público, método, cuerpo, Cookie, Origin, Referer y X-CSRFToken;
devuelve todas las cabeceras Set-Cookie por separado y Retry-After. No sigue
redirecciones, no cachea respuestas y limita los cuerpos a 64 KiB.

- GET csrf obtiene el token en memoria; la cookie permanece HttpOnly.
- POST/PATCH adjuntan X-CSRFToken y `credentials: include`.
- Login actualiza el token después de la rotación de Django.
- La sesión se valida con `/auth/me/` antes de montar el área privada y al volver
  a enfocar la ventana. Un 403 en una operación privada comprueba si venció la
  sesión antes de decidir entre mostrar error o redirigir al login.
- Las rutas privadas entregan un shell sin datos; todos los datos reales se
  obtienen con sesión validada. Ocultar acciones no sustituye permisos de Django.
- Logout invalida la sesión real. No se guardan contraseñas ni tokens en
  localStorage/sessionStorage. Los datos del formulario solo están en memoria.

Producción: publicar bajo HTTPS con `APP_ORIGIN=https://dominio`, Django privado,
`DJANGO_PRODUCTION=True`, `DEBUG=False`, `DJANGO_BEHIND_PROXY=True` y ALLOWED_HOSTS
explícito. El proxy sobrescribe X-Forwarded-Proto desde APP_ORIGIN y descarta el
valor recibido del cliente. **No habilitar DJANGO_BEHIND_PROXY si Django es
accesible directamente por clientes no confiables.** Ese ajuste permite que
Django reconozca HTTPS y evita bucles de redirección, sin desactivar Secure.

El proxy Node no confía en X-Forwarded-For: Django ve la IP del proxy. Por tanto,
el límite por IP es compartido entre usuarios detrás de él (30 logins/15 minutos).
Antes de abrir a público, configurar el ingreso/proxy confiable y la IP efectiva,
o dirigir `/api/` directamente a Django desde el proxy de producción preservando
Host, HTTPS e IP mediante un servidor configurado para proxies confiables. No
implementar confianza indiscriminada en cabeceras aportadas por el navegador.
El límite por cuenta sigue independiente. Django Admin debe permanecer interno.

## Pantallas y organización

```text
src/app/                     rutas App Router, layouts y estilos
  iniciar-sesion/            autenticación
  registrarse/               creación de cuenta
  app/                      selección y creación de negocios
  app/[businessId]/          resumen real del negocio
  .../trabajadores/          lista, creación, detalle y edición
  api/v1/[...path]/          proxy del mismo origen
src/components/ui/           componentes shadcn/ui locales
src/components/              sesión, shell, formularios y estados comunes
src/hooks/                   carga cancelable de recursos
src/lib/                     HTTP/CSRF, tipos, contratos y esquemas
e2e/                         pruebas Playwright contra Django real
```

El selector utiliza los negocios autorizados por Django. La API agrega `role`
de solo lectura al negocio: OWNER/ADMIN ven acciones de gestión y EMPLOYEE solo
su ficha. La API vuelve a comprobar permisos en cada operación. El dashboard
cuenta los registros devueltos por el endpoint autorizado, nunca cifras globales
para EMPLOYEE. La búsqueda local se limita explícitamente a la página cargada;
la lista conserva la paginación del backend.

No se editan UUID, negocios propietarios ni roles. Los formularios no ofrecen
vinculación de cuentas: el contrato no expone un selector seguro de usuarios del
negocio; las vinculaciones existentes se conservan al editar. Esa operación
continúa disponible para administración interna en Django.

## Verificación

Desde `apps/web`:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

E2E desde la raíz, después del build:

```powershell
cd apps/web
npx.cmd playwright install chromium
cd ../api
.\.venv\Scripts\python.exe run_browser_tests.py
```

El runner asigna una base nueva con nombre aleatorio `zenvik_e2e_*`; Django la
crea, migra y retira al finalizar. La base de desarrollo no recibe fixtures ni
migraciones. LiveServer sirve la API real en un puerto aleatorio y Playwright
levanta el build de Next en `127.0.0.1:3100`; no reutiliza un servidor externo.
El usuario PostgreSQL de pruebas necesita permiso CREATEDB. El runner de
Playwright rechaza ejecutarse directamente sin las variables del entorno aislado.

Las pruebas cubren registro, login/logout, persistencia, redirección anónima,
negocios, CRUD permitido de trabajadores, OWNER/ADMIN/EMPLOYEE, CSRF y origen
inválido, 403/404, expiración y móvil. Solo el fallo de red se simula para probar
recuperación; las demás operaciones usan Django y PostgreSQL reales. Capturas y
trazas están en `test-results`, ignorado por Git, y solo contienen fixtures de
prueba. Una ejecución interrumpida debe revisarse antes de retirar una base
temporal abandonada: nunca borrar una base de desarrollo ni reutilizarla.

Backend, desde `apps/api`:

```powershell
.\.venv\Scripts\python.exe manage.py test accounts businesses
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
.\.venv\Scripts\python.exe manage.py migrate --check
```

La suite normal omite el wrapper de navegador; se ejecuta aparte con el runner
anterior. No añadir `--keepdb` a E2E para evitar conservar datos de prueba.

Referencias de compatibilidad: [Next.js](https://nextjs.org/docs/app/getting-started/installation),
[shadcn/ui y Tailwind 4](https://ui.shadcn.com/docs/tailwind-v4).

## Calendario semanal de turnos (etapa 5)

Elegir un negocio y abrir **Turnos** (OWNER/ADMIN) o **Mis turnos** (EMPLOYEE) en
la barra lateral. Ruta: `/app/{businessId}/turnos`. El calendario empieza en la
semana actual de Santiago; se puede retroceder, avanzar, volver a Hoy o escoger
una fecha con «Semana que incluye». El selector de trabajador está disponible
para quienes administran. Solo se consulta el intervalo semanal; se recorren sus
páginas para no omitir turnos después del registro 50.

En escritorio se presentan siete columnas; en móvil una lista por días sin
desplazamiento horizontal. Un turno nocturno aparece en cada día con el que se
intersecta, con indicación de continuidad. El contador cuenta turnos únicos, no
tarjetas repetidas. No se calculan horas extra, asistencia ni estadísticas ficticias.

Crear turno abre un diálogo accesible con trabajador y fechas/horas completas.
Tocar una tarjeta muestra sus detalles y, según el rol, permite editar o cancelar
con confirmación. Los turnos cancelados siguen visibles y no se reactivan. Los
errores de conflicto permanecen en el formulario sin perder los datos ingresados.

La planificación siempre usa America/Santiago. `src/lib/shift-time.ts` convierte
con Intl y valida el resultado sin depender del huso del dispositivo. Rechaza
horas inexistentes por cambio de horario; si una hora se repite, pide seleccionar
primera o segunda ocurrencia y muestra su offset. No se agregó una dependencia de
calendario ni una librería de fechas. Mantener navegador y tzdata del backend
actualizados ante cambios oficiales de reglas horarias.

Código principal: `components/shifts/shift-calendar.tsx`, `shift-form.tsx`,
`components/ui/dialog.tsx`, `hooks/use-paged-resource.ts` y `lib/shift-time.ts`.
Pruebas de navegador nuevas en `e2e/shifts.spec.ts`; conservan el runner PostgreSQL
aislado y las pruebas de autenticación/negocios/trabajadores. Las capturas de prueba
se guardan como `test-results/shifts-desktop.png`, `shifts-mobile.png` y
`shifts-mobile-form.png`. No contienen datos de producción.

Para probar manualmente: iniciar los servidores como se explica arriba, registrar
un trabajador activo si no existe, abrir Turnos y crear un turno. Intentar otro
para el mismo trabajador dentro del horario ocupado debe mostrar el conflicto.
Editar el horario y cancelar desde el detalle debe refrescar la semana. No es
necesario ejecutar migraciones adicionales si esta etapa ya fue aplicada.
## Etapa 6: permisos y ausencias

La sección está en `/app/[businessId]/permisos`, dentro de la selección de negocio
existente. El menú muestra «Permisos y ausencias» a gestores y «Mis solicitudes»
a trabajadores. El historial usa paginación de servidor, estado y fechas inclusivas.
Reutiliza BusinessGate, sesión, API/CSRF, PageHeading, Card, Button, Input y Dialog.

- `src/lib/leave.ts`: contrato y esquema Zod; `leave.test.ts`: validación.
- `src/components/leaves/leave-workspace.tsx`: listado, filtros y navegación.
- `leave-form.tsx`: solicitud propia y errores de campo/servidor.
- `leave-panel.tsx`: historial, advertencia de turnos y confirmación de decisión.
- `e2e/leaves.spec.ts`: creación/cancelación móvil, aprobación, rechazo, filtros,
  aislamiento, CSRF, estados vacíos y recuperación tras errores de conexión.

Para probar con datos reales:
1. Iniciar backend y frontend como se describe en «Levantar localmente», e ingresar en
   `http://127.0.0.1:3000`.
2. Seleccionar negocio y entrar en Permisos y ausencias/Mis solicitudes.
3. Con una cuenta que tenga ficha activa vinculada, pulsar Solicitar permiso,
   elegir categoría/fechas y enviar. Se admiten fechas pasadas para registro operativo.
4. Con **otro** OWNER/ADMIN del mismo negocio, abrir la solicitud, revisar turnos
   afectados y aprobar/rechazar con observación opcional.
5. Consultar el historial; para reorganizar turnos, abrir el calendario. Aprobar
   no modifica la planificación. El trabajador puede cancelar solo pendientes.

Crear una cuenta o negocio no crea automáticamente una ficha de trabajador.
La vinculación requiere membresía activa, según las reglas anteriores; no se
añadió una API de administración de roles. No se crean cuentas/datos de ejemplo
permanentes. Las categorías no calculan vacaciones ni derechos laborales.

Validación adicional: ejecutar el runner Django aislado (`run_browser_tests.py`)
después de `npm run build`. En Windows necesita poder cerrar su proceso temporal
Next.js del puerto 3100; no reutiliza los servidores de desarrollo. La suite E2E
disponible usa Chromium, no Firefox ni Safari.

## Seguridad — etapa 7

Las páginas añaden cabeceras contra framing/sniffing y CSP parcial. El proxy
valida segmentos de ruta, limita la entrada a 64 KiB durante la lectura y aplica
un plazo de 15 segundos, además de 1 MiB/15 segundos para la respuesta upstream.
`proxy-security.test.ts` verifica estos límites y rutas; `e2e/security.spec.ts`
comprueba cabeceras, CSRF, XSS presentado como texto y sesión cerrada no reutilizable.
Las trazas Playwright están desactivadas porque pueden contener cookies/cuerpos;
las capturas se toman únicamente sobre fixtures sintéticos aislados.

APP_ORIGIN y DJANGO_API_URL son variables de servidor; no usar NEXT_PUBLIC para
secretos. Para producción construir y ejecutar con el mismo APP_ORIGIN HTTPS.
No se ha desplegado infraestructura HTTPS ni monitoreo en esta intervención.

Informe: [SECURITY.md](../../SECURITY.md). Operación, variables, respaldos y
recuperación: [OPERATIONS.md](../../OPERATIONS.md). Consultar los riesgos pendientes
antes de abrir un piloto con datos reales.

## Zenvik 2.0 — rediseño integral

La interfaz utiliza tokens azul noche/petróleo/turquesa y fuentes Inter/Manrope
servidas localmente, con sus licencias en src/app/fonts. No agrega dependencias
ni servicios de fuentes externos. El layout incorpora sidebar contraíble y
navegación móvil, selección de negocio y consulta de cuenta en `/app/configuracion`.

El dashboard diferencia gestores de EMPLOYEE y consulta trabajadores activos,
turnos de hoy/próximos siete días y solicitudes pendientes. El calendario permite
semana/agenda y enlaces a fecha/formulario. Directorio busca en todo el negocio,
filtra por estado y enlaza perfiles con turnos y solicitudes. Las bajas piden
confirmación. Login, registro y alta/selección de negocios comparten la identidad.

Ver [ZENVIK-2.0.md](../../ZENVIK-2.0.md) para inventario, fases, contratos, evidencias
y límites. Pruebas nuevas: e2e/redesign.spec.ts, lib/design-contrast.test.ts y
businesses/test_directory.py. Las capturas utilizan la base aislada del runner.

Para revisar: iniciar backend/frontend con los comandos de este README y abrir
`http://127.0.0.1:3000`. No es necesario ejecutar migraciones para este rediseño.
Un negocio sin datos muestra estados vacíos; crear trabajadores/turnos mediante
los formularios reales. No se instalan datos de demostración en tu base.

## Turnstile en autenticación

Los formularios integran Cloudflare Turnstile mediante configuración pública de
Django, sin NEXT_PUBLIC ni dependencias nuevas. Los botones son azul marino con
letras blancas. El widget se carga solo al activarlo con las claves del usuario;
en desarrollo sigue apagado mientras no estén configuradas. Los tokens expiran,
se renuevan tras errores y se verifican en Django. El indicador visual no concede
acceso por sí solo. Instrucciones: [TURNSTILE.md](../../TURNSTILE.md).
