# Zenvik — operación segura y recuperación

Estado: procedimientos preparados y restauración sintética ensayada. No hay
respaldos automáticos, colector ni alertas configurados/verificados. No hay staging
autorizado identificado. Nunca restaurar sobre la base principal para probar.

## Entornos y secretos

| Variable | Desarrollo | Staging / producción |
| --- | --- | --- |
| DJANGO_PRODUCTION | False | True |
| DEBUG | False recomendado | False obligatorio |
| DJANGO_SECRET_KEY | Secreto local | Secreto único aleatorio >=50 caracteres, gestor de secretos |
| ALLOWED_HOSTS | localhost,127.0.0.1 | Hosts públicos explícitos, sin comodines |
| CSRF_TRUSTED_ORIGINS | Vacío si mismo origen | Vacío si mismo origen o lista HTTPS explícita |
| DJANGO_BEHIND_PROXY | False | True solo con Django privado y proxy que sobrescribe X-Forwarded-Proto |
| DJANGO_ADMIN_ENABLED | True por defecto | False por defecto; si se habilita, VPN/red interna y límite de login |
| PUBLIC_REGISTRATION_ENABLED | True por defecto | False por defecto; mantener cerrado durante piloto |
| POSTGRES_HOST / POSTGRES_PORT | 127.0.0.1 / 5435 | Red privada y puerto del servicio |
| POSTGRES_SSLMODE | prefer para Docker local | verify-full para conexión remota, CA confiable y hostname certificado |
| POSTGRES_DB / USER / PASSWORD | `.env` local | Base y credenciales distintas por entorno; runtime sin superusuario |
| APP_ORIGIN (Next) | http://127.0.0.1:3000 | Origen público HTTPS, idéntico al construir y ejecutar Next |
| DJANGO_API_URL (Next, servidor) | http://127.0.0.1:8000 | URL base HTTP/HTTPS del backend privado, sin rutas, usuario o contraseña |

No poner secretos en NEXT_PUBLIC, código, imágenes, argumentos de línea de comando
o capturas. No imprimir `.env` ni usar `docker compose config` sin filtrar valores.
Para libpq usar `PGSSLROOTCERT`/almacén CA apropiado cuando haga falta. Renovar
credenciales ante exposición; una rotación de SECRET_KEY afecta sesiones y firmas:
planificar invalidación y no mantener una clave comprometida en fallbacks.

Producción: ejecutar servidor WSGI/ASGI apropiado, nunca runserver. El proxy TLS
debe imponer tamaño máximo 64 KiB para la API, plazos y límites de conexiones/tasa;
el código no sustituye esos controles. No exponer PostgreSQL ni Django directamente.
No confiar X-Forwarded-For del cliente: hoy el proxy Next no lo propaga y Django
ve la IP del proxy; usuarios comparten el límite por IP. Resolver la cadena de
proxies confiables o aplicar límites en el borde antes de abrir acceso masivo.

Next añade HSTS cuando APP_ORIGIN es HTTPS durante el build. Verificar cabeceras
en el origen final y repetir el build si cambia. Django activa Secure/HTTPS/HSTS
en modo producción. No incluir subdominios ni solicitar preload sin validarlos.
CSP actual bloquea frames/objetos y restringe base/formularios; no incluye aún
una política de scripts con nonce. No afirmar que elimina todo XSS.

## Privilegios PostgreSQL

El usuario actual de desarrollo es superusuario: no reutilizarlo en producción.
Preparar con el administrador una identidad migradora propietaria del esquema
y otra runtime LOGIN sin SUPERUSER, CREATEDB, CREATEROLE, REPLICATION ni BYPASSRLS.
Runtime necesita CONNECT, USAGE del esquema y SELECT/INSERT/UPDATE/DELETE sobre
las tablas utilizadas, además de USAGE/SELECT en secuencias pertinentes; no DDL ni
propiedad de tablas. Configurar privilegios por defecto **del rol migrador** para
nuevas tablas/secuencias, y verificar permisos tras cada migración. No conceder
roles propietarios a runtime. Revisar CREATE de PUBLIC y acceso de otros roles.

No se ejecutaron REVOKE, ALTER ROLE ni cambios de contraseña sobre desarrollo:
afectarían pruebas/migraciones y requieren transición planificada. Las pruebas
que crean bases temporales necesitan una identidad de pruebas separada con CREATEDB.

## Respaldo y restauración

Elegir responsable, almacenamiento cifrado externo, control de acceso, retención
y alertas. Propuesta inicial a acordar para piloto: respaldo diario, RPO 24 h,
RTO 4 h; **no son objetivos medidos ni garantizados**. Para RPO menor evaluar WAL/PITR.
Un volumen Docker no es un respaldo. Un checksum detecta corrupción, no cifra datos.

Procedimiento con herramientas PostgreSQL de versión compatible:
1. Preparar PGHOST, PGPORT, PGUSER, PGDATABASE y autenticación protegida (.pgpass
   con permisos restrictivos o gestor de secretos); no poner contraseña en la URL.
2. Ejecutar `pg_dump --no-password --format=custom --no-owner --no-privileges
   --file=<ruta-protegida>/respaldo.dump`. No usar redirección de texto para dumps
   binarios. Confirmar código de salida 0, tamaño, checksum y fecha.
3. Cifrar y transferir a almacenamiento externo con acceso limitado. Documentar
   roles/privilegios, configuración y secretos **por separado**, nunca en logs.
4. Crear una base vacía y aislada con nombre único y credenciales de prueba.
   Verificar con SELECT current_database() que no sea la principal. Revisar que
   no existan tablas; no usar `--clean` ni `--create` contra un servidor compartido.
5. Ejecutar `pg_restore --no-password --exit-on-error --single-transaction
   --no-owner --no-privileges --dbname=<base-aislada> <ruta>/respaldo.dump`.
   No ejecutar una copia no confiable: un dump puede contener SQL ejecutable.
6. Verificar migraciones, conteos esperados, FK/checks y flujos de sesión/negocio
   con acceso restringido. Datos reales restaurados siguen siendo confidenciales;
   este ensayo automatizado utiliza exclusivamente datos sintéticos.
7. Registrar tiempos, resultado y checksum sin datos personales. El responsable
   debe validar el plan antes de cualquier recuperación de producción o cambio DNS.

Ensayo automatizado seguro, desde `apps/api`:

```powershell
.\.venv\Scripts\python.exe verify_restore.py --pg-bin "C:\Program Files\PostgreSQL\18\bin"
```

El script crea dos bases `zenvik_restore_src/dst_<UUID>`, migra y siembra **solo** la
fuente temporal, hace dump/restore y verifica las 16 tablas, conteos y decisión.
Solo elimina las dos bases que creó, con guardas de nombre; nunca extrae datos de
la base configurada ni restaura sobre ella. La contraseña viaja al subproceso por
entorno privado, no por argumentos; no se guarda en el código ni en evidencia.
Puede fallar si falta CREATEDB o herramientas; eso no autoriza usar la base real.

## Logs, alertas e incidentes

`zenvik.security` emite eventos mínimos para rechazos/errores de API. Colectar
stderr con rotación y retención limitada. En el perímetro eliminar cookies,
Authorization, cuerpos y query strings de registros; no habilitar trazas HTTP de
autenticación en entornos con datos reales. No enviar errores íntegros con SQL o
variables locales a terceros. Los eventos actuales no incluyen identidad personal
ni permiten una auditoría exhaustiva de todas las acciones de negocio.

Antes de piloto, configurar comprobaciones de disponibilidad y alertas para 5xx,
429 anómalos, conexión DB, disco, antigüedad/fracaso de respaldos y certificados.
Probar la entrega de una alerta y asignar responsable. No existe monitoreo externo
implementado en esta etapa; no se añadieron servicios ni dependencias para fingirlo.

Ante incidente: restringir acceso afectado, preservar evidencia filtrada y tiempos,
evaluar alcance, revocar sesiones/credenciales comprometidas con un procedimiento
aprobado, corregir y validar en aislamiento. Restaurar solo tras validar copia y
destino; comunicar impacto según las obligaciones aplicables y revisar causa raíz.
No destruir tablas, logs ni volúmenes como primera respuesta.

## Puerta de salida a piloto

Repetir `check --deploy`, suite backend, typecheck/lint/build y E2E con el origen
HTTPS real y backend privado. Resolver DB-01, respaldos y observabilidad de
[SECURITY.md](SECURITY.md). Registrar la aceptación explícita de riesgos restantes.
Una prueba local satisfactoria no demuestra seguridad del despliegue público.

Referencia técnica: [respaldo SQL de PostgreSQL](https://www.postgresql.org/docs/17/backup-dump.html).
