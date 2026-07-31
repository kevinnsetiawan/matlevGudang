import test from "node:test";
import assert from "node:assert/strict";
import { tsbMonthlyForecast, expandMonthlySeriesFromMap, buildMonthlyDemandSeries } from "../../src/lib/tsbForecast.js";

test("no demand ever -> forecast stays 0", () => {
  const { forecastPerPeriod } = tsbMonthlyForecast([0, 0, 0, 0, 0]);
  assert.equal(forecastPerPeriod, 0);
});

test("lumpy demand (mostly 0, one spike) forecasts far below flat average", () => {
  // 700 keluar sekali di 10 bulan lain 0 -- rata-rata flat lama = 70/bulan (bias tinggi,
  // salah satu insiden 233,333/bulan yang dilaporkan user berasal dari pola serupa).
  const series = [0, 0, 0, 0, 0, 0, 0, 0, 0, 700];
  const { forecastPerPeriod } = tsbMonthlyForecast(series);
  const flatAverage = 700 / series.length;
  assert.ok(forecastPerPeriod < flatAverage, `TSB (${forecastPerPeriod}) harus < rata-rata flat (${flatAverage})`);
  assert.ok(forecastPerPeriod > 0);
});

test("regular monthly demand converges toward that steady value", () => {
  // alpha=beta=0.1 -> smoothing eksponensial, konvergen bertahap (bukan instan) ke nilai steady.
  const { forecastPerPeriod: after24 } = tsbMonthlyForecast(Array(24).fill(10));
  const { forecastPerPeriod: after60 } = tsbMonthlyForecast(Array(60).fill(10));
  assert.ok(after24 > 7 && after24 < 10, `24 bulan: harus di rentang wajar mendekati 10, dapat ${after24}`);
  assert.ok(after60 > after24, "makin banyak periode stabil, forecast harus makin dekat ke steady value");
  assert.ok(after60 > 9.5, `60 bulan: harus sudah sangat dekat 10, dapat ${after60}`);
});

test("expandMonthlySeriesFromMap fills gap months with 0", () => {
  const series = expandMonthlySeriesFromMap({ "2026-01": 5, "2026-04": 9 }, new Date(2026, 3, 15).getTime());
  assert.deepEqual(series, [5, 0, 0, 9]);
});

test("buildMonthlyDemandSeries aggregates same-month items and fills gaps", () => {
  const now = new Date(2026, 2, 1).getTime(); // 2026-03
  const usageItems = [
    { qty: 3, ts: new Date(2026, 0, 5).getTime() }, // 2026-01
    { qty: 2, ts: new Date(2026, 0, 20).getTime() }, // 2026-01 (sama bulan, harus digabung)
  ];
  const series = buildMonthlyDemandSeries(usageItems, now);
  assert.deepEqual(series, [5, 0, 0]);
});
