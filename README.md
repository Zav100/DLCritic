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

- `server/views/index.html` + `public/` (`js/`, `css/`, `img/`) — todo el frontend (sin build step, HTML/CSS/JS plano). El HTML lo entrega el servidor (así cada dominio muestra solo lo suyo) y el resto sale del CDN de Vercel.
- `server/index.js` — API REST (Express).
- `server/db.js` — acceso a PostgreSQL (driver `pg`; Neon en producción). Mantiene la forma que tenía SQLite, `db.prepare(sql).get/all/run(...)`, pero asíncrona (`await`).
- `server/schema.sql` — el esquema de la base. `npm run db:migrate` lo aplica (es seguro repetirlo).
- `scripts/` — `migrate.js`, `seed.js`, `import-sqlite.js`, `smoke-test.js` y `local-env.js` (modo local con Postgres embebido).
- `server/auth.js` — hash de PIN (scrypt) y sesiones por cookie httpOnly.
- `server/rateLimit.js` — límite de intentos por IP/usuario en endpoints sensibles.
- `server/admin.js` — API del panel de administración (requiere sesión + `is_admin`).
- `server/make-admin.js` — script de línea de comandos para promover un usuario a admin.
- `server/views/` — el HTML del sitio (`index.html`) y de las páginas legales (`terminos.html`, `privacidad.html`).
- `admin-ui/` — el panel de administración (HTML + `assets/`). Está fuera de `public/` a propósito: el servidor lo entrega solo en el dominio del dashboard (ver `ADMIN_HOST`).
- `public/uploads/` — imágenes de portada subidas desde `/admin`. Antes de subirse, el navegador las achica con `shrinkImage()` (lado largo máximo 2000 px, 1000 px en avatares, calidad 0.9; lo chico, los GIF y cualquier fallo suben tal cual). La función vive en `public/js/04-api-theme-rating.js` y está copiada en `admin-ui/assets/js/02-views-login-and-api.js`.
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

Las imágenes subidas (portadas, fotos de personajes, avatares; JPG/PNG/WEBP/GIF) se guardan en **Vercel Blob** cuando existe `BLOB_READ_WRITE_TOKEN` en el entorno, y en `public/uploads/` cuando no (desarrollo local, queda fuera de git). El servidor acepta hasta 4 MB por imagen porque Vercel rechaza requests de más de 4,5 MB; como el navegador achica las fotos grandes antes de subirlas, ese tope se nota sobre todo en los GIF, que no se achican (los textos de ayuda dicen eso). En la base se guarda la URL final de cada imagen. Para pasar a Blob las imágenes que ya estaban en `public/uploads/`: `npm run db:migrate-uploads` (primero con `-- --dry-run` para ver qué haría). La tarjeta de compartir dibuja las portadas de Blob a través de `/api/image-proxy`.

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

## Desplegar en Vercel

La app corre como **una sola función de Vercel** (`api/index.js` exporta el servidor de Express; `vercel.json` manda a ella todo lo que no sea un archivo de `public/`), con la base en **Neon** y las imágenes en **Vercel Blob**. Región: `gru1` (São Paulo), la misma que la base.

**Dos dominios, un mismo despliegue.** Si `ADMIN_HOST` está definido, ese dominio sirve solo el panel de administración (`/admin`, `/api/admin` y el login) y cualquier otro dominio sirve solo el sitio público. Ambos usan la misma `DATABASE_URL`, o sea la misma base. El panel vive en `admin-ui/` (fuera de `public/`) para que no salga por el CDN del dominio público.

Variables de entorno del proyecto en Vercel:

| Variable | Qué es |
|---|---|
| `DATABASE_URL` | URL **pooled** de la rama de Neon (`production` en producción) |
| `BLOB_READ_WRITE_TOKEN` | token del Blob store (o conectar el store al proyecto en Vercel > Storage) |
| `ADMIN_HOST` | dominio del dashboard, ej. `dlcritic-admin.vercel.app` (varios, separados por coma) |

Pasos: `vercel link` (una vez) → cargar las variables → `npm run db:migrate`, `npm run db:import -- data.db` y `npm run db:migrate-uploads` contra la rama de Neon que use el despliegue → `vercel deploy --prod`. Para probar un despliegue: `BASE_URL=https://… ADMIN_URL=https://… npm run test:smoke` (solo contra una base de pruebas, nunca producción).

Otro dominio (por ejemplo `dlcritic.com`) se agrega en Vercel > Settings > Domains y, si es el del dashboard, también en `ADMIN_HOST`.

## Copias de seguridad

Neon solo conserva 6 horas de historial en el plan gratuito, así que las copias de verdad son las propias.

- `npm run db:backup` vuelca todas las tablas de la rama `production` a `backups/dlcritic-<fecha>.json.gz` (una foto coherente, sin `sessions` ni `rate_limits`), la verifica y deja las últimas 30. La URL sale de `.env.backup` (`DATABASE_URL` = URL directa de la rama production; se genera con `neon connection-string production --project-id <id>`). `backups/` y `.env.backup` no se suben a git ni a Vercel: la copia contiene correos y hashes de PIN.
- Las imágenes que viven en Vercel Blob no van dentro del `.json.gz` (ahí solo queda su URL): el mismo `db:backup` las espeja en `backups/images/uploads/`, bajando solo las que faltan (son públicas, no hace falta el token) y sin borrar nunca nada. Las portadas que son enlaces a Steam no se copian: son ajenas. Si algún día se pierde el store, esos archivos son los originales para volver a subirlos; hoy esa re-subida (y reescribir las URLs de la base) es manual.
- `npm run db:restore -- backups/<archivo>.json.gz` la carga en la base de `DATABASE_URL` / `.env.local`, y solo si está vacía. Para recuperar producción: crear una rama o base nueva y vacía, restaurar ahí y apuntar la app a ella.
- Para repetirla cada día en Windows: Programador de tareas, ejecutar `npm run db:backup` en la carpeta del proyecto, con "ejecutar lo antes posible si se perdió el inicio programado" activado.

## Términos y política de privacidad

- Páginas `/terminos` y `/privacidad`: HTML en `server/views/terminos.html` y `privacidad.html`, estilo en `public/css/legal.css` y idioma/tema en `public/js/legal.js`. Cada una trae el texto en español y en inglés y muestra el que la persona eligió en el sitio (`localStorage` `lang`, el mismo que usa el resto de la app); el botón ES/EN alterna entre los dos.
- Se enlazan desde el footer del sitio y desde la casilla obligatoria del paso 2 del registro (`#r-terms`). El servidor también la exige: `POST /api/auth/register` responde `400 terms_required` si no llega `acceptTerms: true`. No se guarda cuándo se aceptó: haría falta una columna nueva en `users` y correr la migración en producción.
- El correo de contacto (`dlcriticweb@gmail.com`) aparece en los dos textos y dentro de los `mailto:`: si cambia, buscarlo con grep en `server/views/terminos.html` y `privacidad.html`.
- Si cambia algo de lo que la política describe (datos nuevos que se guardan, proveedores nuevos, analítica, botón para borrar la cuenta, dónde están los servidores, cuánto duran las copias de seguridad), actualizar los dos idiomas y la fecha de "Última actualización" de cada página. Hoy la política afirma, entre otras cosas: sin analítica ni cookies de seguimiento, tipografías cargadas desde Google Fonts, servidores en São Paulo, copias de la base por unos 30 días y borrado de cuenta pedido por correo.

## Notas de seguridad

- El PIN de 4 dígitos se guarda con hash (scrypt + salt), nunca en texto plano.
- Las sesiones usan cookies `HttpOnly` + `SameSite=Lax` (no accesibles desde JS, mitigan XSS/CSRF básicos).
- Sigue sin ser un sistema de autenticación "serio" (PIN de 4 dígitos = 10,000 combinaciones) — están bien las advertencias que ya tenía la UI al respecto.
