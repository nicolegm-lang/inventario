# Publicar la app fuera de la red local

La app puede usarse fuera de la red del laboratorio de dos formas principales.

## Opción recomendada si quieres privacidad: Tailscale

Esta opción no publica la app a todo internet. Cada usuario autorizado instala Tailscale y entra por una red privada segura.

Ventajas:

- No necesitas abrir puertos del módem/router.
- No expones la app públicamente.
- Puedes controlar qué usuarios/dispositivos acceden.
- Es una buena opción para laboratorios pequeños o medianos.

Flujo general:

1. Instalar Tailscale en la computadora o servidor donde corre la app.
2. Instalar Tailscale en las laptops/celulares de los usuarios autorizados.
3. Iniciar la app:

```bash
python app.py
```

4. Los usuarios entran usando la IP o nombre de Tailscale del servidor, por ejemplo:

```text
http://NOMBRE-DEL-SERVIDOR:5000
```

o:

```text
http://100.x.x.x:5000
```

## Opción recomendada si quieres URL pública: nube con HTTPS

Esta opción publica la app en internet con una URL como:

```text
https://inventario-laboratorio.onrender.com
```

Para esto conviene usar un proveedor como Render, Railway, Fly.io, Google Cloud Run, Azure App Service o un VPS.

Esta versión ya incluye archivos útiles para despliegue:

```text
Procfile
render.yaml
.env.example
```

También incluye `gunicorn` en `requirements.txt`, porque Flask recomienda usar un servidor WSGI para producción y no el servidor de desarrollo.

## Despliegue en Render, forma general

1. Sube esta carpeta a un repositorio de GitHub.
2. En Render crea un nuevo **Web Service** conectado al repositorio.
3. Usa estos comandos:

```bash
Build Command:
pip install -r requirements.txt

Start Command:
gunicorn app:app
```

4. Define estas variables de entorno:

```text
SECRET_KEY=una_clave_larga_y_segura
DATABASE_PATH=/var/data/lab_inventory.db
FLASK_DEBUG=0
```

5. Agrega un disco persistente montado en:

```text
/var/data
```

Esto es importante porque la app usa SQLite. Sin disco persistente, una plataforma en nube podría borrar la base de datos al reiniciar o redesplegar.

## Recomendación para uso serio

Para una versión más formal con varios usuarios y uso continuo, lo más recomendable es migrar la base de datos de SQLite a PostgreSQL.

SQLite está bien para un MVP o laboratorio pequeño, pero para producción sería mejor:

- PostgreSQL.
- Respaldos automáticos.
- HTTPS obligatorio.
- Dominio propio.
- Recuperación de contraseñas.
- Bitácora/auditoría más robusta.
- Políticas de acceso por usuario.

## Opción no recomendada: abrir un puerto en el router

Técnicamente podrías abrir el puerto 5000 del router y usar DDNS, pero no es lo ideal porque expones directamente la app y el servidor.

Si se hace, debería ser con:

- HTTPS.
- Reverse proxy como Nginx o Caddy.
- Contraseñas fuertes.
- Firewall.
- Actualizaciones constantes.
- Backups.

Para este proyecto, es mejor Tailscale o nube.
