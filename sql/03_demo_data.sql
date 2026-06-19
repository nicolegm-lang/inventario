-- Opcional: datos de prueba.
-- Ejecutar después de tener un usuario admin activo.

insert into public.items (name, category, description, quantity, unit, min_stock, location, lot, expiration_date, provider, status)
values
('Etanol absoluto', 'Reactivo', 'Uso general de laboratorio', 1000, 'ml', 250, 'Almacén químico / Estante A', 'ET-2026-01', current_date + interval '180 days', 'Proveedor demo', 'disponible'),
('Guantes de nitrilo', 'Consumible', 'Caja mediana', 8, 'cajas', 3, 'Almacén general', 'GN-M-01', null, 'Proveedor demo', 'disponible'),
('Buffer PBS', 'Solución preparada', 'pH 7.4', 500, 'ml', 100, 'Refrigerador 1', 'PBS-001', current_date + interval '25 days', 'Preparación interna', 'disponible')
on conflict do nothing;
