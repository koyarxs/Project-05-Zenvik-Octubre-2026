# Etapa 16 — evaluación cloud y runtimes

Revisión de documentación oficial al **5 de noviembre de 2026**. Este informe prepara una decisión; no acredita un despliegue ni crea recursos. No se ejecutaron comandos Git, compras, altas de cuentas cloud, cambios de DNS ni conexiones con credenciales productivas.

## Recomendación proporcional

Con los controles de esta implementación, se recomienda **Google Cloud Run + Cloud SQL PostgreSQL 17 en Santiago (`southamerica-west1`)**, dos servicios web y una base administrada, sin Kubernetes. Mantener la base sin IP pública y definir red privada, CA compartida y nombre DNS del certificado para `sslmode=verify-full`; Google documenta esa verificación también para conexiones privadas. El proxy entre Next y Django requiere una ruta privada y control de identidad/red diseñado para Cloud Run. No se ha desplegado ni validado esa integración. [Identidad TLS de Cloud SQL](https://docs.cloud.google.com/sql/docs/postgres/configure-ssl-instance?hl=en).

**Render es una alternativa de menor complejidad operativa, pero su conexión interna de PostgreSQL no soporta `verify-full`**, según su documentación actual; por eso no es la opción inmediata de esta plantilla. No se propone rebajar la validación TLS ni abrir una base pública para sortear el bloqueo. Tampoco ofrece región sudamericana. Azure Container Apps + PostgreSQL Flexible en Chile Central es otra alternativa compatible con verificación de certificados, sujeta a cuota/SKU y presupuesto. Ninguna decisión autoriza gastos. [Conectividad Render](https://render.com/docs/postgresql-creating-connecting), [TLS Azure](https://learn.microsoft.com/en-us/azure/postgresql/security/security-tls-how-to-connect).

No se recomienda Kubernetes para el tamaño actual: dos procesos web, una base y un trabajo programado se pueden operar sin un clúster. Tampoco se recomienda usar una base gratuita con vencimiento como almacenamiento de clientes.

## Comparación de plataformas

| Plataforma | Arquitectura compatible | Región pertinente verificada | Ventajas y límites para Zenvik |
|---|---|---|---|
| **AWS** | ECS/Fargate para Django y Next, RDS PostgreSQL, ALB, Secrets Manager y almacenamiento de respaldo | `sa-east-1`, São Paulo, disponible. La región **Chile sigue anunciada**, no se toma como disponible | Control de red y madurez operativa; más piezas y cargos mínimos potenciales (balanceador, tareas, NAT, base y logs). No elegir Santiago AWS hasta verificar lanzamiento y disponibilidad real de servicios. [Regiones](https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html), [infraestructura](https://aws.amazon.com/about-aws/global-infrastructure/) |
| **Azure** | Container Apps para los contenedores, PostgreSQL Flexible, Key Vault y almacenamiento | **Chile Central**, Santiago, tres zonas. Container Apps anunciado disponible; PG Flexible listado con HA zonal | Alternativa con cómputo y base en Chile. La tabla de PostgreSQL indica **sin geo-redundant backup en Chile Central**; diseñar copia de desastre aparte. Verificar cuota/SKU y red antes de comprometer disponibilidad. [Región](https://learn.microsoft.com/azure/reliability/availability-zones-region-support), [Container Apps](https://github.com/microsoft/azure-container-apps/issues/1795), [PostgreSQL por región](https://learn.microsoft.com/en-us/azure/postgresql/single-server/overview) |
| **Google Cloud** | Dos servicios Cloud Run, Cloud SQL PostgreSQL, Secret Manager, Artifact Registry, Scheduler/Jobs | Cloud Run y Cloud SQL disponibles en **Santiago `southamerica-west1`** | Alternativa preferida si se exige Chile; limitar instancias y conexiones DB. Santiago está en categoría de precios Tier 2 de Cloud Run. Planificar ingress privado/identidad antes de conectar el proxy Next con Django. [Cloud Run](https://docs.cloud.google.com/run/docs/locations), [Cloud SQL](https://docs.cloud.google.com/sql/docs/postgres/locations?hl=en) |
| **Render** | Web service Next, private service Django, managed PostgreSQL 17, cron job | Oregon, Ohio, Virginia, Frankfurt y Singapore; **sin Chile/Sudamérica** | Menos operación y red privada entre servicios de la misma región. No hay cambio directo de región de un recurso existente; migrar requiere nuevo destino y validación. Fijar PG17, ya que el predeterminado actual es PG18. [Regiones](https://render.com/docs/regions), [versiones](https://render.com/docs/postgresql-upgrading), [servicio privado](https://render.com/docs/private-services) |
| **Vercel** | Alojamiento Next.js y proveedor separado para Django/base en la propuesta | Cómputo `gru1` São Paulo; la región predeterminada de funciones es `iad1` | Buen encaje Next; añadir otra plataforma para el resto aumenta saltos/red y operación. Elegir región próxima al backend/base. Un PoP/CDN en un país no demuestra residencia de datos de cómputo/base allí. [Regiones](https://vercel.com/docs/regions) |
| **Cloudflare** | DNS/TLS/WAF/CDN delante del origen; Workers/OpenNext o Containers requieren evaluación propia | Red global; no se asume fijación de todos los datos en Chile | Útil como borde. Workers no es un reemplazo directo del proceso CPython/Django/psycopg existente. Containers es otro producto; Hyperdrive conecta una base externa, **no aloja PostgreSQL**. Evitar reescribir la aplicación solo para adoptar el borde. [Productos/precios](https://www.cloudflare.com/plans/), [Hyperdrive](https://developers.cloudflare.com/hyperdrive/platform/pricing/) |

La existencia de una región no garantiza cuota, disponibilidad de una talla concreta o cumplimiento normativo. No se han hecho mediciones de rendimiento, verificaciones contractuales de residencia ni una auditoría regulatoria.

## Respaldo y recuperación administrada

| Opción | Capacidad documentada | Condición operativa |
|---|---|---|
| Render PostgreSQL pago | PITR: tres días en workspace Hobby, siete en Pro o superior. La recuperación crea otra instancia. Free no tiene recuperación | Probar restauración aislada antes del piloto; considerar costo simultáneo del destino. [Recuperación](https://render.com/docs/postgresql-backups) |
| Amazon RDS | Retención de automated backups configurable hasta 35 días; `0` la deshabilita. Valores predeterminados difieren entre consola y API | Fijar retención positiva y protección frente a borrado; no confiar en defaults. [Retención](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.BackupRetention.html) |
| Azure PostgreSQL Flexible | Restauración a un punto dentro de la retención configurada; respaldo nativo hasta 35 días | Confirmar redundancia y región de las copias; Chile Central no ofrece la opción geo-redundant de la tabla consultada. [Backup/restore](https://learn.microsoft.com/en-au/azure/postgresql/backup-restore/concepts-backup-restore) |
| Cloud SQL PostgreSQL | Ventana de logs PITR: hasta siete días Enterprise y hasta 35 Enterprise Plus, según configuración | Habilitarlo explícitamente; comprobar edición, ubicación de backups y recuperación de instancia eliminada. [Restauración](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/restore?hl=en) |

HA, réplica y volumen persistente no sustituyen respaldo recuperable. Se propone combinar PITR del proveedor con exportación lógica cifrada y separada, retención aprobada y ensayos. RPO/RTO deben acordarse y luego medirse; este informe no promete valores. Toda restauración de prueba usará un destino aislado, nunca la base operativa.

## Costos públicos y límites de la estimación

Moneda: **USD**, antes de impuestos donde la fuente así lo indica. Son referencias consultadas, no cotizaciones ni autorización de gasto. No se convierte a CLP con un tipo de cambio supuesto.

| Componente | Referencia pública verificada | Lo que falta para un total real |
|---|---|---|
| Vercel Pro | Página pública: **USD 20/mes**, con USD 20 de crédito de uso; puestos y uso adicional según contrato | Backend, base, egress, optimización de imágenes, logs y puestos adicionales. [Precios](https://vercel.com/pricing), [facturación](https://vercel.com/docs/pricing) |
| Cloudflare Workers Paid | Cargo mínimo **USD 5/mes** por cuenta y consumo adicional según límites | No incluye una base PostgreSQL ni equivale a alojar todo Zenvik. Containers y otros productos tienen medición propia. [Workers](https://developers.cloudflare.com/workers/platform/pricing/) |
| Render | Precio compuesto por workspace, instancias web/privadas, base y almacenamiento | La página es dinámica y no entregó cifras de tallas verificables en esta consulta. No se reutilizan precios de blogs. Cotizar Next + Django + PG pago + disco + cron + transferencia/logs. [Precios oficiales](https://render.com/pricing) |
| AWS | RDS y Fargate por recursos, tiempo y región | Cotizar São Paulo: dos tareas, RDS17, disco/IO, ALB, red/NAT, logs, snapshots y restauraciones. [RDS](https://aws.amazon.com/rds/postgresql/pricing/), [Fargate](https://aws.amazon.com/fargate/pricing/) |
| Azure | PostgreSQL por cómputo/almacenamiento y opciones; Container Apps por plan/consumo | Cotizar Chile Central: mínimos, PostgreSQL17, redundancia, backup, logs y tráfico. [PostgreSQL](https://azure.microsoft.com/en-us/pricing/details/postgresql/flexible-server/), [Container Apps](https://azure.microsoft.com/en-us/pricing/details/container-apps/) |
| GCP | Cloud Run por recursos/uso y región; Cloud SQL por edición, máquina, disco y otras opciones | Cotizar Santiago Tier 2, mínimos/instancias máximas, PG17, backups, conectividad privada, logs, registry y egress. [Cloud Run](https://cloud.google.com/run/pricing), [Cloud SQL](https://cloud.google.com/sql/pricing) |

No hay un total mensual verificado porque faltan carga, tamaño real de base, retención, disponibilidad exigida, presupuesto y decisión regional. La base administrada y la infraestructura mínima pueden seguir generando cargos aunque la aplicación no reciba visitas. Definir alertas de gasto y límites de escalado antes de crear recursos; las alertas no son un corte universal de facturación.

## Arquitectura inicial propuesta, sin desplegar

```text
Navegador -- HTTPS --> Next.js público (build de producción)
                         |
                         +-- proxy API de mismo origen --> Django privado (WSGI)
                                                               |
                                                               +--> PostgreSQL17 privado
                                                               +--> proveedor de correo configurado
                                                               +--> pagos deshabilitados / sandbox explícito

Planificador de servidor --> comando de alertas (una ejecución por período)
PITR + backup cifrado separado --> restauración aislada ensayada
```

Si se reevaluara Render, todos los componentes regionales deberían estar en la misma región/red, con Django privado y acceso externo de PostgreSQL deshabilitado. Su TLS interno no satisface hoy la validación de identidad exigida por estos settings: es una dependencia arquitectónica pendiente, no una configuración funcional ya preparada para ese proveedor. [Conectividad PostgreSQL](https://render.com/docs/postgresql-creating-connecting), [red privada](https://render.com/docs/private-network).

En GCP/Azure/AWS, mantener el mismo diseño lógico pero definir integración de ingress, identidad entre servicios y TLS/CA de PostgreSQL para el proveedor elegido. No asumir que el proxy Next actual ya emite tokens de identidad de Cloud Run ni que una URL pública equivale a red privada. El panel interno de Django exige una vía administrativa protegida aparte, no una ruta pública para propietarios de negocios.

Decisiones de aplicación pendientes para cualquier proveedor:

- Servir Django mediante servidor WSGI de producción y Next con build/servidor de producción; no `runserver` ni `next dev`.
- Un origen HTTPS exacto para sesiones/CSRF; `DEBUG=False`, cookies Secure y cadena de proxies confiables documentada. No confiar sin filtro en `X-Forwarded-*` del navegador.
- Rol migrador y rol runtime distintos. El usuario runtime no debe ser propietario ni superusuario. Ejecutar migraciones en tarea única controlada con respaldo y revisión de compatibilidad.
- Secretos del proveedor separados por entorno y fuera de imágenes/repo; no usar credenciales locales ni claves de producción en pruebas. Identidades técnicas de privilegio mínimo.
- Límite de instancias × workers × conexiones por worker compatible con PostgreSQL; revisar pooler y transacciones antes de activar pooling.
- Readiness, liveness, timeouts, tamaño máximo de petición, logs sin cookies/secretos, alertas de errores/disco/conexiones/backup y receptor responsable.
- Planificador cloud independiente de una sesión de Windows, con exclusión de solapamientos e idempotencia. Sin introducir Redis/Celery si un comando periódico basta.
- No servir archivos privados desde disco efímero ni hacer públicos backups. Definir almacenamiento/retención y control por negocio antes de admitir adjuntos.

## Runtimes e imágenes oficiales

| Capa | Recomendación y evidencia |
|---|---|
| Python/Django | Django **5.2 soporta Python 3.10–3.14**, con 3.14 añadido desde 5.2.8; **3.15 no figura soportado para Django 5.2** aunque una ejecución local funcione. Elegir Python 3.13 y verificar todas las dependencias. [Matriz oficial 5.2](https://docs.djangoproject.com/en/5.2/faq/install/) |
| Imagen Python | Se usa `python:3.13-alpine` por digest, con wheels musllinux compatibles comprobados. Las alternativas Debian evaluadas conservaban avisos altos sin corrección de distribución disponible. La imagen mínima pasó regresión y escaneo; no implica compatibilidad ARM ni otra plataforma no ensayada. [Tags oficiales](https://github.com/docker-library/official-images/blob/master/library/python) |
| Node | Línea **24 LTS**, en fase **Maintenance desde 20-10-2026**, con fin previsto 30-04-2028. Se usa `node:24-alpine` por digest, sin npm/corepack en la imagen final; build standalone y optimización nativa de imágenes probados. [Calendario Node](https://github.com/nodejs/Release), [tags oficiales](https://github.com/docker-library/official-images/blob/master/library/node) |
| PostgreSQL | Mantener mayor **17** para reproducir Compose; soporte comunitario previsto hasta 08-11-2029. Tag oficial `postgres:17-bookworm`. No realizar upgrade mayor implícito por usar `latest` ni montar el volumen antiguo en otra versión. [Política](https://www.postgresql.org/support/versioning/), [tags oficiales](https://github.com/docker-library/official-images/blob/master/library/postgres) |
| Base administrada | PG17 está soportado en Render, Cloud SQL y Azure Flexible. Fijarlo explícitamente y verificar disponibilidad en la creación autorizada. [Render](https://render.com/docs/postgresql-upgrading), [Cloud SQL](https://docs.cloud.google.com/sql/docs/postgres/db-versions), [Azure](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-supported-versions) |

La evidencia de builds, regresión y escaneos reales locales se registra en [STAGE-16](STAGE-16.md), separada de esta comparación documental. No se probó una infraestructura remota ni se afirma compatibilidad por la matriz solamente. Las imágenes base deben recibir actualizaciones mediante rebuilds revisados y no permanecer indefinidamente en un digest vulnerable.

## Bloqueos antes de una activación

1. Elegir responsable, cuenta, presupuesto, región y necesidad de residencia de datos con el usuario.
2. Obtener cotización de la arquitectura concreta; aprobar gasto antes de crear servicios.
3. Configurar dominio/origen HTTPS, secretos por entorno, roles DB y permisos de operador.
4. Verificar en la cuenta cuotas, tallas, PG17, red privada y ruta administrativa.
5. Construir imágenes, ejecutar suites y probar migraciones/rollback en staging aislado.
6. Ensayar restauración y registrar RPO/RTO reales; configurar observabilidad y entrega de alertas.
7. Configurar correo y sus políticas; mantener pagos productivos y uso oficial de asistencia sujetos a sus validaciones independientes.

**Estado:** comparación e investigación implementadas; cloud, red, costos finales, restauración cloud y producción **pendientes**. No hay recursos contratados ni despliegue acreditado por este documento.
