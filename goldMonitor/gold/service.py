"""业务流程：训练 / 预测 / 回测反馈。命令行和网页共用，内部加锁保证线程安全。"""
import threading
from datetime import datetime, timedelta, timezone

import pandas as pd

from . import data, store
from .config import HORIZON_CN, OZ_TO_GRAM, save_config
from .context import context_score, load_context, staleness_days
from .evaluate import run_feedback
from .features import build_features
from .model import load_model, predict, save_model, train

RETRAIN_DAYS = 7
LOCK = threading.RLock()


def train_model(con, cfg, hourly, daily, reason="手动重新训练", verbose=True):
    with LOCK:
        if verbose:
            print("训练模型（验证集 = 最近 20% 样本，样本外评估）...")
        feat = build_features(hourly, daily)
        model = train(feat, cfg, verbose=verbose)
        cfg["version"] += 1
        model["version"] = cfg["version"]
        for h, hm in model["horizons"].items():  # 用样本外最优权重刷新，校准参数保留
            cfg["params"][h]["weights"] = hm["val_weights"]
        save_model(model)
        save_config(cfg)
        metrics = {h: hm["metrics"] for h, hm in model["horizons"].items()}
        changes = [f"[{h}] 重新训练：历史数据不足，暂不做方向判断，只给区间（数据积累后重训会自动恢复）"
                   if hm["metrics"].get("insufficient") else
                   f"[{h}] 重新训练：λ={hm['lambda']}，样本外方向准确率 {hm['metrics']['dir_acc']:.1%}，"
                   f"MAE ${hm['metrics']['mae_usd']:.1f}（不变基准 ${hm['metrics']['mae_rw_usd']:.1f}），"
                   f"权重 {hm['val_weights']}" for h, hm in model["horizons"].items()]
        store.add_history(con, cfg["version"], "train", changes, metrics, note=reason)
        if verbose:
            print(f"模型已保存，版本 v{cfg['version']}")
        return model, feat


def get_model(con, cfg, hourly, daily, verbose=True):
    with LOCK:
        model = load_model()
        if model is None:
            return train_model(con, cfg, hourly, daily, "首次训练", verbose)
        age = datetime.now(timezone.utc) - datetime.fromisoformat(model["trained_at"])
        if age > timedelta(days=RETRAIN_DAYS):
            return train_model(con, cfg, hourly, daily, f"模型已 {age.days} 天未训练，自动重训", verbose)
        return model, build_features(hourly, daily)


def make_prediction(con, cfg, hourly, daily, verbose=False) -> dict:
    """预测三个周期并存档，返回结构化结果。"""
    with LOCK:
        model, feat = get_model(con, cfg, hourly, daily, verbose)
        ctx = load_context()
        score = context_score(ctx)
        now = datetime.now(timezone.utc)
        base_time = feat.index[-1]
        fx = data.asof(daily.get("usdcny"), pd.Timestamp(now))
        preds = predict(model, feat, cfg, score)
        warnings = []
        if (now - base_time.to_pydatetime()).total_seconds() > 3 * 3600:
            warnings.append("最新K线距今超过 3 小时，市场可能处于休市（周末/节假日），短周期预测参考性下降")
        stale = staleness_days(ctx)
        if stale is not None and stale > 7:
            warnings.append(f"国际情景已 {stale} 天未更新，建议更新后再预测")
        items = []
        for h, p in preds.items():
            target = now + timedelta(hours=p["hours"])
            rec = {
                "created_at": now.isoformat(timespec="seconds"), "model_version": cfg["version"],
                "horizon": h, "hours": p["hours"], "base_time": base_time.isoformat(),
                "base_price": p["base_price"], "usdcny": fx, "target_time": target.isoformat(timespec="seconds"),
                **{k: p[k] for k in ("pred_ret", "pred_price", "lower", "upper", "sigma", "prob_up",
                                     "direction", "context_score", "components")},
            }
            rec["id"] = store.add_prediction(con, rec)
            rec["horizon_cn"] = HORIZON_CN[h]
            rec["pred_price_cny"] = p["pred_price"] * fx / OZ_TO_GRAM if fx else None
            items.append(rec)
        store.set_meta(con, "last_predict", now.isoformat(timespec="seconds"))
        return {"base_time": base_time.isoformat(), "base_price": float(feat["close"].iloc[-1]), "usdcny": fx,
                "context_score": score, "model_version": cfg["version"], "warnings": warnings, "items": items}


def feedback(con, cfg, hourly, daily, verbose=False) -> dict:
    with LOCK:
        model, _ = get_model(con, cfg, hourly, daily, verbose)
        return run_feedback(con, cfg, model, hourly, daily, verbose=verbose)
