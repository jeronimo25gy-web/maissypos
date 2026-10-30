'use client'
import Acceso from '@/components/Acceso'
import BurbujasEntrada from '@/components/BurbujasEntrada'

// Entrada directa a MaissyPOS (la app instalada, cerrar sesion y sesion
// vencida llegan aqui). En la pagina comercial el acceso es un panel flotante.
export default function Entrar() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row" style={{ background: '#F3F1EA', color: '#1C1B19', fontFamily: 'var(--font-texto), system-ui, sans-serif' }}>
      {/* Mitad de marca: solo MaissyPOS, con burbujas del sistema en movimiento. */}
      <div className="relative overflow-hidden md:flex-1 flex flex-col justify-between gap-8 px-6 pt-8 pb-10 md:px-12 md:py-12" style={{ background: '#F2B21B' }}>
        <div aria-hidden="true" className="absolute rounded-full hidden md:block" style={{ right: -110, bottom: -130, width: 340, height: 340, border: '30px solid #C41230' }} />
        <h1 className="relative m-0 font-extrabold leading-none max-w-[12ch] text-[34px] md:text-[clamp(40px,4.4vw,60px)]" style={{ fontFamily: 'var(--font-titulo), Georgia, serif', letterSpacing: '-.02em' }}>
          Lo de cada día, <span style={{ color: '#C41230' }}>en orden.</span>
        </h1>
        <div className="hidden md:block"><BurbujasEntrada /></div>
        <p className="relative m-0 hidden md:block text-[15px] font-bold max-w-[300px]">Rutas · Despacho · Liquidación · Cartera · Inventario</p>
      </div>
      <div className="md:flex-1 flex items-start md:items-center justify-center px-4 py-8 md:p-12 -mt-6 md:mt-0 rounded-t-[24px] md:rounded-none relative" style={{ background: '#F3F1EA' }}>
        <Acceso />
      </div>
    </div>
  )
}
