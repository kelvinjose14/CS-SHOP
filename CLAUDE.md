# CLAUDE.md (raíz del repositorio)

Este repositorio contiene **dos proyectos independientes**. Identifica primero en cuál vas a trabajar:

| Proyecto | Carpeta | Qué es | Leer primero |
|---|---|---|---|
| **CAPS Shop** | raíz (`src/`, `test/`, `docs/`, `package.json`) | App de escritorio Electron (inventario, ventas, caja) para la tienda de gorras | `README.md`, `docs/README.md`, `docs/tecnico/arquitectura.md` |
| **Sistema de Conduces** | `conduces/` | Sistema web (Next.js + Supabase) de conduces para un Grupo Económico | `conduces/CLAUDE.md`, luego `conduces/PROJECT_STATUS.md` y `conduces/docs/HANDOFF.md` |

Reglas:
- Si la tarea es sobre **conduces**, trabaja **solo** dentro de `conduces/` y sigue `conduces/CLAUDE.md`.
- No mezcles dependencias, documentación ni CHANGELOG entre ambos proyectos.
- No modifiques CAPS Shop mientras trabajas en conduces (ni al revés) sin que se pida explícitamente.
