import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { usernameFromParam } = await import("./crea-report-card-share");

describe("ime knjižice iz URL-a (K30, K29 S-05)", () => {
  test("ispravno ime se dekodira, loš `%` niz daje prazno ime (404, ne 500)", () => {
    expect(usernameFromParam("jovan.m")).toBe("jovan.m");
    expect(usernameFromParam("%C5%A1ef")).toBe("šef");
    expect(usernameFromParam("%E0%A4%A")).toBe("");
  });
});
