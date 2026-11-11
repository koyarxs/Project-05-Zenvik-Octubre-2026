'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useResource } from '@/hooks/use-resource';
import { employeePath } from '@/lib/data';
import { canManage, type Business, type Employee, type Page } from '@/lib/types';
import { businessNavigation } from '@/lib/workspace-navigation';
import { ErrorNotice, Loading } from './feedback';
import { Dialog } from './ui/dialog';
import { Input } from './ui/input';

export function WorkspaceSearch({ business, businesses }: { business?: Business; businesses: Business[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.defaultPrevented && !document.querySelector('[role="dialog"], #primary-nav[role="dialog"]')) {
        event.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);
  function close(next: boolean) {
    setOpen(next);
    if (!next) setQuery('');
  }
  const term = query.trim().toLocaleLowerCase('es');
  const destinations = businessNavigation(business).filter(item => item.label.toLocaleLowerCase('es').includes(term));
  const matches = businesses.filter(item => item.name.toLocaleLowerCase('es').includes(term) || item.rut.toLowerCase().includes(term)).slice(0, 5);
  return <>
    <button type="button" className="private-search-trigger" aria-label="Abrir buscador global" onClick={() => setOpen(true)}><Search size={18} /><span>{business ? 'Buscar trabajadores, turnos, permisos…' : 'Buscar negocio o RUT…'}</span><kbd>Ctrl + K</kbd></button>
    <Dialog open={open} onOpenChange={close} title="Buscar en Zenvik" description={business ? `Explora los módulos y registros disponibles en ${business.name}.` : 'Encuentra un negocio al que tengas acceso.'}>
      <Input aria-label="Buscar en Zenvik" value={query} onChange={event => setQuery(event.target.value)} maxLength={100} placeholder={business ? 'Nombre de trabajador, módulo o negocio' : 'Nombre del negocio o RUT'} />
      <div className="private-search-results">
        {business && canManage(business.role) && term.length >= 2 && <WorkerMatches key={business.id} business={business} term={term} close={() => close(false)} />}
        {!!matches.length && <section><h3>Negocios</h3>{matches.map(item => <Link key={item.id} href={`/app/${item.id}`} onClick={() => close(false)}>{item.name}<ChevronRight size={15} /></Link>)}</section>}
        {!!destinations.length && <section><h3>Módulos</h3>{destinations.map(item => <Link key={item.id} href={item.href} onClick={() => close(false)}>{item.label}<ChevronRight size={15} /></Link>)}</section>}
        {!matches.length && !destinations.length && (!business || !canManage(business.role) || term.length < 2) && <p className="text-sm text-muted-foreground">No hay coincidencias.</p>}
      </div>
    </Dialog>
  </>;
}

function WorkerMatches({ business, term, close }: { business: Business; term: string; close: () => void }) {
  const search = useDebouncedValue(term);
  const resource = useResource<Page<Employee>>(`${employeePath(business.id)}?${new URLSearchParams({ search })}`);
  return <section><h3>Trabajadores</h3>
    {search !== term ? <Loading label="Buscando trabajadores…" /> : resource.error ? <ErrorNotice message={resource.error.message} retry={resource.retry} /> : !resource.data ? <Loading label="Buscando trabajadores…" /> : resource.data.results.length ? resource.data.results.slice(0, 5).map(person => <Link key={person.id} href={`/app/${business.id}/trabajadores/${person.id}`} onClick={close}>{person.first_name} {person.last_name}<ChevronRight size={15} /></Link>) : <p className="text-sm text-muted-foreground">No hay trabajadores que coincidan.</p>}
  </section>;
}
