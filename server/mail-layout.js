// El formato de TODOS los correos de DLCritic: oscuro, con el logo arriba, el saludo, el mensaje y un recuadro con borde de color para lo principal
// (el botón con el enlace, o el aviso). Todo va con estilos escritos en cada elemento y con tablas, que es lo único que los clientes de correo
// (Gmail, Outlook, el celular) respetan de forma fiable: nada de clases, degradados ni fuentes propias. El texto plano se arma desde la misma
// estructura (textOf), así que cada correo sale en las dos versiones y no pueden quedar distintas.
//
// Un correo se describe así (mail.js tiene los de ahora):
//   { subject, preheader, title, paragraphs: [texto, ...], box: { label, note, accent?, code?, button?: { text, url }, fallback? } }
// El logo es el PNG del sitio (public/img/icon-192.png) en la dirección pública: si no se conoce (siteUrl vacío) se omite y queda el nombre en texto.

const C = { page: '#0B0A14', card: '#12111F', box: '#1B1936', title: '#FFFFFF', body: '#C9C5E6', muted: '#9A97B5', faint: '#77739A', purple: '#8B7FE8', pink: '#F0A8D0', button: '#7B61FF' };
const FONT = 'Arial,Helvetica,sans-serif';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const GREETING = { es: 'Hola', en: 'Hi' };
const FOOTER = {
  es: 'Recibes este correo automático porque esta dirección está registrada en DLCritic.',
  en: 'You are getting this automatic email because this address is registered on DLCritic.',
};

// La versión de texto plano (para quien no ve HTML y para los filtros de spam, que la miran).
function textOf({ lang, name, paragraphs, box }) {
  const lines = [`${GREETING[lang]} ${name},`, '', ...paragraphs.flatMap(p => [p, ''])];
  lines.push(box.label.toUpperCase());
  if (box.code) lines.push(box.code, '');
  if (box.button) lines.push(`${box.button.text}:`, box.button.url, '');
  if (box.note) lines.push(box.note, '');
  lines.push('— DLCritic');
  return lines.join('\n');
}

function htmlOf({ lang, name, preheader, title, paragraphs, box, siteUrl }) {
  const accent = box.accent || C.button;
  const logo = siteUrl ? `<td style="padding-right:12px;"><img src="${esc(siteUrl)}/img/icon-192.png" width="44" height="44" alt="" style="display:block;border:0;width:44px;height:44px;"></td>` : '';
  const row = (inner, pad) => `<tr><td style="padding:${pad};font-family:${FONT};">${inner}</td></tr>`;
  const code = box.code ? `
          <div style="margin:0 0 14px;font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:bold;letter-spacing:8px;color:#FFFFFF;">${esc(box.code)}</div>` : '';
  const button = box.button ? `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;"><tr>
            <td bgcolor="${C.button}" style="background-color:${C.button};border-radius:6px;"><a href="${esc(box.button.url)}" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:6px;">${esc(box.button.text)}</a></td>
          </tr></table>
          ${box.fallback ? `<p style="margin:0 0 4px;font-family:${FONT};font-size:12px;line-height:1.5;color:${C.muted};">${esc(box.fallback)}</p>
          <p style="margin:0 0 12px;font-family:${FONT};font-size:12px;line-height:1.5;word-break:break-all;"><a href="${esc(box.button.url)}" style="color:${C.purple};">${esc(box.button.url)}</a></p>` : ''}` : '';

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page};font-size:1px;line-height:1px;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background-color:${C.page};">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="width:100%;max-width:600px;background-color:${C.card};">
    ${row(`<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${logo}<td style="font-family:'Arial Black',Arial,sans-serif;font-size:22px;font-weight:bold;letter-spacing:1px;"><span style="color:${C.purple};">DLC</span><span style="color:${C.pink};">RITIC</span></td></tr></table>`, '36px 40px 0')}
    ${row(`<div style="font-size:28px;font-weight:bold;line-height:1.2;color:${C.muted};">${esc(GREETING[lang])}, <span style="color:#E9E6F7;">${esc(name)}</span></div>`, '30px 40px 0')}
    ${row(`<div style="font-size:21px;font-weight:bold;line-height:1.3;color:${C.title};">${esc(title)}</div>`, '18px 40px 0')}
    ${paragraphs.map(p => row(`<p style="margin:0;font-size:15px;line-height:1.6;color:${C.body};">${esc(p)}</p>`, '14px 40px 0')).join('\n    ')}
    <tr><td style="padding:24px 40px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.box}" style="background-color:${C.box};border:1px solid ${accent};">
        <tr><td style="padding:20px 22px;font-family:${FONT};">
          <div style="margin:0 0 12px;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${accent};">${esc(box.label)}</div>${code}${button}
          ${box.note ? `<p style="margin:0;font-size:13px;line-height:1.5;color:${C.muted};">${esc(box.note)}</p>` : ''}
        </td></tr>
      </table>
    </td></tr>
    ${row(`<p style="margin:0;font-size:12px;line-height:1.5;color:${C.faint};">— DLCritic${siteUrl ? ` · <a href="${esc(siteUrl)}" style="color:${C.faint};">${esc(siteUrl.replace(/^https?:\/\//, ''))}</a>` : ''}<br>${esc(FOOTER[lang])}</p>`, '28px 40px 36px')}
  </table>
</td></tr>
</table>
</body>
</html>`;
}

// Arma el correo completo (asunto, texto y HTML) a partir de su descripción.
function buildEmail(lang, name, content, siteUrl) {
  const data = { lang, name, siteUrl, ...content };
  return { subject: content.subject, text: textOf(data), html: htmlOf(data) };
}

module.exports = { buildEmail, C };
