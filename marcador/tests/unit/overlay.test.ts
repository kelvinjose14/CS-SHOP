import { describe, expect, it } from "vitest";
import { computePlacement, parsePlacement } from "@/components/scoreboard/placement";
import { contrastRatio, readableTextOn } from "@/lib/game/colors";
import { assertPublicKey } from "@/lib/supabase/env";
import { safeNext } from "@/lib/safe-next";

const W = 1600;
const H = 220;

describe("escalado y posición del overlay", () => {
  it("lee ?scale, ?pos y ?margin con valores seguros", () => {
    expect(parsePlacement({})).toEqual({ scale: 1, pos: "bottom-center", margin: 40 });
    expect(parsePlacement({ scale: "0.8", pos: "top-left", margin: "10" })).toEqual({ scale: 0.8, pos: "top-left", margin: 10 });
    expect(parsePlacement({ scale: "abc", pos: "arriba" })).toEqual({ scale: 1, pos: "bottom-center", margin: 40 });
    expect(parsePlacement({ scale: "-2" }).scale).toBe(1);
  });

  it("en 1920 × 1080 a escala 1 mide 1600 × 220 y queda abajo al centro", () => {
    const p = computePlacement(1920, 1080, W, H, parsePlacement({}));
    expect(p.factor).toBe(1);
    expect(p.left).toBe(160);
    expect(p.top).toBe(1080 - 220 - 40);
  });

  it("?scale=0.8&pos=top-left", () => {
    const p = computePlacement(1920, 1080, W, H, parsePlacement({ scale: "0.8", pos: "top-left" }));
    expect(p.factor).toBeCloseTo(0.8);
    expect([p.left, p.top]).toEqual([40, 40]);
  });

  it("en 1280 × 720 ocupa la misma proporción del cuadro", () => {
    const p = computePlacement(1280, 720, W, H, parsePlacement({}));
    expect(p.width / 1280).toBeCloseTo(1600 / 1920);
  });

  it.each([
    [1920, 1080, "3"],
    [800, 1080, "1"],
    [1920, 200, "1"],
    [375, 667, "2"],
  ])("nunca se sale del cuadro ni se deforma (%i × %i, scale %s)", (vw, vh, scale) => {
    const p = computePlacement(vw, vh, W, H, parsePlacement({ scale, pos: "bottom-right" }));
    expect(p.width / p.height).toBeCloseTo(W / H);
    expect(p.left).toBeGreaterThanOrEqual(0);
    expect(p.top).toBeGreaterThanOrEqual(0);
    expect(p.left + p.width).toBeLessThanOrEqual(vw + 0.5);
    expect(p.top + p.height).toBeLessThanOrEqual(vh + 0.5);
  });
});

describe("contraste", () => {
  it("con los colores de ejemplo el texto supera 4.5:1", () => {
    for (const bg of ["#0B0D12", "#FFFFFF", "#FACC15", "#1E3A8A", "#14B8C4"]) {
      expect(contrastRatio(bg, readableTextOn(bg))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("con cualquier fondo (peor caso: gris medio) el texto supera 4.4:1", () => {
    // El texto del marcador es grande y en negrita: WCAG pide 3:1 para texto grande.
    for (let v = 0; v <= 255; v += 1) {
      const hex = v.toString(16).padStart(2, "0");
      const bg = `#${hex}${hex}${hex}`;
      expect(contrastRatio(bg, readableTextOn(bg))).toBeGreaterThanOrEqual(4.4);
    }
  });
});

// Claves falsas armadas en tiempo de ejecución: ninguna clave real (ni de demostración) queda en el código.
const fakeJwt = (role: string) =>
  ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", Buffer.from(JSON.stringify({ role })).toString("base64url"), "firma"].join(".");
const fakeKey = (kind: string) => ["sb", kind, "ejemploDePrueba0123456789"].join("_");

describe("claves de Supabase", () => {
  it("acepta la clave publishable o anon", () => {
    expect(() => assertPublicKey(fakeKey("publishable"))).not.toThrow();
    expect(() => assertPublicKey(fakeJwt("anon"))).not.toThrow();
  });

  it("rechaza la clave secreta o service_role en el navegador", () => {
    expect(() => assertPublicKey(fakeKey("secret"))).toThrow(/SECRETA/);
    expect(() => assertPublicKey(fakeJwt("service_role"))).toThrow(/service_role/);
  });
});

describe("redirección después del login", () => {
  it("solo permite rutas internas", () => {
    expect(safeNext("/control/abc")).toBe("/control/abc");
    expect(safeNext("https://malo.example")).toBe("/control");
    expect(safeNext("//malo.example")).toBe("/control");
    expect(safeNext(undefined)).toBe("/control");
  });
});
