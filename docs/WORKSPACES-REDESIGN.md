# Mis negocios: actualización visual

Referencia: captura proporcionada por el usuario el 7 de noviembre de 2026.

Se conserva el selector de negocio, los nombres y destinos de navegación, registro,
comparación de planes, vistas de tarjetas/lista, apertura de espacios, cuenta,
cierre de sesión y comportamiento por rol. No se agregan los botones ni los
módulos ficticios de la referencia. Las tarjetas inferiores son informativas.
No se cambia la API ni se usan negocios o usuarios de muestra en el producto.

## Recursos

- Fotografía local: `apps/web/public/images/workspace-cafe-v2.png`.
  Generada con la herramienta integrada de la habilidad `imagegen`; no es la
  fotografía original de la captura y no necesita un servidor de imágenes externo.
- Ilustración decorativa vectorial: `apps/web/src/components/workspace-illustration.tsx`.
  Usa la marca existente. Las ondas y superficies se dibujan con CSS.
- Se mantienen las fuentes Inter/Manrope autoalojadas y los iconos Lucide existentes.

Prompt de la fotografía:

> Photorealistic wide website banner photo only, aspect ratio 2.5:1. Two friendly small cafe owners smiling directly at camera, waist up: man35 curly dark hair short beard light blue collared shirt dark navy apron arms crossed on left; woman32 brown hair tied back light blue shirt navy apron on right. Man slightly taller. Warm blurred coffee shop shelves with amber pendant lights dark wood background. Close composition like professional commercial photography. NO text NO logo NO UI NO graphic overlays. This is a photo asset for right half of a dashboard banner.

## Validación local

Capturas y comprobación visual con respuestas sintéticas interceptadas solo en
Playwright, sin crear ni alterar cuentas de la base de datos operativa:
`.artifacts/workspace-reference-{desktop,1440,390,320,many}.png`.
Comprobadas las vistas, foco del menú móvil, ausencia de desborde y estados de
cero/uno/varios negocios. El diseño respeta movimiento reducido.

Los cambios visuales se limitan a `/app`; las pantallas dentro de cada negocio
conservan su presentación y autorización actuales.

Resultados: TypeScript, ESLint y compilación de producción aprobados; 108 pruebas
Vitest aprobadas. Suite general contra Django/PostgreSQL aislados: 30 pruebas
Playwright aprobadas y 12 omitidas por requerir fixtures especializadas, según
el runner existente. Incluye los siete casos de `workspaces.spec.ts`.
Evidencia: `.artifacts/workspace-redesign-general-e2e.log`.

Una ejecución anterior tuvo fallos de arranque causados por un ayudante de
limpieza de procesos de esta sesión, no por la interfaz. Ese ayudante se retiró
y la suite general se repitió correctamente con su limpieza nativa. Las bases
temporales de ambas ejecuciones fueron eliminadas por Django; la base operativa
no fue el objetivo de las pruebas. Los demás escenarios especializados no se
declaran cubiertos por esta repetición general.
