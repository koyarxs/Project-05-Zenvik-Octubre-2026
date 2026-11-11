'use client';
import Link from 'next/link';
import { useId, useState } from 'react';
import { Check, ArrowRight, ArrowUpRight, Server, Users, RefreshCw } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { featureLabels, limitLabels, money, rememberPlan, type BillingPlan, type PlanCatalog } from '@/lib/billing';
import { BrandMark } from './brand-mark';
import { Button } from './ui/button';
import { ErrorNotice, Loading } from './feedback';
import styles from './plan-catalog.module.css';

export function PlanCards({ catalog, select, busy = false, compact = false }: { catalog: PlanCatalog; select?: (plan: BillingPlan, priceId?: string) => void; busy?: boolean; compact?: boolean }) {
  if (!catalog.plans.length) return <div className={styles.empty}><h2>Estamos preparando nuestros planes</h2><p>Las condiciones comerciales se publicarán cuando estén definidas. Por ahora no hay contratación ni cobros habilitados.</p></div>;
  return <div className={styles.grid}>{catalog.plans.map(plan => <article key={plan.id} className={styles.card} data-featured={plan.code === 'profesional'}>
    <div className={styles.planHeading}>{compact ? <h3>{plan.name}</h3> : <h2>{plan.name}</h2>}{plan.code === 'profesional' && <span>Para equipos en crecimiento</span>}</div>
    <p className={styles.description}>{plan.description}</p>
    <div className={styles.price}>{plan.prices.length ? plan.prices.map(price => <div key={price.id}><p><strong>{money(price.amount, price.currency)}</strong><span>/{price.interval === 'MONTH' ? 'mes' : 'año'}</span></p><small>CLP · IVA incluido · Por negocio</small></div>) : <><strong>Precio por definir</strong><small>Sin contratación activa</small></>}</div>
    {Object.entries(plan.limits).length > 0 && <dl className={styles.limits}>{Object.entries(plan.limits).sort(([a], [b]) => ['active_employees', 'administrators', 'active_sites'].indexOf(a) - ['active_employees', 'administrators', 'active_sites'].indexOf(b)).map(([key, value]) => <div key={key}><dt>{limitLabels[key] ?? key}</dt><dd>{value ?? 'Sin límite'}</dd></div>)}</dl>}
    <ul className={styles.features}>{plan.features.slice(0, 6).map(feature => <li key={feature}><Check size={14} aria-hidden="true" />{featureLabels[feature] ?? feature}</li>)}</ul>
    {plan.features.length > 6 && <details className={styles.more}><summary>Ver todas las funciones</summary><ul className={styles.features}>{plan.features.slice(6).map(feature => <li key={feature}><Check size={14} aria-hidden="true" />{featureLabels[feature] ?? feature}</li>)}</ul></details>}
    {plan.trial_days > 0 && <p className={styles.trial}>Prueba de {plan.trial_days} días según las condiciones del plan.</p>}
    <div className={styles.cardActions}>{select ? <>{plan.prices.map(price => <Button key={price.id} className="w-full" disabled={busy} variant="outline" onClick={() => select(plan, price.id)}>Revisar {price.interval === 'MONTH' ? 'plan mensual' : 'plan anual'}</Button>)}{plan.trial_days > 0 && <Button className="w-full" disabled={busy} variant="outline" onClick={() => select(plan)}>Revisar prueba de {plan.trial_days} días</Button>}{!plan.prices.length && !plan.trial_days && <p>Condiciones comerciales pendientes.</p>}</> : <Link href={compact ? `/planes?plan=${encodeURIComponent(plan.code)}` : `/app?plan=${encodeURIComponent(plan.code)}`} onClick={compact ? undefined : () => rememberPlan(plan.code)}>{compact ? 'Ver condiciones' : 'Revisar en mi negocio'}<ArrowUpRight size={15} /></Link>}</div>
  </article>)}</div>;
}

export function PlanCapacity({ catalog }: { catalog: PlanCatalog }) {
  const id = useId();
  const [count, setCount] = useState('20');
  const employees = Number(count);
  const valid = count !== '' && Number.isInteger(employees) && employees > 0 && employees <= 10000;
  const options = valid ? catalog.plans.flatMap(plan => {
    const limit = plan.limits.active_employees;
    const prices = plan.prices.filter(price => price.interval === 'MONTH' && price.currency === 'CLP');
    return (limit == null || employees <= limit) ? prices.map(price => ({ plan, price })) : [];
  }).sort((a, b) => a.price.amount - b.price.amount) : [];
  const best = options[0];
  if (!catalog.plans.some(plan => plan.prices.length)) return null;
  return <div className={styles.capacity}><label htmlFor={id}><Users size={17} aria-hidden="true" />¿Cuántos trabajadores activos tiene tu negocio?</label><input id={id} type="number" inputMode="numeric" min="1" max="10000" step="1" value={count} onChange={event => setCount(event.target.value)} /><p aria-live="polite">{!valid ? 'Ingresa una cantidad entre 1 y 10.000.' : best ? <><strong>{best.plan.name}</strong><span>{money(best.price.amount, best.price.currency)} / mes, IVA incluido</span></> : 'La cantidad supera la capacidad del catálogo actual.'}</p></div>;
}

export function PlanConditions({ catalog }: { catalog: PlanCatalog }) {
  return <div className={styles.conditions}>
    <div className={styles.common}><p><Server size={17} aria-hidden="true" /><span><strong>Alojamiento contemplado</strong>La tarifa considera el alojamiento de Zenvik; no contratas un hosting aparte.</span></p><p><RefreshCw size={17} aria-hidden="true" /><span><strong>Herramientas compartidas</strong>Los planes de lanzamiento cambian en capacidad, administradores y ubicaciones.</span></p></div>
    <p className={styles.availability}>{catalog.payment_environment === 'sandbox' ? 'Contratación en modo de pruebas. No hay cobros reales habilitados.' : 'Catálogo de lanzamiento. Contratación y cobros todavía no habilitados.'}</p>
    <p className={styles.scope}>Cada plan corresponde a un negocio. Se cuentan trabajadores y ubicaciones activos; el propietario ocupa un cupo de administrador. La capacidad comercial no equivale a usuarios simultáneos garantizados.</p>
  </div>;
}

export function PublicPlans() {
  const resource = useResource<PlanCatalog>('/api/v1/billing/plans/');
  return <main className={styles.page}><header className={styles.header}><Link href="/" className={styles.logo} aria-label="Zenvik, inicio"><BrandMark tone="orange" /><span>envik</span></Link><nav aria-label="Navegación pública"><Link href="/iniciar-sesion">Iniciar sesión</Link><Link href="/registrarse">Crear cuenta<ArrowRight size={14} /></Link></nav></header>
    <div className={styles.container}><div className={styles.heading}><p>PLANES DE LANZAMIENTO</p><h1>Elige por el tamaño<br />de tu equipo.</h1><span>Precios finales en pesos chilenos. Una suscripción por negocio.</span></div>
    {resource.error ? <ErrorNotice message={resource.error.message} retry={resource.retry} /> : resource.data ? <><PlanCapacity catalog={resource.data} /><PlanCards catalog={resource.data} /><PlanConditions catalog={resource.data} /></> : <Loading label="Consultando planes…" />}
    <section aria-labelledby="billing-faq" className={styles.faq}><h2 id="billing-faq">Lo que necesitas saber</h2>{[
      ['¿Se cobra por usuario o por negocio?', 'Cada negocio tiene una suscripción independiente. El precio incluye la cantidad de trabajadores activos, ubicaciones de asistencia y administradores indicada en su plan. El propietario se cuenta dentro de los administradores.'],
      ['¿Qué pasa si mi equipo crece?', 'Puedes revisar otro plan desde Mi suscripción. Al alcanzar una capacidad, los registros existentes se conservan. El catálogo actual admite hasta 100 trabajadores por negocio; una capacidad mayor requiere evaluación.'],
      ['¿El hosting está incluido?', 'La tarifa contempla el alojamiento y mantenimiento de Zenvik. El despliegue productivo, la política de respaldos y las condiciones operativas se validarán antes de habilitar la contratación. No tienes que contratar un servidor por trabajador.'],
      ['¿Qué soporte tendré?', 'El canal, horario y condiciones de soporte se publicarán antes de habilitar la contratación. Por ahora no se ofrece atención 24/7 ni un tiempo de respuesta garantizado.'],
      ['¿Puedo pagar ahora?', 'No hay cobros reales habilitados. El checkout solo puede funcionar en pruebas con una pasarela configurada. Estos precios no activan una contratación automática.'],
      ['¿Qué pasa con mis datos si cancelo?', 'El sistema conserva la consulta y recuperación de registros según tu rol y acceso al negocio. La retención y eliminación definitivas deben detallarse en las condiciones del servicio antes del lanzamiento.'],
      ['¿Qué no está incluido?', 'No se incluyen remuneraciones, facturación tributaria, firma electrónica, relojes biométricos ni aplicaciones nativas. La asistencia actual es operativa; no se presenta como sistema autorizado por la Dirección del Trabajo. El registro interno de pagos no sustituye una factura o boleta.'],
    ].map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section>
    <footer className={styles.footer}><Link href="/">Volver a Zenvik</Link><span>Precios mensuales en CLP, IVA incluido.</span></footer></div></main>;
}
