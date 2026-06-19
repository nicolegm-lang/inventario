# Inventario de Laboratorio — versión Supabase

Esta versión ya no usa Flask, SQLite, Render ni un servidor propio siempre encendido.

La arquitectura es:

```text
App web estática + Supabase Auth + Supabase PostgreSQL + Realtime
```

## Qué incluye

- Inicio de sesión con correo y contraseña.
- Registro de usuarios.
- Administrador que autoriza correos.
- Usuarios activos que pueden agregar y editar inventario.
- Registro de entradas, salidas, ajustes y bajas.
- Historial de movimientos con usuario, fecha, cantidad previa y cantidad nueva.
- Alertas de bajo stock y caducidad próxima.
- Cambio de contraseña.
- Suscripción en tiempo real a cambios de inventario y movimientos.

## Archivos importantes

```text
index.html
assets/app.js
assets/styles.css
config.js
config.example.js
sql/01_schema.sql
sql/02_promote_first_admin.sql
sql/03_demo_data.sql
```

## 1. Crear proyecto en Supabase

1. Entra a Supabase.
2. Crea un proyecto nuevo.
3. Espera a que se cree la base de datos.
4. Ve a **SQL Editor**.
5. Copia y ejecuta el contenido de:

```text
sql/01_schema.sql
```

Este archivo crea tablas, roles, políticas RLS, función de movimientos y triggers.

## 2. Configurar la app

En Supabase, ve a:

```text
Project Settings > API
```

Copia:

- Project URL
- anon public key

Abre `config.js` y pega los valores:

```js
window.LAB_CONFIG = {
  SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
  SUPABASE_ANON_KEY: 'TU_ANON_PUBLIC_KEY'
};
```

No uses la `service_role key` en esta app. Solo debe usarse la `anon public key`.

## 3. Probar localmente

Desde la carpeta del proyecto, ejecuta:

```bash
python -m http.server 8080
```

Luego abre:

```text
http://localhost:8080
```

También puedes usar la extensión **Live Server** de VS Code.

## 4. Crear el primer administrador

1. Abre la app.
2. Entra a la pestaña **Registrarme**.
3. Crea tu usuario con correo y contraseña.
4. Regresa a Supabase > SQL Editor.
5. Abre:

```text
sql/02_promote_first_admin.sql
```

6. Cambia:

```text
TU_CORREO@EJEMPLO.COM
```

por tu correo real.

7. Ejecuta el SQL.

Después vuelve a iniciar sesión. Ya debes aparecer como administrador.

## 5. Crear usuarios del laboratorio

Desde la app, como administrador:

1. Ve a **Usuarios**.
2. Autoriza el correo de la persona.
3. Elige si será `Usuario` o `Administrador`.
4. La persona entra a la app y se registra con ese correo.

Si alguien se registra sin estar autorizado, su cuenta quedará inactiva y no podrá consultar ni modificar inventario.

## 6. Publicarla sin servidor propio

Puedes subir estos archivos como sitio estático a:

- GitHub Pages
- Netlify
- Cloudflare Pages
- Vercel como sitio estático

La app no necesita backend propio porque Supabase se encarga de:

- Login
- Base de datos
- Seguridad por RLS
- Realtime

## 7. Seguridad

- No pegues la `service_role key` en `config.js`.
- Usa solo la `anon public key`.
- Las reglas de acceso están en las políticas RLS del SQL.
- Los usuarios no autorizados pueden crear una cuenta de Auth si el registro está habilitado, pero no podrán acceder al inventario si no están activos en `profiles`.
- Para producción, revisa en Supabase Auth si quieres confirmar correos antes de permitir login.

## 8. Flujo recomendado

```text
Administrador autoriza correo
        ↓
Usuario se registra con ese correo
        ↓
Trigger crea perfil activo según allowed_accounts
        ↓
Usuario entra y trabaja con inventario
        ↓
Cada movimiento queda en historial
```

## 9. Exportar respaldo

Desde Supabase puedes exportar datos con:

- Table Editor > Export CSV
- Database Backups, según el plan de Supabase
- `pg_dump`, si usas conexión PostgreSQL desde terminal

## 10. Notas

La función `register_movement` actualiza cantidad e historial en una sola operación para evitar errores cuando dos usuarios modifican el inventario casi al mismo tiempo.
