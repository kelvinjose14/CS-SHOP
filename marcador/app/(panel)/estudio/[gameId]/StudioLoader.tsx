"use client";

import dynamic from "next/dynamic";

/** El Estudio usa cámara, lienzo y almacenamiento del navegador: se dibuja solo en el cliente. */
export const StudioLoader = dynamic(() => import("./Studio").then((m) => m.Studio), {
  ssr: false,
  loading: () => <p className="page hint">Cargando el Estudio…</p>,
});
