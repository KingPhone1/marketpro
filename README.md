# MarketPro

MarketPro privado de compraventa con vendedores verificados, chat en tiempo real, panel admin, orden protegida y pago vinculado con Mercado Pago.

## Ejecutar

```bash
npm install
npm start
```

Luego abre:

```text
http://localhost:3085
```

## Configuracion

Copia `.env.example` como `.env` y completa tus credenciales reales.

```bash
cp .env.example .env
```

Variables principales:

- `ADMIN_PASSWORD`
- `APP_BASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_PUBLIC_KEY`
- `MERCADO_PAGO_WEBHOOK_SECRET`

## Memoria en la nube

Para produccion usa Supabase. Crea un proyecto en Supabase, abre el editor SQL y ejecuta `supabase.sql`.
Luego agrega estas variables privadas en Render:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORE_TABLE=marketpro_store`
- `SUPABASE_STORE_ID=production`

Con esas variables activas, MarketPro guarda en la nube usuarios, aprobaciones, publicaciones, chats, ordenes, calificaciones y anuncios. Si Supabase no esta configurado, usa `data/store.json` solo como respaldo local.

## Admin privado

```text
http://localhost:3085/admin.html
```

Desde el admin puedes revisar usuarios, corroborar identidad, aprobar vendedores y ver las funciones privadas activas.

## Produccion

Lee [PRODUCCION.md](./PRODUCCION.md) antes de publicar.

La opcion recomendada para que funcione todo es Render + Supabase, porque Render mantiene el servidor Node activo y Supabase conserva la memoria aunque Render reinicie o despliegue una version nueva.
