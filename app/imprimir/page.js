'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function Imprimir() {
  const [despachos, setDespachos] = useState([])
  const [despachoSel, setDespachoSel] = useState(null)
  const [detalle, setDetalle] = useState([])
  const [base, setBase] = useState(0)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    cargarDespachos()
  }, [])

  const cargarDespachos = async () => {
    const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const { data } = await supabase
      .from('despachos_encab')
      .select('*, rutas(nombre), vendedores(nombre)')
      .eq('fecha', fecha)
    if (data) setDespachos(data)
  }

  const seleccionarDespacho = async (d) => {
    setDespachoSel(d)
    const { data: det } = await supabase.from('despachos_detalle').select('*').eq('despacho_id', d.id)
    const { data: prods } = await supabase.from('productos').select('sku, nombre, presentacion')
    const { data: config } = await supabase.from('configuracion').select('valor').eq('parametro', 'base_despacho_' + d.id).single()
    if (det && prods) {
      const prodsMap = {}
      prods.forEach(p => { prodsMap[p.sku] = p })
      const merged = det.map(item => ({ ...item, producto: prodsMap[item.sku] || {} }))
      setDetalle(merged)
      setBase(config ? parseFloat(config.valor) : 0)
    }
  }

  const imprimir = () => window.print()
  const fecha = new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  if (!despachoSel) return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-lg mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl font-black text-orange-500">Imprimir Despacho</h1>
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 text-sm">Volver</button>
        </div>
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
              <span className={`text-xs font-bold px-2 py-1 rounded-full mt-1 inline-block ${d.estado === 'liquidado' ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
                {d.estado}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: white; }
        }
        body { font-family: Arial, sans-serif; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #000; padding: 5px 8px; }
        th { background: #f0f0f0; font-weight: bold; text-align: center; }
        td { text-align: center; }
        td:first-child { text-align: left; }
      `}</style>

      <div className="no-print bg-gray-100 p-4 flex gap-3 items-center sticky top-0 z-10">
        <button onClick={() => setDespachoSel(null)} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold text-sm">← Volver</button>
        <button onClick={imprimir} className="bg-orange-500 text-white px-6 py-2 rounded-lg font-bold text-sm">🖨️ Imprimir</button>
        <p className="text-gray-500 text-sm">{despachoSel.rutas?.nombre}</p>
      </div>

      <div style={{ padding: '20px', maxWidth: '750px', margin: '0 auto', background: 'white' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#f97316', letterSpacing: '-1px' }}>Maissy</div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 'bold', fontSize: '15px' }}>FORMATO DESPACHO RUTA</div>
            <div style={{ fontWeight: 'bold', fontSize: '15px' }}>DISTRIMAISSY</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px', fontSize: '13px' }}>
          <div><strong>Fecha:</strong> {fecha}</div>
          <div><strong>Ruta:</strong> {despachoSel.rutas?.nombre}</div>
          <div><strong>Vendedor:</strong> {despachoSel.vendedores?.nombre}</div>
          <div><strong>Base entregada:</strong> ${base.toLocaleString('es-CO')}</div>
          <div><strong>Total unidades:</strong> {despachoSel.total_und}</div>
          <div><strong>Valor total:</strong> ${despachoSel.total_valor?.toLocaleString('es-CO')}</div>
        </div>

        <table style={{ marginBottom: '20px', fontSize: '12px' }}>
          <thead>
            <tr>
              <th style={{ width: '35%', textAlign: 'left' }}>Descripcion</th>
              <th style={{ width: '12%' }}>X Viejo</th>
              <th style={{ width: '12%' }}>Y Nuevo</th>
              <th style={{ width: '12%' }}>Total</th>
              <th style={{ width: '15%' }}>Devuelve</th>
              <th style={{ width: '14%' }}>Cambio</th>
            </tr>
          </thead>
          <tbody>
            {detalle.map((item, i) => (
              <tr key={i}>
                <td>{item.producto?.nombre}</td>
                <td style={{ fontWeight: 'bold' }}>{item.lote_viejo_x || 0}</td>
                <td style={{ fontWeight: 'bold' }}>{item.lote_nuevo_y || 0}</td>
                <td style={{ fontWeight: 'bold' }}>{item.total}</td>
                <td></td>
                <td></td>
              </tr>
            ))}
            <tr style={{ fontWeight: 'bold', background: '#f9f9f9' }}>
              <td>TOTAL</td>
              <td>{detalle.reduce((s, i) => s + (i.lote_viejo_x || 0), 0)}</td>
              <td>{detalle.reduce((s, i) => s + (i.lote_nuevo_y || 0), 0)}</td>
              <td>{detalle.reduce((s, i) => s + (i.total || 0), 0)}</td>
              <td></td>
              <td></td>
            </tr>
          </tbody>
        </table>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '16px', fontSize: '12px' }}>
          <div>
            <div style={{ fontWeight: 'bold', borderBottom: '2px solid black', paddingBottom: '4px', marginBottom: '8px' }}>Transferencias</div>
            {[1,2,3,4,5,6,7].map(i => (
              <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <div style={{ flex: 1, borderBottom: '1px solid #999' }}></div>
                <div style={{ width: '80px', borderBottom: '1px solid #999' }}></div>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontWeight: 'bold', borderBottom: '2px solid black', paddingBottom: '4px', marginBottom: '8px' }}>Gastos</div>
            {[1,2,3].map(i => (
              <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <div style={{ flex: 1, borderBottom: '1px solid #999' }}></div>
                <div style={{ width: '80px', borderBottom: '1px solid #999' }}></div>
              </div>
            ))}
            <div style={{ fontWeight: 'bold', borderBottom: '2px solid black', paddingBottom: '4px', marginBottom: '8px', marginTop: '12px' }}>Descuentos</div>
            {[1,2].map(i => (
              <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <div style={{ flex: 1, borderBottom: '1px solid #999' }}></div>
                <div style={{ width: '80px', borderBottom: '1px solid #999' }}></div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '16px', fontSize: '12px' }}>
          <div style={{ fontWeight: 'bold', borderBottom: '2px solid black', paddingBottom: '4px', marginBottom: '8px' }}>Fiados</div>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <div style={{ flex: 1, borderBottom: '1px solid #999' }}></div>
              <div style={{ width: '100px', borderBottom: '1px solid #999' }}></div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '2px solid black', paddingTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', fontSize: '12px' }}>
          <div>
            <div style={{ fontWeight: 'bold' }}>Efectivo entregado:</div>
            <div style={{ borderBottom: '1px solid black', height: '24px', marginTop: '6px' }}></div>
          </div>
          <div>
            <div style={{ fontWeight: 'bold' }}>Firma vendedor:</div>
            <div style={{ borderBottom: '1px solid black', height: '24px', marginTop: '6px' }}></div>
          </div>
        </div>

      </div>
    </>
  )
}
