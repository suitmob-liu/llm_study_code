"""路径与可调参数（config.json 会被反馈环节自动修改）。"""
import copy
import json
import os
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# 所有会变化的状态（数据库、模型、配置、报告）都放在 GOLD_HOME 下；Docker 中挂载为卷
HOME = Path(os.environ.get("GOLD_HOME", ROOT)).resolve()
DATA_DIR = HOME / "data"
RAW_DIR = DATA_DIR / "raw"
MODEL_DIR = HOME / "models"
REPORT_DIR = HOME / "reports"
HISTORY_DIR = HOME / "history"
DB_PATH = DATA_DIR / "gold.db"
CONFIG_PATH = HOME / "config.json"
CONTEXT_PATH = HOME / "market_context.json"
DEFAULT_CONTEXT_PATH = ROOT / "market_context.json"
MODEL_PATH = MODEL_DIR / "model.json"
CHANGELOG_PATH = HISTORY_DIR / "model_changelog.md"

# 预测周期：名称 -> 小时数
HORIZONS = {"5h": 5, "1d": 24, "7d": 168}
HORIZON_CN = {"5h": "未来5小时", "1d": "未来1天", "7d": "未来7天"}
COMPONENTS = ["ridge", "momentum", "meanrev", "randomwalk"]
COMPONENT_CN = {"ridge": "多因子回归", "momentum": "动量", "meanrev": "均值回归", "randomwalk": "随机游走(不变)"}

OZ_TO_GRAM = 31.1035

DEFAULT_CONFIG = {
    "version": 0,
    "interval_level": 0.8,  # 预测区间目标覆盖率（80% 区间）
    "ridge_lambdas": [10, 100, 1000, 10000, 100000, 1000000],
    "params": {
        h: {
            "weights": {c: 0.25 for c in COMPONENTS},
            "interval_scale": 1.0,  # 区间宽度缩放（反馈校准）
            "bias_coef": 0.15,  # 基本面情景分的影响强度（单位：σ）
            "bias_offset": 0.0,  # 系统性偏差修正（对数收益）
        }
        for h in HORIZONS
    },
    "adjust": {"window": 20, "min_samples": 3, "lr": 0.3},
}


def ensure_dirs():
    for d in (DATA_DIR, RAW_DIR, MODEL_DIR, REPORT_DIR, HISTORY_DIR):
        d.mkdir(parents=True, exist_ok=True)
    if not CONTEXT_PATH.exists() and DEFAULT_CONTEXT_PATH.exists():
        shutil.copy(DEFAULT_CONTEXT_PATH, CONTEXT_PATH)  # 首次启动用仓库自带的情景做种子


def load_config() -> dict:
    cfg = copy.deepcopy(DEFAULT_CONFIG)
    if CONFIG_PATH.exists():
        user = json.loads(CONFIG_PATH.read_text(encoding="utf-8-sig"))
        cfg.update({k: v for k, v in user.items() if k != "params"})
        for h, p in user.get("params", {}).items():
            cfg["params"].setdefault(h, {}).update(p)
    return cfg


def save_config(cfg: dict):
    CONFIG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
