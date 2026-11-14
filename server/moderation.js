// Filtro de palabras para moderar lo que escriben los usuarios (reseñas, descripciones, nombres de listas y de usuario). Sin dependencias ni servicios externos.
//
//  · scanText(texto): busca las palabras de server/moderation-words.json. Las 'grave' se CENSURAN (primera letra y el resto con asteriscos: «g*******») y las
//    'revisar' solo se anotan, igual que los enlaces. Devuelve el texto ya censurado (del mismo largo que el original) y qué se encontró.
//  · badUsername(nombre): true si el nombre de usuario tiene una palabra grave (esos nombres se rechazan, no se censuran).
//
// Cómo lee el texto (para que los trucos comunes no sirvan): minúsculas y sin tildes; símbolos y números dentro de una palabra valen como letras (r4c1sta, @ a, 3 e,
// 1 i, 0 o, $ s, 5 s, 7 t); los separadores entre letras se ignoran (r.a.c.i.s.t.a); las letras repetidas valen igual (racissssta); y se busca cada término como
// palabra completa, con plural, para no marcar palabras inocentes que lo contienen ("tycoon" no activa "coon").
// La lista: server/moderation-words.json es la lista ORIGINAL. Desde el panel (pestaña Palabras) un admin puede agregar palabras o frases y quitar las originales; eso se guarda en la
// tabla moderation_words y se junta con la original (ver effective()). Cada instancia vuelve a leer la tabla como mucho una vez por minuto (ensureFresh) y, si la base no responde
// o la tabla todavía no existe, sigue con la última lista que tenía (al arrancar, la original): el filtro nunca deja de funcionar.
// Límites que se conocen: letras separadas por espacios (r a c i s t a), el contexto (la lista no entiende ironía ni citas) y otros idiomas distintos de español e inglés.
const words = require('./moderation-words.json');
const db = require('./db');

const LEET = { 4: 'a', 3: 'e', 1: 'i', 0: 'o', 5: 's', 7: 't' };
const SYMBOL_LEET = { '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };
const JOINERS = new Set(['.', '-', '_', '*', "'"]); // se ignoran entre letras de una misma palabra

// El texto reducido a minúsculas sin tildes, con 'start' y 'end' (posiciones en el texto original) de cada carácter, para poder volver al original.
function normalize(original) {
  const chars = [];
  for (let i = 0; i < original.length; i++) {
    const t = original[i].normalize('NFKD').replace(/[̀-ͯ​-‏⁠﻿]/g, '').toLowerCase();
    for (const c of t) chars.push({ c, start: i, end: i + 1 });
  }
  const out = { text: '', start: [], end: [] };
  const push = (c, start, end) => { out.text += c; out.start.push(start); out.end.push(end); };
  const isAlnum = c => /[a-z0-9]/.test(c);
  let i = 0;
  while (i < chars.length) {
    if (!isAlnum(chars[i].c) && !(chars[i].c in SYMBOL_LEET) && !JOINERS.has(chars[i].c)) { // espacio o puntuación: separa palabras
      if (out.text && out.text[out.text.length - 1] !== ' ') push(' ', chars[i].start, chars[i].end);
      i++;
      continue;
    }
    let j = i; // una "palabra": letras, números, símbolos y separadores seguidos
    while (j < chars.length && (isAlnum(chars[j].c) || chars[j].c in SYMBOL_LEET || JOINERS.has(chars[j].c))) j++;
    const token = chars.slice(i, j);
    const hasLetter = token.some(x => /[a-z]/.test(x.c));
    token.forEach((x, k) => {
      const prev = token[k - 1], next = token[k + 1];
      const inside = prev && next && isAlnum(prev.c) && isAlnum(next.c); // entre dos letras o números
      if (/[a-z]/.test(x.c)) push(x.c, x.start, x.end);
      else if (/[0-9]/.test(x.c)) push(hasLetter && LEET[x.c] ? LEET[x.c] : x.c, x.start, x.end); // un número solo se mantiene: "1488"
      else if (x.c in SYMBOL_LEET) { // @ $ ! | + dentro de una palabra; @ y $ también al final de una ("nigg@")
        if (hasLetter && (inside || ((x.c === '@' || x.c === '$') && prev && /[a-z]/.test(prev.c)))) push(SYMBOL_LEET[x.c], x.start, x.end);
      }
      // los separadores no se agregan: "r.a.c.i.s.t.a" queda "racista"
    });
    i = j;
  }
  out.text = out.text.replace(/ +/g, ' ');
  return out;
}

// Un término de la lista como expresión: letras repetidas valen igual, cada palabra puede llevar plural y se pide palabra completa.
const norm = s => normalize(s).text.trim();
function termPattern(term) {
  return norm(term).split(' ').map(w => [...w].map(c => (/[a-z]/.test(c) ? c + '+' : c)).join('') + '(?:es|s)?').join(' ');
}
const alternatives = terms => [...new Set(terms.map(norm).filter(Boolean))].sort((a, b) => b.length - a.length).map(termPattern);
// alone: términos sueltos; cross: [grupos, insultos], cada grupo seguido de cada insulto ("negros de mierda") sin escribir todas las combinaciones.
function buildRegex(alone, cross) {
  const parts = alternatives(alone);
  if (cross) parts.push('(?:' + alternatives(cross[0]).join('|') + ') (?:' + alternatives(cross[1]).join('|') + ')');
  return parts.length ? new RegExp('(?<![a-z0-9])(?:' + parts.join('|') + ')(?![a-z0-9])', 'g') : null;
}
// tier en la base -> clave en el JSON. grave: se censura; revisar: solo se marca; grupo + insulto: una frase grave ("negros de mierda").
const TIER_KEY = { grave: 'grave', revisar: 'revisar', grupo: 'grupos', insulto: 'insultos' };
const DEFAULTS = Object.fromEntries(Object.values(TIER_KEY).map(k => [k, [...new Set(words[k].map(norm).filter(Boolean))]]));
let GRAVE = null, REVISAR = null, SINGLE_LONG = [];
// Reconstruye las expresiones con estas listas ({ grave, revisar, grupos, insultos }).
function applyLists(lists) {
  GRAVE = buildRegex(lists.grave, lists.grupos.length && lists.insultos.length ? [lists.grupos, lists.insultos] : null);
  REVISAR = buildRegex(lists.revisar);
  SINGLE_LONG = [...new Set(lists.grave.map(norm).filter(t => !t.includes(' ') && t.length >= 7))]; // para los nombres de usuario (ver badUsername)
}
// La lista efectiva: la original menos lo que un admin quitó, más lo que agregó. rows = filas de moderation_words ({ tier, term, removed }).
function effective(rows) {
  const out = {};
  for (const [tier, key] of Object.entries(TIER_KEY)) {
    const mine = rows.filter(r => r.tier === tier);
    const removed = new Set(mine.filter(r => r.removed).map(r => r.term));
    const added = mine.filter(r => !r.removed).map(r => r.term);
    out[key] = [...DEFAULTS[key].filter(t => !removed.has(t)), ...added.filter(t => !DEFAULTS[key].includes(t))];
  }
  return out;
}
// Lo que ve el panel: por cada lista, sus términos (builtin = de la lista original) y las originales que se quitaron (se pueden restaurar).
function describe(rows) {
  return Object.entries(TIER_KEY).map(([tier, key]) => {
    const mine = rows.filter(r => r.tier === tier);
    const removed = new Set(mine.filter(r => r.removed).map(r => r.term));
    const custom = mine.filter(r => !r.removed).map(r => r.term).filter(t => !DEFAULTS[key].includes(t));
    return {
      tier,
      items: [...DEFAULTS[key].filter(t => !removed.has(t)).map(term => ({ term, builtin: true })), ...custom.map(term => ({ term, builtin: false }))],
      removed: DEFAULTS[key].filter(t => removed.has(t)),
    };
  });
}
// Un término como se guarda: minúsculas, sin tildes, números y símbolos por letras. null si no sirve (vacío, muy corto o largo, o con caracteres raros).
function normTerm(raw) {
  const t = norm(String(raw || ''));
  return /^[a-z0-9]+( [a-z0-9]+)*$/.test(t) && t.length >= 3 && t.length <= 60 ? t : null;
}
applyLists(effective([]));

const readWords = db.prepare('SELECT tier, term, removed FROM moderation_words');
let loadedAt = 0, loading = null;
// Vuelve a leer la lista de la base (ya mismo). Si falla, se queda con la anterior.
function reload() {
  loading ||= readWords.all()
    .then(rows => applyLists(effective(rows)))
    .catch(e => console.error('Moderación: no se pudo leer la lista de palabras, se sigue con la anterior:', e.message))
    .finally(() => { loadedAt = Date.now(); loading = null; });
  return loading;
}
// La relee solo si pasó más de un minuto desde la última vez (las rutas lo llaman antes de revisar un texto).
function ensureFresh(maxAgeMs = 60 * 1000) {
  return Date.now() - loadedAt < maxAgeMs ? Promise.resolve() : reload();
}
const LINK = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|gg|tv|ly|me|xyz|ru|cc)\b/i;

function matches(regex, n) {
  if (!regex) return [];
  const found = [];
  for (const m of n.text.matchAll(regex)) found.push({ term: m[0], from: m.index, to: m.index + m[0].length });
  return found;
}
// Censura un tramo del original: deja la primera letra y cambia el resto (menos los espacios) por asteriscos.
function censorSpan(span) {
  let first = true;
  return [...span].map(ch => (/\s/.test(ch) ? ch : first && /[\p{L}\p{N}]/u.test(ch) ? ((first = false), ch) : '*')).join('');
}

// Revisa un texto. Devuelve { text, censored, graves, revisar, links, flagged, spans }:
//  text: el texto con lo grave censurado (del mismo largo); censored: si se cambió algo; graves / revisar: lo que se encontró (palabras, ya normalizadas);
//  links: si trae enlaces; flagged: si hay algo para que un admin mire; spans: [[desde, hasta, 'grave'|'revisar']] sobre el texto ORIGINAL, para resaltarlo en el panel.
function scanText(original) {
  const text0 = String(original || '');
  const n = normalize(text0);
  const grave = matches(GRAVE, n), revisar = matches(REVISAR, n);
  const spanOf = m => [n.start[m.from], n.end[m.to - 1]];
  let text = text0;
  const spans = [];
  for (const m of [...grave].sort((a, b) => b.from - a.from)) {
    const [s, e] = spanOf(m);
    text = text.slice(0, s) + censorSpan(text0.slice(s, e)) + text.slice(e);
  }
  for (const m of grave) spans.push([...spanOf(m), 'grave']);
  for (const m of revisar) spans.push([...spanOf(m), 'revisar']);
  spans.sort((a, b) => a[0] - b[0]);
  const links = LINK.test(text0);
  return {
    text, censored: text !== text0,
    graves: [...new Set(grave.map(m => m.term))], revisar: [...new Set(revisar.map(m => m.term))], links,
    flagged: grave.length > 0 || revisar.length > 0 || links, spans,
  };
}

// ¿El nombre de usuario trae una palabra grave? Se mira entero y por partes (separadas por _ . - y números), y los términos largos y de una sola palabra
// también dentro del nombre pegado ("xxnegratayy"); los cortos solo como palabra, para no rechazar nombres inocentes.
function badUsername(name) {
  const text = String(name || '');
  if (GRAVE) {
    for (const part of text.split(/[_.\-0-9\s]+/).filter(Boolean)) if (scanText(part).graves.length) return true;
    if (scanText(text.replace(/[_.\-]+/g, ' ')).graves.length) return true;
  }
  const flat = normalize(text.replace(/[_.\-\s]+/g, '')).text.replace(/ /g, '');
  return SINGLE_LONG.some(t => flat.includes(t));
}

module.exports = { scanText, badUsername, normalize, normTerm, effective, describe, reload, ensureFresh, DEFAULTS, TIER_KEY };
