/* =====================================================================
   Carimbo de comprovação
   A Mann exige data, hora e endereço na própria imagem. Os promotores
   fazem isso hoje com um app de câmera; aqui o carimbo é desenhado na
   montagem, a partir do dado estruturado do banco.
   ===================================================================== */

const sharp = require('sharp');

const esc = s => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Quebra o texto em linhas de no máximo `max` caracteres, sem cortar palavra. */
function quebrar(txt, max) {
  const palavras = String(txt || '').split(/\s+/).filter(Boolean);
  const linhas = [];
  let atual = '';
  for (const p of palavras) {
    if (!atual) { atual = p; continue; }
    if ((atual + ' ' + p).length <= max) atual += ' ' + p;
    else { linhas.push(atual); atual = p; }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

const MESES = ['jan.','fev.','mar.','abr.','mai.','jun.','jul.','ago.','set.','out.','nov.','dez.'];

function formatarData(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Aplica o carimbo no canto inferior direito da imagem.
 * @param {Buffer} buf      imagem original
 * @param {object} dados    { capturada_em, endereco, cidade, uf, latitude, longitude }
 * @returns {Promise<Buffer>} JPEG com o carimbo
 */
async function carimbar(buf, dados) {
  const img = sharp(buf).rotate();               // respeita o EXIF de orientação
  const meta = await img.metadata();
  const W = meta.width || 1200;
  const H = meta.height || 1600;

  const linhas = [];
  const data = formatarData(dados.capturada_em);
  if (data) linhas.push(data);

  const endereco = [dados.endereco, dados.cidade].filter(Boolean).join(', ');
  quebrar(endereco, 34).forEach(l => linhas.push(l));
  if (dados.uf) linhas.push(String(dados.uf));
  if (dados.latitude != null && dados.longitude != null) {
    linhas.push(`${Number(dados.latitude).toFixed(5)}, ${Number(dados.longitude).toFixed(5)}`);
  }
  if (!linhas.length) return await img.jpeg({ quality: 92 }).toBuffer();

  // a fonte acompanha a largura da imagem para o carimbo pesar igual em
  // fotos de tamanhos diferentes
  const fs = Math.max(11, Math.round(W * 0.021));
  const lh = Math.round(fs * 1.32);
  const pad = Math.round(fs * 0.85);
  const alturaBloco = linhas.length * lh + pad * 1.4;

  const textos = linhas.map((l, i) => {
    const y = Math.round(H - alturaBloco + pad + (i + 1) * lh - lh * 0.24);
    return `<text x="${W - pad}" y="${y}" text-anchor="end" ` +
           `font-family="Arial, Helvetica, sans-serif" font-size="${fs}" ` +
           `fill="#FFFFFF" opacity="0.94">${esc(l)}</text>`;
  }).join('');

  const svg = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
       <defs>
         <linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0" stop-color="#000000" stop-opacity="0"/>
           <stop offset="1" stop-color="#000000" stop-opacity="0.52"/>
         </linearGradient>
       </defs>
       <rect x="0" y="${Math.round(H - alturaBloco - fs * 2)}" width="${W}" height="${Math.round(alturaBloco + fs * 2)}" fill="url(#v)"/>
       ${textos}
     </svg>`
  );

  return await img
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

module.exports = { carimbar, formatarData, quebrar };
