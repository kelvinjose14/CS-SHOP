# CLAUDE.md (raíz del repositorio CS-SHOP)

Este repositorio contiene **dos programas independientes**. Identifica primero en cuál vas a trabajar:

| Programa | Carpeta | Qué es | Leer primero |
|---|---|---|---|
| **CAPS Shop** | raíz (`src/`, `test/`, `docs/`, `package.json`) | App de escritorio Electron (inventario, ventas, caja) de la tienda de gorras | `README.md`, `docs/README.md`, `docs/tecnico/arquitectura.md` |
| **Sistema de Conduces** | `conduces/` | Sistema web interno (Next.js + PostgreSQL) de conduces de un Grupo Económico | `conduces/CLAUDE.md`, luego `conduces/PROJECT_STATUS.md` y `conduces/docs/HANDOFF.md` |

Reglas:
- Son programas distintos: no compartas código, dependencias, documentación ni CHANGELOG entre ellos.
- Si la tarea es sobre conduces, trabaja solo dentro de `conduces/` y sigue `conduces/CLAUDE.md`.
- No modifiques un programa mientras trabajas en el otro, salvo que se pida explícitamente.
- El repositorio es **público**: nunca subas datos reales, respaldos ni secretos.
