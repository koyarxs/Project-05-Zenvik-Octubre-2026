# Asistencia: matriz normativa preliminar

Consulta de fuentes oficiales: 1 de noviembre de 2026. Esta evaluación identifica brechas de diseño y operación; **no acredita cumplimiento integral, certificación ni autorización**. Zenvik no debe presentarse como reloj control oficialmente autorizado.

## Fuentes verificadas

1. [Código del Trabajo, artículo 33 — consulta oficial DT](https://www.dt.gob.cl/portal/1626/w3-article-125866.html): deber de registro y mecanismo electrónico sujeto a regulación.
2. [Resolución Exenta 38, texto consolidado BCN](https://www.bcn.cl/leychile/navegar?idNorma=1203415). Se consultó también su [PDF consolidado](https://nuevo.leychile.cl/servicios/Consulta/Exportar?exportar_con_notas_al_pie=True&exportar_con_notas_bcn=True&exportar_con_notas_originales=True&exportar_formato=pdf&hddResultadoExportar=1203415.2025-04-25.0.0%23&nombrearchivo=Resolucion-38-EXENTA_09-MAY-2024&radioExportar=Normas), generado por BCN el 30-10-2026: identifica como última modificación la Resolución 9453, publicada el 25-04-2025. La modificación del sexto transitorio fijó el inicio de la obligación informativa del artículo 26 para el 26-09-2025. [Publicación oficial de la modificación](https://www.diariooficial.interior.gob.cl/publicaciones/2025/04/25/44133/01/2637353.pdf).
3. [ORD. 408 de 11-09-2026, DT](https://www.dt.gob.cl/legislacion/1624/w3-article-129729.html): aclara que geolocalizar una marcación no autoriza bloquearla por encontrarse fuera del lugar convenido. Las incidencias y revisión posterior son distintas de impedir el registro.
4. [ORD. 751 de 19-11-2025, DT](https://www.dt.gob.cl/legislacion/1624/w3-article-128566.html): distingue certificación externa y posterior examen de autorización por la DT.
5. [Ley 19.628, versión vigente hasta el 30-11-2026, BCN](https://www.bcn.cl/leychile/N?f=2023-05-09&i=141599) y [Ley 21.719, BCN](https://www.leychile.cl/leychile/Navegar/imprimir?idNorma=1209272&idParte=): la reforma entra en vigor el 01-12-2026. Debe revisarse la transición antes de operar más allá de esa fecha; no se trata anticipadamente el texto diferido como vigente al momento de esta revisión.

## Matriz

Las descripciones de implementación se sustentan en el código y las pruebas de esta entrega. «Parcial» significa que existe una base técnica, no que el requisito normativo esté satisfecho. Las referencias a artículos sirven para dirigir la revisión especializada.

| Requisito / referencia | Implementación existente | Brecha identificada | Acción necesaria | Verificación |
| --- | --- | --- | --- | --- |
| Registro autorizado; art. 33 y ORD. 751 | Flujo técnico local con sesión y cuatro eventos | Sin certificación externa ni resolución de autorización | Completar evaluación independiente y expediente; no comercializar como autorizado | Fuente verificada; brecha abierta |
| Comprobantes automáticos por correo e imprimibles; Res. 38, art. 12 | Comprobante inmediato en pantalla, consulta posterior y JSON descargable | No hay envío automático, cola de entrega ni versión preparada para impresión | Implementar outbox, plantilla imprimible, validación de destinatarios y prueba de entrega; sin enviar mensajes reales en esta etapa | Parcial |
| Contenido del comprobante; art. 13 | UUID, nombres conservados, evento, hora oficial, resultado geográfico y hash en JSON | Faltan identificación tributaria/personal y antecedentes laborales exigibles; nombre comercial no prueba razón social | Definir enrolamiento e información obligatoria con revisión de privacidad; no inventar campos ni documentos | Parcial |
| Integridad, confidencialidad y disponibilidad; arts. 14–16 | Transacciones, triggers de inmutabilidad, hashes encadenados, acceso propio y pruebas | Sin auditoría externa de infraestructura, cifrado de discos, recuperación de respaldos ni alta disponibilidad comprobada | Endurecer operación y verificar restauración, monitoreo e integridad de respaldos | Parcial |
| Información a la DT; art. 26 y sexto transitorio modificado | Sin integración administrativa de prestador | No hay reportes de clientes ni proceso de entrega | Diseñar el proceso aplicable al proveedor autorizado | Pendiente |
| Bloqueos y marcaciones excepcionales; arts. 36–39 | Excepción explícita por ubicación faltante; no se bloquea por geocerca, turno o permiso aprobado | Sesión vencida, acceso deshabilitado, ficha inactiva y transiciones inválidas requieren resolver incidencias fuera del flujo ordinario | Definir continuidad y regularización auditada sin debilitar autenticación ni fabricar eventos | Brecha crítica identificada |
| Correcciones y trazabilidad; art. 39 | Originales protegidos; identidad, secuencia, política y hash conservados | No hay solicitud/aceptación de correcciones ni notificaciones de cambios | Añadir registros vinculados de corrección con autor, causa, aprobación y comunicaciones, sin actualizar el original | Preparado, no implementado |
| Desconexión y sello temporal; arts. 9–11 | Hora de servidor; reintento idempotente si se pierde la respuesta | Sin captura offline persistente ni sello temporal de un evento ocurrido sin red | Diseñar el procedimiento excepcional y sus evidencias antes de afirmar funcionamiento offline | Pendiente |
| Alertas, reportes y fiscalización; art. 45 y proceso de autorización | Datos originales listos para reportes | No hay portal fiscalizador, alertas automáticas ni panel completo de supervisión | Diseñar Etapa 13 y completar revisión de alcance regulatorio | Pendiente |
| Geolocalización puntual y ausencia de bloqueo por distancia; art. 53 / ORD. 408 | Una lectura por confirmación; resultados INSIDE/OUTSIDE/UNCERTAIN/LOW_ACCURACY; excepción sin coordenadas | GPS del navegador puede ser falsificado; la incidencia no prueba incumplimiento laboral | Revisar proporcionalidad e información al trabajador; prohibir sanciones automáticas basadas solo en coordenadas | Conducta técnica probada; evaluación jurídica abierta |
| Protección de datos; Ley 19.628 | Mínima ubicación puntual, sin recorridos, sin coordenadas en respuestas ordinarias/logs; autorización de navegador | Permiso técnico no equivale por sí solo a una base jurídica suficiente; faltan instrumentos del responsable y atención de derechos | Definir responsables, finalidad, base de tratamiento, acceso excepcional y procedimientos de derechos | Parcial |
| Transición a Ley 21.719 | Arquitectura y política de conservación separadas del evento | No existe evaluación integral de la reforma ni programa de cumplimiento | Revisar obligaciones antes del 01-12-2026 y adaptar políticas/procesos | Fecha verificada; evaluación pendiente |

## Decisiones de diseño y conservación

- La política predeterminada no inventa sucursales ni coordenadas. Ubicación opcional y precisión deseada de 100 m; esta cifra es una decisión técnica configurable, no un umbral legal.
- `retention_days` guarda un plazo de **revisión de conservación** acordado por el negocio. Un valor nulo indica que no se ha configurado. No significa autorización para conservar indefinidamente. No existe un job que destruya automáticamente originales o coordenadas.
- Antes de uso real, el responsable debe fijar períodos aplicables, conservación por controversias, permisos de acceso, cifrado/respaldos y eliminación o anonimización auditada. La inmutabilidad actual protege originales pero necesita un mecanismo de disposición autorizado y documentado, distinto de editar o borrar silenciosamente.
- La API de esta etapa devuelve solo los registros del usuario autenticado, incluso para OWNER/ADMIN. Estos roles pueden configurar zonas y política, pero no consultar GPS ajeno mediante estos endpoints. El panel de supervisión requerirá permisos específicos y auditoría de consultas.
- No se registran IP, huella de dispositivo ni recorridos en eventos. Se conserva únicamente la ubicación puntual, precisión, estado declarado por el cliente, resultado calculado en servidor y explicación de excepción cuando existe.
- Los comprobantes actuales son técnicos. Ni el UUID ni el hash propio sustituyen una certificación, sello de tiempo independiente o validación normativa integral.

## Prioridades antes de un uso oficial

1. Resolver las brechas críticas de continuidad, enrolamiento, comprobantes y correcciones.
2. Implementar supervisión con acceso mínimo y auditoría; validar reportes con especialistas.
3. Aprobar políticas de privacidad y conservación, incluida la transición normativa.
4. Comprobar infraestructura, respaldos, disponibilidad, vulnerabilidades y hora del servidor.
5. Obtener certificación independiente y autorización formal por los procedimientos aplicables.

La investigación fue dirigida a las materias solicitadas y las fuentes identificadas. No constituye una revisión exhaustiva de cada obligación de la resolución ni asesoría jurídica para un empleador concreto.
