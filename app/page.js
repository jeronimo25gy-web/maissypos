import Image from 'next/image'
import Link from 'next/link'
import BurbujasEntrada from '@/components/BurbujasEntrada'

// Pagina comercial de MaissyPOS (maissypos.com). Solo la marca MaissyPOS:
// sin logos ni datos de ningun cliente. Los datos de las muestras son de
// ejemplo. La entrada al sistema esta en /entrar.
export const metadata = {
  title: 'MaissyPOS · Sistema para distribuidoras y fábricas',
  description: 'Despacho, venta en ruta, cierre del vendedor, liquidación, cartera, inventario y producción en un solo sistema.',
}

const WHATSAPP = 'https://wa.me/573148708098?text=' + encodeURIComponent('Hola, quiero probar MaissyPOS en mi negocio.')
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', suave: '#EFEDE6', rojo: '#C41230', rojoF: '#FBE9E9', amarillo: '#F2B21B', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8' }
const TITULO = 'var(--font-titulo), Georgia, serif'
const h2 = { fontFamily: TITULO, fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.02, textWrap: 'balance' }
const rotulo = 'text-[12px] font-bold tracking-[.06em]'
const pastilla = (color, fondo) => ({ color, background: fondo })

const Seccion = ({ id, rot, titulo, children }) => (
  <section id={id} className="flex flex-col gap-7 scroll-mt-6">
    <div className="flex flex-col gap-2 max-w-[720px]">
      <span className={rotulo} style={{ color: C.gris }}>{rot}</span>
      <h2 className="m-0 text-[32px] md:text-[48px]" style={h2}>{titulo}</h2>
    </div>
    {children}
  </section>
)

const Modulo = ({ titulo, texto, children }) => (
  <article className="bg-white rounded-[22px] p-6 flex flex-col gap-4">
    <div className="flex flex-col gap-1.5">
      <h3 className="m-0 text-[24px] font-extrabold" style={{ fontFamily: TITULO }}>{titulo}</h3>
      <p className="m-0 text-[15px]" style={{ color: C.gris }}>{texto}</p>
    </div>
    <div className="mt-auto">{children}</div>
  </article>
)

const Fila = ({ izq, children, ultima }) => (
  <div className="flex justify-between items-center gap-3 text-[14px] py-1.5" style={ultima ? undefined : { borderBottom: `1px solid ${C.linea}` }}>
    <span>{izq}</span>{children}
  </div>
)

const Pin = ({ x, y, n, estado }) => (
  <span className="absolute rounded-full flex items-center justify-center text-[12px] font-extrabold" style={{ left: `${x}%`, top: `${y}%`, width: estado === 'sig' ? 30 : 26, height: estado === 'sig' ? 30 : 26,
    ...(estado === 'ok' ? { background: C.verde, color: '#fff' } : estado === 'sig' ? { background: C.rojo, color: '#fff' } : { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.tinta}` }) }}>{n}</span>
)

const PASOS = [
  ['5:30 a. m.', 'Despacho', 'Se carga lo de cada ruta en orden. El sistema propone la base, avisa si no alcanza el inventario y saca primero lo producido hace más días. Sale la hoja para el vendedor.'],
  ['7:00 a. m.', 'En la calle', 'El vendedor sigue su rutero en el celular, vende con promos y precios por cliente, cobra cartera y manda el ticket por WhatsApp. La oficina ve la ruta en el mapa.'],
  ['6:00 p. m.', 'Cierre de ruta', 'Cuenta lo que trae de vuelta, anota transferencias, créditos y gastos, y envía su cierre. Si algo no cuadra, el sistema le dice qué revisar antes de enviar.'],
  ['7:00 p. m.', 'Liquidación', 'La oficina revisa el cuadre en vivo, verifica transferencias y aprueba. La cartera, la caja y el inventario quedan al día solos.'],
]

export default function Comercial() {
  return (
    <div className="min-h-screen" style={{ background: C.fondo, color: C.tinta, fontFamily: 'var(--font-texto), system-ui, sans-serif' }}>
      <div className="max-w-[1200px] mx-auto px-4 pt-5 pb-8 flex flex-col gap-20 md:gap-24">

        <nav aria-label="Principal" className="flex flex-wrap items-center justify-between gap-4 bg-white rounded-[28px] py-2.5 pr-2.5 pl-6">
          <Image src="/maissypos-logo.png" width={108} height={40} alt="MaissyPOS" style={{ height: 40, width: 'auto' }} priority />
          <div className="hidden lg:flex gap-7 font-semibold text-[15px]">
            <a href="#dia" className="hover:text-[#C41230]">Cómo funciona</a>
            <a href="#modulos" className="hover:text-[#C41230]">Módulos</a>
            <a href="#negocio" className="hover:text-[#C41230]">Para tu negocio</a>
            <a href="#contacto" className="hover:text-[#C41230]">Contacto</a>
          </div>
          <div className="flex gap-2 items-center">
            <Link href="/entrar" className="font-bold text-[15px] px-4 min-h-[44px] inline-flex items-center hover:text-[#C41230]">Entrar</Link>
            <a href="#contacto" className="hidden sm:inline-flex font-bold text-[15px] text-white rounded-full px-5 min-h-[48px] items-center" style={{ background: C.rojo }}>Probarlo en mi negocio</a>
          </div>
        </nav>

        <header className="flex flex-wrap gap-12 items-center">
          <div className="flex-[1_1_440px] min-w-0 flex flex-col gap-5">
            <span className="self-start bg-white rounded-full py-1.5 pl-2 pr-3.5 text-[13px] font-bold inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: C.amarillo }} />Para distribuidoras y fábricas de alimentos</span>
            <h1 className="m-0 text-[44px] md:text-[68px]" style={{ ...h2, lineHeight: 0.98, letterSpacing: '-.02em' }}>Tus rutas, tu planta y tu plata, <span style={{ color: C.rojo }}>cuadradas cada día.</span></h1>
            <p className="m-0 text-[18px] md:text-[19px] max-w-[52ch]" style={{ color: C.gris }}>MaissyPOS lleva el despacho, la venta en la calle, el cierre del vendedor y la liquidación en un solo sistema. El dueño ve lo que pasa en vivo; el vendedor vende desde el celular.</p>
            <div className="flex flex-wrap gap-2.5">
              <a href="#contacto" className="font-bold text-white rounded-2xl px-6 min-h-[54px] inline-flex items-center" style={{ background: C.rojo }}>Probarlo en mi negocio</a>
              <a href="#dia" className="font-bold bg-white rounded-2xl px-6 min-h-[54px] inline-flex items-center">Ver un día con MaissyPOS</a>
            </div>
          </div>
          <div className="flex-[1_1_480px] min-w-0 rounded-[32px] p-5 md:p-8 relative overflow-hidden" style={{ background: C.amarillo }}>
            <div aria-hidden="true" className="absolute rounded-full" style={{ right: -110, bottom: -130, width: 320, height: 320, border: `28px solid ${C.rojo}` }} />
            <BurbujasEntrada />
            <span className="relative block mt-3 text-[12px] font-semibold">Datos de ejemplo</span>
          </div>
        </header>

        <Seccion id="dia" rot="UN DÍA CON MAISSYPOS" titulo="Del cargue a la liquidación, sin papeles que se pierdan.">
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {PASOS.map(([hora, titulo, texto]) => (
              <article key={titulo} className="bg-white rounded-[22px] p-6 flex flex-col gap-2.5">
                <span className="font-extrabold text-[15px]" style={{ fontFamily: TITULO, color: C.rojo }}>{hora}</span>
                <h3 className="m-0 text-[22px] font-extrabold" style={{ fontFamily: TITULO }}>{titulo}</h3>
                <p className="m-0 text-[15px]" style={{ color: C.gris }}>{texto}</p>
              </article>
            ))}
          </div>
        </Seccion>

        <Seccion id="modulos" rot="MÓDULOS" titulo="Todo lo que mueve la plata del negocio.">
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            <Modulo titulo="Cartera que se cobra sola" texto="Plazos por cliente, abonos en la misma factura y quién paga a tiempo.">
              <Fila izq="Restaurante El Fogón"><span className="text-[12px] font-bold rounded-full px-2" style={pastilla(C.rojo, C.rojoF)}>Vencido hace 4 días</span></Fila>
              <Fila izq="Minimercado Laureles"><span className="text-[12px] font-bold rounded-full px-2" style={pastilla(C.ambar, C.ambarF)}>Vence vie 6 nov</span></Fila>
              <Fila izq="Tienda La 33" ultima><span className="text-[12px] font-bold rounded-full px-2" style={pastilla(C.verde, C.verdeF)}>Al día</span></Fila>
            </Modulo>
            <Modulo titulo="Producción por lote" texto="Cada cochada con su materia prima, su rendimiento y su gramaje, también sin internet en la planta.">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[['4', 'bultos de maíz'], ['1.180', 'arepas']].map(([v, t]) => <div key={t} className="rounded-[14px] py-2.5 px-1.5" style={{ background: C.suave }}><b className="block text-[22px]" style={{ fontFamily: TITULO }}>{v}</b><span className="text-[12px]" style={{ color: C.gris }}>{t}</span></div>)}
                <div className="rounded-[14px] py-2.5 px-1.5" style={{ background: C.verdeF, color: C.verde }}><b className="block text-[22px]" style={{ fontFamily: TITULO }}>98%</b><span className="text-[12px]">del estándar</span></div>
              </div>
            </Modulo>
            <Modulo titulo="Facturas con tu cuenta" texto="Tickets por WhatsApp y comprobantes en PDF con tu logo y la cuenta para transferir bien a la vista.">
              <div className="rounded-2xl px-4 py-3 flex flex-col gap-0.5" style={{ border: `2px solid ${C.tinta}` }}>
                <span className="text-[11px] font-extrabold tracking-[.12em]" style={{ color: C.rojo }}>PARA TRANSFERIR</span>
                <span className="text-[12.5px]" style={{ color: C.gris }}>Tu banco · Ahorros</span>
                <b className="text-[26px] tabular-nums" style={{ fontFamily: TITULO }}>123 456789 01</b>
              </div>
            </Modulo>
            <Modulo titulo="La ruta en el mapa" texto="Paradas numeradas, cuánto se demora por parada, a qué hora termina y dónde va el carro.">
              <div aria-hidden="true" className="relative h-[120px] rounded-2xl overflow-hidden" style={{ background: C.suave }}>
                <Pin x={10} y={30} n={1} estado="ok" /><Pin x={30} y={55} n={2} estado="ok" /><Pin x={52} y={25} n={3} estado="sig" /><Pin x={72} y={50} n={4} /><Pin x={86} y={22} n={5} />
              </div>
            </Modulo>
            <Modulo titulo="Inventario y compras" texto="Lo que hay en bodega, el conteo con descuadres y las compras con su precio de la última vez.">
              <Fila izq="Arepa Tela"><b className="tabular-nums">1.240 und</b></Fila>
              <Fila izq="Queso campesino"><b className="tabular-nums">86 und</b></Fila>
              <Fila izq="Bolsas de empaque" ultima><span className="text-[12px] font-bold rounded-full px-2" style={pastilla(C.ambar, C.ambarF)}>Pedir esta semana</span></Fila>
            </Modulo>
            <Modulo titulo="Nómina, costos y reportes" texto="Quincena con colillas, el costo real de cada producto y los indicadores del mes contra la meta.">
              <div aria-hidden="true" className="flex items-end gap-2 h-24" style={{ borderBottom: `1px solid ${C.linea}` }}>
                {[42, 58, 50, 74, 88].map((h, i) => <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: C.rojo }} />)}
                <div className="flex-1 rounded-t" style={{ height: '66%', background: C.amarillo }} />
              </div>
            </Modulo>
          </div>
        </Seccion>

        <Seccion id="negocio" rot="PARA TU NEGOCIO" titulo="Activa solo lo que tu negocio usa.">
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {[['Distribución', 'Para quien compra y reparte por rutas.', 'Despacho · Mi ruta · Liquidación · Mostrador · Domicilios · Cartera · Inventario · Compras'],
              ['Producción', 'Para quien fabrica y vende a distribuidores.', 'Control de planta · Fórmulas · Lotes · Costos · Ventas a distribuidores · Cartera']].map(([t, d, m]) => (
              <article key={t} className="bg-white rounded-[22px] p-6 flex flex-col gap-3">
                <h3 className="m-0 text-[26px] font-extrabold" style={{ fontFamily: TITULO }}>{t}</h3>
                <p className="m-0 text-[15px]" style={{ color: C.gris }}>{d}</p>
                <p className="m-0 text-[15px]">{m}</p>
              </article>
            ))}
            <article className="rounded-[22px] p-6 flex flex-col gap-3 text-white" style={{ background: C.tinta }}>
              <h3 className="m-0 text-[26px] font-extrabold" style={{ fontFamily: TITULO }}>Las dos, y varias empresas</h3>
              <p className="m-0 text-[15px]" style={{ color: '#D9D5CC' }}>Fábrica y distribuidora en un solo usuario: cada empresa con sus datos aparte y un informe de todo el grupo.</p>
            </article>
          </div>
        </Seccion>

        <section className="rounded-[32px] px-6 py-10 md:px-10 md:py-12 flex flex-wrap gap-10 items-center" style={{ background: C.amarillo }}>
          <div className="flex-[1_1_400px] min-w-0 flex flex-col gap-4">
            <span className="self-start text-white text-[13px] font-bold rounded-full px-3 py-1" style={{ background: C.tinta }}>Próximamente</span>
            <h2 className="m-0 text-[34px] md:text-[52px]" style={{ ...h2, lineHeight: 1 }}>Pregúntale a tu negocio por WhatsApp.</h2>
            <p className="m-0 text-[18px] max-w-[46ch]">Un asistente que conoce tus ventas, tu cartera y tus rutas, y responde con los números del sistema. Cada empresa ve solo lo suyo.</p>
          </div>
          <div className="flex-[0_1_360px] min-w-0 bg-white rounded-[26px] p-4 flex flex-col gap-2.5">
            <div className="flex items-center gap-2.5 pb-2.5" style={{ borderBottom: `1px solid ${C.linea}` }}>
              <span aria-hidden="true" className="w-9 h-9 rounded-full text-white font-extrabold inline-flex items-center justify-center" style={{ background: C.rojo, fontFamily: TITULO }}>M</span>
              <span><b className="block text-[15px]">Asistente MaissyPOS</b><span className="text-[12px]" style={{ color: C.verde }}>en línea</span></span>
            </div>
            <div className="self-end rounded-[14px_4px_14px_14px] px-3 py-2 text-[14px] max-w-[80%]" style={{ background: C.verdeF }}>¿Cuánto vendió la Ruta Norte ayer?</div>
            <div className="self-start rounded-[4px_14px_14px_14px] px-3 py-2.5 text-[14px] max-w-[88%]" style={{ background: C.suave }}>Ayer la Ruta Norte vendió <b>$2.465.900</b> en 80 tickets, 6% más que el jueves pasado. Quedan 2 créditos por cobrar hoy.</div>
            <span className="text-[12px] text-center" style={{ color: C.gris }}>Ejemplo de conversación</span>
          </div>
        </section>

        <section id="contacto" className="scroll-mt-6 bg-white rounded-[32px] px-6 py-10 md:px-10 md:py-12 flex flex-wrap gap-8 items-center justify-between">
          <div className="flex-[1_1_440px] min-w-0 flex flex-col gap-2.5">
            <h2 className="m-0 text-[32px] md:text-[48px]" style={{ ...h2, lineHeight: 1 }}>Te mostramos tu negocio en MaissyPOS.</h2>
            <p className="m-0 text-[17px]" style={{ color: C.gris }}>Escríbenos y lo armamos con tus rutas y tus productos, para que lo veas funcionando antes de decidir.</p>
          </div>
          <div className="flex flex-col gap-2 items-start">
            <a href={WHATSAPP} target="_blank" rel="noreferrer" className="font-bold text-white text-[17px] rounded-2xl px-7 min-h-[56px] inline-flex items-center" style={{ background: C.rojo }}>Escribir por WhatsApp</a>
            <span className="text-[15px] font-bold select-all">314 870 8098</span>
          </div>
        </section>

        <footer className="flex flex-wrap justify-between items-center gap-4 pt-6 text-[14px]" style={{ borderTop: `1px solid ${C.linea}`, color: C.gris }}>
          <Image src="/maissypos-logo.png" width={86} height={32} alt="MaissyPOS" style={{ height: 32, width: 'auto' }} />
          <span>Hecho en Medellín, Colombia</span>
          <Link href="/entrar" className="font-bold" style={{ color: C.tinta }}>Entrar a MaissyPOS</Link>
        </footer>
      </div>
    </div>
  )
}
