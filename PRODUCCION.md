# MarketPro - Puesta en produccion

## 1. Credenciales

Copia `.env.example` como `.env` y completa tus valores reales:

```bash
cp .env.example .env
```

No subas `.env` a GitHub ni lo compartas por chat.

Variables obligatorias:

- `ADMIN_PASSWORD`: contrasena privada del panel admin.
- `HOST`: usa `0.0.0.0` en hosting publico.
- `DATA_DIR`: respaldo local. En Render puede usar `/var/data`, pero la memoria final debe estar en Supabase.
- `SUPABASE_URL`: URL del proyecto Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: clave privada service role de Supabase. No debe estar en el frontend.
- `SUPABASE_STORE_TABLE`: usa `marketpro_store`.
- `SUPABASE_STORE_ID`: usa `production`.
- `APP_BASE_URL`: dominio publico final, por ejemplo `https://marketpro.com`.
- `MERCADO_PAGO_ACCESS_TOKEN`: token privado de Mercado Pago.
- `MERCADO_PAGO_PUBLIC_KEY`: public key de Mercado Pago.
- `MERCADO_PAGO_WEBHOOK_SECRET`: secreto propio para proteger webhooks.
- `MERCADO_PAGO_CURRENCY`: moneda usada al crear preferencias, por ejemplo `USD`, `UYU`, `ARS`, etc. Debe coincidir con tu cuenta de Mercado Pago.

## 2. Mercado Pago

En el panel de desarrollador de Mercado Pago:

1. Crea o selecciona una aplicacion.
2. Copia las credenciales de produccion.
3. Configura la URL de webhook:

```text
https://tu-dominio.com/api/payments/mercadopago/webhook
```

El checkout ya no usa pagos internos ni simulados. MarketPro crea una orden protegida y deriva el cobro a Mercado Pago.

Desde el panel admin puedes entrar a **Mercado Pago vinculado** y usar **Probar preferencia real**. Si las credenciales son correctas, se crea una preferencia y aparece un link de checkout real.

## 3. Memoria en la nube

Para que usuarios, aprobaciones, publicaciones, chats, ordenes y anuncios no se borren, usa Supabase.

1. Crea un proyecto en Supabase.
2. Abre **SQL Editor**.
3. Copia y ejecuta el contenido de `supabase.sql`.
4. Copia `Project URL` como `SUPABASE_URL`.
5. Copia `service_role key` como `SUPABASE_SERVICE_ROLE_KEY`.

El servidor usa esa clave solo desde Render. Nunca la pongas en archivos publicos ni en el navegador.

## 4. Mejor opcion para que funcione todo

Para MarketPro completo usa Render, Railway, Fly.io o un VPS. Vercel no es la mejor opcion para esta app porque los chats usan WebSockets.

Este proyecto ya incluye `render.yaml`. En Render:

1. Sube el proyecto a GitHub.
2. En Render elige **New > Blueprint**.
3. Selecciona este repositorio.
4. Completa las variables marcadas como privadas:
   - `APP_BASE_URL`
   - `ADMIN_PASSWORD`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `MERCADO_PAGO_ACCESS_TOKEN`
   - `MERCADO_PAGO_PUBLIC_KEY`
   - `MERCADO_PAGO_WEBHOOK_SECRET`
5. Render va a crear un link publico tipo:

```text
https://marketpro.onrender.com
```

Cuando tengas ese link, ponlo tambien como `APP_BASE_URL`.

## 5. Arranque local

```bash
npm install
npm start
```

El proyecto tambien incluye `Procfile`, `Dockerfile` y `render.yaml`.

## 6. Seguridad minima antes de lanzar

- Usar HTTPS.
- Cambiar `ADMIN_PASSWORD`.
- Mantener `.env` fuera del repositorio.
- Probar compra real con una cuenta de prueba antes de publicar.
- Confirmar que Supabase esta activo antes de recibir usuarios reales.
