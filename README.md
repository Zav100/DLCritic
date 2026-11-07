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
- `public/img/` también tiene la imagen para compartir el enlace (`og-image.png`, 1200×630), el ícono de pantalla de inicio (`apple-touch-icon.png`) y los íconos de `public/site.webmanifest`. Se generan desde `logos/export/`. Las etiquetas `og:url` y `og:image` de `server/views/index.html` llevan la URL completa del sitio (los servicios que muestran la vista previa no entienden las relativas): al pasar a `dlcritic.com`, cambiarlas ahí.
- `server/index.js` — API REST (Express).
- `server/db.js` — acceso a PostgreSQL (driver `pg`; Neon en producción). Mantiene la forma que tenía SQLite, `db.prepare(sql).get/all/run(...)`, pero asíncrona (`await`).
- `server/schema.sql` — el esquema de la base. `npm run db:migrate` lo aplica (es seguro repetirlo).
- `scripts/` — `migrate.js`, `seed.js`, `import-sqlite.js`, `smoke-test.js` y `local-env.js` (modo local con Postgres embebido).
- `server/mail.js` y `server/smtp.js` — envío de correos (recuperación de contraseña): textos, configuración por variables de entorno y un cliente SMTP sin dependencias.
- `server/totp.js` y `server/twofactor.js` — verificación en dos pasos de las cuentas admin (códigos TOTP y su comprobación contra la base).
- `server/auth.js` — hash de contraseñas (scrypt) y sesiones por cookie httpOnly (en la base se guarda solo el hash del token).
- `server/rateLimit.js` — límite de intentos por IP/usuario en endpoints sensibles.
- `server/admin.js` — API del panel de administración (requiere sesión + `is_admin`).
- `server/make-admin.js` — script de línea de comandos para promover un usuario a admin.
- `server/views/` — el HTML del sitio (`index.html`) y de las páginas legales (`terminos.html`, `privacidad.html`, `creditos.html`).
- `admin-ui/` — el panel de administración (HTML + `assets/`). Está fuera de `public/` a propósito: el servidor lo entrega solo en el dominio del dashboard (ver `ADMIN_HOST`). Por eso su logo va inline y su favicon (el del sitio con una llave inglesa) vive en `admin-ui/assets/`: en ese dominio `/img/` no existe.
- `public/js/splash.js` — la pantalla de bienvenida: el logo se dibuja en el centro y viaja hasta el header (~2,5 s). Se muestra solo al entrar por `/`, una vez por sesión (`sessionStorage.dlcSplash`) y si el sistema no pide reducir el movimiento: eso lo decide un script del `<head>` de `server/views/index.html` antes del primer dibujo, y los estilos están al final de `public/css/style.css`. Se salta con un clic o una tecla. Si cambia el logo del header, hay que cambiar también el SVG de `#splash` en el mismo `index.html`.
- `public/uploads/` — imágenes de portada subidas desde `/admin`. Antes de subirse, el navegador las achica con `shrinkImage()` (lado largo máximo 2000 px, 1000 px en avatares, calidad 0.9; lo chico, los GIF y cualquier fallo suben tal cual). La función vive en `public/js/04-api-theme-rating.js` y está copiada en `admin-ui/assets/js/02-views-login-and-api.js`.
- `server/seed.js` + `server/seed-*.json` / `server/catalog.json` — datos de arranque (los 93 juegos base, sus fichas técnicas, el calendario de fechas y las noticias). Se insertan en la base **una sola vez**, al correr `npm run db:seed` contra una base vacía — después viven ahí y los edita el admin, no estos archivos.
- La base de datos es la única fuente de verdad: todo el catálogo (juegos base + agregados), el calendario y las noticias viven ahí, no hay datos estáticos en el HTML.
- `data.db` — la base SQLite anterior (no se sube a git). Ya no la usa el servidor; queda para `npm run db:import`.

## Funcionalidad agregada en esta ronda

- **Portadas**: cada juego guarda su portada en `games.cover_url` (un enlace o una imagen subida desde `/admin`). Todas se ven igual: la imagen entera y centrada (`object-fit: contain`) en un marco 16:9 sobre una copia desenfocada de sí misma (`.cover-img` y `::before` en `style.css`, `--cover-url` lo pone `attachCoverImg`), así no se corta ningún personaje ni el nombre del juego. Un juego sin portada guardada muestra un color de fondo: **ya no se busca por título en Steam** (adivinaba mal; la tabla `game_covers` quedó sin uso). Orígenes: enlace a la miniatura grande de Steam (`…/apps/<id>/capsule_616x353.jpg`, 16:9), enlace a la imagen oficial de la página del juego en playstation.com (`og:image`, cuadrada; su host está permitido en `/api/image-proxy` para la tarjeta de compartir) o una subida. Las portadas de los juegos de Nintendo no se descargan ni se enlazan solas: si se suben, la ficha del juego avisa al final que son de Nintendo.
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
- **📅 Fechas importantes** — CRUD del calendario que se ve en Inicio (mes, día, título/descripción en ES y EN, y opcionalmente un juego relacionado buscando por título).
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
| POST | `/api/auth/register` | — | crear cuenta `{email, password, username, acceptTerms, bio?, socialLinks?}` |
| POST | `/api/auth/login` | — | iniciar sesión `{identifier, password, remember?, code?}` (correo o, en cuentas viejas, usuario; `code` solo si la cuenta tiene verificación en dos pasos) |
| POST | `/api/auth/logout` | — | cerrar sesión |
| POST | `/api/admin/2fa/setup` | admin | empieza a activar la verificación en dos pasos `{currentPassword}`; devuelve la clave y la dirección `otpauth://` |
| POST | `/api/admin/2fa/enable` | admin | la activa con un código de prueba `{code}`; devuelve los códigos de recuperación (una sola vez) |
| POST | `/api/auth/forgot` | — | pide el enlace de recuperación `{email, lang?}` (responde igual exista o no la cuenta) |
| POST | `/api/auth/reset` | — | elige la contraseña nueva `{token, newPassword}` con el token del correo |
| POST | `/api/auth/logout-all` | sesión | cerrar sesión en todos los dispositivos, incluido este |
| POST | `/api/account/password` | sesión | cambiar la contraseña `{currentPassword, newPassword}`; cierra las sesiones de los otros dispositivos |
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

**Caché de los archivos estáticos.** Las páginas que entrega el servidor (`index.html`, términos, privacidad, créditos, restablecer, 404) agregan `?v=<hash del archivo>` a cada `/js/…` y `/css/…` (`withAssetVersions` en `server/index.js`), y `vercel.json` les da `Cache-Control: public, max-age=31536000, immutable` solo cuando llevan ese `?v`: si el archivo cambia, cambia la URL y nadie queda con scripts viejos mezclados con nuevos. Sin `?v` (por ejemplo, si la función no pudo leer el archivo) el caché es corto (5 min), y las imágenes de `/img/` se guardan un día. Para que la función pueda calcular los hashes, `includeFiles` de `vercel.json` incluye `public/js/*.js` y `public/css/*.css`. Si agregás una imagen nueva que reemplaza a otra con el mismo nombre, el navegador puede tardar hasta un día en verla: dale un nombre distinto. El smoke test verifica que cada página apunte a archivos con `?v` que existen.

**Dos dominios, un mismo despliegue.** Si `ADMIN_HOST` está definido, ese dominio sirve solo el panel de administración (`/admin`, `/api/admin` y el login) y cualquier otro dominio sirve solo el sitio público. Ambos usan la misma `DATABASE_URL`, o sea la misma base. El panel vive en `admin-ui/` (fuera de `public/`) para que no salga por el CDN del dominio público.

Variables de entorno del proyecto en Vercel:

| Variable | Qué es |
|---|---|
| `DATABASE_URL` | URL **pooled** de la rama de Neon (`production` en producción) |
| `BLOB_READ_WRITE_TOKEN` | token del Blob store (o conectar el store al proyecto en Vercel > Storage) |
| `ADMIN_HOST` | dominio del dashboard, ej. `dlcritic-admin.vercel.app` (varios, separados por coma) |
| `PUBLIC_URL` | dirección pública del sitio, ej. `https://dlcritic.vercel.app`; va en los enlaces de los correos (en producción es obligatoria) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | el servidor de correo con el que se mandan los mensajes de recuperación de contraseña (con Gmail: `smtp.gmail.com`, `465`, la cuenta y una "contraseña de aplicación" de Google). Opcionales: `SMTP_SECURE` (`tls` / `starttls`), `MAIL_REPLY_TO`. Sin `SMTP_HOST` en producción, el correo falla; en local se imprime en la consola |

Pasos: `vercel link` (una vez) → cargar las variables → `npm run db:migrate`, `npm run db:import -- data.db` y `npm run db:migrate-uploads` contra la rama de Neon que use el despliegue → `vercel deploy --prod`. Para probar un despliegue: `BASE_URL=https://… ADMIN_URL=https://… npm run test:smoke` (solo contra una base de pruebas, nunca producción).

Otro dominio (por ejemplo `dlcritic.com`) se agrega en Vercel > Settings > Domains y, si es el del dashboard, también en `ADMIN_HOST`.

## Copias de seguridad

Neon solo conserva 6 horas de historial en el plan gratuito, así que las copias de verdad son las propias.

- `npm run db:backup` vuelca todas las tablas de la rama `production` a `backups/dlcritic-<fecha>.json.gz` (una foto coherente, sin `sessions` ni `rate_limits`), la verifica y deja las últimas 30. La URL sale de `.env.backup` (`DATABASE_URL` = URL directa de la rama production; se genera con `neon connection-string production --project-id <id>`). `backups/` y `.env.backup` no se suben a git ni a Vercel: la copia contiene correos y hashes de PIN.
- Las imágenes que viven en Vercel Blob no van dentro del `.json.gz` (ahí solo queda su URL): el mismo `db:backup` las espeja en `backups/images/uploads/`, bajando solo las que faltan (son públicas, no hace falta el token) y sin borrar nunca nada. Las portadas que son enlaces a Steam no se copian: son ajenas. Si algún día se pierde el store, esos archivos son los originales para volver a subirlos; hoy esa re-subida (y reescribir las URLs de la base) es manual.
- `npm run db:restore -- backups/<archivo>.json.gz` la carga en la base de `DATABASE_URL` / `.env.local`, y solo si está vacía. Para recuperar producción: crear una rama o base nueva y vacía, restaurar ahí y apuntar la app a ella.
- Para repetirla cada día en Windows: Programador de tareas, ejecutar `npm run db:backup` en la carpeta del proyecto, con "ejecutar lo antes posible si se perdió el inicio programado" activado.

## Términos y política de privacidad

- **Español neutro.** Todos los textos que ve la gente (sitio, páginas legales, panel, correos y mensajes) van en español neutro: tuteo, sin voseo rioplatense ("explora", "califica", "puedes"; no "explorá", "calificá", "podés"), y "aquí" en vez de "acá". Los textos de `02-i18n.js` ya cumplen; el HTML de base (`server/views/*.html`, `admin-ui/admin.html`) repite algunos como respaldo hasta que carga el JS y en los buscadores, así que al cambiar uno hay que cambiar los dos.
- **Cambio de idioma desactivado (temporal).** El botón ES/EN está oculto y el sitio queda siempre en español, aunque el navegador tenga guardado inglés. Todo el soporte del inglés sigue en el código (textos `en` de `02-i18n.js`, versión en inglés de términos y privacidad). Para volver a ofrecerlo: `LANG_SWITCH = true` en `public/js/02-i18n.js` y en `public/js/legal.js`, y quitar la regla `.lang-toggle { display: none }` de `public/css/style.css`. Mientras esté apagado, el tip "cambiar idioma" tampoco se muestra.
- Páginas `/terminos` y `/privacidad`: HTML en `server/views/terminos.html` y `privacidad.html`, estilo en `public/css/legal.css` y idioma/tema en `public/js/legal.js`. Cada una trae el texto en español y en inglés y muestra el que la persona eligió en el sitio (`localStorage` `lang`, el mismo que usa el resto de la app); el botón ES/EN alterna entre los dos.
- `/creditos` (`server/views/creditos.html`, mismo estilo y español/inglés que las otras dos): de dónde salen las imágenes y a quién pertenecen (portadas de Steam o subidas, capturas de los encabezados de Inicio y Noticias, personajes, marcas, tipografías) y cómo pedir una corrección o retiro. Se enlaza junto a Términos y Privacidad en los tres pies. Si cambia una imagen de encabezado (`public/img/`, `style.css`), actualizar la lista de "Imágenes de los encabezados" en los dos idiomas y la fecha.
- Se enlazan desde el footer del sitio y desde la casilla obligatoria del paso 2 del registro (`#r-terms`). El servidor también la exige: `POST /api/auth/register` responde `400 terms_required` si no llega `acceptTerms: true`. No se guarda cuándo se aceptó: haría falta una columna nueva en `users` y correr la migración en producción.
- El correo de contacto (`dlcriticweb@gmail.com`) aparece en los dos textos y dentro de los `mailto:`: si cambia, buscarlo con grep en `server/views/terminos.html` y `privacidad.html`.
- Si cambia algo de lo que la política describe (datos nuevos que se guardan, proveedores nuevos, analítica, botón para borrar la cuenta, dónde están los servidores, cuánto duran las copias de seguridad), actualizar los dos idiomas y la fecha de "Última actualización" de cada página. Hoy la política afirma, entre otras cosas: sin analítica ni cookies de seguimiento, tipografías cargadas desde Google Fonts, servidores en São Paulo, copias de la base por unos 30 días y borrado de cuenta pedido por correo.

## Notas de seguridad

- Las contraseñas se guardan con hash (scrypt + salt), nunca en texto plano. Se piden de 8 a 200 caracteres con al menos una mayúscula, un número y un carácter especial (cualquier símbolo que no sea letra, número ni espacio); fuera de eso la contraseña es libre, salvo que no se aceptan emojis (`isStrongPassword` en `server/index.js` e `isStrongPasswordClient` en `public/js/11-auth.js`). Las cuentas viejas con PIN de 4 dígitos siguen entrando, pero no se les exige cambiarlo.
- Las sesiones usan cookies `HttpOnly` + `SameSite=Lax` (+ `Secure` en producción), duran 20 días si se marca «Recordar este dispositivo» en el login (cookie persistente, sin renovarse; al crear la cuenta la sesión dura 24 horas, también con cookie persistente) y, si no, la cookie se borra al cerrar el navegador y la sesión vence al día. En la base se guarda el SHA-256 del token, no el token: una copia de la base no sirve para entrar a las cuentas. Cambiar la contraseña cierra las sesiones de los otros dispositivos, y Ajustes tiene "cerrar sesión en todos los dispositivos".
- Cambiar el correo o la contraseña pide la contraseña actual y tiene su propio tope (5 intentos cada 15 minutos por usuario). El login limita por IP (8 cada 10 minutos); no hay bloqueo por cuenta a propósito, porque cualquiera podría dejar afuera a un usuario (o al admin) a base de intentos fallidos.
- Cabeceras: `X-Frame-Options: DENY` (sin clickjacking), `Referrer-Policy`, `Permissions-Policy` y `nosniff`. No hay Content-Security-Policy todavía: la página usa scripts y estilos en línea.
- **Verificación en dos pasos (TOTP) obligatoria para las cuentas admin.** Sin ella, `/api/admin/*` responde `403 two_factor_required` y el panel muestra la pantalla de activación (contraseña → clave para la app de autenticación → código de prueba → 8 códigos de recuperación, que se muestran una sola vez). Con ella, `POST /api/auth/login` responde `401 two_factor_required` hasta que llega `code` (6 dígitos de la app o un código de recuperación) y recién ahí abre la sesión. Cada código sirve una sola vez (`totp_last_step`), hay un tope de 10 intentos cada 15 minutos por cuenta y la activación pide la contraseña de nuevo. Código en `server/totp.js` (cálculo, probado con los vectores del RFC 6238) y `server/twofactor.js` (la base y los topes). Los datos están en las columnas `totp_*` de `users`: la clave queda guardada tal cual, como el hash de la contraseña, así que los backups hay que cuidarlos igual. Si el admin pierde el teléfono y los códigos: `npm run db:reset-2fa -- <usuario>` (en producción: `node --env-file=.env.backup scripts/reset-2fa.js <usuario>`).
- **Recuperar la contraseña por correo.** "¿Olvidaste tu contraseña?" en el login pide el correo y `POST /api/auth/forgot` responde siempre lo mismo (exista o no la cuenta, y tardando al menos 1,5 s) y manda un enlace `/restablecer?token=...`. El token son 32 bytes al azar: en la base (`password_resets`) queda su hash, vale 1 hora, se gasta una sola vez y un enlace nuevo anula el anterior. Topes: 5 pedidos cada 15 minutos por IP y 3 por hora por correo. `POST /api/auth/reset` valida la contraseña antes de gastar el enlace, cierra todas las sesiones y avisa por correo; la verificación en dos pasos de un admin no se toca. La página `/restablecer` saca el token de la barra de direcciones y no manda `Referer`. Las cuentas viejas sin correo no pueden recuperarse así: primero tienen que agregar uno en Ajustes. Los correos salen por `server/smtp.js` (cliente SMTP mínimo, sin dependencias; conexión cifrada con TLS o STARTTLS) y los textos están en `server/mail.js`.
- Falta, y está pendiente: verificación del correo (hoy no se comprueba que la persona sea dueña de la dirección) y login con Google.
