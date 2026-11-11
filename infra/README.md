# Zenvik — operación preparada, sin despliegue

Estos archivos no crean infraestructura. No ejecutar las plantillas contra una base existente sin revisión del DBA y autorización de release. El desarrollo conserva `compose.yml`, PostgreSQL 5435, Django 8000 y Next 3000.

## Entornos y autoridad

| Entorno | Base/secretos | Tráfico y proveedores |
|---|---|---|
| Desarrollo | `.env` local existente, sin modificar | localhost; pagos desactivados |
| Staging | Base dedicada, secretos propios, datos sintéticos | HTTPS real por validar; solo cuentas sandbox explícitas |
| Producción | Otra base, credenciales y claves distintas; nunca copiar `.env` de desarrollo | HTTPS verificado; registro/Admin cerrados; pagos reales no implementados |

`APP_ENVIRONMENT=staging|production` exige `DJANGO_PRODUCTION=True`, `DEBUG=False`, `DJANGO_READ_DOTENV=False` y PostgreSQL `verify-full`. Las claves se inyectan por gestor de secretos/archivos mediante `DJANGO_SECRET_KEY_FILE` y `POSTGRES_PASSWORD_FILE`, sin incorporarlas al build. El CA de PostgreSQL se monta mediante `PGSSLROOTCERT`. Los ejemplos contienen dominios `.invalid` y rutas sin credenciales.

La aplicación valida `X-Forwarded-Proto` solo desde `TRUSTED_PROXY_CIDRS`, basándose en el peer de red real; elimina X-Forwarded-For/Host y Forwarded. El ingreso y Next deben sobrescribir cabeceras. No añadir `0.0.0.0/0` ni copiar los CIDR de ejemplo como configuración real. Probar el peer observado por Django en la red del proveedor, incluyendo cada réplica. Django y PostgreSQL no reciben puertos públicos.

La IP de usuario aún no se propaga como identidad confiable a Django. Sus límites de login por IP se comparten detrás de Next. Definir y probar limitación por cliente en el ingreso antes del piloto; no confiar directamente en X-Forwarded-For enviado por Internet.

## Construcción y release

1. Aprobar alcance, dependencia de esquema, presupuesto y responsables. Revisar CI; un escaneo alto/crítico bloquea el release.
2. Construir API y web desde la misma fuente revisada con los Dockerfiles de `apps/*`. Fijar `APP_ORIGIN=https://dominio-aprobado` al construir web. Registrar digests de artefactos, imágenes base y resultados; no usar `latest` para promover.
3. Provisionar por un procedimiento autorizado la red, base administrada, roles, secretos y CA. Esta etapa no ejecuta ese paso.
4. Validar plantilla/variables sin mostrarlas: `docker compose -f infra/compose.staging.yml --env-file <archivo-protegido> config --quiet`. El archivo preparado no publica API ni base; el proveedor/ingreso debe aportar TLS y acceso a web.
5. Con el rol migrador, revisar `manage.py migrate --plan`, tiempo estimado/locks y compatibilidad con la versión anterior. Tener un respaldo externo **restaurado y verificado** reciente. Aplicar únicamente migraciones aprobadas, fuera del arranque de cada réplica.
6. Promover las imágenes por digest mediante el mecanismo aprobado del proveedor, con proceso manual separado de CI. El migrador no queda disponible para la aplicación. No hay comando automático de rollout en este repositorio.
7. Comprobar readiness, HTTPS/cadena de certificado, cookies Secure/HttpOnly/Lax, CSRF/Origin, login, selección de negocio, aislamiento, asistencia y exportación. El registro público cerrado requiere fixtures previamente autorizadas en staging.
8. Observar errores/latencia/DB y disponer de operador de rollback. No aceptar solo un HTTP 200 de la landing como validación de la integración.

`migrate` de Compose tiene perfil `operations` y comando inicial `migrate --check`: no migra automáticamente al arrancar API. Necesita su propio secreto y `POSTGRES_ROLE` del propietario. `check --deploy` se ejecuta mediante `scripts/verify_configuration.py` con datos sintéticos; W005/W021 se registran porque includeSubDomains/preload continúan desactivados intencionalmente. Esto no valida certificados reales.

No se sirve Django Admin públicamente. Si se autoriza más adelante, preparar ingreso privado/VPN, autenticación del operador y publicación separada de `collectstatic`; la plantilla actual lo mantiene cerrado.

## Rollback

- Si el esquema sigue siendo compatible: volver al digest anterior de aplicación y repetir healthchecks/smoke tests. Conservar evidencias del incidente, sin cuerpos/cookies/tokens.
- Si hay incompatibilidad: detener nuevas escrituras de forma autorizada y evaluar un cambio correctivo hacia delante. No revertir migraciones destructivamente ni restaurar encima de la base activa.
- Restaurar siempre a otra base UUID/dedicada. Validar integridad, permisos y funcionalidades antes de proponer cambio de conexión. La promoción y cualquier pérdida potencial requieren aprobación; conservar la base anterior restringida.
- Revocar identidades o rotar claves solo con plan explícito: cambio de Django SECRET_KEY invalida firmas/sesiones; no reusar claves entre entornos. No registrar credenciales en un incidente.

## PostgreSQL

`postgres/bootstrap.sql` prepara roles nuevos owner NOLOGIN, migrador LOGIN miembro del propietario y runtime LOGIN sin SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS. Usar en una **base nueva aislada**. Provisionar contraseñas con el gestor seguro, nunca como argumentos ni archivos SQL versionados. El migrador conecta con `POSTGRES_ROLE=<owner>` para que el propietario real de tablas/funciones sea el rol NOLOGIN.

Después de migrar, `postgres/grants.sql` concede DML y secuencias a runtime y retira sus escrituras sobre `django_migrations`. Los privilegios por defecto corresponden al owner, no al administrador conectado. `backup-grants.sql` es una plantilla separada para un lector de respaldos; no concede permisos de restauración/creación de base.

Se probó owner/migrador/runtime en una base UUID PostgreSQL 17. Los roles de la base local existente **no se cambiaron**: su cuenta de desarrollo sigue siendo inadecuada para producción. No hay PostgreSQL RLS; el aislamiento de clientes se comprueba en la aplicación. SQL privilegiado no es una interfaz multiempresa segura.

El runtime tiene propuesta de statement timeout 15 s, lock timeout 3 s e idle transaction 60 s. Revisar con métricas de reportes antes de activar. `POSTGRES_CONN_MAX_AGE` permite conexiones persistentes acotadas; no se introdujo PgBouncer sin necesidad medida. Dimensionar conexiones máximas frente a workers × threads × réplicas, más salud/operaciones, dejando margen. No registrar parámetros SQL ni activar logs de consultas con datos personales; preferir estadísticas agregadas/query-id del proveedor.

## Respaldos y recuperación

- Primario propuesto: backups/PITR del PostgreSQL administrado, con retención, región y permisos verificados al contratar. No está activado aquí.
- Copia lógica independiente preparada: `scripts/backup.py` usa pg_dump custom y AES-256-GCM autenticado en streaming; conserva hash SHA-256 del cifrado. No sube dumps en claro.
- `backup_job.py` está desactivado salvo `BACKUP_ENABLED=true`; requiere entorno protegido, clave de 32 bytes, perfil PG y un prefijo S3/KMS explícitos. Sube solo cifrado y manifiesto mediante identidad de workload. No está instalado ni se ejecutó contra un bucket.
- Propuesta inicial: cada seis horas con jitter de hasta cinco minutos; retención 30 días sujeta a acuerdo. Los archivos systemd/lifecycle son plantillas, no jobs/políticas activos.
- Usar identidad DB de lectura y rol de objeto con PutObject en su prefijo, sin DeleteObject ni cambio de políticas. Separar restaurador, gestor de retención y administrador. Activar bloqueo de acceso público, versionado/Object Lock y cifrado remoto mediante proceso autorizado. Validar las necesidades KMS/multipart del cliente elegido.
- Guardar y versionar claves de cifrado aparte del backup, con recuperación probada. Rotarlas conservando versiones necesarias hasta terminar retención/holds; perder una clave hace irrecuperables sus respaldos. Un hash no sustituye el cifrado ni autentica por sí solo el origen de un manifiesto.
- El worker Linux usa usuario propio, umask 0077, directorio protegido y PrivateTmp. `chmod` de ejemplo no acredita ACL de Windows para datos operativos; los ensayos locales usan solo datos sintéticos.
- `restore-new` crea una base UUID, verifica hash y autenticación GCM antes de pg_restore transaccional. No acepta un destino operativo existente. Solo restaurar archivos propios confiables: un dump puede contener SQL ejecutable. Un fallo deja la base nueva para inspección, sin promoverla ni sobrescribir otra.
- `scripts/verify_encrypted_restore.py` crea fuente sintética, migra, registra evidencia, cifra/restaura y compara todas las tablas por hash, constraints e inmutabilidad. Se ejecutó localmente. Ese ensayo pequeño no acredita restaurar el volumen real ni un RTO comercial.

RPO propuesto: seis horas para la copia lógica, más retrasos/errores; definir un RPO menor solo tras contratar y verificar PITR. RTO propuesto para acordar: cuatro horas; **no medido en producción**. El tiempo del ensayo sintético está en `.artifacts/stage16-encrypted-restore.json` y no incluye recuperación de infraestructura/DNS/secretos/operación.

Un DBA/restaurador y un responsable de incidente deben quedar nombrados antes de activar. Ante pérdida de instancia: crear destino limpio, recuperar backup/PITR con credenciales de restauración, validar hash/esquema/migraciones/negocios/evidencia/pagos, ejecutar smoke aislado y solo después solicitar promoción. Ante pérdida de clave o región: usar copia/clave independiente verificada; sin ella no se promete recuperación.

## Observabilidad y alertas

Implementado: eventos JSON de API con códigos allowlist, método, familia, status, duración y tipo de excepción; sin URL, query, cuerpo, actor, UUID, cookies, IP, coordenadas o texto de excepción. Gunicorn no escribe access logs de URLs. Liveness no consulta DB; readiness hace SELECT 1 y responde 503 genérico ante fallo. Web tiene probes equivalentes y valida dependencia API.

Diseñado, no desplegado: mapear estos eventos a métricas agregadas del proveedor, más CPU/memoria/conexiones/latencia DB, tareas, backup y certificados. No se instaló Prometheus/Grafana ni un servicio pago. `observability/alerts.yml` define umbrales iniciales configurables: tres probes fallidos, 5xx >2% con mínimo 50 solicitudes, p95 >1500 ms, recursos >90%, conexiones >80%, backup >8 h, ensayo de restauración fallido/viejo, TLS <14 días y fallos persistentes de integración. Son propuestas, no SLO validados ni alertas enviadas.

No paginar por cada 400/403/409 normal. Revisar anomalías de autenticación/asistencia de forma agregada. Las métricas no llevan negocio/empleado/ubicación como etiquetas. Un fallo GPS del navegador no se convierte en seguimiento del trabajador.

Antes del piloto: configurar colector, retención/acceso, canal de alertas y guardia; probar una alerta y su escalamiento sin datos personales. El fallo del job debe alertar y el éxito debe verificarse contra almacenamiento externo/restauración, no solo un archivo local de fecha.

Los errores nativos de Next/ingreso pueden añadir contexto de petición. La política de redacción antes de retención/exportación debe verificarse en ese colector; el formatter JSON seguro implementado aquí cubre API/Gunicorn, no todos los logs automáticos de un proveedor.

## Estado y evidencias

El informe [STAGE-16](../docs/STAGE-16.md) distingue implementación probada, preparación sin validación remota, documentación y bloqueos. La comparación de proveedores/costos verificados está en [STAGE-16-CLOUD](../docs/STAGE-16-CLOUD.md). HTTPS, cookies a través del ingreso real, permisos de red/servicio gestionado, entrega de alertas, offsite/PITR, rollback real y sandbox externo requieren un entorno y autorización que esta etapa no crea.
