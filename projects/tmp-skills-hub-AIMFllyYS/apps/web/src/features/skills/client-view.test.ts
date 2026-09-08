import { describe, expect, it } from "vitest";
import { fallbackClientState } from "./client-view.js";

describe("fallbackClientState", () => {
  it("visibleIn 含该客户端则当受管", () => {
    expect(fallbackClientState(["claude"], "claude")).toBe("managed");
    expect(fallbackClientState(["cursor"], "claude")).toBe("off");
  });
});
