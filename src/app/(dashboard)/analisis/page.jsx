'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function AnalisisPage() {
  const { getIdToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState('');
  const [error, setError] = useState('');
  const [generatedAt, setGeneratedAt] = useState(null);

  async function handleGenerate() {
    setLoading(true);
    setError('');
    try {
      const token = await getIdToken();
      const res = await fetch('/api/analysis', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al generar el análisis');
      setAnalysis(data.analysis);
      setGeneratedAt(data.generatedAt);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Análisis con IA</h1>
          <p>Un resumen del panorama, qué sucursales necesitan atención, y recomendaciones concretas</p>
        </div>
        <button className="btn" onClick={handleGenerate} disabled={loading}>
          {loading ? 'Analizando…' : analysis ? 'Generar de nuevo' : 'Generar análisis'}
        </button>
      </div>

      {error && (
        <div className="panel" style={{ borderLeft: '3px solid var(--red)' }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>
          {error.includes('ANTHROPIC_API_KEY') && (
            <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 8, lineHeight: 1.6 }}>
              Necesitas una clave de API de Anthropic para esta función: entra a{' '}
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={{ color: 'var(--gold-light)' }}>
                console.anthropic.com/settings/keys
              </a>{' '}
              , crea una clave, y agrégala como <code>ANTHROPIC_API_KEY</code> en tu <code>.env.local</code> y en las variables de entorno de Vercel.
            </div>
          )}
        </div>
      )}

      {!analysis && !error && !loading && (
        <div className="panel">
          <div className="empty-note">
            Todavía no has generado un análisis. Dale clic a "Generar análisis" — la IA va a revisar
            los datos actuales de las 5 sucursales y darte un resumen con recomendaciones.
          </div>
        </div>
      )}

      {loading && (
        <div className="panel">
          <div className="empty-note">Revisando los números de las 5 sucursales…</div>
        </div>
      )}

      {analysis && (
        <div className="panel">
          <div className="panel-head">
            <h3>Resultado</h3>
            {generatedAt && <span className="hint">Generado {new Date(generatedAt).toLocaleString('es-CO')}</span>}
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.75, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
            {analysis}
          </div>
        </div>
      )}
    </div>
  );
}