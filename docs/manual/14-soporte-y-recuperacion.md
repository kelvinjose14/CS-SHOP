# 14. Soporte y recuperación

**Para qué sirve:** resolver sin un técnico las situaciones graves:
- la PC principal se dañó;
- hay que cambiar de computadora;
- hay una versión nueva;
- algo falla y hay que pedir ayuda.

**Quién:** Administrador.

## 14.1 Lo que hay que tener siempre

| Qué | Dónde se configura | Por qué |
|---|---|---|
| **Copia fuera de la computadora**, diaria y con las fotos | Configuración → Copias de seguridad → **Copia fuera de esta computadora** | Si el disco de la PC principal se daña, es lo único que salva los datos |
| **Código de recuperación** del administrador, impreso y guardado fuera de la tienda | Usuarios → Código de recuperación | Si se olvida la contraseña del administrador, es la única forma de entrar sin otro administrador ([10.4](10-usuarios-y-permisos.md#104-si-se-olvida-una-contraseña)) |
| La clave de conexión anotada | Configuración → Red | Hace falta para conectar las demás computadoras |

El **Inicio** avisa si no hay copia fuera de la computadora o si pasaron **7 días** sin copia. Si la copia va a una memoria USB, déjela conectada o conéctela al menos una vez por semana: la copia se hace sola en menos de una hora.

## 14.2 La PC principal se dañó: volver a trabajar en otra computadora

Necesita la memoria USB o la carpeta de OneDrive o Google Drive con la carpeta **CAPS Shop respaldos**.

1. En la computadora nueva, instale CAPS Shop, la **misma versión** o una más nueva ([Releases](https://github.com/kelvinjose14/CS-SHOP/releases)).
2. En **Configurar esta computadora**, elija **Esta es la PC principal** y póngale un nombre.
3. Entre con `admin` / `admin123` y cambie la contraseña cuando lo pida. Es una base vacía; se reemplaza en el paso siguiente.
4. **Configuración** → **Restaurar desde copia…** → abra la carpeta **CAPS Shop respaldos** y elija el archivo `capsshop-AAAA-MM-DD.db` más reciente.
5. Confirme. El programa recupera los datos **y también las fotos**, desde la carpeta `fotos` que está al lado del archivo.
6. Entre con los usuarios y contraseñas **de la copia**.
7. **Configuración → Red:**
   - active **Permitir que otras computadoras se conecten**;
   - anote la **clave nueva**: la computadora nueva tiene otra clave.
8. En cada computadora conectada, en la pantalla de entrada, pulse **Configurar esta PC**. Elija **Buscar**, escriba la clave nueva y use **el mismo nombre que tenía**, así conserva su caja y su historial.
9. Vuelva a configurar la **copia fuera de esta computadora** en la PC nueva.

Se pierde lo que se registró después de la última copia externa. Por eso importa que la copia sea diaria.

## 14.3 Cambiar la PC principal por otra (las dos funcionan)

Sin copia externa, es más directo mover la carpeta completa ([Configuración y respaldos, 11.5](11-configuracion-y-respaldos.md#115-pasar-el-sistema-a-otra-computadora)):
- los datos, las fotos, los respaldos y la configuración de red pasan tal cual;
- la clave no cambia;
- las demás computadoras encuentran la nueva principal solas.

## 14.4 Instalar una versión nueva

1. El administrador ve en la barra de arriba **Versión X disponible**. En **Configuración → Actualizaciones** están la versión instalada, **Buscar ahora** e **Instalar la versión X**.
2. **Actualice primero la PC principal.** Hágalo con la tienda tranquila: el programa se cierra, se instala y se vuelve a abrir. Los datos no se tocan.
3. Después, cada computadora conectada:
   - Con el administrador: **Configuración → Actualizaciones → Instalar**.
   - Sin sesión: la pantalla de entrada dice **La PC principal tiene la versión X y esta computadora la Y…** y muestra **Actualizar esta PC**. Cualquiera puede pulsarlo.
4. Antes de actualizar, conviene hacer **Copiar ahora** en la copia externa.

Nada se descarga ni se instala sin que se pida. Si Windows muestra **"Windows protegió su PC"** al instalar, pulse **Más información → Ejecutar de todas formas**: el instalador todavía no está firmado.

## 14.5 Pedir ayuda al soporte

1. **Configuración → Soporte → Guardar diagnóstico…** ([11.6](11-configuracion-y-respaldos.md#116-soporte-diagnóstico-y-registro-de-errores)). En una PC conectada que no puede entrar, el enlace está en la pantalla de entrada.
2. Envíe ese archivo con:
   - qué estaba haciendo;
   - el mensaje exacto;
   - la hora y la computadora.

El diagnóstico no lleva contraseñas, la clave de conexión ni datos de clientes.

## 14.6 Problemas típicos

| Situación | Qué hacer |
|---|---|
| El Inicio dice **No hay copia fuera de esta computadora** | Configuración → Copias de seguridad → **Elegir carpeta…** (memoria USB o carpeta de OneDrive o Google Drive) |
| **No se encontró la carpeta … Si es una memoria USB, conéctela** | Conecte la memoria. Si cambió de letra (por ejemplo de E: a F:), elija la carpeta otra vez con **Cambiar carpeta…** |
| **No se puede escribir en esa carpeta** | La memoria está llena o protegida, o la carpeta es de otro usuario. Elija otra |
| **No se pudo buscar actualizaciones: no hay conexión a internet** | Normal si la PC principal no tiene internet. La tienda sigue funcionando; busque la actualización cuando haya conexión |
| **Todavía no hay versiones publicadas para actualizar** | No hay nada que instalar |
| Una PC conectada dice que la versión es distinta | [14.4](#144-instalar-una-versión-nueva), paso 3 |
| La principal no aparece al pulsar **Buscar** | [Varias computadoras, 13.8](13-varias-computadoras.md#138-errores-comunes): firewall de Windows (**Redes privadas**) o dirección |
| **La fecha y hora de esta computadora no coinciden…** | Corrija la fecha y hora de Windows |
| Se olvidó la contraseña del único administrador | En la PC principal, pantalla de entrada → **¿Olvidó la contraseña del administrador?** con el código de recuperación (14.1) |
