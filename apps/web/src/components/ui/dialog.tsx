'use client';
import { Dialog as Primitive } from 'radix-ui';
import { X } from 'lucide-react';
export function Dialog({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: React.ReactNode }) {
  return <Primitive.Root open={open} onOpenChange={onOpenChange}><Primitive.Portal>
    <Primitive.Overlay className="fixed inset-0 z-50 bg-[#101e30]/55" />
    <Primitive.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-white p-6 shadow-xl focus:outline-none sm:p-8">
      <p className="eyebrow mb-2 text-primary">ZENVIK / TU EQUIPO</p>
      <Primitive.Title className="pr-8 text-xl font-extrabold tracking-tight">{title}</Primitive.Title>
      <Primitive.Description className="mt-2 mb-6 text-sm leading-6 text-muted-foreground">{description}</Primitive.Description>
      {children}
      <Primitive.Close className="absolute top-4 right-4 rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Cerrar panel"><X className="size-5" /></Primitive.Close>
    </Primitive.Content>
  </Primitive.Portal></Primitive.Root>;
}
