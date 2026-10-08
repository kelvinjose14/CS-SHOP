/**
 * Arma el cuadro que recibe YouTube: la cámara (recortada para llenar 1280 × 720)
 * y encima el marcador, en la posición y tamaño elegidos.
 * El lienzo es también la vista previa: lo que se ve es exactamente lo que sale.
 */
import { computePlacement, type PlacementOptions } from "@/components/scoreboard/placement";
import { BOARD_HEIGHT, BOARD_WIDTH } from "@/components/scoreboard/Scoreboard";
import { BOARD_PAD, PADDED_HEIGHT, PADDED_WIDTH } from "./drawScoreboard";
import { coverRect, VIDEO } from "./media";

export class Compositor {
  private readonly ctx: CanvasRenderingContext2D;
  private video: HTMLVideoElement | null = null;
  private board: HTMLCanvasElement | null = null;
  private placement: PlacementOptions | null = null;
  private frame = 0;
  private last = 0;
  private running = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.width = VIDEO.width;
    canvas.height = VIDEO.height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D no disponible");
    this.ctx = ctx;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, VIDEO.width, VIDEO.height);
  }

  setVideo(video: HTMLVideoElement | null) {
    this.video = video;
  }

  /** `placement` null oculta el marcador. */
  setBoard(board: HTMLCanvasElement | null, placement: PlacementOptions | null) {
    this.board = board;
    this.placement = placement;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const tick = (now: number) => {
      if (!this.running) return;
      this.frame = requestAnimationFrame(tick);
      // 30 fps: se salta un cuadro de pantalla de cada dos en pantallas de 60 Hz.
      if (now - this.last < 1000 / VIDEO.fps - 4) return;
      this.last = now;
      this.draw();
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  captureStream(): MediaStream {
    return this.canvas.captureStream(VIDEO.fps);
  }

  draw() {
    const { ctx } = this;
    const video = this.video;
    if (video && video.readyState >= 2 && video.videoWidth > 0) {
      const rect = coverRect(video.videoWidth, video.videoHeight, VIDEO.width, VIDEO.height);
      ctx.drawImage(video, rect.x, rect.y, rect.width, rect.height);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, VIDEO.width, VIDEO.height);
    }
    if (this.board && this.placement) {
      const place = computePlacement(VIDEO.width, VIDEO.height, BOARD_WIDTH, BOARD_HEIGHT, this.placement);
      const pad = BOARD_PAD * place.factor;
      ctx.drawImage(this.board, place.left - pad, place.top - pad, PADDED_WIDTH * place.factor, PADDED_HEIGHT * place.factor);
    }
  }
}
