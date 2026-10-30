# Imagen de autenticación Zenvik

Se sustituyó el panel editorial izquierdo por una fotografía generada a partir
de la referencia proporcionada por el usuario. Herramienta: image_gen integrada,
sin CLI ni claves API. La escena es ilustrativa y no representa a un cliente real.

Activo local: `apps/web/public/images/auth-cafe-v1.png` (1024 × 1536).
`AuthHero` lo sirve con Next Image, recorte adaptable y optimización de entrega.
El logo Zenvik se dibuja como vector sobre la foto, con un tratamiento de cinta
turquesa/azul inspirado en la referencia. El formulario y la sesión no cambian.
En móvil se conserva la composición compacta del formulario.

Refinamiento visual: el panel fotográfico queda solo con la imagen y la marca,
sin eslóganes, textos inferiores ni degradado oscuro. El formulario utiliza Inter
con pesos moderados, mensajes directos y foco visible más discreto.

El formulario comparte una paleta verde petróleo y neutros cálidos con la marca.
La navegación de acceso utiliza un subrayado activo, los campos incorporan iconos
discretos y autocompletado de color coordinado, y los botones incluyen feedback
de hover, pulsación y envío real. Las transiciones duran 180–200 ms; la aparición
del contenido, 380 ms. Se respeta prefers-reduced-motion. La autenticación, los
campos enviados y los controles CSRF permanecen en el mismo cliente API.

Verificación del refinamiento: TypeScript, ESLint y build correctos; 22 escenarios
E2E aprobados. Revisión en Chromium de hover, movimiento reducido, visibilidad de
contraseña, registro y anchos de 1440/390 px. Capturas locales:
`.artifacts/auth/login-polished.png` y `login-polished-mobile.png`.

## Prompt final utilizado

Use case: photorealistic-natural. Asset type: portrait editorial photograph for the left half of a premium workforce SaaS login page, Zenvik. Input image 1 is a reference for subject, warm café mood and general composition only; create a new improved photograph, not a copy and not a screenshot of a website. A friendly adult Latina small café owner with tied-up dark hair, wearing a charcoal apron and a light neutral shirt, naturally smiling while using a modern tablet on a wooden counter. Another adult café worker softly out of focus farther back at an espresso machine. Elegant real small-business café interior, plants, subtle teal tile accents, warm pendant lighting and daylight through tall windows. Premium candid brand photography, realistic skin and hands, natural depth of field, restrained color grading and believable materials. Composition portrait 1024x1536: principal woman in middle/lower central portion, face around 48% from top, tablet and counter below. Keep upper 25% visually quiet with pale warm wall and soft light, suitable for a navy logo overlay that will be added in code. Bottom 15% lower-contrast darker wood/apron area suitable for a short white caption. Fill the entire image edge-to-edge. Avoid typography, logos, letters, watermark, giant Z, graphic overlays, borders, UI, busy text/signage, artificial plastic skin, extra fingers or distorted hands.
