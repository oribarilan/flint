import { describe, it, expect, beforeEach } from "vitest";
import {
  cachePrepData,
  getPrepData,
  getPrepStatus,
  hasPrepData,
  clearPrepData,
  cleanupExpiredPrep,
} from "../heartbeat/prep-cache";

describe("prep-cache", () => {
  beforeEach(() => {
    clearPrepData();
  });

  it("returns null for unknown meeting", () => {
    expect(getPrepData("unknown")).toBeNull();
  });

  it("stores and retrieves prep data", () => {
    cachePrepData("m1", ["bullet 1", "bullet 2"]);
    expect(getPrepData("m1")).toEqual(["bullet 1", "bullet 2"]);
    expect(hasPrepData("m1")).toBe(true);
  });

  it("overwrites existing prep data", () => {
    cachePrepData("m1", ["old"]);
    cachePrepData("m1", ["new"]);
    expect(getPrepData("m1")).toEqual(["new"]);
  });

  it("clears all data", () => {
    cachePrepData("m1", ["a"]);
    cachePrepData("m2", ["b"]);
    clearPrepData();
    expect(hasPrepData("m1")).toBe(false);
    expect(hasPrepData("m2")).toBe(false);
  });

  it("cleanupExpiredPrep removes entries not in active set", () => {
    cachePrepData("m1", ["a"]);
    cachePrepData("m2", ["b"]);
    cachePrepData("m3", ["c"]);
    const removed = cleanupExpiredPrep(new Set(["m1", "m3"]));
    expect(removed).toBe(1);
    expect(hasPrepData("m1")).toBe(true);
    expect(hasPrepData("m2")).toBe(false);
    expect(hasPrepData("m3")).toBe(true);
  });

  it("cleanupExpiredPrep returns 0 when all entries are active", () => {
    cachePrepData("m1", ["a"]);
    const removed = cleanupExpiredPrep(new Set(["m1"]));
    expect(removed).toBe(0);
  });

  describe("getPrepStatus", () => {
    it("returns 'pending' for unknown meeting", () => {
      expect(getPrepStatus("unknown")).toBe("pending");
    });

    it("returns 'ready' when prep has items", () => {
      cachePrepData("m1", ["bullet 1"]);
      expect(getPrepStatus("m1")).toBe("ready");
    });

    it("returns 'empty' when prep ran but found nothing", () => {
      cachePrepData("m1", []);
      expect(getPrepStatus("m1")).toBe("empty");
    });
  });
});
