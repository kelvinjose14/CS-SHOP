# Preguntas abiertas para el cliente

Cuando se responda una pregunta: mover la respuesta a la regla correspondiente (`BUSINESS_RULES.md`,
`DECISIONS.md`, etc.), marcarla aquí como **RESPONDIDA** con la fecha y el lugar donde quedó documentada.

| # | Pregunta | Propuesta por defecto | Bloquea | Estado |
|---|---|---|---|---|
| Q1 | ¿El sistema se queda en `conduces/` dentro de CS-SHOP o se mueve a un repositorio propio? | Repositorio propio. | Fase 1 | **RESPONDIDA 2026-09-30**: programa totalmente nuevo, aparte de CAPS Shop → repositorio propio `sistema-conduces` (ADR-013). Pendiente: que el cliente cree el repo y dé acceso. |
| Q2 | ¿Dónde se aloja? | — | Fase 7 | **RESPONDIDA 2026-09-30**: todo con herramientas gratuitas, uso interno → PostgreSQL autogestionado + Docker Compose (ADR-014, ADR-018). |
| Q2b | ¿Qué equipo será el servidor (mini PC/PC de la oficina principal, o VM gratuita en la nube)? ¿Hay sucursales que necesiten acceso desde fuera de la red local? | PC/mini PC en la oficina principal con UPS; Cloudflare Tunnel para sucursales. | Fase 7 | Abierta |
| Q3 | Lista de empresas del grupo: nombre comercial, razón social, RNC, dirección, teléfonos, correo, logo y **prefijo** de cada una. ¿"MILADYS RODRIGUEZ" es una empresa emisora o un punto comercial? | Se cargan desde la pantalla Empresas; nada hardcodeado. | Fase 2 (datos) | Abierta |
| Q4 | Foto/PDF del conduce actual impreso y 5–10 Excel históricos de muestra. | — | Fase 4 y 6 | Abierta |
| Q5 | Permisos del OPERADOR: ¿puede **recibir**, **anular**, **exportar**, **ver reportes**, **crear puntos comerciales/productos**, descartar borradores de otros? | Recibir: sí. Anular, exportar, reportes, catálogos: no. Descartar: solo los propios. | Fase 1–3 | Abierta |
| Q6 | ¿Un conduce emitido puede corregirse? | No: anular + duplicar (RN-06). | Fase 3 | Abierta |
| Q7 | ¿`NS-710` y `NS-0710` son el mismo número? | Sí, mismo prefijo + valor = mismo número (RN-03.4). | Fase 2 | Abierta |
| Q8 | ¿Dos empresas pueden usar el mismo prefijo? | No recomendado; el sistema avisará. | Fase 2 | Abierta |
| Q9 | ¿Cantidades con decimales (2.5 galones)? | Sí, hasta 3 decimales. | Fase 2 | Abierta |
| Q10 | ¿Se permite emitir con fecha anterior a hoy? ¿Cuántos días? | Sí, hasta 30 días; nunca futura. | Fase 2 | Abierta |
| Q11 | ¿La impresión muestra la columna UNIDAD o "CANTIDAD \| DESCRIPCIÓN" como hoy? | Configurable por empresa; por defecto como el formato actual. | Fase 4 | Abierta |
| Q12 | Firma: ¿solo en papel, o también adjuntar escaneo/foto del conduce firmado o firma digital en pantalla? | Papel ahora; adjuntar escaneo como mejora posterior. | — | Abierta |
| Q13 | Puntos comerciales y productos: ¿por empresa o compartidos por todo el grupo? | Ambos (campo empresa opcional). | Fase 2 | Abierta |
| Q14 | ¿Se empezará a emitir en el sistema antes de importar los históricos? | No: importar primero y confirmar la secuencia (RN-13). | Fase 6 | Abierta |
| Q15 | Zona horaria `America/Santo_Domingo` y formato de fecha `dd/mm/aaaa`. | Sí. | — | Abierta |
