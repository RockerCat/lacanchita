# CLAUDE.md — La Canchita

**Estado:** Documento vivo de decisiones del producto  
**Actualizado:** 2026-11-01 (navegación por rol y continuidad del torneo; landing dinámica con torneo destacado; landing pública, login/registro en modales y recuperación de contraseña; Fase 3.4: Copa, mejores terceros, cuadro, progresión y podio de torneos nuevos; operación de partidos en Control como en La Penúltima; Fase 3.3: experiencia del jugador recuperada; Fase 3.2: ciclo de partidos y marcador en vivo como La Penúltima; Fase 3.1: motor de pronósticos, puntuación y clasificación; QA de Control: confirmación verificada, escudos, jornada/grupo; ajustes de Control: torneos por importación, URLs con slug, resultados pendientes privados; Auth migrado + historial del Mundial 2026 + diseño y temas + saneamiento monetario + gestión de parches e invitaciones + superadministración y La Canchita Control)  
**Repositorio destino:** `RockerCat/lacanchita`  
**Referencia histórica (solo lectura salvo autorización):** `RockerCat/el-var`

Este documento separa cinco tipos de contenido. No mezclarlos:

1. **Decisiones aprobadas** (sección 2): reglas vigentes.
2. **Comportamiento verificado del sistema original** (sección 3): hechos comprobados en código, migraciones o el dump.
3. **Estado y resultados de pruebas de la migración de Auth** (sección 4).
4. **Modelo implementado, migraciones y aplicación** (sección 5): lo que existe, cómo se verificó y qué está aplicado en Supabase.
5. **Propuestas pendientes de aprobación** (sección 7): recomendaciones, no requisitos.
6. **Riesgos y preguntas abiertas** (sección 8).

## 1. Propósito y alcance

La Canchita es la evolución de La Penúltima hacia una plataforma social de pronósticos de fútbol reutilizable para múltiples eventos y grupos privados llamados **parches**. No es una simple copia de la aplicación del Mundial 2026. Priorizar claridad, facilidad de uso y sostenibilidad operativa.

## 2. Decisiones aprobadas

### 2.1 Eventos, parches y pronósticos

- La plataforma debe soportar múltiples eventos o competiciones a lo largo del tiempo.
- Los usuarios pueden pertenecer a varios parches.
- Un mismo usuario puede registrar **pronósticos diferentes para el mismo partido en parches distintos**. No imponer unicidad global por usuario/partido; el contexto del parche es parte de la identidad del pronóstico.
- La pertenencia a un parche y la cuenta del usuario sobreviven al cierre de un evento.
- No inventar posiciones, puntos, estadísticas ni premios; distinguir cero real, desconocido, no aplica y sin clasificación.
- No bloquear la operación futura con restricciones que no respondan a seguridad, integridad o reglas reales del producto.

### 2.2 Cierre definitivo y retención

- Un evento puede cerrarse definitivamente de forma **manual por el superadministrador** (incluso antes del plazo automático) o **automática 30 días después de su finalización oficial**.
- Antes de cerrar: verificar que los resultados y clasificaciones sean definitivos y que no haya revisiones pendientes. No ejecutar una purga parcial ante errores.
- El cierre debe consolidar primero los resultados, verificar la integridad de la consolidación y **solo después** purgar los pronósticos individuales y los datos operativos temporales que ya no se necesiten.
- El cierre debe ser idempotente, auditable y seguro ante interrupciones o ejecuciones repetidas.
- Tras el cierre, conservar una **fotografía histórica inmutable de la tabla de clasificación final COMPLETA por evento y por parche**, no únicamente el podio.
- Conservar para **todos** los participantes (incluidos quienes tengan cero puntos): identidad/referencia de usuario, nombre histórico legible, posición, puntos, estadísticas que sustentan la clasificación, empates y criterios de desempate aplicados.
- Conservar metadatos del evento, su parche, fechas y cierre y ganadores, así como resultados globales relevantes del evento (por ejemplo campeón y subcampeón cuando aplique). Sin premios monetarios (2.4; cambio del 2026-10-29).
- El historial debe poder consultarse sin depender de los pronósticos ya eliminados. Evitar recálculos desde registros purgados.
- El cierre no elimina usuarios, parches, membresías ni las clasificaciones históricas.
- No retener indefinidamente pronósticos partido por partido de eventos cerrados.

### 2.3 Migración desde La Penúltima

- Conservar cuentas existentes, identificadores y, en lo posible, las contraseñas actuales sin obligar a registrarse de nuevo; **validar técnicamente la migración de Supabase Auth antes de prometer continuidad de contraseñas**.
- Conservar membresías y accesos a parches, puntos, clasificaciones completas y resultados históricos (los premios monetarios se retiraron por la decisión 2.4).
- Para el Mundial 2026, **migrar el resultado histórico consolidado, no los 1.286 pronósticos individuales**, siempre que se verifique la integridad de los resultados históricos.
- Comprobar los datos reales antes de fijar cantidades de usuarios, parches o participantes.
- No alterar la base de datos original durante la auditoría y preparación. No eliminar ni pausar `el-var` hasta verificar la migración y la nueva aplicación.
- Mantener el repositorio original como referencia histórica independiente.
- No importar las 89 noticias antiguas salvo dependencia imprescindible y verificada (no la hubo). El sistema de noticias se recuperó para torneos nuevos en 5.21.

### 2.4 Sin monetización (decisión definitiva, 2026-10-29)

- La Canchita es una experiencia recreativa de pronósticos basada en puntos, posiciones y competencia entre amigos.
- No gestiona apuestas, cuotas, bolsas, cobros por participar, premios monetarios, pagos a ganadores, ganancias, saldos ni retiros. No sustituir el dinero por premios ficticios.
- La interfaz no muestra montos ni premios; las funcionalidades nuevas no pueden depender de datos monetarios.
- Los datos monetarios heredados de La Penúltima se retiraron el 2026-10-29 con autorización expresa, sin alterar el historial deportivo (sección 5.10).
- El respaldo original de La Penúltima permanece intacto como archivo histórico (incluye sus datos monetarios).

### 2.5 Apariencia

- La Penúltima es la referencia visual principal de La Canchita. El modo oscuro es el predeterminado y el más fiel al original; el modo claro conserva la misma identidad.
- Logos oficiales (no modificar): `public/branding/LaCanchita_hor.png` (horizontal, fondo transparente, header en modo oscuro), `public/branding/LaCanchita_whitebg_hor.png` (horizontal, fondo blanco, header en modo claro) y `public/branding/LaCanchita.png` (cuadrado, login e iconos). No redibujarlos ni sustituirlos por CSS, SVG, texto o imágenes generadas.

### 2.6 Parches y participantes (aprobado 2026-10-29)

- Cualquier usuario autenticado puede crear un parche (solo nombre) y queda como **creador** (rol `owner`) y administrador; la creación y su membresía son atómicas.
- Un usuario puede pertenecer a varios parches; un parche puede participar en varios torneos y varios parches en el mismo torneo.
- Solo administran (invitar, deshabilitar o reactivar) quienes tienen rol `owner`/`admin` y membresía activa. Un miembro normal no puede hacerse administrador.
- El creador no puede salir, ser deshabilitado ni perder su rol: el parche nunca queda sin una vía de administración.
- Salir de un parche o ser deshabilitado nunca borra la cuenta ni el historial.
- Invitaciones por enlace compartible (WhatsApp o cualquier medio), seguro, con vencimiento y revocable. Sin SMTP propio ni API de WhatsApp. No se cambia la configuración de Auth (la confirmación de correo sigue activa).
- La Penúltima conserva sus 18 membresías y estados; solo cambian por acciones explícitas y trazadas.

### 2.7 Superadministración y torneos globales (aprobado 2026-10-30)

- Solo los **superadministradores globales** crean y administran torneos, fases, equipos, partidos y resultados. El rol global es independiente de `parche_members`: ser `owner` o `admin` de un parche nunca concede privilegios globales. El superadministrador participa normalmente en parches.
- El catálogo de torneos es global; cada torneo tiene sus fases, equipos, calendario y resultados. Los owner/admin activos de un parche **incorporan torneos publicados** a su parche; los participantes normales no.
- Los torneos en borrador solo los ve un superadministrador.
- **(Reemplazada el 2026-10-31 por el comportamiento original de La Penúltima, sección 5.16: el marcador se guarda directo en `matches` y es público al instante; «Finalizado» es el cierre.)** Regla anterior: registrar un marcador no lo hace oficial. Flujo: el superadministrador registra el marcador (queda **pendiente**), lo revisa y lo **confirma** explícitamente (**oficial**). Un resultado oficial solo se cambia con una **corrección** que exige motivo y queda auditada. Las horas se guardan en UTC y se capturan/muestran en la zona horaria del torneo.
- **Regla operativa (2026-10-30):** los torneos se preparan mediante **importaciones verificadas con asistencia de ChatGPT y Claude Code** (fuentes oficiales o confiables; cada importación es reproducible y se ejecuta solo con autorización). **La Canchita Control se usa para administrar los torneos ya cargados y mantenerlos actualizados**, no para construirlos a mano: la consola no tiene formularios de creación de torneos ni de fases.
- Un marcador pendiente es información administrativa: solo el superadministrador puede consultarlo. Los usuarios normales reciben únicamente resultados oficiales confirmados (sección 5.13).
- Fuera de alcance por ahora: pantallas del jugador (el motor ya existe: 5.15), automatización de resultados, notificaciones y cierre definitivo (secciones 5.12 y 7).

## 3. Comportamiento verificado del sistema original (auditoría 2026-10-29)

Fuentes: código y migraciones de `Projects/el-var` (commit `d911b64`, 2026-07-19), esquema y datos del dump leídos con `pg_restore` hacia archivos/streams locales, **sin restaurar en ninguna base**. Solo se extrajeron agregados; ningún dato personal ni hash.

### 3.1 Infraestructura

- Repositorio original: `https://github.com/RockerCat/el-var.git`, carpeta local `Projects/el-var`. Repositorio nuevo: `RockerCat/lacanchita`, `Projects/laCanchita`.
- **Supabase ORIGEN (prohibido modificar):** `el-var`, ref `mzzszpoiaxmudsoxghvq`, org RockerCat, West US (Oregon), Postgres 17.6.1.155, activo al 2026-10-29.
- **Supabase DESTINO:** `lacanchita`, ref `cfzxentitxytnvvumfpv`, org AlexSosa-Gamestudios, East US (N. Virginia), Postgres 17.11.0.003, Auth (GoTrue) v2.197.0. `Projects/laCanchita` está vinculado (`supabase link`) solo a este ref; no vincular el-var. Usar siempre `npx supabase db query --linked`.
- La cuenta CLI (RockerCat) también ve SpaceShip, AlexAgent (pausado, cron de Vercel desactivado) y techtivo-pollita (inactivo). No alterar ninguno desde el trabajo de La Canchita.
- Respaldo: `~/Backups/la-penultima/el-var-2026-10-29.dump` (custom format, gzip, PG 17.6 → pg_dump 17.11, 537 entradas TOC). SHA-256 re-verificado: `cef1ce449d98faed8dcf0ee109b7f877d11ccd42b6e984b9fee6940000366703`. Es un `pg_dump` crudo: incluye esquemas internos de Supabase (`auth`, `storage`, `realtime`, `vault`). `vault.secrets` y `storage.objects` tienen 0 filas. **Aún no se ha probado una restauración funcional.**
- `docs/legacy/LA_PENULTIMA.md` y `docs/legacy/LA_PENULTIMA_PROJECT_STATUS.md` son copias idénticas de `el-var/CLAUDE.md` y `el-var/PROJECT_STATUS.md`.
- Stack original: Next.js 16.2 (App Router, Server Actions), React 19, Tailwind v4, Supabase (Auth + Postgres + RPC `SECURITY DEFINER`), Vitest, Vercel.
- Las migraciones se aplicaron manualmente (SQL Editor): no existe `supabase_migrations` en el dump. Hay deriva entre `supabase/migrations/` y producción (ver 3.6).

### 3.2 Datos reales en el dump

| Tabla | Filas | Observación |
|---|---|---|
| `auth.users` | 18 | 18 hashes bcrypt, 18 emails confirmados, 0 SSO/anónimos/borrados/baneados, 18 con `username` en `raw_user_meta_data` |
| `auth.identities` | 18 | Todas `provider = email`; ningún usuario sin identidad |
| `auth.sessions` / `refresh_tokens` | 50 / 1.492 | Operativos; no migrar |
| `public.groups` | 1 | Único parche; `entry_fee` 20.000, 70/30, `payment_key` vacío |
| `public.group_members` | 18 | = 13 participantes clasificados + 4 deshabilitados + 1 administrador |
| `public.user_profiles` | 4 | Los 4 deshabilitados; ninguno tiene pronósticos |
| `public.admin_users` | 1 | Es miembro del grupo; no pronostica |
| `public.matches` | 104 | Todos `finished` con marcador; 72 de grupos + 32 eliminatorias |
| `public.predictions` | 1.286 | De 13 usuarios |
| `public.teams` / `news` | 48 / 89 | |
| `admin_activity_log` / `admin_match_audit` | **0 / 0** | No hay rastro de auditoría en producción |

### 3.3 Integridad del Mundial 2026 (recalculado fuera de la base)

- Los puntos almacenados de los 1.286 pronósticos coinciden al 100 % con el recálculo desde marcadores (0 discrepancias de puntos y de `points_reason`); ningún pronóstico finalizado sin `scored_at`.
- Ningún pronóstico fue creado ni actualizado en o después del inicio de su partido.
- Clasificación recalculada: 13 participantes, sin posiciones compartidas; los dos empates a puntos (116 y 106) se resuelven por marcadores exactos. Diferencia 1.º–2.º: 124 vs 123.
- Premio informativo derivado: 13 jugadores activos × 20.000 = 260.000 COP → 1.º 182.000, 2.º 78.000 (sin reparto por empate).
- **Las 32 eliminatorias no tienen `home_team_id`/`away_team_id` en la base**: los equipos se derivan en TypeScript (`src/lib/enrich.ts`, `classification.ts`, `best-third-matrix.ts`) a partir de la fase de grupos y `winner_side`. Campeón y subcampeón **no están almacenados**; deben derivarse y verificarse antes de migrar. Las 4 eliminatorias empatadas tienen `winner_side`.

### 3.4 Reglas efectivas (código + producción)

- Puntos por fase (función viva `calculate_match_points`): grupos 3/1, 16avos 4/2, octavos 5/3, cuartos 6/4, semis 7/5, **tercer puesto 7/5**, final 8/6. Exacto no suma resultado. Penales no cuentan.
- Clasificación (`get_group_leaderboard`): suma de `predictions.points` del usuario; `RANK()` por puntos, luego exactos, luego aciertos de resultado; empates comparten posición; orden visual secundario por nombre. Excluye administradores y deshabilitados.
- Nombre mostrado: `raw_user_meta_data->>'username'` o prefijo del email. No hay tabla de nombres.
- Premios: `entry_fee × get_active_player_count` (excluye admins y deshabilitados); empate en 1.º reparte 1.º+2.º; empate en 2.º reparte el 2.º (`src/lib/groups.ts`, `computePrizePool`/`computeProjectedPrizes`).
- Pronósticos: `UNIQUE(match_id, user_id)` global; cierre en servidor por `status='scheduled' AND NOW() < starts_at` (`save_prediction_for_user`, migraciones 009/028).
- Dependencias del Mundial: `stage` texto fijo (`src/lib/matches.ts`), `match_number` UNIQUE global, `matches_fixture_unique (home_team_id, away_team_id, starts_at)`, `teams.code` UNIQUE global, matriz de mejores terceros y llaves M73–M104.
- Un solo grupo efectivo: las páginas usan `groups[0]` y `joinGroupAction` corta si el usuario ya pertenece a cualquier grupo (`src/app/actions/groups.ts`).

### 3.5 Defectos verificados en código

- `get_match_detail_predictions` (migración 044) no valida el inicio del partido: la privacidad pre-partido solo la aplica la página.
- Volver un partido de `finished` a otro estado no reinicia puntos (`update_match_result`, migración 037).
- `recalculate_all_scores` ignora errores (`EXCEPTION WHEN OTHERS THEN NULL`, migración 027).
- La auditoría se escribe sin `await` y fuera de transacción (`src/app/actions/admin.ts`); coherente con las 0 filas observadas (causa probable, no demostrada).
- `winner_side` se guarda en un RPC separado del resultado.

### 3.6 Inconsistencias documentación ↔ código ↔ producción

- La documentación y la migración 049 dicen tercer puesto 8/6; **producción tiene 7/5** (la 049 no se aplicó). Sin impacto: los 11 pronósticos del tercer puesto tienen 0 puntos con ambas reglas.
- "Audit history: Complete" en la documentación, pero los registros de auditoría están vacíos.
- `diagnose_auth_context` (migración 003) no existe en producción.
- `README.md` original menciona Next.js 15 y la marca "El VAR".

## 4. Migración de Supabase Auth — estado (2026-10-29)

**Estado: COMPLETADA (2026-10-29).** 18 usuarios y 18 identidades email migrados al proyecto `lacanchita` (`cfzxentitxytnvvumfpv`) con UUID, emails, estado de confirmación y hashes bcrypt originales. Una cuenta real inició sesión con su contraseña original de La Penúltima. El proyecto `el-var` quedó intacto. No se migraron sesiones: todos los usuarios deberán iniciar sesión nuevamente cuando La Canchita esté disponible.

Alcance de la evidencia (no confundir):

- **Verificación estructural — 18/18 usuarios:** conteos, relaciones y huellas SHA-256 idénticas al origen (sección 4.3). Demuestra que los datos son iguales, no que cada contraseña haya sido probada.
- **Prueba real de autenticación — 1 cuenta:** sección 4.4. **No se probaron individualmente las 18 contraseñas.**
- **Validaciones pendientes para producción:** sección 4.5.

### 4.1 Hechos verificados antes de escribir

- Destino vacío: 0 usuarios, 0 identidades, 0 sesiones, 0 tablas en `public`, 0 triggers propios en `auth`.
- Esquema Auth compatible: misma versión de migraciones Auth en origen y destino (`20260831180000`); mismas columnas en `auth.users` (34 + `confirmed_at` generada) y `auth.identities` (8 + `email` generada); mismas restricciones (PK, `UNIQUE(provider_id, provider)`, FK `identities.user_id → users.id ON DELETE CASCADE`, email único parcial, unicidad de tokens no vacíos).
- Origen (dump): 18 usuarios, 18 identidades `email` 1:1, `provider_id = identity_data.sub = user_id`, `instance_id` = UUID nulo, `aud/role = authenticated`, 18 bcrypt, 18 confirmados, sin teléfono/SSO/anónimos/borrados.
- El rol de consulta (`postgres` vía Management API) tiene `INSERT` en ambas tablas; no fue necesario tocar componentes internos.

### 4.2 Procedimiento ejecutado

1. `scripts/auth-migration/prepare_auth_import.py` lee solo `auth.users`/`auth.identities` del dump (`pg_restore -a`), valida, y escribe fuera del repo un SQL transaccional y `manifest.json` (conteos y huellas SHA-256, sin datos personales).
   - Inserta solo columnas no generadas, valores literales sin transformar (hashes intactos).
   - **Única transformación:** los 5 campos de tokens de un solo uso se importan vacíos. Había 2 `recovery_token` pendientes (recuperaciones antiguas) que no se trasladan.
   - Guardas dentro de la transacción: aborta si el destino no está vacío (`destino_no_vacio`) o si conteos/huella de hashes no coinciden al final.
2. Ensayo aislado en un Postgres local desechable (DDL de las dos tablas tomada del dump): versión ROLLBACK sin efectos, importación con huellas idénticas, segunda ejecución bloqueada por la guarda. Clúster destruido tras el ensayo.
3. Ensayo con ROLLBACK en el destino (se comprobó que las excepciones sí se propagan por `db query`); destino seguía en 0.
4. Importación real: `npx supabase db query --linked -f <privado>/auth_import.sql` (una transacción).
5. SQL privado eliminado tras verificar; solo se conserva `manifest.json` (sin emails ni hashes) en el scratchpad de la sesión.

### 4.3 Resultado verificado en el destino

- 18 usuarios (18 UUID distintos), 18 identidades `email`, 0 huérfanas, 0 usuarios sin identidad, 0 desajustes `sub`/`provider_id`.
- Huellas idénticas al origen: UUID `a19e40b8…`, hashes `eaa65325…`, email + `email_confirmed_at` `0c10dcea…`, identidades `92444f29…`.
- 18 confirmados, 18 bcrypt, 0 tokens pendientes, 0 sesiones/refresh tokens, 0 tablas `public` (nada histórico importado), ningún usuario creado por registro nuevo.
- El origen no se consultó ni se modificó: todos los comandos usaron `--linked` (ref `cfzxentitxytnvvumfpv`); el dump conserva su SHA-256.

### 4.4 Prueba real de login (exitosa, 1 cuenta)

- Herramienta: `scripts/auth-migration/login_test_server.py` (formulario solo en `127.0.0.1:8765`; credenciales enviadas únicamente a `https://cfzxentitxytnvvumfpv.supabase.co/auth/v1/token`; sin registro de peticiones; revoca la sesión de prueba; guarda solo el resultado). Ensayo previo con cuenta inexistente → `invalid_credentials`.
- Ejecución: Alex, con su email y contraseña originales de La Penúltima, el 2026-10-29 17:27:26 UTC.
- Resultado (leído de `login_result.json` y coincidente con lo reportado por Alex): `project_ref: cfzxentitxytnvvumfpv`, `attempt: 2`, `http_status: 200`, `login_ok: true`, `uuid_original: true` (el UUID autenticado está entre los 18 originales), `token_sub_matches_user: true`, `issuer_is_lacanchita: true`, `provider: email`, `test_session_revoked: true`.
- El servidor de prueba quedó detenido (sin proceso; puerto 8765 libre). Para nuevas pruebas, `manifest.json` puede regenerarse con `prepare_auth_import.py` (vuelve a crear SQL privado que debe borrarse; nunca ejecutarlo de nuevo).

### 4.5 Configuración de Auth del destino y validaciones pendientes para producción (observada, sin cambios)

- Proveedores: solo email. `disable_signup: false` (registro abierto). `mailer_autoconfirm: false` (los registros nuevos requieren confirmar email; en el original la confirmación estaba desactivada, `el-var/src/components/auth/SignupForm.tsx:80`). Los migrados ya están confirmados.
- Pendiente antes de producción (no inventar valores): Site URL y Redirect URLs definitivos; SMTP propio (el integrado de Supabase tiene límites bajos) y plantillas en español; política de registro (abierto, por invitación o cerrado hasta el lanzamiento); comportamiento de la confirmación de email; no enviar correos masivos a los migrados (no usar "invite"/"reset" en lote).
- Probar el flujo de recuperación de contraseña de punta a punta en el destino (requiere SMTP y URLs definitivos).
- Login de la app real de La Canchita contra este proyecto (la prueba usó la API de Auth directamente) y comunicación a los usuarios de que deben iniciar sesión de nuevo con su misma contraseña.

### 4.6 Siguiente etapa

Completada: ver sección 5 (modelo multitorneo y migración histórica del Mundial 2026).

## 5. Modelo implementado y migración histórica (2026-10-29)

**Estado: COMPLETADA en el destino `lacanchita` (`cfzxentitxytnvvumfpv`).** Esquema aplicado, historial del Mundial 2026 importado como **corte histórico sellado** (no como cierre oficial), verificado contra el respaldo. Origen `el-var` (`mzzszpoiaxmudsoxghvq`) no consultado ni modificado; fuente única: el respaldo (SHA-256 re-verificado).

### 5.1 Migraciones aplicadas (`supabase db push --linked`, registradas en `supabase_migrations`)

| Versión | Archivo | Contenido |
|---|---|---|
| 20261029200000 | `modelo_multitorneo.sql` | Datos deportivos, parches, membresías, pronósticos, RLS, helpers `private.*` |
| 20261029200100 | `historial_y_cierre.sql` | Fotografías de clasificación, filas, cierres, importaciones, triggers de inmutabilidad |
| 20261029200200 | `indices_fk.sql` | Índices de soporte de FK (linter de Supabase) |
| 20261029210000 | `revocar_execute_rls_auto_enable.sql` | Revoca EXECUTE de `public.rls_auto_enable()` a PUBLIC y roles de la API (sección 5.7) |
| 20261029220000 | `bloquear_datos_monetarios.sql` | Sin lectura cliente de columnas monetarias y sin valores monetarios nuevos (sección 5.8); no borra datos |
| 20261029230000 | `saneamiento_monetario.sql` | Reemplaza la fotografía v1 por la v2 sin dinero y elimina las 6 columnas monetarias (sección 5.10). Ejecutada con `db query` en una transacción y registrada con `migration repair` |
| 20261029240000 | `gestion_parches.sql` | Creación de parches, participantes, roles, salida, invitaciones y auditoría (sección 5.11) |

Antes de aplicar: ensayo en Postgres local con `scripts/history-migration/local_supabase_stub.sql` y ensayo con ROLLBACK en el destino. No se tocó `auth.*`; no hubo operaciones destructivas.

### 5.2 Modelo de datos (14 tablas iniciales en `public`; hoy 17 con `parche_invitations`, `parche_member_events` y `control_audit_log`, todas con RLS, más `private.platform_admins`)

- **Deportivo (global, un partido existe una vez):** `events` (estado `draft…finished/closed`, `official_end_at` para el plazo de 30 días, `closed_at`), `event_stages` (puntos exacto/resultado por fase; el exacto no suma resultado), `teams` (reutilizables; `code` no único global), `event_teams` (grupo por evento), `matches` (FK compuestas que obligan a que fase y equipos pertenezcan al mismo evento; `teams_source` `assigned`/`derived_legacy_logic`; `winner_side`; `result_confirmed_at` como precondición futura del cierre), `event_results` (campeón, subcampeón, tercero, cuarto, con partido fuente).
- **Tenencia:** `parches`, `parche_members` (PK `(parche_id, user_id)`, rol `owner/admin/member`, estado `active/disabled`), `parche_events` (participación de un parche en un evento; visibilidad de pronósticos `after_kickoff`/`after_finish`; cuota, moneda y reparto informativo).
- **Pronósticos:** `predictions` con `UNIQUE(parche_event_id, match_id, user_id)` (sin unicidad global usuario/partido) y FK compuestas `(parche_event_id, event_id)` y `(match_id, event_id)`.
- **Historial:** `standing_snapshots` (`kind` `final_close` | `historical_cut`, versión, reglas de puntuación y de orden aplicadas, `prize_info` con base de evidencia, conteos, `rows_checksum`, `sealed_at`; una sola `final_close` por parche_event) y `standing_snapshot_rows` (nombre al cierre, rol y estado de membresía, `participation` `ranked`/`unranked` + `unranked_reason`, posición y empate, `stats_status` `verified`/`unknown`/`not_applicable`, puntos, exactos, resultados, fallos, pronósticos, valores de desempate, `prize_status` `calculated`/`paid`/`none`/`unknown`/`not_applicable` y monto). Los CHECK impiden posiciones en no clasificados, cifras con estadística desconocida y premios sin monto coherente.
- **Cierre y trazabilidad:** `event_close_runs` (máquina de estados `pending → consolidated → verified → purged → closed`, o `failed`/`cancelled`; empieza siempre en `pending`; un solo cierre activo por evento; `purged`/`closed` exigen `backup_ref`). `data_imports` (`source_key` único: impide repetir una importación).
- **Inmutabilidad:** una fotografía sellada no admite cambios ni borrado de filas, ni siquiera del backend; al sellar se exige que conteos y huella coincidan. Única excepción: `ON DELETE SET NULL` de `user_id` si se elimina la cuenta (la fila y el nombre histórico se conservan; `private.verify_standing_snapshot` detectará entonces el cambio). Un evento `closed` congela sus partidos y no admite pronósticos nuevos ni cambios (borrarlos sí, para la purga futura).
- **No implementado (intencionalmente):** proceso de cierre/purga y su programación y perfiles de usuario (la creación de parches/invitaciones y la superadministración se implementaron después: secciones 5.11 y 5.12).

### 5.3 Seguridad

- `anon`: sin privilegios en `public`. `authenticated`: solo `SELECT`, salvo `predictions` (`INSERT` de columnas de pronóstico, `UPDATE (home_score, away_score)`, `DELETE`); nunca puede escribir `points/points_reason/scored_at`, `user_id` ajeno, parches, membresías, partidos ni historial. `service_role`: CRUD (respetando los triggers de inmutabilidad).
- Lectura: datos deportivos para cualquier autenticado; parches, membresías, parche_events e historial solo para miembros (incluidos deshabilitados, solo lectura); historial solo si está sellado. Pronósticos: propios siempre; ajenos del mismo parche solo tras el inicio (o el final) según `predictions_visibility`.
- Escritura de pronósticos: miembro **activo**, `parche_event` activo, evento `scheduled/in_progress`, partido `scheduled` y `now() < starts_at`, `user_id = auth.uid()`.
- Helpers `SECURITY DEFINER` en el esquema `private` (no expuesto por la API) con `search_path` vacío; evitan recursión de RLS. `event_close_runs` y `data_imports` sin políticas para clientes (aviso INFO esperado del linter).

### 5.4 Datos históricos importados (Mundial 2026)

Script: `scripts/history-migration/prepare_wc2026_import.py` (genera SQL privado fuera del repo; transacción única con guardas `destino_inesperado`, `ya_importado`, `conflicto_datos_existentes`, `faltan_usuarios_auth`, verificación final de conteos, huella de la clasificación y huella de `auth.users`). Los equipos de eliminatoria se derivan con `resolve_knockout.mjs`, que ejecuta la lógica original (`el-var/src/lib/enrich.ts`, `classification.ts`, `best-third-matrix.ts`) copiada a un temporal con Node 22.

| Entidad | Filas | Identificadores |
|---|---|---|
| `events` | 1 (`mundial-2026`, "Copa Mundial de la FIFA 2026", `finished`) | `daaebb9b-8e92-5644-824f-bf826114446a` (UUIDv5 determinista) |
| `event_stages` | 7 (puntuación efectiva de producción: grupos 3/1 … semis 7/5, tercer puesto 7/5, final 8/6) | UUIDv5 |
| `teams` / `event_teams` | 48 / 48 (con grupo A–L) | id original |
| `matches` | 104 (72 grupos con equipos almacenados + 32 eliminatorias derivadas), todos `finished` | id original |
| `event_results` | 4: campeón España, subcampeón Argentina, tercero Inglaterra, cuarto Francia | — |
| `parches` | 1 ("La Penúltima", `created_by` = dueño original) | `91ad5d8d-414c-4e74-bf57-2ca476652de0` (original) |
| `parche_members` | 18 (1 `owner` = administrador original, 17 `member`; 4 `disabled` con fecha) | id original de `group_members` |
| `parche_events` | 1 (`finished`, `after_kickoff`; la cuota y el reparto importados se eliminaron en el saneamiento) | `5ebf064c-61a5-5f34-a6f7-e620919009bc` |
| `standing_snapshots` | 1 (`historical_cut`, `legacy_import`, sellada). Se importó como v1 `3112d842…`; **hoy es la v2** `5aeb192e-01fd-55cb-b436-602f2fcce5ff`, sin dinero (sección 5.10) | — |
| `standing_snapshot_rows` | 18 (13 clasificados + 4 `disabled` + 1 `platform_admin`) | v1: `017e0c18…` (con campos de premio); v2 vigente: `5185504b…` (solo deportiva) |
| `predictions` | **0** (los 1.286 solo se analizaron en memoria) | — |
| `data_imports` | 1 (`la-penultima:mundial-2026:v1`, SHA del respaldo) | — |

No importado: 1.286 pronósticos, 89 noticias, sesiones, `invite_code` y `payment_key` del grupo (vacío), `user_profiles`/`admin_users` como tablas (su efecto quedó en rol/estado de membresía y en `unranked_reason`).

Clasificación (orden `points desc, exact desc, result desc`, RANK; sin posiciones compartidas): 124, 123, 121, 120, 116, 116, 108, 106, 106, 101, 94, 88, 75 puntos; empates a 116 y 106 resueltos por exactos. Los 5 no clasificados tienen cero real verificado (0 pronósticos), sin posición.

Premios: la importación original guardó una bolsa informativa calculada (sin evidencia de pagos). **Se eliminó por completo de Supabase** el 2026-10-29 (sección 5.10); solo permanece en el respaldo original.

`data_cutoff_at` = último `scored_at` del respaldo (2026-07-19 22:03:30 UTC). `official_end_at` y `result_confirmed_at` quedan NULL (sin fuente oficial ni confirmación explícita registrada).

### 5.5 Verificación (2026-10-29)

- `verify_wc2026_import.py` (destino vs respaldo, recálculo independiente desde marcadores): **36/36**. Incluye Auth intacto (18/18, huellas `a19e40b8`, `eaa65325`, `0c10dcea`, `92444f29`), 18 membresías con id/rol/estado originales, 48 equipos y 104 partidos sin discrepancias, puntuación por fase, orden y estadísticas idénticas al recálculo, puntos = suma de los almacenados, fotografía sellada con huella válida (tras el saneamiento: v2 y ninguna columna monetaria), 24 FK validadas, RLS en 14 tablas, `anon` sin privilegios, 0 pronósticos, sin duplicados.
- Coherencia del cuadro derivado (en el script de preparación): 32/32 eliminatorias con equipos y ganador; cada "Winner/Loser Mxx", "Winner/Runner-up Group X" y "Best 3rd (…)" corresponde; equipos distintos por ronda; dieciseisavos = 24 primeros/segundos + 8 mejores terceros; **ninguna** decisión dependió del desempate alfabético técnico.
- `tests/local_functional_test.sql` (Postgres local, datos ficticios, ROLLBACK): **57/57**. Usuario en dos parches, dos parches en el mismo evento, pronósticos distintos del mismo partido en cada parche, sin duplicados, sin escritura de puntos/`user_id`, sin pronósticos tras el inicio, invisibilidad previa al inicio y entre parches, deshabilitado sin escritura, historial inmutable incluso para el backend, sellado con huella incorrecta rechazado, CHECK de valores inventados, transiciones de cierre, evento cerrado congelado.
- `tests/remote_rls_readonly_test.sql` (destino real, solo lectura, ROLLBACK, identidades simuladas sin tocar `auth`): **19/19**.
- Reintento real de la importación en el destino → `ya_importado`, sin cambios.
- `supabase db advisors`: sin avisos de seguridad propios. Persisten dos ajenos a esta etapa: `public.rls_auto_enable()` (función `SECURITY DEFINER` preexistente de Supabase, ejecutable por anon/authenticated) y "Leaked Password Protection Disabled" (configuración de Auth; no autorizada en esta tarea).

### 5.6 Procedimiento reproducible

```
python3 -I scripts/history-migration/prepare_wc2026_import.py --dump <respaldo> --legacy-lib ../el-var/src/lib \
    --node <node 22> --out-dir <privado fuera del repo>
# ensayo local: stub + migraciones + import + tests/local_functional_test.sql
npx supabase db query --linked -f <privado>/wc2026_import_dryrun.sql   # ROLLBACK
npx supabase db query --linked -f <privado>/wc2026_import.sql          # una vez; reintentos → ya_importado
python3 -I scripts/history-migration/verify_wc2026_import.py --dump <respaldo> --manifest <privado>/manifest.json \
    --knockout <privado>/knockout_resolved.json
npx supabase db query --linked -f scripts/history-migration/tests/remote_rls_readonly_test.sql
```

El SQL privado (nombres de usuario y UUID) se eliminó tras aplicar; en el scratchpad de la sesión solo quedan `manifest.json` (UUID como SHA-256) y `knockout_resolved.json` (partidos y equipos).

### 5.7 Seguridad de `rls_auto_enable` y primera aplicación web (2026-10-29)

**Revisión de `public.rls_auto_enable()`** (función del event trigger `ensure_rls`, creada por Supabase; `ddl_command_end` para `CREATE TABLE`, `CREATE TABLE AS` y `SELECT INTO`):
- Dueño `postgres`, sin argumentos, devuelve `event_trigger`, `SECURITY DEFINER`, `search_path=pg_catalog`; activa RLS en las tablas nuevas de `public`. Dependencia: solo el event trigger.
- **Exposición real (antes):** ACL NULL, es decir EXECUTE implícito vía PUBLIC. `anon` y `authenticated` (y `authenticator`, `service_role`) podían invocarla directamente; el cuerpo se ejecutaba con privilegios de `postgres` antes de fallar al serializar `event_trigger`. Impacto bajo (solo puede activar RLS sobre DDL del contexto de un event trigger), pero innecesario.
- **Corrección:** migración `20261029210000_revocar_execute_rls_auto_enable.sql` (idempotente): `REVOKE EXECUTE ... FROM public, anon, authenticated, service_role`. Sin cambios en el cuerpo ni en el trigger.
- **Verificado:**
  - ACL `{postgres=X/postgres}`; `anon`, `authenticated`, `authenticator` y `service_role` sin EXECUTE; la invocación directa da `42501 permission denied`.
  - Crear una tabla en `public` (en una transacción con ROLLBACK) sigue activando RLS.
  - En local se confirmó que PostgreSQL no comprueba EXECUTE al disparar un event trigger, con un rol creador que no es dueño ni superusuario. En este proyecto solo `postgres` y `supabase_admin` pueden crear tablas en `public`.
  - El linter de seguridad ya no la reporta.
- **Pendiente (Auth, no modificado):** "Leaked Password Protection Disabled".

**Aplicación** (Next.js 16.2.6, React 19.2.4, TypeScript, Tailwind v4, `@supabase/ssr`; Node 22):

| Ruta | Qué hace |
|---|---|
| `/login` | Correo y contraseña con Supabase Auth (Server Action). Muestra errores en español sin revelar si el correo existe, estado "Entrando…" y `?next=` validado (solo rutas internas). Con sesión, redirige. |
| `/` | Redirige a `/parches`. |
| `/parches` | Parches reales del usuario. Con 1 entra directo, con varios muestra la lista (activos primero) y sin ninguno un estado vacío. |
| `/parches/[parcheId]` | Nombre del parche, identidad y rol del usuario, aviso si su membresía está deshabilitada (solo consulta), torneos con su estado y acceso al historial. Un parche ajeno da 404. |
| `/parches/[parcheId]/torneos/[parcheEventId]` | Historial: aviso "Corte histórico (no es cierre oficial)" con fecha de corte; resultados del torneo marcados como derivados del sistema anterior; clasificación (posición, puntos, exactos, resultados, fallos, pronósticos); miembros sin clasificación con su motivo. Sin premios ni montos (sección 5.8). |

- **Sesión:**
  - `src/proxy.ts` renueva la sesión con `getUser()` y redirige a `/login?next=…` si no la hay.
  - Las páginas privadas vuelven a validar con `requireUser()`.
  - El cierre de sesión es una Server Action (`signOut({ scope: "local" })`).
  - No hay cliente Supabase en el navegador.
- **Datos:** `src/lib/data.ts` lee solo con la sesión del usuario (RLS). No se usa `service_role`, no hay políticas nuevas ni escrituras, y no hace falta ninguna migración para leer.
- **Lógica pura con pruebas:**
  - `navigation.ts`: redirecciones seguras;
  - `auth-errors.ts`: mensajes de error;
  - `parches.ts`: entrada a los parches y etiquetas;
  - `historial.ts`: premios, motivos y cero real frente a desconocido.
- **Variables** (`.env.local`, ignorado por Git; plantilla en `.env.example`): `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (clave pública *publishable*).
- **Dependencias:** `.npmrc` lleva `legacy-peer-deps=true` porque npm 10.8/10.9 falla con `edgesOut` al resolver los peers de `eslint-config-next`; el árbol instalado no tiene conflictos. Los tipos se generan con `npx supabase gen types typescript --linked --schema public > src/lib/supabase/database.types.ts`.
- **Ejecución local:** `cp .env.example .env.local` (completar la clave), `npm install` y `npm run dev` con Node 22.

**QA (2026-10-29):**

| Verificación | Resultado |
|---|---|
| Vitest (redirecciones, errores, 0/1/varios parches, membresía deshabilitada, filas 13+5, premios, corte histórico y cliente simulado con fixtures) | 39/39 |
| `tsc --noEmit`, `eslint` | sin errores |
| `next build` | correcto |
| Bundle del navegador sin claves (`service_role`, `sb_secret_`, ni siquiera la publishable) | correcto |
| HTTP contra `next start`, sin sesión: `/`, `/parches`, `/parches/<id>`, `/parches/<id>/torneos/<id>` y rutas inexistentes redirigen a `/login?next=…`; `next` externo descartado; cookie de sesión falsificada rechazada | correcto |
| Formulario real contra Supabase Auth con una cuenta **inexistente** (`scripts/qa/login_form_smoke.mjs`): mensaje "Correo o contraseña incorrectos…", correo conservado, sin cookie de sesión, validación de campos vacíos | correcto |
| `tests/remote_app_queries_test.sql`: las consultas de la app bajo RLS con identidades simuladas (miembro, deshabilitado, ajeno), solo lectura y ROLLBACK | 12/12 |
| `remote_rls_readonly_test.sql` | 19/19 |
| `verify_wc2026_import.py` | 36/36 (historial intacto) |

**No validado todavía:** el login real desde la nueva UI con una cuenta migrada (pendiente de que Alex lo pruebe) y la navegación autenticada en un navegador; la extensión de Chrome no pudo abrir `localhost`.

**Limitaciones conocidas:**
- (Al 2026-10-29) no había recuperación de contraseña, registro, invitaciones, pronósticos ni gestión; hoy existen (secciones 5.11, 5.15 y 5.24).
- El nombre visible sale de `user_metadata.username` o del prefijo del correo.
- El registro sigue abierto en Auth (sección 4.5).
- La ruta `/` es estática y redirige siempre a `/parches`; el proxy decide el login.

**Pendiente para producción:**
- Site URL y Redirect URLs.
- SMTP y plantillas.
- Política de registro y protección de contraseñas filtradas (Auth).
- Dominio y despliegue en Vercel con las dos variables públicas.
- Prueba de login real de las cuentas migradas y comunicación a los usuarios.
- Cabeceras de seguridad (CSP).
- Monitorización de errores.

### 5.8 Diseño de La Penúltima, temas claro/oscuro y retiro de la monetización (2026-10-29)

**Sistema visual** (referencia: `el-var/src/app/globals.css`, `components/ui/{Button,Card,Input,Badge}.tsx`, `groups/Leaderboard.tsx`, `layout/Navbar.tsx`, `(auth)/layout.tsx`):
- Tokens en `src/app/globals.css` como variables `--lc-*` mapeadas a utilidades de Tailwind (`bg-bg`, `bg-surface`, `bg-surface-raised`, `border-line`, `text-fg`, `text-fg-2`, `text-fg-3`, `bg-cancha`, `text-cancha-text`, `text-gold/silver/bronze`, `text-var-blue`, `text-danger`).
- **Oscuro (predeterminado):** la paleta original: `#0a0a12`, `#11111c`, `#18182a`, `#20203a`, bordes `#2a2a45`/`#1e1e35`, texto `#f1f5f9`/`#94a3b8`, verde `#00c85a` con brillo, oro `#f59e0b`, plata `#94a3b8` y bronce `#cd7c3a`. Tres tonos se aclararon para alcanzar 4.5:1 en texto pequeño: gris terciario `#64748b`→`#7c8ba1`, azul `#3b82f6`→`#60a5fa` y rojo `#ef4444`→`#f87171`.
- **Claro:** los mismos roles con fondos `#f3f5f9`/`#ffffff`, bordes `#d5dce7` y texto `#0f172a`/`#475569`/`#5b6878`. El botón conserva el verde `#00c85a` con texto oscuro; los acentos de texto se oscurecen (`#04783a`, oro `#a85b06`, bronce `#9a4f15`).
- Recuperado del original:
  - fuentes Geist y Geist Mono;
  - cabecera fija con desenfoque;
  - marca con los logos oficiales (sección 5.9; antes era un distintivo provisional "LC");
  - tarjetas `rounded-2xl` (variantes default, raised, glow-green, dashed);
  - botón primario verde con brillo y spinner;
  - campos de 48 px de alto con anillo de foco verde;
  - insignias;
  - halos de fondo del login;
  - animación `fade-in-up`;
  - clasificación en filas tipo tarjeta, con posición y acento de podio (oro/plata/bronce), avatar con inicial, "tú", ⚡ exactos, ✓ aciertos, ✗ fallos, pronósticos y puntos destacados. En celular cada fila se apila sin ocultar datos.
- No se trajeron: el logo PNG de La Penúltima, mensajes de carga con nombres propios, créditos del pie, navegación inferior, podio con confeti, invitaciones, dependencias (`lucide-react`, `clsx`, `tailwind-merge`) ni el cliente Supabase de navegador.

**Temas:**
- `src/lib/theme.ts` y `src/components/ThemeToggle.tsx`. El HTML se sirve con `data-theme="dark"`.
- Un script en línea en `<head>` (`THEME_INIT_SCRIPT`) lee `localStorage["lacanchita-theme"]` y aplica el tema antes de pintar, así que no hay destellos.
- El botón visible ("Modo claro" / "Modo oscuro", en el login y en la cabecera) cambia `data-theme` al instante, sin recargar; lo guarda en el navegador y se sincroniza entre pestañas (evento `storage`).
- La elección explícita manda sobre la preferencia del sistema; sin elección, oscuro. No se usa Supabase ni bibliotecas nuevas.

**Monetización:** el bloqueo de esta sección (privilegios por columna y guardas `*_no_money`) fue un paso intermedio. El 2026-10-29 se ejecutó el saneamiento definitivo (sección 5.10): ya no existen columnas ni datos monetarios en Supabase.

**QA (2026-10-29):**

| Verificación | Resultado |
|---|---|
| Vitest: tema por defecto y persistido, script inicial con/sin preferencia y con `localStorage` bloqueado | correcto |
| Render de `HistoryView` con fixtures: 13 filas, 5 sin posición, estadísticas, aviso de corte histórico, resultados derivados y **ninguna** referencia monetaria | correcto |
| Contraste WCAG ≥ 4.5:1 de 9 tonos de texto sobre 3 fondos en ambos temas, y del texto del botón | correcto |
| Total de Vitest | 66/66 |
| `tsc`, `eslint`, `next build` | sin errores |
| Búsqueda de términos monetarios en `src` y en el build | sin coincidencias, salvo comentarios que explican la decisión |
| HTML servido: `data-theme="dark"`, script del tema en `<head>` antes de `<body>`, selector presente en el login, CSS con ambos temas | correcto |
| Smoke de login con una cuenta inexistente | correcto |
| Pruebas locales de esquema (privilegios, guardas monetarias y suite anterior) | 68/68 |
| `remote_app_queries_test` (en ese momento: montos y cuota ilegibles para `authenticated`) | 16/16 |
| `remote_rls_readonly_test` | 19/19 |
| `verify_wc2026_import.py` | 36/36: historial, Auth y sello intactos (antes del saneamiento) |

**No verificado:** la revisión visual en un navegador real. La extensión de Chrome no abre `localhost` en este entorno; pendiente de que Alex revise ambos temas, en celular y en escritorio.

### 5.9 Identidad visual oficial (2026-10-29)

**Originales (intactos, SHA-256):**

| Archivo | Tamaño | SHA-256 | Fondo | Uso |
|---|---|---|---|---|
| `public/branding/LaCanchita_hor.png` | 832×300 | `3979919e…` | transparente, "La" casi blanco | header en modo **oscuro** |
| `public/branding/LaCanchita_whitebg_hor.png` | 2089×753 | `f8413e4a…` | opaco casi blanco (`#fdfdfe`), "La" oscuro | header en modo **claro** |
| `public/branding/LaCanchita.png` | 500×500 | `9fc06cde…` | transparente | login e iconos |

En la carpeta también están `LaCanchita Football App Logo.png` y `LaCanchita Neon Soccer Logo.png`; no se usan.

**Header (`LogoHorizontal` en `src/components/ui/Logo.tsx`):**
- Usa los dos PNG horizontales originales, sin derivados, dentro de un **marco común** de proporción 636:156. Mide 24 px de alto por debajo de 360 px de ancho, 28 px en celular y 32 px desde `sm` (≈130 px de ancho), así que el espacio, las dimensiones y la alineación son idénticos en ambos temas.
- Como los PNG tienen márgenes amplios y distintos, cada imagen se escala y se desplaza por CSS para mostrar solo su contenido. Los recortes están en `src/lib/logo.ts`, medidos sobre los originales:
  - oscuro: 636×156 desde (109, 63), el mismo encuadre que tenía antes, así que el modo oscuro no cambia;
  - claro: 1797×441 desde (150, 157).
  - `logo.test.ts` comprueba que ambos encuadres tienen la misma proporción, que caben en su imagen, que no recortan el contenido y que este llena el marco en más del 88 % de su altura.
- **Selección por tema:** las dos variantes están en el HTML y el CSS de `globals.css` muestra solo una según el `<html data-theme>` existente:
  - `.logo-light, [data-theme=light] .logo-dark { display: none }`;
  - `[data-theme=light] .logo-light { display: block }`.
  - No hay otro mecanismo de detección ni estado de React, por lo que no hay riesgo de hidratación.
  - El cambio es inmediato al alternar y no hay destellos, porque el tema se fija antes de pintar. Las dos se cargan de inmediato (pesan unos 9 KB y 16 KB ya optimizadas), así que al alternar no queda hueco.
- **Integración del fondo claro:** el blanco del PNG (`#fdfdfe`) y el header claro (`rgba(255,255,255,.85)` sobre `#f3f5f9`, unos `#fdfefe`) difieren en una unidad. Además, `mix-blend-mode: multiply` hace que el blanco se funda aunque haya contenido desplazándose bajo el header translúcido. En modo claro el header ya no usa placa oscura.
- Sigue siendo un enlace a `/parches`.

**Login (`LogoSquare`):** `derived/LaCanchita-trim.png` (419×328, el cuadrado recortado a su contenido), sobre `.brand-plate`: transparente en oscuro y placa `#0a0a12` con borde verde en claro, porque no hay variante clara del cuadrado. No se duplica el nombre de la marca.

**Iconos:** `src/app/icon.png` (192×192, el ícono de la cancha recortado del cuadrado, transparente) y `src/app/apple-icon.png` (180×180, sobre `#0a0a12`).

**Derivados:** `scripts/branding/derive_logos.mjs`, con `sharp` (ya viene con `next`), solo para el cuadrado y los iconos. Comprueba que los tres originales no cambian. El recorte `derived/LaCanchita_hor-trim.png` se retiró al pasar el header a los originales.

**QA (2026-10-29):**

| Verificación | Resultado |
|---|---|
| `tsc`, `eslint` | sin errores |
| Vitest (+9 de encuadre) | 75/75 |
| `next build` | correcto |
| CSS servido con las reglas de selección por tema | correcto |
| `next/image` sirve ambas variantes optimizadas | 200 |
| Ruta privada sin sesión | 307 a `/login` |
| Vista previa a tamaño real (2×), con el encuadre CSS exacto sobre el header oscuro y claro (multiply incluido) | mismo marco y alineación, sin deformación, fondo blanco indistinguible del header claro |
| Tema por defecto, persistencia y script anti-destello | cubiertos por las pruebas existentes, sin cambios |

**Pendiente:** la revisión en un navegador real. El header solo existe con sesión y la extensión de Chrome no abre `localhost` aquí; queda pendiente de Alex, incluida la consola de hidratación.

### 5.10 Saneamiento monetario ejecutado (2026-10-29, autorizado por Alex)

**Resultado:** en Supabase `lacanchita` ya **no existen columnas ni datos monetarios**:
- `parche_events.entry_fee/currency/prize_distribution`, `standing_snapshots.prize_info` y `standing_snapshot_rows.prize_status/prize_amount` se eliminaron;
- también la restricción `ssr_prize`, las guardas `*_no_money` y `private.reject_monetary_values()`.

La búsqueda de términos monetarios en fotografías, filas, `parche_events` y `events` no da coincidencias (solo un falso positivo: "**Cop**a Mundial").

**Clasificación histórica vigente:** una única fotografía, la **v2** `5aeb192e-01fd-55cb-b436-602f2fcce5ff`:
- `historical_cut`, `legacy_import`, sellada, `verify_standing_snapshot = true`;
- huella `5185504be12cde7f8be41d5704a9b0de7e34937ba6c182c6f3b0b1355336567a`;
- 18 filas: 13 clasificadas y 5 sin posición.

La v1 `3112d842…` (huella `017e0c18…`) se borró. La huella canónica (`private.standing_rows_checksum`) ya no incluye campos monetarios y coincide con la huella deportiva de la v1. Los triggers de inmutabilidad se reactivaron dentro de la misma transacción (`O`): la v2 rechaza `UPDATE`, `DELETE` e `INSERT`.

**Procedimiento:**
1. Revisión del SQL contra el esquema real: sin `auth.*`, sin otras tablas, sin otros proyectos.
2. Respaldo privado de la v1 completa (fotografía, filas y `parche_events`, en JSON con permisos 600 fuera del repo). Se verificó reconstruyendo la huella `017e0c18…` desde el archivo.
3. Huellas previas de 15 conjuntos: deportiva, Auth (usuarios e identidades), membresías, partidos, equipos, fases, resultados, eventos, parches, `parche_events` no monetario, pronósticos y conteos. Script: `scripts/history-migration/fingerprints.sql`.
4. Ensayo local en el mismo orden que el destino (`scripts/history-migration/local_rebuild.sh`):
   - la huella deportiva antes y después es idéntica (`5185504b…`) y coincide con la del destino;
   - el reintento se bloquea (`saneamiento: ya aplicado`);
   - la cadena completa de migraciones funciona en una base nueva (sin la v1 solo aplica los cambios de esquema).
5. Ensayo con ROLLBACK en el destino: 15/15 huellas iguales y v2 válida.
6. Ejecución real con `db query`, en una transacción que, antes del COMMIT, compara las 15 huellas con las previas (cualquier diferencia provoca ROLLBACK). Registro con `supabase migration repair --status applied 20261029230000`; `db push --dry-run` informa que está al día.
7. Verificación posterior:
   - 15/15 huellas idénticas: Auth, membresías, partidos y resultados sin cambios;
   - `verify_wc2026_import.py` 36/36, actualizado al estado sin dinero;
   - `el-var` y el dump original intactos (SHA-256 `cef1ce44…`).
   - El respaldo privado de la v1 se borró tras verificar (contenía nombres). Rollback: regenerar la v1 exacta desde el dump con `prepare_wc2026_import.py` (huella `017e0c18…`).

### 5.11 Gestión de parches, participantes e invitaciones (2026-10-29)

**Esquema (`20261029240000`, aplicado):**
- `parches.creation_request_id`, con único `(created_by, creation_request_id)`, para la idempotencia de la creación.
- `parche_invitations`: hash SHA-256 del token, `expires_at` (7 días), revocación, `max_uses` opcional y `use_count`. Solo hay un enlace sin revocar por parche (índice único parcial); generar uno nuevo revoca el anterior.
- `parche_member_events`: auditoría de membresías (creación, unión, salida, deshabilitar, reactivar, cambio de rol, crear y revocar enlace). Nunca guarda tokens.
- Helper `private.is_parche_admin`.

**Operaciones** (RPC `SECURITY DEFINER`, `search_path` vacío, solo `authenticated`; validan `auth.uid()`, rol y estado en la base; las tablas siguen sin escritura directa para clientes):

| RPC | Qué hace |
|---|---|
| `create_parche(name, request_id)` | Parche + membresía `owner` en una transacción. Reintentos y doble clic devuelven el mismo parche. |
| `get_parche_members(parche_id)` | Para cualquier miembro: nombre visible (username o prefijo del correo, nunca el correo), rol, estado y "tú". |
| `set_parche_member_status` | Admin/owner activo deshabilita o reactiva. Los admins solo gestionan miembros; el owner, a todos menos a sí mismo. El owner está protegido. Idempotente. |
| `set_parche_member_role` | Solo el owner, `member ↔ admin`. Solo promueve a miembros activos. |
| `leave_parche` | Borra la propia membresía (no la cuenta). El owner no puede salir y nunca se queda sin administración activa (`last_admin`). |
| `create_parche_invitation` / `revoke_parche_invitation` | Solo admin/owner activo. El token son 32 bytes aleatorios (`extensions.gen_random_bytes`) en base64url de 43 caracteres; se devuelve una sola vez. |
| `get_parche_invitation(token)` / `accept_parche_invitation(token)` | Requieren sesión. Estados: `valid`, `joined`, `already_member`, `disabled_member` (no se reactiva solo), `revoked`, `expired`, `exhausted`, `not_found`. Solo revelan el nombre del parche con un enlace válido. Aceptar bloquea la invitación (`FOR UPDATE`) y es seguro ante concurrencia. |

Todas las operaciones administrativas bloquean la fila del parche para serializarse. Los administradores pueden leer el estado del enlace de su parche, pero nunca el hash (privilegio por columna).

**Semántica del enlace:** varios usos (pensado para compartir en un grupo de WhatsApp), vence a los 7 días y es revocable. Cada persona se une una sola vez y requiere sesión. Aceptar exige un clic explícito ("Unirme al parche"), para que abrir un enlace no te una a un parche sin querer.

**Rutas:**

| Ruta | Qué hace |
|---|---|
| `/` | Tras el login entra directo si hay un solo parche; si no, va a la lista. |
| `/parches` | Lista sin redirección automática, con "+ Crear parche" y estado vacío. |
| `/parches/nuevo` | Formulario de nombre con `request_id` por formulario. |
| `/parches/[id]` | Resumen y torneos, con pestañas Resumen/Participantes y "← Mis parches". |
| `/parches/[id]/participantes` | Lista; panel de invitación para administradores (crear, copiar, WhatsApp, generar nuevo, desactivar); controles según `src/lib/permissions.ts`; salir con confirmación. |
| `/invitacion/[token]` | Privada: sin sesión lleva a `/login?next=…`. Vista del estado y botón "Unirme". |
| `/registro` | Nombre, correo y contraseña; conserva `next`. Se enlaza desde el login cuando hay una invitación. |
| `/auth/confirmar` | Retorno del correo de confirmación (PKCE `code` o `token_hash`). Si falla, lleva al login con aviso conservando el destino. |

Las páginas de login, registro e invitación usan `referrer: no-referrer` (el token va en la ruta).

**QA (2026-10-29):**

| Verificación | Resultado |
|---|---|
| `tests/local_parches_test.sql` (usuarios y parches ficticios, ROLLBACK) | 69/69. Cubre: crear, idempotencia, atomicidad, varios parches, sin escritura directa, invitación válida/revocada/vencida/agotada/inexistente/formato inválido, ya miembro, miembro deshabilitado, intentos de escalada, parche ajeno, salir, owner protegido, último admin, auditoría sin tokens, `anon`, membresías históricas y sello intactos |
| Concurrencia real local (sesiones paralelas): mismo usuario acepta ×10 | 1 alta y 9 `already_member`; `use_count` 1 |
| 8 usuarios compiten por el último uso | 1 `joined` y 7 `exhausted`; `use_count` = `max_uses` |
| `create_parche` ×10 con el mismo `request_id` | 1 parche y 1 membresía |
| Cambios de estado concurrentes | estado final coherente |
| `tests/local_functional_test.sql` (adaptado al esquema sin dinero) | 58/58 |
| `tests/remote_parches_readonly_test.sql` (destino real; solo rechazos y lecturas, ROLLBACK; sin crear datos) | 20/20 |
| `remote_app_queries_test` | 13/13 |
| `remote_rls_readonly_test` | 19/19 |
| Vitest (permisos de interfaz, errores, invitaciones, registro, rutas y render de la lista de participantes por rol) | 109/109 |
| `tsc`, `eslint`, `next build` | sin errores |
| HTTP: todas las rutas privadas, incluida `/invitacion/<token>`, redirigen al login conservando `next` | correcto |
| HTTP: el login con invitación muestra el aviso y "Crear cuenta" con `next` | correcto |
| HTTP: `/registro` conserva `next` y valida nombre, correo y contraseña sin llamar a Auth | correcto |
| HTTP: `/auth/confirmar` con código inválido lleva al login con aviso, en el mismo host | correcto |
| HTTP: smoke de login | correcto |

**No probado con cuentas reales nuevas:** no se registró ninguna cuenta (crearía usuarios reales y enviaría correos), así que los flujos de registro y confirmación solo están verificados por código, validación y HTTP. El aspecto visual de las pantallas nuevas no se revisó en un navegador real (la extensión no abre `localhost`).

### 5.12 Superadministración global y La Canchita Control (2026-10-30)

**Qué existe y está aplicado en Supabase `lacanchita`** (migraciones `20261030100000_la_canchita_control.sql` y `20261030100100_control_bloqueos.sql`, ambas aditivas):

- **Superadministradores:** tabla **privada** `private.platform_admins` (usuario, fecha, quién concedió, nota). Ningún rol de la API (`anon`, `authenticated`, `service_role`) tiene privilegios sobre ella y no hay ninguna función ni ruta que dé de alta o baja administradores: el alta es el script `scripts/control/alta_superadmin.sql`, que se ejecuta con el rol dueño y solo procede si el UUID `95d77e57-b6cb-4359-bc86-e70b3b9f44dd` coincide con `alexsosa.me@gmail.com` confirmado. Ejecutado el 2026-10-30: hay **1** superadministrador, ese usuario. El permiso se resuelve siempre en la base (`private.is_platform_admin()`, `SECURITY DEFINER`, `search_path` vacío, lee `auth.uid()`); no depende de `user_metadata`/`app_metadata` ni de roles de parche. `public.is_platform_admin()` solo informa si quien llama lo es.
- **Escrituras globales** únicamente mediante funciones `control_*` (`SECURITY DEFINER`, `search_path` vacío, `EXECUTE` solo para `authenticated`, primera línea `private.require_platform_admin()`): `control_create_event`, `control_update_event`, `control_event_publish_issues`, `control_publish_event`, `control_set_event_status`, `control_save_stage`, `control_save_team`, `control_set_event_team`, `control_remove_event_team`, `control_save_match`, `control_record_match_result`, `control_confirm_match_result`, `control_correct_match_result`, `control_discard_pending_result`, `control_event_lock_reasons`. Las tablas deportivas siguen sin privilegios de escritura para clientes. El aviso WARN del linter (funciones `SECURITY DEFINER` ejecutables por `authenticated`) es esperado: cada una valida el permiso.
- **Borradores:** `events.status = 'draft'` solo lo ve un superadministrador. La regla se aplica en `events` y en todas sus hijas (`event_stages`, `event_teams`, `matches`, `event_results`) y en `teams` (un equipo es visible si participa en algún torneo publicado; los equipos nuevos o solo de borradores los ve únicamente un superadministrador). Sin recursión: las políticas hijas consultan `events`, nunca al revés.
- **Torneos bloqueados:** un torneo `closed`, `cancelled` o con historial sellado (el Mundial 2026) rechaza cualquier cambio de `control_*` (`event_locked_history`), y sus equipos no se renombran. Control los muestra de solo lectura.
- **Auditoría global:** `public.control_audit_log`, inmutable (triggers que rechazan UPDATE, DELETE y TRUNCATE, incluso al rol dueño), legible solo por superadministradores. La escribe `private.audit()` **en la misma transacción** de cada operación; el actor es `auth.uid()` y la fecha `now()`: el cliente no puede fijarlos. Guarda acción, entidad, torneo, valores anteriores y nuevos y el motivo. Una operación rechazada no deja registro.

**Modelo de resultados:** ver la sección 5.13 (desde la migración `20261030110000` el marcador pendiente vive en una tabla privada; `matches` solo contiene datos públicos u oficiales).

**Reglas de gestión:**
- Torneo: nace en borrador; publicar (`draft → scheduled`) exige zona horaria válida, ≥1 fase, ≥2 equipos, ≥1 partido y cada lado con equipo o descripción. Transiciones: `scheduled → in_progress`, `in_progress → finished` (solo si todo partido no cancelado tiene resultado oficial), cancelar, y despublicar `scheduled → draft` solo sin parches ni pronósticos. El identificador no cambia tras publicar. No hay eliminación de torneos ni cierre definitivo.
- Fases: código/orden únicos por torneo, puntos exacto/resultado 0–100; con resultados oficiales en la fase ya no cambian sus puntos ni su formato. (Desde 5.13 la consola solo edita fases ya cargadas.)
- Equipos: catálogo global sin duplicados (nombre sin distinguir mayúsculas + tipo); un equipo participa en varios torneos; quitar uno de un torneo solo si no tiene partidos.
- Partidos: `match_number` único por torneo (numeración propia de cada torneo), fase y equipos deben pertenecer al torneo, llaves manuales con descripciones (`home_placeholder`/`away_placeholder`), sin cambios silenciosos: un partido con resultado oficial no se edita (se corrige el resultado), con marcador pendiente no cambia equipos/fase y con pronósticos tampoco.
- Horarios: se guardan como instantes UTC; `src/lib/control/time.ts` convierte desde/hacia la zona del torneo (`events.timezone`) y rechaza horas inexistentes o ambiguas por cambio de horario. Nada asume Colombia.
- **Inscripción en parches:** `public.add_event_to_parche(parche, evento)`: solo owner/admin **activo** (la fila del parche se bloquea), torneo publicado (un borrador no se revela) y abierto (`scheduled`/`in_progress`), una vez por parche; queda en `parche_member_events` (`event_enrolled`). No hay pronósticos retroactivos: `can_write_prediction` ya exige partido programado y `now() < starts_at`.

**La Canchita Control (interfaz):** `/control` (redirige a `/control/torneos`), `/control/torneos`, `/control/torneos/[slug]` (resumen, datos, publicación y estado; ver 5.13), `.../fases`, `.../equipos`, `.../partidos`, `.../partidos/nuevo`, `.../partidos/[matchId]`, `.../resultados` (pendientes / sin resultado / oficiales) y `.../actividad`. `requirePlatformAdmin()` (en `src/lib/auth.ts`) se ejecuta en el layout, en **cada página y en cada Server Action**: sin sesión → login; sin privilegio → **404**. El enlace «Control» de la cabecera solo se muestra a superadministradores. Las confirmaciones explícitas de dos pasos (`src/components/ActionForm.tsx`) protegen publicar, confirmar/corregir/descartar resultados, cancelar y quitar equipos. En la página del parche (`/parches/[id]`), owner/admin ven «Incorporar un torneo».

**QA (2026-10-30):**

| Verificación | Resultado |
|---|---|
| `tests/local_control_test.sql` (Postgres local, usuarios ficticios, ROLLBACK): autorización, escalamiento por metadata/RPC, borradores, publicación, fases, equipos, partidos, horarios, resultados, auditoría, inscripción, histórico | 138/138 |
| `tests/local_control_concurrency.sh` (sesiones paralelas reales): 8 confirmaciones simultáneas → 1; 6 correcciones → 1; registrar vs. confirmar coherente; 8 inscripciones → 1 | 6/6 |
| Suites previas contra el esquema nuevo: `local_functional_test` / `local_parches_test` | 58/58 · 69/69 |
| `tests/remote_control_test.sql` (proyecto real, identidades simuladas, flujo completo dentro de una transacción con ROLLBACK; luego se comprobó que nada persistió) | 23/23 |
| Suites remotas previas: `remote_rls_readonly_test` / `remote_app_queries_test` / `remote_parches_readonly_test` | 19/19 · 13/13 · 20/20 |
| `verify_wc2026_import.py` (ahora restringe las huellas de Auth a las 18 cuentas originales e informa las adicionales) | 36/36 |
| Huellas del historial antes y después de aplicar las migraciones (15 conjuntos) | idénticas |
| Vitest (+ zonas horarias, estados de resultado, errores, guardia de superadmin, acciones con cliente simulado, `ResultCard`, `EnrollEvents`) | 151/151 |
| `tsc`, `eslint`, `next build` (11 rutas de Control) | sin errores |
| HTTP con `next start`: todas las rutas de `/control` sin sesión (y con cookie falsa) → 307 a `/login?next=…`; bundle del navegador sin `service_role`, `sb_secret_` ni nombres de funciones/tablas de Control | correcto |

**No probado:** el recorrido completo con la sesión real del superadministrador y de un usuario normal en un navegador (no se pueden iniciar sesión con cuentas reales sin sus contraseñas; el 404 para usuarios normales está cubierto por pruebas unitarias del guardia y por las pruebas SQL con identidades simuladas) y la revisión visual de las pantallas nuevas. Alex debe recorrer `/control` con su cuenta.

**Limitaciones (al 2026-10-30; el motor existe desde 5.15):** entonces no existía motor de puntuación ni captura de pronósticos; no hay cierre definitivo de torneos, ni edición de `event_results` (campeón, etc.), ni automatización de llaves, ni proveedores externos de resultados, ni alta/baja de superadministradores desde la aplicación.

### 5.13 Ajustes de Control: importaciones, slugs, equipos, formularios y resultados pendientes privados (2026-10-30)

**Torneos y fases se cargan por importación, no a mano.** Se retiraron de la consola «+ Nuevo torneo», `/control/torneos/nuevo` (ya no existe: la URL responde 404 como cualquier torneo inexistente), el alta de fases y la acción de servidor `createEventAction`. No se tocó nada interno: siguen existiendo tablas, migraciones y las funciones `control_create_event` y `control_save_stage` (alta), que usarán las importaciones (administrativas, con el rol dueño o una sesión de superadministrador); solo desapareció la ruta pública de formularios. No hay importador genérico, scraping ni proveedores externos: cada torneo tendrá su importación verificada y reproducible, ejecutada solo con autorización. Se conserva: editar torneos, editar fases y puntos, gestionar equipos, **crear/editar partidos de forma excepcional**, publicar, resultados y auditoría.

**URLs con slug.** Detalle y rutas hijas usan el `slug` del torneo (`/control/torneos/copa-de-prueba`, `.../fases`, `.../equipos`, `.../equipos/nuevo`, `.../partidos`, `.../partidos/nuevo`, `.../partidos/[matchId]`, `.../resultados`, `.../actividad`). Se resuelve en el servidor (`loadEvent`, `src/app/(privado)/control/torneos/[eventSlug]/event.ts`) tras el guardia de superadministrador; el UUID sigue siendo el identificador interno. Un enlace antiguo con UUID redirige a la ruta canónica conservando la subruta (también para el Mundial). Los slugs existentes no se tocaron; solo se puede cambiar el slug de un torneo en borrador (los enlaces antiguos por UUID siguen funcionando). Sin migración: se reutiliza `events.slug` (único).

**Equipos.** Cuadrícula de tarjetas compactas (`TeamsBoard`): bandera/emblema existente o iniciales, nombre y código; rejilla responsive de 2 a 6 columnas, búsqueda, separación «En el torneo» / «Catálogo», añadir al torneo con un clic y detalle (grupo, edición del catálogo global con aviso de alcance, quitar). «+ Nuevo equipo» arriba a la derecha como «+ Nuevo partido»: formulario que crea el equipo (sin duplicados) y lo asocia al torneo, y vuelve a la sección de equipos. Sin imágenes generadas ni servicios externos.

**Fases (solo edición).** Se muestran por nombre, sin códigos; formato legible («Fase de grupos o liga» / «Eliminación directa»), puntos de «marcador exacto» y «resultado acertado» con su explicación, y orden con ↑/↓ (`control_move_stage`, intercambio atómico y auditado). El código interno y el orden numérico los conserva la base (la acción los lee de la fila; el formulario no los envía). No cambió la lógica de puntuación ni las reglas del Mundial.

**Formularios y errores propios.** `ActionForm` ahora usa `noValidate` y valida con mensajes en español (`src/lib/control/validation.ts`): error junto al campo (`aria-invalid`, texto «⚠ …»), foco en el primer campo inválido, valores conservados tras un error (el servidor devuelve `values`) y limpieza del error al escribir. El servidor y la base repiten toda validación: los códigos de error se traducen (`src/lib/control/errors.ts`) y se asocian a un campo (`ERROR_FIELDS`) o se muestran como aviso general; nunca se muestran errores SQL, nombres de funciones ni textos del navegador. Campos: `TextField`, `SelectField`, `TextAreaField`, `CheckboxField` (`src/components/control/inputs.tsx`). Aplicado a torneo, fases, equipos, partidos y resultados; el resto de la aplicación no se refactorizó.

**Marcadores pendientes privados (migración `20261030110000_resultados_pendientes_privados.sql`, aplicada). [SUPERADO por 5.16: el flujo pendiente → confirmación se retiró; la tabla y los registros se conservan para revisión explícita.]** Problema: RLS es por fila; un marcador pendiente guardado en `matches` (`finished` + marcador + `result_confirmed_at NULL`) era legible por la API en torneos publicados. Solución: el pendiente vive en `private.match_result_drafts` (esquema no expuesto; sin privilegios para `anon`, `authenticated` ni `service_role`; solo lo leen/escriben las funciones `control_*` de superadministradores, y se consulta con `control_pending_results(evento)`).

| Estado | Dónde | Quién lo ve |
|---|---|---|
| Sin resultado | nada | todos (partido sin marcador) |
| Pendiente | fila en `private.match_result_drafts` | solo superadministrador |
| Oficial | `matches`: marcador + `result_confirmed_at`/`_by` | usuarios autenticados |
| Importado | `matches` del torneo histórico (`finished`, sin confirmación, revisión 0) | como antes (ya era público) |

- Registrar/editar/descartar un pendiente **no modifica `matches`** (ni estado, ni marcador, ni `updated_at`, ni `result_revision`): no hay columna ni estado derivado que delate el valor ni su existencia. Confirmar mueve el marcador a `matches` (`finished`, `result_confirmed_at/by`, `result_revision + 1`) y borra el borrador, en una transacción; corregir sigue operando sobre `matches` (con motivo y auditoría). El control de concurrencia de un pendiente es `match_result_drafts.revision` (0 = no hay borrador); `matches.result_revision` solo cambia con cambios oficiales, de modo que el contrato con el futuro motor de puntuación (puntuar la revisión vigente de un partido con `result_confirmed_at` no nulo, una sola vez) no cambia.
- La auditoría (`control_audit_log`, solo superadministradores) conserva los valores de cada paso.
- Superficies revisadas: SELECT directo a `matches`/tablas deportivas (sin marcador pendiente), tabla privada (sin privilegios), RPC (`control_*` exigen superadministrador), vistas (no existen vistas de resultados), `updated_at`/`result_revision`/`status` de `matches` (no cambian), auditoría (solo superadministrador). No hay Realtime ni endpoints propios que lean marcadores.
- Datos: se comprobó la semántica de los 4 `event_results` (apuntan a partidos finalizados con marcador y revisión 0) antes de migrar. Los 104 partidos del Mundial 2026 **no se tocaron**; la migración solo mueve filas creadas por Control (revisión > 0) en torneos sin historial sellado: en producción no había ninguna (Copa de prueba es un borrador vacío), y el movimiento se probó con una fila de prueba en Postgres local (restaura el estado previo desde la auditoría y deja el Mundial idéntico).

**QA (2026-10-30):**

| Verificación | Resultado |
|---|---|
| `tests/local_control_test.sql` (incluye: normal/owner no ven ni consultan pendientes; `matches` intacto tras registrar; oficial visible tras confirmar; reordenar fases) | 150/150 |
| `tests/local_control_concurrency.sh` (sesiones paralelas contra el modelo nuevo) | 6/6 |
| Suites locales previas (`local_functional_test`, `local_parches_test`) | 58/58 · 69/69 |
| Movimiento de datos de la migración (fila de prueba) | correcto |
| `tests/remote_control_test.sql` (proyecto real, identidades simuladas, ROLLBACK; un miembro real no ve el pendiente por `matches`, tabla privada ni RPC) | 30/30 |
| Suites remotas previas | 19/19 · 13/13 · 20/20 |
| `verify_wc2026_import.py` | 36/36 |
| Huellas del historial antes/después de la migración (15 conjuntos) | idénticas |
| Vitest (+ slug/UUID, validación, campos, cuadrícula, edición de fases, ausencia de creación, `ResultCard` con borrador) | 173/173 |
| `tsc`, `eslint`, `next build` | sin errores |
| HTTP con `next start`: rutas por slug y por UUID sin sesión → 307 a `/login`; bundle sin `service_role`, `sb_secret_`, `match_result_drafts` ni `control_pending_results` | correcto |

**No probado:** el recorrido con sesión real del superadministrador y de un usuario normal en navegador (sin sus contraseñas) y la revisión visual de la cuadrícula y los formularios; la redirección UUID→slug se probó con pruebas unitarias del cargador, no con una sesión real.

### 5.14 Correcciones de QA de Control (2026-10-30)

**Confirmación de marcadores (bug crítico). [Flujo retirado en 5.16; se conserva como historia.]** Causa raíz: los campos de edición eran independientes del formulario de confirmar. «Confirmar» enviaba solo la revisión y el diálogo se construía en el servidor con el borrador persistido, mientras que los inputs (no controlados) podían mostrar otra cosa (cambios sin guardar, valores restaurados por el navegador o conservados tras un guardado fallido). La revisión protegía contra cambios concurrentes, pero no comprobaba el *valor* que el administrador creía aprobar. Solución:
- **Servidor/base** (migración `20261030120000`): `control_confirm_match_result(partido, revisión, local, visitante, ganador)` exige la revisión **y** el marcador exacto vigentes del borrador; si no coinciden → `stale_revision` sin cambiar nada. La firma antigua de 2 argumentos se eliminó (no hay vía para confirmar sin verificar valores). La acción de servidor rechaza peticiones sin esos valores sin llamar a la base.
- **Interfaz** (`PendingResultPanel`): A) *editar* y B) *confirmar* son operaciones separadas. Los campos están controlados; si difieren de lo guardado se muestra «Cambios sin guardar» con «Restablecer lo guardado», se bloquea «Confirmar» y se ofrece «Guardar cambios». Siempre se muestra «Guardado: …». El diálogo de confirmación indica torneo, equipos, el marcador persistido exacto y que será oficial y público; los valores enviados salen del borrador persistido, no de los campos. Se reinicia con la revisión del borrador. Cancelar no cambia nada.

**Tipos de equipo.** Un único catálogo global con `teams.kind` (`national` selección · `club` · `other`): ya existía; no hubo migración de datos (los 48 equipos del Mundial son `national` con bandera). Filtros Todos / Selecciones / Clubes en el catálogo (arranca en el tipo predominante del torneo; no impide añadir del otro tipo). Los scripts de importación indican `kind` al crear equipos; el nombre+tipo es único (sin duplicados).

**Banderas y escudos.** Selecciones: emoji de bandera (se sugiere por el nombre en español con `Intl.DisplayNames` si se deja vacío; Inglaterra/Escocia/Gales con su bandera propia; sin coincidencia → no se inventa). Clubes: escudo opcional en el bucket público `team-crests` (`<team_id>/<uuid>.<png|jpg|webp>`, ≤ 512 KB, sin SVG), referenciado en `teams.crest_path` (equipo global, reutilizado en todos los torneos). Escritura solo de superadministradores (políticas de Storage + `control_set_team_crest`, que valida la ruta y bloquea equipos de torneos con historial/cerrados); el servidor verifica la firma del archivo (no el nombre ni el tipo declarado) antes de subir y elimina el archivo si la base rechaza la asociación. Visual: `TeamBadge` (bandera → escudo → iniciales para selecciones; escudo → emoji → iniciales para clubes). No se descargan ni se generan imágenes y no hay scraping; solo se suben escudos con uso permitido.
- **Importaciones futuras:** crear o reutilizar el equipo por nombre+tipo (`kind`), poner `flag_emoji` en selecciones, y para clubes subir un escudo **con origen y licencia verificados** a `team-crests/<team_id>/<uuid>.<ext>` y llamar a `control_set_team_crest`. Nunca duplicar equipos ni asociar escudos sin verificar.

**Partidos.** Tarjeta `MatchCard`: equipos con insignia, marcador destacado (oficial grande; pendiente con borde punteado dorado; importado atenuado), fecha en la zona del torneo, fase/grupo/jornada en segundo plano. Estados en dos niveles: el del marcador manda («Resultado oficial», «Marcador pendiente · no oficial», «Importado (histórico)») y el del encuentro queda como dato secundario («Partido: programado»); no se cambia el estado persistido. El pendiente solo lo ve el superadministrador.
- **Grupo y jornada:** el modelo tenía solo `group_code`. Se añadió `matches.round_label` («Jornada 3», «Cuartos de final»); `group_code` conserva los grupos («A»). Ambos opcionales; valores existentes intactos.
- **Equipos por definir:** «Si todavía no se conocen los equipos, puedes indicar cómo se definirán». La descripción aparece solo si no hay equipo o ya tiene texto, y **no se borra al asignar un equipo** (`control_save_match` la conserva).
- **Grupo del equipo en el torneo:** opcional, ejemplo «A», por torneo (`event_teams.group_code`), no en el equipo global.

**Identificador (slug).** Es de solo lectura en la consola (la acción conserva el de la base): define la dirección web y cambiarlo rompería enlaces; no hay historial de slugs. Los enlaces con UUID siguen redirigiendo. Solo una importación administrativa (`control_update_event`, en borrador) puede cambiarlo.

**Contadores históricos.** El listado ya no muestra «0 con resultado oficial» para el Mundial: separa *oficiales*, *con marcador pendiente* e *importados (históricos)* (104). Los resultados históricos no se convierten en confirmados.

**QA (2026-10-30):** `local_control_test.sql` 171/171 · concurrencia 6/6 · suites locales previas 58/58 y 69/69 · `remote_control_test.sql` (proyecto real, ROLLBACK, incluye Storage real y un miembro real) 37/37 · remotas previas 19/19, 13/13, 20/20 · `verificar_copa_de_prueba.sql` 19/19 · `verify_wc2026_import.py` 36/36 (ahora acotado al evento del Mundial: tras cargar Copa de prueba comparaba también sus filas) · Vitest 200/200 · `tsc`, `eslint`, `next build` sin errores · HTTP: rutas sin sesión → login, bundle sin secretos. **No probado:** interacción real en navegador con sesión (estado «cambios sin guardar» ejercido solo con funciones puras y marcado SSR), subida real de un archivo por la interfaz y revisión visual.

### 5.15 Fase 3.1 — Motor de pronósticos, puntuación y clasificación (2026-10-31)

Migración `20261031100000_motor_pronosticos.sql` (aplicada). Recupera el motor de La Penúltima y lo adapta al modelo parche × torneo; no hay pantallas nuevas.

**Qué se reutilizó de `el-var`** (lectura de su código; nada se modificó): `save_prediction_for_user` → `public.save_prediction`; `calculate_match_points` → `private.score_match`; `get_group_leaderboard` → `public.get_parche_event_leaderboard`; `get_match_detail_predictions` / `get_match_missing_predictions` → `get_match_predictions` / `get_match_missing_predictions`; `simulatePoints`, `matchClosedReason` y la tabla proyectada en vivo → `src/lib/juego/scoring.ts`. Se conservan: marcador 0–30, cierre en `starts_at`, exacto y resultado excluyentes, penales sin puntos, `RANK()` por puntos → exactos → resultados, sin pronóstico = 0, nombre visible igual que en el original.

**Adaptaciones multitenant:** identidad del pronóstico `(parche_event_id, match_id, user_id)`; los puntos salen de `event_stages` del torneo (no del código; el valor discordante del tercer puesto de El VAR no se importa); la puntuación recorre **todos** los parches inscritos al partido y deja los puntos en cada fila; la clasificación es por `parche_event_id` (nunca `groups[0]`).

**Pronósticos** (`save_prediction`, además de las políticas RLS equivalentes): usuario autenticado, no superadministrador, miembro **activo** del parche, inscripción activa, torneo `scheduled`/`in_progress`, partido de ese torneo, estado `scheduled` o `postponed` y `now() < starts_at`; crea o actualiza sin duplicados (`ON CONFLICT`), con `FOR SHARE` sobre el partido. Un parche ajeno, una inscripción inexistente y un usuario sin membresía dan el mismo `not_enrolled` (no se revela). `predictions.updated_at` es la hora del pronóstico: no cambia al puntuar.

**Puntuación** (`private.score_match`, idempotente y determinista; sobrescribe, no acumula; falla de forma visible y atómica, sin `EXCEPTION WHEN OTHERS`): solo partidos `finished` con marcador; torneo con historial sellado → `event_locked_history` (nunca se puntúa el Mundial). **Un trigger en `matches` mantiene el invariante** para cualquier vía de escritura (incluida la futura Fase 3.2): al pasar a `finished` o cambiar marcador/fase se recalcula; al salir de `finished` o cancelarse se retiran los puntos (`private.clear_match_points`). El flujo actual de Control (confirmar/corregir) puntúa solo gracias al trigger.

**Ciclo de vida:**
- *Reapertura excepcional* (`control_reopen_match(partido, motivo, revisión)`): `finished → live`, quita `result_confirmed_*`, retira los puntos, **no** reabre pronósticos (siguen bloqueados), auditada. Al volver a finalizar se recalcula. Un finalizado solo puede volver a `live` (trigger `matches_status_guard`).
- *Aplazamiento*: se conservan los pronósticos y se editan hasta la nueva hora de inicio; no puntúa; los pronósticos ajenos siguen ocultos. Reprogramar = `postponed → scheduled` con la nueva hora (`control_save_match`). Un aplazado cuya hora ya pasó queda bloqueado hasta reprogramarlo.
- *Cancelación*: definitiva (el trigger impide reactivar, también por SQL directo); sin puntos; los pronósticos quedan como historial y **no** suman ni cuentan (`pred_count`) en la clasificación.
- `control_rescore_match(partido)`: recálculo explícito (idempotente) para superadministradores.

**Superadministrador:** no pronostica ni aparece en clasificaciones. Se impide en tres capas: `save_prediction`, la política RLS (`can_write_prediction`) y el trigger `predictions_guard` (también frente al rol dueño). Ser owner/admin de un parche no excluye a nadie por sí solo.

**Clasificación** (`get_parche_event_leaderboard`): participantes = miembros **activos** del parche, sin superadministradores (los deshabilitados no puntúan, como en el original); `RANK()`; se calcula al consultar (no se guarda; `standing_snapshots` solo para el cierre). Visibilidad de pronósticos ajenos (`can_view_others_predictions`): al empezar (en juego/finalizado, o programado con la hora pasada) o al terminar según el parche; **aplazado = oculto**, cancelado = visible; la RPC `get_match_predictions` ahora **valida** la regla en la base (el original solo la comprobaba la página) y excluye deshabilitados y superadministrador.

**Contratos para conectar la UI original (Fase 3.2):** `src/lib/juego/data.ts` (`savePrediction`, `getMyPredictions`, `getLeaderboard`/`getLeaderboardRows`, `getMatchPredictions`, `getMissingPredictions`, `getStagePoints`), `src/lib/juego/scoring.ts` (`simulatePoints`, `matchClosedReason`, `projectLeaderboard`), `src/lib/juego/errors.ts` (mensajes en español) y la acción `savePredictionAction` en `src/app/(privado)/parches/[parcheId]/torneos/[parcheEventId]/actions.ts` (misma forma que la original; la identidad sale de la sesión). Pendiente de 3.2: editor de marcadores en vivo (hoy un marcador en vivo sigue el flujo privado de Control), transición automática a «En vivo» por hora (`mark_due_matches_live` del original), pantallas, sondeo y celebración de gol.

**QA (2026-10-31):** `local_motor_test.sql` 89/89 (pronósticos, multitenancy, puntuación, reapertura, aplazamiento, cancelación, clasificación y empates, fallo atómico, histórico) · `local_motor_concurrency.sh` 5/5 · suites locales previas 58/58, 69/69 y 171/171 · `remote_motor_test.sql` (proyecto real, ROLLBACK) 14/14 · remotas previas 37/37, 19/19, 13/13, 20/20 · Copa de prueba 19/19 · `verify_wc2026_import.py` 36/36 · huellas del historial (15) y snapshot de Copa/Mundial idénticos antes y después · Vitest 214/214 · `tsc`, `eslint` y `next build` sin errores. **No probado:** la UI (no existe todavía) ni una sesión real de jugador.

### 5.16 Fase 3.2 — Ciclo de vida de partidos como en La Penúltima (2026-10-31)

Migración `20261031110000_ciclo_partidos.sql` (aplicada; las 13 migraciones locales coinciden con el remoto). Recupera de `el-var`: `MatchEditorCard` + `update_match_result` + `save_winner_side` → `control_update_match_live` (una sola operación atómica); `mark_due_matches_live()` → `sync_due_matches()`; `LiveMatchPoller`/`MatchDetailPoller`/`useGoalCelebration`/contexto de edición → `src/components/juego/*` y lógica pura en `src/lib/juego/{polling,goal}.ts`.

**Flujo de resultados vigente (reemplaza «pendiente → confirmación»).** El superadministrador guarda el marcador **directamente en `matches`**; los jugadores lo ven al instante. No hay aprobación por guardado. En `Control → Resultados` (editor recuperado: estado En vivo/Finalizado, marcador local/visitante, ganador de la llave y «Guardar resultado»):
- *Iniciar / marcador en vivo* (`control_update_match_live(..., 'live', ...)`): sin marcador empieza 0-0; se guarda tantas veces como haga falta; no puntúa; el ganador por penales se ignora hasta cerrar.
- *Finalizar* (`'finished'`): fija marcador, ganador (penales en eliminatorias empatadas; en grupos no aplica), `result_confirmed_at/by` (resultado oficial) y el trigger de la Fase 3.1 calcula los puntos de todos los parches. Pide confirmación explícita con el marcador exacto (campos controlados: diálogo y envío usan los mismos valores).
- *Corregir un finalizado*: mismo guardado con **motivo obligatorio**; recalcula (sobrescribe) y queda auditado con valores anteriores y nuevos.
- *Reabrir* (`control_reopen_match`, de 3.1): motivo obligatorio; vuelve a En vivo y retira los puntos; los pronósticos siguen bloqueados.
- Marcador, estado, ganador, revisión y auditoría se escriben en **una transacción**; `result_revision` sube con cada cambio y el servidor rechaza guardados obsoletos (`stale_revision`: «Alguien cambió este partido… No se guardó nada»). Guardar el mismo marcador no cambia la revisión.

**Inicio automático — mecanismo real.** `sync_due_matches()` pasa a En vivo los programados con `starts_at <= now()` (instante absoluto de la base; no depende de la zona del navegador ni del torneo), solo en torneos `scheduled`/`in_progress`, sin historial sellado, con ambos equipos asignados; no toca aplazados/cancelados/en vivo/finalizados; inicia 0-0 solo si no hay marcador; no puntúa; idempotente y concurrente (`FOR UPDATE SKIP LOCKED`); audita con actor nulo (`match_auto_started`). La puede llamar cualquier usuario autenticado (como el original). **Es sincronización perezosa, no un cron:** hoy se dispara al abrir cualquier página de Control (`loadEvent`, lista de torneos) y debe llamarse (`syncDueMatches`, `src/lib/juego/data.ts`) al inicio de las páginas de partidos del jugador en la Fase 3.3. **El inicio NO ocurre solo si nadie abre ninguna página**; no se añadió `pg_cron` ni otro servicio (opción futura si se quiere independencia de visitas). El inicio automático no sube `result_revision` (un formulario abierto antes del inicio puede guardar el marcador sin conflicto).

**Aplazamiento, reprogramación, cancelación** (`control_save_match`, pestaña Partidos → Editar): estados programado / aplazado / cancelado; «En vivo» y marcadores solo desde Resultados. Aplazar conserva los pronósticos (editables hasta la nueva hora), no puntúa y limpia el marcador si estaba En vivo; reprogramar = cambiar la fecha y volver a «Programado» (o cambiar la fecha estando aplazado); revertir el inicio (live → programado) limpia el marcador. Cancelar es **definitivo** (trigger de 3.1; en la interfaz exige marcar una casilla de reconocimiento, validada también en el servidor). Auditoría distinta: `match_postponed`, `match_rescheduled`, `match_cancelled`, `match_start_reverted`, además de `match_started`, `match_auto_started`, `score_updated`, `match_finished`, `result_corrected`, `match_reopened`.

**Qué pasó con el flujo anterior:** se retiraron las 4 funciones (`control_record_match_result`, `control_confirm_match_result`, `control_discard_pending_result`, `control_correct_match_result`) para no mantener un segundo flujo. **Ningún dato se perdió**: `private.match_result_drafts` y `control_pending_results` se conservan; en producción hay 1 marcador pendiente heredado (Copa de prueba, partido 2: 2-1) que sigue intacto. `control_resolve_pending_result` permite **aplicarlo como marcador en vivo** (no finaliza) o **descartarlo**, de forma explícita y auditada; Control → Resultados lo muestra en la pestaña «Pendientes (flujo anterior)». Nada se publica solo. Los 104 partidos importados del Mundial siguen como «Importado (histórico)» y bloqueados.

**Contratos para la Fase 3.3** (pantallas del jugador): `syncDueMatches(supabase)`; `LiveMatchPoller` (listas) y `MatchDetailPoller` (detalle) con `PredictionEditingProvider`/`usePredictionEditing` (pausa con formularios abiertos y refresco al cerrarlos); `useGoalCelebration` + `isGoal`; cadencias en `polling.ts` (10 s en vivo, 15 s sin partido en vivo, 30 s/10 s antes del inicio, 5 s con hora vencida, 60 s con la pestaña oculta o partido finalizado/cancelado); sin Realtime. Pendiente de 3.3: montar los pollers en las páginas, la animación visual del gol (`GoalCelebrationOverlay` original, solo CSS) y las pantallas. Los marcadores públicos se leen de `matches` (RLS: cualquier autenticado en torneos publicados); los pronósticos ajenos solo según la regla de 3.1.

**QA (2026-10-31):** `local_ciclo_test.sql` 35/35 · `local_control_test.sql` 160/160 · `local_motor_test.sql` 89/89 · suites previas 58/58 y 69/69 · concurrencia (`local_control_concurrency.sh` 7/7, `local_motor_concurrency.sh` 5/5: 8 guardados con la misma revisión → 1, 8 cierres → 1, 6 correcciones → 1, 8 sincronizaciones → 1 inicio) · remotas con ROLLBACK: `remote_control_test` 40/40, `remote_motor_test` 14/14, `remote_rls` 19/19, `remote_app_queries` 13/13, `remote_parches` 20/20, Copa de prueba 19/19 · `verify_wc2026_import.py` 36/36 · huellas del historial (15) y snapshot de Copa/Mundial idénticos antes/después · Vitest 215/215 · `tsc`, `eslint`, `next build` sin errores. **No probado:** el flujo de Control en un navegador con sesión real (no hay credenciales de prueba), la revisión visual del editor y los pollers montados en páginas (aún no existen).

### 5.17 Fase 3.3 — Experiencia del jugador recuperada de La Penúltima (2026-10-31)

Sin migraciones: reutiliza los contratos de 3.1/3.2. Las pantallas originales de `el-var` (componentes y JSX casi verbatim, identidad verde oscura, sin rediseño) se montan bajo `/parches/[parcheId]/torneos/[parcheEventId]/…`; el contexto del juego es siempre la inscripción (parche × torneo), nunca `groups[0]`.

| Ruta (bajo el torneo) | Qué es |
|---|---|
| `/` | Inicio: partido destacado, en vivo, calendario con filtros, mi resumen, puntos de la fase actual y tabla (si el torneo tiene historial sellado, redirige a `/historial`) |
| `/matches/[matchId]` | Detalle: marcador, mi pronóstico, pronósticos de los demás (solo si la regla de 3.1 lo permite; la RPC valida), faltantes, tabla proyectada |
| `/en-vivo` · `/leaderboard` · `/community` · `/profile` · `/rules` | En vivo (un solo partido → su detalle), tabla oficial (`get_parche_event_leaderboard`), miembros del parche (sin correos ni dinero), perfil, reglas con puntos por fase leídos de `event_stages` |

- **Cascarón** (`[parcheEventId]/layout.tsx`): barra de contexto «← Mis parches / parche · torneo», `JuegoProvider`, `JuegoNav` (barra inferior en celular, pestañas en escritorio, indicador de En Vivo), zona `data-theme="dark"` para conservar la identidad original, aviso de solo consulta (superadministrador / deshabilitado / torneo cerrado), `loading.tsx` y `error.tsx`. Los torneos con historial sellado no se envuelven. **«Copa» (cuadro, mejores terceros, noticias, podio) no se muestra: Fase 3.4.**
- **Sincronización:** `getMatchesWithPredictions` llama `syncDueMatches` en cada visita; sigue siendo perezosa (sin cron). Pollers y celebración de gol de 3.2 montados en inicio, En Vivo y detalle; sin celebración al cargar, al cambiar de contexto ni en correcciones a la baja.
- **Adaptaciones:** zona horaria del torneo (no Bogotá), fase y puntos desde `event_stages`, formularios con `parche_event_id` oculto, enlaces con `base` del contexto, sin premios/bolsa/inscripción/invitación por código/noticias/actividad. Dependencias nuevas justificadas por reutilizar los componentes originales: `lucide-react`, `clsx`, `tailwind-merge`.
- **QA:** Vitest 226/226 (navegación por contexto, formulario con inscripción, cierre/superadmin/deshabilitado, goles, zona horaria); `tsc`, `eslint`, `next build` sin errores; HTTP con `next start`: todas las rutas del jugador sin sesión → login conservando `next`, bundle sin secretos; remotas (ROLLBACK/solo lectura) 19/19, 13/13, 20/20, 40/40, 14/14, Copa de prueba 19/19; `verify_wc2026_import.py` 36/36; migraciones locales = remoto (13); el marcador pendiente heredado de Copa de prueba sigue intacto. **No probado:** recorrido con sesión real de jugador en navegador y revisión visual (no hay credenciales de prueba); las suites SQL locales no se repitieron porque no cambió el esquema.

### 5.18 Corrección de fidelidad: podio y confeti en el historial (2026-10-31)

Causa: la vista histórica (5.7) usaba una lista propia y no los componentes de `el-var` (`components/podium/{PodiumView,PodiumPlace,ConfettiCelebration}` y el `Leaderboard` original). Recuperados en `src/components/podio/` y montados en `HistoryView`: encabezado «Podio final», pedestales 2.º · campeón · 3.º con brillo animado, tarjetas de resumen (participantes, puntaje campeón, ventaja final) y clasificación con el `Leaderboard` original, en un panel de tema oscuro. Sin premios.
- **Datos:** solo la fotografía sellada, mediante el adaptador `toPodiumEntries` (`src/lib/historial.ts`): conserva posición, puntos y orden; no recalcula ni inventa desempates; si alguna fila clasificada no tiene estadísticas verificadas se usa la lista anterior (`StandingsList`). Los no clasificados siguen aparte. El aviso de corte histórico se conserva.
- **Confeti:** misma secuencia, colores y parámetros de `canvas-confetti` (dependencia del original). Adaptación mínima: el original la repetía cada 5 s sin fin; aquí se dispara **una vez** por torneo y sesión del navegador (`sessionStorage`), más un botón «Celebrar de nuevo». Respeta `prefers-reduced-motion` (el podio sigue visible), no corre en el servidor y limpia timers y lienzo. Lógica probada en `startCelebration`.
- **Reutilización:** `PodiumView` recibe cualquier clasificación ordenada; los futuros torneos finalizados (Fase 3.4) pueden usarlo sin cambios. No se creó ruta `/podio` ni tablas.
- **QA:** Vitest 235/235, `tsc`, `eslint` y `next build` sin errores; HTML renderizado con datos ficticios: 3 pedestales, 13 filas, brillo del campeón; verificador del Mundial 36/36; `remote_app_queries` 13/13. **No verificado visualmente en navegador** (Chrome no abre `localhost` en este entorno): confeti, modo claro/oscuro y móvil quedan pendientes de revisión de Alex.

### 5.19 Torneo de QA para recorrer al jugador (2026-10-30)

Para probar la Fase 3.3 sin tocar datos protegidos se creó un torneo **aislado** `qa-jugador` («QA Jugador (prueba)», zona America/Bogota, 2 fases, 6 equipos del catálogo, 6 partidos futuros, el primero ~40 min después de crearlo, y una final con equipos por definir). Está publicado e inscrito **solo** en el parche de prueba **ParchePrueba1** (`a8a72afb-fac6-418d-9030-389d0b3b3b35`, inscripción `2a4a1896-4450-44fb-8aa9-eb2dbe202163`). Script: `scripts/qa/preparar_qa_jugador.sql` (un solo uso; usa las funciones reales de Control con claims simulados; ensayado con ROLLBACK). No se modificó ninguna fila existente: huellas del historial, Copa de prueba (borrador, marcador pendiente conservado), Mundial y La Penúltima idénticas (verificador 36/36, Copa 19/19). Alex (superadministrador) no puede pronosticar; el jugador es el administrador no superadministrador de ParchePrueba1. `tests/remote_jugador_test.sql` (ROLLBACK) recorre pronósticos, edición, privacidad, clasificación, ajeno, superadministrador y **multiparche** (mismo usuario en dos parches con pronósticos distintos del mismo partido): 28/28. Despublicar o limpiar: el torneo puede cancelarse desde Control (no hay borrado).

### 5.20 Menú global de usuario (2026-10-30)

La cabecera de `(privado)/layout.tsx` sustituye el botón de apariencia, el bloque de usuario y «Cerrar sesión» por un único `UserMenu` (`src/components/layout/UserMenu.tsx`, recuperado de `UserMenuButton` de La Penúltima): **Mi perfil · Mis parches · Apariencia · Cerrar sesión**. La apariencia usa el mismo mecanismo (`useTheme`, exportado de `ThemeToggle.tsx`; sin segundo estado) y el cierre de sesión la acción `logout` existente. «Mi perfil» (`playerProfileHref`, `lib/navigation.ts`) apunta al perfil del parche y torneo de la URL actual; fuera de un torneo (y en el historial sellado) aparece deshabilitado con «Disponible dentro de un torneo», sin asumir ningún parche. Accesibilidad: `aria-haspopup/expanded`, `role=menu/menuitem`, Escape, flechas, clic fuera y cierre al elegir. Login y registro conservan su `ThemeToggle` público. `JuegoNav` no cambió. Pruebas: Vitest 244/244, `tsc`, `eslint`, `next build`. **QA visual e interacción en navegador no ejecutados** (la extensión de Chrome no responde en este entorno).

### 5.21 Noticias recuperadas de La Penúltima (2026-10-31)

**Original (`el-var`):** tabla `news` global (título, resumen, contenido, `related_match_id`), RLS de lectura para cualquier autenticado; **una noticia por partido cerrado**, generada por plantillas deterministas (sin IA; el texto «Generado por IA» al compartir era solo rótulo) desde la acción de cierre del administrador, con deduplicación por partido; bloques: resultado, liderato, movimientos, exactos, participación y «zona de premios». Rutas `/noticias` (portada con imagen, tarjetas) y `/noticias/[id]` (bloques con etiqueta, compartir en WhatsApp); acceso desde el menú de usuario y la sección «Noticias recientes» de Comunidad. Las 89 noticias del respaldo (una por partido, 12 con contenido de premios y narrativa de una sola comunidad) **no se importan**: contradicen la decisión 2.4 y nombran participantes; el Mundial sellado no tiene noticias.

**Modelo (migración `20261031120000_noticias.sql`, aplicada):** `news` con ámbito explícito: **torneo** (`parche_event_id` NULL, solo el resultado oficial) y **parche** (la narrativa original con la tabla de ESE parche). Una fila por partido, revisión oficial y ámbito (índices únicos parciales = idempotencia); `superseded_at/reason` retira sin borrar. RLS: miembros de parches inscritos (torneo), miembros del parche (parche), superadministrador ve todo; ningún rol del cliente escribe. `control_news_context` y `control_publish_match_news` (solo superadministrador; publicar exige partido finalizado y la revisión vigente; auditado); `get_news_feed` / `get_news_item` son SECURITY INVOKER (por partido se muestra la noticia del parche y, si no existe, la del torneo). `get_parche_event_leaderboard` ahora delega en `private.parche_event_leaderboard` (misma consulta) para que el generador calcule la tabla sin ser miembro.

**Generación:** `src/lib/news/{templates,build,pick}.ts` (plantillas y bloques originales; sin narrativa de «equipo de la comunidad», etiquetas de selecciones ni premios). La acción de Control que finaliza o corrige un partido publica tras el cierre (`publishMatchNewsSafely`: reintento único, nunca deshace el cierre; si falla se avisa y `reconcileEventNews` lo reintenta al abrir Control → Resultados). Una **corrección o reapertura** retira por trigger las noticias de la revisión anterior (`corrected`/`reopened`); al finalizar de nuevo se publican las nuevas. Sin cron; no se genera al ver páginas ni con marcadores en vivo; no recalcula puntos.

**Interfaz:** `/parches/[parcheId]/torneos/[parcheEventId]/noticias` y `/noticias/[newsId]` con el diseño original (la portada es el asset original copiado sin cambios, rotulado «La Penúltima News»); acceso desde «Noticias recientes» en Comunidad y un enlace secundario «Noticias» en la barra de contexto (móvil) y en las pestañas (escritorio). La barra inferior conserva sus 5 pestañas y el menú global no cambia. Fechas en la zona del torneo; paginación «Ver noticias anteriores».

**QA:** `local_noticias_test.sql` 50/50 y `local_noticias_concurrency.sh` 3/3 (8 publicaciones simultáneas → 2 filas; corrección concurrente); suites locales previas 89/35/160/58/69 y concurrencias 5/7 sin cambios; remotas con ROLLBACK: `remote_noticias_test` 14/14, rls 19/19 (se acotó a los partidos del Mundial: el torneo QA es visible), app 13/13, parches 20/20, control 40/40, motor 14/14, jugador 28/28, Copa 19/19; verificador del Mundial 36/36; Vitest 261/261; `tsc`, `eslint`, `next build`. **No probado:** el recorrido visual con sesión real. Pendiente: confirmar la marca «La Penúltima News» de la portada; torneos futuros (podio, Copa) y noticias de hitos (inicio de fase, fin de torneo) no se generan.

### 5.22 Operación de partidos en Control como en La Penúltima (2026-10-31)

**Hallazgo:** el editor de resultados de la Fase 3.2 (`LiveResultEditor`, `ResultCard`) vivía solo en Control → Resultados; **Control → Partidos** seguía siendo un listado genérico de tarjetas con «Editar partido», sin distinguir los partidos en vivo. En `el-var` el administrador operaba desde un calendario (`AdminCalendarView` + `AdminCalendarRow`, con `MatchEditorCard` como vista de tarjetas): partidos agrupados por día con filtros rápidos (arranca en «En vivo» si hay alguno), fila con hora · grupo · estado, equipos con marcador y, debajo, estado + goles + «Guardar» en la misma fila; la fila en vivo lleva borde y fondo rojos.

**Recuperado (`src/components/control/{MatchBoard,MatchRow}.tsx`, lógica pura en `src/lib/control/board.ts`):** calendario por día de la **zona del torneo** (días pasados plegados), filtros Todos / En vivo / Hoy / Próximos / Finalizados / Aplazados y cancelados, aviso «N partidos en vivo», fila con chip rojo pulsante y marcador rojo en vivo, y operación en la fila con el mismo `LiveResultEditor` (nuevo modo `compact`) y la misma acción `updateLiveResultAction`: no hay segundo editor ni segundo flujo. Programado → «Iniciar partido»; en vivo → «Guardar marcador» / «Finalizar partido» (confirmación con el marcador exacto); finalizado → «Corregir resultado» (motivo obligatorio) y enlace a la reapertura en Resultados; aplazado/cancelado → estado claro (cancelado sin salida); importado e historial → solo lectura; el marcador pendiente heredado se resuelve en Resultados. Los filtros por fase/estado/fechas siguen en «Más filtros».

**Diferencias justificadas:** múltiples torneos y zona horaria del torneo (no Bogotá), estados aplazado/cancelado, revisión (`result_revision`) en cada guardado (conflicto «Alguien cambió este partido…»), corrección con motivo en lugar de edición silenciosa, ganador de llave en la misma operación atómica (no en un RPC aparte) y Resultados se conserva para reapertura y pendientes heredados.

**Corrección:** `publishMatchNews` ya no publica si el torneo no tiene parches inscritos (no hay audiencia). Antes, abrir Control → Resultados de **Copa de prueba** (sin parches) publicó 1 noticia compartida del partido 3 (3-0) el 2026-10-30; las noticias no se borran (inmutables): queda como registro, sin efectos en puntos, marcadores ni marcador pendiente.

**QA:** `tests/remote_operacion_partidos_test.sql` (proyecto real, torneo QA, ROLLBACK): 27/27 — mismo `match_id`, estado, marcador y revisión para administrador y jugador, administrador de parche sin poder operar, en vivo sin puntos ni noticias, conflicto de revisión, finalizar → puntos, clasificación y noticias sin duplicados, corrección y reapertura retiran puntos/noticias, cancelado definitivo, Copa de prueba y Mundial intactos. Vitest 276/276, `tsc`, `eslint` y `next build` sin errores. **No probado visualmente** (la extensión de Chrome no abre `localhost`).

**Corrección de fidelidad (2026-11-01):** la primera versión de la fila reutilizaba el JSX de `LiveResultEditor` (formulario de `ActionForm`: tarjeta grande, selector alto, cajas de 40×56 px y «Guardar» de ancho completo), que es el editor de Resultados y no el de la fila original. `MatchRow` es ahora un port directo de `AdminCalendarRow`: fila 1 hora · `G.x` · estado (`En vivo` rojo pulsante / `Fin.` / `Prog.`), fila 2 equipos con marcador de 48 px, fila 3 una sola línea `select` (h-8) · dos cajas de goles (h-8 w-10, sin botones +/-: el original no los tiene) · «Guardar» (h-8, ancho de contenido) · icono de enlace al partido; ganador de la llave en una fila aparte cuando hay empate en eliminatoria; encabezado de día fijo con contadores (`N partidos · N vivo · N fin. · N prog.`). Misma acción `updateLiveResultAction` (y `reopenMatchAction` para Finalizado → En vivo), misma revisión; Finalizar, Corregir y Reabrir piden confirmación en línea con el marcador exacto y las dos últimas exigen motivo. `LiveResultEditor` recuperó su forma única (Resultados). Sin migraciones.

### 5.23 Fase 3.4 — Copa, mejores terceros, cuadro, progresión y podio (2026-11-01)

Sin migraciones: todo se deriva de `event_stages` y `matches` (única fuente de resultados). Recuperado de `el-var` (solo lectura): `/copa` + `components/admin/ClassificationTabs.tsx` («Camino a la Copa»), `lib/classification.ts` (tabla de grupos con desempate por enfrentamientos, mejores terceros, `resolveSlot`, `assignBestThirdSlots`, conectores del bracket), `lib/best-third-matrix.ts` (495 combinaciones oficiales) y sus pruebas, `/podio` + `BottomNav` (Podio sustituye a En Vivo).

**Compatibilidad (`src/lib/copa/format.ts`, calculada con los datos del torneo, nunca asumida):**
- `none`: sin partidos de eliminatoria → no hay Copa (la ruta responde 404 y no se ofrece el acceso). Es el caso de Copa de prueba.
- `knockout`: eliminatoria sin la matriz de terceros. Se muestra «Por fase»; el **Bracket** solo si el árbol es verificable (rondas que se reducen a la mitad, final única, cada cruce con dos «Winner M##» de la ronda anterior; el tercer puesto se detecta por «Loser M##»). Es el caso de QA Jugador (grupos + final con texto libre).
- `worldcup`: 12 grupos A–L, 5 rondas, 16 dieciseisavos y exactamente los 8 cruces «Best 3rd (…)» de la matriz (M74, 77, 79, 80, 81, 82, 85, 87). **Solo aquí se aplica la matriz.** Cualquier otro formato deja los terceros como «proyección pendiente».

**Reglas del cuadro:** solo resultados **oficiales** cerrados (`finished` + `result_confirmed_at`): ni en vivo, ni cancelados, ni importados sin cierre. Empate de una llave sin ganador oficial no avanza a nadie. Un cupo es «oficial» si el equipo está asignado, el grupo está completo o el ganador/perdedor de la llave referida está definido; «proyección» (🔮) si el grupo sigue abierto. Para ESCRIBIR un clasificado se exige además que no haya empate total en los criterios implementados (puntos, enfrentamiento directo, diferencia, goles): FIFA aplica juego limpio y ranking, que no se implementan; el nombre solo es un último recurso de orden para mostrar, nunca para asignar (`groupHasUnresolvedTie`, `thirdsCutIsAmbiguous`).

**Progresión (solo Control → Partidos, `BracketPanel` + `advanceBracketAction`):** la Copa de los jugadores se **deriva al leer**, así que siempre es coherente con los resultados oficiales. Asignar los equipos en `matches` (necesario para pronosticar) es explícito: «Asignar N clasificados» (con confirmación que lista cada cupo) llama a `control_save_match` solo para equipos AUSENTES de partidos `scheduled`; es idempotente, auditada y respeta los bloqueos de la base (pronósticos, historial). **Nunca sobrescribe** un equipo asignado ni toca partidos iniciados. Si una corrección o reapertura cambia quién avanza y un cruce posterior ya tenía otro equipo, se muestra un **conflicto** (con aviso si ese partido ya empezó). Además `downstreamBlock` rechaza (con mensaje) corregir un finalizado de forma que cambie quién avanza, o reabrirlo, si un partido que depende de él ya está en vivo o finalizado (`src/lib/copa/guard.ts`). Sin propagación destructiva.

**Jugador:** `/parches/[parcheId]/torneos/[parcheEventId]/copa` (vista «Por fase» por defecto, pensada para móvil; «Bracket» con desplazamiento horizontal contenido) y `/podio`. Ambas siguen el contexto parche × torneo; el historial sellado conserva `/historial` (el Mundial no pasa por el nuevo motor). **Podio:** solo con el torneo `finished`/`closed` (ciclo de vida; `isTournamentOver`), con la clasificación oficial de ESE parche (`get_parche_event_leaderboard`: sin superadministradores ni deshabilitados); antes del cierre redirige a En Vivo. Con 1 o 2 participantes no se inventan puestos; un empate en el primer lugar se declara como empate (etiquetas por posición real, no por el orden del arreglo). Navegación: las cinco pestañas no cambian; con el torneo finalizado **Podio sustituye a En Vivo**; **Copa** es un acceso contextual (junto a Noticias) solo si hay eliminatorias.

**QA:** Vitest 367/367 (+91: clasificación y mejores terceros del original 61, formato/resolución/plan/guardas, render del cuadro, podio y navegación); `tsc`, `eslint`, `next build` sin errores; `tests/remote_copa_podio_test.sql` 15/15 (ROLLBACK, dos parches en el mismo torneo: partidos compartidos, clasificaciones y podios independientes, aislamiento por `not_member`, deshabilitado y superadministrador fuera, sin escritura del cuadro para usuarios de parche, Mundial y Copa de prueba intactos); verificador del Mundial 36/36; Copa de prueba 0 fallos; `remote_motor_test` 0 fallos. `remote_jugador_test` y `remote_operacion_partidos_test` dependen de que el partido 2 de QA Jugador siga programado: hoy está finalizado (operación real de Alex) y fallan por `match_not_open`, no por cambios de código. **No probado visualmente** (Chrome no abre `localhost`).

### 5.24 Landing pública, autenticación en modales y onboarding (2026-11-01)

- **Portada pública en `/`** (indexable, `es-CO`, H1 único, metadatos y Open Graph solo textuales; sin dominio ni canonical porque no hay dominio confirmado): `src/components/landing/Landing.tsx` con textos en `src/lib/landing.ts` (hero «El fútbol se vive mejor en parche», cómo funciona en 4 pasos, ejemplo de puntos, vive los partidos, torneos, 7 preguntas frecuentes, cierre y pie). Con sesión, `/` redirige como antes (parche único o Mis parches). Sin imágenes ni assets nuevos: solo HTML/CSS e iconos/emojis.
- **Puntos:** el texto no inventa cantidades. El ejemplo (3 por marcador exacto, 1 por resultado) se rotula como los puntos de la fase de grupos del Mundial 2026 y la página aclara que cada torneo define los de cada fase; exacto y resultado no se suman; los penales no suman.
- **Torneos:** la portada no consulta la base (el catálogo es solo para autenticados y no hay torneos comerciales): estado informativo honesto, sin torneos, fechas ni precios.
- **Cupos y planes:** **no existe en el código ningún límite de participantes ni de pago** (ni columna ni validación). La portada no menciona planes, precios ni el tope de cinco; la dirección comercial (gratis hasta 5, de pago por encima) queda **sin implementar** hasta que se defina el cobro, con validación en servidor.
- **Modales** (`AuthModal.tsx`): `<dialog>` nativo con `showModal()` (trampa de foco, Escape, aislamiento del fondo, `aria-modal` y restauración del foco los aporta el navegador) + bloqueo del scroll, foco inicial en el primer campo, cambio login ⇄ registro ⇄ recuperación sin cerrar y protección contra cerrar mientras se envía (`PendingGuard` con `useFormStatus`). Los formularios son los de siempre (`LoginForm`, `SignupForm`, mismas Server Actions de Supabase Auth) más `ForgotForm`; un fallo de red devuelve un mensaje propio (las excepciones de `redirect`/`notFound` de Next no se capturan).
- **Rutas:** `/login` y `/registro` siguen existiendo y muestran la misma portada con el modal abierto (invitaciones, sesiones vencidas, enlaces guardados y el proxy no cambian; `next` se conserva y se valida con `safeNextPath`). El proxy ahora trata `/` como pública. Rutas privadas sin sesión → `/login?next=…`.
- **Recuperación de contraseña (nueva):** `requestPasswordReset` (`resetPasswordForEmail`, respuesta idéntica exista o no la cuenta) → enlace a `/auth/confirmar?next=/cuenta/contrasena` → pantalla privada `/cuenta/contrasena` (`updateUser({ password })`) → `/parches?contrasena=ok`. **Requiere** que las Redirect URLs de Auth incluyan `<origen>/auth/confirmar` y SMTP (ver 8); no se cambió la configuración de Auth.
- **Onboarding:** Mis parches sin parches muestra la bienvenida (qué es un parche, 3 pasos, «Crear mi parche» y cómo entrar por invitación); un parche recién creado sin torneos muestra «¿Qué sigue?» (invitar e incorporar un torneo). Invitaciones, membresías y permisos no cambiaron (un usuario puede estar en varios parches; la base evita duplicados).
- **QA:** Vitest 383/383 (+15: contenido y ausencia de promesas falsas, modal por modo, validaciones, errores, redirecciones, `/` pública); `tsc`, `eslint`, `next build` sin errores; `next start` en el puerto 3107 (detenido): `/`, `/login`, `/registro` 200 (robots: `/` index, las otras noindex), rutas privadas y `/cuenta/contrasena` 307 a login con `next`, `/auth/confirmar` inválido → login con aviso, bundle sin `service_role` ni `sb_secret_`. **No probado:** interacción en navegador (foco, Escape, scroll, teclado móvil), envío real de correos de confirmación/recuperación y revisión visual.

**Ajuste de la portada (2026-11-01):** la portada también se ve con sesión (el logo enlaza a `/`): el encabezado reutiliza `UserMenu` (variante `landing`: nombre visible también en móvil; «Mi perfil» solo si existe una ruta funcional; Mis parches · Apariencia · Cerrar sesión) y el CTA pasa a «Ir a mis parches» → `/inicio` (parche único o Mis parches; nunca crea un parche). Por eso el destino tras autenticarse sin `next` concreto es `/inicio` (`afterLoginPath`), no `/`. El hero explica el juego en el primer tramo («Pronostica partidos de fútbol y compite con tus amigos» + definición de parche + cuatro conceptos básicos) y el ejemplo Colombia–Argentina es una demostración de un partido **terminado** (pronóstico previo, marcador real, puntos según las reglas del torneo, parche ficticio), sin «En vivo».

### 5.25 Landing dinámica con torneo destacado (2026-11-01)

Migración `20261101100000_portada_torneos.sql` (aditiva, aplicada con `db push`; ensayada antes con ROLLBACK): `events.landing_visible` (por defecto **false**: nada se muestra hasta que el superadministrador lo autorice; QA Jugador, Copa de prueba y el Mundial no aparecen), tabla `landing_settings` de un solo registro (`featured_event_id`, sin acceso directo, RLS sin políticas) y funciones: `get_landing_tournaments()` (lectura pública mínima para `anon`/`authenticated`: slug, nombre, estado, primer/próximo/último partido, hay-en-vivo, destacado-manual; sin identificadores ni datos de parches), `control_set_landing_visible`, `control_set_featured_event` (null = automático) y `control_landing_featured` (solo superadministrador, auditadas).

**Elegibilidad (en la base):** autorizado + publicado (`scheduled`/`in_progress`) + con partidos + sin historial sellado + si está en juego, con algún partido aún por jugar (que haya partidos en vivo no basta). **Selección (`src/lib/landing-tournaments.ts`):** el destacado manual si sigue siendo elegible; si no, automático determinista: en juego (próximo partido más cercano) antes que próximos (primer partido más cercano), empates por nombre y slug. La preferencia manual se conserva aunque el torneo deje de ser elegible. Sin torneos: «Estamos preparando los próximos torneos». La portada hace una sola llamada por visita (sin polling, cron ni Realtime); los cambios de Control revalidan la portada.

**Control:** `/control/torneos` → por torneo publicado «Mostrar en la portada / Quitar» y «Destacar en la landing / Quitar destacado (modo automático)».

**CTA:** «Jugar este torneo» → visitante: modal de registro con destino `/jugar/<slug>` (se conserva al registrarse y al confirmar el correo); con sesión: `/jugar/<slug>` lista los parches de la persona (nunca elige uno por ella): ya participa → «Entrar al torneo»; administra y no participa → «Inscribir este parche» (acción existente `add_event_to_parche`, con confirmación); miembro → pedirlo a quien administra; deshabilitado → solo consulta; sin parches → crear uno. Un torneo que ya no admite participantes lo dice y ofrece alternativas.

**QA:** Vitest 407/407 (+20: selección y orden, descripciones, opciones de `/jugar`, landing con 0/1/N torneos y sesión); `remote_portada_test.sql` 25/25 (ROLLBACK: lectura anónima mínima, sin acceso a `events`/`landing_settings`, permisos de administración, torneo no publicado/finalizado/sellado/desautorizado no aparece, preferencia conservada, auditoría, datos intactos); `tsc`, `eslint`, `next build` y HTTP (`/` 200 con el estado vacío real, `/jugar/…` sin sesión → login con destino). Hoy **ningún torneo está autorizado**, así que la portada real muestra el estado vacío. **No probado:** interacción en navegador ni revisión visual.

### 5.26 Navegación por rol y continuidad del torneo elegido (2026-11-01)

- **Superadministrador (decidido en el servidor con `isPlatformAdmin()`, nunca por correo ni por datos del cliente):** administra desde Control y **no juega**. `/inicio` (destino tras autenticarse sin `next` concreto), `/parches`, `/parches/nuevo` y `/jugar/[slug]` lo redirigen a `/control`; `createParcheAction` y `enrollEventAction` lo rechazan en el servidor. Header: el logo y la navegación principal llevan a Control; el menú tiene Control · Apariencia · Cerrar sesión (sin Mis parches ni Mi perfil). En la portada ve «Control» en el encabezado y los CTA de participación se convierten en «Ir a Control» / «Administrar en Control». Las páginas internas de un parche (p. ej. el historial del Mundial) siguen accesibles por enlace directo. Un administrador de parche **no** es superadministrador: conserva Mis parches y su participación.
- **Continuidad:** «Jugar este torneo» → registro/login con destino `/jugar/<slug>` (sobrevive a la confirmación del correo) → sin parches: «Crear mi parche» lleva a `/parches/nuevo?next=/jugar/<slug>` → al crearlo regresa a `/jugar/<slug>`, donde el parche aparece con «Inscribir este parche» (confirmación explícita; nunca automático). `safeReturnToPlay` solo acepta rutas `/jugar/<slug>` (sin dominios, rutas relativas ni query/hash); cualquier otro `next` se ignora y se mantiene el comportamiento normal (ir al parche). Con un parche o varios, `/jugar` los lista para elegir; ya inscrito → «Entrar al torneo»; miembro sin permiso → pedirlo a quien administra; torneo no disponible → explicación y salidas.
- **QA:** Vitest 442 (menú y portada por rol, redirecciones de `/inicio` y `/parches`, retorno seguro, acciones del servidor para superadministrador y destinos maliciosos). Sin migraciones.

**Ajuste de CTAs y estado temporal (2026-11-01):** con torneo destacado, «Jugar este torneo» es el único CTA verde del primer tramo: «Crear cuenta» del encabezado pasa a botón con borde, el hero sustituye «Empezar a jugar» por el enlace discreto «Cómo funciona ↓» (sin torneo destacado el hero conserva «Empezar a jugar» + «Cómo funciona»; el cierre siempre conserva su CTA). La descripción (`describeTournament`) separa estado, inscripción y fechas con el instante de la petición (`now`, página dinámica) y la zona del torneo (`get_landing_tournaments` ahora devuelve `timezone`, migración `20261101110000`): programado con inicio futuro → «Próximamente · Inscripciones abiertas · Empieza el …»; oficialmente en curso → «En juego · … · Próximo partido: …»; programado con inicio ya pasado → sin «Empieza el» ni «En juego», solo «Inscripciones abiertas» y el próximo partido real si existe; sin fecha válida se omite. Vitest 457.

### 5.27 Primer torneo real: Liga Primera División Colombiana 2026-II e inscripciones anticipadas (2026-11-03)

- **Migración `20261103100000_inscripciones_anticipadas.sql` (aplicada, aditiva):** `private.event_publish_issues` ya no exige ≥2 equipos ni ≥1 partido; un torneo se publica (`draft → scheduled`) con zona horaria válida y al menos una fase, y recibe parches antes de tener calendario. Con partidos, cada lado sigue necesitando equipo o descripción. Los torneos ya publicados no cambian.
- **Torneo creado** con `scripts/torneos/crear_liga_primera_division_2026_ii.sql` (funciones reales de Control, idempotente): «Cuadrangulares y Final — Liga Primera División Colombiana 2026-II», slug `liga-primera-division-colombiana-2026-ii`, `943289fd-f8af-410c-b79c-641fd4ff845a`, `scheduled`, America/Bogota, sin fin oficial, sin equipos ni partidos, `landing_visible = false` (no aparece en la portada hasta autorizarlo) y sin parches inscritos. Fases: «Cuadrangulares semifinales» 3/1 y «Final» 8/6; la final **no** es eliminatoria porque es ida y vuelta (un empate de ida no exige ganador). No hay columnas de descripción, nombre corto ni inicio previsto: la fecha tentativa (14-nov) no se almacena; el inicio real saldrá del primer partido cargado.
- **Denominación genérica (decisión 2026-11-03):** sin marcas de patrocinadores ni logos de terceros en nombre, slug, metadatos o promoción; los clubes solo se nombran para identificar partidos. La primera versión usaba una marca comercial en nombre y slug; como no tenía parches, partidos ni pronósticos, se renombró con `scripts/torneos/renombrar_liga_primera_division_2026_ii.sql` (despublicar → `control_update_event` → publicar, auditado). El modelo no tiene descripción ni nombre corto.
- **Jugador:** un torneo sin partidos muestra «Estamos esperando la programación oficial» (inicio y tabla) en lugar de una clasificación con todos en 0 (`WaitingSchedule`).
- **QA:** `tests/remote_inscripcion_anticipada_test.sql` 26/26 (ROLLBACK, torneo de ensayo propio), `remote_portada_test` 26/26; huellas del historial (Mundial, snapshot, membresías, partidos) idénticas; solo cambian las de `events` y `stages` por las filas nuevas. Pendiente: cargar equipos, grupos y partidos oficiales cuando existan (Control → Equipos/Partidos).

### 5.28 Promoción de torneos futuros: portada y Mis parches (2026-11-03)

- **Migración `20261103110000_promocion_torneos_futuros.sql` (aplicada, aditiva):** `events.announced_start_date` (fecha civil sin hora; anuncio tentativo, **no** es la fecha de ningún partido y se ignora en cuanto hay primer partido) y `events.landing_blurb` (≤280 caracteres); `control_set_event_promo` (solo superadministrador, auditada `event_promo_updated`); `get_landing_tournaments()` devuelve ambos campos y ya **no exige partidos** a un torneo `scheduled` (el `in_progress` sigue necesitando algo por jugar). Se edita en Control → torneo → «Promoción en portada».
- **Selección compartida** (`src/lib/landing-tournaments.ts`, usada por la portada y por `/parches`): el destacado manual de Control manda si sigue elegible; si no, prioridad 1 = próximo (programado que aún no empezó: primer partido futuro o, sin calendario, fecha anunciada no vencida en la zona del torneo) con inscripciones abiertas; 2 = en curso (en juego, o programado cuyo primer partido ya pasó); 3 = próximo sin inscripciones (hoy no existe ese estado: un torneo publicado siempre admite parches). Desempate: fecha prevista (primer partido o anunciada), nombre, slug. Nada hardcodeado por nombre o id.
- **Portada:** el bloque destacado salió del hero (que conserva ilustración y logo) y es la sección `TournamentPromo` inmediatamente después: «PRÓXIMO TORNEO», nombre, texto, «Inicio previsto: 14 de noviembre · Sujeto a programación oficial», «Inscripciones abiertas», aviso de que equipos y partidos se anunciarán, CTA «¡Quiero participar!» (visitante → registro con destino `/jugar/<slug>`; con sesión → `/jugar/<slug>`, que ya resuelve crear parche, inscribir con confirmación y «Ya participa»; superadministrador → Control). El torneo en curso queda en «Otros torneos».
- **/parches:** sin parches, el estado vacío se conserva y su CTA «Crear mi primer parche» lleva `?next=/jugar/<slug>` (vuelve a inscribir); con parches, tarjeta compacta (`promoAction`: inscribir / entrar / ver inscritos / ver detalles; nunca reinscribe). Si la lectura falla no se muestra la promoción y nada más cambia.
- **Datos:** torneo real con `announced_start_date = 2026-11-14`, `landing_blurb` y `landing_visible = true` (`scripts/torneos/promocionar_liga_primera_division_2026_ii.sql`). `qa-jugador` sigue con `landing_visible = true` (anterior; no se tocó): aparece en «Otros torneos» y conviene ocultarlo desde Control cuando se quiera.
- **QA:** Vitest 467; `remote_promocion_test` 11/11, `remote_portada_test` 26/26, `remote_inscripcion_anticipada_test` 26/26 (ROLLBACK). Sin revisión visual en navegador.

### 5.29 Ilustración opcional de torneo administrada desde Control (2026-11-03)

- **Modelo:** migración `20261103120000_ilustraciones_torneos.sql` (aplicada, aditiva): `events.illustration_path` (nullable; ruta `<event_id>/<uuid>.<png|jpg|webp>`, nunca una URL), bucket público `event-illustrations` (lectura pública; png/jpeg/webp; 5 MB), políticas de Storage solo para superadministrador (select/insert/update/delete) y `control_set_event_illustration(evento, ruta|null)`: permiso global, torneo no cerrado/cancelado/sellado, ruta bajo el id del propio torneo, objeto existente, auditada (`event_illustration_changed`). `get_landing_tournaments()` devuelve `illustration_path`. Sin ilustración todo funciona igual (opcional; no interviene en publicar ni inscribir).
- **Control → Torneo → «Ilustración del torneo»** (`IllustrationPanel`): vista previa 16:9, «Subir/Reemplazar ilustración», «Quitar ilustración» (con confirmación). Recomendado 16:9, 1600 × 900. Sin editor ni recorte.
- **Validación (`src/lib/control/illustration.ts`, sin dependencias):** por contenido, no por nombre ni MIME declarado: firma + estructura (PNG con IHDR/IEND, JPEG con SOF y EOI, WebP con RIFF coherente y VP8/VP8L/VP8X), dimensiones 1–8000 px y ≤ 5 MB; rechaza SVG/HTML/ejecutables y archivos truncados. Base y bucket repiten tipo y tamaño. El nombre del objeto lo genera el servidor (uuid).
- **Reemplazo seguro** (`uploadIllustrationAction`): validar → subir objeto nuevo (nombre único, `cache-control` largo) → asociar con la RPC → solo entonces retirar el anterior; si asociar falla se retira el nuevo y la referencia anterior no cambia. Quitar: primero la referencia, luego el objeto. Como cada subida cambia la URL, no hay caché obsoleta. Supabase no permite borrar objetos por SQL: solo por la API de Storage. `next.config.ts` sube el límite de Server Actions a 6 MB para estas subidas.
- **Uso:** `illustrationUrl(path)` (`src/lib/illustration.ts`) arma la URL pública. `TournamentPromo` la muestra (móvil: arriba; escritorio: a la derecha; versión compacta más pequeña; sin ilustración, diseño anterior) con título, fechas y CTA como texto; la portada y `/parches` la reciben por `get_landing_tournaments()` (misma consulta que antes), y `WaitingSchedule` (torneo sin partidos, vista del jugador) la usa como cabecera. No hay imágenes en el repositorio ni se genera ninguna.
- **QA:** Vitest 481; `remote_ilustraciones_test` 14/14, `remote_promocion_test` 11/11, `remote_portada_test` 26/26 (ROLLBACK); sin objetos ni referencias creadas en producción. No se probó una subida real con sesión de superadministrador ni la revisión visual en navegador. El torneo real no tiene ilustración hasta que Alex suba un archivo.

## 6. Reglas de trabajo

- Diferenciar siempre **aprobado**, **heredado pero por evaluar** y **pendiente de decisión**.
- Antes de implementar, auditar esquema, Auth, permisos/RLS, puntuación, desempates, membresías, premios y migración histórica.
- No asumir que las reglas de puntos o premios de La Penúltima aplican automáticamente a todos los eventos de La Canchita.
- No ejecutar migraciones destructivas, purgas, cambios de credenciales, despliegues, commits o pushes sin autorización explícita.
- Nunca incluir secretos, hashes de contraseñas, datos personales ni el dump en Git.
- Validar restauración de prueba, integridad referencial y continuidad de inicio de sesión antes de migrar producción.
- No generar ni modificar imágenes salvo solicitud explícita.
- Mantener una experiencia sencilla, autoexplicativa y en español como idioma principal; evitar complejidad administrativa innecesaria.
- Al leer el dump, extraer solo agregados; no imprimir emails, nombres, hashes ni tokens.
- Extracciones con datos personales solo en directorios privados fuera del repo (permisos 700/600) y eliminarlas al terminar. `.gitignore` excluye `supabase/.temp/` y dumps.
- Cambios de esquema solo como migraciones versionadas en `supabase/migrations/`, ensayadas en local y con ROLLBACK en el destino, aplicadas con `npx supabase db push --linked` tras comprobar `supabase/.temp/project-ref`.

## 7. Propuestas pendientes de aprobación

Recomendaciones; no son decisiones.

- **Puntuación (HECHO en 5.15):** RPC (backend) que puntúe un partido en una sentencia para todos los parches, con resultado confirmado (`result_confirmed_at`) y auditoría transaccional; corregir el reinicio de puntos al reabrir un partido (defecto 3.5).
- **Cierre definitivo:** proceso que avance `event_close_runs` bajo lock por evento (precondiciones: partidos confirmados, sin revisiones abiertas; consolidar → verificar huella → respaldo frío → purgar pronósticos → `events.status = closed`). Ni el proceso ni la programación automática existen todavía.
- **Formalizar el Mundial 2026:** si se decide, crear un close run y una fotografía `final_close` v2 que copie la v1 sin alterarla; requiere fijar `official_end_at` con fuente oficial y confirmar resultados.
- **Perfiles de usuario** (nombre visible editable, fuera de `raw_user_meta_data`). El superadministrador de plataforma ya existe (sección 5.12); queda pendiente un procedimiento para dar de alta/baja a otros superadministradores (hoy solo con el rol dueño de la base).
- **Parches:** transferir la propiedad (owner), eliminar o archivar parches, expulsar definitivamente a un miembro, invitaciones de un solo uso o con límite elegido por el administrador, ver la auditoría en la interfaz, decidir cuándo un miembro participa en un `parche_event`.
- Diseño, navegación y MVP de La Canchita.

## 8. Riesgos y preguntas abiertas

- Cupos Supabase Free: lacanchita se creó en la organización AlexSosa-Gamestudios; confirmar el límite de proyectos gratuitos de esa organización antes de reactivar AlexAgent.
- Login con contraseña original demostrado para 1 de 18 cuentas; las otras 17 solo tienen verificación estructural (hashes idénticos). Si alguna fallara, revisar configuración de Auth antes de cualquier acción; no reimportar.
- **Equipos de eliminatoria, campeón y subcampeón son derivados** con la lógica original (sin desempates alfabéticos y con cuadro coherente), no contrastados con una fuente oficial externa. La lógica original no implementa fair play ni ranking FIFA; no hizo falta en estos datos.
- **Corte histórico, no cierre oficial:** el Mundial 2026 está `finished` y su fotografía es `historical_cut`. `official_end_at` y `result_confirmed_at` están vacíos por falta de evidencia.
- Tratamiento de deshabilitados y administrador: implementados como filas `unranked` con su motivo y cero real, sin posición ni premio. Si se prefiriera excluirlos de la fotografía, haría falta una v2 (la v1 sellada es inmutable).
- El rol `owner` del parche se asignó al dueño original (`groups.owner_id`), que también era el administrador global de La Penúltima. El 2026-10-30 se dio de alta como superadministrador global al mismo usuario (sección 5.12): son dos roles distintos.
- Monetización: retirada de la interfaz, el código y Supabase (5.10). Solo permanece en el respaldo original de La Penúltima, que no se modifica.
- Revisión visual de ambos temas en navegador real pendiente (solo verificada por pruebas y HTML).
- `public.rls_auto_enable()`: EXECUTE revocado a roles de cliente (sección 5.7). Si Supabase recrea la función en una actualización de plataforma, volver a revisar sus permisos. Protección de contraseñas filtradas (Auth) sigue desactivada: pendiente de autorización.
- Login desde la nueva UI con una cuenta real aún no validado por Alex. Registro, confirmación de correo e invitaciones tampoco se han probado con cuentas reales.
- **Registro y confirmación:** dependen de la configuración de Auth del destino, que no se cambió:
  - las Redirect URLs deben permitir `<origen>/auth/confirmar`; si no, Supabase redirige al Site URL y se pierde la invitación (el usuario puede volver a abrir el enlace tras iniciar sesión);
  - el SMTP integrado de Supabase tiene un límite de envíos muy bajo;
  - el registro está abierto para cualquiera, no solo para invitados;
  - `NEXT_PUBLIC_SITE_URL` debe fijarse en producción para que los enlaces de invitación y confirmación usen el dominio correcto.
- El token de invitación viaja en la ruta (`/invitacion/<token>`): puede quedar en registros de acceso del hosting. Se mitiga con `no-referrer`, vencimiento a 7 días, revocación y almacenamiento solo del hash.
- El revisor de Supabase avisa (WARN) de que `authenticated` puede ejecutar 9 funciones `SECURITY DEFINER`. Es intencional: son la única vía de escritura y cada una valida `auth.uid()`, el rol y el estado. `anon` no puede ejecutarlas.
- El nombre visible de las cuentas sin `username` es el prefijo del correo (mismo criterio que La Penúltima): lo ven los demás miembros del parche.
- Un miembro que entra a La Penúltima por invitación pasa a ver su historial completo (comportamiento coherente con la regla de visibilidad por membresía).
- Si se elimina una cuenta, su fila histórica queda con `user_id` NULL y la verificación de huella de esa fotografía pasa a fallar (cambio esperado y detectable).
- Rollback del Auth importado o del historial: operaciones destructivas que requieren autorización explícita (el historial sellado además está protegido por triggers).
- Configuración de Auth (URLs, SMTP, confirmación de email) no está en el dump; se define en el destino (sección 4.5).
- ¿Se conservan las 89 noticias en algún formato? (No se importaron.)
- Correcciones excepcionales tras la purga: sin pronósticos no es posible recalcular; requiere un procedimiento de enmienda auditada (nueva versión de fotografía).
- Retención de respaldos fríos antes de purgar (plazo y ubicación).
- Fuente oficial de la fecha de finalización de cada evento para el plazo de 30 días.
- Política de visibilidad y privacidad. Límites de plan por tamaño de parche: pendiente de decidir si siguen vigentes tras la decisión de no monetizar.

## 9. Mantenimiento de este documento

Actualizar este archivo cada vez que se apruebe una decisión significativa. No convertir hipótesis en requisitos definitivos. Si una decisión cambia, sustituir la regla anterior y registrar brevemente la razón, evitando instrucciones contradictorias. Mantenerlo útil como referencia de proyecto, no como bitácora extensa de cada conversación.
