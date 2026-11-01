import { describe, expect, it } from "vitest";
import { formatInZone, isValidTimeZone, localToUtc, utcToLocalInput } from "./time";

describe("localToUtc", () => {
  it("convierte hora de Bogotá (UTC-5, sin horario de verano) a UTC", () => {
    expect(localToUtc("2027-06-10T15:00", "America/Bogota")).toEqual({ ok: true, iso: "2027-06-10T20:00:00.000Z" });
  });
  it("respeta el horario de verano de Nueva York", () => {
    expect(localToUtc("2027-06-10T15:00", "America/New_York")).toEqual({ ok: true, iso: "2027-06-10T19:00:00.000Z" });
    expect(localToUtc("2027-01-10T15:00", "America/New_York")).toEqual({ ok: true, iso: "2027-01-10T20:00:00.000Z" });
  });
  it("la misma hora local da instantes distintos según el torneo (no se asume Colombia)", () => {
    const a = localToUtc("2027-06-10T15:00", "America/Bogota");
    const b = localToUtc("2027-06-10T15:00", "Europe/Madrid");
    expect(a.ok && b.ok && a.iso !== b.iso).toBe(true);
    expect(b).toEqual({ ok: true, iso: "2027-06-10T13:00:00.000Z" });
  });
  it("rechaza una hora inexistente (salto de primavera)", () => {
    expect(localToUtc("2027-03-14T02:30", "America/New_York")).toEqual({ ok: false, reason: "nonexistent" });
  });
  it("rechaza una hora ambigua (fin del horario de verano)", () => {
    expect(localToUtc("2027-11-07T01:30", "America/New_York")).toEqual({ ok: false, reason: "ambiguous" });
  });
  it("rechaza formatos y fechas imposibles", () => {
    expect(localToUtc("2027-06-10 15:00", "UTC")).toEqual({ ok: false, reason: "format" });
    expect(localToUtc("2027-02-30T10:00", "UTC")).toEqual({ ok: false, reason: "format" });
    expect(localToUtc("2027-06-10T25:00", "UTC")).toEqual({ ok: false, reason: "format" });
    expect(localToUtc("", "UTC")).toEqual({ ok: false, reason: "format" });
  });
  it("rechaza zonas inválidas", () => {
    expect(localToUtc("2027-06-10T15:00", "Marte/Olimpo")).toEqual({ ok: false, reason: "timezone" });
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("utcToLocalInput / formatInZone", () => {
  it("ida y vuelta en varias zonas", () => {
    for (const tz of ["America/Bogota", "America/New_York", "Europe/Madrid", "Asia/Tokyo", "UTC"]) {
      const local = "2027-07-15T21:45";
      const r = localToUtc(local, tz);
      expect(r.ok).toBe(true);
      if (r.ok) expect(utcToLocalInput(r.iso, tz)).toBe(local);
    }
  });
  it("muestra el instante en la zona del torneo", () => {
    expect(utcToLocalInput("2027-06-10T19:00:00Z", "America/New_York")).toBe("2027-06-10T15:00");
    expect(utcToLocalInput(null, "UTC")).toBe("");
    expect(formatInZone("2027-06-10T19:00:00Z", "America/Bogota")).toMatch(/14:00/);
    expect(formatInZone(null, "UTC")).toBe("—");
  });
});
