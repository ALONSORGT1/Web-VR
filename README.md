# Web-VR

Escena WebXR con three.js basada en el ejemplo `webxr_vr_handinput_pointerdrag` de three.js (hand-tracking opcional):
20 cubos de colores que se agarran y arrastran con **hand tracking (pellizco)** o con los **controles**,
y un menu flotante con **Reiniciar** y **Salir**.

Probado como objetivo: **Meta Quest 3** (navegador Meta Quest Browser).

## Estructura

```
index.html          pagina e importmap (apunta a libs/three)
js/main.js          escena, cubos, menu e interaccion
css/style.css       estilos
libs/three/         three.js 0.187.0 en local (build + addons de WebXR usados)
serve.py            servidor local
.github/workflows/  despliegue a GitHub Pages
```

## Ejecutar en local (PC)

```
python serve.py
```
Abre http://localhost:8080 (WebXR funciona en `localhost` sin HTTPS). three.js se sirve desde `libs/three`; solo los modelos 3D de manos y controles se descargan de jsDelivr al entrar a VR.

## Probar en los Quest 3

Activa el seguimiento de manos: Ajustes > Movimiento > Seguimiento de manos y controles.

**Opcion A (recomendada): la URL publica de GitHub Pages**, que ya es HTTPS:
`https://alonsorgt1.github.io/Web-VR/`

**Opcion B: USB + adb** (para probar antes de publicar). Con el Quest en modo desarrollador y conectado por cable:
```
adb reverse tcp:8080 tcp:8080
python serve.py
```
Luego abre `http://localhost:8080` en el navegador de los lentes.

**Opcion C: HTTPS en la red local**
```
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 30 -subj "/CN=localhost"
python serve.py --https
```
Abre la URL `https://<ip-de-tu-pc>:8080` en los lentes y acepta la advertencia del certificado.

## Uso

1. Pulsa **Enter VR**.
2. Apunta a un cubo y pellizca (o aprieta el gatillo) para agarrarlo; suelta para dejarlo.
3. Apunta al boton y pellizca para **Reiniciar** (cubos al azar) o **Salir** (cierra la sesion en 2 s).

## Actualizar three.js

```
npm pack three
tar xzf three-<version>.tgz
```
Copia de `package/` a `libs/three/`: `build/three.module.js`, `build/three.core.js`, `examples/jsm/webxr/`,
`examples/jsm/loaders/GLTFLoader.js`, `examples/jsm/utils/BufferGeometryUtils.js`,
`examples/jsm/utils/SkeletonUtils.js` y `examples/jsm/libs/motion-controllers.module.js`.

## Despliegue en GitHub Pages

1. Sube el proyecto a `ALONSORGT1/Web-VR` (rama `main`).
2. En el repositorio: Settings > Pages > Source: **GitHub Actions**.
3. Cada push a `main` ejecuta `.github/workflows/pages.yml` y publica el sitio.

## Licencia y creditos

Ejemplo original y libreria: [three.js](https://threejs.org) (MIT). La licencia esta en `libs/three/LICENSE`.
