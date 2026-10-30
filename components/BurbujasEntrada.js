// Mitad de marca de la entrada: burbujas con muestras del sistema que entran
// una tras otra, se acomodan como rompecabezas, salen y vuelven a empezar.
// Datos de ejemplo, sin marca de ningun cliente (la entrada es de MaissyPOS).
const C = { tinta: '#1C1B19', gris: '#5A5750', linea: '#E3E1D8', suave: '#EFEDE6', rojo: '#C41230', rojoF: '#FBE9E9', verde: '#2E5E3A', verdeF: '#E6F0E8', amarillo: '#F2B21B' }
const TITULO = 'var(--font-titulo), Georgia, serif'
const tarjeta = { background: '#fff', borderRadius: 20, padding: 16, display: 'flex', flexDirection: 'column', gap: 6, boxShadow: '0 16px 40px rgba(28,27,25,.14)', minWidth: 0 }
const pieza = (area, dx, dy, retraso) => ({ ...tarjeta, gridArea: area, '--dx': `${dx}px`, '--dy': `${dy}px`, animationDelay: `${retraso}s` })
const fila = { display: 'flex', justifyContent: 'space-between', gap: 8 }
const pastilla = (color, fondo) => ({ alignSelf: 'flex-start', fontSize: 12, fontWeight: 700, color, background: fondo, borderRadius: 999, padding: '2px 9px' })
const pin = (x, y, n, estado) => (
  <span style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: estado === 'sig' ? 26 : 22, height: estado === 'sig' ? 26 : 22, borderRadius: '50%', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
    ...(estado === 'ok' ? { background: C.verde, color: '#fff' } : estado === 'sig' ? { background: C.rojo, color: '#fff' } : { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.tinta}` }) }}>{n}</span>
)

export default function BurbujasEntrada() {
  return (
    <div aria-hidden="true" className="relative grid gap-3 max-w-[540px] text-[14px]" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridTemplateAreas: "'a b' 'a c' 'd e' 'f e'", color: C.tinta }}>
      <div className="burbuja" style={pieza('a', -60, -30, 0)}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: C.gris }}>CUADRE EN VIVO</span>
        <div style={fila}><span style={{ color: C.gris }}>Vendido</span><b className="tabular-nums">$2.465.900</b></div>
        <div style={fila}><span style={{ color: C.gris }}>Base</span><b className="tabular-nums">+$70.000</b></div>
        <div style={{ ...fila, borderTop: `1px solid ${C.linea}`, paddingTop: 6 }}><b>Debe entregar</b><b className="tabular-nums">$2.535.900</b></div>
        <div style={{ ...fila, background: C.verdeF, color: C.verde, borderRadius: 12, padding: '8px 10px', fontWeight: 800, marginTop: 'auto' }}><span>Diferencia</span><span>Cuadra</span></div>
      </div>
      <div className="burbuja" style={pieza('b', 60, -40, 0.35)}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.gris }}>Vendido hoy</span>
        <b className="tabular-nums" style={{ fontFamily: TITULO, fontSize: 24, lineHeight: 1.1 }}>$1.284.000</b>
        <div style={{ height: 6, borderRadius: 3, background: C.suave }}><div style={{ width: '64%', height: 6, borderRadius: 3, background: C.amarillo }} /></div>
      </div>
      <div className="burbuja" style={pieza('c', 70, 10, 0.7)}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.gris }}>Ticket enviado por WhatsApp</span>
        <b>#0412 · Tienda La Esquina</b>
        <span className="tabular-nums" style={{ fontSize: 13, color: C.gris }}>$49.000 · Efectivo</span>
      </div>
      <div className="burbuja" style={pieza('d', -70, 20, 1.05)}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.gris }}>Cartera</span>
        <span style={pastilla(C.rojo, C.rojoF)}>Vencido hace 4 días</span>
        <span style={pastilla(C.verde, C.verdeF)}>Al día · 38 clientes</span>
      </div>
      <div className="burbuja" style={pieza('e', 60, 50, 1.4)}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.gris }}>Ruta Norte · parada 47 de 106</span>
        <div style={{ position: 'relative', flex: 1, minHeight: 110, background: C.suave, borderRadius: 14 }}>
          {pin(12, 22, 45, 'ok')}{pin(40, 58, 46, 'ok')}{pin(62, 18, 47, 'sig')}{pin(76, 62, 48)}
        </div>
        <span style={{ fontSize: 12.5, color: C.gris }}>Termina cerca de 5:40 p. m.</span>
      </div>
      <div className="burbuja" style={pieza('f', -50, 60, 1.75)}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.gris }}>Lote de cocción · 4 bultos</span>
        <div style={{ ...fila, alignItems: 'baseline' }}><b className="tabular-nums" style={{ fontFamily: TITULO, fontSize: 22 }}>1.180 arepas</b><span style={pastilla(C.verde, C.verdeF)}>98%</span></div>
      </div>
    </div>
  )
}
