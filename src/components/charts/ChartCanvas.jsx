'use client';

import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

Chart.defaults.color = '#8d96ac';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';

/**
 * Dibuja el valor exacto INCRUSTADO dentro de cada barra (cerca del
 * borde superior, creciendo hacia abajo), para no tener que pasar el
 * mouse por encima para verlo. Se activa por gráfica pasando
 * `options.plugins.valueLabels: { formatter }` en el config — si una
 * gráfica no lo trae, este plugin no hace nada (no afecta a las demás).
 *
 * OJO: las opciones NO se leen de `chart.options` — Chart.js envuelve esa
 * rama en un proxy "scriptable" que, al leer cualquier propiedad de tipo
 * función (como `formatter`), la EJECUTA automáticamente pasándole su
 * propio contexto interno en vez del valor real, y usa ESE resultado como
 * si fuera el valor de la opción. Para evitarlo, `ChartCanvas` guarda las
 * opciones originales (tal cual las escribió cada página) en
 * `chart.$valueLabels`, por fuera del árbol de `options`, y acá se leen de
 * ahí sin pasar nunca por ese proxy.
 */
const valueLabelsPlugin = {
  id: 'valueLabels',
  afterDatasetsDraw(chart) {
    const opts = chart.$valueLabels;
    if (!opts || opts.display === false) return;
    const { ctx } = chart;
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;
      meta.data.forEach((element, index) => {
        const value = dataset.data[index];
        if (value === null || value === undefined || value === 0) return;
        const texto = opts.formatter ? opts.formatter(value, { dataset, datasetIndex, index }) : String(value);
        const pos = element.tooltipPosition();
        const dentroOffset = opts.offset ?? 6;
        ctx.save();
        ctx.font = opts.font || '600 10px Inter, sans-serif';
        // Si el texto no cabe de ancho en la columna de esta barra (típico
        // con valores en pesos de varias sucursales juntas), se gira 90°
        // para que crezca hacia abajo DENTRO de la barra en vez de
        // invadir la barra vecina. Siempre queda anclado justo debajo del
        // borde superior de la barra (adentro), nunca por fuera.
        const anchoDisponible = (element.width || 30) * 1.4;
        const cabeHorizontal = ctx.measureText(texto).width <= anchoDisponible;

        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.fillStyle = opts.color || '#ffffff';

        if (cabeHorizontal) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.strokeText(texto, pos.x, pos.y + dentroOffset);
          ctx.fillText(texto, pos.x, pos.y + dentroOffset);
        } else {
          ctx.translate(pos.x, pos.y + dentroOffset);
          ctx.rotate(Math.PI / 2);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.strokeText(texto, 0, 0);
          ctx.fillText(texto, 0, 0);
        }
        ctx.restore();
      });
    });
  },
};
Chart.register(valueLabelsPlugin);

/** Envuelve un <canvas> y crea/destruye un Chart.js cada vez que cambia `config`. */
export default function ChartCanvas({ config, height = 220 }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !config) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, config);
    // Por fuera de `options` a propósito — ver el comentario de valueLabelsPlugin.
    chartRef.current.$valueLabels = config.options?.plugins?.valueLabels || null;
    return () => { chartRef.current && chartRef.current.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(config)]);

  return <canvas ref={canvasRef} height={height} />;
}
