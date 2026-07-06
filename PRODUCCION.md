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
- `DATA_DIR`: carpeta persistente de memoria. En Render usa `/var/data`.
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

## 3. Mejor opcion para que funcione todo

Para MarketPro completo usa Render, Railway, Fly.io o un VPS. Vercel no es la mejor opcion para esta app porque los chats usan WebSockets y la memoria necesita disco persistente.

Este proyecto ya incluye `render.yaml`. En Render:

1. Sube el proyecto a GitHub.
2. En Render elige **New > Blueprint**.
3. Selecciona este repositorio.
4. Completa las variables marcadas como privadas:
   - `APP_BASE_URL`
   - `ADMIN_PASSWORD`
   - `MERCADO_PAGO_ACCESS_TOKEN`
   - `MERCADO_PAGO_PUBLIC_KEY`
   - `MERCADO_PAGO_WEBHOOK_SECRET`
5. Render va a crear un link publico tipo:

```text
https://marketpro.onrender.com
```

Cuando tengas ese link, ponlo tambien como `APP_BASE_URL`.

## 4. Arranque local

```bash
npm install
npm start
```

El proyecto tambien incluye `Procfile`, `Dockerfile` y `render.yaml`.

## 5. Seguridad minima antes de lanzar

- Usar HTTPS.
- Cambiar `ADMIN_PASSWORD`.
- Mantener `.env` fuera del repositorio.
- Probar compra real con una cuenta de prueba antes de publicar.
- Configurar backups de `data/store.json` o migrar a una base de datos real.
