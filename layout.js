/* =====================================================================
   Layout do slide "AÇÃO NO TRADE"
   Medidas em pontos, extraídas do relatório de Abril 2026.
   O slide é 960 x 540 pt (16:9). pptxgenjs trabalha em polegadas.
   ===================================================================== */

const PT = 1 / 72;                    // ponto -> polegada
const pol = pt => pt * PT;

const SLIDE = { w: 960, h: 540 };

const COR = {
  amarelo:  'FFF000',   // amostrado da capa e do rodapé
  verde:    '007C50',   // títulos, número da página
  tarja:    '007952',   // legenda das fotos e divisórias
  texto:    '000000',
  branco:   'FFFFFF'
};

const FONTE = {
  titulo: 'Arial',      // seguro: mesma métrica no PowerPoint e no preview
  corpo:  'Arial'
};

const G = {
  margem:      27,
  larguraUtil: 960 - 27 * 2,

  titulo:      { x: 11.3, y: 4,    tam: 28 },

  secao1:      { bullet: 12.3, x: 26.4, y: 50,  tam: 18 },
  desc1:       { bullet: 21,   x: 26.4, y: 80,  tam: 10 },
  faixa1:      { y: 100, alturaAlvo: 95, alturaMin: 52 },

  divisoria1:  { y: 222 },

  secao2:      { bullet: 12.3, x: 26.4, y: 231, tam: 18 },
  desc2:       { bullet: 21,   x: 26.4, y: 264, tam: 10 },
  faixa2:      { y: 285, alturaAlvo: 92, alturaMin: 52 },

  divisoria2:  { y: 408 },

  legenda:     { altura: 15, tam: 9.5 },
  gap:         2.5,

  rodape:      { y: 470, altura: 70 },
  pagina:      { x: 40,    y: 486, tam: 20, largura: 40 },
  rodapeTxt:   { x: 106.4, y: 489, tam: 12 },
  logo:        { direita: 34, y: 486, altura: 40 }
};

/**
 * Distribui as fotos numa faixa horizontal: altura uniforme por linha,
 * largura proporcional ao formato de cada imagem. Quando a linha estoura
 * a largura útil, a altura encolhe; se encolher demais, quebra em duas.
 *
 * @param {{w:number,h:number}[]} fotos  dimensões originais
 * @param {{y:number, alturaAlvo:number, alturaMin:number}} faixa
 * @returns {{x:number,y:number,w:number,h:number,i:number}[]} em pontos
 */
function distribuir(fotos, faixa) {
  if (!fotos.length) return [];

  const alturaTotal = faixa.alturaAlvo + G.legenda.altura;
  const cabeDuasLinhas = alturaTotal * 2 + 6 <= (faixa.espacoDisponivel || 1e9);

  const razoes = fotos.map(f => (f.w && f.h) ? f.w / f.h : 0.75);

  // tenta uma linha só, encolhendo a altura até caber
  const larguraCom = h => razoes.reduce((s, r) => s + r * h, 0) + G.gap * (fotos.length - 1);

  let h = faixa.alturaAlvo;
  if (larguraCom(h) > G.larguraUtil) {
    h = (G.larguraUtil - G.gap * (fotos.length - 1)) / razoes.reduce((s, r) => s + r, 0);
  }

  if (h >= faixa.alturaMin || !cabeDuasLinhas) {
    h = Math.min(h, faixa.alturaAlvo);
    const out = [];
    let x = G.margem;
    fotos.forEach((f, i) => {
      const w = razoes[i] * h;
      out.push({ x, y: faixa.y, w, h, i });
      x += w + G.gap;
    });
    return out;
  }

  // duas linhas: divide pela soma das razões, não pela contagem
  const metade = razoes.reduce((s, r) => s + r, 0) / 2;
  let acc = 0, corte = fotos.length - 1;
  for (let i = 0; i < razoes.length; i++) {
    acc += razoes[i];
    if (acc >= metade) { corte = i; break; }
  }

  const linhas = [fotos.slice(0, corte + 1), fotos.slice(corte + 1)].filter(l => l.length);
  const alturaLinha = Math.min(
    faixa.alturaAlvo,
    (faixa.alturaAlvo * 2 - G.legenda.altura) / 2
  );

  const out = [];
  let base = 0, y = faixa.y;
  for (const linha of linhas) {
    const rz = linha.map(f => (f.w && f.h) ? f.w / f.h : 0.75);
    let hl = alturaLinha;
    const larg = hh => rz.reduce((s, r) => s + r * hh, 0) + G.gap * (linha.length - 1);
    if (larg(hl) > G.larguraUtil) {
      hl = (G.larguraUtil - G.gap * (linha.length - 1)) / rz.reduce((s, r) => s + r, 0);
    }
    let x = G.margem;
    linha.forEach((f, k) => {
      const w = rz[k] * hl;
      out.push({ x, y, w, h: hl, i: base + k });
      x += w + G.gap;
    });
    base += linha.length;
    y += hl + G.legenda.altura + 5;
  }
  return out;
}

module.exports = { PT, pol, SLIDE, COR, FONTE, G, distribuir };
