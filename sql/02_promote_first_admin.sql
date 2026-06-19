-- Después de ejecutar 01_schema.sql:
-- 1) Abre la app.
-- 2) Registra tu primer usuario.
-- 3) Cambia el correo de abajo por el correo con el que te registraste.
-- 4) Ejecuta este SQL para convertirlo en administrador activo.

update public.profiles
set role = 'admin', active = true
where email = lower('TU_CORREO@EJEMPLO.COM');

insert into public.allowed_accounts (email, name, role, active)
values (lower('TU_CORREO@EJEMPLO.COM'), 'Administrador inicial', 'admin', true)
on conflict (email) do update set role = 'admin', active = true;
