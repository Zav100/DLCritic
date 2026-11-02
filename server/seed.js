// Seeds the database with the original built-in catalog (games, their tech sheets,
// the "new releases" flag, the date calendar and the news feed) the first time it
// runs against an empty database. Safe to re-run: uses stable, content-derived ids
// with ON CONFLICT DO NOTHING, so it never duplicates or overwrites admin edits.
// Ya no corre al arrancar el servidor (en Vercel cada request puede ser un arranque en frío): se ejecuta a mano con
// npm run db:seed.
const crypto = require('node:crypto');
const db = require('./db');

function stableId(prefix, ...parts) {
  const hash = crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
  return `${prefix}-${hash}`;
}

async function seedGames() {
  const catalog = require('./catalog.json');
  const details = require('./seed-game-details.json');
  const newReleases = require('./seed-new-releases.json');
  const newReleaseMap = new Map(newReleases.map(r => [r.id, r.date]));

  const insertGame = db.prepare(`
    INSERT INTO games
      (id, title, genre, genres, platforms, added_by, created_at, cover_url, description, developer, publisher,
       release_year, game_mode, store_links, hidden, is_new_release, new_release_date, builtin)
    VALUES
      (@id, @title, @genre, @genres, @platforms, NULL, @created_at, NULL, @description, @developer, @publisher,
       @release_year, @game_mode, '{}', 0, @is_new_release, @new_release_date, 1)
    ON CONFLICT DO NOTHING
  `);

  const now = new Date().toISOString();
  let count = 0;
  for (const g of catalog) {
    const d = details[g.id];
    const info = await insertGame.run({
      id: g.id, title: g.title, genre: g.genre, genres: JSON.stringify([g.genre]), platforms: JSON.stringify(g.platforms), created_at: now,
      developer: d ? d[0] : null, publisher: d ? d[1] : null, release_year: d ? d[2] : null,
      description: d ? d[3] : null, game_mode: d ? d[4] : null,
      is_new_release: newReleaseMap.has(g.id) ? 1 : 0,
      new_release_date: newReleaseMap.get(g.id) || null,
    });
    if (info.changes > 0) count++;
  }
  return count;
}

async function seedDateEvents() {
  const dateEvents = require('./seed-date-events.json');
  const insert = db.prepare(`
    INSERT INTO date_events (id, month, day, game_id, title_es, desc_es, title_en, desc_en, created_at)
    VALUES (@id, @month, @day, @game_id, @title_es, @desc_es, @title_en, @desc_en, @created_at)
    ON CONFLICT DO NOTHING
  `);
  const now = new Date().toISOString();
  let count = 0;
  for (const ev of dateEvents) {
    const id = stableId('de', ev.month, ev.day, ev.es.title);
    const info = await insert.run({
      id, month: ev.month, day: ev.day, game_id: ev.gameId || null,
      title_es: ev.es.title, desc_es: ev.es.desc, title_en: ev.en.title, desc_en: ev.en.desc,
      created_at: now,
    });
    if (info.changes > 0) count++;
  }
  return count;
}

async function seedNews() {
  const news = require('./seed-news.json');
  const insert = db.prepare(`
    INSERT INTO news_items (id, title, summary, source, url, color, initials, created_at)
    VALUES (@id, @title, @summary, @source, @url, @color, @initials, @created_at)
    ON CONFLICT DO NOTHING
  `);
  const now = new Date().toISOString();
  let count = 0;
  for (const n of news) {
    const id = stableId('news', n.title, n.url);
    const info = await insert.run({
      id, title: n.title, summary: n.summary, source: n.source, url: n.url,
      color: n.color || '#5B8DEF', initials: n.initials || n.source.slice(0, 2).toUpperCase(),
      created_at: now,
    });
    if (info.changes > 0) count++;
  }
  return count;
}

async function seedIfEmpty() {
  const { n: gameCount } = await db.prepare('SELECT COUNT(*) as n FROM games').get();
  const gamesAdded = gameCount === 0 ? await seedGames() : 0;

  const { n: dateCount } = await db.prepare('SELECT COUNT(*) as n FROM date_events').get();
  const datesAdded = dateCount === 0 ? await seedDateEvents() : 0;

  const { n: newsCount } = await db.prepare('SELECT COUNT(*) as n FROM news_items').get();
  const newsAdded = newsCount === 0 ? await seedNews() : 0;

  if (gamesAdded || datesAdded || newsAdded) {
    console.log(`Seed: ${gamesAdded} juegos, ${datesAdded} fechas, ${newsAdded} noticias.`);
  }
}

module.exports = { seedIfEmpty };
