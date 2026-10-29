export default function BootGraph() {
  return <figure className="boot-graph" aria-hidden="true">
    <figcaption>BOOT TRACE · VISUAL ONLY</figcaption>
    <svg viewBox="0 0 320 120" fill="none" aria-hidden="true">
      <defs><linearGradient id="signal-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#8fb9d3" stopOpacity=".12" /><stop offset="1" stopColor="#8fb9d3" stopOpacity="0" /></linearGradient></defs>
      {[20, 50, 80, 110].map(y => <path key={y} d={`M0 ${y}H320`} stroke="#ffffff0c" />)}
      {[0, 80, 160, 240, 319].map(x => <path key={x} d={`M${x} 0V120`} stroke="#ffffff08" />)}
      <path className="signal-area" d="M0 112L24 112L35 95L46 112L69 112L81 76L94 109L113 109L126 91L143 103L159 103L174 57L188 98L205 98L219 74L232 93L251 93L266 43L282 88L301 88L320 67V120H0Z" fill="url(#signal-fill)" />
      <path className="signal-line" d="M0 112L24 112L35 95L46 112L69 112L81 76L94 109L113 109L126 91L143 103L159 103L174 57L188 98L205 98L219 74L232 93L251 93L266 43L282 88L301 88L320 67" stroke="#91b7cf" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  </figure>;
}
