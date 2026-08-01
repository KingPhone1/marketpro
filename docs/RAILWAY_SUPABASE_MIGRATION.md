# Migracion reversible: Render a Railway + Supabase

## Estado actual

- Render continua siendo produccion y rollback.
- Supabase almacena el documento de estado y archivos.
- Railway no debe recibir trafico ni DNS hasta superar staging.

## Staging

1. Crear un proyecto Supabase separado para staging.
2. Ejecutar `db/migrations/001_marketpro_core.sql` en ese proyecto.
3. Configurar buckets privados y publicos separados.
4. Copiar `.env.staging.example` a `.env.staging` y completar solo secretos de staging.
5. Ejecutar `npm run migration:export` y `npm run migration:verify`.
6. Con `MIGRATION_TARGET=staging`, ejecutar `npm run migration:import:staging`.
7. Crear servicio Railway desde este repositorio usando `railway.toml`.
8. Configurar las mismas variables privadas de staging y el health check `/healthz`.
9. Confirmar `/healthz`, `/readyz`, WebSocket, subida, chat y webhook de prueba.

## Corte de produccion

1. Crear backup y export nuevos inmediatamente antes del corte.
2. Repetir importacion en el proyecto Supabase de produccion solo despues de validar staging.
3. Cambiar `APP_BASE_URL` y webhook de Mercado Pago.
4. Hacer un cambio DNS gradual con Cloudflare y monitorear errores, WebSockets y pagos.
5. Mantener Render activo durante el periodo de observacion acordado.

## Rollback

1. Revertir DNS al servicio Render.
2. Restaurar el webhook anterior de Mercado Pago.
3. Mantener Railway sin trafico para diagnostico.
4. Restaurar el backup Supabase o local validado si hay inconsistencia.

No se deben borrar datos, buckets, secretos ni el servicio Render hasta verificar los conteos y flujos de produccion.
