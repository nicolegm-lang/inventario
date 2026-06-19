# Publicar la app como sitio estático

Esta versión no necesita Flask, Gunicorn, Render Web Service ni VPS.
Solo necesitas publicar los archivos estáticos y conectar Supabase.

## Opción 1: GitHub Pages

1. Crea un repositorio en GitHub.
2. Sube estos archivos.
3. Asegúrate de que `config.js` tenga tu Project URL y anon public key.
4. Ve a **Settings > Pages**.
5. Selecciona la rama `main` y carpeta `/root`.
6. Guarda.
7. GitHub te dará una URL parecida a:

```text
https://usuario.github.io/nombre-repositorio
```

Agrega esa URL en Supabase:

```text
Authentication > URL Configuration > Site URL
```

## Opción 2: Netlify

1. Entra a Netlify.
2. Arrastra la carpeta del proyecto a **Deploy manually**.
3. Netlify te dará una URL.
4. Agrega esa URL en Supabase Auth URL Configuration.

## Opción 3: Cloudflare Pages

1. Sube el proyecto a GitHub.
2. En Cloudflare Pages, conecta el repositorio.
3. Build command: vacío.
4. Output directory: `/`.
5. Publica.
6. Agrega la URL en Supabase.

## Importante

Aunque la app sea estática, la seguridad no depende de ocultar el JavaScript.
La seguridad real está en las políticas RLS de Supabase.
Por eso es importante haber ejecutado `sql/01_schema.sql` completo.
