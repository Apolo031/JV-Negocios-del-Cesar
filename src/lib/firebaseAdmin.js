// Firebase Admin SDK — SOLO se importa desde código de servidor (API routes en
// src/app/api/**). Nunca importar este archivo desde un componente de cliente
// ("use client"): la clave de servicio le da acceso TOTAL a tu proyecto de
// Firebase, saltándose todas las reglas de seguridad. Por eso vive únicamente
// en variables de entorno del servidor (Vercel), nunca en NEXT_PUBLIC_*.

import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      'Falta la variable de entorno FIREBASE_SERVICE_ACCOUNT_KEY en el servidor.'
    );
  }
  // Se guarda como JSON en una sola línea dentro de la variable de entorno.
  return JSON.parse(raw);
}

const adminApp = getApps().length
  ? getApps()[0]
  : initializeApp({ credential: cert(getServiceAccount()) });

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
