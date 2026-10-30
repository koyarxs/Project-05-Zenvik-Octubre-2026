# Mis negocios: diseño y recursos visuales

La pantalla `/app` utiliza el logo de Zenvik en SVG compartido con el acceso, con una variante turquesa sobre el menú azul marino. Los botones principales son azul marino con texto blanco. Las animaciones son breves y respetan `prefers-reduced-motion`.

El banner, las tarjetas de negocios y el panel de registro se adaptan a escritorio y móvil. El selector de tarjetas/lista funciona en memoria. Nombre, RUT, estado, rol y cantidad provienen de la API existente. No se muestran integrantes, notificaciones ni cifras inventadas. Los enlaces abren el espacio del negocio o el formulario de registro real.

Las fotografías son ilustrativas de marca, no fotos de los negocios del usuario. No existe todavía un servicio de carga de portadas: los negocios comparten la misma imagen decorativa. La ilustración de tienda se dibuja en SVG local; no añade dependencias ni solicitudes externas.

## Fotografías generadas

Método: herramienta integrada de generación de imágenes, creación nueva sin imágenes de entrada. Se mantuvieron los originales generados y se copiaron estos archivos al proyecto:

- `apps/web/public/images/workspace-hero-v1.png`: equipo de una florería, distinto a las personas y cafetería de la referencia.
- `apps/web/public/images/workspace-cover-v1.png`: tienda artesanal sin personas.

Prompt del banner:

> Use case: photorealistic-natural. Asset type: wide premium SaaS workspace selection header, edge-to-edge photograph, landscape 1792x640, about 2.8:1. A NEW scene with NEW people: an adult Latin American male florist owner in a muted sage work apron and an adult woman colleague arranging a bouquet in a stylish small neighborhood flower shop. Warm sunlit artisan retail space, natural oak shelves, a few green plants, muted cream walls, carefully composed flowers with restrained pale colors. Editorial brand photography, realistic skin/hands, genuine calm work interaction, daylight, natural depth of field, elegant uncluttered warm Scandinavian/Chilean small-business atmosphere. Composition is critical: people and active business scene only in right 45% of image, faces around right 70%, leave left 55% quiet pale cream wall with very subtle out-of-focus daylight, no foreground subject on the left because webpage headline will be overlaid there. Lower right should have quiet darker counter space for a separate HTML button if needed. No café, no barista, no tablet woman from previous image, no text, no lettering, no signs with words, no logos, no watermark, no UI or borders. This is an illustrative marketing scene, not a specific real business. High quality understated color palette, cream + sage + warm wood; cyan/teal may appear as a small subtle material accent.

Prompt de la portada:

> Photorealistic editorial brand photograph, landscape 1536x1024. An elegant small artisan pottery and homeware shop interior in Chile, no people. Warm natural oak counter and shelving, handmade ceramic bowls and vases, large side window, a few olive-green plants, cream plaster walls, soft late morning daylight. Camera looking across the counter, balanced horizontal composition with gentle depth of field and warm quiet premium colors. The top middle third of this image will be used as a wide card cover so place attractive shelves and plants there. A completely new photograph different from a cafe or florist scene. No text, logos, lettering, signage, watermark, UI or borders. Illustrative marketing photo, not a specific real business.

## Verificación

`apps/web/e2e/workspaces.spec.ts` comprueba las imágenes, datos de la tarjeta, registro, cambio de vista, apertura del negocio, menú y ausencia de desborde móvil. Se ejecuta con el runner Django y una base temporal aislada. Las capturas utilizan únicamente datos sintéticos y se guardan en `.artifacts/workspaces/`.

Resultado final: compilación de producción, TypeScript, ESLint y comprobación Django correctos; 36 pruebas unitarias del frontend aprobadas; 24 pruebas de navegador con Turnstile desactivado y 2 adicionales con proveedor simulado aprobadas. Las 2 pruebas de Turnstile se omiten en la primera fase y se ejecutan en la segunda. Se revisaron las capturas de escritorio (1440 px) y móvil (390 px). No se aplicaron migraciones ni se modificaron datos de desarrollo.
