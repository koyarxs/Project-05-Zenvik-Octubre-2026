import type { LucideIcon } from 'lucide-react';
export function EmptyState({ icon: Icon, title, description, action, compact = false }: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode; compact?: boolean }) {
  return <div className={compact ? 'px-6 py-8 text-center' : 'px-6 py-14 text-center'}><span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl border border-[#dce9ec] bg-[#eff7f7] text-primary"><Icon className="size-5" /></span><h3 className="text-sm font-bold">{title}</h3><p className="mx-auto mt-2 max-w-sm text-xs leading-6 text-muted-foreground">{description}</p>{action && <div className="mt-5 flex justify-center">{action}</div>}</div>;
}
