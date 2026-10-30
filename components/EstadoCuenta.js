'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { cerrarSesionUsuario } from '@/lib/sesion'

// Estado de la cuenta del cliente en MaissyPOS. Suspendida: pantalla completa,
// no se ve nada del sistema. Demo: aviso arriba con los dias que quedan; al
// vencer queda en solo lectura. La regla real esta en la base de datos.
const WHATSAPP = 'https://wa.me/573148708098?text=' + encodeURIComponent('Hola, quiero activar mi plan de MaissyPOS.')
const fecha = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')

export default function EstadoCuenta() {
  const router = useRouter()
  const [plan, setPlan] = useState(null)
  const [borrando, setBorrando] = useState(false)
  const [nota, setNota] = useState('')

  useEffect(() => {
    let vivo = true
    const cargar = () => supabase.rpc('mi_plan').then(({ data }) => { if (vivo) setPlan(data?.[0] || null) })
    cargar()
    const t = setInterval(cargar, 300000)
    return () => { vivo = false; clearInterval(t) }
  }, [])

  if (!plan || plan.estado === 'activo') return null

  if (plan.estado === 'suspendido') {
    const salir = async () => {
      const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
      await cerrarSesionUsuario(u?.id); localStorage.removeItem('maissy_usuario'); router.replace('/entrar')
    }
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" style={{ background: '#F3F1EA', color: '#1C1B19', fontFamily: 'var(--font-texto), system-ui, sans-serif' }} role="alertdialog" aria-label="Cuenta suspendida">
        <div className="w-full max-w-[420px] flex flex-col gap-4 bg-white rounded-[24px] p-6">
          <Image src="/maissypos-logo.png" width={150} height={56} alt="MaissyPOS" style={{ width: '150px', height: 'auto' }} />
          <h1 className="m-0 text-[26px] font-extrabold leading-tight" style={{ fontFamily: 'var(--font-titulo), Georgia, serif' }}>Tu cuenta está suspendida</h1>
          <p className="m-0 text-[15px]" style={{ color: '#5A5750' }}>Tus datos están guardados. Escríbenos para reactivarla.</p>
          <a href={WHATSAPP} target="_blank" rel="noreferrer" className="min-h-[50px] rounded-2xl text-white font-bold flex items-center justify-center" style={{ background: '#C41230' }}>Escribir por WhatsApp</a>
          <button type="button" onClick={salir} className="min-h-[44px] rounded-2xl font-bold" style={{ background: '#EFEDE6' }}>Cerrar sesión</button>
        </div>
      </div>
    )
  }

  const gerencia = (() => { try { return !!JSON.parse(localStorage.getItem('maissy_usuario') || 'null')?.gerencia } catch { return false } })()
  const borrarEjemplos = async () => {
    if (!confirm('¿Borrar los productos, clientes y la ruta de ejemplo? Lo que ya hayas usado en una venta o un despacho se queda.')) return
    setBorrando(true)
    const { data, error } = await supabase.rpc('demo_borrar_ejemplos')
    setBorrando(false)
    if (error) { setNota('No se pudo borrar. Intenta de nuevo.'); return }
    const r = data?.[0]
    setNota(r?.conservados ? `Se borraron ${r.borrados}. Quedaron ${r.conservados} que ya usaste.` : 'Datos de ejemplo borrados.')
    setPlan({ ...plan, ejemplos: 0 })
    setTimeout(() => window.location.reload(), 1500)
  }
  const vencida = plan.estado === 'vencido' || (plan.dias != null && plan.dias < 0)
  if (plan.estado !== 'demo' && !vencida) return null
  const urgente = !vencida && plan.dias != null && plan.dias <= 3
  const estilo = vencida ? { background: '#fff', color: '#1C1B19', boxShadow: 'inset 0 -2px 0 #1C1B19' } : urgente ? { background: '#FBE9E9', color: '#C41230' } : { background: '#FFF4CC', color: '#8A5A00' }
  const titulo = vencida ? 'Tu prueba terminó' : urgente ? (plan.dias === 0 ? 'Tu prueba termina hoy' : `Tu prueba termina el ${fecha(plan.demo_hasta)}`) : plan.dias != null ? `Estás probando MaissyPOS · quedan ${plan.dias} días` : 'Estás probando MaissyPOS'
  const texto = vencida ? 'Puedes ver lo que cargaste, pero no registrar nada nuevo. Tus datos se guardan.' : urgente ? 'Para seguir con todo lo que ya cargaste, activa tu plan. No se borra nada.' : ''
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 text-[14px] print:hidden" style={{ ...estilo, fontFamily: 'var(--font-texto), system-ui, sans-serif' }} role="status">
      <b className="mr-auto" style={{ color: urgente ? '#C41230' : '#1C1B19' }}>{titulo}</b>
      {texto && <span className="flex-1 min-w-[180px]" style={{ color: urgente ? '#1C1B19' : '#5A5750' }}>{texto}</span>}
      {nota && <span style={{ color: '#1C1B19' }}>{nota}</span>}
      {!vencida && gerencia && plan.ejemplos > 0 && <button type="button" onClick={borrarEjemplos} disabled={borrando} className="rounded-xl min-h-[38px] px-3.5 font-bold text-[13.5px] bg-white disabled:opacity-50" style={{ color: '#1C1B19' }}>{borrando ? 'Borrando…' : 'Borrar datos de ejemplo'}</button>}
      <a href={WHATSAPP} target="_blank" rel="noreferrer" className="rounded-xl min-h-[38px] px-3.5 font-bold text-[13.5px] text-white inline-flex items-center" style={{ background: '#C41230' }}>Activar mi plan</a>
    </div>
  )
}
