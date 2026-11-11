# Zenvik — planes de lanzamiento y costos

Revisión: 11 de noviembre de 2026. Investigación de fuentes oficiales y revisión del repositorio. Los precios siguientes se configuraron en el catálogo **local**; no se activaron cobros ni servicios cloud. Son una hipótesis comercial para validar en un piloto, no una rentabilidad demostrada.

## Decisión recomendada

Cobrar por negocio y capacidad de trabajadores activos, en CLP con IVA incluido. Mantener las herramientas operativas en los tres planes; diferenciar límites, no quitar historial, exportación o permisos para forzar una compra. La seguridad y la posibilidad de recuperar datos tampoco deben ser extras premium.

| Plan | Total mensual, IVA incluido | Trabajadores activos | Ubicaciones de asistencia activas | Propietarios y administradores, en conjunto |
|---|---:|---:|---:|---:|
| Básico | $11.900 | 20 | 1 | 2 |
| Profesional | $24.900 | 50 | 3 | 5 |
| Premium | $44.900 | 100 | 10 | 10 |

Cada negocio tiene su suscripción. El propietario ocupa un cupo de administrador; no se añade un propietario gratuito por fuera de la capacidad. Las ubicaciones son sitios de asistencia, no razones sociales ni negocios adicionales. El límite de trabajadores es comercial, no una garantía de concurrencia o rendimiento. No se anuncian trabajadores, almacenamiento, asistencia técnica o sucursales ilimitados.

Precios normales de lanzamiento, sin precio anterior ficticio, contador de urgencia ni descuento permanente. No se publican anualidades, prueba gratuita de duración fija o sobrecupos automáticos hasta validar adquisición, soporte y cancelaciones. La cuenta de usuario puede crearse sin tarjeta; eso no equivale a una suscripción profesional gratis para siempre.

## Comparación pública

No se hicieron cotizaciones a nombre del usuario ni se enviaron formularios comerciales. Los precios no publicados no se inventan. Comparación de referencias, no equivalencia de productos: autorización regulatoria, hardware, soporte e integraciones pueden cambiar mucho la oferta.

| Proveedor | Precio o modalidad pública observada | Alcance y lectura para Zenvik |
|---|---|---|
| [Buk](https://www.buk.cl/precios) | Configurador por colaboradores, plataforma, módulos y complementos; descarga de cotización. No se obtuvo una tarifa numérica comparable de asistencia para 20/50/100 personas. | Incluye implementación, capacitación y soporte según su página. No afirmar que Zenvik cuesta menos que Buk sin una cotización equivalente. |
| [Prosago](https://www.prosago.cl/Home) | Contacto/cotización. No se encontró una tabla pública de precios en su portada. | Ofrece asistencia, equipos e integraciones. Una imagen de un reloj o una demo de Zenvik no acredita esas capacidades. No se puede calcular ahorro frente a una tarifa desconocida. |
| [RedRRHH + QuickPass](https://redrrhh.cl/redrrhh-y-quickpass-fortalecen-su-alianza-estrategica-para-modernizar-el-control-de-asistencia-en-chile/) | 10 personas: 0,5 UF/mes + IVA; 20: 1 UF; 30: 1,5 UF; 50: 2,5 UF; 100: 4 UF. Anualidad con 10% de descuento publicado. | Referencia por capacidad. Incluye distintas alternativas de marcación; hardware con costo adicional. No convertir UF con un valor supuesto como si fuera el valor vigente. |
| [Rex+ — módulo individual](https://rexmas.com/precio-mailing/) | Asistencia: 0,025 UF por colaborador + IVA, mínimo 4 UF + IVA. | Importa el mínimo, no solo la tarifa por persona. Es un módulo individual; no confundir con su paquete de remuneraciones y asistencia. |
| [Timora](https://timora.cl/) | Micro de 1 a 5 gratis; 6–20 a 0,15 UF/persona/mes; 21–50 a 0,13; 51–100 a 0,10; corporativo a cotizar. | Prueba que también existe competencia gratuita. Su página indica proceso de certificación; sus afirmaciones no se transfieren a Zenvik. |
| [Jibble](https://www.jibble.io/) | Publicita control de tiempo gratuito con usuarios ilimitados. | No competir solo por precio ni prometer ser más barato que todas las alternativas. Las funciones y condiciones de pago se deben comparar aparte. |

La posición defendible es **precio final visible, capacidad clara y herramientas operativas reunidas**. No publicar «más barato que Buk/Prosago», porcentajes de ahorro sin una base equivalente o «mejor que todos».

## Qué existe y qué falta

El código incluye fichas de trabajadores, roles, turnos, permisos, portal personal, asistencia operativa, comprobantes, ubicación puntual/geocercas, incidencias, notificaciones internas y exportaciones/reportes. El catálogo usa los identificadores de `billing.models.FEATURES`; no se añadieron capacidades comerciales inventadas. La presencia del código no acredita un despliegue, cumplimiento regulatorio ni una operación productiva.

Antes de vender se necesitan: pruebas de aceptación con usuarios reales y datos autorizados, capacidad medida en la hora de entrada, HTTPS e aislamiento en producción, entrega real de correo, monitoreo, backups externos con restauración probada, privacidad/términos/retención, canal y horario de soporte, facturación tributaria y pasarela productiva. El proyecto no aporta evidencia de autorización DT: la asistencia se presenta como operativa y no como reemplazo laboral autorizado.

No incluir todavía remuneraciones, Previred/LRE, firma electrónica, aplicación nativa publicada, relojes biométricos, reconocimiento facial, SSO empresarial, API comercial, soporte 24/7 o disponibilidad garantizada. Tampoco ofrecer tres nubes simultáneas como un beneficio sin una arquitectura operativa probada.

## Hosting y operación

El cliente compra el servicio, no un servidor por trabajador. El precio debe contemplar el alojamiento, mantenimiento y uso normal. No cobrar hosting por separado después de anunciar una tarifa final. Retención, backups y soporte se deben publicar antes de habilitar la contratación, con compromisos que realmente se puedan cumplir.

El repositorio prepara Next + Django + PostgreSQL. La evaluación previa propone Cloud Run + Cloud SQL; AWS y Azure son alternativas de despliegue, no tres instalaciones obligatorias. Conviene comenzar con **un proveedor primario**, una base administrada y una copia independiente, y crecer con métricas. [Evaluación existente](STAGE-16-CLOUD.md).

Como **reserva de presupuesto, no cotización del proveedor**, apartaría USD 80–180/mes al inicio para cómputo web/API, PostgreSQL administrado, almacenamiento/copias, tráfico, logs, correo y trabajos. El total puede superar ese rango por región, redundancia, redes privadas, instancias mínimas y volumen. Cotizar en la calculadora antes de contratar; no descontar créditos promocionales como si fueran ahorro permanente. Cloud Run no incluye por sí solo la base PostgreSQL. [Cloud Run](https://cloud.google.com/run/pricing), [Cloud SQL](https://cloud.google.com/sql/pricing).

Turnstile tiene un nivel gratuito para muchos usos, pero eso no convierte el hosting en gratis. [Planes de Turnstile](https://developers.cloudflare.com/turnstile/plans/).

No se asignan GB de documentos por cliente porque el producto no vende hoy un gestor documental general. No se promete residencia de datos en Chile, respaldo de 30 días, RPO/RTO o 99,9% hasta contratar, configurar y comprobar esas condiciones.

## Modelo económico ilustrativo

El IVA general consultado es 19%. Los importes de `Price.amount` configurados aquí son **totales finales**, no importes netos a los que el checkout deba volver a añadir IVA. La emisión tributaria sigue pendiente. [SII](https://www.sii.cl/preguntas_frecuentes/impuestos_mensuales/001_130_0572.htm).

Para una estimación conservadora de caja se usa comisión Flow de 3,19% + IVA sobre el cobro bruto; la tarifa aplicable depende del medio/plazo y contrato. Flow también publica alternativas de 2,89% + IVA y tarifas específicas de transferencias. Esto no habilita pagos. [Tarifas oficiales](https://web.flow.cl/es-cl/tarifas).

Supuesto interno de soporte por cliente al mes: $3.000/$6.000/$10.000 respectivamente. Es costo de tiempo, no un precio adicional ni atención ya contratada. Todos los cálculos redondean al peso; para resultados contables se debe considerar el tratamiento tributario real, incluidos eventuales créditos fiscales.

| Plan | Cobro bruto | Venta sin IVA aproximada | Comisión con IVA, aproximada | Reserva soporte | Contribución antes de costos fijos |
|---|---:|---:|---:|---:|---:|
| Básico | $11.900 | $10.000 | $452 | $3.000 | $6.548 |
| Profesional | $24.900 | $20.924 | $945 | $6.000 | $13.979 |
| Premium | $44.900 | $37.731 | $1.704 | $10.000 | $26.027 |

Fórmula orientativa: `precio / 1,19 − precio × 0,0319 × 1,19 − reserva de soporte`. No es utilidad neta: faltan infraestructura, operación, desarrollo, adquisición, incobrables, reembolsos y otros impuestos.

Con costos fijos **supuestos** de $180.000/mes, se necesitan aproximadamente 28 Básicos, 13 Profesionales o 7 Premium para cubrir solo ese presupuesto. Sumando $300.000 de tiempo del fundador, el objetivo pasa a cerca de 74/35/19 clientes respectivamente. No es una predicción de ventas ni una garantía. No se convirtió USD a CLP con una cotización inventada: los presupuestos en CLP de este ejemplo son escenarios independientes.

Por eso no recomiendo bajar de estos importes ni regalar soporte humano ilimitado. En el piloto medir: minutos de soporte por negocio, costo cloud total, picos de marcación, costo de adquisición y cancelaciones. Revisar la propuesta después de 10–20 negocios piloto, respetando precios y condiciones contratados; no modificar contratos existentes silenciosamente.

## Capacidades técnicas que se deben medir

Con 1.000 trabajadores y 22 días, cuatro marcaciones/día son 88.000 eventos al mes. Ese cálculo de volumen no dimensiona por sí solo el servidor: el riesgo son entradas simultáneas, reportes y conexiones a PostgreSQL. Probar ráfagas, latencia p95, exportaciones, memoria, CPU y restauración; fijar después la cantidad total de negocios por despliegue. No confundir 100 trabajadores en un plan con 100 solicitudes simultáneas garantizadas.

## Aplicación local y límites de esta entrega

`configure_launch_catalog` muestra una vista previa por defecto; `--apply` solo permite entorno de desarrollo/test y base local. Crea nuevas versiones cuando cambian los límites y conserva las identidades de precios anteriores. Es idempotente. No migra suscripciones existentes a otra tarifa, no activa pasarela, no hace cobros y no contrata recursos cloud. La página pública y la landing consultan el mismo catálogo de API; no hay precios duplicados en el frontend.

La capacidad comercial nueva se aplica cuando una suscripción utiliza esa versión. Los negocios locales con acceso heredado conservan su comportamiento; no se les fuerza un pago retroactivo.
