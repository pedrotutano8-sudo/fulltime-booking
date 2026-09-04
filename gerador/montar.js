/* =====================================================================
   Montagem do PPTX — AÇÃO NO TRADE, Relatório de Visitas
   Reproduz o gabarito medido na edição de Abril 2026.
   ===================================================================== */

const PptxGenJS = require('pptxgenjs');
const fs = require('fs');
const path = require('path');
const { pol, SLIDE, COR, FONTE, G, distribuir } = require('./layout');

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const b64 = arq => 'image/png;base64,' + fs.readFileSync(arq).toString('base64');

function mesPorExtenso(iso) {
  const [a, m] = String(iso).split('-').map(Number);
  return `${MESES[(m || 1) - 1]} ${a}`;
}

/**
 * @param {object} dados
 *   dados.mes           '2026-04-01'
 *   dados.responsavel   'Luciana'
 *   dados.promotores    [{ nome, praca, secoes: { campanha: {texto, fotos[]}, conquista: {...} } }]
 *     foto: { buffer|arquivo, largura, altura, legenda }
 *   dados.ativos        { produto: caminho, logo: caminho }
 * @param {string} saida  caminho do .pptx
 */
async function montar(dados, saida) {
  const pres = new PptxGenJS();
  pres.defineLayout({ name: 'MANN', width: pol(SLIDE.w), height: pol(SLIDE.h) });
  pres.layout = 'MANN';
  pres.author = 'FullTime TradeMarketing';
  pres.title = `AÇÃO NO TRADE — ${mesPorExtenso(dados.mes)}`;

  capa(pres, dados);

  const ordenados = [...dados.promotores]
    .filter(p => temFoto(p))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  ordenados.forEach((p, i) => slidePromotor(pres, p, i + 1, dados));

  await pres.writeFile({ fileName: saida });
  return { slides: ordenados.length + 1, arquivo: saida };
}

const temFoto = p =>
  (p.secoes.campanha?.fotos?.length || 0) + (p.secoes.conquista?.fotos?.length || 0) > 0;

/**
 * A tarja tem a largura da foto, que varia com o formato da imagem.
 * Nomes longos em foto estreita quebrariam linha e vazariam da tarja,
 * então a fonte encolhe até caber e, no limite, o texto é truncado.
 * Arial bold em caixa alta ocupa ~0.62 do corpo por caractere.
 */
function ajustarLegenda(nome, larguraPt) {
  const texto = String(nome || '').toUpperCase().trim();
  if (!texto) return { texto: '', tam: G.legenda.tam };

  const util = larguraPt - 5;                  // respiro nas laterais
  const LARG = 0.62;
  const MIN = 6;

  let tam = Math.min(G.legenda.tam, util / (texto.length * LARG));
  if (tam >= MIN) return { texto, tam: Math.round(tam * 10) / 10 };

  const cabe = Math.max(3, Math.floor(util / (MIN * LARG)) - 1);
  return { texto: texto.slice(0, cabe).trim() + '…', tam: MIN };
}

/* ---------------- capa ---------------- */

function capa(pres, dados) {
  const s = pres.addSlide();
  s.background = { color: COR.amarelo };

  // A capa da Mann é fixa — produto, títulos e logo. Em vez de recriá-la e
  // conviver com a costura do recorte, usamos a arte original como fundo e
  // escrevemos por cima só o que muda a cada edição: responsável e mês.
  if (dados.ativos?.capa && fs.existsSync(dados.ativos.capa)) {
    s.addImage({
      data: b64(dados.ativos.capa),
      x: 0, y: 0, w: pol(SLIDE.w), h: pol(SLIDE.h)
    });
  }

  s.addText(`${dados.responsavel || 'Luciana'}\n${mesPorExtenso(dados.mes)}`, {
    x: pol(432), y: pol(292), w: pol(300), h: pol(44),
    fontSize: 13, color: COR.texto, fontFace: FONTE.corpo,
    lineSpacingMultiple: 1.2, isTextBox: true, margin: 0
  });
}

/* ---------------- slide de promotor ---------------- */

function slidePromotor(pres, prom, numero, dados) {
  const s = pres.addSlide();
  s.background = { color: 'FFFFFF' };

  const titulo = [prom.praca, prom.nome].filter(Boolean).join(' – ');
  s.addText(titulo, {
    x: pol(G.titulo.x), y: pol(G.titulo.y), w: pol(700), h: pol(40),
    fontSize: G.titulo.tam, color: COR.verde, fontFace: FONTE.titulo,
    isTextBox: true, margin: 0, valign: 'middle'
  });

  secao(s, {
    rotulo: 'Campanhas Alcançadas',
    conf: G.secao1, confDesc: G.desc1, faixa: G.faixa1,
    divisoria: G.divisoria1,
    dados: prom.secoes.campanha
  });

  secao(s, {
    rotulo: 'Conquistas',
    conf: G.secao2, confDesc: G.desc2, faixa: G.faixa2,
    divisoria: G.divisoria2,
    dados: prom.secoes.conquista
  });

  rodape(s, numero, dados);
}

function secao(s, o) {
  // marcador quadrado, como no original — não é barra decorativa
  s.addShape('rect', {
    x: pol(o.conf.bullet), y: pol(o.conf.y + 7), w: pol(6), h: pol(6),
    fill: { color: COR.verde }, line: { width: 0 }
  });
  s.addText(o.rotulo, {
    x: pol(o.conf.x), y: pol(o.conf.y), w: pol(500), h: pol(24),
    fontSize: o.conf.tam, color: COR.texto, fontFace: FONTE.titulo,
    isTextBox: true, margin: 0, valign: 'middle'
  });

  const texto = (o.dados && o.dados.texto) || '';
  if (texto) {
    s.addShape('rect', {
      x: pol(o.confDesc.bullet), y: pol(o.confDesc.y + 4), w: pol(4), h: pol(4),
      fill: { color: COR.verde }, line: { width: 0 }
    });
    s.addText(texto, {
      x: pol(o.confDesc.x), y: pol(o.confDesc.y - 2), w: pol(820), h: pol(16),
      fontSize: o.confDesc.tam, color: COR.texto, fontFace: FONTE.corpo,
      isTextBox: true, margin: 0, valign: 'middle'
    });
  }

  const fotos = (o.dados && o.dados.fotos) || [];
  if (fotos.length) {
    const caixas = distribuir(
      fotos.map(f => ({ w: f.largura, h: f.altura })),
      { ...o.faixa, espacoDisponivel: o.divisoria.y - o.faixa.y - 6 }
    );

    caixas.forEach(c => {
      const f = fotos[c.i];
      const img = f.buffer
        ? { data: 'image/jpeg;base64,' + f.buffer.toString('base64') }
        : { path: f.arquivo };

      s.addImage({ ...img, x: pol(c.x), y: pol(c.y), w: pol(c.w), h: pol(c.h),
                   sizing: { type: 'cover', w: pol(c.w), h: pol(c.h) } });

      s.addShape('rect', {
        x: pol(c.x), y: pol(c.y + c.h), w: pol(c.w), h: pol(G.legenda.altura),
        fill: { color: COR.tarja }, line: { width: 0 }
      });
      const { texto: legenda, tam } = ajustarLegenda(f.legenda, c.w);
      s.addText(legenda, {
        x: pol(c.x), y: pol(c.y + c.h), w: pol(c.w), h: pol(G.legenda.altura),
        fontSize: tam, bold: true, color: COR.branco, fontFace: FONTE.corpo,
        align: 'center', valign: 'middle', isTextBox: true, margin: 0,
        wrap: false, fit: 'none'
      });
    });
  }

  s.addShape('line', {
    x: pol(G.margem), y: pol(o.divisoria.y), w: pol(G.larguraUtil), h: 0,
    line: { color: COR.tarja, width: 1.25 }
  });
}

function rodape(s, numero, dados) {
  s.addShape('rect', {
    x: 0, y: pol(G.rodape.y), w: pol(SLIDE.w), h: pol(G.rodape.altura),
    fill: { color: COR.amarelo }, line: { width: 0 }
  });

  s.addText(String(numero), {
    x: pol(G.pagina.x), y: pol(G.pagina.y), w: pol(G.pagina.largura), h: pol(28),
    fontSize: G.pagina.tam, bold: true, color: COR.verde, fontFace: FONTE.titulo,
    align: 'center', valign: 'middle', isTextBox: true, margin: 0
  });

  s.addText(`${mesPorExtenso(dados.mes)}\nAÇÃO NO TRADE | Relatório de visitas`, {
    x: pol(G.rodapeTxt.x), y: pol(G.rodapeTxt.y), w: pol(500), h: pol(34),
    fontSize: G.rodapeTxt.tam, color: COR.texto, fontFace: FONTE.corpo,
    lineSpacingMultiple: 1.15, isTextBox: true, margin: 0, valign: 'middle'
  });

  if (dados.ativos?.logo && fs.existsSync(dados.ativos.logo)) {
    s.addImage({
      data: b64(dados.ativos.logo),
      x: pol(SLIDE.w - G.logo.direita - 62), y: pol(G.logo.y),
      w: pol(62), h: pol(G.logo.altura)
    });
  }
}

module.exports = { montar, mesPorExtenso };
