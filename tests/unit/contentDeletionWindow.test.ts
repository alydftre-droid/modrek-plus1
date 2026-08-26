import { describe, expect, it } from "vitest";
import {
  TEACHER_DELETE_WINDOW_MS,
  canDeleteTeacherContent,
  isWithinTeacherDeleteWindow,
} from "../../src/lib/contentDeletionWindow";

const uploadedAt = new Date("2026-08-26T10:00:00.000Z");

describe("teacher 24h content deletion window", () => {
  it("allows a teacher to delete freshly uploaded content", () => {
    expect(canDeleteTeacherContent({ createdAt: uploadedAt, isAdminMode: false, now: uploadedAt })).toBe(true);
  });

  it("allows deletion just before 24h", () => {
    const now = new Date(uploadedAt.getTime() + TEACHER_DELETE_WINDOW_MS - 1000);
    expect(canDeleteTeacherContent({ createdAt: uploadedAt, isAdminMode: false, now })).toBe(true);
  });

  it("hides the button after 24h for the teacher", () => {
    const now = new Date("2026-08-27T10:00:01.000Z");
    expect(isWithinTeacherDeleteWindow(uploadedAt, now)).toBe(false);
    expect(canDeleteTeacherContent({ createdAt: uploadedAt, isAdminMode: false, now })).toBe(false);
  });

  it("keeps the button for the developer at any age", () => {
    const now = new Date("2027-01-01T00:00:00.000Z");
    expect(canDeleteTeacherContent({ createdAt: uploadedAt, isAdminMode: true, now })).toBe(true);
  });

  it("treats missing or invalid timestamps as expired for teachers", () => {
    expect(canDeleteTeacherContent({ createdAt: null, isAdminMode: false })).toBe(false);
    expect(canDeleteTeacherContent({ createdAt: "not-a-date", isAdminMode: false })).toBe(false);
  });

  it("accepts ISO strings from the database", () => {
    expect(isWithinTeacherDeleteWindow("2026-08-26T10:00:00Z", new Date("2026-08-26T23:00:00Z"))).toBe(true);
    expect(isWithinTeacherDeleteWindow("2026-08-26T10:00:00Z", new Date("2026-08-28T00:00:00Z"))).toBe(false);
  });
});
