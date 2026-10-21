'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { C, Pill, Tarjeta, H2, Nota, Boton, campo, campoEstilo, Campo, Tabla, td } from '../gastos/ui'

// Categorías de producto con su prefijo de SKU (ARE-001, LAC-001…).
export default function Categorias({ cats, productos, recargar }) {
  const [form, setForm] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const usados = (c) => productos.filter(p => p.categoria === c.nombre && p.estado).length

  const guardar = async () => {
    const nombre = form.nombre.trim(), prefijo = form.prefijo_sku.trim().toUpperCase()
    if (!nombre || !prefijo) { alert('Escriba el nombre y el prefijo del SKU.'); return }
    if (cats.some(c => c.id !== form.id && c.nombre.toLowerCase() === nombre.toLowerCase())) { alert('Ya existe una categoría con ese nombre.'); return }
    setGuardando(true)
    const anterior = cats.find(c => c.id === form.id)
    const { error } = form.id
      ? await supabase.from('categorias_producto').update({ nombre, prefijo_sku: prefijo }).eq('id', form.id)
      : await supabase.from('categorias_producto').insert({ nombre, prefijo_sku: prefijo, estado: true, empresa_id: getEmpresaId() })
    // Al renombrar, los productos de la categoría la siguen teniendo.
    if (!error && anterior && anterior.nombre !== nombre) await supabase.from('productos').update({ categoria: nombre }).eq('empresa_id', getEmpresaId()).eq('categoria', anterior.nombre)
    setGuardando(false)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setForm(null); recargar()
  }
  const alternar = async (c) => {
    if (c.estado && usados(c) && !confirm(`${c.nombre} tiene ${usados(c)} productos activos. ¿Desactivarla? Los productos la conservan.`)) return
    const { error } = await supabase.from('categorias_producto').update({ estado: !c.estado }).eq('id', c.id)
    if (error) { alert('Error: ' + error.message); return }
    recargar()
  }

  return (
    <div className="flex flex-col gap-4">
      {form && (
        <Tarjeta>
          <div className="flex justify-between gap-2 items-center"><H2>{form.id ? 'Editar categoría' : 'Nueva categoría'}</H2><Boton onClick={() => setForm(null)}>Cancelar</Boton></div>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <Campo etiqueta="Nombre"><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Prefijo del SKU"><input value={form.prefijo_sku} onChange={e => setForm({ ...form, prefijo_sku: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) })} placeholder="LAC" className={campo} style={campoEstilo} /></Campo>
          </div>
          <div className="flex justify-end"><Boton tono="rojo" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar categoría'}</Boton></div>
        </Tarjeta>
      )}
      <Tarjeta>
        <div className="flex justify-between gap-2 items-center flex-wrap"><H2>Categorías</H2>{!form && <Boton tono="rojo" onClick={() => setForm({ nombre: '', prefijo_sku: '' })}>+ Categoría</Boton>}</div>
        <Tabla columnas={['Categoría', 'Prefijo', 'Productos activos', '']} min={440}>
          {cats.map(c => (
            <tr key={c.id} style={{ opacity: c.estado ? 1 : 0.55 }}>
              <td style={td(true)}><b>{c.nombre}</b>{!c.estado && <span className="ml-2"><Pill>Inactiva</Pill></span>}</td>
              <td style={td()}>{c.prefijo_sku}</td>
              <td style={td()}>{usados(c)}</td>
              <td style={td()}><span className="flex gap-3 justify-end">
                <button type="button" onClick={() => setForm({ id: c.id, nombre: c.nombre, prefijo_sku: c.prefijo_sku || '' })} className="text-[13px] font-bold">Editar</button>
                <button type="button" onClick={() => alternar(c)} className="text-[13px] font-bold" style={{ color: C.gris }}>{c.estado ? 'Desactivar' : 'Activar'}</button>
              </span></td>
            </tr>
          ))}
        </Tabla>
        <Nota>El prefijo arma el SKU de los productos nuevos de la categoría.</Nota>
      </Tarjeta>
    </div>
  )
}
