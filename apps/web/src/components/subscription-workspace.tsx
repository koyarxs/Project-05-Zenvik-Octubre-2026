'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/lib/http';
import { billingDate, clearSelectedPlan, featureLabels, limitLabels, money, safeCheckout, selectedPlan, stateLabels, type BillingPlan, type Payment, type PlanCatalog, type Subscription } from '@/lib/billing';
import type { Business } from '@/lib/types';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
import { ErrorNotice, Loading, SuccessNotice } from './feedback';
import { PlanCards } from './plan-catalog';

export function SubscriptionWorkspace({ business }: { business: Business }) {
  if (business.role !== 'OWNER') return <><h1 className="text-2xl font-semibold">Acceso restringido</h1><p className="mt-3 text-sm text-muted-foreground">Solo el propietario puede consultar y gestionar la suscripción del negocio.</p></>;
  return <OwnerSubscription key={business.id} business={business} />;
}

function OwnerSubscription({ business }: { business: Business }) {
  const base = `/api/v1/businesses/${business.id}/billing/`;
  const subscription = useResource<Subscription>(base);
  const catalog = useResource<PlanCatalog>('/api/v1/billing/plans/');
  const [page, setPage] = useState(1);
  const payments = useResource<{ count: number; next: string | null; results: Payment[] }>(`${base}payments/?page=${page}`);
  const [selection, setSelection] = useState<{ plan: BillingPlan; priceId?: string; requestId: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<'CANCEL' | 'REACTIVATE' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [chosenCode, setChosenCode] = useState<string | null>(null);
  useEffect(() => { queueMicrotask(() => setChosenCode(selectedPlan())); }, []);
  const data = subscription.data;
  async function change(action: string, extra: Record<string, unknown> = {}, requestId?: string) {
    if (!data) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      await api(`${base}changes/`, { method: 'POST', body: { action, expected_revision: data.revision, request_id: requestId ?? crypto.randomUUID(), ...extra } });
      setSelection(null); setConfirmAction(null); clearSelectedPlan(); subscription.retry();
      setSuccess(action === 'CHANGE' ? 'Solicitud registrada. El plan actual se conserva hasta confirmar el pago del nuevo período.' : action === 'TRIAL' ? 'Período de prueba iniciado.' : 'Solicitud registrada. Puedes consultar el estado actualizado.');
    } catch (err) { setError(err instanceof Error ? err.message : 'No pudimos registrar la solicitud.'); }
    finally { setBusy(false); }
  }
  async function checkout() {
    if (!data || !selection?.priceId) return;
    setBusy(true); setError(null);
    try {
      const result = await api<{ checkout_url: string }>(`${base}checkout/`, { method: 'POST', body: { price_id: selection.priceId, request_id: selection.requestId, expected_revision: data.revision } });
      if (!safeCheckout(result.checkout_url)) throw new Error('El proveedor devolvió una dirección de pago no permitida.');
      window.location.assign(result.checkout_url);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo iniciar el checkout.'); }
    finally { setBusy(false); payments.retry(); }
  }
  const price = selection?.plan.prices.find(p => p.id === selection.priceId);
  return <div className="space-y-7"><header className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow text-primary">{business.name}</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Mi suscripción</h1><p className="mt-2 text-sm text-muted-foreground">Plan, uso y pagos de este negocio.</p></div><Button variant="outline" disabled={busy} onClick={() => { subscription.retry(); payments.retry(); }}>Actualizar estado</Button></header>
    {error && <ErrorNotice message={error} />}{success && <SuccessNotice>{success}</SuccessNotice>}
    {subscription.error ? <ErrorNotice message={subscription.error.message} retry={subscription.retry} /> : !data ? <Loading label="Consultando suscripción…" /> : <>
      <section aria-label="Estado de suscripción" className="surface p-6"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-medium text-muted-foreground">Plan actual</p><h2 className="mt-2 text-2xl font-bold">{data.plan ?? 'Sin plan comercial contratado'}</h2><p className="mt-2 text-sm">{data.legacy_access ? 'Acceso local conservado' : stateLabels[data.state] ?? data.state}</p></div>{data.price && <p className="text-xl font-semibold">{money(data.price.amount)}<span className="text-xs font-normal"> / {data.price.interval === 'MONTH' ? 'mes' : 'año'}</span></p>}</div>
        {data.legacy_access && <p className="mt-4 text-sm leading-6 text-muted-foreground">Este negocio conserva su acceso previo sin cuotas comerciales. No hay una suscripción pagada activa ni renovaciones automáticas.</p>}
        {data.period_end && <p className="mt-4 text-sm">Período: {billingDate(data.period_start)} — {billingDate(data.period_end)}.</p>}
        {!data.writable && <p className="mt-4 text-sm text-amber-900">Las nuevas operaciones están restringidas. Puedes seguir consultando y recuperando los datos autorizados.</p>}
        {data.cancel_at_period_end && <p className="mt-4 text-sm">Cancelación programada para {billingDate(data.period_end)}.</p>}
        {!data.legacy_access && ['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(data.state) && <Button className="mt-5" variant="outline" disabled={busy} onClick={() => setConfirmAction(data.cancel_at_period_end ? 'REACTIVATE' : 'CANCEL')}>{data.cancel_at_period_end ? 'Mantener suscripción' : 'Cancelar al finalizar el período'}</Button>}
      </section>
      <section aria-labelledby="usage-title" className="surface p-6"><h2 id="usage-title" className="text-lg font-semibold">Uso y condiciones</h2><dl className="mt-5 grid gap-4 sm:grid-cols-3">{Object.entries(data.usage).map(([key, value]) => <div key={key} className="rounded-xl bg-muted/50 p-4"><dt className="text-xs text-muted-foreground">{limitLabels[key] ?? key}</dt><dd className="mt-2 text-2xl font-semibold">{value}<span className="ml-1 text-xs font-normal text-muted-foreground">/ {data.limits[key] ?? 'sin cuota definida'}</span></dd>{data.limits[key] != null && value > data.limits[key]! && <p className="mt-2 text-xs text-amber-900">Sobre el límite: se conservan los registros existentes.</p>}</div>)}</dl><p className="mt-5 text-sm text-muted-foreground">Herramientas habilitadas: {data.features.map(f => featureLabels[f] ?? f).join(' · ') || 'Consulta y recuperación del historial'}.</p></section>
      <section aria-labelledby="plan-title">{chosenCode && catalog.data?.plans.some(p => p.code === chosenCode) && <p className="mb-4 rounded-xl border border-border bg-white p-4 text-sm">Plan elegido: <strong>{catalog.data.plans.find(p => p.code === chosenCode)?.name}</strong>. Revisa sus condiciones antes de contratar.</p>}<h2 id="plan-title" className="mb-2 text-xl font-semibold">Planes disponibles</h2><p className="mb-5 text-sm text-muted-foreground">Los cambios se solicitan para el próximo período, sin prorrateos ni cobros automáticos de diferencias.</p>{catalog.error ? <ErrorNotice message={catalog.error.message} retry={catalog.retry} /> : catalog.data ? <PlanCards catalog={catalog.data} busy={busy} select={(plan, priceId) => { setError(null); setSelection({ plan, priceId, requestId: crypto.randomUUID() }); }} /> : <Loading label="Consultando planes…" />}</section>
      {data.changes.length > 0 && <section className="surface p-6"><h2 className="text-lg font-semibold">Solicitudes comerciales</h2><ul className="mt-4 space-y-2 text-sm">{data.changes.map(c => <li key={c.id}>{({ CHANGE: 'Cambio de plan solicitado', TRIAL: 'Prueba iniciada', CANCEL: 'Cancelación solicitada', REACTIVATE: 'Continuidad solicitada' } as Record<string, string>)[c.action] ?? c.action} · {billingDate(c.effective_at)} · {c.applied ? 'Aplicada' : 'Registrada'}</li>)}</ul></section>}
    </>}
    <section aria-labelledby="payment-title" className="surface p-6"><h2 id="payment-title" className="text-lg font-semibold">Historial de pagos</h2><p className="mt-2 text-xs text-muted-foreground">Registros internos. No son boletas ni facturas tributarias.</p>{payments.error ? <ErrorNotice message={payments.error.message} retry={payments.retry} /> : !payments.data ? <Loading label="Consultando pagos…" /> : !payments.data.results.length ? <p className="mt-5 text-sm text-muted-foreground">Este negocio todavía no tiene pagos registrados.</p> : <><ul className="mt-5 divide-y divide-border">{payments.data.results.map(p => <li key={p.id} className="flex flex-wrap justify-between gap-3 py-4 text-sm"><div><p className="font-semibold">{money(p.amount, p.currency)}</p><p className="mt-1 text-xs text-muted-foreground">{billingDate(p.created_at)} · {p.provider === 'flow_sandbox' ? 'Flow · pruebas' : p.provider}</p></div><span>{({ PENDING: 'Pendiente', PAID: 'Confirmado', FAILED: 'Fallido', REFUNDED: 'Reembolsado' } as Record<string, string>)[p.state] ?? p.state}</span></li>)}</ul><div className="mt-4 flex items-center gap-3"><Button variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button><span className="text-sm">Página {page}</span><Button variant="outline" disabled={!payments.data.next} onClick={() => setPage(p => p + 1)}>Siguiente</Button></div></>}</section>
    <Link href="/planes" className="text-sm font-semibold text-primary underline underline-offset-4">Consultar comparación pública y preguntas frecuentes</Link>
    <Dialog open={!!selection} onOpenChange={open => { if (!open && !busy) setSelection(null); }} title={selection ? `Revisar ${selection.plan.name}` : 'Revisar plan'} description="Confirma las condiciones antes de continuar. Los datos existentes se conservan.">
      {selection && <div className="space-y-4"><p className="text-sm">Negocio: <strong>{business.name}</strong></p>{price ? <><p className="text-xl font-semibold">{money(price.amount, price.currency)} / {price.interval === 'MONTH' ? 'mes' : 'año'}</p><p className="text-sm text-muted-foreground">Inicio previsto: {data?.period_end && !data.legacy_access ? billingDate(data.period_end) : 'Tras confirmación del proveedor'}. Sin prorrateo.</p><p className="text-sm text-muted-foreground">{data?.checkout_enabled ? 'Checkout de pruebas. Este flujo no autoriza cobros recurrentes automáticos.' : 'Los pagos no están habilitados. Puedes registrar una solicitud de cambio sin activar el plan.'}</p><Button disabled={busy} className="w-full" onClick={() => change('CHANGE', { price_id: selection.priceId }, selection.requestId)}>Solicitar cambio de plan</Button><Button variant="outline" disabled={busy || !data?.checkout_enabled} className="w-full" onClick={checkout}>Continuar a Flow sandbox</Button></> : <><p className="text-sm">Prueba de {selection.plan.trial_days} días, sin cobro automático al finalizar.</p><Button disabled={busy} className="w-full" onClick={() => change('TRIAL', { version_id: selection.plan.version_id }, selection.requestId)}>Iniciar prueba</Button></>}{error && <ErrorNotice message={error} />}</div>}
    </Dialog>
    <Dialog open={!!confirmAction} onOpenChange={open => { if (!open && !busy) setConfirmAction(null); }} title={confirmAction === 'CANCEL' ? 'Cancelar al finalizar el período' : 'Mantener suscripción'} description="Esta acción no elimina trabajadores, marcaciones ni historial."><p className="mb-5 text-sm">{confirmAction === 'CANCEL' ? `Conservarás el acceso contratado hasta ${billingDate(data?.period_end ?? null)}. Después permanecerán la consulta y recuperación de datos.` : 'Se retira la cancelación programada. No se realiza ningún cobro.'}</p><Button disabled={busy} onClick={() => confirmAction && change(confirmAction)}>Confirmar solicitud</Button>{error && <ErrorNotice message={error} />}</Dialog>
  </div>;
}
