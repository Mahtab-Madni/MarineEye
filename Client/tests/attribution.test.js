import test from "node:test";
import assert from "node:assert/strict";

import {
  formatScore,
  getAttributionSignals,
  getStrongestSignal,
  rankSources,
  safeScore,
} from "../src/utils/attribution.js";

test("safeScore normalizes percentages and clamps values", () => {
  assert.equal(safeScore(0.54), 0.54);

  assert.equal(safeScore(54), 0.54);

  assert.equal(safeScore(140), 1);

  assert.equal(safeScore(-2), 0);

  assert.equal(safeScore("bad"), null);
});

test("formatScore produces readable percentages", () => {
  assert.equal(formatScore(0.54), "54%");

  assert.equal(formatScore(54), "54%");

  assert.equal(formatScore(undefined), "—");
});

test("attribution signals support the normalized source contract", () => {
  const signals = getAttributionSignals({
    sub_scores: {
      cpa: 0.7,
      tcpa: 0.4,
      drift_overlap: 0.8,
    },
  });

  test("attribution signals include proximity and trajectory match", () => {
    const signals = getAttributionSignals({
      sub_scores: {
        proximity: 0.7,
        trajectory_match: 0.6,
      },
    });

    assert.deepEqual(
      signals.map((signal) => signal.key),
      ["proximity", "trajectory_match"],
    );
  });
  assert.deepEqual(
    signals.map((signal) => signal.key),
    ["cpa", "tcpa", "drift_overlap"],
  );
});

test("explicit dominant factor wins over computed strongest signal", () => {
  assert.equal(
    getStrongestSignal({
      dominant_factor: "trajectory_match",

      sub_scores: {
        cpa: 0.99,
      },
    }),
    "Trajectory match",
  );
});

test("sources are ranked and limited to top three", () => {
  const sources = [
    {
      id: "A",
      fused_score: 0.4,
    },

    {
      id: "B",
      fused_score: 0.9,
    },

    {
      id: "C",
      fused_score: 0.7,
    },

    {
      id: "D",
      fused_score: 0.8,
    },
  ];

  assert.deepEqual(
    rankSources(sources).map((source) => source.id),
    ["B", "D", "C"],
  );
});
