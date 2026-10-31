# DLCritic

Catálogo y reseñas de videojuegos. Frontend estático (HTML/CSS/JS) + backend Node.js/Express + base de datos SQLite.

## Correr en local

```bash
npm install
npm start
```

Abrí `http://localhost:8793`.

## Estructura

- `public/index.html` — todo el frontend (sin build step, HTML/CSS/JS plano).
- `server/index.js` — API REST (Express).
- `server/db.js` — esquema de la base de datos (SQLite vía `node:sqlite`, nativo de Node 22+).
- `server/auth.js` — hash de PIN (scrypt) y sesiones por cookie httpOnly.
- `server/rateLimit.js` — límite de intentos por IP/usuario en endpoints sensibles.
- `server/admin.js` — API del panel de administración (requiere sesión + `is_admin`).
- `server/make-admin.js` — script de línea de comandos para promover un usuario a admin.
- `public/admin.html` — el panel de administración (página aparte, con su propio script).
- `public/uploads/` — imágenes de portada subidas desde `/admin`.
- `server/seed.js` + `server/seed-*.json` / `server/catalog.json` — datos de arranque (los 93 juegos base, sus fichas técnicas, el calendario de fechas y las noticias). Se insertan en la base **una sola vez**, la primera vez que corre el servidor contra una base vacía — después viven ahí y los edita el admin, no estos archivos.
- `data.db` — el archivo de base de datos (se crea solo al arrancar; no se sube a git). Es la única fuente de verdad: todo el catálogo (juegos base + agregados), el calendario y las noticias viven acá, no hay datos estáticos en el HTML.

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
2. Corré `npm run make-admin <tu_usuario>` en la terminal del servidor.
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

Si más adelante crece el tráfico o querés múltiples instancias del servidor, conviene migrar de SQLite a Postgres (el esquema en `server/db.js` es casi calcado a SQL estándar, así que el cambio es menor). Para eso, Render/Railway ofrecen Postgres administrado con un click.

## Notas de seguridad

- El PIN de 4 dígitos se guarda con hash (scrypt + salt), nunca en texto plano.
- Las sesiones usan cookies `HttpOnly` + `SameSite=Lax` (no accesibles desde JS, mitigan XSS/CSRF básicos).
- Sigue sin ser un sistema de autenticación "serio" (PIN de 4 dígitos = 10,000 combinaciones) — están bien las advertencias que ya tenía la UI al respecto.
