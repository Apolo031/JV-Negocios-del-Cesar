'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  collection, onSnapshot, doc, setDoc, addDoc, updateDoc, deleteDoc, query, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { useAuth } from './AuthContext';
import { BRANCHES, EDIT_METRICS, emptyMonthlyData } from '@/lib/dataHelpers';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const { user } = useAuth();
  const [monthly, setMonthly] = useState(emptyMonthlyData());
  const [weekly, setWeekly] = useState([]);
  const [publicidad, setPublicidad] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const unsubMonthly = onSnapshot(collection(db, 'monthly'), (snap) => {
      setMonthly((prev) => {
        const next = { ...prev };
        snap.docs.forEach((d) => {
          const data = d.data();
          if (!next[data.branch]) next[data.branch] = { 2025: {}, 2026: {} };
          next[data.branch][data.year] = data.metrics;
        });
        return next;
      });
    });

    const unsubWeekly = onSnapshot(query(collection(db, 'weekly'), orderBy('fecha')), (snap) => {
      setWeekly(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const unsubPub = onSnapshot(collection(db, 'publicidad'), (snap) => {
      setPublicidad(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const unsubPend = onSnapshot(collection(db, 'pendientes'), (snap) => {
      setPendientes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    setLoading(false);
    return () => { unsubMonthly(); unsubWeekly(); unsubPub(); unsubPend(); };
  }, [user]);

  /** Admin: sobreescribe un metric completo (los 12 meses) de una sucursal/año. */
  const saveMonthlyMetric = useCallback(async (branch, year, metric, values) => {
    const docId = `${branch}_${year}`;
    const current = monthly[branch]?.[year] || {};
    await setDoc(
      doc(db, 'monthly', docId),
      { branch, year, metrics: { ...current, [metric]: values } },
      { merge: true }
    );
  }, [monthly]);

  const addPublicidad = useCallback(async (entry) => {
    return addDoc(collection(db, 'publicidad'), { ...entry, createdAt: Date.now() });
  }, []);
  const deletePublicidad = useCallback(async (id) => deleteDoc(doc(db, 'publicidad', id)), []);

  const addPendiente = useCallback(async (entry) => {
    return addDoc(collection(db, 'pendientes'), { ...entry, done: false, createdAt: Date.now() });
  }, []);
  const togglePendiente = useCallback(async (id, done) => {
    return updateDoc(doc(db, 'pendientes', id), { done });
  }, []);
  const deletePendiente = useCallback(async (id) => deleteDoc(doc(db, 'pendientes', id)), []);

  return (
    <DataContext.Provider value={{
      monthly, weekly, publicidad, pendientes, loading,
      saveMonthlyMetric, addPublicidad, deletePublicidad,
      addPendiente, togglePendiente, deletePendiente,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData debe usarse dentro de <DataProvider>');
  return ctx;
}
