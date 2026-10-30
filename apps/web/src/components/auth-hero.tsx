import Image from 'next/image';
import { BrandMark } from './brand-mark';

export function AuthHero() {
  return <section className="relative hidden min-h-[780px] overflow-hidden bg-[#d9dfda] lg:block" aria-label="Zenvik, personas y trabajo en sintonía">
    <Image src="/images/auth-cafe-v1.png" alt="" fill priority sizes="(min-width: 1280px) 52vw, 50vw" quality={85} className="object-cover object-[50%_48%]" />
    <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[34%] bg-gradient-to-b from-[#fffdf8]/95 via-[#fffdf8]/60 to-transparent" />
    <div className="absolute top-10 left-10 z-10 xl:top-12 xl:left-14">
      <div className="flex items-center gap-3.5 text-[#14263d]">
        <BrandMark className="h-16 w-16 shrink-0" />
        <div><p className="font-display text-[40px] leading-none font-extrabold tracking-[-.075em]">zenvik<span className="text-[#167e8e]">.</span></p><p className="mt-2.5 text-[8px] leading-[1.7] font-semibold tracking-[.28em] text-[#4c626d]">MODERN WORKFORCE<br />OPERATING SYSTEM</p></div>
      </div>
    </div>
  </section>;
}
