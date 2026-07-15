# Panel de control — Joyerías del Cesar

Aplicación Next.js con Firebase (autenticación, base de datos y almacenamiento
de fotos) y despliegue en Vercel. Reemplaza el panel estático anterior por una
app real con login, roles de usuario y datos en vivo compartidos entre todo
el equipo.

## Roles

- **Administrador**: ve y edita todo (datos financieros, publicidad,
  pendientes, usuarios).
- **Operaciones**: ve todo el panel, pero **no puede editar ni borrar nada**.
  La restricción no es solo de la interfaz — está reforzada en las reglas de
  seguridad de Firestore y Storage, así que aunque alguien intente escribir
  directamente contra la base de datos, el servidor de Firebase lo rechaza.

---

## 1. Crear el proyecto de Firebase

1. Ve a [console.firebase.google.com](https://console.firebase.google.com) → **Agregar proyecto**.
2. Dentro del proyecto, activa:
   - **Authentication** → pestaña "Sign-in method" → habilita **Correo electrónico/contraseña**.
   - **Firestore Database** → **Crear base de datos** → modo producción, la región más cercana.
   - **Storage** → **Comenzar** (para las fotos de publicidad).
3. Ve a **Configuración del proyecto** (ícono de engranaje) → pestaña **General**
   → sección "Tus apps" → crea una app web (</>) → copia el objeto `firebaseConfig`
   que te muestra (esas son las variables `NEXT_PUBLIC_FIREBASE_*`).
4. Ve a **Configuración del proyecto** → pestaña **Cuentas de servicio** →
   **Generar nueva clave privada** → descarga el archivo JSON. **Nunca subas
   este archivo a GitHub** — su contenido va en la variable de entorno
   `FIREBASE_SERVICE_ACCOUNT_KEY` (como una sola línea de texto JSON).

## 2. Configurar el proyecto en tu computador

```bash
npm install
cp .env.local.example .env.local
```

Abre `.env.local` y pega:
- Las 6 variables `NEXT_PUBLIC_FIREBASE_*` del paso anterior.
- `FIREBASE_SERVICE_ACCOUNT_KEY` con el contenido completo del JSON de la
  cuenta de servicio, en una sola línea (puedes usar un conversor "JSON a una
  línea" o simplemente quitar los saltos de línea).

## 3. Instalar el CLI de Firebase y subir las reglas de seguridad

```bash
npm install -g firebase-tools
firebase login
firebase use --add          # selecciona tu proyecto de Firebase
firebase deploy --only firestore:rules,storage:rules
```

Esto sube `firestore.rules` y `storage.rules` — son las que hacen que
"Operaciones" no pueda escribir nada, sin importar qué muestre la pantalla.

## 4. Crear el primer usuario administrador

```bash
node scripts/createAdmin.js tucorreo@ejemplo.com "tuContraseñaSegura" "Tu Nombre"
```

Con esa cuenta ya puedes entrar al panel y crear el resto de los usuarios
(admin u operaciones) desde la pantalla **Usuarios**.

## 5. Cargar los datos que ya teníamos del Excel (opcional, recomendado)

```bash
npm run seed
```

Esto sube a Firestore los datos mensuales y semanales que ya habíamos
extraído del archivo de Excel original, para no empezar de cero.

## 6. Probar localmente

```bash
npm run dev
```

Abre `http://localhost:3000`, entra con el usuario administrador que creaste.

---

## 7. Subir el proyecto a GitHub

```bash
git init
git add .
git commit -m "Panel de control Joyerías del Cesar"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/joyerias-panel.git
git push -u origin main
```

El `.gitignore` ya excluye `.env.local` y cualquier clave de servicio, así
que tus credenciales nunca llegan al repositorio.

## 8. Desplegar en Vercel

1. Ve a [vercel.com](https://vercel.com) → **Add New Project** → importa el
   repositorio de GitHub que acabas de crear.
2. En **Environment Variables**, agrega las mismas variables de tu
   `.env.local` (las 6 `NEXT_PUBLIC_FIREBASE_*` y `FIREBASE_SERVICE_ACCOUNT_KEY`).
   Esto es lo que "resguarda las API": la clave de servicio vive solo en las
   variables de entorno del servidor de Vercel, nunca en el código ni en el
   navegador del usuario.
3. **Deploy**. Cada vez que hagas `git push` a `main`, Vercel vuelve a
   desplegar automáticamente.
4. En Firebase Console → Authentication → **Settings** → **Authorized
   domains**, agrega el dominio que te dio Vercel (algo como
   `tu-proyecto.vercel.app`) para que el login funcione ahí también.

---

## Estructura del proyecto

```
src/
  lib/
    firebaseClient.js   # SDK de Firebase para el navegador
    firebaseAdmin.js     # SDK de Firebase Admin (SOLO servidor)
    apiAuth.js            # Verifica token + rol en las API routes
    dataHelpers.js        # Formateo y cálculos compartidos
  contexts/
    AuthContext.jsx       # Sesión y rol del usuario
    DataContext.jsx       # Datos en tiempo real (Firestore)
  components/
    Sidebar.jsx
    RequireAdmin.jsx
    charts/ChartCanvas.jsx
  app/
    login/page.jsx
    (dashboard)/           # Rutas protegidas (requieren sesión)
      page.jsx              # Resumen general
      comparativo/
      detalle/
      semanal/
      publicidad/
      editar/                # Solo admin
      alertas/
      admin/usuarios/        # Solo admin
    api/
      users/route.js         # Listar/crear usuarios (solo admin)
      users/[uid]/route.js    # Editar rol / eliminar (solo admin)
firestore.rules
storage.rules
firebase.json
scripts/
  createAdmin.js            # Crea el primer administrador
  seedData.js                 # Carga los datos del Excel a Firestore
data/
  monthly_data.json           # Datos ya extraídos del Excel original
  weekly_data.json
```

## Notas de seguridad

- La clave de servicio de Firebase (`FIREBASE_SERVICE_ACCOUNT_KEY`) da acceso
  total al proyecto — solo se usa en `src/lib/firebaseAdmin.js` y en los
  scripts de `scripts/`, nunca en un componente con `"use client"`.
- El rol de cada usuario vive en un *custom claim* del token de Firebase Auth,
  no en un campo que el propio usuario pueda editar.
- Las reglas de Firestore y Storage son la última línea de defensa: aunque
  alguien manipule la interfaz o llame a la base de datos directamente, el
  rol "operaciones" no puede escribir nada.
