import { describe, expect, it } from "vitest";
import {
  backlogSeconds,
  coverRect,
  DEFAULT_STUDIO_SETTINGS,
  formatDuration,
  ingestUrl,
  normalizeRelayUrl,
  parseStudioSettings,
  pickMimeType,
  reconnectDelay,
  relayStatusUrl,
} from "@/lib/studio/media";

describe("formato de grabación", () => {
  it("Chrome (Android): WebM con H.264", () => {
    const chrome = new Set(["video/webm;codecs=h264,opus", "video/webm;codecs=vp8,opus", "video/webm"]);
    expect(pickMimeType((t) => chrome.has(t))).toBe("video/webm;codecs=h264,opus");
  });

  it("Safari (iPhone): MP4 con H.264 y AAC", () => {
    const safari = new Set(["video/mp4", "video/mp4;codecs=avc1.42E01F,mp4a.40.2"]);
    expect(pickMimeType((t) => safari.has(t))).toBe("video/mp4;codecs=avc1.42E01F,mp4a.40.2");
  });

  it("sin soporte devuelve null y tolera excepciones", () => {
    expect(
      pickMimeType(() => {
        throw new Error("x");
      }),
    ).toBeNull();
  });
});

describe("encuadre de la cámara en 1280 × 720", () => {
  it("cámara horizontal 16:9 llena el cuadro exacto", () => {
    expect(coverRect(1920, 1080, 1280, 720)).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
  });

  it("celular en vertical: recorta arriba y abajo, nunca deforma", () => {
    const rect = coverRect(720, 1280, 1280, 720);
    expect(rect.width).toBe(1280);
    expect(rect.height / rect.width).toBeCloseTo(1280 / 720);
    expect(rect.y).toBeLessThan(0);
  });
});

describe("ajustes del marcador en el video", () => {
  it("valores por defecto si no hay nada guardado o está dañado", () => {
    expect(parseStudioSettings(null)).toEqual(DEFAULT_STUDIO_SETTINGS);
    expect(parseStudioSettings("{no json")).toEqual(DEFAULT_STUDIO_SETTINGS);
  });

  it("acepta valores válidos y descarta los raros", () => {
    expect(parseStudioSettings(JSON.stringify({ showBoard: false, pos: "top-left", scale: 0.6 }))).toMatchObject({
      showBoard: false,
      pos: "top-left",
      scale: 0.6,
    });
    expect(parseStudioSettings(JSON.stringify({ pos: "arriba", scale: 9 }))).toMatchObject({
      pos: DEFAULT_STUDIO_SETTINGS.pos,
      scale: DEFAULT_STUDIO_SETTINGS.scale,
    });
  });
});

describe("dirección del intermediario", () => {
  it("convierte la dirección del túnel a wss y quita rutas", () => {
    expect(normalizeRelayUrl("https://abc-def.trycloudflare.com/")).toBe("wss://abc-def.trycloudflare.com");
    expect(normalizeRelayUrl(" wss://abc.trycloudflare.com/ingest ")).toBe("wss://abc.trycloudflare.com");
    expect(normalizeRelayUrl("https://abc.trycloudflare.com/estado?x=1")).toBe("wss://abc.trycloudflare.com");
  });

  it("solo permite conexiones sin cifrar en la misma computadora", () => {
    expect(normalizeRelayUrl("http://localhost:8787")).toBe("ws://localhost:8787");
    expect(normalizeRelayUrl("http://192.168.1.20:8787")).toBeNull();
    expect(normalizeRelayUrl("ws://ejemplo.com")).toBeNull();
    expect(normalizeRelayUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeRelayUrl("https://usuario:clave@ejemplo.com")).toBeNull();
  });

  it("rutas de envío y de estado", () => {
    expect(ingestUrl("wss://a.trycloudflare.com")).toBe("wss://a.trycloudflare.com/ingest");
    expect(relayStatusUrl("wss://a.trycloudflare.com")).toBe("https://a.trycloudflare.com/estado");
    expect(relayStatusUrl("ws://localhost:8787")).toBe("http://localhost:8787/estado");
  });
});

describe("reconexión y estado", () => {
  it("espera creciente hasta 10 s", () => {
    expect([0, 1, 2, 3, 4, 10].map(reconnectDelay)).toEqual([1000, 2000, 4000, 8000, 10000, 10000]);
  });

  it("segundos pendientes según la cola del navegador", () => {
    expect(backlogSeconds(2_500_000 / 8, 2_500_000)).toBe(1);
    expect(backlogSeconds(100, 0)).toBe(0);
  });

  it("duración", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(65.9)).toBe("01:05");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
});
