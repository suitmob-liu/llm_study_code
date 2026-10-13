"""黄金金价走势分析工具 —— 命令行入口。

用法：
  python main.py serve       启动网页版（默认 http://0.0.0.0:1012），后台自动更新行情/预测/回测
  python main.py analyze     近一年走势复盘 + 国际因子分析，生成报告
  python main.py train       用最新数据重新训练模型
  python main.py predict     预测未来 5 小时 / 1 天 / 7 天，并存档
  python main.py evaluate    验证已到期预测，归因并自动调整模型
  python main.py run         evaluate + predict（适合定时任务）
  python main.py history     查看历史预测、准确率与模型变更
  python main.py context     查看国际基本面情景打分
"""
import argparse
import json
import os
import sys

import pandas as pd

from gold import data, service, store
from gold.analysis import analyze
from gold.config import HORIZON_CN, OZ_TO_GRAM, ensure_dirs, load_config
from gold.context import describe, load_context
from gold.evaluate import summarize

BJ = "Asia/Shanghai"


def _bj(ts) -> str:
    return pd.Timestamp(ts).tz_convert(BJ).strftime("%Y-%m-%d %H:%M")


def print_prediction(res: dict):
    fx = res["usdcny"]
    print(f"\n基准：{_bj(res['base_time'])}（北京时间）  最新价 ${res['base_price']:,.1f}/盎司"
          + (f"  ≈ ¥{res['base_price'] * fx / OZ_TO_GRAM:,.2f}/克" if fx else ""))
    for w in res["warnings"]:
        print(f"[提示] {w}")
    print(f"国际情景分 {res['context_score']:+.2f}  模型版本 v{res['model_version']}\n")
    print(f"{'周期':<8}{'预测价':>10}{'涨跌':>9}{'方向':>6}{'上涨概率':>9}   80%区间")
    for p in res["items"]:
        chg = (p["pred_price"] / p["base_price"] - 1) * 100
        print(f"{HORIZON_CN[p['horizon']]:<7}{p['pred_price']:>10,.1f}{chg:>+8.2f}%{p['direction']:>5}"
              f"{p['prob_up']:>9.0%}   {p['lower']:,.1f} ~ {p['upper']:,.1f}   "
              f"(#{p['id']}，到期 {_bj(p['target_time'])})")
        if p["pred_price_cny"]:
            print(f"{'':<7}{'≈ ¥' + format(p['pred_price_cny'], ',.2f') + '/克':>18}")
    print("\n分量贡献（对数收益 %）：")
    for p in res["items"]:
        print(f"  {p['horizon']}: " + "  ".join(f"{k}={v * 100:+.3f}" for k, v in p["components"].items()))
    print("\n预测已存档，到期后运行 `python main.py evaluate` 对比实际结果。")
    print("免责声明：模型输出仅供研究参考，不构成投资建议。")


def do_history(con, cfg):
    rows = store.all_predictions(con, 10000)
    stats = summarize(rows)
    print(f"当前模型版本 v{cfg['version']}\n")
    print("== 累计预测表现 ==")
    if not stats:
        print("  暂无已验证的预测")
    for h, s in stats.items():
        print(f"  {HORIZON_CN[h]}：{s['n']} 条，方向准确率 {s['dir_acc']:.0%}，区间覆盖率 {s['coverage']:.0%}，"
              f"MAE ${s['mae_usd']:.1f}（不变基准 ${s['mae_rw_usd']:.1f}）")
    print("\n== 最近 20 条预测 ==")
    for r in rows[:20]:
        line = (f"  #{r['id']:<4}{_bj(r['base_time'])} {HORIZON_CN[r['horizon']]:<6} "
                f"{r['base_price']:,.1f} → 预测 {r['pred_price']:,.1f}（{r['direction']}）")
        if r["status"] == "evaluated":
            line += (f" 实际 {r['actual_price']:,.1f} 误差 {r['error_usd']:+.1f} "
                     f"方向{'✓' if r['direction_hit'] else '✗'} 区间{'✓' if r['in_interval'] else '✗'}")
        else:
            line += f"  待验证（到期 {_bj(r['target_time'])}）"
        print(line)
    print("\n== 模型变更历史 ==")
    for hrow in store.history(con, 10):
        print(f"  v{hrow['version']} {hrow['kind']} {_bj(hrow['created_at'])} {hrow['note']}")
        for c in json.loads(hrow["changes"]):
            print(f"      - {c}")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="黄金金价走势分析与预测工具")
    ap.add_argument("cmd", choices=["serve", "analyze", "train", "predict", "evaluate", "run", "history", "context"])
    ap.add_argument("--offline", action="store_true", help="不联网，只用本地数据库中的数据")
    ap.add_argument("--host", default=os.environ.get("HOST", "0.0.0.0"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 1012)))
    args = ap.parse_args()

    ensure_dirs()
    if args.cmd == "serve":
        import uvicorn
        uvicorn.run("web.app:app", host=args.host, port=args.port, log_level="info")
        return

    cfg = load_config()
    con = store.connect()
    if args.cmd == "context":
        print(describe(load_context()))
        return
    if args.cmd == "history":
        do_history(con, cfg)
        return

    hourly, daily = data.load(refresh_data=not args.offline, con=con)
    if args.cmd == "analyze":
        text, info = analyze(daily, hourly, load_context())
        print(text)
        print(f"报告已保存：{info['path']}")
    elif args.cmd == "train":
        service.train_model(con, cfg, hourly, daily)
    elif args.cmd == "predict":
        print_prediction(service.make_prediction(con, cfg, hourly, daily, verbose=True))
    elif args.cmd == "evaluate":
        service.feedback(con, cfg, hourly, daily, verbose=True)
    elif args.cmd == "run":
        service.feedback(con, cfg, hourly, daily, verbose=True)
        print_prediction(service.make_prediction(con, cfg, hourly, daily, verbose=True))


if __name__ == "__main__":
    main()
