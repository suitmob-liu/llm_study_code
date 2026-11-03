"""Transparent scenario model; not the official Chinese crude basket formula."""
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from pydantic import BaseModel, ConfigDict, Field, model_validator

GRADES = {'92': 0.00075, '95': 0.00079, '98': 0.00083, '0': 0.00086}


class InputModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')


class RetailRecord(InputModel):
    effective_date: date
    p92: float = Field(gt=0, le=30, allow_inf_nan=False)
    p95: float = Field(gt=0, le=30, allow_inf_nan=False)
    p98: float = Field(gt=0, le=30, allow_inf_nan=False)
    p0: float = Field(gt=0, le=30, allow_inf_nan=False)
    source: str = Field(min_length=1, max_length=500)

    @model_validator(mode='after')
    def historical_only(self):
        if self.effective_date > date.today():
            raise ValueError('仅记录已经生效的油价，不能录入未来日期')
        return self


class Quote(InputModel):
    trade_date: date
    brent: float = Field(gt=0, le=500, allow_inf_nan=False)
    wti: float = Field(gt=0, le=500, allow_inf_nan=False)
    usd_cny: float = Field(gt=0, le=20, allow_inf_nan=False)
    source: str = Field(min_length=1, max_length=500)

    @model_validator(mode='after')
    def historical_only(self):
        if self.trade_date > date.today():
            raise ValueError('不能将未来行情保存为已观测数据')
        return self


class ForecastInput(InputModel):
    baseline_start: date
    baseline_end: date
    cycle_start: date
    observation_end: date
    adjustment_date: date
    expected_days: int = Field(default=10, ge=1, le=10)
    scenario_pct: float = Field(default=0, ge=-30, le=30, allow_inf_nan=False)
    brent_weight: float = Field(default=0.5, ge=0, le=1, allow_inf_nan=False)
    sensitivity: float = Field(default=0.6, gt=0, le=1.5, allow_inf_nan=False)
    carry_yuan_ton: float = Field(default=0, ge=-1000, le=1000, allow_inf_nan=False)

    @model_validator(mode='after')
    def ordered(self):
        if not self.baseline_start <= self.baseline_end < self.cycle_start <= self.observation_end < self.adjustment_date:
            raise ValueError('日期需满足：基期开始 ≤ 基期结束 < 本期开始 ≤ 观察截止 < 调价日')
        if self.observation_end > date.today():
            raise ValueError('观察截止不能晚于今天')
        return self


def money(value):
    return float(Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


def forecast(params, retail, quotes):
    baseline = [q for q in quotes if params.baseline_start <= q.trade_date <= params.baseline_end]
    current = [q for q in quotes if params.cycle_start <= q.trade_date <= params.observation_end]
    if len(baseline) != params.expected_days:
        raise ValueError(f'基期需有 {params.expected_days} 条行情，当前 {len(baseline)} 条')
    if not 1 <= len(current) <= params.expected_days:
        raise ValueError(f'本期需有 1–{params.expected_days} 条行情，当前 {len(current)} 条')
    if retail.effective_date > params.cycle_start:
        raise ValueError('当前油价的生效日期不能晚于本期开始日期')

    def basket(q):
        return q.brent * params.brent_weight + q.wti * (1 - params.brent_weight)

    base = sum(max(40, basket(q)) * q.usd_cny for q in baseline) / len(baseline)
    latest = max(current, key=lambda q: q.trade_date)
    remaining = params.expected_days - len(current)
    projected_usd = basket(latest) * (1 + params.scenario_pct / 100)
    total = sum(max(40, basket(q)) * q.usd_cny for q in current)
    mean = (total + remaining * max(40, projected_usd) * latest.usd_cny) / params.expected_days
    change = mean / base - 1
    # USD 40 floor is approximated on the proxy basket; USD 130 is not extrapolated.
    usd_mean = (sum(basket(q) for q in current) + remaining * projected_usd) / params.expected_days
    blocked = usd_mean > 130 or sum(basket(q) for q in baseline) / len(baseline) > 130
    floor = usd_mean < 40
    raw = money((mean - base) * 7.33 * params.sensitivity + params.carry_yuan_ton)
    adjustment = 0 if abs(raw) < 50 else raw
    if blocked:
        adjustment = None
    prices = []
    for grade, coefficient in GRADES.items():
        old = getattr(retail, 'p' + grade)
        delta = money(adjustment * coefficient) if adjustment is not None else None
        prices.append({'grade': grade, 'current': old, 'delta': delta,
                       'predicted': max(0, money(old + delta)) if delta is not None else None})
    return {'adjustment_date': params.adjustment_date.isoformat(), 'baseline_days': len(baseline),
            'observed_days': len(current), 'remaining_days': remaining,
            'change_pct': money(change * 100), 'baseline_cny_barrel': money(base),
            'projected_cny_barrel': money(mean), 'raw_yuan_ton': raw,
            'adjustment_yuan_ton': adjustment, 'carry_next': raw if abs(raw) < 50 else 0,
            'status': '超出模型适用范围' if blocked else '已按40美元地板价近似计算' if floor
            else '不足50元/吨，暂不调整' if abs(raw) < 50 else '预计上调' if raw > 0 else '预计下调',
            'prices': prices,
            'note': 'Brent/WTI 代理篮子情景估算，非官方三地原油篮子或官方调价结果。调价日期请以发改委公告为准。'}
