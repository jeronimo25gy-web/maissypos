'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { generarYCompartirPDF } from '@/lib/compartir'
import { puedeVerModulo } from '@/lib/permisos'
import { PageHeader } from '@/components/ui'
import ComprobanteVenta from '@/components/ComprobanteVenta'
import DocumentoAEscala from '@/components/DocumentoAEscala'
import { cuentaMostrador } from '@/lib/cuenta-pago'
import RegistrarVenta from './RegistrarVenta'
import { cargarPromos } from '@/lib/promociones'

const mesActual = () => obtenerFechaActual().slice(0, 7)

const rangoMes = (mes) => {
  const [y, m] = mes.split('-').map(Number)
  const inicio = `${mes}-01`
  const ultimoDia = new Date(y, m, 0).getDate()
  const fin = `${mes}-${String(ultimoDia).padStart(2, '0')}`
  return { inicio, fin }
}


const formatearHora = (isoString) => new Date(isoString).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })


export default function Ventas() {
  const [usuario, setUsuario] = useState(null)
  const [vista, setVista] = useState('registrar')
  const [mesHistorial, setMesHistorial] = useState(mesActual())
  const [historial, setHistorial] = useState([])
  const [cargandoHistorial, setCargandoHistorial] = useState(false)

  const [factura, setFactura] = useState(null)
  const [cargandoFactura, setCargandoFactura] = useState(false)
  const [compartiendo, setCompartiendo] = useState(false)

  const [facturasDian, setFacturasDian] = useState({})
  const [subiendoDian, setSubiendoDian] = useState(null)
  const [abriendoFacturaId, setAbriendoFacturaId] = useState(null)

  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/entrar'); return }
    const parsed = JSON.parse(u)
    if (!puedeVerModulo(parsed, 'ventas', ['admin', 'auxiliar'])) { router.push('/despacho'); return }
    setUsuario(parsed)
  }, [])

  const cargarFacturasDian = async (ventaIds) => {
    if (!ventaIds || ventaIds.length === 0) return
    const { data } = await supabase.from('facturas_electronicas').select('*').in('venta_id', ventaIds)
    if (!data) return
    setFacturasDian(prev => {
      const next = { ...prev }
      data.forEach(f => { next[f.venta_id] = f })
      return next
    })
  }

  const subirFacturaDian = async (venta, file) => {
    if (!file) return
    if (file.type !== 'application/pdf') { alert('Sube el PDF de la factura tal como lo descargas de Siigo'); return }
    setSubiendoDian(venta.id)
    const empresaId = getEmpresaId()
    const path = `${empresaId}/${venta.id}-${Date.now()}.pdf`
    const { error: errUpload } = await supabase.storage.from('facturas').upload(path, file)
    if (errUpload) { alert('Error subiendo el archivo: ' + errUpload.message); setSubiendoDian(null); return }
    // Se guarda la ruta del archivo, no una URL publica permanente -- el
    // bucket ya no permite lectura publica, cada vista genera un link
    // temporal (ver abrirFacturaDian).
    const { data: nueva, error } = await supabase.from('facturas_electronicas').insert({
      empresa_id: empresaId,
      venta_id: venta.id,
      cliente_id: venta.cliente_id || null,
      archivo_url: path,
      subido_por: usuario.nombre,
    }).select().single()
    setSubiendoDian(null)
    if (error) { alert('El archivo se subió pero no se pudo registrar: ' + error.message); return }
    setFacturasDian(prev => ({ ...prev, [venta.id]: nueva }))
  }

  const abrirFacturaDian = async (f) => {
    setAbriendoFacturaId(f.id)
    const { data, error } = await supabase.storage.from('facturas').createSignedUrl(f.archivo_url, 3600)
    setAbriendoFacturaId(null)
    if (error) { alert('No se pudo abrir la factura: ' + error.message); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const cargarHistorial = async (mes) => {
    setCargandoHistorial(true)
    const { inicio, fin } = rangoMes(mes)
    const { data } = await supabase
      .from('ventas_encab')
      .select('*')
      .eq('empresa_id', getEmpresaId())
      .gte('fecha', inicio)
      .lte('fecha', fin)
      .order('created_at', { ascending: false })
    setHistorial(data || [])
    await cargarFacturasDian((data || []).map(v => v.id))
    setCargandoHistorial(false)
  }

  const irAHistorial = () => {
    setVista('historial')
    cargarHistorial(mesHistorial)
  }

  const cambiarMesHistorial = (mes) => {
    setMesHistorial(mes)
    cargarHistorial(mes)
  }

  // Comprobante: una venta, o las dos partes de una venta mixta (Distri + Arepas).
  const abrirFactura = async (venta) => {
    setCargandoFactura(true)
    let ventas = [venta]
    if (venta.grupo_id) {
      const { data } = await supabase.from('ventas_encab').select('*').eq('grupo_id', venta.grupo_id).order('empresa_id')
      if (data?.length) ventas = [...data].sort((a, b) => (b.empresa_id === getEmpresaId()) - (a.empresa_id === getEmpresaId()))
    }
    const partes = await Promise.all(ventas.map(async v => {
      const [{ data: detalle }, { data: prods }, { data: emp }, promos, { data: cuenta }, { data: cart }] = await Promise.all([
        supabase.from('ventas_detalle').select('*').eq('venta_id', v.id).eq('empresa_id', v.empresa_id),
        supabase.from('productos').select('sku, nombre').eq('empresa_id', v.empresa_id),
        supabase.from('empresas').select('*').eq('id', v.empresa_id).maybeSingle(),
        cargarPromos(v.empresa_id),
        v.cuenta_id ? supabase.from('cuentas').select('*').eq('id', v.cuenta_id).maybeSingle() : Promise.resolve({ data: null }),
        v.forma_pago === 'fiado' ? supabase.from('cartera_fiados').select('fecha_pago').eq('venta_id', v.id).eq('empresa_id', v.empresa_id).maybeSingle() : Promise.resolve({ data: null }),
      ])
      let deudaTotal = 0
      if (v.forma_pago === 'fiado' && v.cliente_id) {
        const { data: deudas } = await supabase.from('cartera_fiados').select('saldo').eq('cliente_id', v.cliente_id).eq('estado', 'pendiente').eq('empresa_id', v.empresa_id)
        deudaTotal = (deudas || []).reduce((s, x) => s + Number(x.saldo || 0), 0)
      }
      // Cuenta para transferir: a la que llego la transferencia, o la del mostrador si es credito.
      const cuentaTransferir = v.forma_pago === 'transferencia' ? (cuenta?.numero ? cuenta : null) : v.forma_pago === 'fiado' ? await cuentaMostrador(v.empresa_id) : null
      return {
        venta: v, detalle: detalle || [], nombresPorSku: Object.fromEntries((prods || []).map(p => [p.sku, p.nombre])), empresa: emp,
        promos, cuenta, cuentaTransferir, credito: cart ? { fecha_pago: cart.fecha_pago, deudaTotal } : null,
      }
    }))
    const { data: domi } = await supabase.from('domicilios').select('tipo, km, domiciliario, direccion, apto, barrio, nota, valor_domicilio').eq('venta_encab_id', venta.id).maybeSingle()
    setFactura({ venta: partes[0].venta, partes, domicilio: domi || null })
    setCargandoFactura(false)
  }

  const BotonFacturaDian = ({ venta }) => {
    const f = facturasDian[venta.id]
    if (f) {
      return (
        <button onClick={() => abrirFacturaDian(f)} disabled={abriendoFacturaId === f.id}
          className="text-xs bg-emerald-50 text-emerald-700 px-3 py-2 rounded-lg font-bold disabled:opacity-50">
          {abriendoFacturaId === f.id ? 'Abriendo...' : 'Factura DIAN'}
        </button>
      )
    }
    return (
      <label className={`text-xs px-3 py-2 rounded-lg font-bold cursor-pointer ${subiendoDian === venta.id ? 'bg-gray-100 text-gray-400' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
        {subiendoDian === venta.id ? 'Subiendo...' : 'Subir factura DIAN'}
        <input type="file" accept="application/pdf" className="hidden" disabled={subiendoDian === venta.id}
          onChange={e => subirFacturaDian(venta, e.target.files?.[0])} />
      </label>
    )
  }

  if (!usuario) return null

  if (factura) {
    const { venta } = factura
    const numeroFactura = `CV-${String(venta.numero || 0).padStart(8, '0')}`
    const compartirFactura = async () => {
      setCompartiendo(true)
      try { await generarYCompartirPDF('factura-imprimible', numeroFactura) }
      finally { setCompartiendo(false) }
    }
    return (
      <>
        <style>{`
          @media print { .no-print { display: none !important; } body { margin: 0; background: white; } .doc-escala { transform: none !important; } .doc-marco { height: auto !important; overflow: visible !important; } .marco-doc { padding: 0 !important; background: white !important; } }
          table { width: 100%; border-collapse: collapse; }
        `}</style>
        <div className="no-print px-4 py-3 flex flex-wrap gap-2 items-center sticky top-0 z-10" style={{ background: '#F3F1EA' }}>
          <button onClick={() => setFactura(null)} className="rounded-xl min-h-[42px] px-4 font-bold text-sm" style={{ background: '#EFEDE6', color: '#1C1B19' }}>Volver</button>
          <span className="flex-1" />
          <button onClick={() => window.print()} className="rounded-xl min-h-[42px] px-4 font-bold text-sm" style={{ background: '#EFEDE6', color: '#1C1B19' }}>Imprimir</button>
          <button onClick={compartirFactura} disabled={compartiendo} className="rounded-xl min-h-[42px] px-5 font-bold text-sm text-white bg-brand disabled:opacity-50">
            {compartiendo ? 'Generando…' : 'Compartir PDF'}
          </button>
        </div>

        <div className="marco-doc px-3 pb-6 md:px-6" style={{ background: '#F3F1EA' }}>
          <div style={{ maxWidth: 794, margin: '0 auto', boxShadow: '0 10px 30px rgba(28,27,25,.10)' }}>
            <DocumentoAEscala ancho={794}>
              <div id="factura-imprimible" style={{ padding: '44px 52px 32px', background: 'white', boxSizing: 'border-box', width: 794 }}>
                <ComprobanteVenta partes={factura.partes} domicilio={factura.domicilio} />
              </div>
            </DocumentoAEscala>
          </div>
        </div>
      </>
    )
  }

  return (
    <div style={{ background: '#F3F1EA', minHeight: '100vh', color: '#1C1B19' }}>
      <PageHeader title="Mostrador" />

      <div className={`p-4 mx-auto ${vista === 'registrar' ? 'max-w-6xl' : 'max-w-2xl'}`}>
        <div className="flex gap-2 mb-4" role="group" aria-label="Vista">
          {[['registrar', 'Registrar', () => setVista('registrar')], ['historial', 'Historial', irAHistorial]].map(([v, t, fn]) => (
            <button key={v} onClick={fn} aria-pressed={vista === v} className="px-4 min-h-[40px] rounded-full text-sm font-bold"
              style={vista === v ? { background: '#1C1B19', color: '#fff' } : { background: '#fff', color: '#5A5750' }}>{t}</button>
          ))}
        </div>

        {vista === 'historial' ? (
          <div>
            <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
              <label className="text-xs font-bold text-gray-600 block mb-1">Mes</label>
              <input type="month" value={mesHistorial} onChange={e => cambiarMesHistorial(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
            </div>

            {cargandoHistorial ? (
              <p className="text-gray-400 text-center py-10">Cargando...</p>
            ) : historial.length === 0 ? (
              <p className="text-gray-400 text-center py-10">Sin ventas registradas este mes</p>
            ) : (
              <>
                <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex justify-between items-center">
                  <p className="font-black text-gray-700">Total del mes</p>
                  <p className="text-xl font-black text-brand">${historial.reduce((s, v) => s + (v.total || 0), 0).toLocaleString('es-CO')}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                  {historial.map(v => (
                    <div key={v.id} className="p-4">
                      <div className="flex justify-between items-center mb-2">
                        <div>
                          <p className="font-bold text-gray-800 text-sm capitalize">{v.forma_pago === 'fiado' ? 'crédito' : v.forma_pago === 'nomina' ? 'descuento de nómina' : v.forma_pago}{v.cliente_nombre ? ` · ${v.cliente_nombre}` : ''}{v.es_empleado ? ' · Empleado' : ''}</p>
                          <p className="text-xs text-gray-400">{v.fecha} {formatearHora(v.created_at)} · {v.registrado_por}</p>
                        </div>
                        <p className="font-black text-gray-900">${v.total.toLocaleString('es-CO')}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => abrirFactura(v)} disabled={cargandoFactura} className="text-xs bg-gray-100 px-3 py-2 rounded-lg font-bold text-gray-600">
                          Recibo
                        </button>
                        <BotonFacturaDian venta={v} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <RegistrarVenta usuario={usuario} onVerComprobante={abrirFactura} />
        )}
      </div>
    </div>
  )
}
