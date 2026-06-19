# Guía rápida de Supabase

## A. Crear proyecto

1. Entra a Supabase.
2. Crea un proyecto.
3. Guarda tu contraseña de base de datos.
4. Espera a que el proyecto esté listo.

## B. Ejecutar SQL

1. Ve a **SQL Editor**.
2. Crea una nueva consulta.
3. Pega todo el contenido de `sql/01_schema.sql`.
4. Ejecuta.

Si al final aparece un error relacionado con `supabase_realtime` porque la tabla ya fue agregada a la publicación, puedes ignorarlo o comentar esas dos líneas.

## C. Configurar Auth

En **Authentication > Providers > Email** puedes dejar correo/contraseña habilitado.

Puedes decidir si quieres confirmar correos:

- Confirmación activa: el usuario deberá confirmar por email.
- Confirmación desactivada: entra inmediatamente después de registrarse.

Para pruebas, normalmente es más cómodo desactivar confirmación. Para uso real, es mejor activarla.

## D. Configurar URL de la app

Cuando publiques el sitio, ve a:

```text
Authentication > URL Configuration
```

Agrega la URL de tu app en:

```text
Site URL
```

y, si aplica, en:

```text
Redirect URLs
```

Ejemplos:

```text
http://localhost:8080
https://inventario-lab.tudominio.com
https://usuario.github.io/lab_inventory_supabase
```

## E. Primer administrador

1. Abre la app.
2. Regístrate.
3. Ejecuta `sql/02_promote_first_admin.sql` con tu correo.
4. Cierra sesión y vuelve a entrar.

## F. Activar Realtime manualmente

Si las notificaciones en tiempo real no aparecen, ve a:

```text
Database > Replication
```

Y habilita Realtime para:

```text
items
movements
```
