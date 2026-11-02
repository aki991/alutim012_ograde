import logoUrl from '../../assets/logo.png';

/** Znak ALU TIM 012 (okrugli logotip, providna pozadina). */
export function LogoMark({ size = 40 }: { size?: number }) {
  return <img src={logoUrl} width={size} height={size} alt="ALU TIM 012" className="block shrink-0 select-none" draggable={false} data-testid="logo" />;
}

export function Logo() {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <LogoMark size={128} />
      <div className="text-[10px] tracking-wider text-white/70 uppercase">Ograde i kapije po meri</div>
    </div>
  );
}
