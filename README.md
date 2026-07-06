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
- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_PUBLIC_KEY`
- `MERCADO_PAGO_WEBHOOK_SECRET`

## Admin privado

```text
http://localhost:3085/admin.html
```

Desde el admin puedes revisar usuarios, corroborar identidad, aprobar vendedores y ver las funciones privadas activas.

## Produccion

Lee [PRODUCCION.md](./PRODUCCION.md) antes de publicar.

La opcion recomendada para que funcione todo es Render con `render.yaml`, porque mantiene el servidor Node activo, soporta chats por WebSocket y permite disco persistente para la memoria.
