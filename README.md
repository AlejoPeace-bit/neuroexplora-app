# NeuroExplora App — Gestión del consultorio

App web para Karen: registrar pacientes, llevar el conteo de sesiones autorizadas
(Monte Sinaí) y saber qué está listo para la cuenta de cobro.

Conectada a Supabase (PostgreSQL). Misma base que NocoDB y n8n.

## Desplegar en Vercel (igual que Anamnesis Viva)

1. Crear repo en GitHub (ej: `neuroexplora-app`) y subir estos archivos.
2. En Vercel: **Add New Project** → importar el repo.
3. Framework: **Vite** (lo detecta solo).
4. En **Environment Variables** agregar:
   - `VITE_SUPABASE_URL` = https://wuwffwvtanmwobbryfan.supabase.co
   - `VITE_SUPABASE_ANON_KEY` = (Supabase → Settings → API Keys → anon public)
5. **Deploy**.

## Antes del primer uso (una sola vez)

1. Ejecutar `SETUP_COMPLETO.sql` en Supabase SQL Editor (un solo script: tablas, seguridad, vistas y triggers).
2. Crear el usuario de Karen: Supabase → **Authentication** → **Users** →
   **Add user** → correo y contraseña de Karen → ✅ Auto Confirm User.

## Correr local (opcional)

```
npm install
cp .env.example .env   # y pegar la anon key real
npm run dev
```
