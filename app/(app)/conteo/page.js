'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { calcularStockPorSku } from '@/lib/inventario-helpers'
import { PageHeader } from '@/components/ui'

export default function Conteo() {
  const [usuario, setUsuario] = useState(null)
  const [productos, setProductos] = useState([])
  const [conteos, setConteos] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [descuadres, setDescuadres] = useState([])
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'admin' && parsed.rol !== 'auxiliar') { router.push('/dashboard'); return }
    setUsuario(parsed)
    cargarProductos()
  }, [])

  const cargarProductos = async () => {
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
      const initial = {}
      data.forEach(p => { initial[p.sku] = p.sku in previos ? String(previos[p.sku]) : '0' })
      setConteos(initial)
    }
  }

  const guardarConteo = async () => {
    const vacios = productos.filter(p => conteos[p.sku] === '')
    if (vacios.length > 0) {
      alert('Debes ingresar cantidad para todos los productos. Pon 0 si no hay.')
      return
    }
    setGuardando(true)
    const fecha = obtenerFechaActual()
    const empresaId = getEmpresaId()
    const stockPorSku = await calcularStockPorSku()
    const { error: errorBorrar } = await supabase.from('conteo_fisico').delete().eq('empresa_id', empresaId).eq('fecha', fecha)
    if (errorBorrar) {
      alert('Error al guardar: ' + errorBorrar.message)
      setGuardando(false)
      return
    }
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
      alert('Error al guardar: ' + error.message)
      setGuardando(false)
      return
    }

    const descuadresRows = registros.filter(r => r.diferencia !== 0)
    const productosMap = {}
    productos.forEach(p => { productosMap[p.sku] = p.nombre })
    if (descuadresRows.length > 0) {
      const detalleTexto = descuadresRows
        .map(r => `${productosMap[r.sku] || r.sku}: fisico ${r.cantidad_fisica}, sistema esperaba ${r.cantidad_sistema} (dif. ${r.diferencia > 0 ? '+' : ''}${r.diferencia})`)
        .join('; ')
      await supabase.from('alertas_admin').insert({
        empresa_id: empresaId,
        tipo: 'descuadre_conteo',
        mensaje: `El conteo del ${fecha} no coincide con el inventario en ${descuadresRows.length} producto${descuadresRows.length > 1 ? 's' : ''}: ${detalleTexto}`,
        referencia_tipo: 'conteo_fisico',
        referencia_id: null
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
        <button onClick={() => router.push('/dashboard')} className="mt-6 bg-brand hover:bg-brand-dark text-white px-6 py-3 rounded-xl font-bold w-full">
          Volver al inicio
        </button>
      </div>
    </div>
  )

  return (
    <div>
      <PageHeader title="Conteo de Inventario" subtitle={new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })} />

      <div className="p-4 max-w-2xl mx-auto">
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
      </div>
    </div>
  )
}
