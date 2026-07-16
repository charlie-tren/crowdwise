export function jointYes(probs: number[]): number {
  return probs.reduce((acc, p) => acc * p, 1);
}
export function atLeastOne(probs: number[]): number {
  return 1 - probs.reduce((acc, p) => acc * (1 - p), 1);
}
