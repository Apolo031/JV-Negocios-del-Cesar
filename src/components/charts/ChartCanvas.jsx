'use client';

import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

Chart.defaults.color = '#8d96ac';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';

/** Envuelve un <canvas> y crea/destruye un Chart.js cada vez que cambia `config`. */
export default function ChartCanvas({ config, height = 220 }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !config) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, config);
    return () => { chartRef.current && chartRef.current.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(config)]);

  return <canvas ref={canvasRef} height={height} />;
}
