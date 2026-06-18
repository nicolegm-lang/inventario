# Publicar la app en internet con Render

Esta guía es para que la aplicación de inventario pueda abrirse desde cualquier red mediante una URL HTTPS, por ejemplo:

```text
https://inventario-laboratorio.onrender.com
```

## Importante

Esta versión usa SQLite. Para que los datos no se pierdan en Render, el servicio debe tener un disco persistente montado en `/var/data`, como ya está configurado en `render.yaml`.

No uses el servidor de desarrollo de Flask para internet público. En producción esta app se ejecuta con Gunicorn mediante:

```bash
gunicorn app:app
```

## Archivos incluidos para Render

- `Procfile`: comando de arranque para la app.
- `render.yaml`: configuración del servicio web, variables y disco persistente.
- `.env.example`: ejemplo de variables de entorno.
- `requirements.txt`: dependencias de Python, incluyendo Flask y Gunicorn.

## Paso 1. Subir el proyecto a GitHub

1. Entra a GitHub.
2. Crea un repositorio nuevo, por ejemplo: `inventario-laboratorio`.
3. Sube todos los archivos de esta carpeta al repositorio.

Puedes hacerlo desde la página de GitHub con **Add file > Upload files** o usando Git.

## Paso 2. Crear el servicio en Render

1. Entra a Render.
2. Selecciona **New +**.
3. Elige **Web Service**.
4. Conecta tu repositorio de GitHub.
5. Configura:

```text
Runtime: Python
Build Command: pip install -r requirements.txt
Start Command: gunicorn app:app
```

Si usas `render.yaml`, Render puede tomar gran parte de esta configuración automáticamente.

## Paso 3. Variables de entorno

Agrega estas variables:

```text
SECRET_KEY=una_clave_larga_y_segura
DATABASE_PATH=/var/data/lab_inventory.db
FLASK_DEBUG=0
```

`SECRET_KEY` debe ser una clave larga, aleatoria y privada.

## Paso 4. Disco persistente

El archivo `render.yaml` ya incluye:

```yaml
disk:
  name: lab-inventory-data
  mountPath: /var/data
  sizeGB: 1
```

Esto permite que la base de datos SQLite se guarde en:

```text
/var/data/lab_inventory.db
```

Sin disco persistente, la base de datos podría perderse cuando el servicio se reinicie o se vuelva a desplegar.

## Paso 5. Primer acceso

Cuando la app arranque por primera vez, creará automáticamente la base de datos y el usuario inicial:

```text
Correo: admin@laboratorio.local
Contraseña: admin123
```

Después de entrar, cambia la contraseña desde **Mi contraseña**.

## Paso 6. Compartir la URL

Render te dará una URL parecida a:

```text
https://inventario-laboratorio.onrender.com
```

Esa URL ya puede abrirse desde otra red, por ejemplo desde casa, universidad o celular.

Cada persona debe entrar con una cuenta creada dentro de la app.

## Recomendaciones de seguridad

- Cambia la contraseña inicial inmediatamente.
- Usa contraseñas fuertes para todas las cuentas.
- No compartas cuentas entre personas.
- Mantén `FLASK_DEBUG=0` en producción.
- Haz respaldos periódicos de la base de datos.
- Si el inventario será crítico, considera migrar después a PostgreSQL.

## Cuándo migrar a PostgreSQL

SQLite funciona bien para una primera versión o laboratorio pequeño. Conviene migrar a PostgreSQL cuando:

- Habrá muchos usuarios simultáneos.
- El inventario será crítico.
- Se requiere mejor concurrencia.
- Se necesitan respaldos automáticos más formales.
- Se desea una arquitectura más profesional.
