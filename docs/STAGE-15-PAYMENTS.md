# Etapa 15 — evaluación de proveedores de pago

Revisión documental: 5 de noviembre de 2026. No se crearon cuentas de comercio, no se utilizaron credenciales y no se realizaron transacciones externas. Las cifras siguientes son tarifas públicas consultadas, no los precios de Zenvik ni una oferta contractual.

## Comparación

| Proveedor | Recurrencia y medios | Pruebas y confirmación | Reembolsos y contratación |
|---|---|---|---|
| Transbank Webpay Plus | Checkout para una transacción; no constituye un gestor de suscripciones | Integración separada; completar y verificar la operación en servidor | La operación de pago individual no debe confundirse con renovación automática. [Documentación oficial](https://transbankdevelopers.com/documentacion/webpay-plus) |
| Transbank Oneclick Mall | Enrolamiento previo; tarjeta custodiada por Transbank, comercio conserva identificador `tbkUser`. El comercio solicita cargos posteriores; Zenvik tendría que gestionar calendario/reintentos | SDK/API de integración; confirmación de inscripción y autorización de cada cargo en servidor | Existe `refund`; límites de cargos y condiciones se fijan en afiliación. [Oneclick](https://transbankdevelopers.com/documentacion/oneclick). La salida productiva requiere validación: [referencia](https://transbankdevelopers.com/referencia/oneclick) |
| Mercado Pago Suscripciones | API `/preapproval` y planes; cobros recurrentes y reintentos gestionados por proveedor. [Referencia oficial](https://www.mercadopago.cl/developers/es/reference/online-payments/subscriptions/overview) | Notificaciones de suscripción y pagos; validar HMAC `x-signature`/`x-request-id` y consultar recurso en servidor. [Webhooks](https://www.mercadopago.cl/developers/es/docs/split-payments/additional-content/your-integrations/notifications/webhooks?scope=prod) | Reembolso total/parcial sujeto a saldo y condiciones del pago; cancelar suscripción no equivale a reembolsar pagos previos. [Reembolsos](https://www.mercadopago.cl/developers/es/docs/subscriptions/additional-content/cancellations-and-refunds) |
| Flow Suscripciones / Cargo Automático | Plan, cliente, enrolamiento y suscripción; cargos automáticos sobre medio previamente registrado. [Flujo](https://developers.flow.cl/docs/suscripciones/integration-flow), [enrolamiento](https://developers.flow.cl/docs/suscripciones/register-card) | Sandbox separado. Credenciales de cuenta sandbox y firma de solicitudes; no asumir autenticidad de un callback por recibirlo. [Inicio y firma](https://developers.flow.cl/docs/intro) | Requiere cuenta habilitada y contratación de Cargo Automático; admite crédito/débito/prepago según producto. [Requisitos](https://web.flow.cl/es-cl/preguntas-frecuentes/cargo-automatico/) |

## Tarifas verificadas

- **Flow:** la página pública muestra 2,89% + IVA con abono al tercer día hábil y 3,19% + IVA al siguiente, sin fijo en la sección débito/crédito/prepago; otras modalidades tienen tarifas distintas. Confirmar alcance específico de Cargo Automático, plazos y contrato antes de presupuestar. [Tarifas](https://web.flow.cl/es-cl/tarifas/).
- **Mercado Pago:** su página chilena de Suscripciones muestra 3,19% + IVA al instante y 2,89% + IVA en diez días; indica medios como tarjeta y dinero en cuenta. Verificar condiciones aplicables a la cuenta y al producto API elegido. [Suscripciones Chile](https://www.mercadopago.cl/herramientas-para-vender/suscripciones).
- **Transbank:** no se fija una tasa universal de Oneclick en este proyecto. El costo depende del negocio; solicitar condiciones y usar simulador/portal oficial. [Tarifas y comisiones](https://ayuda.transbank.cl/es/tarifas-y-comisiones).

Ninguna comisión del proveedor se incorpora como precio comercial de Zenvik. Las tarifas pueden cambiar y deben confirmarse al contratar.

## Decisión recomendada

**Flow sandbox como primer adaptador**, condicionado a credenciales sandbox y habilitación correspondiente. Es una decisión técnica, no contratación: ofrece recursos separados de cliente, plan, suscripción e importes, pruebas aisladas y un protocolo REST accesible desde Django sin incorporar un SDK obligatorio. Mercado Pago es una alternativa viable; Oneclick exige que Zenvik gestione más lógica de renovación. La elección debe revisarse con el responsable comercial antes de producción.

El modo de cobros debe permanecer deshabilitado por defecto. Las pruebas unitarias/integradas pueden inyectar un proveedor falso; esto no demuestra una prueba real en Flow sandbox. No aceptar un valor enviado por navegador para seleccionar proveedor productivo ni para marcar pagos como aprobados.

## Contrato Flow para el adaptador

Base exclusiva de pruebas: `https://sandbox.flow.cl/api`. Solicitudes autenticadas con `apiKey` y `s`: ordenar parámetros por nombre, concatenar nombre+valor, HMAC-SHA256 con `secretKey`; excluir `s` del cálculo. Las credenciales se obtienen de cuenta sandbox independiente. [Firma y ambientes](https://developers.flow.cl/docs/intro).

El callback de pago recibe un token mediante POST `application/x-www-form-urlencoded`. El servidor consulta `payment/getStatus`; no confía en monto/estado del callback. `payment/create` crea un pago único, no una suscripción recurrente. Existen `refund/create` y `refund/getStatus`. [Referencia API](https://developers.flow.cl/api).

La recurrencia nativa exige una secuencia independiente:

1. Configurar la referencia remota del plan aprobado y crear el cliente.
2. `customer/register` devuelve token y destino de enrolamiento; el proveedor recibe los datos de tarjeta. [Registrar tarjeta](https://developers.flow.cl/docs/suscripciones/register-card).
3. Consultar `customer/getRegisterStatus` con el token para verificar enrolamiento y cliente; recibir un retorno del navegador no lo acredita. [Estado](https://developers.flow.cl/docs/suscripciones/suscription-status).
4. `POST subscription/create` con `planId` y `customerId`. [Crear suscripción](https://developers.flow.cl/docs/suscripciones/create-suscription).
5. Conciliar suscripción, importes y pagos. Un objeto denominado `invoice` del proveedor es un importe comercial; no debe presentarse automáticamente como DTE chileno. [Importes](https://developers.flow.cl/docs/suscripciones/get-invoice).

La implementación no debe anunciar recurrencia Flow operativa si solo implementa el checkout de pago único. La confirmación del enrolamiento tampoco constituye por sí sola un período pagado.

## Reglas de implementación de Zenvik

Estas son decisiones de seguridad de la aplicación, no afirmaciones de capacidades del proveedor:

- Resolver negocio, propietario, plan publicado, versión de precio y período en servidor. Snapshot inmutable de monto y moneda antes de crear cualquier orden. No confiar en precios remitidos por el cliente.
- Identificador UUID interno por intención; la referencia remota debe corresponder inequívocamente a esa intención y al negocio.
- Callback como señal para consulta autenticada, destino remoto fijo, TLS verificado, timeout y tamaño de respuesta limitados; no seguir redirecciones arbitrarias ni devolver payloads sensibles.
- Comparar monto Decimal exacto, moneda, referencia de comercio, transacción y período con el registro local. Estados desconocidos no activan acceso.
- Bloqueo transaccional del negocio/suscripción y unicidad de transacción/evento. Repetir una confirmación no extiende dos veces el período; un evento viejo no revierte uno final ni cobra nuevamente.
- No mantener una transacción de base abierta durante la llamada de red. Estados intermedios, reintentos controlados y conciliación deben cubrir fallos entre ambos sistemas.
- Un resultado de navegador es informativo; únicamente el servidor puede activar pago/suscripción tras verificación.
- Sin PAN, CVV, tarjetas ni cuerpos financieros íntegros en tablas, logs, capturas o errores. Tokens opacos restringidos; excluirlos de APIs cliente y auditoría general.
- Separar cancelación, cambio de plan y reembolso. Sin prorrateo ni cargos de diferencia automáticos; cambio al próximo período aprobado salvo política explícita.
- Validar callbacks falsificados, duplicados, referencias de otra empresa, monto/moneda distintos, timeouts, estados fuera de orden y carreras reales.

## Dependencias pendientes de pruebas externas y producción

No se ha probado ninguna cuenta sandbox en esta investigación. Antes de declarar integración externa verificada se necesita cuenta sandbox, credenciales, URL HTTPS de notificación alcanzable y pruebas de enrolamiento, cobro, rechazo, reintento, conciliación y cancelación. La API local no es accesible directamente desde el proveedor sin infraestructura adicional autorizada.

Flow publica requisitos de Cargo Automático que incluyen comercio habilitado, cuenta bancaria empresarial y giro del SII compatible, datos tributarios coherentes y publicación de precios/condiciones. Debe confirmarse el contrato aplicable. [Requisitos oficiales](https://web.flow.cl/es-cl/preguntas-frecuentes/cargo-automatico/).

Para Mercado Pago no inferir el ambiente por el prefijo del token: la documentación actual señala que algunos accesos de prueba también usan `APP_USR`. Seleccionar explícitamente entorno/cuentas de prueba según producto y verificar `live_mode` cuando corresponda. [Credenciales](https://www.mercadopago.cl/developers/en/docs/links-and-debts/additional-content/your-integrations/credentials), [pruebas](https://www.mercadopago.cl/developers/en/docs/automatic-payments/Integration-test).

Producción permanece pendiente de autorización, contratos, validación/homologación que corresponda, cuenta de comercio, tarifas confirmadas, consentimiento para recurrencia, operación de incidencias/reembolsos, observabilidad y proceso tributario autorizado. Un comprobante o registro interno no constituye boleta/factura autorizada por el SII.
