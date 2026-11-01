# La Canchita

Pronósticos de fútbol entre amigos, organizados en parches. Decisiones, estado, migraciones y QA: ver `CLAUDE.md`.

## Ejecutar en local

Requisitos: Node 22 (`~/.nvm/versions/node/v22.23.2`; npm 10.8 de Node 20 falla al instalar).

```bash
cp .env.example .env.local      # completar NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (clave pública "publishable")
npm install
npm run dev                     # http://localhost:3000
```

Verificaciones: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Rutas

`/login`, `/registro`, `/` (entra directo si tienes un solo parche), `/parches`, `/parches/nuevo`,
`/parches/[id]`, `/parches/[id]/participantes`, `/parches/[id]/torneos/[id]`, `/invitacion/[token]`, `/auth/confirmar`.

## Base de datos (Supabase `lacanchita`, ref `cfzxentitxytnvvumfpv`)

- Migraciones en `supabase/migrations/`; aplicar con `npx supabase db push --linked` tras comprobar `supabase/.temp/project-ref`.
- Ensayo local completo (Postgres desechable en 127.0.0.1:55432 con `cluster_name=lacanchita-local-test`):
  `scripts/history-migration/local_rebuild.sh <dump> <node22> <dir-privado-fuera-del-repo>`.
- Pruebas SQL en `scripts/history-migration/tests/`: `local_*` (datos ficticios, ROLLBACK) y `remote_*` (destino real,
  solo lecturas y rechazos, ROLLBACK): `npx supabase db query --linked -f <archivo>`.
- Verificación del historial: `scripts/history-migration/verify_wc2026_import.py`; huellas: `scripts/history-migration/fingerprints.sql`.

## La Canchita Control

Consola `/control` para el superadministrador global. **Los torneos se preparan mediante importaciones verificadas con asistencia de ChatGPT y Claude Code; La Canchita Control se utiliza para administrarlos y mantenerlos actualizados** (editar datos, fases y puntos, equipos, partidos y resultados con confirmación manual). Las rutas usan el slug del torneo (`/control/torneos/copa-de-prueba`); los marcadores pendientes son privados y solo los ve el superadministrador. Solo la ven y la usan los superadministradores (`private.platform_admins`); para los demás responde 404. Detalle en `CLAUDE.md` (secciones 2.7 y 5.12). El alta del primer superadministrador es `scripts/control/alta_superadmin.sql` (se ejecuta una vez, con el rol dueño). Todavía no existe el motor de puntuación ni la captura de pronósticos.

Equipos: un único catálogo global con tipo (selección / club); banderas emoji para selecciones y escudos opcionales para clubes (bucket `team-crests`, subida solo de superadministradores). Un marcador pendiente se confirma siempre verificando en el servidor el valor exacto guardado. Detalle en `CLAUDE.md` (5.14).

Motor de juego (Fase 3.1): pronósticos por parche y torneo, puntuación idempotente desde `event_stages`, clasificación por parche, reapertura/aplazamiento/cancelación. Contratos en `src/lib/juego/` y detalle en `CLAUDE.md` (5.15). Las pantallas del jugador llegaron en la Fase 3.3.

Partidos (Fase 3.2): el marcador se guarda directo y es público al instante; «Finalizado» cierra el partido y calcula los puntos; los partidos pasan a «En vivo» por sincronización perezosa (`sync_due_matches`). Detalle y contratos en `CLAUDE.md` (5.16).

Jugador (Fase 3.3): inicio, calendario, pronósticos, detalle, En Vivo, tabla, comunidad, perfil y reglas bajo `/parches/<parche>/torneos/<inscripción>/…` (identidad original de La Penúltima). Detalle en `CLAUDE.md` (5.17); «Copa» llega en la Fase 3.4.

Noticias: una noticia automática (plantillas deterministas, sin IA) por partido finalizado, en dos ámbitos (torneo y parche), con corrección/reapertura que retiran las anteriores. Rutas `.../torneos/<inscripción>/noticias`. Detalle en `CLAUDE.md` (5.21).

- **Control → Partidos** es el calendario operativo recuperado de La Penúltima: filtros rápidos, partidos en vivo destacados y edición del marcador en la misma fila (ver CLAUDE.md §5.22).
- Jugador: **Camino a la Copa** (`/copa`, solo torneos con eliminatorias) y **Podio** (`/podio`, solo con el torneo finalizado). Control → Partidos asigna a los clasificados con resultados oficiales.
- Portada pública en `/` con login, registro y recuperación de contraseña en modales (`/login` y `/registro` abren la misma portada con el modal).
- La portada muestra el torneo destacado (elegido en Control → Torneos o automático) y lleva a `/jugar/<torneo>` para elegir con qué parche jugar.
