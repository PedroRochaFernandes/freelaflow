/* FreelaFlow — gráficos em SVG puro (sem bibliotecas) */
const Charts = (() => {
  const { money, moneyCompact, esc } = Utils;

  // Arredonda o topo do eixo Y para um valor "bonito" (1, 2, 2.5, 5, 10 × 10^n)
  function niceMax(v) {
    if (v <= 0) return 1000;
    const exp = 10 ** Math.floor(Math.log10(v));
    const n = v / exp;
    const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return nice * exp;
  }

  /** Barras agrupadas: receitas × despesas por mês */
  function bars(series, activeKey) {
    const W = 640, H = 260, pl = 58, pr = 8, pt = 14, pb = 32;
    const iw = W - pl - pr, ih = H - pt - pb;
    const max = niceMax(Math.max(0, ...series.flatMap((s) => [s.income, s.expense])));

    let grid = '';
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = (max / ticks) * i;
      const y = pt + ih - (v / max) * ih;
      grid += `<line class="grid-line" x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}"/>`;
      grid += `<text class="axis" x="${pl - 10}" y="${y + 4}" text-anchor="end">${moneyCompact(v)}</text>`;
    }

    const gw = iw / series.length;
    const bw = Math.min(24, gw * 0.26);
    const groups = series
      .map((s, i) => {
        const cx = pl + gw * i + gw / 2;
        const hI = (s.income / max) * ih;
        const hE = (s.expense / max) * ih;
        const balance = s.income - s.expense;
        const tip =
          `<strong>${esc(Utils.monthLabel(s.key))}</strong>` +
          `<span class="tip-row"><i class="sw income"></i>Receitas<b>${money(s.income)}</b></span>` +
          `<span class="tip-row"><i class="sw expense"></i>Despesas<b>${money(s.expense)}</b></span>` +
          `<span class="tip-row total">Saldo<b class="${balance >= 0 ? 'text-income' : 'text-expense'}">${money(balance)}</b></span>`;
        return `<g class="bar-group${s.key === activeKey ? ' active' : ''}" data-tip="${esc(tip)}">
          <rect class="bar-hit" x="${cx - gw / 2 + 4}" y="${pt}" width="${gw - 8}" height="${ih}" rx="10"/>
          <rect class="bar income" x="${cx - bw - 3}" y="${pt + ih - hI}" width="${bw}" height="${hI}" rx="5" style="animation-delay:${i * 60}ms"/>
          <rect class="bar expense" x="${cx + 3}" y="${pt + ih - hE}" width="${bw}" height="${hE}" rx="5" style="animation-delay:${i * 60 + 30}ms"/>
          <text class="axis axis-x" x="${cx}" y="${H - 10}" text-anchor="middle">${Utils.monthLabel(s.key, 'short')}</text>
        </g>`;
      })
      .join('');

    return `<svg class="chart chart-bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="Receitas e despesas dos últimos ${series.length} meses">${grid}${groups}</svg>`;
  }

  /** Rosca de participação (ex.: despesas por categoria) */
  function donut(items, centerLabel) {
    const total = items.reduce((a, b) => a + b.value, 0);
    const size = 160, c = size / 2, r = 60, sw = 20, C = 2 * Math.PI * r;
    const gap = items.length > 1 ? 2.5 : 0;
    let acc = 0;
    const arcs = items
      .map((it) => {
        const len = (it.value / total) * C;
        const tip = `<strong>${esc(it.label)}</strong>${money(it.value)} · ${((it.value / total) * 100).toFixed(0)}%`;
        const seg = `<circle class="donut-seg" cx="${c}" cy="${c}" r="${r}" fill="none" style="stroke:${it.color}" stroke-width="${sw}"
          stroke-dasharray="${Math.max(len - gap, 0.01)} ${C}" stroke-dashoffset="${-acc}" transform="rotate(-90 ${c} ${c})" data-tip="${esc(tip)}"/>`;
        acc += len;
        return seg;
      })
      .join('');
    return `<svg class="chart chart-donut" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(centerLabel)}: ${money(total)}">
      <circle class="donut-track" cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${sw}"/>
      ${arcs}
      <text class="donut-total" x="${c}" y="${c + 2}" text-anchor="middle">${moneyCompact(total)}</text>
      <text class="donut-label" x="${c}" y="${c + 20}" text-anchor="middle">${esc(centerLabel)}</text>
    </svg>`;
  }

  /** Anel de progresso (meta mensal) */
  function ring(pct) {
    const size = 150, c = size / 2, r = 62, sw = 12, C = 2 * Math.PI * r;
    const len = (C * Math.min(Math.max(pct, 0), 100)) / 100;
    const value =
      len > 0
        ? `<circle class="ring-value${pct >= 100 ? ' done' : ''}" cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${len} ${C}" transform="rotate(-90 ${c} ${c})"/>`
        : '';
    return `<svg class="chart chart-ring" viewBox="0 0 ${size} ${size}" role="img" aria-label="${Math.round(pct)}% da meta">
      <circle class="ring-track" cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${sw}"/>
      ${value}
      <text class="ring-pct" x="${c}" y="${c + 4}" text-anchor="middle">${Math.round(pct)}%</text>
      <text class="ring-label" x="${c}" y="${c + 24}" text-anchor="middle">da meta</text>
    </svg>`;
  }

  return { bars, donut, ring };
})();
