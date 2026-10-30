'use client'
import { useState, useEffect } from 'react'
import { cargarPendientes } from '@/lib/pendientes'
import { useEmpresas, cambiarEmpresa } from '@/lib/empresas-ui'

// Tarjeta para escoger empresa: se abre desde el menu lateral o el encabezado
// (evento 'maissy:empresas'). En computador sale junto al menu; en el celular
// sube desde abajo. Alt + E pasa directo a la otra empresa. Despues de cambiar
// sale arriba el aviso "Ahora en ...".
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', rojo: '#C41230' }

export default function TarjetaEmpresas({ usuario }) {
  const { empresas, actual } = useEmpresas(usuario)
  const [abierta, setAbierta] = useState(false)
  const [pend, setPend] = useState({})
  const [aviso, setAviso] = useState(null)
  const conPendientes = usuario?.gerencia || ['admin', 'auxiliar'].includes(usuario?.rol)

  useEffect(() => {
    const abrir = () => setAbierta(true)
    const tecla = (e) => {
      if (e.key === 'Escape') setAbierta(false)
      if (e.altKey && (e.key === 'e' || e.key === 'E' || e.code === 'KeyE')) {
        e.preventDefault()
        const otras = empresas.filter(x => x.id !== actual?.id)
        if (otras.length === 1) cambiarEmpresa(otras[0]); else if (otras.length) setAbierta(true)
      }
    }
    window.addEventListener('maissy:empresas', abrir)
    window.addEventListener('keydown', tecla)
    return () => { window.removeEventListener('maissy:empresas', abrir); window.removeEventListener('keydown', tecla) }
  }, [empresas, actual])

  // Aviso despues de cambiar de empresa.
  useEffect(() => {
    try {
      const n = sessionStorage.getItem('maissy_aviso_empresa')
      if (n) { sessionStorage.removeItem('maissy_aviso_empresa'); setAviso(n); setTimeout(() => setAviso(null), 2200) }
    } catch { /* sin aviso */ }
  }, [])

  // Cuantos pendientes tiene cada empresa, al abrir.
  useEffect(() => {
    if (!abierta || !conPendientes) return
    empresas.forEach(e => cargarPendientes([e.id]).then(items => setPend(p => ({ ...p, [e.id]: items.length }))).catch(() => {}))
  }, [abierta, empresas, conPendientes])

  const logoAviso = empresas.find(e => e.nombre === aviso)?.logo
  return (
    <>
      {aviso && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[80] rounded-full px-4 py-2 text-[13.5px] font-bold text-white flex items-center gap-2 shadow-lg pointer-events-none"
          style={{ background: C.tinta, top: 'calc(env(safe-area-inset-top, 0px) + 14px)' }} role="status">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoAviso && <img src={logoAviso} alt="" className="h-[18px] w-auto rounded bg-white px-0.5" />}
          Ahora en {aviso}
        </div>
      )}
      {abierta && empresas.length > 1 && (
        <div className="fixed inset-0 z-[70]" onClick={() => setAbierta(false)}>
          <div className="absolute inset-0 bg-black/30 md:bg-transparent" />
          <div role="dialog" aria-label="Escoger empresa" onClick={e => e.stopPropagation()}
            className="absolute left-0 right-0 bottom-0 rounded-t-[22px] md:rounded-[18px] md:bottom-auto md:right-auto md:left-[84px] md:top-[64px] md:w-[350px] bg-white p-2.5 md:!pb-2.5 flex flex-col gap-1.5"
            style={{ boxShadow: '0 18px 50px rgba(28,27,25,.28)', color: C.tinta, paddingBottom: 'max(20px, calc(env(safe-area-inset-bottom, 0px) + 12px))' }}>
            <div className="md:hidden w-10 h-1 rounded-full self-center mb-1" style={{ background: C.linea }} />
            <div className="text-[11px] font-extrabold uppercase tracking-[.1em] px-2 pt-1" style={{ color: C.gris }}>Trabajar en</div>
            {empresas.map(e => {
              const esta = e.id === actual?.id
              const n = pend[e.id]
              return (
                <button key={e.id} type="button" aria-pressed={esta} onClick={() => (esta ? setAbierta(false) : cambiarEmpresa(e))}
                  className="grid items-center gap-3 rounded-[14px] p-2.5 text-left hover:bg-[#F3F1EA]"
                  style={{ gridTemplateColumns: '64px minmax(0,1fr) auto', boxShadow: esta ? `inset 0 0 0 2px ${C.tinta}` : undefined }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <span className="h-11 flex items-center justify-center">{e.logo ? <img src={e.logo} alt="" className="max-h-11 max-w-16 w-auto" /> : <b style={{ color: C.rojo }}>{e.corto}</b>}</span>
                  <span className="min-w-0"><b className="block text-[15px] truncate">{e.nombre}</b>{e.nit && <span className="block text-[12.5px]" style={{ color: C.gris }}>NIT {String(e.nit).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}</span>}</span>
                  {esta ? <span className="text-[11px] font-extrabold uppercase tracking-[.06em]">Actual</span>
                    : !conPendientes || n == null ? null
                    : n > 0 ? <span className="text-[12px] font-extrabold rounded-full px-2 whitespace-nowrap" style={{ color: C.rojo, border: `1.5px solid ${C.rojo}` }}>{n} pendientes</span>
                    : <span className="text-[12px] font-bold" style={{ color: C.gris }}>Al día</span>}
                </button>
              )
            })}
            <div className="hidden md:block text-[12px] px-2.5 pb-0.5" style={{ color: C.gris }}>
              Cambiar rápido: <kbd className="font-bold text-[11px] border rounded-md px-1.5" style={{ borderColor: C.linea }}>Alt</kbd> + <kbd className="font-bold text-[11px] border rounded-md px-1.5" style={{ borderColor: C.linea }}>E</kbd>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
