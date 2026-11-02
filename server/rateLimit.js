const db = require('./db');

// Límite de intentos por ventana fija, con los contadores guardados en la base (tabla rate_limits).
// Antes vivían en la memoria del proceso, pero en Vercel cada request puede caer en una instancia distinta y el
// límite no se acumulaba. Cuesta una consulta por request limitado.
//
// name:  prefijo de la clave, para que limitadores distintos no compartan contador.
// keyFn: qué se limita (por defecto, la IP del cliente).
const bump = db.prepare(`
  INSERT INTO rate_limits (key, count, reset_at) VALUES (@key, 1, @resetAt)
  ON CONFLICT (key) DO UPDATE SET
    count = CASE WHEN rate_limits.reset_at < @now THEN 1 ELSE rate_limits.count + 1 END,
    reset_at = CASE WHEN rate_limits.reset_at < @now THEN @resetAt ELSE rate_limits.reset_at END
  RETURNING count, reset_at
`);
const purgeStale = db.prepare('DELETE FROM rate_limits WHERE reset_at < ?');

// Borrar contadores vencidos es solo higiene (un contador vencido se reinicia solo): a lo sumo una vez cada 10 minutos por instancia.
let lastPurge = 0;
async function maybePurge(now) {
  if (now - lastPurge < 10 * 60 * 1000) return;
  lastPurge = now;
  await purgeStale.run(now);
}

function rateLimit({ name, windowMs, max, keyFn }) {
  return async (req, res, next) => {
    const now = Date.now();
    await maybePurge(now);
    const key = `${name}:${keyFn ? keyFn(req) : req.ip}`;
    const { count, reset_at } = await bump.get({ key, now, resetAt: now + windowMs });
    if (count > max) {
      const retryAfter = Math.ceil((reset_at - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'too_many_requests', retryAfter });
    }
    next();
  };
}

module.exports = { rateLimit };
