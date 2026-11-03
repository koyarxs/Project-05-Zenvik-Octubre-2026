# Zenvik — Etapa 10: trabajadores, perfiles laborales y permisos

## Estado

Etapa implementada y verificada: los doce criterios de aceptación están completados. La aplicación está preparada para continuar a la Etapa 11. No se implementa control de asistencia ni se infieren derechos o cumplimiento laboral.

## Auditoría y dependencias

Se revisaron la arquitectura Django/DRF y Next.js, sesiones, modelos de usuario/negocio/membresía/trabajador/turno/solicitud, servicios transaccionales, endpoints, componentes y pruebas. Se leyeron `STAGE-8.md` y `STAGE-9.md` y se comprobó el código real del calendario.

Se reutilizan el directorio paginado con búsqueda y estados, formulario, ficha individual, panel de actividad, componentes visuales, permisos por membresía, calendario semanal/mensual, historial de turnos y solicitudes. Las ausencias ya tenían creación, revisión, categorías, comentarios, filtros, transición irreversible y comprobación de solapamientos. No se construyó otro módulo paralelo.

La Etapa 9 tiene sus funciones principales disponibles. Sus plantillas nombradas opcionales y el soporte de zonas distintas de Santiago siguen fuera de esa entrega y no bloquean esta etapa. PostgreSQL 17 ya fue verificado en Etapa 9; se vuelve a usar aquí.

## Resultado funcional

### Directorio

- Trabajadores exclusivamente del negocio autorizado; EMPLOYEE únicamente su ficha.
- Búsqueda por nombre, apellido o correo sobre toda la colección, no solo la página visible.
- Filtros por estado y cargo; orden por registro, nombre ascendente/descendente, incorporación y cargo.
- Paginación de 50 resultados del servidor; carga, errores recuperables y estado vacío.
- Tabla de escritorio y tarjetas compactas en móvil; nombre, cargo, rol, acceso, contacto e incorporación disponibles.
- Cargos reales obtenidos del negocio. No se insertan ejemplos ni estadísticas simuladas.

### Registro, edición y perfil

- Se conservan nombre, apellido, correo, incorporación, actividad, negocio y UUID existentes.
- Se añaden teléfono opcional, código interno opcional y único por negocio, cargo, jornada/distribución descriptiva y notas administrativas.
- No se solicitan RUT personal, datos médicos, remuneración ni documentos sensibles. El código es interno, no un documento de identidad.
- Las notas administrativas se excluyen de la respuesta API de EMPLOYEE y no aparecen en su interfaz.
- La ficha organiza identificación/contacto/información laboral, acceso, próximos turnos, planificación anterior y solicitudes. Los enlaces permiten consultar permisos pendientes, aprobados y rechazados.
- Próximos turnos: vista previa de hasta seis dentro de siete días. Planificación anterior: vista previa dentro de los últimos 31 días. Calendario e historial de solicitudes mantienen acceso a la información completa mediante sus controles.
- El detalle del calendario enlaza a la ficha autorizada del trabajador.
- No hay horas trabajadas reales ni marcaciones ficticias.

### Cargos

Se representan como texto laboral validado de hasta 120 caracteres en la ficha. Cada negocio establece sus cargos; el catálogo de filtros se deriva de sus fichas autorizadas. No hace falta un catálogo global ni una tabla de cargos vacíos para esta etapa. Cambiar el cargo de una persona no cambia membresías, turnos ni aprobaciones.

**Cargo laboral y rol de acceso son conceptos independientes.** Un cargo llamado OWNER o Administrador no otorga privilegios.

### Roles y acceso

| Operación | OWNER | ADMIN | EMPLOYEE |
|---|---|---|---|
| Consultar fichas | Negocio propio | Negocio propio | Solo propia |
| Registrar/editar/desactivar ficha | Sí | Sí | No |
| Notas administrativas e historial de personal | Sí | Sí | No |
| Vincular/desvincular cuenta | Sí, con restricciones | No | No |
| Cambiar ADMIN/EMPLOYEE o suspender acceso | Sí, con restricciones | No | No |
| Cambiar propietario o propio acceso | No por este flujo | No | No |
| Solicitar permiso | Con ficha propia activa | Con ficha propia activa | Con ficha propia activa |
| Decidir solicitud | Otra persona | Otra persona | No |

El propietario puede vincular una **cuenta que ya tiene una membresía activa en el mismo negocio**, sin buscar usuarios globales por correo ni revelar si un UUID externo existe. No se crean cuentas, contraseñas o membresías automáticamente. Esta etapa implementa vinculación segura, no envío de invitaciones por correo.

El selector de cuentas solo está disponible a OWNER, excluye propietarios y muestra únicamente usuarios del negocio. Una cuenta no puede vincularse a dos fichas del mismo negocio. No se puede modificar el propio acceso ni los propietarios mediante el endpoint. Se requiere versión vigente de la ficha y confirmación explícita de los cambios.

`Membership.access_enabled` permite suspender/reanudar acceso conservando membresía y relación histórica. Se comprueba en la autorización central y en los servicios de escritura; el negocio suspendido desaparece del selector y sus endpoints responden 404 en las siguientes peticiones. No se desactiva la cuenta global ni sus otros negocios. Desvincular una ficha no revoca por sí solo la membresía.

### Desactivación e integridad

Antes de confirmar, el formulario consulta el número real de turnos futuros o en curso de la persona. Si falla esta comprobación se muestra el error y no se habilita la confirmación hasta recuperarla. Hay enlace a su planificación para reasignar o cancelar según autorización.

La desactivación conserva la ficha, permisos, turnos y revisiones. El modelo existente impide nuevas asignaciones a personas inactivas. El estado administrativo **no representa una terminación contractual** ni suspende automáticamente el acceso; ambos controles se muestran por separado.

### Auditoría

`EmployeeRevision` guarda creación, edición, estado previo de fichas anteriores a la migración y cambios de acceso. Registra autor cuando existe, fecha y estado relevante. La consulta está paginada y restringida a administradores del negocio. Las notas incluidas en revisiones no se exponen a trabajadores.

La primera edición de una ficha antigua añade un estado previo BASELINE; no se inventan autores ni acciones históricas anteriores. Cambios de roles/acceso guardan antes/después. La presentación utiliza nombres de cuenta, roles y estado, sin mostrar UUID técnicos innecesarios.

### Permisos y ausencias

Se conservan solicitudes por fecha/categoría/observaciones, listado histórico, filtros por trabajador/estado y decisión con observación. El modelo rechaza fechas inválidas, superposiciones pendientes/aprobadas y transiciones incorrectas. El bloqueo por negocio evita decisiones concurrentes incompatibles. Ninguna solicitud se aprueba automáticamente.

La aprobación mantiene los turnos existentes y activa la advertencia de conflicto incorporada en Etapa 9. Las nuevas asignaciones siguen las reglas configuradas del negocio. Cambiar cargo, acceso o estado de ficha no reescribe el permiso ni altera su decisión. Se prueba el recorrido de solicitud, aprobación, calendario y ficha; el rechazo permanece cubierto por las suites existentes.

## API

Todas las rutas siguientes están bajo `/api/v1/businesses/{business_id}/` y requieren sesión/autorización del negocio:

| Ruta | Métodos | Descripción |
|---|---|---|
| `employees/` | GET, POST | Nuevos campos laborales, rol/acceso solo lectura y filtros `job_title`, `ordering`. |
| `employees/{id}/` | GET, PATCH | Ficha ampliada; `expected_updated_at` opcional para compatibilidad y enviado por la web. |
| `employees/{id}/impact/` | GET | Conteo de turnos programados futuros/en curso, hasta diez referencias y zona del negocio. |
| `employees/{id}/history/` | GET | Revisiones paginadas, solo OWNER/ADMIN. |
| `employees/{id}/access/` | PATCH | Vinculación y acceso, solo OWNER; versión requerida, `user`, `role`, `access_enabled`. |
| `job-titles/` | GET | Cargos existentes, paginados y acotados a la información autorizada. |
| `accounts/` | GET | Cuentas ya miembros del negocio, paginadas, solo OWNER. |

Los endpoints de turnos y permisos se reutilizan. Se actualiza la autorización central y el listado de negocios para respetar la suspensión de acceso.

## Modelo y migración

Migración aditiva: `businesses/0006_personnel_profiles.py`.

- Employee: `phone`, `employee_code`, `job_title`, `work_schedule`, `admin_notes`, todos opcionales y vacíos para datos anteriores.
- Membership: `access_enabled=True` conserva acceso previo.
- EmployeeRevision: FK protegidas a ficha/autor, acción, estado JSON y fecha.
- Restricción única parcial `(business, employee_code)` para códigos no vacíos.
- Índice `(business, job_title)` para catálogo/ordenamiento por negocio.

Las escrituras bloquean el negocio y son transaccionales. La web envía la versión de ficha para detectar ediciones obsoletas; el flujo de acceso la exige. Se prueba concurrencia de códigos duplicados, además de las pruebas previas de vinculación y planificación. El directorio carga cuentas/membresías sin consultas por cada fila; una prueba compara el número de consultas con distintos tamaños.

La prueba de migración de Etapa 9 ahora restaura la última migración disponible, manteniendo las verificaciones anteriores y evitando dejar el esquema antiguo al ejecutar las demás pruebas. La prueba nueva migra fichas previas a 0006 y comprueba identidad/estado/campos vacíos e historial inicial.

Migración aplicada en la base local PostgreSQL 17.11. Se compararon los recuentos de negocios, trabajadores, membresías, turnos y solicitudes antes/después y se conservaron. También se verificó que los roles y estados de membresías existentes permanecieran iguales. No hay despliegues externos.

## Archivos modificados y componentes

Backend:
- `apps/api/businesses/models.py`
- `apps/api/businesses/serializers.py`
- `apps/api/businesses/services.py`
- `apps/api/businesses/permissions.py`
- `apps/api/businesses/views.py`
- `apps/api/businesses/directory_serializers.py`
- `apps/api/businesses/personnel_views.py` (nuevo)
- `apps/api/businesses/urls.py`
- `apps/api/businesses/migrations/0006_personnel_profiles.py` (nueva)
- `apps/api/businesses/test_personnel.py` (nuevo)
- `apps/api/businesses/test_planning.py` (restauración del esquema actual)
- `apps/api/businesses/test_browser.py` (fase aislada de personal)

Frontend:
- `apps/web/src/app/app/[businessId]/trabajadores/page.tsx`
- `apps/web/src/components/employee-form.tsx`
- `apps/web/src/components/employee-detail.tsx`
- `apps/web/src/components/employee-activity.tsx`
- `apps/web/src/components/employee-access.tsx` (EmployeeAccess, AccessEditor y EmployeeHistory nuevos)
- `apps/web/src/components/shifts/shift-calendar.tsx`
- `apps/web/src/lib/types.ts`
- `apps/web/src/lib/schemas.ts`
- `apps/web/src/lib/personnel.ts` y `personnel.test.ts` (nuevos)
- `apps/web/e2e/personnel.spec.ts` (nuevo)
- `apps/web/e2e/zenvik.spec.ts` (selector específico de menú al coexistir con el historial desplegable)

Informe: `docs/STAGE-10.md`.

## Pruebas y evidencia

Resultados finales:

| Comprobación | Resultado |
|---|---|
| Backend completo | **207 aprobadas**, 4 wrappers E2E ejecutados por separado (211 descubiertas), 67,552 s. |
| Vitest | **69 aprobadas**, 11 archivos. |
| TypeScript | Aprobado. |
| ESLint | Aprobado. |
| Build Next.js | Aprobado. |
| Migraciones | Sin diferencias pendientes detectadas por `makemigrations --check --dry-run`. |
| PostgreSQL | **17.11**, con migración y concurrencia probadas. |
| Playwright | **34 aprobadas**: 2 de personal, 1 de planificación, 29 recorridos generales y 2 Turnstile. Las cinco omitidas en la fase general se ejecutan en sus fases aisladas. |
| Runner Django E2E completo | **4 fases aprobadas**, 150,594 s. |

Se usan bases PostgreSQL temporales únicas y exclusivamente fixtures sintéticos. Las fases E2E separadas conservan los límites reales de autenticación; no se eliminan ni desactivan pruebas para conseguir resultados.

Comandos:

```powershell
# apps/api
.\.venv\Scripts\python.exe run_backend_tests.py
.\.venv\Scripts\python.exe run_browser_tests.py
.\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
# apps/web
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- --run
npm.cmd run build
```

Cobertura nueva: campos laborales, validaciones, códigos por negocio, cargos independientes de rol, privacidad de notas, filtros/catálogo, roles, cuentas extranjeras, protección de propietarios, suspensión por negocio, CSRF, edición obsoleta, conservación de turnos, aprobación tras cambio de cargo/rol, consultas eficientes, migración y concurrencia. Los recorridos existentes de búsqueda, errores, estados vacíos, teclado, registro/edición, trabajador, rechazo y multiempresa permanecen.

Capturas generadas y revisadas, exclusivamente sintéticas:
- [Perfil e historial — escritorio](../.artifacts/stage10/personnel-profile-desktop.png).
- [Directorio — escritorio](../.artifacts/stage10/personnel-directory-desktop.png).
- [Directorio — tablet](../.artifacts/stage10/personnel-directory-tablet.png).
- [Directorio — móvil](../.artifacts/stage10/personnel-directory-mobile.png).
- [Ficha propia sin notas administrativas — móvil](../.artifacts/stage10/personnel-worker-mobile.png).

Registros: `.artifacts/stage10-backend.log`, `.artifacts/stage10-e2e-final.log` y `.artifacts/stage10-visual.log`.

Fallos encontrados: el primer recorrido nuevo usó coincidencia exacta para una etiqueta que incluye también su explicación accesible. Se corrigió el selector de prueba para respetar el nombre accesible existente, sin cambiar permisos ni omitir el paso de desactivación. También se precisó el selector del menú de usuario de una prueba existente: al añadir el historial hay dos elementos summary en la ficha. Se conserva el recorrido completo de cierre de sesión. Tras corregir ambos selectores, la suite completa aprobó. La comprobación visual focalizada vuelve a ejecutar los dos recorridos de personal y espera la carga real del directorio antes de capturarlo.

## Seguridad, límites y pendientes

- Sin cambios de credenciales, contraseñas, tokens, sesiones/CSRF o límites de autenticación. No se registran secretos en logs.
- ADMIN no puede gestionar cuentas aunque manipule peticiones; cargos no conceden privilegios. OWNER tampoco puede promover a OWNER ni modificar propietarios por este flujo.
- Vinculación disponible para miembros existentes; no se implementa una invitación por correo ni búsqueda global de cuentas, al haberse elegido la alternativa de vinculación segura prevista en el prompt.
- Estado laboral administrativo activo/inactivo; no se inventan estados contractuales ni saldos legales. Jornada es descriptiva y no determina automáticamente límites de horas.
- Las revisiones conservan información personal autorizada. Antes de producción a gran escala, definir políticas de retención/archivo con revisión de privacidad.
- La revocación es efectiva en la siguiente petición; no se implementa borrado remoto instantáneo de vistas ya cargadas en un navegador.
- Validación de teclado, foco, responsive y movimiento reducido; no se afirma certificación integral de accesibilidad.
- Se mantiene America/Santiago, definida por el negocio y utilizada por el calendario. No se amplía a otras zonas en esta etapa.
- Sin Git, commits, push, despliegues, servicios pagos ni dependencias nuevas. No se borran datos reales.

## Checklist de aceptación

| # | Criterio | Estado |
|---|---|---|
| 1 | Directorio funcional | COMPLETADO Y VERIFICADO |
| 2 | Registro validado | COMPLETADO Y VERIFICADO |
| 3 | Ficha individual | COMPLETADO Y VERIFICADO |
| 4 | Edición y desactivación | COMPLETADO Y VERIFICADO |
| 5 | Cargos separados de roles | COMPLETADO Y VERIFICADO |
| 6 | Permisos de acceso | COMPLETADO Y VERIFICADO |
| 7 | Solicitudes de permisos | COMPLETADO Y VERIFICADO |
| 8 | Integración con turnos | COMPLETADO Y VERIFICADO |
| 9 | Responsive y accesibilidad | COMPLETADO Y VERIFICADO |
| 10 | Pruebas relevantes aprobadas | COMPLETADO Y VERIFICADO |
| 11 | Aislamiento multiempresa | COMPLETADO Y VERIFICADO |
| 12 | Preparación para asistencia futura | COMPLETADO Y VERIFICADO |

## Continuación a Etapa 11

**Sí: la aplicación está preparada para continuar a la Etapa 11. No se conoce un bloqueo funcional pendiente en el alcance de esta etapa tras la validación descrita.** La arquitectura conserva UUID estables, relación segura entre usuario/ficha/negocio, estados independientes, zona horaria, turnos programados y auditoría. Etapa 12 deberá crear registros de asistencia separados y compararlos con versiones de planificación, sin convertir turnos programados en marcaciones reales.
