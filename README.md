# Inventario de Laboratorio

Aplicación web MVP para administrar inventario de laboratorio con usuarios, roles, movimientos y bitácora.

## Funciones incluidas

- Inicio de sesión con cuenta.
- Dos roles:
  - **admin**: puede crear/desactivar cuentas y también modificar inventario.
  - **usuario**: puede consultar, agregar y modificar inventario, registrar entradas, salidas, ajustes y bajas.
- Inventario con:
  - nombre,
  - categoría,
  - descripción,
  - cantidad,
  - unidad,
  - ubicación,
  - lote,
  - fecha de caducidad,
  - stock mínimo,
  - proveedor,
  - estado.
- Historial de movimientos por producto y general.
- Alertas visuales de bajo stock y caducidad próxima.
- Aviso automático cuando hay cambios recientes en el inventario.

## Requisitos

- Python 3.10 o superior.

## Instalación en Windows

Desde la carpeta del proyecto:

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py initdb
python app.py
```

Después abre en el navegador:

```text
http://127.0.0.1:5000
```

## Instalación en Linux / macOS

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py initdb
python app.py
```

Después abre:

```text
http://127.0.0.1:5000
```

## Usuario inicial

Al inicializar la base de datos se crea una cuenta administrativa:

```text
Correo: admin@laboratorio.local
Contraseña: admin123
```

Cambia esa contraseña antes de usar la aplicación en un entorno real.

## Acceso desde otras computadoras del laboratorio

Si la computadora donde corre la app está en la misma red del laboratorio, inicia la app y entra desde otro equipo usando la IP de la computadora servidor:

```text
http://IP_DEL_SERVIDOR:5000
```

Ejemplo:

```text
http://192.168.1.50:5000
```

## Acceso desde fuera del laboratorio

Para que la app no dependa de estar en la misma red, revisa el archivo:

```text
DEPLOYMENT.md
```

Ahí se incluyen dos rutas recomendadas:

2. **Nube con HTTPS**: despliegue en un servicio como Render, Railway, Fly.io, Google Cloud Run, Azure App Service o un VPS.

Esta versión ya incluye archivos para despliegue básico:

```text
Procfile
render.yaml
.env.example
```

## Notas importantes para producción

Esta versión usa SQLite para que sea fácil de probar. Para uso real con muchos usuarios o publicación permanente en internet, lo ideal es migrar a PostgreSQL y desplegar en un servidor o nube.

También se recomienda:

- Cambiar `SECRET_KEY` por una variable de entorno segura.
- Usar HTTPS.
- Hacer respaldos automáticos de la base de datos.
- Agregar recuperación de contraseñas.
- Definir políticas de respaldo y auditoría.

## Estructura del proyecto

```text
lab_inventory_app/
├── app.py
├── requirements.txt
├── README.md
├── DEPLOYMENT.md
├── Procfile
├── render.yaml
├── .env.example
├── templates/
│   ├── base.html
│   ├── login.html
│   ├── index.html
│   ├── item_form.html
│   ├── item_detail.html
│   ├── movements.html
│   ├── users.html
│   └── user_form.html
└── static/
    └── styles.css
```


## Acceso desde otra red / internet

Para que alguien pueda entrar desde fuera de la red local, no basta con correr `python app.py` en tu computadora. Debes publicar la app en una nube o servidor.

La opción recomendada sin VPN es **Render**. Revisa el archivo:

```text
RENDER_DEPLOY.md
```

El proyecto ya incluye:

```text
Procfile
render.yaml
.env.example
```

Estos archivos permiten ejecutar la app con Gunicorn y guardar la base de datos en una ruta persistente.

La URL final se verá parecida a:

```text
https://inventario-laboratorio.onrender.com
```

Una vez publicada, los usuarios podrán entrar desde cualquier red con su cuenta de la aplicación.
