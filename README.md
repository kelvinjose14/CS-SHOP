# CAPS Shop

Sistema de inventario, compras, ventas, caja y contabilidad para **CAPS._.SHOP · Tienda de Gorras**. Es una aplicación de escritorio para Windows que funciona sin internet, en una computadora o en varias de la misma red.

## Estado

**Versión publicada: 1.1.0**, para el piloto en la tienda ([cambios](CHANGELOG.md)):
- **Varias computadoras en red:** una PC principal guarda los datos y las demás se conectan a ella, cada una con su caja ([manual](docs/manual/13-varias-computadoras.md)).
- **Funciones:** están todas las del pedido original (102 de 103 requisitos cumplen) y las 9 nuevas: saldos iniciales, depósito al banco, aportes del dueño, importar desde Excel, etiquetas, recibo directo a la impresora y recuperación de la contraseña ([Requisitos](docs/producto/requisitos.md)).
- **Copias y actualizaciones:** copia diaria fuera de la PC (USB o nube) con las fotos, y actualizaciones con aviso ([Soporte y recuperación](docs/manual/14-soporte-y-recuperacion.md)).
- **Todavía no está en producción:** falta el piloto en la tienda con Windows 10/11 y datos reales, y la firma del cliente (O6). Al aceptarse, sale la 2.0.0. El instalador todavía no está firmado (hace falta comprar un certificado). El orden de trabajo está en [Objetivos](docs/producto/objetivos.md).

## Instalar

1. Descargue `CAPS-Shop-Setup-X.Y.Z.exe` de [Releases](https://github.com/kelvinjose14/CS-SHOP/releases).
2. Ejecútelo. Windows puede mostrar "Windows protegió su PC" porque el instalador no está firmado: pulse **Más información** → **Ejecutar de todas formas**.
3. Abra **CAPS Shop** desde el escritorio. La primera vez se elige si es la **PC principal** o si se conecta a una ([Varias computadoras](docs/manual/13-varias-computadoras.md)).
4. Entre con un usuario inicial. El sistema pide cambiar la contraseña la primera vez.

| Usuario | Contraseña inicial | Perfil |
|---|---|---|
| `admin` | `admin123` | Administrador |
| `vendedor` | `vendedor123` | Vendedor |

Los pasos siguientes están en [Primeros pasos](docs/manual/01-primeros-pasos.md).

## Documentación

Toda la documentación está en [`docs/`](docs/README.md), en español:

| Para | Dónde |
|---|---|
| **Dueño y vendedor** | [Manual de uso](docs/README.md#manual-de-uso): 14 páginas con capturas |
| **Decidir qué se construye** | [Requisitos](docs/producto/requisitos.md), [Reglas de negocio](docs/producto/reglas-de-negocio.md), [Objetivos](docs/producto/objetivos.md), [Decisiones](docs/producto/decisiones.md) |
| **Piloto en la tienda** | [Plan del piloto](docs/piloto/README.md), [Capacitación](docs/piloto/capacitacion.md), [Bitácora](docs/piloto/bitacora.md), [Lista de aceptación](docs/piloto/aceptacion.md) |
| **Desarrolladores** | [Arquitectura](docs/tecnico/arquitectura.md), [Red](docs/tecnico/red.md), [Modelo de datos](docs/tecnico/modelo-de-datos.md), [Desarrollo y publicación](docs/tecnico/desarrollo-y-publicacion.md) |

## Desarrollo

```bash
npm install
npm start     # abre la aplicación
npm test      # pruebas de lógica, migración, respaldos, permisos, red e importación
npm run test:ui    # pruebas de interfaz con la app real
npm run test:perf  # rendimiento con 3 años de datos
```

Cómo compilar el instalador y publicar una versión: [Desarrollo y publicación](docs/tecnico/desarrollo-y-publicacion.md).
