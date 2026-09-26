import { describe, expect, it } from "vitest";
import { waitingStage } from "@/lib/ai-waiting";

describe("waitingStage", () => {
  it("starts by saying it's working", () => {
    expect(waitingStage(0)).toBe("working");
    expect(waitingStage(4_999)).toBe("working");
  });
  it("reassures after five seconds", () => {
    expect(waitingStage(5_000)).toBe("still");
    expect(waitingStage(14_999)).toBe("still");
  });
  it("explains a long wait after fifteen seconds", () => {
    expect(waitingStage(15_000)).toBe("busy");
    expect(waitingStage(90_000)).toBe("busy");
  });
});
