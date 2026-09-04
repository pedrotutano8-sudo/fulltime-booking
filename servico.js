/* =====================================================================
   Serviço do gerador — AÇÃO NO TRADE
   POST /gerar { mes: "2026-04-01" }  + Authorization: Bearer <JWT Supabase>
   Devolve o .pptx montado.

   Roda isolado num container. Não recebe nenhuma credencial pelo corpo da
   requisição: tudo vem do ambiente.
   ===================================================================== */

const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { montar, mesPorExtenso } = require('./montar');
const { carimbar } = require('./carimbo');

const {
  SUPABASE_URL, SUPABASE_SECRET_KEY,
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
  PORTA = 8090, ATIVOS_DIR = '/app/ativos'
} = process.env;

for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SECRET_KEY,
    R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET })) {
  if (!v) { console.error(`Falta a variável ${k}`); process.exit(1); }
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  forcePathStyle: true
});

const app = express();
app.use(express.json({ limit: '1mb' }));

/* ---------------- supabase ---------------- */

async function sbGet(caminho) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    headers: { apikey: SUPABASE_SECRET_KEY, Authorization: `Bearer ${SUPABASE_SECRET_KEY}` }
  });
  if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
  return await r.json();
}

/** Valida o JWT no próprio Supabase e confirma que existe perfil ativo. */
async function autenticar(req) {
  const h = req.headers.authorization || '';
  const jwt = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!jwt) return { erro: 401, msg: 'JWT ausente' };

  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SECRET_KEY, Authorization: `Bearer ${jwt}` }
  });
  if (!r.ok) return { erro: 401, msg: 'JWT inválido' };
  const user = await r.json();

  const perfis = await sbGet(
    `perfis?id=eq.${user.id}&ativo=is.true&select=id,nome,papel,marca_id`);
  if (!perfis.length) return { erro: 403, msg: 'Sem perfil ativo' };
  return { perfil: perfis[0] };
}

/* ---------------- fotos ---------------- */

const buffer = async stream => {
  const partes = [];
  for await (const p of stream) partes.push(p);
  return Buffer.concat(partes);
};

async function baixar(key) {
  const r = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  return await buffer(r.Body);
}

/**
 * Carimba e redimensiona. No slide a foto ocupa ~95pt de altura; 1200px
 * dá folga de sobra para zoom e impressão sem gerar um arquivo que a Mann
 * não consiga abrir no e-mail.
 */
async function prepararFoto(linha) {
  const original = await baixar(linha.r2_key_original);
  const carimbada = await carimbar(original, {
    capturada_em: linha.capturada_em,
    endereco: linha.endereco, cidade: linha.cidade, uf: linha.uf,
    latitude: linha.latitude, longitude: linha.longitude
  });
  const buf = await sharp(carimbada)
    .resize({ height: 1200, withoutEnlargement: true })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
  const meta = await sharp(buf).metadata();
  return { buffer: buf, largura: meta.width, altura: meta.height, legenda: linha.pdv_legenda };
}

/* ---------------- rota ---------------- */

app.get('/saude', (_, res) => res.json({ ok: true }));

app.post('/gerar', async (req, res) => {
  const t0 = Date.now();
  try {
    const auth = await autenticar(req);
    if (auth.erro) return res.status(auth.erro).json({ erro: auth.msg });

    const mes = String(req.body?.mes || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(mes)) {
      return res.status(400).json({ erro: 'mes inválido, use AAAA-MM-01' });
    }

    const linhas = await sbGet(
      `vw_relatorio?mes_referencia=eq.${mes}&select=*&order=promotor_nome,secao,ordem_secao,capturada_em`);
    if (!linhas.length) {
      return res.status(404).json({ erro: 'Nenhuma foto aprovada neste período' });
    }

    const descricoes = await sbGet(
      `relatorio_descricoes?mes_referencia=eq.${mes}&select=promotor_id,secao,texto`);
    const txt = (pid, sec) =>
      (descricoes.find(d => d.promotor_id === pid && d.secao === sec) || {}).texto || '';

    // agrupa por promotor e, dentro dele, por seção
    const porPromotor = new Map();
    for (const l of linhas) {
      if (!porPromotor.has(l.promotor_id)) {
        porPromotor.set(l.promotor_id, {
          nome: l.promotor_nome, praca: l.promotor_praca,
          secoes: {
            campanha:  { texto: txt(l.promotor_id, 'campanha'),  linhas: [] },
            conquista: { texto: txt(l.promotor_id, 'conquista'), linhas: [] }
          }
        });
      }
      const sec = l.secao === 'campanha' ? 'campanha' : 'conquista';
      porPromotor.get(l.promotor_id).secoes[sec].linhas.push(l);
    }

    // baixa e prepara em série: 100 fotos em paralelo estouram a memória
    // do container e o limite de conexões do R2
    let total = 0;
    for (const p of porPromotor.values()) {
      for (const sec of ['campanha', 'conquista']) {
        const fotos = [];
        for (const l of p.secoes[sec].linhas) {
          try { fotos.push(await prepararFoto(l)); total++; }
          catch (e) { console.error('foto falhou', l.foto_id, e.message); }
        }
        p.secoes[sec].fotos = fotos;
        delete p.secoes[sec].linhas;
      }
    }

    const arquivo = path.join(os.tmpdir(), `acao-no-trade-${mes}-${Date.now()}.pptx`);
    const r = await montar({
      mes,
      responsavel: process.env.RESPONSAVEL || 'Luciana',
      promotores: [...porPromotor.values()],
      ativos: {
        capa: path.join(ATIVOS_DIR, 'capa_base.png'),
        logo: path.join(ATIVOS_DIR, 'logo.png')
      }
    }, arquivo);

    const nome = `Acao no Trade - ${mesPorExtenso(mes).replace(' ', ' ')}.pptx`;
    console.log(`gerado em ${((Date.now()-t0)/1000).toFixed(1)}s · ${r.slides} slides · ${total} fotos`);

    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    fs.createReadStream(arquivo)
      .on('close', () => fs.unlink(arquivo, () => {}))
      .pipe(res);

  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: e.message });
  }
});

app.listen(PORTA, () => console.log(`gerador ouvindo em ${PORTA}`));
