'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function Kiosco() {
  const [usuario, setUsuario] = useState(null)
  const [vendedor, setVendedor] = useState(null)
  const [despachos, setDespachos] = useState([])
  const [despachoSel, setDespachoSel] = useState(null)
  const [detalle, setDetalle] = useState([])
  const [base, setBase] = useState(0)
  const [devoluciones, setDevoluciones] = useState({})
  const [cambios, setCambios] = useState({})
  const [efectivo, setEfectivo] = useState('')
  const [transferencias, setTransferencias] = useState('')
  const [fiados, setFiados] = useState([{ nombre: '', valor: '' }])
  const [gastos, setGastos] = useState([{ concepto: '', valor: '' }])
  const [paso, setPaso] = useState(1)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'vendedor') { router.push('/dashboard'); return }
    setUsuario(parsed)
    cargarVendedorYDespachos(parsed.vendedor_nombre)
  }, [])

  const cargarVendedorYDespachos = async (vendedor_nombre) => {
    const { data: vend } = await supabase
      .from('vendedores')
      .select('*')
      .eq('nombre', vendedor_nombre)
      .single()
    if (vend) {
      setVendedor(vend)
      const fecha = new Date().toISOString().split('T')[0]
      const { data } = await supabase
        .from('despachos_encab')
        .select('*, rutas(nombre)')
        .eq('fecha', fecha)
        .eq('estado', 'despachado')
        .eq('vendedor_id', vend.id)
      if (data) setDespachos(data)
    }
  }

  const seleccionarDespacho = async (d) => {
    setDespachoSel(d)
    const { data: det } = await supabase.from('despachos_detalle').select('*').eq('despacho_id', d.id)
    const { data: prods } = await supabase.from('productos').select('sku, nombre, precio_venta')
    const { data: config } = await supabase
      .from('configuracion').select('valor')
      .eq('parametro', `base_despacho_${d.id}`).single()
    if (det && prods) {
      const prodsMap = {}
      prods.forEach(p => { prodsMap[p.sku] = p })
      const merged = det.map(item => ({ ...item, producto: prodsMap[item.sku] || {} }))
      setDetalle(merged)
      const devs = {}
      const cams = {}
      merged.forEach(item => { devs[item.sku] = '0'; cams[item.sku] = '0' })
      setDevoluciones(devs)
      setCambios(cams)
      setBase(config ? parseFloat(config.valor) : 0)
      setPaso(2)
    }
  }

  const vendidoNeto = (item) => (item.total || 0) - parseFloat(devoluciones[item.sku] || 0) - parseFloat(cambios[item.sku] || 0)
  const totalVendidoValor = () => detalle.reduce((sum, item) => sum + vendidoNeto(item) * (item.producto?.precio_venta || 0), 0)
  const totalAEntregar = () => totalVendidoValor() + base
  const totalFiados = () => fiados.reduce((sum, f) => sum + parseFloat(f.valor || 0), 0)
  const totalGastos = () => gastos.reduce((sum, g) => sum + parseFloat(g.valor || 0), 0)
  const totalEntregado = () => parseFloat(efectivo || 0) + parseFloat(transferencias || 0) + totalFiados() - totalGastos()
  const diferencia = () => totalEntregado() - totalAEntregar()

  const guardarLiquidacion = async () => {
    setGuardando(true)
    const fecha = new Date().toISOString().split('T')[0]
    const registros = detalle.map(item => ({
      empresa_id: item.empresa_id,
      fecha,
      despacho_id: despachoSel.id,
      vendedor_id: vendedor.id,
      sku: item.sku,
      despachado: item.total,
      devuelto: parseFloat(devoluciones[item.sku] || 0),
      cambio: parseFloat(cambios[item.sku] || 0),
      vendido_neto: vendidoNeto(item),
      efectivo_esperado: vendidoNeto(item) * (item.producto?.precio_venta || 0),
      efectivo_real: parseFloat(efectivo || 0)
    }))
    const { error } = await supabase.from('liquidaciones').insert(registros)
    if (!error) {
      await supabase.from('despachos_encab').update({ estado: 'liquidado' }).eq('id', despachoSel.id)
      setGuardado(true)
    } else {
      alert('Error: ' + error.message)
    }
    setGuardando(false)
  }

  if (guardado) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-8">
      <div className="text-center">
        <div className="text-8xl mb-6">✅</div>
        <h2 className="text-4xl font-black text-white mb-2">Listo!</h2>
        <p className="text-gray-400 text-xl mb-4">{despachoSel?.rutas?.nombre}</p>
        <div className={`p-6 rounded-2xl mb-8 ${Math.abs(diferencia()) < 500 ? 'bg-green-900' : 'bg-red-900'}`}>
          <p className="text-gray-400 mb-1">Diferencia</p>
          <p className={`text-5xl font-black ${Math.abs(diferencia()) < 500 ? 'text-green-400' : 'text-red-400'}`}>
            {diferencia() >= 0 ? '+' : ''}${diferencia().toLocaleString('es-CO')}
          </p>
        </div>
        <p className="text-gray-500 text-lg">Podes irte. Hasta manana! 👋</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="bg-gray-800 px-8 py-5 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-orange-400">MaissyPOS</h1>
          {usuario && <p className="text-gray-400 text-sm">{usuario.nombre}</p>}
        </div>
        <p className="text-gray-400 text-sm">{new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      <div className="p-6 max-w-3xl mx-auto">

        {paso === 1 && (
          <>
            <h2 className="text-3xl font-black text-white mb-2 text-center">Hola, {usuario?.nombre}!</h2>
            <p className="text-gray-400 text-center mb-8">Selecciona tu ruta de hoy</p>
            {despachos.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-6xl mb-4">📭</p>
                <p className="text-gray-400 text-xl">No hay despachos asignados a tu nombre hoy</p>
                <p className="text-gray-600 text-sm mt-2">Habla con la auxiliar para verificar el despacho</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {despachos.map(d => (
                  <button key={d.id} onClick={() => seleccionarDespacho(d)}
                    className="bg-gray-800 hover:bg-orange-500 rounded-2xl p-6 text-left transition-all group">
                    <p className="text-2xl font-black text-white">{d.rutas?.nombre}</p>
                    <p className="text-gray-400 group-hover:text-orange-100 mt-1">{d.total_und} unidades · ${d.total_valor?.toLocaleString('es-CO')}</p>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {paso === 2 && (
          <>
            <h2 className="text-2xl font-black text-white mb-2">Devoluciones y Cambios</h2>
            <p className="text-gray-400 mb-6">Ingresa lo que traes de vuelta</p>
            {detalle.map(item => (
              <div key={item.sku} className="bg-gray-800 rounded-2xl p-5 mb-4">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-white font-bold text-lg">{item.producto?.nombre}</p>
                    <p className="text-gray-400">Despachado: {item.total} und</p>
                  </div>
                  <p className="text-green-400 font-black text-lg">{vendidoNeto(item)} vendido</p>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-yellow-400 font-bold text-sm block mb-2">↩ Devolucion</label>
                    <input type="number" min="0" max={item.total} value={devoluciones[item.sku]}
                      onChange={e => setDevoluciones(prev => ({ ...prev, [item.sku]: e.target.value }))}
                      className="w-full text-center bg-gray-700 text-white border-2 border-yellow-600 rounded-xl py-3 text-2xl font-black focus:border-yellow-400 focus:outline-none" />
                  </div>
                  <div className="flex-1">
                    <label className="text-red-400 font-bold text-sm block mb-2">🔄 Cambio</label>
                    <input type="number" min="0" max={item.total} value={cambios[item.sku]}
                      onChange={e => setCambios(prev => ({ ...prev, [item.sku]: e.target.value }))}
                      className="w-full text-center bg-gray-700 text-white border-2 border-red-600 rounded-xl py-3 text-2xl font-black focus:border-red-400 focus:outline-none" />
                  </div>
                </div>
              </div>
            ))}
            <div className="bg-gray-800 rounded-2xl p-5 mb-6">
              <div className="flex justify-between mb-2">
                <p className="text-gray-400">Vendido neto</p>
                <p className="text-white font-black">${totalVendidoValor().toLocaleString('es-CO')}</p>
              </div>
              <div className="flex justify-between">
                <p className="text-gray-400">Base entregada</p>
                <p className="text-orange-400 font-black">+${base.toLocaleString('es-CO')}</p>
              </div>
              <div className="border-t border-gray-600 mt-3 pt-3 flex justify-between">
                <p className="text-white font-black text-lg">Total a entregar</p>
                <p className="text-white font-black text-2xl">${totalAEntregar().toLocaleString('es-CO')}</p>
              </div>
            </div>
            <button onClick={() => setPaso(3)}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-5 rounded-2xl text-xl">
              Continuar →
            </button>
          </>
        )}

        {paso === 3 && (
          <>
            <h2 className="text-2xl font-black text-white mb-2">Cuadre de Caja</h2>
            <div className="bg-orange-900 rounded-2xl p-4 mb-6">
              <p className="text-orange-200 text-sm">Total a entregar</p>
              <p className="text-white font-black text-3xl">${totalAEntregar().toLocaleString('es-CO')}</p>
            </div>
            <div className="bg-gray-800 rounded-2xl p-5 mb-4">
              <label className="text-white font-black text-lg block mb-3">💵 Efectivo</label>
              <input type="number" min="0" value={efectivo} onChange={e => setEfectivo(e.target.value)}
                className="w-full text-center bg-gray-700 text-white border-2 border-gray-600 rounded-xl py-4 text-3xl font-black focus:border-green-400 focus:outline-none"
                placeholder="0" />
            </div>
            <div className="bg-gray-800 rounded-2xl p-5 mb-4">
              <label className="text-white font-black text-lg block mb-3">📱 Transferencias</label>
              <input type="number" min="0" value={transferencias} onChange={e => setTransferencias(e.target.value)}
                className="w-full text-center bg-gray-700 text-white border-2 border-gray-600 rounded-xl py-4 text-3xl font-black focus:border-green-400 focus:outline-none"
                placeholder="0" />
            </div>
            <div className="bg-gray-800 rounded-2xl p-5 mb-4">
              <div className="flex justify-between items-center mb-3">
                <label className="text-white font-black text-lg">📋 Fiados</label>
                <button onClick={() => setFiados([...fiados, { nombre: '', valor: '' }])}
                  className="bg-gray-700 text-gray-300 px-4 py-2 rounded-xl font-bold">+ Agregar</button>
              </div>
              {fiados.map((f, i) => (
                <div key={i} className="flex gap-3 mb-3">
                  <input type="text" placeholder="Nombre cliente" value={f.nombre}
                    onChange={e => { const n=[...fiados]; n[i].nombre=e.target.value; setFiados(n) }}
                    className="flex-1 bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-green-400" />
                  <input type="number" placeholder="Valor" value={f.valor}
                    onChange={e => { const n=[...fiados]; n[i].valor=e.target.value; setFiados(n) }}
                    className="w-36 bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:border-green-400" />
                </div>
              ))}
              {totalFiados() > 0 && <p className="text-right text-green-400 font-black">Total: ${totalFiados().toLocaleString('es-CO')}</p>}
            </div>
            <div className="bg-gray-800 rounded-2xl p-5 mb-4">
              <div className="flex justify-between items-center mb-3">
                <label className="text-white font-black text-lg">🚗 Gastos</label>
                <button onClick={() => setGastos([...gastos, { concepto: '', valor: '' }])}
                  className="bg-gray-700 text-gray-300 px-4 py-2 rounded-xl font-bold">+ Agregar</button>
              </div>
              {gastos.map((g, i) => (
                <div key={i} className="flex gap-3 mb-3">
                  <input type="text" placeholder="Concepto" value={g.concepto}
                    onChange={e => { const n=[...gastos]; n[i].concepto=e.target.value; setGastos(n) }}
                    className="flex-1 bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-red-400" />
                  <input type="number" placeholder="Valor" value={g.valor}
                    onChange={e => { const n=[...gastos]; n[i].valor=e.target.value; setGastos(n) }}
                    className="w-36 bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:border-red-400" />
                </div>
              ))}
              {totalGastos() > 0 && <p className="text-right text-red-400 font-black">Total: ${totalGastos().toLocaleString('es-CO')}</p>}
            </div>
            <div className={`rounded-2xl p-5 mb-6 ${Math.abs(diferencia()) < 500 ? 'bg-green-900' : 'bg-red-900'}`}>
              <div className="flex justify-between mb-2">
                <p className="text-gray-300">Total a entregar</p>
                <p className="text-white font-bold">${totalAEntregar().toLocaleString('es-CO')}</p>
              </div>
              <div className="flex justify-between mb-2">
                <p className="text-gray-300">Efectivo + Transf</p>
                <p className="text-white font-bold">${(parseFloat(efectivo||0)+parseFloat(transferencias||0)).toLocaleString('es-CO')}</p>
              </div>
              <div className="flex justify-between mb-2">
                <p className="text-gray-300">Fiados</p>
                <p className="text-white font-bold">${totalFiados().toLocaleString('es-CO')}</p>
              </div>
              <div className="flex justify-between mb-2">
                <p className="text-gray-300">Gastos</p>
                <p className="text-red-300 font-bold">-${totalGastos().toLocaleString('es-CO')}</p>
              </div>
              <div className="border-t border-gray-600 mt-3 pt-3 flex justify-between">
                <p className="text-white font-black text-xl">Diferencia</p>
                <p className={`font-black text-3xl ${Math.abs(diferencia()) < 500 ? 'text-green-400' : 'text-red-400'}`}>
                  {diferencia() >= 0 ? '+' : ''}${diferencia().toLocaleString('es-CO')}
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <button onClick={() => setPaso(2)} className="flex-1 bg-gray-700 text-white font-bold py-5 rounded-2xl text-lg">← Atras</button>
              <button onClick={guardarLiquidacion} disabled={guardando}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-black py-5 rounded-2xl text-xl disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Cerrar dia ✓'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
