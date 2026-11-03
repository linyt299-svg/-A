import unittest
from datetime import datetime, timezone

from backend.news_intelligence import calculate_composite_score, calculate_news_score, time_decay


class NewsIntelligenceTests(unittest.TestCase):
    def test_time_decay_halves_after_one_day(self):
        now = datetime(2026, 11, 2, 4, tzinfo=timezone.utc)
        self.assertAlmostEqual(time_decay("2026-11-01T12:00:00+08:00", now=now), 0.5)

    def test_unverified_rumor_cannot_inflate_score(self):
        now = datetime(2026, 11, 2, 4, tzinfo=timezone.utc)
        result = calculate_news_score([
            {
                "source": "市场自媒体",
                "verified": False,
                "impact_score": 80,
                "publish_time": "2026-11-02T11:00:00+08:00",
            }
        ], now=now)
        self.assertLess(result.score, 50)

    def test_composite_weights(self):
        self.assertEqual(calculate_composite_score(
            technical_score=80,
            capital_score=60,
            institution_score=50,
            news_score=90,
        ), 71.0)


if __name__ == "__main__":
    unittest.main()
