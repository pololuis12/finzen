# 💸 FinZen — Finanzas personales (iOS · Android · Web)

App de finanzas personales con **un solo código** para las tres plataformas (Expo + React Native Web)
y **un solo backend** (Supabase). Móvil y web comparten la misma base de datos, así que todo se
sincroniza automáticamente.

## Qué incluye

- **Ingresos y egresos** con tipo de egreso: **fijo, normal, casual**.
- **Cuentas / bancos** con saldo calculado en tiempo real (incluye transferencias).
- **Balance mensual** automático (ingresos − egresos, neto y desglose por tipo).
- **Deudas**: personas que me deben / a las que debo, con total y opción de "saldar".
- **Inversiones**: portafolio con monto invertido vs. valor actual y rentabilidad.
- **Asistente IA** que lee tus datos reales (vía Supabase Edge Function + Claude) y aconseja.
- **Aislamiento por usuario (RLS)**: ningún usuario puede ver los datos de otro. Garantizado en la
  base de datos, no solo en la app.

## Arquitectura (por qué así)

Pediste app iOS **y** Android **y** web que se comuniquen entre sí. En lugar de mantener tres
proyectos, esto usa **Expo Router (React Native + React Native Web)**: el mismo código compila a
las tres. Todos apuntan al **mismo proyecto Supabase** (Postgres + Auth + Edge Functions), así que
la "comunicación entre app y web" es simplemente la base de datos compartida.

```
Expo (una base de código)
 ├─ iOS  ┐
 ├─ Android  ├──►  Supabase  (Postgres + RLS + Auth + Edge Function IA)  ──►  Claude API
 └─ Web  ┘
```

---

## Puesta en marcha

### 1) Backend (Supabase)
1. Crea un proyecto gratis en https://supabase.com
2. **SQL Editor → New query**, pega todo `supabase/schema.sql` y ejecuta. Crea tablas, RLS,
   la vista de saldos y la función `monthly_summary`.
3. **Project Settings → API**: copia la `URL` y la `anon public key`.

### 2) App
```bash
npm install -g expo
cd finzen
npm install
cp .env.example .env      # y pega tu URL y anon key
```

Correr:
```bash
npm run web        # navegador
npm run ios        # simulador iOS (requiere Mac) o app Expo Go
npm run android    # emulador Android o app Expo Go
```
> En el celular: instala **Expo Go**, corre `npm start` y escanea el QR.

### 3) Asistente IA (opcional pero recomendado)
Necesitas la CLI de Supabase (`npm i -g supabase`) y una API key de Anthropic.
```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy ai-assistant
```
La función arma el contexto financiero real del usuario (respetando su sesión) y consulta a Claude.

---

## Estructura

```
finzen/
├─ supabase/
│  ├─ schema.sql                  ← ejecutar en Supabase
│  └─ functions/ai-assistant/     ← Edge Function de IA
├─ lib/
│  ├─ supabase.ts  types.ts  format.ts
│  └─ queries/index.ts            ← todas las consultas
├─ components/  (UI.tsx, auth.tsx)
├─ constants/theme.ts
└─ app/                           ← pantallas (Expo Router)
   ├─ _layout.tsx  index.tsx
   ├─ (auth)/login.tsx
   └─ (tabs)/ index · transactions · accounts · debts · investments · assistant
```

## Notas de producción
- Publicar a las tiendas: `npx eas build` (iOS/Android) — requiere cuenta Apple Developer y Google Play.
- Web a producción: `npx expo export -p web` y súbelo a Vercel/Netlify.
- La `anon key` es pública por diseño; la seguridad real está en las **políticas RLS** del `schema.sql`.

## Estado
Base funcional y ejecutable: autenticación, CRUD de todos los módulos, balance mensual y asistente IA.
Lista para que la extiendas (gráficas históricas, recurrencias automáticas, notificaciones, iconos de marca).
