import { describe, it, expect } from "vitest";
import { normalizeCalendarSelection } from "./google-calendar";

describe("normalizeCalendarSelection", () => {
  it("keeps only valid selected calendar ids and removes duplicates", () => {
    const calendars = [
      { id: "primary" },
      { id: "school" },
      { id: "personal" },
    ];

    expect(normalizeCalendarSelection(["primary", "school", "primary", "missing"], calendars)).toEqual([
      "primary",
      "school",
    ]);
  });
});
