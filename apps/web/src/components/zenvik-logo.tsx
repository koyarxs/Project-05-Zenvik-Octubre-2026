import Image from 'next/image';
import { cn } from '@/lib/utils';

export function ZenvikLogo({ className }: { className?: string }) {
  return <span className={cn('business-home-logo', className)} aria-hidden="true">
    <Image className="business-home-symbol" src="/images/zenvik-business-z.png" alt="" width={502} height={442} sizes="(max-width: 639px) 70px, 110px" />
    <span className="business-home-lettering"><Image src="/images/zenvik-business-logo.png" alt="" width={2172} height={724} sizes="(max-width: 639px) 220px, 350px" /></span>
  </span>;
}
