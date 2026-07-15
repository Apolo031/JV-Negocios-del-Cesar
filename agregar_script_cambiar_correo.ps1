$utf8NoBom = New-Object System.Text.UTF8Encoding $false
New-Item -ItemType Directory -Force -Path "scripts" | Out-Null

$content = @'
// Uso:  node scripts/changeUserEmail.js correo-viejo@ejemplo.com correo-nuevo@ejemplo.com
//
// Cambia el correo de una cuenta ya existente y le manda automáticamente el
// correo de Firebase para que la persona cree su contraseña con el correo nuevo.

require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');
const { initializeApp } = require('firebase/app');
const { getAuth, sendPasswordResetEmail } = require('firebase/auth');

const [, , oldEmail, newEmail] = process.argv;

if (!oldEmail || !newEmail) {
  console.error('Uso: node scripts/changeUserEmail.js correo-viejo@ejemplo.com correo-nuevo@ejemplo.com');
  process.exit(1);
}

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('Falta FIREBASE_SERVICE_ACCOUNT_KEY en .env.local');
  return JSON.parse(raw);
}

admin.initializeApp({ credential: admin.credential.cert(getServiceAccount()) });

async function main() {
  const auth = admin.auth();

  const user = await auth.getUserByEmail(oldEmail);
  await auth.updateUser(user.uid, { email: newEmail });
  await admin.firestore().collection('users').doc(user.uid).set({ email: newEmail }, { merge: true });
  console.log(`Correo actualizado: ${oldEmail} -> ${newEmail}`);

  // Ahora se manda el correo de "crear tu contraseña" usando el SDK de cliente.
  const clientApp = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
  const clientAuth = getAuth(clientApp);
  await sendPasswordResetEmail(clientAuth, newEmail);
  console.log(`Correo de invitación enviado a ${newEmail}. Revisa la bandeja de entrada (y spam).`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
'@
[System.IO.File]::WriteAllText("$PWD\scripts\changeUserEmail.js", $content, $utf8NoBom)

Write-Host "Listo: script para cambiar correo creado." -ForegroundColor Green
