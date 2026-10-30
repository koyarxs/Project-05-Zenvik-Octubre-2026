# Cloudflare Turnstile — acceso y registro

Estado actual: **integrado en el código, desactivado localmente porque aún no hay
claves del usuario**. No se instalaron claves ficticias ni se presenta el acceso
como protegido por Cloudflare mientras esté desactivado. Los botones principales
de acceso/registro son azul marino #14263D con letras blancas.

## Activación

1. Entra en [Cloudflare Dashboard](https://dash.cloudflare.com/) y abre Turnstile.
2. Crea un widget de tipo **Managed** para Zenvik. Añade los hostnames del entorno:
   para un widget de desarrollo, `localhost` y `127.0.0.1`, sin protocolo ni puerto.
   Usa un widget independiente con el dominio público para producción.
3. Guarda Site Key y Secret Key directamente en el `.env` de la raíz del proyecto.
   No compartas la clave secreta por chat ni la pongas en archivos públicos.
4. Configura estas variables con los valores de tu widget:

```dotenv
TURNSTILE_ENABLED=True
TURNSTILE_SITE_KEY=<clave_publica_del_widget>
TURNSTILE_SECRET_KEY=<clave_secreta_del_widget>
TURNSTILE_ALLOWED_HOSTNAMES=localhost,127.0.0.1
```

5. Reinicia Django y recarga login/registro. No hace falta reconstruir Next.js:
   la configuración pública se obtiene desde Django en tiempo de ejecución.
6. Comprueba el acceso y el registro en ese entorno. Si PUBLIC_REGISTRATION_ENABLED
   está desactivado, Turnstile no lo habilita: el cierre de registro sigue vigente.

No se modificó el `.env` real. Se actualizaron sus ejemplos sin credenciales.
Las claves del servicio deben configurarse antes de afirmar que está activo.
Los valores entre `<...>` son marcadores de documentación, no claves válidas.

## Funcionamiento y controles

- GET `/api/v1/auth/csrf/` conserva csrfToken y añade `turnstile: {enabled, siteKey}`.
  La Secret Key nunca se devuelve. Si está desactivado no se carga el script externo.
- El frontend usa el script oficial con render explícito, un widget por formulario
  y las acciones `login`/`register`. El token queda en memoria. El botón permanece
  deshabilitado hasta tener configuración y verificación válidas.
- POST login/register acepta `turnstile_token` de hasta 2048 caracteres. Django
  verifica con Siteverify antes de autenticar/crear la cuenta; en registro se
  verifica antes de consultar unicidad para no facilitar enumeración sin desafío.
- Se exige success=true, acción correcta y hostname autorizado. No se confía en
  un checkbox del navegador, en un campo que diga success ni en un secreto del cliente.
- Los límites de autenticación y CSRF siguen funcionando. El proveedor recibe el
  token y la clave de servidor, nunca usuario, contraseña, correo ni cookies.
- Cloudflare valida tokens de uso único con caducidad de cinco minutos. Fallo de
  validación produce 400; indisponibilidad/respuesta anómala, 503 y bloqueo del
  intento. El servidor limita tamaño de respuesta y timeout de red a cinco segundos.
- Caducidad, errores de carga y timeout del widget limpian el token y ofrecen
  reintento. Tras un envío fallido se crea una nueva verificación. Cambiar entre
  login/registro elimina el widget anterior. A menos de 300 px disponibles se usa
  el formato compacto; para anchos mayores, flexible.
- No se registran tokens o secretos en logs. No se crean tablas ni migraciones.

En modo DJANGO_PRODUCTION=True, Turnstile se habilita por defecto y la configuración
incompleta impide iniciar. TURNSTILE_ENABLED=False es una desactivación explícita;
no debe permanecer así por descuido al publicar. Las claves oficiales de pruebas
son rechazadas por la validación de configuración de producción. El hostname de
respuesta debe coincidir con la lista del servidor y con el widget de Cloudflare.

La CSP actual permite el servicio. Si se endurece con script-src/frame-src/connect-src,
autorizar `https://challenges.cloudflare.com` en esas directivas. Cargar el script
directamente desde Cloudflare; no copiarlo ni servirlo desde el proxy local.
El bloqueo de scripts externos por extensiones se presenta como error, no como éxito.

## Verificación y límites

`accounts/test_turnstile.py` comprueba configuración, secreto no expuesto, ausencia
de token, acción/hostname incorrectos, duplicación/caducidad, errores de red,
respuestas malformadas, CSRF, registro cerrado y funcionamiento local desactivado.
Las pruebas unitarias sustituyen la respuesta de Siteverify; no necesitan claves.

`run_browser_tests.py` primero ejecuta la regresión habitual con Turnstile apagado;
después activa la integración en el servidor temporal y corre `turnstile.spec.ts`
con un proveedor controlado solo de pruebas. Comprueba bloqueo del botón, rechazo
de acceso directo sin token, login, registro y reintento por expiración/error.
Los fixtures y parches viven en la base/proceso de pruebas; no se publican en UI.
La regresión previa fija explícitamente el modo desactivado y las pruebas nuevas
fijan el activado, por lo que no usan las claves reales que luego configures.

Resultados: 162 pruebas Django descubiertas, 161 aprobadas y un wrapper E2E
omitido por ejecución separada; 36 pruebas unitarias frontend aprobadas; 22
escenarios de regresión y dos de integración activada aprobados en Chromium.
TypeScript, ESLint, build y comprobaciones de migraciones correctos.

Estos ensayos no verifican todavía un widget real de la cuenta de Cloudflare:
eso queda pendiente de crear las claves y ejecutar la prueba de activación.
No se afirma que el servicio esté operativo en producción o que sustituya los
otros controles de seguridad. El navegador contactará a Cloudflare solo cuando
se active; considerar ese proveedor en la información de privacidad del servicio.

Referencias oficiales:
[renderizado del widget](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/),
[validación en servidor](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/),
[claves de prueba](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).
