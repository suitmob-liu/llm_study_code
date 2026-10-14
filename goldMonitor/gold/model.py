"""预测模型：4 个分量加权集成，每个预测周期独立训练。

分量
- ridge      多因子岭回归（黄金技术面 + 美元/美债/白银/原油/VIX）
- momentum   动量：近期同周期涨跌延续
- meanrev    均值回归：偏离均线后回归
- randomwalk 随机游走：预测不变（金融时间序列最强基准）
外加
- 基本面情景分（market_context.json）× bias_coef × σ
- bias_offset：反馈环节学到的系统性偏差修正
区间：验证集样本外残差分位数 × 当前波动率/历史波动率 × interval_scale
"""
import itertools
import json
import math
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from .config import COMPONENTS, HORIZONS, MODEL_PATH
from .features import feature_columns, make_target

MOM_FEAT = {"5h": "r5", "1d": "r24", "7d": "r120"}
MR_FEAT = {"5h": "ma_dev24", "1d": "ma_dev120", "7d": "ma_dev480"}


def _ridge(X, y, lam):
    """无截距岭回归（不让历史牛/熊市的平均漂移直接进入预测）。"""
    A = X.T @ X + lam * np.eye(X.shape[1])
    return np.linalg.solve(A, X.T @ y)


def _ols1(x, y):
    d = float(x @ x)
    return float(x @ y) / d if d > 0 else 0.0


def _grid_weights(preds: dict, y: np.ndarray, step: float = 0.1) -> dict:
    """在单纯形网格上搜索使 MSE 最小的非负权重。"""
    n = int(round(1 / step))
    best, best_w = math.inf, None
    for combo in itertools.product(range(n + 1), repeat=len(COMPONENTS) - 1):
        if sum(combo) > n:
            continue
        w = [k / n for k in combo] + [(n - sum(combo)) / n]
        p = sum(wi * preds[c] for wi, c in zip(w, COMPONENTS))
        mse = float(np.mean((y - p) ** 2))
        if mse < best - 1e-15:
            best, best_w = mse, w
    return dict(zip(COMPONENTS, best_w))


def _components(hm: dict, X: pd.DataFrame) -> dict:
    Z = ((X[hm["features"]] - hm["mean"]) / hm["std"]).fillna(0).to_numpy()
    return {
        "ridge": Z @ np.array(hm["beta"]),
        "momentum": hm["mom_coef"] * X[hm["mom_feat"]].fillna(0).to_numpy(),
        "meanrev": hm["mr_coef"] * X[hm["mr_feat"]].fillna(0).to_numpy(),
        "randomwalk": np.zeros(len(X)),
    }


def _fit_parts(X: pd.DataFrame, y: np.ndarray, cols: list, lam: float, h: str) -> dict:
    mean, std = X[cols].mean(), X[cols].std().replace(0, 1)
    Z = ((X[cols] - mean) / std).fillna(0).to_numpy()
    return {
        "features": cols,
        "mean": mean.tolist(), "std": std.tolist(),
        "beta": _ridge(Z, y, lam).tolist(), "lambda": lam,
        "mom_feat": MOM_FEAT[h], "mom_coef": _ols1(X[MOM_FEAT[h]].fillna(0).to_numpy(), y),
        "mr_feat": MR_FEAT[h], "mr_coef": _ols1(X[MR_FEAT[h]].fillna(0).to_numpy(), y),
    }


def train(feat: pd.DataFrame, cfg: dict, verbose: bool = True) -> dict:
    cols = feature_columns(feat)
    model = {"trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
             "data_end": feat.index[-1].isoformat(), "horizons": {}}
    for h, hours in HORIZONS.items():
        y_all = make_target(feat["close"], hours)
        ok = feat[cols].notna().all(axis=1) & y_all.notna()
        X, y = feat.loc[ok], y_all[ok].to_numpy()
        n = len(X)
        cut = int(n * 0.8)
        tr_end = max(cut - hours, 100)  # 去掉与验证集重叠的样本，防止信息泄露
        Xtr, ytr, Xva, yva = X.iloc[:tr_end], y[:tr_end], X.iloc[cut:], y[cut:]

        # 选 λ
        best = None
        for lam in cfg["ridge_lambdas"]:
            hm = _fit_parts(Xtr, ytr, cols, lam, h)
            mse = float(np.mean((yva - _components(hm, Xva)["ridge"]) ** 2))
            if best is None or mse < best[0]:
                best = (mse, lam, hm)
        _, lam, hm_tr = best
        comp_va = _components(hm_tr, Xva)
        # 验证集覆盖的独立预测窗口太少（例如新部署只有约 2 个月小时线）时，样本外结论不可信：
        # 不做方向判断（全部权重给“不变”），区间用全部历史的同周期涨跌分布估计
        val_span_h = (Xva.index[-1] - Xva.index[0]).total_seconds() / 3600
        enough = len(yva) >= 200 and val_span_h >= 20 * hours  # 至少约 20 个不重叠的预测窗口
        if enough:
            weights = _grid_weights(comp_va, yva)
            ens_va = sum(weights[c] * comp_va[c] for c in COMPONENTS)
            resid = yva - ens_va
        else:
            weights = {c: (1.0 if c == "randomwalk" else 0.0) for c in COMPONENTS}
            ens_va = np.zeros(len(yva))
            resid = y  # 全部样本的同周期收益
        vol_ref = float((Xva if enough else X)["vol120"].median())

        # 指标（验证集 = 最近 20% 样本，样本外）
        price_va = Xva["close"].to_numpy()
        nz = np.abs(ens_va) > 1e-12
        metrics = {
            "val_start": Xva.index[0].isoformat(), "val_n": int(len(yva)),
            "dir_acc": float(np.mean(np.sign(ens_va[nz]) == np.sign(yva[nz]))) if nz.any() else None,
            "mae_usd": float(np.mean(np.abs(price_va * (np.exp(ens_va) - np.exp(yva))))),
            "mae_rw_usd": float(np.mean(np.abs(price_va * (1 - np.exp(yva))))),
            "skill_vs_rw": float(1 - np.mean(resid ** 2) / np.mean(yva ** 2)),
            "comp_dir_acc": {c: float(np.mean(np.sign(comp_va[c]) == np.sign(yva)))
                             for c in COMPONENTS if c != "randomwalk"},
            "insufficient": not enough,
        }

        # 用全部数据重新拟合系数，权重/残差分布沿用样本外结果
        hm = _fit_parts(X, y, cols, lam, h)
        lo_q = (1 - cfg["interval_level"]) / 2
        if enough:
            q_lo, q_hi = float(np.quantile(resid, lo_q)), float(np.quantile(resid, 1 - lo_q))
        else:  # 短历史里的单边行情不代表未来，区间取对称
            q_hi = float(np.quantile(np.abs(resid - resid.mean()), cfg["interval_level"]))
            q_lo = -q_hi
        hm.update({
            "hours": hours, "val_weights": weights, "resid_std": float(resid.std()),
            "q_lo": q_lo, "q_hi": q_hi,
            "vol_ref": vol_ref, "metrics": metrics, "n_train": n,
        })
        model["horizons"][h] = hm
        if verbose and not enough:
            print(f"  [{h}] 样本 {n}，历史数据不足（验证集仅 {val_span_h / 24:.0f} 天），暂不做方向判断，只给区间")
        elif verbose:
            m = metrics
            print(f"  [{h}] 样本 {n}，λ={lam}，验证集方向准确率 {m['dir_acc']:.1%}，"
                  f"MAE ${m['mae_usd']:.1f}（不变基准 ${m['mae_rw_usd']:.1f}），"
                  f"权重 " + ", ".join(f"{k}={v:.1f}" for k, v in weights.items()))
    return model


def save_model(model: dict):
    MODEL_PATH.write_text(json.dumps(model, ensure_ascii=False, indent=1), encoding="utf-8")


def load_model() -> dict | None:
    if not MODEL_PATH.exists():
        return None
    return json.loads(MODEL_PATH.read_text(encoding="utf-8"))


def _norm_cdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def predict(model: dict, feat: pd.DataFrame, cfg: dict, context_score: float) -> dict:
    """对最新一根 K 线做三个周期的预测。返回 {h: {...}}。"""
    row = feat.iloc[[-1]]
    price = float(row["close"].iloc[0])
    out = {}
    for h, hm in model["horizons"].items():
        p = cfg["params"][h]
        comps = {k: float(v[0]) for k, v in _components(hm, row).items()}
        vol_now = row["vol120"].iloc[0]
        vol_ratio = float(np.clip(vol_now / hm["vol_ref"], 0.5, 2.5)) if pd.notna(vol_now) else 1.0
        sigma = hm["resid_std"] * vol_ratio * p["interval_scale"]
        ctx = context_score * p["bias_coef"] * hm["resid_std"] * vol_ratio
        base = sum(p["weights"][c] * comps[c] for c in COMPONENTS)
        ret = base + ctx + p["bias_offset"]
        lo = ret + hm["q_lo"] * vol_ratio * p["interval_scale"]
        hi = ret + hm["q_hi"] * vol_ratio * p["interval_scale"]
        z = ret / sigma if sigma > 0 else 0.0
        direction = ("上涨" if z > 0.25 else "偏涨" if z > 0.05 else
                     "下跌" if z < -0.25 else "偏跌" if z < -0.05 else "震荡")
        out[h] = {
            "hours": hm["hours"], "base_price": price, "pred_ret": ret,
            "pred_price": price * math.exp(ret), "lower": price * math.exp(lo), "upper": price * math.exp(hi),
            "sigma": sigma, "prob_up": _norm_cdf(ret / sigma) if sigma > 0 else 0.5,
            "direction": direction, "context_score": context_score,
            "components": {**comps, "context": ctx, "offset": p["bias_offset"]},
        }
    return out
