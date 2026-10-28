import { expect, it } from "vitest";
import { tambahBulan } from "../lib/tagihan";

it("tambahBulan", () => {
  expect(tambahBulan("2026-01-15", 1)).toBe("2026-02-15");
  expect(tambahBulan("2026-01-31", 1)).toBe("2026-03-03");
});
