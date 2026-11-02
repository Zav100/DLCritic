# DLCritic

Catálogo y reseñas de videojuegos. Frontend estático (HTML/CSS/JS) + backend Node.js/Express + base de datos PostgreSQL (Neon).

## Correr en local

Hace falta Node 22+ y una base Postgres. Dos formas de tenerla:

**A) Postgres embebido (sin cuenta ni internet, para desarrollar).** Guarda los datos en `.pgdata/` (fuera de git):

```bash
npm install
node -r ./scripts/local-env.js scripts/migrate.js   # crea las tablas
node -r ./scripts/local-env.js scripts/seed.js      # carga el catálogo base
npm run dev:local
```

**B) Con Neon.** Creá un proyecto en [neon.tech](https://neon.tech), copiá la URL "Pooled connection" y:

```bash
cp .env.example .env.local        # y pegá la URL en DATABASE_URL= (.env.local no se sube a git)
npm install
npm run db:migrate && npm run db:seed
npm run dev
```

Abrí `http://localhost:8793`.

Con el CLI de Neon (`npm i -g neon`, luego `neon login`) el proyecto ya queda enlazado (`neon.ts` + `.neon`) y `neon init` / `neon checkout <rama>` escriben `DATABASE_URL` en `.env.local` por vos. Las ramas de Neon sirven de copias desechables de la base: `neon checkout dev --create` crea la rama `dev` (se borra sola a los 7 días) y `neon checkout production` vuelve a la principal. Mirá siempre `NEON_BRANCH` en `.env.local` para saber contra qué rama estás escribiendo.

**Traer los datos de la base SQLite anterior (`data.db`)** — sobre una base recién migrada y **sin** correr el seed (copia usuarios, contraseñas, reseñas, todo; conserva los ids y verifica los conteos):

```bash
npm run db:import -- data.db                                        # contra Neon
node -r ./scripts/local-env.js scripts/import-sqlite.js data.db     # contra el Postgres embebido
```

**Prueba de humo** (registro, reseñas, listas, seguimiento, panel de admin…; borra lo que crea): `npm run test:smoke`, o `node -r ./scripts/local-env.js scripts/smoke-test.js` en local.

## Estructura

- `public/index.html` — todo el frontend (sin build step, HTML/CSS/JS plano).
- `server/index.js` — API REST (Express).
- `server/db.js` — acceso a PostgreSQL (driver `pg`; Neon en producción). Mantiene la forma que tenía SQLite, `db.prepare(sql).get/all/run(...)`, pero asíncrona (`await`).
- `server/schema.sql` — el esquema de la base. `npm run db:migrate` lo aplica (es seguro repetirlo).
- `scripts/` — `migrate.js`, `seed.js`, `import-sqlite.js`, `smoke-test.js` y `local-env.js` (modo local con Postgres embebido).
- `server/auth.js` — hash de PIN (scrypt) y sesiones por cookie httpOnly.
- `server/rateLimit.js` — límite de intentos por IP/usuario en endpoints sensibles.
- `server/admin.js` — API del panel de administración (requiere sesión + `is_admin`).
- `server/make-admin.js` — script de línea de comandos para promover un usuario a admin.
- `public/admin.html` — el panel de administración (página aparte, con su propio script).
- `public/uploads/` — imágenes de portada subidas desde `/admin`.
- `server/seed.js` + `server/seed-*.json` / `server/catalog.json` — datos de arranque (los 93 juegos base, sus fichas técnicas, el calendario de fechas y las noticias). Se insertan en la base **una sola vez**, al correr `npm run db:seed` contra una base vacía — después viven ahí y los edita el admin, no estos archivos.
- La base de datos es la única fuente de verdad: todo el catálogo (juegos base + agregados), el calendario y las noticias viven ahí, no hay datos estáticos en el HTML.
- `data.db` — la base SQLite anterior (no se sube a git). Ya no la usa el servidor; queda para `npm run db:import`.

## Funcionalidad agregada en esta ronda

- **Portadas reales**: el servidor busca la carátula del juego en la API pública de Steam y la cachea en la tabla `game_covers` (30 días). Si un título no está en Steam, se mantiene el emoji como respaldo.
- **Skeleton loaders**: las grillas de la portada muestran tarjetas "esqueleto" animadas mientras llega la respuesta de la API, en vez de quedar en blanco.
- **Rutas reales por juego + Open Graph**: cada juego tiene su propia URL (`/juego/elden-ring`, etc.) que se puede compartir, recargar o guardar como favorito del navegador. Al compartir ese link, el servidor genera dinámicamente el título, descripción (con la nota promedio) y la imagen de portada para la vista previa (WhatsApp, Twitter/X, Discord, Slack...).
- **Rate limiting**: máximo 8 intentos de registro/login cada 10 minutos por IP, y 40 escrituras (reseñas/juegos nuevos) cada 10 minutos por usuario. Devuelve `429` con `Retry-After`.
- **Nav inferior en mobile**: en pantallas angostas (≤680px) el menú pasa a una barra fija abajo, más cómoda para el pulgar.
- **Glassmorphism**: banner de portada difuminada en la ficha de cada juego, tarjetas destacadas, toasts y el diálogo de confirmación (reemplaza el `confirm()` nativo del navegador) ahora usan vidrio esmerilado (`backdrop-filter`).
- **Transiciones de vista**: cambiar de sección usa la View Transitions API (con fallback silencioso donde no está soportada).
- **Compartir reseña**: cada reseña tiene un botón para compartirla (nativo, WhatsApp, X o copiar texto+link).
- **Panel de administración** (`/admin`): ver sección dedicada abajo — administra TODO el catálogo (no solo lo agregado a mano), el calendario de fechas y las noticias.
- **Catálogo 100% en base de datos**: los 93 juegos que antes vivían como datos estáticos en `public/index.html` (además de sus fichas técnicas, el calendario y las noticias) ahora son filas reales en `data.db`, sembradas una sola vez al arrancar por primera vez. Esto es lo que hace posible editarlos/ocultarlos desde `/admin`.

## Panel de administración

`/admin` es una página aparte (no forma parte de la SPA principal) con tres secciones:

- **🎮 Juegos** — el catálogo completo (los 93 base + lo que agreguen usuarios o el propio admin), no solo lo agregado a mano. Desde ahí se puede:
  - Editar la ficha completa de cualquier juego: portada (subida de imagen real), descripción, desarrollador, editor, año, modo de juego, género, plataformas y un link directo a cada tienda (en vez del link de búsqueda automático que usa el resto del catálogo).
  - **Ocultar** un juego (👁️/🙈 en la tabla) — desaparece de `/api/games` y por lo tanto de toda la página pública, pero sigue en la base para poder mostrarlo de nuevo cuando quieras.
  - **Destacar/quitar de "Juegos nuevos"** (🆕) — es un flag independiente de ocultar: un juego puede dejar de estar en "Juegos nuevos" y seguir apareciendo normalmente en "Explorar" junto a todos los demás.
  - Borrar un juego definitivamente.
  - Hay un buscador arriba de la tabla porque son ~90+ juegos.
- **📅 Fechas importantes** — CRUD del calendario que se ve en Novedades (mes, día, título/descripción en ES y EN, y opcionalmente un juego relacionado buscando por título).
- **📰 Noticias** — CRUD de la sección "Noticias del mundo gamer" (título, resumen, fuente, link, color de la insignia; las iniciales se autogeneran de la fuente si las dejás vacías).

**Para habilitar tu cuenta como admin:**
1. Registrate normalmente en la app (`/` → Iniciar sesión → Registrarme).
2. Corré `npm run make-admin -- <tu_usuario>` en la terminal del servidor (usa la base de `.env.local`).
3. Entrá a `/admin` con esa misma cuenta.

Las imágenes subidas se guardan en `public/uploads/` (servidas como archivos estáticos) y quedan fuera de git — si desplegás en un host con disco efímero (como el free tier de algunos servicios), asegurate de que ese directorio esté en un volumen persistente, igual que `data.db`.

## API

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/auth/me` | — | usuario de la sesión actual |
| POST | `/api/auth/register` | — | crear cuenta `{username, pin}` |
| POST | `/api/auth/login` | — | iniciar sesión `{username, pin}` |
| POST | `/api/auth/logout` | — | cerrar sesión |
| GET | `/api/games` | — | catálogo completo visible (todo lo no oculto) |
| POST | `/api/games` | ✔ | agregar juego manual (título + género, básico) |
| GET | `/api/date-events` | — | calendario de fechas importantes |
| GET | `/api/news` | — | noticias del feed |
| GET | `/api/reviews` | — | todas las reseñas |
| PUT | `/api/reviews/:gameId` | ✔ | crear/actualizar tu reseña (rating/texto/plataformas) |
| DELETE | `/api/reviews/:gameId/text` | ✔ | borrar solo el texto |
| DELETE | `/api/reviews/id/:id` | ✔ | borrar tu reseña completa |
| POST | `/api/reviews/id/:id/helpful` | ✔ | votar "te sirvió" |
| GET/PUT | `/api/daily` | ✔ | progreso del reto diario |
| PUT | `/api/profile/favorite` | ✔ | juego favorito |
| POST | `/api/profile/wishlist/toggle` | ✔ | agregar/quitar de la wishlist |
| POST | `/api/profile/activity` | ✔ | registrar día de actividad (racha) |
| GET | `/api/admin/games` | ✔ admin | listar TODOS los juegos (incluye ocultos), ficha completa |
| POST | `/api/admin/games` | ✔ admin | crear juego con ficha completa |
| PUT | `/api/admin/games/:id` | ✔ admin | editar juego (incluye `hidden`, `isNewRelease`, `newReleaseDate`) |
| DELETE | `/api/admin/games/:id` | ✔ admin | borrar juego |
| POST | `/api/admin/upload` | ✔ admin | subir imagen de portada (`multipart/form-data`, campo `image`) |
| GET/POST | `/api/admin/date-events` | ✔ admin | listar / crear fechas del calendario |
| PUT/DELETE | `/api/admin/date-events/:id` | ✔ admin | editar / borrar una fecha |
| GET/POST | `/api/admin/news` | ✔ admin | listar / crear noticias |
| PUT/DELETE | `/api/admin/news/:id` | ✔ admin | editar / borrar una noticia |

## Desplegar en un host

Cualquier host que corra Node 22+ sirve. Opciones simples y con capa gratuita:

- **Render** (render.com) — conectá el repo, build command `npm install`, start command `npm start`. El disco de `data.db` necesita un "persistent disk" (Render lo ofrece en el plan free con límites, o de pago para más espacio).
- **Railway** (railway.app) — similar a Render, con volumen persistente para `data.db`.
- **Fly.io** — más control, requiere un volumen (`fly volumes create`) montado en la carpeta del proyecto.

La base ya es Postgres (Neon), así que `data.db` y el volumen persistente de la base dejaron de hacer falta; solo se necesita definir `DATABASE_URL` en el host. Todavía queda pendiente mover las imágenes subidas (`public/uploads/`) a un almacenamiento externo y adaptar el servidor a Vercel (ver el plan de migración).

## Notas de seguridad

- El PIN de 4 dígitos se guarda con hash (scrypt + salt), nunca en texto plano.
- Las sesiones usan cookies `HttpOnly` + `SameSite=Lax` (no accesibles desde JS, mitigan XSS/CSRF básicos).
- Sigue sin ser un sistema de autenticación "serio" (PIN de 4 dígitos = 10,000 combinaciones) — están bien las advertencias que ya tenía la UI al respecto.
