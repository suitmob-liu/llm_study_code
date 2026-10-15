"""回测已到期的预测：对比实际价格 → 归因 → 调整模型参数 → 记录历史。"""
import json
import math
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from . import store
from .config import COMPONENT_CN, COMPONENTS, HORIZON_CN, HORIZONS, REPORT_DIR, save_config
from .data import asof
from .model import _grid_weights


def _pct(a, b):
    return None if a is None or b is None or b == 0 else (a / b - 1) * 100


def attribute(p: dict, actual_ret: float, hourly: dict, daily: dict) -> list[str]:
    """为单条预测生成偏差原因。"""
    t0, t1 = pd.Timestamp(p["base_time"]), pd.Timestamp(p["target_time"])
    comps = json.loads(p["components"])
    sigma = p["sigma"] or 1e-9
    err = actual_ret - p["pred_ret"]
    reasons = []

    hit = bool(p["direction_hit"])
    inside = bool(p["in_interval"])
    if hit and inside:
        reasons.append("方向与区间均符合预期")
    z = err / sigma
    if abs(z) > 2:
        reasons.append(f"实际偏离预测 {z:+.1f}σ，远超模型正常误差，疑似突发事件/重要数据发布冲击")
    elif not inside:
        reasons.append(f"实际价格落在预测区间外（偏离 {z:+.1f}σ），区间可能偏窄")

    # 宏观驱动在预测窗口内的变化
    up = actual_ret > 0
    dxy = _pct(asof(hourly.get("dxy"), t1), asof(hourly.get("dxy"), t0))
    if dxy is not None and abs(dxy) >= 0.25:
        effect = "压制" if dxy > 0 else "支撑"
        consistent = (dxy > 0) != up
        reasons.append(f"美元指数{'上涨' if dxy > 0 else '下跌'} {dxy:+.2f}%，{effect}金价"
                       + ("（与金价走势一致）" if consistent else "（但金价未按此反应，其他因素主导）"))
    tnx0, tnx1 = asof(hourly.get("tnx"), t0), asof(hourly.get("tnx"), t1)
    if tnx0 is not None and tnx1 is not None and abs(tnx1 - tnx0) >= 0.05:
        bp = (tnx1 - tnx0) * 100
        reasons.append(f"10年美债收益率{'上行' if bp > 0 else '下行'} {bp:+.0f}bp，"
                       + ("持有黄金机会成本上升" if bp > 0 else "持有黄金机会成本下降"))
    vix = _pct(asof(hourly.get("vix"), t1), asof(hourly.get("vix"), t0))
    if vix is not None and abs(vix) >= 10:
        reasons.append(f"VIX 变动 {vix:+.0f}%，市场避险情绪{'升温' if vix > 0 else '降温'}")
    oil = _pct(asof(hourly.get("oil"), t1), asof(hourly.get("oil"), t0))
    if oil is not None and abs(oil) >= 3:
        reasons.append(f"原油变动 {oil:+.1f}%，影响通胀预期")
    r0, r1 = asof(hourly.get("real10"), t0), asof(hourly.get("real10"), t1)
    if r0 is not None and r1 is not None and abs(r1 - r0) >= 0.05:
        bp = (r1 - r0) * 100
        reasons.append(f"10年实际利率{'上行' if bp > 0 else '下行'} {bp:+.0f}bp（实际利率与金价通常反向）"
                       + ("，与金价走势一致" if (bp > 0) != up else "，但金价未按此反应"))
    b0, b1 = asof(hourly.get("bei10"), t0), asof(hourly.get("bei10"), t1)
    if b0 is not None and b1 is not None and abs(b1 - b0) >= 0.05:
        reasons.append(f"通胀预期变动 {(b1 - b0) * 100:+.0f}bp")
    spx = _pct(asof(hourly.get("spx"), t1), asof(hourly.get("spx"), t0))
    if spx is not None and abs(spx) >= 2:
        reasons.append(f"标普500 {'大涨' if spx > 0 else '大跌'} {spx:+.1f}%，风险偏好{'上升' if spx > 0 else '下降'}")

    # 分量层面
    if not hit and p["direction"] == "震荡":
        reasons.append(f"预测震荡，但实际出现{'上涨' if up else '下跌'} {actual_ret * 100:+.2f}%"
                       f"（{actual_ret / sigma:+.1f}σ），模型对该波段行情信号不足")
    elif not hit:
        right =[COMPONENT_CN[c] for c in ("ridge", "momentum", "meanrev")
                 if abs(comps.get(c, 0)) > 1e-12 and (comps[c] > 0) == up]
        wrong = [COMPONENT_CN[c] for c in ("ridge", "momentum", "meanrev")
                 if abs(comps.get(c, 0)) > 1e-12 and (comps[c] > 0) != up]
        if right:
            reasons.append(f"方向判断错误：{'、'.join(right)}分量方向正确，{'、'.join(wrong) or '无'}方向错误 → 将调整权重")
        else:
            reasons.append("方向判断错误：所有分量都没有捕捉到该走势，属于模型外因素")
    ctx = comps.get("context", 0)
    if abs(ctx) > 1e-12 and (ctx > 0) != up and abs(actual_ret) > 0.5 * sigma:
        reasons.append("国际基本面情景分方向与实际相反，建议复核 market_context.json 中的因子打分")

    # 休市
    gold = hourly["gold"]
    bars = len(gold.loc[t0:t1])
    expected = max(1, p["hours"] * 0.9)
    if bars < expected * 0.6:
        reasons.append(f"预测窗口内仅 {bars} 根小时K线，含休市时段，实际波动被压缩")
    return reasons


def evaluate_due(con, hourly: dict, daily: dict, now: datetime | None = None) -> list[dict]:
    now = now or datetime.now(timezone.utc)
    gold = hourly["gold"]
    last_bar = gold.index[-1]
    done = []
    for p in store.due_predictions(con, now.isoformat(timespec="seconds")):
        t1 = pd.Timestamp(p["target_time"])
        # 目标时刻之后还没有新 K 线且市场可能尚未更新 → 等一等（休市时允许直接结算）
        if last_bar < t1 and (now - t1.to_pydatetime()).total_seconds() < 3600:
            continue
        actual = asof(gold, t1)
        if actual is None:
            continue
        actual_ret = math.log(actual / p["base_price"])
        sigma = p["sigma"] or 1e-9
        if p["direction"] == "震荡":
            hit = abs(actual_ret) <= 0.5 * sigma
        else:
            hit = (actual_ret > 0) == (p["direction"] in ("上涨", "偏涨"))
        fields = {
            "status": "evaluated", "actual_price": actual, "actual_ret": actual_ret,
            "error_usd": actual - p["pred_price"], "error_pct": (actual / p["pred_price"] - 1) * 100,
            "direction_hit": int(hit), "in_interval": int(p["lower"] <= actual <= p["upper"]),
            "evaluated_at": now.isoformat(timespec="seconds"),
        }
        merged = {**dict(p), **fields}
        fields["reasons"] = json.dumps(attribute(merged, actual_ret, hourly, daily), ensure_ascii=False)
        store.update_prediction(con, p["id"], fields)
        done.append({**merged, "reasons": fields["reasons"]})
    return done


def adjust(con, cfg: dict, model: dict, touched: set[str]) -> list[str]:
    """基于最近 window 条已验证预测调整参数。返回变更说明列表。"""
    a = cfg["adjust"]
    changes = []
    for h in HORIZONS:
        if h not in touched:
            continue
        rows = store.recent_evaluated(con, h, a["window"])
        n = len(rows)
        if n < a["min_samples"]:
            changes.append(f"[{h}] 已验证样本 {n} 条 < {a['min_samples']}，暂不调整")
            continue
        p = cfg["params"][h]
        hm = model["horizons"][h]
        # 预测窗口相互重叠时样本高度相关，按时间跨度折算有效样本数
        span_h = (pd.Timestamp(rows[0]["target_time"]) - pd.Timestamp(rows[-1]["base_time"])).total_seconds() / 3600
        n_eff = max(1.0, min(n, span_h / HORIZONS[h]))
        lr = a["lr"] * min(1.0, n_eff / a["window"])
        y = np.array([r["actual_ret"] for r in rows])
        comps = [json.loads(r["components"]) for r in rows]
        pred = np.array([r["pred_ret"] for r in rows])
        err = y - pred
        tag = f"[{h}]"

        # 1) 分量权重：向最近样本的最优组合靠拢
        cp = {c: np.array([cc.get(c, 0.0) for cc in comps]) for c in COMPONENTS}
        resid_target = y - np.array([cc.get("context", 0) + cc.get("offset", 0) for cc in comps])
        target_w = _grid_weights(cp, resid_target)
        new_w = {c: round((1 - lr) * p["weights"][c] + lr * target_w[c], 4) for c in COMPONENTS}
        s = sum(new_w.values())
        new_w = {c: round(v / s, 4) for c, v in new_w.items()}
        if any(abs(new_w[c] - p["weights"][c]) > 0.005 for c in COMPONENTS):
            desc = ", ".join(f"{COMPONENT_CN[c]} {p['weights'][c]:.2f}→{new_w[c]:.2f}" for c in COMPONENTS)
            changes.append(f"{tag} 分量权重调整（最近 {n} 条最优组合 "
                           + ", ".join(f"{c}={v:.1f}" for c, v in target_w.items()) + f"）：{desc}")
            p["weights"] = new_w

        # 2) 系统性偏差
        me = float(err.mean())
        if abs(me) > hm["resid_std"] / math.sqrt(n_eff):  # 约 1 个标准误才算显著
            old = p["bias_offset"]
            p["bias_offset"] = float(np.clip(old + lr * me, -0.5 * hm["resid_std"], 0.5 * hm["resid_std"]))
            changes.append(f"{tag} 平均误差 {me * 100:+.3f}%（实际{'高于' if me > 0 else '低于'}预测，有效样本 {n_eff:.1f}），"
                           f"偏差修正 {old * 100:+.3f}% → {p['bias_offset'] * 100:+.3f}%")

        # 3) 区间覆盖率校准
        cov = float(np.mean([r["in_interval"] for r in rows]))
        lvl = cfg["interval_level"]
        old = p["interval_scale"]
        if cov < lvl - 0.1:
            p["interval_scale"] = round(min(3.0, old * 1.1), 4)
        elif cov > lvl + 0.1:
            p["interval_scale"] = round(max(0.5, old * 0.95), 4)
        if p["interval_scale"] != old:
            changes.append(f"{tag} 区间覆盖率 {cov:.0%}（目标 {lvl:.0%}），区间缩放 {old:.3f} → {p['interval_scale']:.3f}")

        # 4) 基本面情景分的影响力度
        ctx_rows = [(cc.get("context", 0), yy) for cc, yy in zip(comps, y) if abs(cc.get("context", 0)) > 1e-12]
        if len(ctx_rows) >= a["min_samples"]:
            hit = float(np.mean([(c > 0) == (yy > 0) for c, yy in ctx_rows]))
            old = p["bias_coef"]
            if hit < 0.4:
                p["bias_coef"] = round(max(0.0, old * 0.8), 4)
            elif hit > 0.6:
                p["bias_coef"] = round(min(0.6, old * 1.1 + 0.01), 4)
            if p["bias_coef"] != old:
                changes.append(f"{tag} 情景分方向命中率 {hit:.0%}，情景影响系数 {old:.3f} → {p['bias_coef']:.3f}")
    return changes


def summarize(rows) -> dict:
    out = {}
    for h in HORIZONS:
        rs = [r for r in rows if r["horizon"] == h and r["status"] == "evaluated"]
        if not rs:
            continue
        out[h] = {
            "n": len(rs),
            "dir_acc": float(np.mean([r["direction_hit"] for r in rs])),
            "coverage": float(np.mean([r["in_interval"] for r in rs])),
            "mae_usd": float(np.mean([abs(r["error_usd"]) for r in rs])),
            "mae_rw_usd": float(np.mean([abs(r["actual_price"] - r["base_price"]) for r in rs])),
        }
    return out


def write_report(done: list[dict], changes: list[str], stats: dict, version: int) -> str:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = REPORT_DIR / f"evaluation_{ts}.md"
    L = [f"# 预测回测报告 {datetime.now():%Y-%m-%d %H:%M}", "", f"模型版本：v{version}", "", "## 本次验证的预测", ""]
    L += ["| ID | 周期 | 基准时间(北京) | 基准价 | 预测价 | 实际价 | 误差 | 方向 | 区间 |",
          "|---|---|---|---|---|---|---|---|---|"]
    for d in done:
        bt = pd.Timestamp(d["base_time"]).tz_convert("Asia/Shanghai").strftime("%m-%d %H:%M")
        L.append(f"| {d['id']} | {HORIZON_CN[d['horizon']]} | {bt} | {d['base_price']:.1f} | {d['pred_price']:.1f}"
                 f"（{d['direction']}） | {d['actual_price']:.1f} | {d['error_usd']:+.1f} | "
                 f"{'✓' if d['direction_hit'] else '✗'} | {'✓' if d['in_interval'] else '✗'} |")
    L += ["", "## 偏差原因", ""]
    for d in done:
        L.append(f"- **#{d['id']} {HORIZON_CN[d['horizon']]}**：" + "；".join(json.loads(d["reasons"])))
    L += ["", "## 模型调整", ""] + ([f"- {c}" for c in changes] or ["- 无"])
    L += ["", "## 累计表现", "", "| 周期 | 样本 | 方向准确率 | 区间覆盖率 | MAE | 不变基准MAE |", "|---|---|---|---|---|---|"]
    for h, s in stats.items():
        L.append(f"| {HORIZON_CN[h]} | {s['n']} | {s['dir_acc']:.0%} | {s['coverage']:.0%} | "
                 f"${s['mae_usd']:.1f} | ${s['mae_rw_usd']:.1f} |")
    path.write_text("\n".join(L) + "\n", encoding="utf-8")
    return str(path)


def run_feedback(con, cfg: dict, model: dict, hourly: dict, daily: dict, verbose=True):
    done = evaluate_due(con, hourly, daily)
    if not done:
        if verbose:
            print("没有到期待验证的预测。")
        return {"done": [], "changes": [], "report": None}
    changes = adjust(con, cfg, model, {d["horizon"] for d in done})
    real = [c for c in changes if "暂不调整" not in c]
    stats = summarize(store.all_predictions(con, 10000))
    if real:
        cfg["version"] += 1
        save_config(cfg)
        store.add_history(con, cfg["version"], "feedback", real, stats,
                          note=f"基于 {len(done)} 条新验证的预测自动调整")
    report = write_report(done, changes, stats, cfg["version"])
    if verbose:
        print(f"已验证 {len(done)} 条预测：")
        for d in done:
            print(f"  #{d['id']} {HORIZON_CN[d['horizon']]}：预测 {d['pred_price']:.1f}（{d['direction']}）"
                  f" → 实际 {d['actual_price']:.1f}，误差 {d['error_usd']:+.1f}，"
                  f"方向{'✓' if d['direction_hit'] else '✗'} 区间{'✓' if d['in_interval'] else '✗'}")
            for r in json.loads(d["reasons"]):
                print(f"      - {r}")
        print("模型调整：")
        for c in changes or ["无"]:
            print(f"  - {c}")
        print(f"报告已保存：{report}")
    return {"done": done, "changes": changes, "report": report}
