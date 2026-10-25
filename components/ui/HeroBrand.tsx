export default function HeroBrand({ active, settled }: { active: boolean; settled: boolean }) {
  return <>
    <div className="intro-scanlines" aria-hidden="true" />
    <div className="hero-brand-layer" aria-hidden={!active}>
      <h1 className={`hero-name${settled ? ' is-settled' : ''}`}>
        <span className="hero-title-wrap">
          <span className="hero-title-main">MOHD HAFIZ</span>
          <span className="hero-chroma hero-chroma-pink" aria-hidden="true">MOHD HAFIZ</span>
          <span className="hero-chroma hero-chroma-blue" aria-hidden="true">MOHD HAFIZ</span>
          <span className="hero-smear" aria-hidden="true">MOHD HAFIZ</span>
          <span className="hero-title-scanlines" aria-hidden="true" />
          <svg className="hero-effects" viewBox="0 0 1000 220" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <defs>
              <filter id="hero-fisheye" x="-12%" y="-30%" width="124%" height="160%" colorInterpolationFilters="sRGB">
                <feTurbulence type="fractalNoise" baseFrequency="0.012 0.05" numOctaves="1" seed="7" result="signal" />
                <feDisplacementMap id="hero-displacement-map" in="SourceGraphic" in2="signal" scale="0" xChannelSelector="R" yChannelSelector="G" />
              </filter>
              <filter id="hero-noise-filter" x="-5%" y="-5%" width="110%" height="110%">
                <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="1" seed="13" />
              </filter>
            </defs>
            <rect className="hero-noise" width="100%" height="100%" filter="url(#hero-noise-filter)" />
          </svg>
        </span>
      </h1>
      <p className="hero-caption">Hello, World!<span className="hero-caption-cursor" aria-hidden="true">█</span></p>
      <p className={`brand-subtitle${settled ? ' is-settled' : ''}`} aria-hidden={!settled}>Web Designer | Kuala Lumpur, MY</p>
      <span className="brand-anchor" aria-hidden="true">MOHD HAFIZ</span>
    </div>
  </>;
}
