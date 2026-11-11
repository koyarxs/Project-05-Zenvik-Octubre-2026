# Zenvik Asistencia — experiencia personal independiente

Fecha: 7 de noviembre de 2026, America/Santiago. Implementación y validación
locales. No se desplegó infraestructura ni se modificaron credenciales, archivos
`.env`, volúmenes o registros de la base operativa. No se ejecutaron comandos Git.

## Alcance y arquitectura

La entrada `/asistencia` es independiente del dashboard administrativo: tiene
acceso directo, selección de negocio, cabecera y navegación propios. Usa las
mismas cuentas, sesiones Django, membresías, PostgreSQL y motor de marcaciones.
No se crea otra aplicación desplegada, base de usuarios, microservicio ni base
de datos permanente.

| Ruta | Uso |
| --- | --- |
| `/asistencia` | Ingreso con cuenta existente o elección explícita de negocio |
| `/asistencia/{businessId}` | Mi jornada, captura y confirmación |
| `/asistencia/{businessId}/historial` | Jornadas paginadas, fechas y comprobantes |
| `/asistencia/{businessId}/incidencias` | Solicitudes, decisiones y ajustes propios |
| `/asistencia/{businessId}/solicitudes` | Permisos personales y cancelación |
| `/asistencia/{businessId}/notificaciones` | Avisos personales y lectura |

Sin sesión se presenta el formulario de ingreso en la propia ruta, sin pasar
por `/app`. Reutiliza validación, CSRF y Turnstile existentes. El destino de
ingreso se limita a rutas personales conocidas, sin aceptar redirecciones
externas desde parámetros. No se registra automáticamente una empresa.

Siempre se identifica el negocio activo. No se elige uno silenciosamente,
incluso cuando solo existe uno disponible en la pantalla de selección. Una
URL explícita de un negocio autorizado sí abre directamente ese espacio.

El dashboard administrativo y sus rutas anteriores se mantienen. No se amplían
sus módulos ni se cambia su diseño como parte de esta entrega.

## Diagnóstico y referencia pública

La implementación previa ya tenía cuatro tipos de marcación, captura puntual de
ubicación, geocercas, estados de jornada, control de versiones, idempotencia,
evidencia inmutable, comprobantes, incidencias y supervisión. Su interfaz vivía
dentro del shell administrativo y el intento dudoso se conservaba solo en memoria.

La documentación pública de [ProSago](https://www.prosago.cl/Home) describe
gestión de asistencia, planificación e integración con otros sistemas. La
[ficha publicada de ProSago Asistencia](https://play.google.com/store/apps/details?hl=es&id=com.visma.prosagomovil)
describe marcación presencial/remota y acceso móvil a información laboral.
Fuentes consultadas el 7 de noviembre de 2026. No se accedió a una cuenta privada,
no se probó su backend ni se midieron sus tiempos, pasos o accesibilidad.

Estas referencias orientan la separación de experiencias, sin fundamentar una
afirmación de superioridad integral. Las mejoras verificables de esta entrega
se comparan con el recorrido anterior de Zenvik, no con métricas no observadas
del competidor.

## Experiencia implementada

- Pantalla personal con nombre, negocio, fecha laboral, zona horaria, estado,
  turno planificado y última captura confirmada. Solo se destacan las acciones
  válidas devueltas por Django. Se conserva “Comenzar otra jornada”.
- La hora mostrada es una referencia del servidor al consultar; no un reloj
  continuo ni una estimación de horas trabajadas. Hay actualización manual,
  al recuperar visibilidad y periódica cada 60 segundos cuando no hay un diálogo
  o envío activo.
- La planificación se identifica expresamente y no se convierte en evidencia.
  Jornadas sin turno no generan atrasos, descuentos o ausencias inferidas.
- Confirmación explícita antes de solicitar una ubicación. Sin seguimiento
  continuo, permisos de cámara, biometría, mapas externos o geolocalización de
  fondo. La precisión insuficiente y las excepciones se describen como tales.
- Historial por fecha laboral con línea de tiempo, filtros aplicables, paginación
  y reapertura de comprobantes. La fecha laboral se conserva al cruzar medianoche.
- Comprobantes con identidad persistida, negocio, identificadores, tipo, hora y
  zona de la sesión. Descarga JSON sin coordenadas crudas. Se añade
  `timezone_name` al serializador existente de comprobantes sin retirar campos.
- Incidencias asociadas a la jornada, declaración y evidencia original separadas,
  seguimiento, cancelación propia y consulta de ajustes operativos aprobados.
  Reutiliza los formularios y flujos transaccionales existentes.
- Solicitudes personales de permiso, consulta y cancelación, y notificaciones
  personales con estado de lectura. No aparecen herramientas administrativas.
- Navegación inferior en móvil, acciones táctiles amplias, enlaces para saltar
  al contenido, foco visible, diálogos Radix y movimiento reducido. La revisión
  automatizada y visual no equivale a una certificación formal de accesibilidad.

## Envíos dudosos y recuperación

1. El trabajador elige una acción y confirma la captura puntual de ubicación.
2. Antes del POST se asigna una clave UUID. El servidor conserva su idempotencia
   y validaciones transaccionales actuales; no se cambia el motor de captura.
3. Se limita la espera de preparación/envío/respuesta a 20 segundos, además del
   límite de geolocalización existente de 12 segundos. No hay reenvíos automáticos.
4. Solo una respuesta aceptada o un comprobante recuperado generan confirmación.
   Un fallo de red, 5xx, 408 o 429 mantiene el resultado pendiente.
5. `GET attendance/submissions/{requestId}/` permite recuperar exclusivamente un
   comprobante del mismo usuario y negocio. Un 404 significa “aún no encontrado”,
   no prueba que la operación original haya sido rechazada.
6. En `sessionStorage` se conserva únicamente tipo de acción, clave de intento,
   ID de sesión y versión esperada, con una clave distinta por cuenta y negocio.
   No se conservan GPS, motivos, contraseñas, cookies o tokens de autenticación.
7. Al recargar se consulta ese identificador. Si todavía no aparece, se puede
   volver a consultar o confirmar explícitamente un reintento del mismo intento.
   Si ya no existe el payload en memoria se solicita otra captura puntual.
8. Si la ubicación nueva difiere y el servidor responde conflicto por una clave
   ya utilizada, se consulta el comprobante original antes de tratarlo como rechazo.
   No se sustituye la hora original ni se acepta una marca ficticia.

El bloqueo inmediato del handler evita doble pulsación; la protección definitiva
contra duplicados sigue estando en PostgreSQL y el servicio Django. Se bloquea
la navegación de la interfaz durante el envío y se advierte antes de cerrar la
página. Si se abandona, las respuestas anteriores no se presentan en otro negocio.

Si el navegador bloquea el almacenamiento, el intento funciona en memoria y se
explica que debe mantenerse abierta la pantalla hasta confirmar. `sessionStorage`
no garantiza recuperación al cerrar la pestaña, borrar datos o cambiar de
dispositivo. En esos casos hay que consultar el historial; no se promete una
cola offline ni persistencia entre dispositivos.

## Permisos y privacidad

Las consultas de jornada, historial, comprobantes y recuperación filtran por
usuario autenticado y negocio. Las nuevas rutas `attendance/personal/` añaden
un ámbito personal para incidencias, correcciones, permisos y avisos, también
para OWNER y ADMIN; no se falsifica el rol recibido en el frontend.

Las transiciones personales de incidencias solo permiten cancelar solicitudes
propias; no permiten revisar ni aprobar. La política personal es de solo lectura.
No se publican rutas personales de auditoría, escaneo administrativo, aprobación
de permisos ni configuración. La bandeja excluye avisos `manager_only`.

El estado personal omite las coordenadas de geocercas y datos de retención que
no necesita la pantalla. Se conservan CSRF, sesiones HttpOnly, autorización por
membresía, restricciones de ficha activa, controles de negocio y evidencia
inmutable. Los payloads de captura y sus coordenadas no se envían a analítica
ni se añaden a los logs de aplicación. No se modifica su retención existente.

## Implementación y compatibilidad

| Archivo | Responsabilidad |
| --- | --- |
| `components/personal-attendance-shell.tsx` | Acceso, negocio explícito y navegación personal |
| `components/personal-attendance-journey.tsx` | Estado y acciones de jornada |
| `hooks/use-personal-mark.ts` | Ubicación, envío, recuperación y bloqueo |
| `lib/personal-attendance.ts` | Metadatos mínimos, plazos y destinos permitidos |
| `components/personal-attendance-records.tsx` | Historial, línea de tiempo y comprobantes |
| `components/personal-attendance-sections.tsx` | Adaptadores de componentes existentes |
| `app/asistencia/` | Rutas, metadatos noindex y estilos propios |
| `attendance/personal.py`, `attendance/urls.py` | Ámbitos personales y consulta por intento |

Los componentes existentes de incidencias, avisos y permisos reciben una opción
personal cuyo valor predeterminado conserva el comportamiento administrativo.
El formulario de ingreso admite un destino interno indicado por el componente;
el acceso habitual sigue enviando a `/app`. No hay nuevas dependencias, modelos
ni migraciones. Las consultas adicionales de zona horaria precargan la sesión
para evitar una consulta por cada marcación de hoy.

## Pruebas y mediciones

Las pruebas utilizan bases PostgreSQL temporales de nombres UUID administradas
por los runners existentes. Las capturas y métricas contienen datos sintéticos;
no se guardan trazas, cookies ni cuerpos de peticiones.

| Verificación local | Resultado y evidencia |
| --- | --- |
| Backend completo | **329 descubiertas: 320 aprobadas, 9 lanzadores opt-in omitidos**. `.artifacts/personal-attendance-backend-full.log` |
| Ámbitos personales nuevos | **11 aprobadas**, incluidas en la regresión anterior. `.artifacts/personal-attendance-scope-tests.log` |
| Frontend | **113 pruebas Vitest aprobadas**, 17 archivos |
| Compilación y análisis frontend | `npm.cmd run build`, `typecheck` y `lint`: aprobados |
| Nuevo portal, API real | **8 recorridos Playwright aprobados**, ninguno omitido. `.artifacts/personal-attendance-e2e.log` |
| Panel y rutas anteriores | **30 recorridos Playwright aprobados**. `.artifacts/personal-attendance-legacy-e2e.log` |
| Omisiones de la fase general | 20: ocho corresponden al portal ejecutado por separado; doce requieren otras fixtures especializadas y no se declaran ejecutadas en esta entrega |
| Django | `check` sin incidencias; `makemigrations --check --dry-run` sin cambios |
| Fuente y seguridad local | Ruff de corrección en archivos Python nuevos aprobado; Bandit sin hallazgos medios/altos en `personal.py`; scanner de 339 archivos sin hallazgos de secretos |
| Disponibilidad | Frontend `/asistencia`, `/app`, readiness web y readiness API: HTTP 200 |

Los ocho recorridos del nuevo portal verifican:

1. Ingreso directo sin shell administrativo, permiso GPS solo tras confirmar,
   cuatro marcaciones válidas y consulta administrativa de los mismos registros.
2. Respuesta retrasada después de persistir: doble pulsación produce un único
   POST; vence el límite real de 20 segundos, se recarga y se recupera el mismo
   comprobante sin otro POST.
3. Envío no recibido: un 404 no se interpreta como rechazo; tras recargar se
   reintenta con el mismo UUID y se conserva una única marca. Se comprueba también
   la desconexión, sin cola offline.
4. Rechazo explícito sin comprobante de éxito, GPS denegado con motivo de
   excepción y ubicación de baja precisión identificada correctamente.
5. Cuenta sin ficha, cuenta sin membresías, negocio no autorizado y sesión vencida.
6. Selección explícita, respuesta tardía descartada al cambiar negocio, jornada
   sin turno y acceso a la ruta anterior de asistencia.
7. Solicitud asociada a jornada, aprobación desde el ámbito administrativo,
   notificación, lectura y ajuste operativo separado del original. Se compara
   el hash del comprobante original antes/después.
8. Permiso personal, cancelación, ausencia de herramientas administrativas y
   bandeja personal de OWNER sin avisos de gestión.

Se revisaron capturas de escritorio a 1440 px y de móvil a 390 y 320 px. La acción
principal se comprueba por geometría por encima de la barra inferior a 320 px,
además de ausencia de desbordes, foco de teclado y movimiento reducido.
Capturas reales con fixtures sintéticas en `.artifacts/personal-attendance/`:
`personal-desktop-before.png`, `personal-mobile-retry-complete.png`,
`personal-history-{320,390}.png`, `personal-pending-timeout.png`,
`personal-business-switch-320.png`, `personal-exception.png` y
`personal-correction-separate.png`.

La confirmación ordinaria requiere dos acciones dentro de Mi jornada: elegir
marcación y confirmar ubicación. El permiso nativo del navegador puede añadir
una interacción en el primer uso. La selección inicial de negocio, el ingreso
y las excepciones no están incluidos en ese conteo. No se eliminaron pasos de
consentimiento para aparentar rapidez.

Las mediciones locales incluyen interfaz, captura autorizada, red local y render
del comprobante; no equivalen a latencia exclusiva del backend, una prueba de
carga ni un SLA de producción. No hay comparación de latencia con ProSago.

Ejecución final: Windows, Chromium, build de producción Next.js, Django LiveServer
y PostgreSQL temporal, sin TLS. Tres confirmaciones ordinarias de la misma
sesión: inicio de colación **299 ms**, término de colación **295 ms** y término
de turno **322 ms**. Mediana **299 ms**, muestra **n=3**, sin extrapolación.
La marca inicial se excluye de esa muestra porque su respuesta se retrasó
intencionalmente para comprobar recuperación. Evidencia y condiciones:
`.artifacts/personal-attendance/measurements.json`.

Reproducción desde la raíz, en PowerShell, con servicios locales disponibles:

```powershell
.\apps\api\.venv\Scripts\python.exe apps/api/run_backend_tests.py accounts businesses attendance billing config
npm.cmd --prefix apps/web test
npm.cmd --prefix apps/web run build
.\apps\api\.venv\Scripts\python.exe apps/api/run_browser_tests.py attendance.test_personal_browser.PersonalAttendanceBrowserTests
.\apps\api\.venv\Scripts\python.exe apps/api/run_browser_tests.py businesses.test_browser.FrontendBrowserTests.test_real_frontend_against_isolated_api
```

Los runners crean bases nuevas con UUID y las destruyen al finalizar. En Windows,
Playwright necesita permisos para iniciar Chromium y cerrar su árbol de procesos.
Durante QA se corrigieron una fecha futura de fixture, una espera de cierre de
sesión y un selector de respuesta que capturaba la redirección 308 en lugar del
resultado final. No se eliminaron pruebas ni se relajaron las reglas del producto.

## Limitaciones y pendientes

- Se mantiene la arquitectura y sesión del mismo origen; no hay aplicación móvil
  nativa, despliegue separado, SSO entre dominios o modo kiosco compartido.
- No hay marcación offline ni sincronización en segundo plano. La ubicación
  declarada por un dispositivo no prueba por sí sola presencia física.
- Sin WebSocket: otros dispositivos pueden modificar el estado antes del próximo
  refresco; la versión y las validaciones del servidor deciden al confirmar.
- Las fechas de formularios de permisos/incidencias reutilizan las reglas actuales
  de Santiago. No se incorporan nuevas reglas de jornada ni otras jurisdicciones.
- No se calculan remuneraciones, horas extra, descuentos o efectos laborales
  oficiales; los ajustes existentes conservan su carácter operativo.
- HTTPS real, entrega externa de avisos, recuperación de cuenta, respaldos cloud
  y controles operativos de producción siguen sujetos a su validación previa.
- No se reconstruyeron ni publicaron las imágenes Docker de la etapa anterior;
  cualquier release debe reconstruir y validar sus artefactos con este código.
- No se afirma autorización, certificación ni cumplimiento normativo por haber
  creado esta interfaz.

## Evaluación futura

Revisar más adelante el dashboard de cada PYME: prioridades de supervisión,
excepciones pendientes, necesidades de reportes, administración de accesos,
sucursales y políticas. Evaluar esos requisitos con usuarios y datos reales
autorizados. No se implementan esas ampliaciones en esta etapa.
