'use client';

import { useData } from '@/contexts/DataContext';
import {
  BRANCHES, MONTH_NAMES_FULL, fmtMoney, fmtPct,
  series, totalFor, lastActiveMonth2026,
} from '@/lib/dataHelpers';

const WEEK_BRANCH_KEY = { Barranquilla: 'Barranquillera', Caucasia: 'Caucasia', Euro: 'Euro', Heroica: 'Heroica', Sinú: 'Sinú' };

function buildAlerts(monthly, weekly) {
  const alerts = [];
  const lastM = lastActiveMonth2026(monthly);

  BRANCHES.forEach((b) => {
    const t25 = totalFor(monthly, b, '2025', 'valor_contratado', 12);
    if (t25 === 0) {
      alerts.push({ sev: 'med', icon: '●', title: `${b}: sucursal en arranque`,
        desc: `No registró contratos en 2025. Toda su operación es de 2026, así que conviene revisarla con más frecuencia mientras estabiliza su ritmo.` });
    }
  });

  BRANCHES.forEach((b) => {
    const s = series(monthly, b, '2026', 'utilidad');
    if (lastM >= 1) {
      const prev = s[lastM - 1], cur = s[lastM];
      if (prev > 0 && cur < prev * 0.7) {
        const pct = ((cur - prev) / prev) * 100;
        alerts.push({ sev: 'high', icon: '▼', title: `${b}: caída de utilidad en ${MONTH_NAMES_FULL[lastM]}`,
          desc: `La utilidad pasó de ${fmtMoney(prev)} en ${MONTH_NAMES_FULL[lastM - 1]} a ${fmtMoney(cur)} (${fmtPct(pct)}). Vale la pena revisar qué cambió.` });
      }
    }
  });

  BRANCHES.forEach((b) => {
    const vc = totalFor(monthly, b, '2026', 'valor_contratado', lastM + 1);
    const pr = totalFor(monthly, b, '2026', 'prorroga', lastM + 1);
    if (vc > 0) {
      const ratio = (pr / vc) * 100;
      if (ratio > 2.5) {
        alerts.push({ sev: 'med', icon: '!', title: `${b}: alta proporción de prórrogas`,
          desc: `Las prórrogas equivalen al ${ratio.toFixed(1)}% del valor contratado en lo corrido de 2026 (${fmtMoney(pr)}). Puede ser señal de clientes con dificultad para cancelar a tiempo.` });
      }
    }
  });

  if (weekly.length >= 2) {
    const w0 = weekly[weekly.length - 2], w1 = weekly[weekly.length - 1];
    BRANCHES.forEach((b) => {
      const k = WEEK_BRANCH_KEY[b];
      const v1 = w0.sucursales?.[k]?.utilidad || 0;
      const v2 = w1.sucursales?.[k]?.utilidad || 0;
      if (v1 > 0 && v2 < v1 * 0.5) {
        alerts.push({ sev: 'high', icon: '▼', title: `${b}: utilidad semanal a la baja`,
          desc: `Bajó de ${fmtMoney(v1)} (${w0.fecha}) a ${fmtMoney(v2)} (${w1.fecha}). Conviene confirmar con la sucursal esta misma semana.` });
      }
    });
  }

  const anySilver = BRANCHES.some((b) => totalFor(monthly, b, '2026', 'valor_venta_plata', lastM + 1) > 0);
  if (anySilver) {
    BRANCHES.forEach((b) => {
      if (totalFor(monthly, b, '2026', 'valor_venta_plata', lastM + 1) === 0 && totalFor(monthly, b, '2026', 'valor_contratado', lastM + 1) > 0) {
        alerts.push({ sev: 'low', icon: 'i', title: `${b}: sin venta de plata en 2026`,
          desc: `Otras sucursales sí están vendiendo plata este año. Podría ser una línea adicional de ingreso que ${b} no está aprovechando.` });
      }
    });
  }

  const rank = BRANCHES.map((b) => ({ b, v: totalFor(monthly, b, '2026', 'utilidad', lastM + 1) })).sort((a, b) => b.v - a.v);
  if (rank[0] && rank[0].v > 0) {
    alerts.push({ sev: 'low', icon: '★', title: `${rank[0].b} lidera en utilidad`,
      desc: `Acumula ${fmtMoney(rank[0].v)} en lo corrido de 2026, la cifra más alta entre las 5 joyerías.` });
  }

  const order = { high: 0, med: 1, low: 2 };
  return alerts.sort((a, b) => order[a.sev] - order[b.sev]);
}

export default function AlertasPage() {
  const { monthly, weekly, loading } = useData();
  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Cargando…</div>;

  const alerts = buildAlerts(monthly, weekly);

  return (
    <div>
      <div className="topbar">
        <div><h1>Alertas y puntos de atención</h1><p>Generadas automáticamente a partir de los datos cargados — para actuar hoy mismo</p></div>
      </div>
      {alerts.length === 0 ? (
        <div className="alert-empty">No se detectaron puntos de atención con las reglas actuales.</div>
      ) : (
        alerts.map((a, i) => (
          <div className={`alert-card sev-${a.sev}`} key={i}>
            <div className="alert-icon">{a.icon}</div>
            <div className="alert-body">
              <div className="alert-title">{a.title}</div>
              <div className="alert-desc">{a.desc}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
