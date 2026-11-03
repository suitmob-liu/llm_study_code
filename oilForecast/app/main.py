import csv
import io
import os
import sqlite3
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from .model import ForecastInput, Quote, RetailRecord, forecast

ROOT = Path(__file__).resolve().parent.parent
DB = Path(os.environ.get('OIL_DB_PATH', str(ROOT / 'data' / 'oil.sqlite3')))


@contextmanager
def connect():
    db = sqlite3.connect(DB, timeout=15)
    try:
        db.row_factory = sqlite3.Row
        with db:
            yield db
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app):
    DB.parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.execute('CREATE TABLE IF NOT EXISTS retail (effective_date TEXT PRIMARY KEY, p92 REAL, p95 REAL, p98 REAL, p0 REAL, source TEXT)')
        db.execute('CREATE TABLE IF NOT EXISTS quotes (trade_date TEXT PRIMARY KEY, brent REAL, wti REAL, usd_cny REAL, source TEXT)')
    yield


app = FastAPI(title='安徽油价预测', lifespan=lifespan)
app.mount('/static', StaticFiles(directory=ROOT / 'static'), name='static')


@app.get('/')
def index():
    return FileResponse(ROOT / 'static' / 'index.html')


@app.get('/api/data')
def data():
    with connect() as db:
        return {'retail': [dict(r) for r in db.execute('SELECT * FROM retail ORDER BY effective_date DESC')],
                'quotes': [dict(r) for r in db.execute('SELECT * FROM quotes ORDER BY trade_date DESC')]}


def save(table, record):
    values = record.model_dump(mode='json')
    columns = ','.join(values)
    marks = ','.join('?' for _ in values)
    with connect() as db:
        # Same-date corrections replace that day's data, never append duplicate observations.
        db.execute(f'INSERT OR REPLACE INTO {table} ({columns}) VALUES ({marks})', list(values.values()))
    return {'ok': True}


@app.post('/api/retail')
def save_retail(record: RetailRecord):
    return save('retail', record)


@app.post('/api/quotes')
def save_quote(record: Quote):
    return save('quotes', record)


@app.post('/api/forecast')
def predict(params: ForecastInput):
    records = data()
    eligible = [r for r in records['retail'] if r['effective_date'] <= params.cycle_start.isoformat()]
    if not eligible:
        raise HTTPException(422, '请先录入本期开始时已生效的安徽油价')
    try:
        return forecast(params, RetailRecord(**eligible[0]), [Quote(**q) for q in records['quotes']])
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get('/api/export/{kind}')
def export(kind: str):
    if kind not in ('retail', 'quotes'):
        raise HTTPException(404, '未知数据类型')
    rows = data()[kind]
    fields = list(RetailRecord.model_fields if kind == 'retail' else Quote.model_fields)
    out = io.StringIO(newline='')
    writer = csv.DictWriter(out, fieldnames=fields)
    writer.writeheader()
    for row in rows:
        writer.writerow({k: ("'" + str(v) if str(v).startswith(('=', '+', '-', '@', '\t', '\r', '\n')) else v) for k, v in row.items()})
    return Response(out.getvalue().encode('utf-8-sig'), media_type='text/csv',
                    headers={'Content-Disposition': f'attachment; filename="{kind}.csv"'})
