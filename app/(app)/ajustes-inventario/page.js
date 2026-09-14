'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { PageHeader } from '@/components/ui'

export default function AjustesInventario() {
  const [usuario, setUsuario] = useState(null)
  const [vista, setVista] = useState('pendientes')
  const [divergencias, setDivergencias] = useState([])
  const [productosMap, setProductosMap] = useState({})
  const [cargando, setCargando] = useState(true)
  const [expandido, setExpandido] = useState(null)
  const [auditPorDivergencia, setAuditPorDivergencia] = useState({})
  const [rechazando, setRechazando] = useState(null)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [procesando, setProcesando] = useState(null)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (!parsed.puede_aprobar_inventario) { router.push('/despacho'); return }
    setUsuario(parsed)
    cargarProductos()
  }, [])

  useEffect(() => { if (usuario) cargarDivergencias() }, [vista, usuario])

  const cargarProductos = async () => {
    const { data } = await supabase.from('productos').select('sku, nombre').eq('empresa_id', getEmpresaId())
    const pm = {}
    ;(data || []).forEach(p => { pm[p.sku] = p.nombre })
    setProductosMap(pm)
  }

  const cargarDivergencias = async () => {
    setCargando(true)
    let query = supabase.from('divergencias_inventario').select('*').eq('empresa_id', getEmpresaId())
    query = vista === 'pendientes' ? query.eq('estado', 'pendiente') : query.in('estado', ['aprobado', 'rechazado'])
    const { data } = await query.order('fecha', { ascending: false }).order('created_at', { ascending: false })
    setDivergencias(data || [])
    setCargando(false)
    setExpandido(null)
  }

  const toggleExpandir = async (d) => {
    if (expandido === d.id) { setExpandido(null); return }
    setExpandido(d.id)
    setRechazando(null)
    if (!auditPorDivergencia[d.id]) {
      const { data } = await supabase.from('audit_ajustes_inventario').select('*').eq('divergencia_id', d.id).order('created_at', { ascending: true })
      setAuditPorDivergencia(prev => ({ ...prev, [d.id]: data || [] }))
    }
  }

  const aprobar = async (d) => {
    if (!confirm(`¿Aprobar la diferencia de ${d.diferencia > 0 ? '+' : ''}${d.diferencia} en ${productosMap[d.sku] || d.sku}? Esto ajusta el inventario para que coincida con el conteo físico.`)) return
    setProcesando(d.id)
    const empresaId = getEmpresaId()
    const fecha = new Date().toISOString().slice(0, 10)

    const { error: errMov } = await supabase.from('inventario_mov').insert({
      empresa_id: empresaId,
      sku: d.sku,
      cantidad: Math.abs(d.diferencia),
      fecha,
      tipo_movimiento: d.diferencia > 0 ? 'entrada' : 'salida',
      referencia: `Ajuste por conteo del ${d.fecha}, aprobado por ${usuario.nombre}`,
    })
    if (errMov) { alert('Error ajustando inventario: ' + errMov.message); setProcesando(null); return }

    const { error: errUpd } = await supabase.from('divergencias_inventario').update({
      estado: 'aprobado', revisado_por: usuario.id, revisado_en: new Date().toISOString(),
    }).eq('id', d.id)
    if (errUpd) { alert('El inventario se ajustó, pero no se pudo marcar la divergencia como aprobada: ' + errUpd.message); setProcesando(null); return }

    await supabase.from('audit_ajustes_inventario').insert({
      empresa_id: empresaId, divergencia_id: d.id, accion: 'aprobada', usuario: usuario.nombre,
      detalle: `Se ajustó inventario con ${d.diferencia > 0 ? 'entrada' : 'salida'} de ${Math.abs(d.diferencia)} unidades`,
    })

    setProcesando(null)
    cargarDivergencias()
  }

  const confirmarRechazo = async (d) => {
    setProcesando(d.id)
    const empresaId = getEmpresaId()
    const { error } = await supabase.from('divergencias_inventario').update({
      estado: 'rechazado', revisado_por: usuario.id, revisado_en: new Date().toISOString(),
      motivo_rechazo: motivoRechazo || null,
    }).eq('id', d.id)
    if (error) { alert('Error: ' + error.message); setProcesando(null); return }

    await supabase.from('audit_ajustes_inventario').insert({
      empresa_id: empresaId, divergencia_id: d.id, accion: 'rechazada', usuario: usuario.nombre,
      detalle: motivoRechazo || 'Sin motivo especificado',
    })

    setProcesando(null)
    setRechazando(null)
    setMotivoRechazo('')
    cargarDivergencias()
  }

  if (!usuario) return null

  return (
    <div>
      <PageHeader title="Ajustes de Inventario" subtitle="Divergencias de conteo pendientes de aprobación" />

      <div className="p-4 max-w-2xl mx-auto">
        <div className="flex gap-2 mb-4">
          <button onClick={() => setVista('pendientes')}
            className={`px-4 py-2 rounded-xl text-sm font-bold ${vista === 'pendientes' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            Pendientes
          </button>
          <button onClick={() => setVista('historial')}
            className={`px-4 py-2 rounded-xl text-sm font-bold ${vista === 'historial' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            Historial
          </button>
        </div>

        {cargando ? (
          <p className="text-gray-400 text-center py-10">Cargando...</p>
        ) : divergencias.length === 0 ? (
          <p className="text-gray-400 text-center py-10">{vista === 'pendientes' ? 'Sin divergencias pendientes' : 'Sin divergencias resueltas todavía'}</p>
        ) : (
          <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
            {divergencias.map(d => {
              const sobra = d.diferencia > 0
              const abierto = expandido === d.id
              return (
                <div key={d.id}>
                  <button onClick={() => toggleExpandir(d)} className="w-full p-4 flex justify-between items-center text-left">
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{productosMap[d.sku] || d.sku}</p>
                      <p className="text-xs text-gray-400">{d.fecha} · registrado por {d.registrado_por}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-black text-sm ${sobra ? 'text-blue-600' : 'text-brand'}`}>{sobra ? '+' : ''}{d.diferencia}</p>
                      <p className="text-xs text-gray-400 capitalize">{d.estado}</p>
                    </div>
                  </button>

                  {abierto && (
                    <div className="px-4 pb-4 bg-gray-50">
                      <div className="bg-white rounded-lg p-3 mb-3 text-sm">
                        <p className="text-gray-600">Contó <span className="font-bold text-gray-800">{d.cantidad_fisica}</span>, el sistema esperaba <span className="font-bold text-gray-800">{d.cantidad_sistema}</span></p>
                        {d.motivo_rechazo && <p className="text-brand text-xs mt-1">Motivo de rechazo: {d.motivo_rechazo}</p>}
                      </div>

                      {vista === 'pendientes' && (
                        rechazando === d.id ? (
                          <div className="bg-white rounded-lg p-3 mb-2">
                            <label className="text-xs font-bold text-gray-600 block mb-1">Motivo del rechazo (opcional)</label>
                            <textarea value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)} rows={2}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:border-brand" />
                            <div className="flex gap-2">
                              <button onClick={() => { setRechazando(null); setMotivoRechazo('') }} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-lg text-sm">Cancelar</button>
                              <button onClick={() => confirmarRechazo(d)} disabled={procesando === d.id}
                                className="flex-1 bg-brand text-white font-bold py-2 rounded-lg text-sm disabled:opacity-50">
                                {procesando === d.id ? 'Rechazando...' : 'Confirmar rechazo'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => setRechazando(d.id)} disabled={procesando === d.id}
                              className="flex-1 bg-gray-100 text-gray-600 font-bold py-2.5 rounded-lg text-sm disabled:opacity-50">
                              Rechazar
                            </button>
                            <button onClick={() => aprobar(d)} disabled={procesando === d.id}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg text-sm disabled:opacity-50">
                              {procesando === d.id ? 'Aprobando...' : 'Aprobar'}
                            </button>
                          </div>
                        )
                      )}

                      {auditPorDivergencia[d.id]?.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-bold text-gray-500 mb-1">Historial</p>
                          {auditPorDivergencia[d.id].map(a => (
                            <p key={a.id} className="text-xs text-gray-500">
                              {new Date(a.created_at).toLocaleString('es-CO')} · {a.usuario} · {a.accion}{a.detalle ? ` — ${a.detalle}` : ''}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
