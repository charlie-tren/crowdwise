import { describe, it, expect } from "vitest";
import { jointYes, atLeastOne } from "./scenario";

describe("scenario math", () => {
  it("joint = product of probabilities", () => expect(jointYes([0.5, 0.4])).toBeCloseTo(0.2));
  it("at-least-one = 1 - product(1-p)", () => expect(atLeastOne([0.5, 0.4])).toBeCloseTo(0.7));
  it("three legs", () => {
    expect(jointYes([0.5, 0.5, 0.5])).toBeCloseTo(0.125);
    expect(atLeastOne([0.5, 0.5, 0.5])).toBeCloseTo(0.875);
  });
});
