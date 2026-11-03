'use strict';
const $ = s => document.querySelector(s);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = value => Number(value).toFixed(2);
let generation = 0;
function message(text, error = false) {
  const node = $('#message'); node.textContent = text; node.className = error ? 'error' : ''; node.hidden = false;
}
async function api(path, body) {
  const response = await fetch(path, body ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} : {});
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : (result.detail || []).map(e => `${e.loc.at(-1)}: ${e.msg}`).join('；') || '请求失败');
  return result;
}
function formData(form) {
  return Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, form.elements[key].type === 'number' || form.elements[key].type === 'range' ? Number(value) : value.trim()]));
}
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.panel').forEach(panel => { panel.hidden = panel.id !== button.dataset.tab; });
  document.querySelectorAll('[data-tab]').forEach(tab => tab.classList.toggle('active', tab === button));
}));
$('#scenario').addEventListener('input', event => { $('#scenario-output').textContent = `${event.target.value}%`; });
function invalidate() {
  generation++;
  $('#price-cards').innerHTML = '<div class="empty">数据或参数已变更，请重新计算预测。</div>';
  $('#result').innerHTML = '<h3>等待新的推演</h3><p>点击计算，查看当前参数下的预测结果。</p>';
}
$('#forecast-form').addEventListener('input', invalidate);
async function refresh() {
  const data = await api('/api/data');
  $('#retail-rows').innerHTML = data.retail.map((row, i) => {
    const previous = data.retail[i + 1];
    const delta = previous ? row.p92 - previous.p92 : null;
    return `<tr><td>${escape(row.effective_date)}</td>${['p92','p95','p98','p0'].map(k=>`<td>${num(row[k])}</td>`).join('')}<td class="${delta > 0 ? 'up':'down'}">${delta === null ? '—' : `${delta > 0 ? '+':''}${num(delta)}`}</td><td>${escape(row.source)}</td></tr>`;
  }).join('') || '<tr><td colspan="7">暂无记录，请录入安徽省已生效油价与公告来源。</td></tr>';
  $('#quote-rows').innerHTML = data.quotes.map(row => `<tr><td>${escape(row.trade_date)}</td><td>${num(row.brent)}</td><td>${num(row.wti)}</td><td>${Number(row.usd_cny).toFixed(4)}</td><td>${escape(row.source)}</td></tr>`).join('') || '<tr><td colspan="5">暂无行情。基期需要完整记录，本期至少一条。</td></tr>';
  const points = data.quotes.slice(0, 30).reverse();
  if (points.length > 1) {
    const values = points.flatMap(q=>[q.brent,q.wti]), low = Math.min(...values), range = Math.max(...values) - low || 1;
    const line = key => points.map((q,i)=>`${20+i*860/(points.length-1)},${125-(q[key]-low)*100/range}`).join(' ');
    $('#trend').innerHTML = `<p>最近 ${points.length} 个交易日收盘价 · 深绿 Brent / 棕色 WTI · 美元/桶 · ${escape(points[0].trade_date)} → ${escape(points.at(-1).trade_date)} · 纵轴 ${num(low)}–${num(low + range)}</p><svg viewBox="0 0 900 150" role="img" aria-label="最近交易日的Brent和WTI价格趋势"><polyline points="${line('brent')}" fill="none" stroke="#123c34" stroke-width="3"/><polyline points="${line('wti')}" fill="none" stroke="#a66536" stroke-width="2"/></svg>`;
  } else $('#trend').innerHTML = '';
}
for (const [selector, endpoint] of [['#retail-form','retail'], ['#quote-form','quotes']]) {
  $(selector).addEventListener('submit', async event => {
    event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
    try { await api(`/api/${endpoint}`, formData(event.target)); invalidate(); await refresh(); message('记录已保存。同日期数据已更新。'); }
    catch(error) { message(error.message, true); } finally { button.disabled = false; }
  });
}
$('#forecast-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true; const token = ++generation;
  try {
    const result = await api('/api/forecast', formData(event.target));
    if (token !== generation) return;
    $('#price-cards').innerHTML = result.prices.map(price => `<article class="card"><span>${escape(price.grade)}# ${price.grade === '0' ? '柴油' : '汽油'}</span><strong>${price.predicted === null ? '—' : num(price.predicted)}<small>元/升</small></strong><p>原价 ${num(price.current)}</p><p class="${price.delta > 0 ? 'up' : 'down'}">${price.delta === null ? '暂不估算' : `预计 ${price.delta > 0 ? '+':''}${num(price.delta)} 元/升`}</p></article>`).join('');
    $('#result').innerHTML = `<h3>${escape(result.status)}</h3><p>目标调价日：${escape(result.adjustment_date)}</p><dl><dt>代理篮子均价变化</dt><dd>${num(result.change_pct)}%</dd><dt>本期观测 / 剩余情景日</dt><dd>${result.observed_days} / ${result.remaining_days}</dd><dt>基期 / 预计本期（元/桶）</dt><dd>${num(result.baseline_cny_barrel)} / ${num(result.projected_cny_barrel)}</dd><dt>阈值判断前调幅</dt><dd>${num(result.raw_yuan_ton)} 元/吨</dd><dt>预计执行调幅</dt><dd>${result.adjustment_yuan_ton === null ? '—' : num(result.adjustment_yuan_ton)} 元/吨</dd><dt>不足50元参考结转</dt><dd>${num(result.carry_next)} 元/吨</dd></dl><p>${escape(result.note)}</p>`;
    message('推演完成。可调整剩余交易日涨跌幅，比较不同情景。');
  } catch(error) { if (token === generation) { invalidate(); message(error.message, true); } } finally { button.disabled = false; }
});
$('#example').addEventListener('click', () => {
  const form = $('#forecast-form');
  const day = daysAgo => { const date = new Date(); date.setDate(date.getDate()-daysAgo); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; };
  for (const [key,value] of Object.entries({baseline_start:day(28),baseline_end:day(15),cycle_start:day(14),observation_end:day(0),adjustment_date:day(-2)})) form.elements[key].value = value;
  invalidate(); message('已填入示例周期，日期不代表官方窗口。请按公告修改并录入对应交易日行情。');
});
refresh().catch(error => message(error.message, true));
