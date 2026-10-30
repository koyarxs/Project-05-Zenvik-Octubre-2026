'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useWorkspace } from './workspace-provider';
import { Button } from './ui/button';
import { ErrorNotice } from './feedback';
import type { Business } from '@/lib/types';
export function BusinessGate({ children }: { children: (business: Business) => React.ReactNode }) {
  const { businessId } = useParams<{ businessId: string }>(); const { businesses } = useWorkspace();
  const business = businesses.find(b => b.id === businessId);
  if (!business) return <><h1 className="text-2xl font-semibold">Negocio no disponible</h1><ErrorNotice message="No encontramos este negocio entre tus espacios disponibles." /><Button asChild variant="outline"><Link href="/app">Volver a mis negocios</Link></Button></>;
  return children(business);
}
