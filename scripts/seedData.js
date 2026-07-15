// Uso:  npm run seed
//
// Carga en Firestore los datos que ya extrajimos del Excel original
// (data/monthly_data.json y data/weekly_data.json), para no partir de cero.
// Se puede correr varias veces sin duplicar: usa IDs de documento fijos.

require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');
const monthly = require('../data/monthly_data.json');
const weekly = require('../data/weekly_data.json');

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('Falta FIREBASE_SERVICE_ACCOUNT_KEY en .env.local');
  return JSON.parse(raw);
}

admin.initializeApp({ credential: admin.credential.cert(getServiceAccount()) });
const db = admin.firestore();

async function main() {
  let count = 0;
  for (const branch of Object.keys(monthly)) {
    for (const year of Object.keys(monthly[branch])) {
      const docId = `${branch}_${year}`;
      await db.collection('monthly').doc(docId).set({
        branch, year, metrics: monthly[branch][year],
      });
      count++;
    }
  }
  console.log(`Cargados ${count} documentos en la colección "monthly".`);

  let wcount = 0;
  for (const week of weekly) {
    const docId = week.fecha.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await db.collection('weekly').doc(docId).set(week);
    wcount++;
  }
  console.log(`Cargados ${wcount} documentos en la colección "weekly".`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error cargando datos:', err.message);
  process.exit(1);
});
