import type { CSSProperties } from 'react';

const states = [
  { key: 'WORKING', label: 'Trabajando', color: '#075cf5' },
  { key: 'ON_BREAK', label: 'En colación', color: '#d88b10' },
  { key: 'FINISHED', label: 'Finalizadas', color: '#1688f8' },
  { key: 'PENDING', label: 'Entrada pendiente', color: '#bc3543' },
] as const;

export function AttendanceStateChart({ counts, showRate = false }: { counts: Record<string, number>; showRate?: boolean }) {
  const total = states.reduce((sum, state) => sum + (counts[state.key] ?? 0), 0);
  let offset = 0;
  const segments = states.map(state => {
    const start = offset;
    offset += total ? ((counts[state.key] ?? 0) / total) * 100 : 0;
    return `${state.color} ${start}% ${offset}%`;
  });
  const rate = total ? Math.round((total - (counts.PENDING ?? 0)) / total * 100) : 0;
  return <figure className="attendance-state-chart">
    <div className="attendance-state-chart__ring" style={{ '--chart-fill': total ? `conic-gradient(${segments.join(',')})` : 'var(--muted)' } as CSSProperties} aria-hidden={!showRate}><span>{showRate ? <strong>{rate}%<small>Con entrada</small></strong> : total}</span></div>
    <div><figcaption>Distribución por estado operativo</figcaption><ul>{states.map(state => <li key={state.key}><span style={{ backgroundColor: state.color }} aria-hidden="true" />{state.label}<strong>{counts[state.key] ?? 0}</strong></li>)}</ul></div>
  </figure>;
}
