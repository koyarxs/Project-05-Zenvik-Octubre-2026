# Modelo inicial multiempresa

- `Business` representa un negocio. `rut` es opcional y se normaliza a número-DV
  sin puntos, sin ceros iniciales y con K mayúscula. Se comprueban formato y dígito
  verificador mediante módulo 11. Esto no acredita existencia ni titularidad ante
  el SII. PostgreSQL impide repetir valores informados mediante un índice único
  parcial; varios negocios pueden tener RUT vacío. El nombre no es único.
- `Business` y `Employee` tienen `created_at` y `updated_at`; `Membership` tiene
  `created_at`. `Employee.hire_date` es opcional. `updated_at` se actualiza al
  guardar normalmente; si se usa `save(update_fields=...)`, incluir `updated_at`.
- `Membership` relaciona una cuenta con un negocio y su rol. PostgreSQL exige
  unicidad de `(user, business)` y limita el rol a OWNER, ADMIN o EMPLOYEE.
- `Employee` pertenece siempre a un negocio y puede existir sin cuenta. Si tiene
  cuenta, solo puede existir un registro para esa cuenta en ese negocio. Una misma
  cuenta puede trabajar en varios negocios si tiene las membresías respectivas.
- Los campos de nombre y correo de Employee describen al trabajador; los de User
  describen la cuenta. No se copian ni sincronizan automáticamente. Un correo de
  trabajador no concede acceso ni vincula cuentas automáticamente.
- Las claves foráneas y restricciones únicas generan los índices iniciales; no
  se duplican índices ni se indexan estados booleanos sin una consulta que lo exija.
- La eliminación de negocios con dependencias y de usuarios con membresías se
  protege con `PROTECT`. Para bajas operativas se utiliza `is_active`.

## Vinculación de trabajadores

`Employee.clean()` exige una membresía activa del usuario en el mismo negocio.
`Employee.save()` llama a `full_clean()`, incluyendo al crear mediante
`objects.create()` y al cambiar de negocio o cuenta. Se rechaza una membresía
inactiva. El rol OWNER no concede `is_staff`, `is_superuser` ni permisos globales.

Esta validación es de aplicación, no una restricción entre tablas de PostgreSQL.
`QuerySet.update()`, `bulk_create()`, `bulk_update()` y SQL directo la omiten.
Los guardados normales de membresías y trabajadores ahora bloquean el negocio
en una transacción. Se impide desactivar o eliminar membresías vinculadas;
usuario/negocio de una membresía y negocio de una ficha son inmutables. Un signal
también protege `Membership.objects.filter(...).delete()`. Para desactivar una
membresía, desvincular primero la cuenta de la ficha, conservando la ficha.
Las escrituras masivas y SQL directo siguen sin soportarse para estas operaciones.

`Business.save()` también ejecuta `full_clean()` y normaliza el RUT antes de
comprobar unicidad, incluso en formularios del Admin. Las escrituras masivas y SQL
directo omiten esa normalización y el cálculo del dígito: deben recibir valores
previamente validados y canónicos. El índice único protege los valores almacenados.

## Aislamiento

Las relaciones `business.employees` y `business.memberships` delimitan consultas
por negocio. Los administradores globales del ORM siguen viendo todos los
registros: este esquema no implementa autorización automática ni PostgreSQL RLS.
La API v1 obtiene el negocio mediante una membresía activa y filtra lecturas y
escrituras por negocio y rol. OWNER/ADMIN gestionan fichas; EMPLOYEE solo lee la
suya. Todo endpoint futuro debe conservar estos controles. Consultar [API.md](../API.md).

Los tres modelos están registrados en Django Admin con búsquedas, filtros y
fechas de solo lectura. Este Admin es una herramienta interna global para personal
autorizado con permisos de Django, no un portal para administradores de negocios.

## Migración incremental

`0002_refine_initial_models` conserva `0001_initial`: renombra `tax_id` a `rut`
y `joined_at` a `hire_date`, añade fechas y el índice único de RUT informado.
Se aplica después de verificar que las tablas de negocio están vacías. Si se
reutiliza en una base con datos, revisar primero RUT inválidos o duplicados y
normalizarlos con una migración de datos explícita. Los valores iniciales de las
nuevas fechas corresponden al momento de migración, no a historia reconstruida.

Referencia del cálculo del dígito verificador:
[Registro Civil: validación del RUN](https://www.registrocivil.gob.cl/PortalOI/Manuales/Validacion_de_Run.pdf).

## Verificación

Desde `apps/api`, con el Python de `.venv`:

```powershell
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py test accounts businesses
.\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
```

Las pruebas usan una base temporal de PostgreSQL. Cubren usuarios, negocios,
trabajadores sin cuenta, membresías únicas, roles válidos, consultas delimitadas
por negocio, vinculación de cuentas con membresía activa, RUT y su unicidad,
formularios del Admin, fechas y protección de negocios con dependencias. Los RUT
de prueba son casos matemáticos sintéticos; no se insertan negocios de ejemplo en
la base de desarrollo.
