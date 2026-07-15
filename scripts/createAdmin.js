// Uso:  node scripts/createAdmin.js correo@ejemplo.com "contraseña" "Nombre visible"
//
// Crea el PRIMER usuario administrador. Es necesario porque la API /api/users
// exige que quien la llame ya sea admin — este script usa la clave de servicio
// directamente para romper ese círculo, una sola vez. Después de esto, crea el
// resto de los usuarios (admin u operaciones) desde la pantalla "Usuarios".

require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

const [, , email, password, displayName] = process.argv;

if (!email || !password) {
  console.error('Uso: node scripts/createAdmin.js correo@ejemplo.com "contraseña" "Nombre visible"');
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
  const db = admin.firestore();

  const userRecord = await auth.createUser({
    email,
    password,
    displayName: displayName || '',
  });
  await auth.setCustomUserClaims(userRecord.uid, { role: 'admin' });
  await db.collection('users').doc(userRecord.uid).set({
    email, displayName: displayName || '', role: 'admin', createdAt: Date.now(),
  });

  console.log('Administrador creado:', userRecord.uid, email);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error creando el administrador:', err.message);
  process.exit(1);
});
