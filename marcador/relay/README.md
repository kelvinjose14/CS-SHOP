# Intermediario del Estudio en vivo

Recibe el video del Estudio (celular) y lo reenvía a YouTube por **RTMPS** con ffmpeg. Corre en tu computadora.

```bash
npm install          # una vez
npm run configurar   # clave de YouTube y tu correo → .env (privado, fuera de git)
npm start            # servidor + túnel HTTPS gratuito + código QR para el celular
```

Instrucciones completas, problemas frecuentes y qué está probado: [README del marcador, sección 6](../README.md#6-transmitir-a-youtube-desde-el-celular-estudio-en-vivo).

| Variable (`.env`) | Para qué |
|---|---|
| `YOUTUBE_STREAM_KEY` | Clave de transmisión de YouTube Studio. **Secreta.** |
| `YOUTUBE_INGEST_URL` | Servidor RTMPS de YouTube (por defecto `rtmps://a.rtmps.youtube.com/live2`). |
| `ALLOWED_EMAILS` | Correos que pueden transmitir (separados por comas). |
| `STUDIO_URL` | Dirección del marcador; define el enlace del QR y el origen permitido. |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Para comprobar la sesión. Solo la clave **pública**. |
| `PORT`, `TUNNEL` | Puerto local (8787) y túnel (`quick` o `off`). |

Pruebas: `npm test`.
