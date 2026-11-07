/**
 * ARCHIVO 4 de 16 — Cliente de la API, tema claro/oscuro, y calificación rápida.
 *
 * Tres cosas sin relación directa entre sí, pero todas "primitivas" chicas
 * que se usan desde muchos otros archivos:
 *   1. api()/apiGet/apiPost/apiPut/apiDelete: TODA llamada al backend pasa
 *      por aquí (ver server/index.js para los endpoints reales). loadAll()
 *      es la carga inicial de datos al bootear la página.
 *   2. Tema claro/oscuro (botón de la lamparita en el header).
 *   3. El gauge (barra de progreso circular/lineal de una nota) y el
 *      widget de "calificación rápida" (los 10 botones 1-10 que aparecen
 *      en la ficha de un juego), incluyendo guardar/borrar nota, reseña
 *      escrita y plataformas jugadas.
 */
/* ---------- API helper ---------- */
// Wrapper de fetch: agrega el prefijo /api, arma el body en JSON (salvo
// que sea un FormData, isForm:true, para subir archivos), y convierte
// cualquier respuesta no-OK en una excepción con .status y .body (así el
// código que llama puede hacer try/catch y mirar e.body.error).
async function api(path, options){
  const res = await fetch('/api'+path, {
    method:'GET', headers: options && options.isForm ? {} : {'Content-Type':'application/json'}, ...options,
  });
  let body=null;
  try{ body = await res.json(); }catch(e){}
  if(!res.ok){ const err=new Error((body&&body.error)||'request_failed'); err.status=res.status; err.body=body; throw err; }
  return body;
}
function apiGet(path){ return api(path); }
function apiPost(path, data){ return api(path, { method:'POST', body: JSON.stringify(data||{}) }); }
function apiPut(path, data){ return api(path, { method:'PUT', body: JSON.stringify(data||{}) }); }
function apiDelete(path){ return api(path, { method:'DELETE' }); }

// Achica una imagen antes de subirla: una foto 4K pesa varios MB y en pantalla no se nota la diferencia, y Vercel rechaza
// los pedidos de más de 4,5 MB. Lado largo máximo maxSide px (nunca agranda) y calidad 0.9; el JPEG sigue siendo JPEG y el
// resto pasa a WebP (conserva la transparencia). Lo que ya es chico y liviano, los GIF (se perderían los cuadros) y
// cualquier fallo devuelven el archivo original sin tocar. Copiada en admin-ui/assets/js/02-views-login-and-api.js
// (dos páginas sin código compartido): si se cambia una, cambiar la otra.
async function shrinkImage(file, maxSide = 2000){
  if(file.type === 'image/gif') return file;
  try{
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if(scale === 1 && file.size <= 1024 * 1024){ bmp.close(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    const blob = await new Promise(resolve => canvas.toBlob(resolve, type, 0.9));
    // Safari no sabe escribir WebP y devuelve PNG (más pesado): en ese caso, o si no se ganó nada, queda el original.
    if(!blob || blob.type !== type || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]*$/, '') + (type === 'image/jpeg' ? '.jpg' : '.webp'), { type });
  }catch(e){ return file; }
}

// Carga inicial de datos al arrancar la app: catálogo, reseñas, sesión del
// usuario, calendario de fechas y noticias. Cada pedido falla en silencio
// por separado (si uno falla, los demás igual se intentan) para que un
// solo endpoint caído no rompa toda la página.
async function loadAll(){
  try{ const r=await apiGet('/games'); state.games = r.games; CATALOG = state.games; }catch(e){ state.games=[]; CATALOG=[]; }
  try{ const r=await apiGet('/reviews'); state.reviews = r.reviews; }catch(e){ state.reviews=[]; }
  try{ const r=await apiGet('/characters'); state.characters = r.characters; }catch(e){ state.characters=[]; }
  try{ const r=await apiGet('/character-reviews'); state.characterReviews = r.characterReviews; }catch(e){ state.characterReviews=[]; }
  try{ const r=await apiGet('/auth/me'); state.user = r.user; }catch(e){ state.user=null; }
  try{ const r=await apiGet('/date-events'); DATE_EVENTS = r.dateEvents; }catch(e){ DATE_EVENTS=[]; }
  try{ const r=await apiGet('/news'); NEWS_ITEMS = r.news; }catch(e){ NEWS_ITEMS=[]; }
  if(state.user){ try{ const r=await apiGet('/notifications'); state.notifications = r.notifications; }catch(e){ state.notifications=[]; } }
  else { state.notifications=[]; }
}

/* ---------- theme (dark night-friendly / light) ---------- */
let currentTheme='light';
// Aplica un tema (pone data-theme en <html>, que dispara todas las variables CSS del tema) y actualiza el ícono del botón.
function applyTheme(t){
  currentTheme=t;
  document.documentElement.setAttribute('data-theme', t);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t==='dark' ? '#12111F' : '#F2F2F7');
  const btn=document.getElementById('themeToggle');
  if(btn) btn.innerHTML = t==='dark' ? ICONS.sun : ICONS.moon;
}
// Botón de la lamparita: alterna claro/oscuro y lo guarda en localStorage.
function toggleTheme(){
  const next = currentTheme==='dark' ? 'light' : 'dark';
  applyTheme(next);
  try{ localStorage.setItem('theme', next); }catch(e){}
}
// Lee el tema guardado al arrancar (se llama una sola vez desde 14-init.js).
function loadTheme(){
  try{
    const v = localStorage.getItem('theme');
    applyTheme(v==='light'||v==='dark' ? v : 'light');
  }catch(e){ applyTheme('light'); }
}

/* ---------- compact display gauge ---------- */
// Barra de progreso que muestra una nota fija (no interactiva) — se usa en las cards de reseñas. Anima el llenado con requestAnimationFrame para que se vea la transición CSS.
function renderGauge(container, value){
  container.innerHTML = `<div class="gauge"><div class="gauge-track"><div class="gauge-fill"></div></div><div class="gauge-num">${value}/10</div></div>`;
  requestAnimationFrame(()=>{ const f=container.querySelector('.gauge-fill'); if(f) f.style.width=(value*10)+'%'; });
}

/* ---------- calificación rápida (independiente de la reseña) ---------- */
// Pinta los 10 botones del 1 al 10 según qué valor está "encendido" (hover o valor guardado); `value` puede ser el número bajo el mouse o la nota actual.
function paintQuickRate(wrap, value){
  wrap.querySelectorAll('.rate-btn').forEach((b,idx)=>{
    const i=idx+1;
    const lit = value!=null && i<=value;
    b.classList.toggle('lit', lit);
    b.style.background = lit ? MOOD_COLOR(value) : '';
    b.style.borderColor = lit ? MOOD_COLOR(value) : '';
  });
}
// Actualiza el número grande + la palabra de "mood" + el brillito (nota >=9) + el botón de borrar, para el widget de calificación identificado por `scope` (prefijo de los ids: scope+'Num', scope+'Mood', etc.). `moodFn` es la función que traduce nota -> palabra; por defecto MOOD (para juegos), pero 14-characters.js le pasa MOOD_CHARACTER para que el mismo widget diga otra cosa al calificar un personaje.
function updateQuickReadout(scope, value, animate, moodFn){
  moodFn = moodFn || MOOD;
  const num=document.getElementById(scope+'Num');
  const mood=document.getElementById(scope+'Mood');
  const spark=document.getElementById(scope+'Sparkle');
  const clearBtn=document.getElementById(scope+'ClearBtn');
  if(!num) return;
  num.textContent = value==null ? '—' : value;
  num.style.color = value==null ? '' : MOOD_TEXT_COLOR(value);
  mood.textContent = value==null ? t('no_rating_yet') : moodFn(value);
  mood.style.color = value==null ? '' : MOOD_TEXT_COLOR(value);
  if(value!=null && value>=9){ spark.classList.add('show'); } else { spark.classList.remove('show'); }
  if(clearBtn) clearBtn.hidden = value==null;
  if(animate){ num.classList.remove('bump'); void num.offsetWidth; num.classList.add('bump'); }
}
// Arma y engancha los 10 botones de calificación rápida para un juego. `scope` es un prefijo (p.ej. "qr") que identifica ESTE widget en particular, por si hay más de uno en pantalla (raro, pero el sistema lo permite).
function renderQuickRate(scope, gameId, currentValue){
  const wrap = document.getElementById(scope+'Buttons');
  if(!wrap) return;
  let current = currentValue;
  wrap.innerHTML='';
  for(let i=1;i<=10;i++){
    const b=document.createElement('button');
    b.type='button'; b.className='rate-btn'; b.textContent=i; b.setAttribute('aria-label', i+' '+t('rate_out_of_ten'));
    b.addEventListener('mouseenter', ()=> paintQuickRate(wrap, i));
    b.addEventListener('mouseleave', ()=> paintQuickRate(wrap, current));
    b.addEventListener('click', async ()=>{
      current=i;
      paintQuickRate(wrap, i);
      updateQuickReadout(scope, i, true);
      b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      if(await saveRating(gameId, i)){
        if(i>=9) celebrateFavorite(wrap);
        toast(t('toast_rating_saved'));
      }
      renderGameDetail();
    });
    wrap.appendChild(b);
  }
  paintQuickRate(wrap, current);
  updateQuickReadout(scope, current, false);
  const clearBtn = document.getElementById(scope+'ClearBtn');
  if(clearBtn) clearBtn.onclick = ()=> deleteRating(gameId);
}
// Guardar es "optimista": la pantalla cambia al instante y recién después se le avisa al servidor. Si el servidor no lo acepta (sin conexión, límite de
// intentos, sesión vencida) se avisa con un solo mensaje de error y se vuelve a pedir el estado real de las reseñas, para que la pantalla no siga
// mostrando como guardado algo que no lo está. Devuelve true si se guardó. Lo usan también 10-lists.js y 14-characters.js.
async function persistOrResync(request){
  try{ await request(); return true; }
  catch(e){
    toast(t(e && e.body && e.body.error==='too_many_requests' ? 'err_too_many' : 'err_save_review'));
    try{
      const [rv, crv] = await Promise.all([apiGet('/reviews'), apiGet('/character-reviews')]);
      state.reviews = rv.reviews; state.characterReviews = crv.characterReviews;
    }catch(e2){ /* sin conexión: queda como está */ }
    return false;
  }
}
// Guarda (o crea) la nota de state.user para un juego: actualiza el estado local al instante (optimista) y recién después pega al servidor; si falla, avisa por toast pero no revierte el cambio local.
async function saveRating(gameId, rating){
  if(!state.user) return false;
  let rv = state.reviews.find(r=>r.gameId===gameId && r.username===state.user.username);
  if(rv){ rv.rating=rating; rv.date=new Date().toISOString(); }
  else { rv = { id:uid(), gameId, username:state.user.username, rating, text:'', platforms:[], date:new Date().toISOString() }; state.reviews.push(rv); }
  return persistOrResync(()=> apiPut('/reviews/'+encodeURIComponent(gameId), { rating }));
}
// Igual que saveRating pero para el texto de la reseña.
async function saveReviewText(gameId, text){
  if(!state.user) return false;
  let rv = state.reviews.find(r=>r.gameId===gameId && r.username===state.user.username);
  if(rv){ rv.text=text; rv.date=new Date().toISOString(); }
  else { rv = { id:uid(), gameId, username:state.user.username, rating:null, text, platforms:[], date:new Date().toISOString() }; state.reviews.push(rv); }
  return persistOrResync(()=> apiPut('/reviews/'+encodeURIComponent(gameId), { text }));
}
// Borra solo el texto de la reseña (pide confirmación); si la reseña queda sin nota, sin texto y sin plataformas, la elimina del todo — nunca se deja un registro completamente vacío.
async function deleteReviewText(gameId){
  if(!await confirmDialog(t('confirm_delete_review_only'))) return;
  const rv = state.reviews.find(r=>r.gameId===gameId && r.username===state.user.username);
  if(!rv) return;
  rv.text = '';
  const isEmpty = rv.rating==null && (!rv.platforms || rv.platforms.length===0);
  if(isEmpty){ state.reviews = state.reviews.filter(r=>r.id!==rv.id); }
  if(await persistOrResync(()=> apiDelete('/reviews/'+encodeURIComponent(gameId)+'/text'))) toast(t('toast_review_deleted'));
  renderGameDetail();
}
// Borra solo la nota (pide confirmación), con la misma lógica de "si queda todo vacío, borrar la reseña entera" que deleteReviewText.
async function deleteRating(gameId){
  if(!await confirmDialog(t('confirm_clear_rating'))) return;
  const rv = state.reviews.find(r=>r.gameId===gameId && r.username===state.user.username);
  if(!rv) return;
  rv.rating = null;
  const isEmpty = (!rv.text || !rv.text.trim()) && (!rv.platforms || rv.platforms.length===0);
  if(isEmpty){ state.reviews = state.reviews.filter(r=>r.id!==rv.id); }
  if(await persistOrResync(()=> apiDelete('/reviews/'+encodeURIComponent(gameId)+'/rating'))) toast(t('toast_rating_removed'));
  renderGameDetail();
}
// Guarda qué plataformas jugó el usuario ese juego (checkboxes de la ficha).
async function saveReviewPlatforms(gameId, platforms){
  if(!state.user) return false;
  let rv = state.reviews.find(r=>r.gameId===gameId && r.username===state.user.username);
  if(rv){
    rv.platforms=platforms;
    if(rv.rating==null && !rv.text.trim() && platforms.length===0){ state.reviews = state.reviews.filter(r=>r.id!==rv.id); }
  }
  else if(platforms.length>0){ rv = { id:uid(), gameId, username:state.user.username, rating:null, text:'', platforms, date:new Date().toISOString() }; state.reviews.push(rv); }
  return persistOrResync(()=> apiPut('/reviews/'+encodeURIComponent(gameId), { platforms }));
}
// Pinta los chips de plataforma seleccionables en la ficha de un juego (usa las plataformas del juego si las tiene cargadas, si no ofrece todas).
function renderQuickPlatforms(gameId, g, myReview){
  const wrap = document.getElementById('qrPlatforms');
  if(!wrap) return;
  const selected = new Set(myReview && myReview.platforms ? myReview.platforms : []);
  const options = (g.platforms && g.platforms.length) ? g.platforms : Object.keys(PLATFORM_NAMES);
  wrap.innerHTML = options.map(p=> platChip(p, selected.has(p))).join('');
  wrap.querySelectorAll('.plat-chip').forEach(c=>{
    c.onclick = async ()=>{
      const p=c.dataset.plat;
      selected.has(p) ? selected.delete(p) : selected.add(p);
      c.classList.toggle('active');
      await saveReviewPlatforms(gameId, Array.from(selected));
    };
  });
}
// Bloque de texto de la reseña en la ficha de un juego: tiene 3 estados según haya o no texto guardado y según state.reviewEditing — "escribir reseña" (vacío), "ver + botones editar/borrar" (con texto, sin editar), o el textarea de edición.
function renderReviewBlock(gameId, myReview){
  const wrap = document.getElementById('reviewBlock');
  if(!wrap) return;
  const hasText = myReview && myReview.text && myReview.text.trim().length>0;
  if(!state.reviewEditing){
    if(hasText){
      wrap.innerHTML = `
        <p class="rc-text" style="margin-top:8px;">${esc(myReview.text)}</p>
        <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; align-items:center;">
          <button class="btn small" id="editReviewBtn">${t('edit_your_review')}</button>
          <button class="icon-btn" id="deleteReviewTextBtn">${t('delete_review_only_btn')}</button>
        </div>`;
      document.getElementById('editReviewBtn').onclick = ()=>{ state.reviewEditing=true; state.reviewEditingGameId=gameId; renderReviewBlock(gameId, myReview); };
      document.getElementById('deleteReviewTextBtn').onclick = ()=> deleteReviewText(gameId);
    } else {
      wrap.innerHTML = `<button class="btn small" id="writeReviewBtn" style="margin-top:8px;">${t('write_review_btn')}</button>`;
      document.getElementById('writeReviewBtn').onclick = ()=>{ state.reviewEditing=true; state.reviewEditingGameId=gameId; renderReviewBlock(gameId, myReview); };
    }
  } else {
    wrap.innerHTML = `
      <textarea id="reviewTextInput" maxlength="600" placeholder="${esc(t('add_review_ph'))}" style="margin-top:8px;">${esc(hasText?myReview.text:'')}</textarea>
      <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
        <button class="btn gold small" id="saveReviewBtn">${t('save_review_btn')}</button>
        <button class="linklike" id="cancelReviewBtn">${t('cancel_btn')}</button>
      </div>
      <div class="error" id="reviewError" hidden></div>`;
    document.getElementById('saveReviewBtn').onclick = async ()=>{
      const input=document.getElementById('reviewTextInput');
      const errEl=document.getElementById('reviewError');
      const text=input.value.trim();
      if(text.length<10){ errEl.textContent=t('toast_write_more'); errEl.hidden=false; return; }
      if(!await saveReviewText(gameId, text)){ errEl.textContent=t('err_save_review'); errEl.hidden=false; return; } // el texto escrito queda en el cuadro para reintentar
      state.reviewEditing=false;
      toast(t('toast_review_published'));
      renderGameDetail();
    };
    document.getElementById('cancelReviewBtn').onclick = ()=>{ state.reviewEditing=false; renderReviewBlock(gameId, myReview); };
  }
}

