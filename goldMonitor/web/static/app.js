/* 黄金走势分析 —— 前端 */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const OZ = 31.1035;
const TZ = 'Asia/Shanghai';

/* ———————— 通用工具 ———————— */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 隐私模式等 */ } },
};

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const tok = store.get('adminToken', '');
  if (tok) headers['X-Admin-Token'] = tok;
  const res = await fetch(path, { ...opts, headers });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).detail || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

const nf = (d) => new Intl.NumberFormat('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });
const num = (v, d = 1) => v == null || isNaN(v) ? '—' : nf(d).format(v);
const signed = (v, d = 1) => v == null || isNaN(v) ? '—' : (v > 0 ? '+' : '') + nf(d).format(v);
const pct = (v, d = 2) => v == null || isNaN(v) ? '—' : signed(v, d) + '%';
const cls = v => v == null || Math.abs(v) < 1e-9 ? 'flat' : v > 0 ? 'up' : 'down';
const arrow = v => v == null || Math.abs(v) < 1e-9 ? '' : v > 0 ? '▲ ' : '▼ ';
const chg = (v, d = 2, suffix = '%') => `<span class="${cls(v)}">${arrow(v)}${v == null ? '—' : signed(v, d) + suffix}</span>`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function bj(iso, fmt = 'full') {
  if (!iso) return '—';
  const d = new Date(iso);
  const o = { timeZone: TZ, hour12: false };
  if (fmt === 'date') Object.assign(o, { year: 'numeric', month: '2-digit', day: '2-digit' });
  else if (fmt === 'md') Object.assign(o, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  else if (fmt === 'time') Object.assign(o, { hour: '2-digit', minute: '2-digit' });
  else Object.assign(o, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  return new Intl.DateTimeFormat('zh-CN', o).format(d).replace(/\//g, '-');
}
const todayBJ = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

const DIR_CLS = { '上涨': 'up', '偏涨': 'up', '下跌': 'down', '偏跌': 'down', '震荡': '' };
const DIR_ICON = { '上涨': '▲', '偏涨': '↗', '下跌': '▼', '偏跌': '↘', '震荡': '↔' };
const HCN = { '5h': '未来5小时', '1d': '未来1天', '7d': '未来7天' };

/* ———————— 价格单位：美元/盎司 ⇄ 人民币/克（按当时汇率） ———————— */
const UNIT_Q = new URLSearchParams(location.search).get('unit');   // 链接可带 ?unit=cny
let UNIT = (UNIT_Q || store.get('unit', 'usd')) === 'cny' ? 'cny' : 'usd';
let FX = [];   // [[毫秒, 美元兑人民币]]，升序
const isCny = () => UNIT === 'cny';
const toMs = t => t == null ? Date.now() : typeof t === 'number' ? t : new Date(t).getTime();
function rateAt(t) {
  if (!FX.length) return null;
  const ms = toMs(t);
  let lo = 0, hi = FX.length - 1;
  if (ms < FX[0][0]) return FX[0][1];
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (FX[mid][0] <= ms) lo = mid; else hi = mid - 1; }
  return FX[lo][1];
}
// 换算：rate 优先（如预测记录保存的汇率），否则按 t 时刻的汇率；价差同样适用
function cv(usd, t, rate) {
  if (usd == null || isNaN(usd)) return null;
  if (!isCny()) return usd;
  const r = rate || rateAt(t);
  return r ? usd * r / OZ : null;
}
const DEC = () => isCny() ? 2 : 1;
const SYM = () => isCny() ? '¥' : '$';
const UNIT_CN = () => isCny() ? '人民币/克' : '美元/盎司';
const UNIT_S = () => isCny() ? '¥/克' : '$/盎司';
const P = (usd, t, rate) => num(cv(usd, t, rate), DEC());                     // 数值
const PS = (usd, t, rate) => { const v = cv(usd, t, rate); return v == null ? '—' : SYM() + num(v, DEC()); };   // 带符号
const PD = (usd, t, rate) => signed(cv(usd, t, rate), DEC());                 // 价差
function alt(usd, t, rate) {                                                  // 另一种单位，作辅助显示
  const r = rate || rateAt(t);
  if (usd == null || !r) return '';
  return isCny() ? `≈ $${num(usd, 1)}/盎司` : `≈ ¥${num(usd * r / OZ, 2)}/克`;
}
async function loadFx() {
  try { FX = (await api('/api/fx')).items || []; } catch { FX = []; }
}

/* ———————— 图表基础 ———————— */
const charts = {};
const renderers = {};   // id -> 重绘函数（切换主题时调用）

function getChart(id) {
  const el = document.getElementById(id);
  if (!charts[id]) {
    charts[id] = echarts.init(el);
    new ResizeObserver(() => charts[id] && charts[id].resize()).observe(el);
  }
  return charts[id];
}

function draw(id, fn) {
  renderers[id] = fn;
  const c = getChart(id);
  c.setOption(fn(), true);
  return c;
}

function T() {
  return {
    ink: cssVar('--ink'), ink2: cssVar('--ink-2'), muted: cssVar('--muted'), grid: cssVar('--grid'),
    axis: cssVar('--axis'), surface: cssVar('--surface'), s1: cssVar('--s1'), s2: cssVar('--s2'),
    s3: cssVar('--s3'), s4: cssVar('--s4'), s7: cssVar('--s7'), up: cssVar('--up'), down: cssVar('--down'),
    border: cssVar('--border'),
  };
}

function base(t, extra = {}) {
  return {
    animation: false,
    textStyle: { fontFamily: 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif', color: t.ink2 },
    grid: { left: 56, right: 20, top: 30, bottom: 36, containLabel: false },
    tooltip: {
      trigger: 'axis', backgroundColor: t.surface, borderColor: t.border, textStyle: { color: t.ink, fontSize: 12 },
      axisPointer: { type: 'cross', lineStyle: { color: t.muted }, crossStyle: { color: t.muted }, label: { backgroundColor: t.ink2 } },
    },
    legend: { top: 0, right: 0, textStyle: { color: t.ink2, fontSize: 12 }, itemWidth: 14, itemHeight: 8, icon: 'roundRect' },
    ...extra,
  };
}
const timeAxis = (t, extra = {}) => ({
  type: 'time', axisLine: { lineStyle: { color: t.axis } }, axisTick: { show: false },
  axisLabel: { color: t.muted, hideOverlap: true, fontSize: 11 }, splitLine: { show: false }, ...extra,
});
const valAxis = (t, extra = {}) => ({
  type: 'value', scale: true, axisLine: { show: false }, axisTick: { show: false },
  axisLabel: { color: t.muted, fontSize: 11 }, splitLine: { lineStyle: { color: t.grid } }, ...extra,
});
const lineS = (name, data, color, extra = {}) => ({
  name, type: 'line', data, showSymbol: false, symbolSize: 8, lineStyle: { width: 2, color }, itemStyle: { color },
  emphasis: { disabled: true }, ...extra,
});
function errBars(name, data, color) {
  // data: [[t, lo, hi]]
  return {
    name, type: 'custom', data, z: 3, tooltip: { show: false },
    renderItem(params, api) {
      const x = api.coord([api.value(0), api.value(1)])[0];
      const y1 = api.coord([api.value(0), api.value(1)])[1];
      const y2 = api.coord([api.value(0), api.value(2)])[1];
      const st = { stroke: color, lineWidth: 2, opacity: .55 };
      return { type: 'group', children: [
        { type: 'line', shape: { x1: x, y1, x2: x, y2 }, style: st },
        { type: 'line', shape: { x1: x - 4, y1, x2: x + 4, y2: y1 }, style: st },
        { type: 'line', shape: { x1: x - 4, y1: y2, x2: x + 4, y2 }, style: st },
      ] };
    },
  };
}

/* ———————— 主题 ———————— */
function applyTheme(th) {
  if (th) document.documentElement.setAttribute('data-theme', th);
  else document.documentElement.removeAttribute('data-theme');
  for (const [id, fn] of Object.entries(renderers)) if (charts[id]) charts[id].setOption(fn(), true);
}
$('#themeBtn').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme')
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  store.set('theme', next); applyTheme(next);
});
applyTheme(store.get('theme', ''));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(store.get('theme', '')));

/* ———————— 标签页 ———————— */
const loaded = {};
const loaders = {
  overview: () => { loadLatest(); loadOverviewPred(); },
  trend: () => { loadTrend(); loadAnalysis(); },
  query: () => { runQuery(); loadList(); },
  forecast: () => loadForecast(),
  context: () => loadContext(),
  system: () => loadSystem(),
};
function showTab(name) {
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + name));
  if (!loaded[name]) { loaded[name] = true; loaders[name](); }
  requestAnimationFrame(() => Object.values(charts).forEach(c => c.resize()));
  store.set('tab', name);
  history.replaceState(null, '', '#' + name);
}
$$('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

function seg(id, onChange) {
  const el = document.getElementById(id);
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('button', el).forEach(x => x.classList.toggle('active', x === b));
    onChange(b.dataset.v);
  });
  return () => $('button.active', el)?.dataset.v;
}
function setSeg(id, v) { $$(`#${id} button`).forEach(x => x.classList.toggle('active', x.dataset.v === v)); }

// 全局单位切换：所有已打开的页面按新单位重绘
setSeg('unitSegG', UNIT);
seg('unitSegG', v => {
  UNIT = v; store.set('unit', v);
  if (!loaded.overview) loadLatest();
  for (const k of Object.keys(loaded)) if (k !== 'context' && k !== 'system') loaders[k]();
});

/* ———————— 总览 ———————— */
let lastRefreshStamp = null;

async function loadLatest() {
  let d;
  try { d = await api('/api/latest'); } catch (e) { setLive('err', '连接失败'); return; }
  if (!d.ready) { setLive('', d.message); $('#heroPrice').textContent = '下载中…'; return; }
  setLive(d.market_open ? 'on' : 'closed', d.market_open ? '交易中' : '休市');
  const r0 = d.usdcny;   // 实时价格用最新汇率
  $('#heroUnit').textContent = UNIT_CN();
  $('#heroPrice').textContent = PS(d.price, d.time, r0);
  $('#heroChange').innerHTML = `${chg(cv(d.change, d.time, r0), DEC(), '')} &nbsp; ${chg(d.change_pct)} <span class="muted small">较上一交易日</span>`;
  $('#heroSub').innerHTML = [
    `<span><b>${alt(d.price, d.time, r0)}</b></span>`,
    `<span>日内高 ${P(d.day_high, d.time, r0)} / 低 ${P(d.day_low, d.time, r0)}</span>`,
    r0 ? `<span>汇率 ${num(r0, 4)}</span>` : '',
    `<span>更新于 ${bj(d.time, 'md')}</span>`,
  ].join('');
  document.title = `${PS(d.price, d.time, r0)} · 黄金走势分析`;

  const order = ['dxy', 'tnx', 'vix', 'silver', 'oil', 'usdcny'];
  $('#macroTiles').innerHTML = order.filter(k => d.macros[k]).map(k => {
    const m = d.macros[k];
    const dec = k === 'usdcny' ? 4 : k === 'tnx' ? 3 : 2;
    const delta = k === 'tnx' ? `${chg(m.change * 100, 1, 'bp')}` : chg(m.change_pct);
    return `<div class="tile"><div class="k">${m.name}</div><div class="v">${num(m.value, dec)}${k === 'tnx' ? '%' : ''}</div><div class="d">${delta} <span class="muted">24h</span></div></div>`;
  }).join('');

  draw('spark', () => {
    const t = T();
    const pts = d.spark[0].map((x, i) => [x, cv(d.spark[1][i], x)]);
    return {
      animation: false, grid: { left: 0, right: 0, top: 6, bottom: 6 },
      xAxis: { type: 'time', show: false }, yAxis: { type: 'value', scale: true, show: false },
      tooltip: { trigger: 'axis', backgroundColor: t.surface, borderColor: t.border, textStyle: { color: t.ink, fontSize: 12 },
        formatter: p => `${bj(new Date(p[0].value[0]).toISOString(), 'md')}<br><b>${SYM()}${num(p[0].value[1], DEC())}</b>` },
      series: [lineS('价格', pts, t.s1, { areaStyle: { color: t.s1, opacity: .08 } })],
    };
  });

  const stamp = d.last_refresh && d.last_refresh.at;
  if (lastRefreshStamp && stamp !== lastRefreshStamp) {
    // 后台刷新过数据 → 刷新当前可见内容
    loadOverviewPred();
    if (loaded.trend) loadTrend();
  }
  lastRefreshStamp = stamp;
}

function setLive(state, text) {
  const el = $('#live');
  el.className = 'live ' + state;
  $('span', el).textContent = text;
}

async function loadOverviewPred() {
  const [lat, all, ch] = await Promise.all([
    api('/api/predictions/latest'), api('/api/predictions?limit=120'), api('/api/chart?range=5d'),
  ]);
  if (!lat.items.length) {
    $('#predCards').innerHTML = '<div class="pred muted">暂无预测，系统将在交易时段自动生成，或到“预测与回测”页手动预测。</div>';
  } else {
    $('#predMeta').textContent = `生成于 ${bj(lat.created_at, 'md')} · 模型 v${lat.items[0].model_version}`;
    $('#predCards').innerHTML = lat.items.map(p => {
      const ch = (p.pred_price / p.base_price - 1) * 100;
      const r = p.usdcny, t0 = p.created_at;   // 预测记录统一用当时保存的汇率
      const st = p.status === 'evaluated'
        ? `实际 ${P(p.actual_price, t0, r)}，误差 ${PD(p.error_usd, t0, r)}，方向 ${p.direction_hit ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}`
        : `到期 ${bj(p.target_time, 'md')}`;
      return `<div class="pred">
        <div class="h"><span>${p.horizon_cn}</span><span class="badge ${DIR_CLS[p.direction]}">${DIR_ICON[p.direction]} ${p.direction}</span></div>
        <div class="p">${PS(p.pred_price, t0, r)} <span class="small ${cls(ch)}">${pct(ch)}</span></div>
        <div class="r">80% 区间 ${P(p.lower, t0, r)} ~ ${P(p.upper, t0, r)} ${UNIT_S()} · ${alt(p.pred_price, t0, r)}</div>
        <div class="prob" title="上涨概率"><i style="width:${(p.prob_up * 100).toFixed(0)}%"></i></div>
        <div class="r">上涨概率 ${(p.prob_up * 100).toFixed(0)}% · ${st}</div>
      </div>`;
    }).join('');
  }

  // 近 5 日价格 + 预测点
  const t0 = ch.candles.length ? ch.candles[0][0] : 0;
  const preds = all.items.filter(p => new Date(p.target_time).getTime() >= t0);
  draw('overviewChart', () => {
    const t = T();
    const price = ch.candles.map(c => [c[0], cv(c[2], c[0])]);
    const done = preds.filter(p => p.status === 'evaluated');
    const pend = preds.filter(p => p.status !== 'evaluated');
    const pt = p => ({ value: [new Date(p.target_time).getTime(), cv(p.pred_price, p.created_at, p.usdcny)], p });
    return base(t, {
      xAxis: timeAxis(t), yAxis: valAxis(t, { name: UNIT_S(), nameTextStyle: { color: t.muted, fontSize: 11 } }),
      dataZoom: [{ type: 'inside' }],
      legend: { ...base(t).legend, data: ['实际价格', '已验证预测', '待验证预测'] },
      tooltip: { ...base(t).tooltip, formatter: ps => ps.map(x => {
        if (x.seriesName === '实际价格') return `${bj(new Date(x.value[0]).toISOString(), 'md')}<br>实际价格 <b>${SYM()}${num(x.value[1], DEC())}</b>`;
        const p = x.data.p; if (!p) return '';
        const r = p.usdcny, t0 = p.created_at;
        return `<br>#${p.id} ${p.horizon_cn}预测 <b>${PS(p.pred_price, t0, r)}</b>（${p.direction}）<br>区间 ${P(p.lower, t0, r)} ~ ${P(p.upper, t0, r)}`
          + (p.status === 'evaluated' ? `<br>实际 ${P(p.actual_price, t0, r)}，误差 ${PD(p.error_usd, t0, r)}` : '<br>待验证');
      }).join('') },
      series: [
        lineS('实际价格', price, t.s1),
        errBars('区间', preds.map(p => [new Date(p.target_time).getTime(), cv(p.lower, p.created_at, p.usdcny), cv(p.upper, p.created_at, p.usdcny)]), t.s2),
        { name: '已验证预测', type: 'scatter', data: done.map(pt), symbolSize: 9, itemStyle: { color: t.s2, borderColor: t.surface, borderWidth: 2 } },
        { name: '待验证预测', type: 'scatter', data: pend.map(pt), symbolSize: 9, itemStyle: { color: t.surface, borderColor: t.s2, borderWidth: 2 } },
      ],
    });
  });
}

/* ———————— 走势 ———————— */
const trend = { range: '1y', type: 'line', overlay: '', start: '', end: '' };
seg('rangeSeg', v => { trend.range = v; trend.start = trend.end = ''; loadTrend(); });
seg('typeSeg', v => { trend.type = v; loadTrend(); });
$('#overlaySel').addEventListener('change', e => { trend.overlay = e.target.value; loadTrend(); });
$('#cGo').addEventListener('click', () => {
  const s = $('#cStart').value, e = $('#cEnd').value;
  if (!s || !e || s > e) return toast('请选择有效的起止日期');
  trend.start = s; trend.end = e; setSeg('rangeSeg', ''); loadTrend();
});

async function loadTrend() {
  const q = new URLSearchParams({ range: trend.range || '1y' });
  if (trend.start) { q.set('start', trend.start); q.set('end', trend.end); }
  if (trend.overlay) q.set('overlay', trend.overlay);
  const d = await api('/api/chart?' + q);
  const conv = (t, v) => cv(v, t);
  const unit = UNIT_S();
  const dec = DEC();
  const candles = d.candles.map(c => [c[0], conv(c[0], c[1]), conv(c[0], c[2]), conv(c[0], c[3]), conv(c[0], c[4])]);
  const first = candles[0], last = candles[candles.length - 1];
  const change = first && last ? (last[2] / first[2] - 1) * 100 : null;
  const hi = Math.max(...candles.map(c => c[4])), lo = Math.min(...candles.map(c => c[3]));
  $('#trendTitle').innerHTML = `黄金走势（${unit}）&nbsp; ${chg(change)}`;
  $('#trendNote').textContent = (d.interval === '1h' ? '小时线' : '日线') + ` · 区间最高 ${num(hi, dec)} / 最低 ${num(lo, dec)}`
    + (trend.overlay ? ' · 对比模式：两条线都以起点 = 100 归一化' : '');

  draw('trendChart', () => {
    const t = T();
    const fmtT = ms => bj(new Date(ms).toISOString(), d.interval === '1h' ? 'md' : 'date');
    if (trend.overlay && d.overlay && d.overlay.data.length && candles.length) {
      const g0 = candles[0][2], o0 = d.overlay.data[0][1];
      const gIdx = candles.map(c => [c[0], c[2] / g0 * 100]);
      const oIdx = d.overlay.data.map(x => [x[0], x[1] / o0 * 100]);
      return base(t, {
        xAxis: timeAxis(t), yAxis: valAxis(t, { name: '起点=100', nameTextStyle: { color: t.muted, fontSize: 11 } }),
        dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 6, borderColor: t.border, textStyle: { color: t.muted } }],
        grid: { left: 56, right: 20, top: 30, bottom: 56 },
        tooltip: { ...base(t).tooltip, valueFormatter: v => num(v, 2) },
        series: [lineS('黄金', gIdx, t.s1), lineS(d.overlay.name, oIdx, t.s2)],
      });
    }
    const maColors = [t.s2, t.s3, t.s4];
    const maSeries = Object.entries(d.ma).map(([k, arr], i) =>
      lineS(k, arr.map(x => [x[0], conv(x[0], x[1])]), maColors[i], { lineStyle: { width: 1.5, color: maColors[i] } }));
    const main = trend.type === 'candle'
      ? { name: '黄金', type: 'candlestick', data: candles.map(c => [c[0], c[1], c[2], c[3], c[4]]),
          itemStyle: { color: t.up, color0: t.down, borderColor: t.up, borderColor0: t.down }, barMaxWidth: 10 }
      : lineS('黄金', candles.map(c => [c[0], c[2]]), t.s1, { areaStyle: { color: t.s1, opacity: .06 } });
    return base(t, {
      xAxis: timeAxis(t), yAxis: valAxis(t, { name: unit, nameTextStyle: { color: t.muted, fontSize: 11 } }),
      grid: { left: 64, right: 20, top: 30, bottom: 56 },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 6, borderColor: t.border, textStyle: { color: t.muted } }],
      tooltip: { ...base(t).tooltip, formatter: ps => {
        let s = fmtT(ps[0].value[0]);
        for (const p of ps) {
          if (p.seriesType === 'candlestick') {
            const [, o, c, l, h] = p.value;
            s += `<br>开 ${num(o, dec)} 收 <b>${num(c, dec)}</b><br>高 ${num(h, dec)} 低 ${num(l, dec)} ${chg((c / o - 1) * 100)}`;
          } else s += `<br>${p.marker}${p.seriesName} <b>${num(p.value[1], dec)}</b>`;
        }
        return s;
      } },
      series: [main, ...maSeries],
    });
  });
}

async function loadAnalysis() {
  const a = await api('/api/analysis');
  $('#anaMeta').textContent = `${a.start_date} 至今 · 日线 · ${UNIT_CN()}`;
  // 后端分别按 美元/盎司 和 人民币/克 计算了统计（人民币计价的高低点、涨跌、回撤可能落在不同日期）
  const S = isCny() && a.cny ? a.cny : a;
  const F = v => SYM() + num(v, DEC());
  const md = isCny() ? 1 : 0;
  const tiles = [
    ['最新价', F(S.last), alt(a.last, Date.now(), a.fx)],
    ['近一年涨跌', `<span class="${cls(S.year_chg)}">${arrow(S.year_chg)}${pct(S.year_chg, 1)}</span>`, `一年前 ${F(S.start)}`],
    ['年内最高', F(S.high), S.high_date],
    ['年内最低', F(S.low), S.low_date],
    ['距高点回撤', pct(S.since_peak, 1), `年内最大回撤 ${pct(S.max_dd, 1)}`],
    ['年化波动率', num(S.ann_vol, 1) + '%', `RSI(14) ${num(S.rsi, 0)}`],
    ['均线', S.trend[0], `MA20 ${num(S.ma['20'], md)} · MA50 ${num(S.ma['50'], md)} · MA200 ${num(S.ma['200'], md)}`],
    ['相对 200 日线', S.trend[1].replace(/价格|200日均线/g, ''), S.trend[2]],
  ];
  $('#anaTiles').innerHTML = tiles.map(([k, v, s]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="d muted">${s}</div></div>`).join('');

  const months = S.monthly.filter(m => m.change_pct != null);
  draw('monthChart', () => {
    const t = T();
    return base(t, {
      grid: { left: 48, right: 12, top: 16, bottom: 30 },
      tooltip: { ...base(t).tooltip, axisPointer: { type: 'shadow' },
        formatter: ps => { const m = months[ps[0].dataIndex]; return `${ps[0].name}<br>月末收盘 ${F(m.close)}<br>月涨跌 ${chg(ps[0].value)}`; } },
      xAxis: { type: 'category', data: months.map(m => m.month.slice(2)), axisLine: { lineStyle: { color: t.axis } }, axisTick: { show: false }, axisLabel: { color: t.muted, fontSize: 11 } },
      yAxis: valAxis(t, { scale: false, axisLabel: { color: t.muted, fontSize: 11, formatter: v => v + '%' } }),
      series: [{ type: 'bar', barMaxWidth: 22, data: months.map(m => ({ value: +m.change_pct.toFixed(2), itemStyle: { color: m.change_pct >= 0 ? t.up : t.down, borderRadius: m.change_pct >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4] } })),
        label: { show: true, position: 'top', color: t.ink2, fontSize: 10, formatter: p => (p.value > 0 ? '+' : '') + p.value.toFixed(1) } }],
    });
  });

  const tips = { dxy: '美元走强通常压制金价', tnx: '实际利率/机会成本', silver: '贵金属联动', oil: '通胀交易', vix: '避险情绪' };
  const names = { dxy: '美元指数', tnx: '10年美债收益率', silver: '白银', oil: 'WTI原油', vix: 'VIX' };
  $('#corrTable').innerHTML = '<thead><tr><th>因子</th><th class="r">相关系数</th><th>含义</th></tr></thead><tbody>'
    + Object.entries(a.corr).map(([k, v]) => `<tr><td>${names[k]}</td><td class="r"><b>${signed(v, 2)}</b></td><td class="muted">${tips[k]}</td></tr>`).join('') + '</tbody>';
}

/* ———————— 历史查询 ———————— */
const query = { kind: 'day', date: todayBJ(), listKind: 'month', last: null };
$('#qDate').value = query.date;
$('#qMonth').value = query.date.slice(0, 7);
seg('kindSeg', v => {
  query.kind = v;
  $('#qMonthWrap').classList.toggle('hidden', v !== 'month');
  $('#qDate').parentElement.classList.toggle('hidden', v === 'month');
  runQuery();
});
$('#qGo').addEventListener('click', () => runQuery());
$('#qPrev').addEventListener('click', () => query.last && gotoPeriod(query.kind, query.last.prev));
$('#qNext').addEventListener('click', () => query.last && gotoPeriod(query.kind, query.last.next));
seg('listSeg', v => { query.listKind = v; loadList(); });

function gotoPeriod(kind, date) {
  query.kind = kind;
  setSeg('kindSeg', kind);
  $('#qMonthWrap').classList.toggle('hidden', kind !== 'month');
  $('#qDate').parentElement.classList.toggle('hidden', kind === 'month');
  $('#qDate').value = date; $('#qMonth').value = date.slice(0, 7);
  runQuery();
  $('#qResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 时段汇总行按所选单位换算：价格用时段末汇率，上期收盘用时段开始时的汇率，涨跌幅/振幅随之重算
function rowCv(x) {
  const tEnd = Math.min(toMs(x.end) - 1, Date.now()), tStart = toMs(x.start) - 1;
  const o = { ...x };
  for (const k of ['open', 'close', 'high', 'low']) o[k] = cv(x[k], tEnd);
  o.prev_close = cv(x.prev_close, tStart);
  o.change = o.prev_close != null && o.close != null ? o.close - o.prev_close : null;
  o.change_pct = o.prev_close ? (o.close / o.prev_close - 1) * 100 : null;
  const ref = o.prev_close ?? o.open;
  o.amplitude_pct = ref ? (o.high - o.low) / ref * 100 : null;
  return o;
}

async function runQuery() {
  const date = query.kind === 'month' ? $('#qMonth').value : $('#qDate').value;
  if (!date) return toast('请选择日期');
  let r;
  try { r = await api(`/api/period?kind=${query.kind}&date=${date}`); } catch (e) { return toast(e.message); }
  query.last = r;
  const box = $('#qResult');
  if (r.empty) {
    box.innerHTML = `<div class="card"><div class="q-head"><h2>${esc(r.label)}</h2></div><div class="empty">${esc(r.message)}</div></div>`;
    return;
  }
  const s0 = r.summary, s = rowCv(s0);
  const d = DEC();
  const tFmt = query.kind === 'day' ? 'time' : 'md';
  const endMs = Math.min(toMs(r.end) - 1, Date.now());
  const tiles = [
    ['开盘', num(s.open, d)], ['收盘', num(s.close, d)],
    ['最高', num(s.high, d), bj(s.high_time, tFmt)], ['最低', num(s.low, d), bj(s.low_time, tFmt)],
    ['较上期', chg(s.change, d, ''), `上期收盘 ${num(s.prev_close, d)}`], ['振幅', num(s.amplitude_pct, 2) + '%'],
    ['换算', alt(s0.close, endMs) || '—', rateAt(endMs) ? `汇率 ${num(rateAt(endMs), 4)}` : ''],
    ['K线数', s.bars, query.kind === 'day' ? '小时' : ''],
  ];
  const mac = Object.entries(r.macros);
  const bd = r.breakdown;
  const subTable = (rows, kind, title) => `<div class="card"><div class="card-head"><h3>${title}（${UNIT_S()}）</h3><span class="muted small">点击行查看明细</span></div><div class="table-wrap"><table class="tbl clickable" data-kind="${kind}">
      <thead><tr><th>${kind === 'day' ? '日期' : '周'}</th><th class="r">开盘</th><th class="r">收盘</th><th class="r">最高</th><th class="r">最低</th><th class="r">涨跌</th><th class="r">涨跌幅</th><th class="r">振幅</th></tr></thead>
      <tbody>${rows.map(rowCv).map(x => `<tr data-key="${x.key}"><td>${esc(x.label)}</td><td class="r">${num(x.open, d)}</td><td class="r"><b>${num(x.close, d)}</b></td><td class="r">${num(x.high, d)}</td><td class="r">${num(x.low, d)}</td><td class="r">${chg(x.change, d, '')}</td><td class="r">${chg(x.change_pct)}</td><td class="r">${num(x.amplitude_pct, 2)}%</td></tr>`).join('')}</tbody></table></div></div>`;

  box.innerHTML = `
    <div class="card">
      <div class="q-head"><h2>${esc(r.label)}</h2><span class="big">${SYM()}${num(s.close, d)}</span>${chg(s.change_pct)}<span class="muted small">${UNIT_CN()}</span></div>
      <div class="tiles">${tiles.map(([k, v, x]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="d muted">${x || ''}</div></div>`).join('')}</div>
      <div class="chart" id="qChart" style="height:320px"></div>
    </div>
    ${bd.weeks ? subTable(bd.weeks, 'week', '各周') : ''}
    ${bd.days ? subTable(bd.days, 'day', '每日') : ''}
    ${bd.hours ? `<div class="card"><div class="card-head"><h3>逐小时（${UNIT_S()}）</h3></div><div class="table-wrap"><table class="tbl"><thead><tr><th>时间</th><th class="r">开盘</th><th class="r">最高</th><th class="r">最低</th><th class="r">收盘</th><th class="r">涨跌</th></tr></thead><tbody>${bd.hours.map(h => `<tr><td>${bj(h.time, 'time')}</td><td class="r">${P(h.open, h.time)}</td><td class="r">${P(h.high, h.time)}</td><td class="r">${P(h.low, h.time)}</td><td class="r"><b>${P(h.close, h.time)}</b></td><td class="r">${chg(cv(h.close - h.open, h.time), d, '')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
    <div class="grid2">
      <div class="card"><div class="card-head"><h3>同期国际因子</h3></div>
        ${mac.length ? `<table class="tbl"><thead><tr><th>因子</th><th class="r">期初</th><th class="r">期末</th><th class="r">变化</th></tr></thead><tbody>${mac.map(([k, m]) => `<tr><td>${m.name}</td><td class="r">${num(m.start, 3)}</td><td class="r">${num(m.end, 3)}</td><td class="r">${k === 'tnx' ? chg(m.change * 100, 0, 'bp') : chg(m.change_pct)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">无数据</div>'}
      </div>
      <div class="card"><div class="card-head"><h3>该时段做出的预测</h3></div>
        ${r.predictions.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>周期</th><th>时间</th><th class="r">预测</th><th class="r">实际</th><th>方向</th></tr></thead><tbody>${r.predictions.map(p => `<tr><td>${p.id}</td><td>${HCN[p.horizon]}</td><td>${bj(p.base_time, 'md')}</td><td class="r">${P(p.pred_price, p.base_time, p.usdcny)}（${p.direction}）</td><td class="r">${p.actual_price ? P(p.actual_price, p.base_time, p.usdcny) : '待验证'}</td><td>${p.status === 'evaluated' ? (p.direction_hit ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>') : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">无</div>'}
      </div>
    </div>`;
  $$('table.clickable[data-kind]', box).forEach(tb => tb.addEventListener('click', e => {
    const tr = e.target.closest('tr[data-key]'); if (tr) gotoPeriod(tb.dataset.kind, tr.dataset.key);
  }));
  delete charts.qChart; delete renderers.qChart;
  draw('qChart', () => {
    const t = T();
    const hourly = r.chart.length > 40 || query.kind === 'day';
    const kdata = r.chart.map(([ms, o, c, l, h]) => [ms, cv(o, ms), cv(c, ms), cv(l, ms), cv(h, ms)]);
    return base(t, {
      xAxis: timeAxis(t), yAxis: valAxis(t, { name: UNIT_S(), nameTextStyle: { color: t.muted, fontSize: 11 } }),
      grid: { left: 64, right: 20, top: 24, bottom: 30 }, legend: { show: false },
      tooltip: { ...base(t).tooltip, formatter: ps => {
        const [ms, o, c, l, h] = ps[0].value;
        return `${bj(new Date(ms).toISOString(), 'md')}<br>开 ${num(o, d)} 收 <b>${num(c, d)}</b><br>高 ${num(h, d)} 低 ${num(l, d)}`;
      } },
      series: [{ name: '黄金', type: 'candlestick', data: kdata, barMaxWidth: hourly ? 8 : 16,
        itemStyle: { color: t.up, color0: t.down, borderColor: t.up, borderColor0: t.down } }],
    });
  });
}

async function loadList() {
  const d = await api(`/api/periods?kind=${query.listKind}&months=12`);
  const items = d.items.map(rowCv);
  const dd = DEC();
  const lbl = { day: '日期', week: '周', month: '月份' }[query.listKind];
  const otherHead = isCny() ? '收盘 $/盎司' : '收盘 ¥/克';
  const other = (x, raw) => {
    const t = Math.min(toMs(x.end) - 1, Date.now());
    if (isCny()) return num(raw.close, 1);
    const r = rateAt(t); return r ? num(raw.close * r / OZ, 2) : '—';
  };
  $('#listTable').innerHTML = `<thead><tr><th>${lbl}</th><th class="r">开盘</th><th class="r">收盘</th><th class="r">最高</th><th class="r">最低</th><th class="r">涨跌</th><th class="r">涨跌幅</th><th class="r">振幅</th><th class="r">${otherHead}</th></tr></thead>
    <tbody>${items.map((x, i) => `<tr data-key="${x.key}"><td>${esc(x.label)}</td><td class="r">${num(x.open, dd)}</td><td class="r"><b>${num(x.close, dd)}</b></td><td class="r">${num(x.high, dd)}</td><td class="r">${num(x.low, dd)}</td><td class="r">${chg(x.change, dd, '')}</td><td class="r">${chg(x.change_pct)}</td><td class="r">${num(x.amplitude_pct, 2)}%</td><td class="r muted">${other(x, d.items[i])}</td></tr>`).join('')}</tbody>`;
  const chron = [...items].reverse().filter(x => x.change_pct != null);
  draw('listChart', () => {
    const t = T();
    return base(t, {
      grid: { left: 48, right: 12, top: 16, bottom: 30 },
      tooltip: { ...base(t).tooltip, axisPointer: { type: 'shadow' },
        formatter: ps => { const x = chron[ps[0].dataIndex]; return `${esc(x.label)}<br>收盘 ${SYM()}${num(x.close, DEC())}<br>涨跌 ${chg(x.change_pct)}<br><span class="muted">点击查看明细</span>`; } },
      xAxis: { type: 'category', data: chron.map(x => x.key.slice(query.listKind === 'month' ? 2 : 5, query.listKind === 'month' ? 7 : 10)), axisLine: { lineStyle: { color: t.axis } }, axisTick: { show: false }, axisLabel: { color: t.muted, fontSize: 11, hideOverlap: true } },
      yAxis: valAxis(t, { scale: false, axisLabel: { color: t.muted, fontSize: 11, formatter: v => v + '%' } }),
      series: [{ type: 'bar', barMaxWidth: 18, data: chron.map(x => ({ value: +x.change_pct.toFixed(2), itemStyle: { color: x.change_pct >= 0 ? t.up : t.down, borderRadius: x.change_pct >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3] } })) }],
    });
  }).off('click');
  charts.listChart.on('click', p => gotoPeriod(query.listKind, chron[p.dataIndex].key));
}
$('#listTable').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-key]'); if (tr) gotoPeriod(query.listKind, tr.dataset.key);
});

/* ———————— 预测与回测 ———————— */
const fc = { h: '5h', status: '' };
seg('fcHSeg', v => { fc.h = v; loadFcChart(); });
seg('fcStatusSeg', v => { fc.status = v; loadPredTable(); });

async function loadForecast() {
  const a = await api('/api/accuracy');
  const m = a.model;
  $('#fcModel').textContent = m ? `模型 v${m.version} · 训练于 ${bj(m.trained_at, 'md')} · 待验证 ${a.pending} 条` : '尚未训练';
  // 平均误差是多条记录的汇总（美元），人民币显示时按当前汇率折算
  const E = v => PS(v, Date.now());
  const rows = ['5h', '1d', '7d'].map(h => {
    const s = a.stats[h]; const v = m && m.horizons[h] && m.horizons[h].metrics;
    const rel = s ? (1 - s.mae_usd / s.mae_rw_usd) * 100 : null;
    return `<tr><td>${HCN[h]}</td><td class="r">${s ? s.n : 0}</td><td class="r">${s ? (s.dir_acc * 100).toFixed(0) + '%' : '—'}</td><td class="r">${s ? (s.coverage * 100).toFixed(0) + '%' : '—'}</td>
      <td class="r">${s ? E(s.mae_usd) : '—'}</td><td class="r">${s ? E(s.mae_rw_usd) : '—'}</td><td class="r">${rel == null ? '—' : `<span class="${rel > 0 ? 'ok' : 'bad'}">${signed(rel, 1)}%</span>`}</td>
      <td class="r muted">${v ? (v.insufficient ? '数据不足' : v.dir_acc == null ? '—' : (v.dir_acc * 100).toFixed(1) + '%') : '—'}</td><td class="r muted">${v ? E(v.mae_usd) + ' / ' + E(v.mae_rw_usd) : '—'}</td></tr>`;
  });
  $('#accTable').innerHTML = `<thead><tr><th>周期</th><th class="r">已验证</th><th class="r">方向准确率</th><th class="r">区间覆盖率(目标80%)</th><th class="r">平均误差（${UNIT_S()}）</th><th class="r">"不变"基准误差</th><th class="r">优于基准</th><th class="r">训练验证集方向</th><th class="r">验证集误差/基准</th></tr></thead><tbody>${rows.join('')}</tbody>`;
  $('#histList').innerHTML = a.history.length ? a.history.map(h => `<div class="hist"><div class="t">v${h.version} · ${h.kind === 'train' ? '训练' : '反馈调整'} · ${bj(h.created_at, 'md')}</div><div class="muted small">${esc(h.note)}</div><ul>${h.changes.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>`).join('') : '<div class="empty">暂无</div>';
  loadFcChart(); loadPredTable();
}

async function loadFcChart() {
  const d = await api(`/api/predictions?limit=2000&horizon=${fc.h}`);
  const ev = d.items.filter(p => p.status === 'evaluated').reverse();
  draw('fcChart', () => {
    const t = T();
    if (!ev.length) return { title: { text: '暂无已验证的预测，到期后会自动回测', left: 'center', top: 'middle', textStyle: { color: t.muted, fontSize: 13, fontWeight: 'normal' } } };
    const tt = p => new Date(p.target_time).getTime();
    const c = (p, v) => cv(v, p.created_at, p.usdcny);
    return base(t, {
      xAxis: timeAxis(t), yAxis: valAxis(t, { name: UNIT_S(), nameTextStyle: { color: t.muted, fontSize: 11 } }), dataZoom: [{ type: 'inside' }],
      legend: { ...base(t).legend, data: ['实际价格', '预测价格'] },
      tooltip: { ...base(t).tooltip, trigger: 'item', formatter: x => { const p = x.data.p, r = p.usdcny, t0 = p.created_at; return `#${p.id} ${p.horizon_cn}<br>到期 ${bj(p.target_time, 'md')}<br>预测 <b>${PS(p.pred_price, t0, r)}</b>（${p.direction}）<br>实际 <b>${PS(p.actual_price, t0, r)}</b> 误差 ${PD(p.error_usd, t0, r)}<br>方向 ${p.direction_hit ? '✓' : '✗'} · 区间 ${p.in_interval ? '✓' : '✗'}`; } },
      series: [
        lineS('实际价格', ev.map(p => ({ value: [tt(p), c(p, p.actual_price)], p })), t.s1, { showSymbol: true, symbolSize: 5 }),
        errBars('80%区间', ev.map(p => [tt(p), c(p, p.lower), c(p, p.upper)]), t.s2),
        { name: '预测价格', type: 'scatter', symbolSize: 8, data: ev.map(p => ({ value: [tt(p), c(p, p.pred_price)], p })), itemStyle: { color: t.s2, borderColor: t.surface, borderWidth: 2 } },
      ],
    });
  });
}

async function loadPredTable() {
  const d = await api('/api/predictions?limit=300' + (fc.status ? '&status=' + fc.status : ''));
  $('#predTable').innerHTML = `<thead><tr><th>#</th><th>周期</th><th>预测时间</th><th class="r">基准价（${UNIT_S()}）</th><th class="r">预测价</th><th>方向</th><th class="r">上涨概率</th><th class="r">80%区间</th><th>到期</th><th class="r">实际价</th><th class="r">误差</th><th>方向</th><th>区间</th><th>偏差原因</th></tr></thead><tbody>`
    + d.items.map(p => { const r = p.usdcny, t0 = p.created_at; return `<tr><td>${p.id}</td><td>${p.horizon_cn}</td><td>${bj(p.created_at, 'md')}</td><td class="r">${P(p.base_price, t0, r)}</td><td class="r"><b>${P(p.pred_price, t0, r)}</b></td>
      <td><span class="badge ${DIR_CLS[p.direction]}">${DIR_ICON[p.direction]} ${p.direction}</span></td><td class="r">${(p.prob_up * 100).toFixed(0)}%</td><td class="r">${P(p.lower, t0, r)} ~ ${P(p.upper, t0, r)}</td><td>${bj(p.target_time, 'md')}</td>
      <td class="r">${p.actual_price ? P(p.actual_price, t0, r) : '<span class="muted">待验证</span>'}</td><td class="r">${p.error_usd != null ? PD(p.error_usd, t0, r) : ''}</td>
      <td>${p.status === 'evaluated' ? (p.direction_hit ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>') : ''}</td><td>${p.status === 'evaluated' ? (p.in_interval ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>') : ''}</td>
      <td class="wrap">${(p.reasons || []).map(esc).join('；')}</td></tr>`; }).join('') + '</tbody>';
}

$$('[data-action]').forEach(b => b.addEventListener('click', async () => {
  const name = b.dataset.action;
  const label = b.textContent;
  b.disabled = true; b.textContent = '执行中…';
  try {
    const r = await api('/api/actions/' + name, { method: 'POST' });
    const msg = {
      predict: () => '已生成新预测：' + r.items.map(i => `${i.horizon_cn} ${PS(i.pred_price, i.created_at, i.usdcny)}（${i.direction}）`).join('，'),
      evaluate: () => r.evaluated ? `已回测 ${r.evaluated} 条预测` : '没有到期待验证的预测',
      train: () => `模型已重新训练，版本 v${r.version}`,
      refresh: () => r.error ? '刷新出错：' + r.error : `行情已刷新（${r.seconds.toFixed(1)} 秒）`,
    }[name]();
    toast(msg, 4000); $('#fcMsg').textContent = msg;
    loadLatest(); loadOverviewPred();
    if (loaded.forecast) loadForecast();
    if (loaded.system) loadSystem();
  } catch (e) { toast('失败：' + e.message, 4000); }
  b.disabled = false; b.textContent = label;
}));

/* ———————— 国际情景 ———————— */
let ctx = null;
const IMPACTS = [[-2, '强空', 'n'], [-1, '利空', 'n'], [0, '中性', 'z'], [1, '利多', 'p'], [2, '强多', 'p']];

async function loadContext() {
  ctx = await api('/api/context');
  renderContext();
}
function ctxScore() {
  const fs = ctx.factors; const tw = fs.reduce((a, f) => a + Math.abs(+f.weight || 0), 0);
  return tw ? Math.max(-1, Math.min(1, fs.reduce((a, f) => a + f.impact * (+f.weight || 0), 0) / (2 * tw))) : 0;
}
function renderScore() {
  const s = ctxScore();
  $('#scoreDot').style.left = ((s + 1) / 2 * 100) + '%';
  $('#ctxMeta').innerHTML = `更新于 ${esc(ctx.updated_at || '—')} · 情景分 <b class="${cls(s)}">${signed(s, 2)}</b>`;
}
function renderContext() {
  $('#ctxSummary').textContent = ctx.summary || '';
  $('#ctxFactors').innerHTML = ctx.factors.map((f, i) => `<div class="factor" data-i="${i}">
      <input type="text" data-f="name" value="${esc(f.name)}" placeholder="因子名称">
      <div class="impact">${IMPACTS.map(([v, l, c]) => `<button data-v="${v}" class="${c} ${f.impact === v ? 'sel' : ''}">${l}</button>`).join('')}</div>
      <label class="field">权重 <input type="number" data-f="weight" value="${f.weight}" min="0" max="5" step="0.1" style="width:58px"></label>
      <textarea data-f="note" rows="1" placeholder="依据 / 说明">${esc(f.note || '')}</textarea>
      <button class="del" title="删除">×</button></div>`).join('');
  $('#ctxEvents').innerHTML = (ctx.upcoming_events || []).map(e => `<li>${esc(e)}</li>`).join('') || '<li class="muted">无</li>';
  $('#ctxSources').innerHTML = (ctx.sources || []).map(u => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a></li>`).join('') || '<li class="muted">无</li>';
  renderScore();
}
$('#ctxFactors').addEventListener('click', e => {
  const row = e.target.closest('.factor'); if (!row) return;
  const f = ctx.factors[+row.dataset.i];
  if (e.target.matches('.impact button')) { f.impact = +e.target.dataset.v; renderContext(); }
  else if (e.target.matches('.del')) { ctx.factors.splice(+row.dataset.i, 1); renderContext(); }
});
$('#ctxFactors').addEventListener('input', e => {
  const row = e.target.closest('.factor'); if (!row || !e.target.dataset.f) return;
  const f = ctx.factors[+row.dataset.i];
  f[e.target.dataset.f] = e.target.dataset.f === 'weight' ? +e.target.value : e.target.value;
  renderScore();
});
$('#ctxAdd').addEventListener('click', () => { ctx.factors.push({ name: '', impact: 0, weight: 1, note: '' }); renderContext(); });
$('#ctxSave').addEventListener('click', async () => {
  try {
    ctx = await api('/api/context', { method: 'PUT', body: JSON.stringify({ factors: ctx.factors.filter(f => f.name.trim()) }) });
    renderContext(); $('#ctxMsg').textContent = '已保存，下一次预测将使用新的情景分'; toast('情景已保存');
  } catch (e) { toast('保存失败：' + e.message, 4000); }
});

/* ———————— 系统 ———————— */
async function loadSystem() {
  const s = await api('/api/status');
  const st = s.state;
  const lr = s.last_refresh;
  const rows = [
    ['服务启动', bj(st.started_at)], ['最近一次后台任务', bj(st.last_tick)], ['任务状态', st.running ? '运行中' : '空闲'],
    ['行情刷新间隔', s.refresh_minutes + ' 分钟'], ['自动预测间隔', s.predict_interval_hours > 0 ? s.predict_interval_hours + ' 小时（仅交易时段）' : '已关闭'],
    ['最近刷新行情', lr ? bj(lr.at) : '—'], ['最近预测', bj(s.last_predict)],
    ['写操作口令', s.auth_required ? '需要' : '不需要'], ['最近错误', st.last_error ? `<span class="bad">${esc(st.last_error)}</span>` : '无'],
  ];
  $('#sysTable').innerHTML = '<tbody>' + rows.map(([k, v]) => `<tr><td class="muted">${k}</td><td>${v}</td></tr>`).join('') + '</tbody>';
  $('#sysEvents').innerHTML = st.last_events.map(e => `<li><span class="muted">${bj(e.at, 'md')}</span> ${esc(e.msg)}</li>`).join('') || '<li class="muted">暂无</li>';
  const names = { gold: '黄金', dxy: '美元指数', tnx: '10年美债', silver: '白银', oil: '原油', vix: 'VIX', usdcny: '美元/人民币' };
  $('#dataTable').innerHTML = '<thead><tr><th>品种</th><th>周期</th><th class="r">条数</th><th>最早</th><th>最新</th><th>最近刷新 / 来源</th></tr></thead><tbody>'
    + Object.entries(s.prices).map(([k, v]) => {
      const [sym, iv] = k.split('_'); const rs = lr && lr.status[k];
      return `<tr><td>${names[sym] || sym}</td><td>${iv === '1h' ? '小时线' : '日线'}</td><td class="r">${num(v.rows, 0)}</td><td>${bj(new Date(v.first * 1000).toISOString(), 'date')}</td><td>${bj(new Date(v.last * 1000).toISOString())}</td><td>${rs ? (rs.skipped ? `<span class="muted" title="${esc(rs.note)}">日线补齐</span>` : rs.ok ? `<span class="ok">✓</span> <span class="muted">${esc(rs.source || '')}</span>` : `<span class="bad" title="${esc(rs.error)}">✗</span> <span class="muted small">${esc((rs.error || '').slice(0, 60))}</span>`) : '—'}</td></tr>`;
    }).join('') + '</tbody>';
}
$('#tokenInput').value = store.get('adminToken', '');
$('#tokenSave').addEventListener('click', () => { store.set('adminToken', $('#tokenInput').value.trim()); toast('口令已保存到本浏览器'); });

/* ———————— 启动 ———————— */
const initial = (location.hash || '#' + store.get('tab', 'overview')).slice(1);
loadFx().then(() => {   // 先拿到汇率历史，人民币换算才准确
  showTab(loaders[initial] ? initial : 'overview');
  if (initial !== 'overview') loadLatest();
});
setInterval(loadFx, 30 * 60_000);
setInterval(loadLatest, 30_000);
setInterval(() => { if (loaded.system && $('#tab-system').classList.contains('active')) loadSystem(); }, 30_000);
