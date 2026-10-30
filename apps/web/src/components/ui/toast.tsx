'use client';
import { Toast as Primitive } from 'radix-ui';
import { CheckCircle2, X } from 'lucide-react';
export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  return <Primitive.Provider duration={5000} swipeDirection="right"><Primitive.Root open={!!message} onOpenChange={open => { if (!open) onClose(); }} className="flex items-start gap-3 rounded-xl border border-[#b9dcd1] bg-white p-4 shadow-lg"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><Primitive.Title className="text-xs font-bold">Información actualizada</Primitive.Title><Primitive.Description className="mt-1.5 text-xs leading-5 text-muted-foreground">{message}</Primitive.Description></div><Primitive.Close aria-label="Cerrar aviso" className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted"><X className="size-4" /></Primitive.Close></Primitive.Root><Primitive.Viewport className="fixed right-5 bottom-5 z-[60] w-[360px] max-w-[calc(100vw_-_2.5rem)] list-none outline-none" /></Primitive.Provider>;
}
