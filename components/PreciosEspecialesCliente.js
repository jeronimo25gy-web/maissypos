'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import InputDinero from '@/components/InputDinero'

// Descuento de un cliente: su precio pactado por producto. Solo el admin lo
// habilita; en Mi ruta el vendedor lo ve y se aplica solo en el ticket.
export default function PreciosEspecialesCliente({ clienteId, onCambio }) {
  const [precios, setPrecios] = useState([])
  const [productos, setProductos] = useState([])
  const [nuevo, setNuevo] = useState({ sku: '', precio: '' })
  const [guardando, setGuardando] = useState(false)

  const cargar = async () => {
    const { data } = await supabase.from('clientes_precios').select('id, sku, precio_especial').eq('cliente_id', clienteId).eq('empresa_id', getEmpresaId()).order('created_at')
    setPrecios(data || [])
  }

  useEffect(() => {
    cargar()
    supabase.from('productos').select('sku, nombre, precio_venta').eq('estado', true).neq('tipo', 'materia_prima').eq('empresa_id', getEmpresaId()).order('nombre')
      .then(({ data }) => setProductos(data || []))
  }, [clienteId])

  const agregar = async () => {
    const precio = parseFloat(nuevo.precio)
    if (!nuevo.sku || !(precio > 0)) { alert('Escoge el producto y el precio pactado'); return }
    setGuardando(true)
    const { error } = await supabase.from('clientes_precios').upsert({ empresa_id: getEmpresaId(), cliente_id: clienteId, sku: nuevo.sku, precio_especial: precio }, { onConflict: 'cliente_id,sku' })
    setGuardando(false)
    if (error) { alert('Error: ' + error.message); return }
    setNuevo({ sku: '', precio: '' })
    await cargar()
    onCambio?.()
  }

  const quitar = async (p) => {
    await supabase.from('clientes_precios').delete().eq('id', p.id).eq('empresa_id', getEmpresaId())
    await cargar()
    onCambio?.()
  }

  const nombreDe = (sku) => productos.find(p => p.sku === sku)
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
      <p className="text-sm font-black text-gray-800">Descuento del cliente</p>
      <p className="text-xs text-gray-600 mb-2">Precio pactado por producto. El vendedor lo ve en Mi ruta y se aplica solo al vender; nadie más puede poner descuentos.</p>
      {precios.length === 0 && <p className="text-xs text-gray-400 mb-2">Sin descuento: paga el precio normal.</p>}
      {precios.map(p => (
        <div key={p.id} className="flex justify-between items-center bg-white rounded-lg px-3 py-2 mb-1 text-xs">
          <span className="text-gray-700">{nombreDe(p.sku)?.nombre || p.sku} <span className="text-gray-400">(normal ${Math.round(nombreDe(p.sku)?.precio_venta || 0).toLocaleString('es-CO')})</span></span>
          <span className="flex items-center gap-2">
            <b className="text-gray-900">${Math.round(p.precio_especial).toLocaleString('es-CO')}</b>
            <button onClick={() => quitar(p)} aria-label="Quitar precio" className="text-gray-400 hover:text-brand">✕</button>
          </span>
        </div>
      ))}
      <div className="flex gap-2 mt-2">
        <select value={nuevo.sku} onChange={e => setNuevo({ ...nuevo, sku: e.target.value })}
          className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-800 bg-white focus:outline-none focus:border-brand">
          <option value="">Producto</option>
          {productos.map(p => <option key={p.sku} value={p.sku}>{p.nombre}</option>)}
        </select>
        <InputDinero placeholder="Precio" value={nuevo.precio} onChange={e => setNuevo({ ...nuevo, precio: e.target.value })}
          className="w-24 border border-gray-200 rounded-lg px-2 py-2 text-xs font-bold text-gray-800 bg-white focus:outline-none focus:border-brand" />
        <button onClick={agregar} disabled={guardando} className="bg-brand text-white px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50">{guardando ? '...' : 'Agregar'}</button>
      </div>
    </div>
  )
}
