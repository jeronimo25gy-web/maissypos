'use client'
import { useState, useEffect, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { generarYCompartirPDF } from '@/lib/compartir'
import { puedeVerModulo } from '@/lib/permisos'
import { PageHeader } from '@/components/ui'
import { grupoDespacho } from '@/lib/orden-productos'

export default function Imprimir() {
  const [despachos, setDespachos] = useState([])
  const [despachoSel, setDespachoSel] = useState(null)
  const [base, setBase] = useState(0)
  const [catalogo, setCatalogo] = useState([])
  const [empresaNombre, setEmpresaNombre] = useState('')
  const [cartera, setCartera] = useState([])
  const [compartiendo, setCompartiendo] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (!puedeVerModulo(parsed, 'imprimir', ['admin', 'auxiliar'])) { router.push('/despacho'); return }
    cargarDespachos()
  }, [])

  const cargarDespachos = async () => {
    const fecha = obtenerFechaActual()
    const { data } = await supabase
      .from('despachos_encab')
      .select('*, rutas(nombre), vendedores(nombre)')
      .eq('fecha', fecha)
      .eq('empresa_id', getEmpresaId())
    if (data) setDespachos(data)
  }

  const seleccionarDespacho = async (d) => {
    setDespachoSel(d)
    const empresaId = getEmpresaId()
    const esTat = d.rutas?.nombre === 'RUTA TAT MANRIQUE'
    const [{ data: det }, { data: prods }, { data: config }, { data: emp }, { data: fiados }] = await Promise.all([
      supabase.from('despachos_detalle').select('*').eq('despacho_id', d.id),
      supabase.from('productos').select('sku, nombre, categoria, estado, tipo, orden_despacho').eq('empresa_id', empresaId).order('orden_despacho', { ascending: true, nullsFirst: false }).order('nombre'),
      supabase.from('configuracion').select('valor').eq('parametro', 'base_despacho_' + d.id).eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('empresas').select('nombre').eq('id', empresaId).maybeSingle(),
      // Lo que le deben a esta ruta, para que el vendedor sepa a quien cobrar.
      supabase.from('cartera_fiados').select('nombre_cliente, saldo, fecha_pago').eq('estado', 'pendiente').eq('empresa_id', empresaId)
        .or(`ruta_id.eq.${d.ruta_id},vendedor_id.eq.${d.vendedor_id}`).order('fecha_pago', { ascending: true, nullsFirst: false }),
    ])
    const cantidadPorSku = {}
    ;(det || []).forEach(i => { cantidadPorSku[i.sku] = (cantidadPorSku[i.sku] || 0) + (i.total || 0) })
    // Todo el catalogo de la ruta (igual que en Despacho), para que lo que no
    // lleva salga con rayita y no se pueda anotar despues.
    const lista = (prods || []).filter(p => cantidadPorSku[p.sku] > 0 || (
      p.estado && p.tipo !== 'materia_prima' && (esTat ? p.categoria === 'Arepas TAT' : p.categoria !== 'Arepas TAT')))
    setCatalogo(lista.map(p => ({ ...p, cantidad: cantidadPorSku[p.sku] || 0 })))
    setBase(config ? parseFloat(config.valor) : 0)
    setEmpresaNombre(emp?.nombre || '')
    setCartera(fiados || [])
  }

  const imprimir = () => window.print()
  const compartir = async () => {
    setCompartiendo(true)
    try { await generarYCompartirPDF('despacho-imprimible', `Despacho-${despachoSel?.rutas?.nombre || ''}`) }
    finally { setCompartiendo(false) }
  }

  if (!despachoSel) return (
    <div>
      <PageHeader title="Imprimir Despacho" />
      <div className="p-6">
        <div className="max-w-lg mx-auto">
          <p className="text-sm font-bold text-gray-600 mb-3">Selecciona el despacho a imprimir</p>
          {despachos.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center shadow-sm">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-gray-500">No hay despachos hoy</p>
            </div>
          ) : (
            despachos.map(d => (
              <button key={d.id} onClick={() => seleccionarDespacho(d)}
                className="w-full bg-white rounded-xl p-4 shadow-sm mb-3 text-left hover:shadow-md transition-all">
                <p className="font-black text-gray-800">{d.rutas?.nombre}</p>
                <p className="text-sm text-gray-500">{d.vendedores?.nombre} · {d.total_und} unidades · ${d.total_valor?.toLocaleString('es-CO')}</p>
                <span className={`text-xs font-bold px-2 py-1 rounded-full mt-1 inline-block ${d.estado === 'liquidado' ? 'bg-gray-200 text-gray-800' : 'bg-brand/10 text-brand'}`}>
                  {d.estado}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )

  const grupos = catalogo.reduce((acc, p) => {
    const grupo = grupoDespacho(p)
    const g = acc.find(x => x.categoria === grupo)
    if (g) g.items.push(p)
    else acc.push({ categoria: grupo, items: [p] })
    return acc
  }, [])
  const totalUnidades = catalogo.reduce((s, p) => s + p.cantidad, 0)
  const fechaCorta = new Date(despachoSel.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const hora = despachoSel.hora_cargue ? new Date(despachoSel.hora_cargue).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : ''
  // Cabe hasta 9 creditos con renglon para el abono; el resto se ve en Cartera.
  const MAX_FILAS_CARTERA = 9
  const MIN_FILAS_CARTERA = 5
  const carteraVisible = cartera.slice(0, MAX_FILAS_CARTERA)
  const totalCartera = Math.round(cartera.reduce((s, f) => s + (f.saldo || 0), 0))
  const renglones = (n, columnas) => Array.from({ length: n }, (_, i) => (
    <tr key={i}>{Array.from({ length: columnas }, (_, j) => <td key={j}></td>)}</tr>
  ))
  const cajita = (titulo, n) => (
    <div>
      <div className="sec">{titulo}</div>
      <table className="escribir"><colgroup><col style={{ width: '60%' }} /><col style={{ width: '40%' }} /></colgroup>
        <tbody>{renglones(n, 2)}</tbody>
      </table>
    </div>
  )

  return (
    <>
      <style>{`
        @page { size: letter landscape; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: white; }
          .pliego { margin: 0 !important; outline: none !important; }
          .pliego + .pliego { page-break-before: always; break-before: page; }
        }
        .pliego { width: 11in; height: 8.5in; margin: 12px auto; display: flex; background: white; outline: 1px solid #ccc; }
        .hoja { width: 5.5in; height: 8.5in; padding: 5mm; background: white; color: #000;
          font-family: Arial, sans-serif; font-size: 7.5pt; line-height: 1.15; box-sizing: border-box; overflow: hidden;
          display: flex; flex-direction: column; }
        .hoja-vacia { width: 5.5in; height: 8.5in; }
        .cartera td { height: 4.6mm; }
        .cartera td.v { text-align: right; }
        .hoja table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .hoja th, .hoja td { border: 0.6pt solid #000; padding: 0 3pt; }
        .hoja th { background: #eee; font-weight: bold; text-align: center; height: 3.6mm; }
        .productos td { height: 3.6mm; font-size: 8pt; }
        .productos td.n { text-align: center; font-weight: bold; font-size: 8.5pt; }
        .productos tr.inicio-grupo td { border-top: 1.4pt solid #000; }
        .productos td.raya { text-align: center; color: #555; }
        .productos td.sin { color: #666; }
        .escribir td { height: 5.4mm; }
        .sec { font-weight: bold; font-size: 7.5pt; border-bottom: 1.2pt solid #000; padding-bottom: 1pt; margin: 2.2mm 0 1mm; display: flex; justify-content: space-between; }
        .sec span { font-weight: normal; color: #444; }
        .firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-top: auto; padding-top: 5mm; }
        .firmas div { border-top: 0.8pt solid #000; padding-top: 1pt; color: #333; }
      `}</style>

      <div className="no-print bg-gray-100 p-4 flex gap-3 items-center sticky top-0 z-10">
        <button onClick={() => setDespachoSel(null)} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold text-sm">← Volver</button>
        <button onClick={imprimir} className="bg-brand hover:bg-brand-dark text-white px-6 py-2 rounded-lg font-bold text-sm">🖨️ Imprimir</button>
        <button onClick={compartir} disabled={compartiendo} className="bg-gray-800 hover:bg-gray-900 text-white px-6 py-2 rounded-lg font-bold text-sm disabled:opacity-50">
          {compartiendo ? 'Generando...' : '📤 Compartir'}
        </button>
        <p className="text-gray-500 text-sm">{despachoSel.rutas?.nombre} · carta horizontal, media hoja por página: imprime la 1, voltea la hoja e imprime la 2</p>
      </div>

      <div style={{ overflowX: 'auto' }}>
      <div id="despacho-imprimible">
      <div className="pliego">
        <div className="hoja">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5mm' }}>
            <div style={{ fontSize: '17pt', fontWeight: 900, color: '#C41230', letterSpacing: '-0.5pt', lineHeight: 1 }}>Maissy</div>
            <div style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '8.5pt' }}>
              DESPACHO DE RUTA
              <div style={{ fontWeight: 'normal', fontSize: '7pt' }}>{empresaNombre}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6mm 4mm', marginBottom: '1.5mm', fontSize: '7.5pt' }}>
            <div><b>Fecha:</b> {fechaCorta}</div>
            <div><b>Ruta:</b> {despachoSel.rutas?.nombre}</div>
            <div><b>Vendedor:</b> {despachoSel.vendedores?.nombre}</div>
            <div><b>Base:</b> ${base.toLocaleString('es-CO')}</div>
            <div><b>Unidades:</b> {totalUnidades.toLocaleString('es-CO')}</div>
            <div><b>Hora cargue:</b> {hora}</div>
          </div>
          <table className="productos">
            <colgroup><col style={{ width: '55%' }} /><col style={{ width: '15%' }} /><col style={{ width: '15%' }} /><col style={{ width: '15%' }} /></colgroup>
            <thead><tr><th style={{ textAlign: 'left' }}>Producto</th><th>Lleva</th><th>Devuelve</th><th>Cambio</th></tr></thead>
            <tbody>
              {grupos.map(g => (
                <Fragment key={g.categoria}>
                  {g.items.map((p, i) => p.cantidad > 0 ? (
                    <tr key={p.sku} className={i === 0 ? 'inicio-grupo' : ''}><td>{p.nombre}</td><td className="n">{p.cantidad.toLocaleString('es-CO')}</td><td></td><td></td></tr>
                  ) : (
                    <tr key={p.sku} className={i === 0 ? 'inicio-grupo' : ''}><td className="sin">{p.nombre}</td><td className="raya">—</td><td className="raya">—</td><td className="raya">—</td></tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          <div className="firmas"><div>Firma despacha</div><div>Firma vendedor</div></div>
        </div>
        <div className="hoja-vacia" />
      </div>

      <div className="pliego">
        <div className="hoja">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '8pt' }}>
            <span>{despachoSel.rutas?.nombre} · {despachoSel.vendedores?.nombre}</span>
            <span style={{ fontWeight: 'normal' }}>{fechaCorta}</span>
          </div>
          <div className="sec">Transferencias bancarias <span>cliente o referencia · banco · valor</span></div>
          <table className="escribir">
            <colgroup><col style={{ width: '46%' }} /><col style={{ width: '22%' }} /><col style={{ width: '32%' }} /></colgroup>
            <thead><tr><th style={{ textAlign: 'left' }}>Cliente / referencia</th><th>Banco</th><th>Valor</th></tr></thead>
            <tbody>{renglones(12, 3)}</tbody>
          </table>
          <div className="sec">Transferencias de mercancía <span>E = envía · R = recibe</span></div>
          <table className="escribir">
            <colgroup><col style={{ width: '10%' }} /><col style={{ width: '42%' }} /><col style={{ width: '14%' }} /><col style={{ width: '34%' }} /></colgroup>
            <thead><tr><th>E/R</th><th style={{ textAlign: 'left' }}>Producto</th><th>Cant</th><th>Vendedor</th></tr></thead>
            <tbody>{renglones(5, 4)}</tbody>
          </table>
          <div className="sec">Cartera por cobrar <span>{carteraVisible.length > 0 ? `${cartera.length} crédito${cartera.length !== 1 ? 's' : ''} · $${totalCartera.toLocaleString('es-CO')}` : 'anota los abonos'}</span></div>
          <table className="escribir cartera">
            <colgroup><col style={{ width: '40%' }} /><col style={{ width: '20%' }} /><col style={{ width: '16%' }} /><col style={{ width: '24%' }} /></colgroup>
            <thead><tr><th style={{ textAlign: 'left' }}>Cliente</th><th>Debe</th><th>Vence</th><th>Abonó</th></tr></thead>
            <tbody>
              {carteraVisible.map((f, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.nombre_cliente}</td>
                  <td className="v">${Math.round(f.saldo || 0).toLocaleString('es-CO')}</td>
                  <td style={{ textAlign: 'center' }}>{f.fecha_pago ? f.fecha_pago.slice(8, 10) + '/' + f.fecha_pago.slice(5, 7) : ''}</td>
                  <td></td>
                </tr>
              ))}
              {renglones(Math.max(0, MIN_FILAS_CARTERA - carteraVisible.length), 4)}
            </tbody>
          </table>
          {cartera.length > carteraVisible.length && <div style={{ fontSize: '6.5pt', marginTop: '0.5mm' }}>+{cartera.length - carteraVisible.length} más en el sistema (Cartera)</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 3mm' }}>
            {cajita('Créditos nuevos', 3)}
            {cajita('Gastos', 3)}
            {cajita('Obsequios / consumo', 3)}
          </div>
          <div className="firmas"><div>Efectivo entregado $</div><div>Firma recibe</div></div>
        </div>
        <div className="hoja-vacia" />
      </div>
      </div>
      </div>
    </>
  )
}
