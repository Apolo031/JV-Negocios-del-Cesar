'use client';

import { useMemo, useState } from 'react';
import { useData } from '@/contexts/DataContext';
import ChartCanvas from '@/components/charts/ChartCanvas';
import {
  BRANCHES, BRANCH_COLOR, EDIT_METRICS, METRIC_LABEL, MONTH_NAMES,
  fmtMoney, fmtPct, fmtConcepto, fmtGr, weekKey, weekLabel,
} from '@/lib/dataHelpers';

// Los 8 indicadores que trae el "Cuadre de caja" (ver /editar) — los mismos
// que ya se usan para extraer y aplicar esos PDF.
const METRICAS = EDIT_METRICS.slice(0, 8);

function semanaVacia() {
  const porSucursal = {};
  BRANCHES.forEach((b) => {
    porSucursal[b] = { dias: 0 };
    METRICAS.forEach((m) => { porSucursal[b][m] = 0; });
  });
  return porSucursal;
}

/** "1 – 6 Nov 2026" a partir de una fecha de inicio y una de fin (mismo mes o no). */
function etiquetaRango(anio, mes, dia, anioFin, mesFin, diaFin) {
  const ini = new Date(anio, mes - 1, dia);
  const fin = new Date(anioFin, mesFin - 1, diaFin);
  const mismoMes = ini.getMonth() === fin.getMonth() && ini.getFullYear() === fin.getFullYear();
  const iniTxt = mismoMes ? `${ini.getDate()}` : `${ini.getDate()} ${MONTH_NAMES[ini.getMonth()]}`;
  return `${iniTxt} – ${fin.getDate()} ${MONTH_NAMES[fin.getMonth()]} ${fin.getFullYear()}`;
}

/** true si el cuadre cubre varios días (ej. un consolidado semanal) en vez de un solo día. */
function esPeriodoCuadre(c) {
  return !!(c.diaFin && (c.diaFin !== c.dia || c.mesFin !== c.mes || String(c.anioFin) !== String(c.anio)));
}

/** Misma clave de periodo (semana calendario, o rango propio si es un "consolidado" de varios días) que usa `agruparPorSemana`, pero reutilizable para volver a filtrar los cuadres crudos de un periodo ya elegido. */
function keyDeCuadre(c) {
  if (esPeriodoCuadre(c)) {
    return `P_${c.anio}-${String(c.mes).padStart(2, '0')}-${String(c.dia).padStart(2, '0')}_${c.anioFin}-${String(c.mesFin).padStart(2, '0')}-${String(c.diaFin).padStart(2, '0')}`;
  }
  return weekKey(c.anio, c.mes, c.dia);
}

/**
 * Agrupa los cuadres de caja en periodos, sumando cada indicador por
 * sucursal. Un cuadre normal (de un solo día) se agrupa por semana
 * calendario (Lunes–Domingo); pero un "consolidado" de varios días (ej. un
 * reporte semanal que ya trae el total de esos días) arma SU PROPIO periodo
 * — tal como venía en el PDF — en vez de forzarlo a encajar en una semana
 * calendario, porque ese total ya es de ese rango exacto.
 */
function agruparPorSemana(cuadresDiarios) {
  const mapa = {};
  cuadresDiarios.forEach((c) => {
    if (!c.sucursal || !c.anio || !c.mes || !c.dia || !BRANCHES.includes(c.sucursal)) return;
    const key = keyDeCuadre(c);
    const label = esPeriodoCuadre(c) ? etiquetaRango(c.anio, c.mes, c.dia, c.anioFin, c.mesFin, c.diaFin) : weekLabel(key);
    let dias = 1;
    if (esPeriodoCuadre(c)) {
      const ini = new Date(c.anio, c.mes - 1, c.dia);
      const fin = new Date(c.anioFin, c.mesFin - 1, c.diaFin);
      dias = Math.max(1, Math.round((fin - ini) / 86400000) + 1);
    }
    if (!mapa[key]) mapa[key] = { key, label, porSucursal: semanaVacia() };
    const dest = mapa[key].porSucursal[c.sucursal];
    METRICAS.forEach((m) => { dest[m] += c.valores?.[m] || 0; });
    dest.dias += dias;
  });
  return Object.values(mapa).sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Desglose "DETALLE CONTRATOS ORO" por tipo (ORO 14K NACIONAL, ORO 18K
 * ITALIANO...) de los cuadres de caja del periodo seleccionado, sumado por
 * sucursal — usa cada tipo como su propio "código" para poder comparar
 * gramos/valor entre sucursales y entre semanas.
 */
function agruparDesgloseOroPorTipo(cuadresDiarios, keySeleccionada) {
  const porTipo = {};
  cuadresDiarios.forEach((c) => {
    if (!c.sucursal || !c.anio || !c.mes || !c.dia || !BRANCHES.includes(c.sucursal)) return;
    if (keyDeCuadre(c) !== keySeleccionada) return;
    (c.desgloseOro || []).forEach((fila) => {
      if (!fila?.descripcion) return;
      if (!porTipo[fila.descripcion]) porTipo[fila.descripcion] = { gramos: 0, valor: 0, porSucursal: {} };
      const dest = porTipo[fila.descripcion];
      dest.gramos += fila.gramos || 0;
      dest.valor += fila.valor || 0;
      dest.porSucursal[c.sucursal] = (dest.porSucursal[c.sucursal] || 0) + (fila.gramos || 0);
    });
  });
  return Object.entries(porTipo)
    .map(([tipo, v]) => ({ tipo, gramos: v.gramos, valor: v.valor, promedio: v.gramos ? v.valor / v.gramos : 0, porSucursal: v.porSucursal }))
    .sort((a, b) => b.valor - a.valor);
}

function construirAlertas(actual, anterior) {
  const alertas = [];
  if (!actual) return alertas;

  BRANCHES.forEach((b) => {
    const dias = actual.porSucursal[b].dias;
    if (dias === 0) {
      alertas.push({
        sev: 'med', icon: 'i', title: `${b}: sin cuadres de caja esta semana`,
        desc: `No se ha cargado ningún "Cuadre de caja" de ${b} en el periodo del ${actual.label} — puede que falte subirlos o que la sucursal no haya reportado.`,
      });
    }
  });

  BRANCHES.forEach((b) => {
    const dias = actual.porSucursal[b].dias;
    if (dias === 0) return;
    const utilActual = actual.porSucursal[b].utilidad;
    const utilAnterior = anterior?.porSucursal[b]?.utilidad;
    if (anterior && utilAnterior > 0 && utilActual < utilAnterior * 0.5) {
      const pct = ((utilActual - utilAnterior) / utilAnterior) * 100;
      alertas.push({
        sev: 'high', icon: '▼', title: `${b}: caída de utilidad semanal`,
        desc: `Bajó de ${fmtMoney(utilAnterior)} a ${fmtMoney(utilActual)} (${fmtPct(pct)}) vs. el periodo del ${anterior.label}.`,
      });
    }
  });

  const rank = BRANCHES
    .map((b) => ({ b, v: actual.porSucursal[b].utilidad, dias: actual.porSucursal[b].dias }))
    .filter((r) => r.dias > 0)
    .sort((a, b) => b.v - a.v);
  if (rank[0] && rank[0].v > 0) {
    alertas.push({
      sev: 'low', icon: '★', title: `${rank[0].b} lidera la semana en utilidad`,
      desc: `Acumula ${fmtMoney(rank[0].v)} en el periodo del ${actual.label}, la cifra más alta entre las sucursales con cuadres cargados.`,
    });
  }

  const order = { high: 0, med: 1, low: 2 };
  return alertas.sort((a, b) => order[a.sev] - order[b.sev]);
}

export default function SeguimientoSemanalPage() {
  const { cuadresDiarios, loading } = useData();
  const [semanaSel, setSemanaSel] = useState(null);

  const semanas = useMemo(() => agruparPorSemana(cuadresDiarios), [cuadresDiarios]);

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Cargando…</div>;

  if (semanas.length === 0) {
    return (
      <div>
        <div className="topbar">
          <div><h1>Seguimiento semanal</h1><p>Comparativo periodo a periodo a partir de los cuadres de caja</p></div>
        </div>
        <div className="alert-empty">
          Todavía no hay cuadres de caja cargados. Súbelos desde el "Panel de Cuadre de caja" en Editar datos y aquí se van a agrupar por semana automáticamente.
        </div>
      </div>
    );
  }

  const key = semanaSel && semanas.some((s) => s.key === semanaSel) ? semanaSel : semanas[semanas.length - 1].key;
  const idx = semanas.findIndex((s) => s.key === key);
  const actual = semanas[idx];
  const anterior = idx > 0 ? semanas[idx - 1] : null;
  const alertas = construirAlertas(actual, anterior);
  const desgloseOro = agruparDesgloseOroPorTipo(cuadresDiarios, key);

  const totalUtilidad = BRANCHES.reduce((s, b) => s + actual.porSucursal[b].utilidad, 0);
  const totalContratado = BRANCHES.reduce((s, b) => s + actual.porSucursal[b].valor_contratado, 0);
  const margen = totalContratado ? (totalUtilidad / totalContratado) * 100 : 0;
  const sucursalesConDatos = BRANCHES.filter((b) => actual.porSucursal[b].dias > 0).length;

  return (
    <div>
      <div className="topbar">
        <div><h1>Seguimiento semanal</h1><p>Comparativo periodo a periodo a partir de los cuadres de caja</p></div>
        <select value={key} onChange={(e) => setSemanaSel(e.target.value)}>
          {semanas.map((s) => (
            <option key={s.key} value={s.key}>{s.label}{s.key === semanas[semanas.length - 1].key ? ' (última)' : ''}</option>
          ))}
        </select>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="label">Utilidad del periodo</div>
          <div className="value">{fmtMoney(totalUtilidad)}</div>
        </div>
        <div className="kpi">
          <div className="label">Valor contratado</div>
          <div className="value">{fmtMoney(totalContratado)}</div>
        </div>
        <div className="kpi">
          <div className="label">Margen</div>
          <div className="value">{margen.toFixed(1)}%</div>
        </div>
        <div className="kpi">
          <div className="label">Sucursales con cuadres</div>
          <div className="value">{sucursalesConDatos} / {BRANCHES.length}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Alertas de la semana</h3></div>
        {alertas.length === 0 ? (
          <div className="alert-empty">No se detectaron puntos de atención con las reglas actuales.</div>
        ) : (
          alertas.map((a, i) => (
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

      {desgloseOro.length > 0 && (
        <div className="panel">
          <div className="panel-head"><h3>Detalle contratos de oro por tipo</h3></div>
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14 }}>
            Desglose de "DETALLE CONTRATOS ORO" de los cuadres de caja del periodo del {actual.label}, con cada tipo
            (14K, 18K Italiano, 18K Nacional...) como su propio código para comparar entre sucursales.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Tipo</th>
                  {BRANCHES.map((b) => <th key={b}>{b}</th>)}
                  <th>Gramos</th><th>Valor</th><th>Promedio</th>
                </tr>
              </thead>
              <tbody>
                {desgloseOro.map((d) => (
                  <tr key={d.tipo}>
                    <td className="name">{d.tipo}</td>
                    {BRANCHES.map((b) => <td key={b}>{d.porSucursal[b] ? fmtGr(d.porSucursal[b]) : '—'}</td>)}
                    <td><b>{fmtGr(d.gramos)}</b></td>
                    <td>{fmtMoney(d.valor)}</td>
                    <td>{fmtMoney(d.promedio)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, borderTop: '1px solid var(--border)' }}>
                  <td className="name">TOTAL</td>
                  {BRANCHES.map((b) => {
                    const totalSucursal = desgloseOro.reduce((s, d) => s + (d.porSucursal[b] || 0), 0);
                    return <td key={b}>{totalSucursal ? fmtGr(totalSucursal) : '—'}</td>;
                  })}
                  <td>{fmtGr(desgloseOro.reduce((s, d) => s + d.gramos, 0))}</td>
                  <td>{fmtMoney(desgloseOro.reduce((s, d) => s + d.valor, 0))}</td>
                  <td>
                    {(() => {
                      const totalGramos = desgloseOro.reduce((s, d) => s + d.gramos, 0);
                      const totalValor = desgloseOro.reduce((s, d) => s + d.valor, 0);
                      return fmtMoney(totalGramos ? totalValor / totalGramos : 0);
                    })()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        {METRICAS.map((metric) => (
          <div className="panel" key={metric}>
            <div className="panel-head"><h3>{METRIC_LABEL[metric]}</h3></div>
            <ChartCanvas
              height={210}
              config={{
                type: 'bar',
                data: {
                  labels: BRANCHES,
                  datasets: [{
                    data: BRANCHES.map((b) => actual.porSucursal[b][metric]),
                    backgroundColor: BRANCHES.map((b) => BRANCH_COLOR[b]),
                    borderRadius: 4,
                  }],
                },
                options: {
                  indexAxis: 'y',
                  layout: { padding: { right: 14 } },
                  plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (c) => fmtConcepto(metric, c.raw) } },
                    valueLabels: { formatter: (v) => fmtConcepto(metric, v) },
                  },
                  scales: { x: { ticks: { callback: (v) => fmtConcepto(metric, v) } } },
                },
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
