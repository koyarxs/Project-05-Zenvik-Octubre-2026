import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { Breadcrumb } from '@/lib/workspace-navigation';

export function WorkspaceBreadcrumbs({ items }: { items: Breadcrumb[] }) {
  return <nav aria-label="Ruta actual" className="min-w-0">
    <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
      {items.map((item, index) => <li key={`${index}:${item.label}`} className="flex min-w-0 items-center gap-1.5">
        {index > 0 && <ChevronRight aria-hidden="true" className="size-3 shrink-0" />}
        {item.href ? <Link href={item.href} title={item.label} className="max-w-32 truncate rounded-sm hover:text-primary hover:underline sm:max-w-48">{item.label}</Link> : <span aria-current="page" title={item.label} className="max-w-48 truncate font-medium text-foreground">{item.label}</span>}
      </li>)}
    </ol>
  </nav>;
}
