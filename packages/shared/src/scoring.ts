export interface ScoreBand {
  min: number;
  max: number;
  label: string;
  color: string;
}

export const SCORE_BANDS: ScoreBand[] = [
  {
    min: 0,
    max: 25,
    label: "Critical - invisible to AI",
    color: "#ff3366",
  },
  {
    min: 26,
    max: 40,
    label: "Poor - major gaps",
    color: "#ff8833",
  },
  {
    min: 41,
    max: 55,
    label: "Fair - needs work",
    color: "#ffcc00",
  },
  {
    min: 56,
    max: 70,
    label: "Good - on the right track",
    color: "#aacc00",
  },
  {
    min: 71,
    max: 85,
    label: "Great - competitive",
    color: "#00e699",
  },
  {
    min: 86,
    max: 100,
    label: "Excellent - fully optimized",
    color: "#00ccff",
  },
];

export function getScoreBand(score: number): ScoreBand {
  return (
    SCORE_BANDS.find((band) => score >= band.min && score <= band.max) ??
    SCORE_BANDS[SCORE_BANDS.length - 1]!
  );
}
