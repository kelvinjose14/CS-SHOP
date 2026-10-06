/** Logos en Storage: solo el dueño sube a su carpeta, máximo 2 MB, PNG/SVG/WebP. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, configured, newUser } from "./helpers";

const BUCKET = "marcador-logos";
// PNG de 1 × 1 px.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
  "base64",
);

describe.skipIf(!configured)("logos en Storage", () => {
  let owner: SupabaseClient;
  let ownerId: string;
  let otherId: string;

  beforeAll(async () => {
    const user = await newUser("logos");
    owner = user.client;
    ownerId = user.id;
    otherId = (await newUser("logos-ajeno")).id;
  });

  it("el dueño sube un PNG a su carpeta y se puede ver públicamente", async () => {
    const path = `${ownerId}/partido/home-${Date.now()}.png`;
    const { error } = await owner.storage.from(BUCKET).upload(path, PNG, { contentType: "image/png" });
    expect(error).toBeNull();
    const publicUrl = owner.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const response = await fetch(publicUrl);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
  });

  it("sin sesión no se puede subir", async () => {
    const { error } = await anonClient().storage.from(BUCKET).upload(`${ownerId}/x/anon.png`, PNG, { contentType: "image/png" });
    expect(error).not.toBeNull();
  });

  it("no se puede subir a la carpeta de otro usuario", async () => {
    const { error } = await owner.storage.from(BUCKET).upload(`${otherId}/x/intruso.png`, PNG, { contentType: "image/png" });
    expect(error).not.toBeNull();
  });

  it("rechaza archivos de más de 2 MB", async () => {
    const big = Buffer.alloc(2 * 1024 * 1024 + 1, 0);
    const { error } = await owner.storage.from(BUCKET).upload(`${ownerId}/x/grande.png`, big, { contentType: "image/png" });
    expect(error).not.toBeNull();
  });

  it("rechaza formatos no permitidos", async () => {
    for (const [name, type] of [
      ["foto.jpg", "image/jpeg"],
      ["texto.txt", "text/plain"],
      ["pagina.html", "text/html"],
    ]) {
      const { error } = await owner.storage.from(BUCKET).upload(`${ownerId}/x/${name}`, PNG, { contentType: type });
      expect(error, type).not.toBeNull();
    }
  });
});
