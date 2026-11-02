// Modo local sin Neon: se carga con `node -r ./scripts/local-env.js <script>` y apunta la app a un Postgres
// embebido (PGlite) que guarda sus datos en .pgdata/. Para usar Neon, no cargar este archivo y definir DATABASE_URL.
process.env.PGLITE_DIR ??= require('node:path').join(__dirname, '..', '.pgdata');
