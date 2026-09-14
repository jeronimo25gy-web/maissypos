'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { puedeVerModulo } from '@/lib/permisos'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { calcularStockPorSku } from '@/lib/inventario-helpers'
import { crearAlertaAdmin } from '@/lib/alertas-admin'
import { PageHeader } from '@/components/ui'

export default function Conteo() {
  const [usuario, setUsuario] = useState(null)
  const [productos, setProductos] = useState([])
  const [conteos, setConteos] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [descuadres, setDescuadres] = useState([])
  const [yaExiste, setYaExiste] = useState(false)
  const [reiniciando, setReiniciando] = useState(false)
  const [divergenciasPropias, setDivergenciasPropias] = useState([])
  const [cargando, setCargando] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (!puedeVerModulo(parsed, 'conteo', ['admin', 'auxiliar'])) { router.push('/despacho'); return }
    setUsuario(parsed)
    cargarProductos()
    cargarDivergenciasPropias(parsed.nombre)
  }, [])

  const puedeReiniciar = (u) => u?.rol === 'admin' || u?.puede_aprobar_inventario

  const cargarDivergenciasPropias = async (nombre) => {
    const { data } = await supabase.from('divergencias_inventario')
      .select('id, estado, fecha, motivo_rechazo')
      .eq('empresa_id', getEmpresaId())
      .eq('registrado_por', nombre)
      .in('estado', ['pendiente', 'rechazado'])
      .order('created_at', { ascending: false })
      .limit(10)
    setDivergenciasPropias(data || [])
  }

  const cargarProductos = async () => {
    setCargando(true)
    const empresaId = getEmpresaId()
    const fecha = obtenerFechaActual()
    const [{ data }, { data: conteoHoy }] = await Promise.all([
      supabase.from('productos').select('*').eq('estado', true).eq('empresa_id', empresaId).order('categoria').order('nombre'),
      supabase.from('conteo_fisico').select('sku, cantidad_fisica').eq('empresa_id', empresaId).eq('fecha', fecha).order('created_at', { ascending: true }),
    ])
    if (data) {
      setProductos(data)
      const previos = {}
      ;(conteoHoy || []).forEach(c => { previos[c.sku] = c.cantidad_fisica })
      setYaExiste((conteoHoy || []).length > 0)
      const initial = {}
      data.forEach(p => { initial[p.sku] = p.sku in previos ? String(previos[p.sku]) : '0' })
      setConteos(initial)
    }
    setCargando(false)
  }

  const reiniciarConteo = async () => {
    if (!confirm('¿Borrar el conteo de hoy y empezar de nuevo? Esto no afecta divergencias ya aprobadas o rechazadas.')) return
    setReiniciando(true)
    const empresaId = getEmpresaId()
    const fecha = obtenerFechaActual()
    const { error } = await supabase.from('conteo_fisico').delete().eq('empresa_id', empresaId).eq('fecha', fecha)
    setReiniciando(false)
    if (error) { alert('Error: ' + error.message); return }
    setYaExiste(false)
    cargarProductos()
  }

  const guardarConteo = async () => {
    if (yaExiste) {
      alert('El conteo de hoy ya fue registrado y no se puede editar. Si hay un error, pídele a un admin que lo reinicie.')
      return
    }
    const vacios = productos.filter(p => conteos[p.sku] === '')
    if (vacios.length > 0) {
      alert('Debes ingresar cantidad para todos los productos. Pon 0 si no hay.')
      return
    }
    setGuardando(true)
    const fecha = obtenerFechaActual()
    const empresaId = getEmpresaId()
    const stockPorSku = await calcularStockPorSku()

    const infoPorSku = {}
    const registros = productos.map(p => {
      const fisica = parseFloat(conteos[p.sku])
      const info = stockPorSku[p.sku]
      const sistema = info?.stockActual ?? fisica
      infoPorSku[p.sku] = info
      return {
        empresa_id: p.empresa_id,
        fecha,
        sku: p.sku,
        cantidad_sistema: sistema,
        cantidad_fisica: fisica,
        diferencia: fisica - sistema,
        completado: true,
        usuario: usuario.nombre,
      }
    })
    const { error } = await supabase.from('conteo_fisico').insert(registros)
    if (error) {
      // Si ya existe (alguien mas lo guardo mientras tanto, o el unique
      // constraint de la base de datos lo bloquea), avisar en vez de fallar generico.
      alert(error.code === '23505'
        ? 'El conteo de hoy ya fue registrado (por ti u otra persona). No se puede duplicar.'
        : 'Error al guardar: ' + error.message)
      setGuardando(false)
      cargarProductos()
      return
    }

    const descuadresRows = registros.filter(r => r.diferencia !== 0)
    const productosMap = {}
    productos.forEach(p => { productosMap[p.sku] = p.nombre })

    if (descuadresRows.length > 0) {
      const divergenciasPayload = descuadresRows.map(r => ({
        empresa_id: empresaId,
        fecha,
        sku: r.sku,
        cantidad_sistema: r.cantidad_sistema,
        cantidad_fisica: r.cantidad_fisica,
        diferencia: r.diferencia,
        estado: 'pendiente',
        registrado_por: usuario.nombre,
      }))
      const { data: divergenciasCreadas, error: errDiv } = await supabase.from('divergencias_inventario').insert(divergenciasPayload).select()
      if (errDiv) {
        alert('El conteo se guardó, pero no se pudieron registrar las divergencias para aprobación: ' + errDiv.message)
      } else if (divergenciasCreadas) {
        const auditPayload = divergenciasCreadas.map(d => ({
          empresa_id: empresaId,
          divergencia_id: d.id,
          accion: 'creada',
          usuario: usuario.nombre,
          detalle: `Diferencia de ${d.diferencia > 0 ? '+' : ''}${d.diferencia} en ${productosMap[d.sku] || d.sku}`,
        }))
        await supabase.from('audit_ajustes_inventario').insert(auditPayload)
      }

      const detalleTexto = descuadresRows
        .map(r => `${productosMap[r.sku] || r.sku}: fisico ${r.cantidad_fisica}, sistema esperaba ${r.cantidad_sistema} (dif. ${r.diferencia > 0 ? '+' : ''}${r.diferencia})`)
        .join('; ')
      await crearAlertaAdmin({
        empresaId,
        tipo: 'descuadre_conteo',
        mensaje: `El conteo del ${fecha} no coincide con el inventario en ${descuadresRows.length} producto${descuadresRows.length > 1 ? 's' : ''}, pendiente de aprobación: ${detalleTexto}`,
        referenciaTipo: 'conteo_fisico',
      })
    }

    setDescuadres(descuadresRows.map(r => {
      const info = infoPorSku[r.sku]
      return {
        ...r,
        nombre: productosMap[r.sku] || r.sku,
        cantidadConteo: info?.cantidadConteo ?? null,
        comprado: info?.comprado || 0,
        devuelto: info?.devuelto || 0,
        despachado: info?.despachado || 0,
        salida: info?.salida || 0,
      }
    }))
    setYaExiste(true)
    setGuardado(true)
    setGuardando(false)
  }

  const categorias = [...new Set(productos.map(p => p.categoria))]

  if (guardado) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md w-full">
        <div className="text-6xl mb-4">{descuadres.length === 0 ? '✅' : '⚠️'}</div>
        <h2 className="text-2xl font-black text-gray-800">Conteo guardado</h2>
        {descuadres.length === 0 ? (
          <p className="text-gray-500 mt-2">Todo coincide con el inventario. No hay diferencias.</p>
        ) : (
          <>
            <p className="text-brand font-bold mt-2">
              {descuadres.length} producto{descuadres.length > 1 ? 's' : ''} no coincide{descuadres.length > 1 ? 'n' : ''} con el inventario
            </p>
            <p className="text-xs text-gray-400 mt-1">Diferencia detectada. Necesita aprobación de un administrador antes de reflejarse en el inventario.</p>
            <div className="text-left space-y-2 mt-3 max-h-80 overflow-y-auto">
              {descuadres.map(d => {
                const sobra = d.diferencia > 0
                return (
                  <div key={d.sku} className={`rounded-xl border p-3 ${sobra ? 'bg-blue-50 border-blue-100' : 'bg-brand/5 border-brand/10'}`}>
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-bold text-gray-800 text-sm">{d.nombre}</p>
                      <p className={`font-black text-sm ${sobra ? 'text-blue-600' : 'text-brand'}`}>{sobra ? '+' : ''}{d.diferencia}</p>
                    </div>
                    <p className="text-xs text-gray-500 mb-1">
                      Contaste <span className="font-bold text-gray-700">{d.cantidad_fisica}</span>, el sistema esperaba <span className="font-bold text-gray-700">{d.cantidad_sistema}</span>
                      {d.cantidadConteo !== null && (
                        <> (conteo anterior {d.cantidadConteo}
                        {d.comprado > 0 && ` + comprado ${d.comprado}`}
                        {d.devuelto > 0 && ` + devuelto ${d.devuelto}`}
                        {d.despachado > 0 && ` − despachado ${d.despachado}`}
                        {d.salida > 0 && ` − otras salidas ${d.salida}`})</>
                      )}
                    </p>
                    <p className="text-xs font-medium text-gray-600">
                      {sobra
                        ? 'Sobran unidades. Revisa si hubo una compra o devolucion que no quedo registrada.'
                        : 'Faltan unidades. Revisa despachos, ventas o una posible perdida.'}
                    </p>
                  </div>
                )
              })}
            </div>
          </>
        )}
        <button onClick={() => router.push('/despacho')} className="mt-6 bg-brand hover:bg-brand-dark text-white px-6 py-3 rounded-xl font-bold w-full">
          Volver al inicio
        </button>
      </div>
    </div>
  )

  if (!usuario || cargando) return null

  return (
    <div>
      <PageHeader title="Conteo de Inventario" subtitle={new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })} />

      <div className="p-4 max-w-2xl mx-auto">
        {divergenciasPropias.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <p className="text-sm font-bold text-amber-800 mb-1">Tienes divergencias de conteo sin resolver</p>
            {divergenciasPropias.map(d => (
              <p key={d.id} className="text-xs text-amber-700">
                {d.fecha}: {d.estado === 'pendiente' ? 'esperando aprobación de un administrador.' : `rechazada${d.motivo_rechazo ? ' — ' + d.motivo_rechazo : '.'}`}
              </p>
            ))}
          </div>
        )}

        {yaExiste ? (
          <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
            <div className="text-4xl mb-3">🔒</div>
            <p className="font-black text-gray-800 mb-1">El conteo de hoy ya fue registrado</p>
            <p className="text-sm text-gray-500 mb-4">No se puede editar ni volver a enviar. Si hay un error, un administrador lo puede reiniciar.</p>
            {puedeReiniciar(usuario) && (
              <button onClick={reiniciarConteo} disabled={reiniciando}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-4 py-2 rounded-lg text-sm disabled:opacity-50">
                {reiniciando ? 'Reiniciando...' : 'Reiniciar conteo del día'}
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="bg-gray-100 border border-gray-300 rounded-xl p-4 mb-4">
              <p className="text-gray-800 text-sm font-medium">Ingresa la cantidad fisica de cada producto. Pon 0 si no hay unidades.</p>
            </div>

            {categorias.map(cat => (
              <div key={cat} className="mb-4">
                <h3 className="font-bold text-gray-600 text-sm uppercase tracking-wide mb-2 px-1">{cat}</h3>
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  {productos.filter(p => p.categoria === cat).map((p, i, arr) => (
                    <div key={p.sku} className={`flex items-center justify-between px-4 py-3 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <div className="flex-1">
                        <p className="font-medium text-gray-800 text-sm">{p.nombre}</p>
                        <p className="text-xs text-gray-400">{p.sku} · {p.presentacion}</p>
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={conteos[p.sku]}
                        onChange={e => setConteos(prev => ({ ...prev, [p.sku]: e.target.value }))}
                        className="w-20 text-center border-2 border-gray-200 rounded-lg py-2 text-lg font-bold text-gray-800 focus:border-brand focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <button
              onClick={guardarConteo}
              disabled={guardando}
              className="w-full bg-brand hover:bg-brand-dark text-white font-black py-4 rounded-xl text-lg mt-4 disabled:opacity-50"
            >
              {guardando ? 'Guardando...' : 'Guardar Conteo del Dia'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
