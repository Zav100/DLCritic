// Steam de mentira para probar la integración sin tocar Steam: responde como el OpenID de Steam (inicio de sesión) y como la Steam Web API (juegos, horas y logros).
// Lo usan la prueba de humo (startSteamMock) y, para probar a mano, este mismo archivo levanta el sitio apuntando a él:
//   node -r ./scripts/local-env.js scripts/steam-mock.js        (el sitio queda en http://localhost:8793, el Steam falso en el puerto 8794)
// Para que haya coincidencias, los juegos del catálogo local necesitan steam_appid (ver STEAM_MOCK_GAMES; por defecto Elden Ring, God of War y Red Dead Redemption 2).
// Logros (STEAM_MOCK_ACHIEVEMENTS, appid:obtenidos/total): por defecto Red Dead Redemption 2 15/35 y God of War 10/10 (platino); Elden Ring queda sin logros.
const http = require('node:http');
const crypto = require('node:crypto');

const DEFAULT_GAMES = '1245620:5400,1593500:126,1174180:0'; // appid:minutos jugados
const DEFAULT_ACHIEVEMENTS = '1174180:15/35,1593500:10/10'; // appid:obtenidos/total
const MOCK_KEY = 'mockkey';

function parseGames(text) {
  return text.split(',').filter(Boolean).map(p => { const [appid, min] = p.split(':'); return { appid: Number(appid), playtime_forever: Number(min || 0) }; });
}

function parseAchievements(text) {
  return new Map(text.split(',').filter(Boolean).map(p => { const [appid, frac] = p.split(':'); const [unlocked, total] = frac.split('/').map(Number); return [Number(appid), { unlocked, total }]; }));
}

// Devuelve { server, url, steamId, state }: state.games (juegos de la cuenta), state.achievements (appid -> {unlocked, total}) y state.privateIds (SteamIDs con el perfil privado) se pueden cambiar en caliente.
function startSteamMock({ port = 0, steamId = process.env.STEAM_MOCK_ID || '76561198000000001', games = process.env.STEAM_MOCK_GAMES || DEFAULT_GAMES, achievements = process.env.STEAM_MOCK_ACHIEVEMENTS || DEFAULT_ACHIEVEMENTS } = {}) {
  const state = { games: parseGames(games), achievements: parseAchievements(achievements), privateIds: new Set(), steamId };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://mock');
    if (url.pathname === '/openid/login' && req.method === 'GET') { // la persona "acepta" al instante y vuelve al sitio con una afirmación
      const returnTo = url.searchParams.get('openid.return_to');
      const claimed = `https://steamcommunity.com/openid/id/${state.steamId}`;
      const back = new URL(returnTo);
      const fields = {
        'openid.ns': 'http://specs.openid.net/auth/2.0', 'openid.mode': 'id_res', 'openid.op_endpoint': `http://localhost:${server.address().port}/openid/login`,
        'openid.claimed_id': claimed, 'openid.identity': claimed, 'openid.return_to': returnTo, 'openid.response_nonce': new Date().toISOString() + crypto.randomBytes(4).toString('hex'),
        'openid.assoc_handle': '1234567890', 'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle', 'openid.sig': 'mocksig',
      };
      for (const [k, v] of Object.entries(fields)) back.searchParams.set(k, v);
      res.writeHead(302, { Location: back.toString() }).end();
    } else if (url.pathname === '/openid/login' && req.method === 'POST') { // check_authentication: vale si la firma es la de mentira
      let body = '';
      for await (const c of req) body += c;
      const p = new URLSearchParams(body);
      const valid = p.get('openid.mode') === 'check_authentication' && p.get('openid.sig') === 'mocksig';
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end(`ns:http://specs.openid.net/auth/2.0\nis_valid:${valid}\n`);
    } else if (url.pathname === '/IPlayerService/GetOwnedGames/v1/') {
      const json = o => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(o));
      if (url.searchParams.get('key') !== MOCK_KEY) return res.writeHead(403).end('Forbidden');
      if (state.privateIds.has(url.searchParams.get('steamid'))) return json({ response: {} });
      json({ response: { game_count: state.games.length, games: state.games } });
    } else if (url.pathname === '/ISteamUserStats/GetPlayerAchievements/v1/') { // como Steam: el cuerpo JSON viaja también en los errores (403 privado, 400 sin logros)
      const reply = (status, playerstats) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ playerstats }));
      if (url.searchParams.get('key') !== MOCK_KEY) return res.writeHead(403).end('Forbidden');
      if (state.privateIds.has(url.searchParams.get('steamid'))) return reply(403, { error: 'Profile is not public', success: false });
      const a = state.achievements.get(Number(url.searchParams.get('appid')));
      if (!a) return reply(400, { error: 'Requested app has no stats', success: false });
      reply(200, { steamID: url.searchParams.get('steamid'), gameName: 'Mock', success: true, achievements: Array.from({ length: a.total }, (_, i) => ({ apiname: 'ACH_' + i, achieved: i < a.unlocked ? 1 : 0, unlocktime: 0 })) });
    } else res.writeHead(404).end();
  });
  return new Promise(resolve => server.listen(port, () => {
    const mockUrl = `http://localhost:${server.address().port}`;
    // La app lee estas variables al usarlas, así que alcanza con definirlas antes de la primera petición.
    process.env.STEAM_OPENID_URL = `${mockUrl}/openid/login`;
    process.env.STEAM_API_URL = mockUrl;
    process.env.STEAM_API_KEY = MOCK_KEY;
    resolve({ server, url: mockUrl, steamId, state });
  }));
}

module.exports = { startSteamMock };

if (require.main === module) {
  startSteamMock({ port: 8794 }).then(m => {
    console.log(`Steam de mentira en ${m.url} (SteamID ${m.steamId}, juegos: ${m.state.games.map(g => g.appid + ':' + g.playtime_forever).join(', ')})`);
    const PORT = process.env.PORT || 8793;
    require('../server/index.js').listen(PORT, () => console.log(`DLCritic con Steam de mentira en http://localhost:${PORT}`));
  });
}
