# CAPS Shop

Sistema de inventario, compras, ventas, caja y contabilidad para **CAPS._.SHOP · Tienda de Gorras**. Es una aplicación de escritorio para Windows que funciona sin internet.

## Estado

**Versión 1.0.0** ([cambios](CHANGELOG.md)):
- **Funciones:** están todas las del pedido original. Cumplen 99 de 102 requisitos ([Requisitos](docs/producto/requisitos.md)).
- **Límite:** funciona en **una sola computadora**. La tienda trabajará con varias computadoras en red, así que todavía **no está lista para producción**.
- **Pendiente:** lo que falta y en qué orden se hará está en [Objetivos](docs/producto/objetivos.md).

## Instalar (una computadora)

1. Descargue `CAPS-Shop-Setup-X.Y.Z.exe` de [Releases](https://github.com/kelvinjose14/CS-SHOP/releases).
2. Ejecútelo. Windows puede mostrar "Windows protegió su PC" porque el instalador no está firmado: pulse **Más información** → **Ejecutar de todas formas**.
3. Abra **CAPS Shop** desde el escritorio y entre con un usuario inicial. El sistema pide cambiar la contraseña la primera vez.

| Usuario | Contraseña inicial | Perfil |
|---|---|---|
| `admin` | `admin123` | Administrador |
| `vendedor` | `vendedor123` | Vendedor |

Los pasos siguientes están en [Primeros pasos](docs/manual/01-primeros-pasos.md).

## Documentación

Toda la documentación está en [`docs/`](docs/README.md), en español:

| Para | Dónde |
|---|---|
| **Dueño y vendedor** | [Manual de uso](docs/README.md#manual-de-uso): 12 páginas con capturas |
| **Decidir qué se construye** | [Requisitos](docs/producto/requisitos.md), [Reglas de negocio](docs/producto/reglas-de-negocio.md), [Objetivos](docs/producto/objetivos.md), [Decisiones](docs/producto/decisiones.md) |
| **Desarrolladores** | [Arquitectura](docs/tecnico/arquitectura.md), [Modelo de datos](docs/tecnico/modelo-de-datos.md), [Desarrollo y publicación](docs/tecnico/desarrollo-y-publicacion.md) |

## Desarrollo

```bash
npm install
npm start     # abre la aplicación
npm test      # pruebas del núcleo
```

Cómo compilar el instalador y publicar una versión: [Desarrollo y publicación](docs/tecnico/desarrollo-y-publicacion.md).
