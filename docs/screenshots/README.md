# Capturas del MVP

Capturas locales de Chromium/Playwright con datos sintéticos de la suite E2E, generadas el 29-10-2026. No muestran información de clientes, archivos `.env`, claves de Cloudflare, cookies ni contraseñas legibles. Las fotos de marca son imágenes ilustrativas generadas para Zenvik; no representan negocios reales del usuario.

| Archivo | Pantalla |
| --- | --- |
| [workspaces-desktop.png](workspaces-desktop.png) | Mis negocios en escritorio |
| [workspaces-mobile.png](workspaces-mobile.png) | Mis negocios en móvil |
| [login.png](login.png) | Acceso sin credenciales rellenadas |
| [dashboard.png](dashboard.png) | Centro de operaciones |
| [directory.png](directory.png) | Directorio de trabajadores |
| [profile.png](profile.png) | Perfil del trabajador |
| [shifts.png](shifts.png) | Calendario de turnos |
| [leaves.png](leaves.png) | Solicitudes y decisiones |
| [worker-mobile.png](worker-mobile.png) | Portal personal en móvil |

Para regenerar: compilar Next y ejecutar `apps/api/run_browser_tests.py`. El runner conserva capturas sintéticas en `.artifacts/release/` y `.artifacts/workspaces/`; estos directorios permanecen excluidos de Git. Solo se copian aquí imágenes seleccionadas y revisadas, nunca trazas de navegador, perfiles ni registros de red.
