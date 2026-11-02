/** Znak ALU TIM 012: crveni trougao sa belim zamahom. */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M3 34L19 5l7 12-6-2-9 19z" fill="#d71920" />
      <path d="M14 34l8-14 4 7 4-3 4 10z" fill="#fff" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-none">
        <div className="text-[24px] font-extrabold tracking-wide text-white">ALU <span className="text-[#ff3b41]">TIM</span></div>
        <div className="mt-1 flex items-center gap-2">
          <span className="h-[2px] w-5 bg-[#d71920]" />
          <span className="text-[13px] font-bold tracking-[0.2em] text-[#ff3b41]">012</span>
        </div>
        <div className="mt-1.5 text-[9.5px] tracking-wider text-white/70 uppercase">Ograde i kapije po meri</div>
      </div>
    </div>
  );
}
