import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

from app.model import ForecastInput, Quote, RetailRecord, forecast


def parameters(**kwargs):
    return ForecastInput(**dict(baseline_start='2025-01-01', baseline_end='2025-01-02',
                               cycle_start='2025-01-03', observation_end='2025-01-04',
                               adjustment_date='2025-01-06', expected_days=2, **kwargs))


def quotes(base=70, current=80, fx=7):
    return [Quote(trade_date=f'2025-01-0{i}', brent=base if i < 3 else current,
                  wti=base if i < 3 else current, usd_cny=7 if i < 3 else fx, source='test')
            for i in range(1, 5)]


RETAIL = RetailRecord(effective_date='2024-12-31', p92=7, p95=7.5, p98=8.5, p0=6.6, source='test')


class ModelTests(unittest.TestCase):
    def test_rise_and_fall(self):
        up = forecast(parameters(), RETAIL, quotes())
        down = forecast(parameters(), RETAIL, quotes(current=60))
        self.assertEqual(up['adjustment_yuan_ton'], 307.86)
        self.assertEqual(up['prices'][0]['predicted'], 7.23)
        self.assertLess(down['prices'][0]['predicted'], 7)

    def test_small_change_carried_and_exact_threshold(self):
        result = forecast(parameters(), RETAIL, quotes(current=71))
        self.assertEqual(result['adjustment_yuan_ton'], 0)
        self.assertEqual(result['carry_next'], 30.79)
        self.assertEqual(forecast(parameters(carry_yuan_ton=50), RETAIL, quotes(current=70))['adjustment_yuan_ton'], 50)
        self.assertEqual(forecast(parameters(carry_yuan_ton=-50), RETAIL, quotes(current=70))['adjustment_yuan_ton'], -50)

    def test_scenario_only_affects_unobserved_days(self):
        full = quotes()
        self.assertEqual(forecast(parameters(scenario_pct=20), RETAIL, full)['change_pct'],
                         forecast(parameters(), RETAIL, full)['change_pct'])
        partial = full[:-1]
        self.assertGreater(forecast(parameters(scenario_pct=20), RETAIL, partial)['change_pct'],
                           forecast(parameters(), RETAIL, partial)['change_pct'])

    def test_exchange_rate(self):
        self.assertGreater(forecast(parameters(), RETAIL, quotes(current=70, fx=7.5))['change_pct'], 0)

    def test_floor_and_cap(self):
        self.assertEqual(forecast(parameters(), RETAIL, quotes(base=35, current=30))['adjustment_yuan_ton'], 0)
        self.assertEqual(forecast(parameters(), RETAIL, quotes(base=60, current=30))['adjustment_yuan_ton'],
                         forecast(parameters(), RETAIL, quotes(base=60, current=40))['adjustment_yuan_ton'])
        self.assertIsNone(forecast(parameters(), RETAIL, quotes(current=140))['prices'][0]['predicted'])

    def test_incomplete_or_excess_baseline_rejected(self):
        with self.assertRaises(ValueError):
            forecast(parameters(), RETAIL, quotes()[1:])

    def test_reject_invalid_ranges_and_nonfinite(self):
        with self.assertRaises(ValueError):
            ForecastInput(baseline_start='2025-01-02', baseline_end='2025-01-01', cycle_start='2025-01-03', observation_end='2025-01-04', adjustment_date='2025-01-06')
        with self.assertRaises(ValueError):
            Quote(trade_date='2025-01-01', brent=float('nan'), wti=70, usd_cny=7, source='test')
        with self.assertRaises(ValueError):
            Quote(trade_date=date.today() + timedelta(days=1), brent=70, wti=70, usd_cny=7, source='test')


class ApiTests(unittest.TestCase):
    def test_persistence_corrections_forecast_and_export(self):
        import app.main as main
        with tempfile.TemporaryDirectory() as directory:
            old = main.DB
            self.addCleanup(setattr, main, 'DB', old)
            main.DB = Path(directory) / 'test.sqlite3'
            with TestClient(main.app) as client:
                self.assertEqual(client.get('/').status_code, 200)
                self.assertEqual(client.get('/static/app.js').status_code, 200)
                self.assertEqual(client.post('/api/forecast', json=parameters().model_dump(mode='json')).status_code, 422)
                retail = RETAIL.model_dump(mode='json')
                self.assertEqual(client.post('/api/retail', json=retail).status_code, 200)
                for quote in quotes():
                    self.assertEqual(client.post('/api/quotes', json=quote.model_dump(mode='json')).status_code, 200)
                retail['p92'] = 7.1
                retail['source'] = '=unsafe spreadsheet formula'
                client.post('/api/retail', json=retail)
                # Later historical records must not leak into a prior-cycle forecast.
                later = dict(retail, effective_date='2025-01-05', p92=9)
                client.post('/api/retail', json=later)
                result = client.post('/api/forecast', json=parameters().model_dump(mode='json'))
                self.assertEqual(result.status_code, 200)
                self.assertEqual(result.json()['prices'][0]['current'], 7.1)
                exported = client.get('/api/export/retail')
                self.assertIn("'=unsafe", exported.text)
                self.assertEqual(client.get('/api/export/unknown').status_code, 404)
                self.assertEqual(client.post('/api/quotes', json={'brent': -1}).status_code, 422)
            with TestClient(main.app) as client:
                data = client.get('/api/data').json()
                self.assertEqual(len(data['retail']), 2)
                self.assertEqual(len(data['quotes']), 4)


if __name__ == '__main__':
    unittest.main()
