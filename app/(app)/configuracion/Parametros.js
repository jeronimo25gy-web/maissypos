'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import InputDinero from '@/components/InputDinero'
import { nombreLindo } from '@/lib/maestros'
import { C, Pill, Tarjeta, H2, Nota, Boton, campo, campoEstilo, Campo, Segmento, Tabla, td } from '../gastos/ui'

// Parámetros de operación de la empresa en un solo lugar: crédito y pagos,
// base de caja por ruta, tarifas de domicilio, gastos de ruta y alertas.
const DOMICILIO = [
  ['domi_ruta_minimo', 'Con la ruta · pedido mínimo', '$', 20000], ['domi_ruta_gratis_desde', 'Con la ruta · domicilio gratis desde', '$', 50000], ['domi_ruta_valor', 'Con la ruta · valor del domicilio', '$', 0],
  ['domi_express_base', 'Express · tarifa base', '$', 5000], ['domi_express_km_incluidos', 'Express · kilómetros incluidos', 'km', 3], ['domi_express_km_valor', 'Express · kilómetro adicional', '$', 1000], ['domi_express_tope', 'Express · tope (0 = sin tope)', '$', 0],
]

export async function guardarParametro(empresaId, parametro, valor) {
  const { data } = await supabase.from('configuracion').update({ valor: String(valor) }).eq('empresa_id', empresaId).eq('parametro', parametro).select('id')
  if (!data?.length) {
    const { error } = await supabase.from('configuracion').insert({ empresa_id: empresaId, parametro, valor: String(valor) })
    if (error) throw new Error(error.message)
  }
}

export default function Parametros() {
  const [d, setD] = useState(null)
  const [v, setV] = useState({})
  const [sucio, setSucio] = useState({})
  const [guardando, setGuardando] = useState(null)
  const [nuevaCat, setNuevaCat] = useState('')
  const cargar = useCallback(async () => {
    const id = getEmpresaId()
    const [{ data: conf }, { data: rutas }, { data: cats }, { data: emp }] = await Promise.all([
      supabase.from('configuracion').select('parametro, valor').eq('empresa_id', id).not('parametro', 'like', 'base_despacho_%'),
      supabase.from('rutas').select('id, nombre, tipo').eq('empresa_id', id).eq('estado', true).order('nombre'),
      supabase.from('categorias_gasto').select('id, nombre, estado').eq('empresa_id', id).eq('tipo', 'ruta').order('nombre'),
      supabase.from('empresas').select('id, modelos, alertar_cambio_precio_compra, cambios_incluye_proveedor').eq('id', id).maybeSingle(),
    ])
    const valores = Object.fromEntries((conf || []).map(c => [c.parametro, c.valor]))
    setD({ rutas: rutas || [], cats: cats || [], emp })
    setV(valores); setSucio({})
  }, [])
  useEffect(() => { cargar() }, [cargar])
  if (!d) return <Nota>Cargando…</Nota>

  const cambiar = (k, valor, grupo) => { setV(x => ({ ...x, [k]: valor })); setSucio(s => ({ ...s, [grupo]: [...new Set([...(s[grupo] || []), k])] })) }
  const guardarGrupo = async (grupo) => {
    setGuardando(grupo)
    try { for (const k of sucio[grupo] || []) await guardarParametro(getEmpresaId(), k, v[k] ?? '') ; setSucio(s => ({ ...s, [grupo]: [] })) }
    catch (e) { alert('No se pudo guardar: ' + e.message) }
    setGuardando(null)
  }
  const BotonGuardar = ({ grupo }) => (sucio[grupo]?.length ? <Boton tono="rojo" onClick={() => guardarGrupo(grupo)} disabled={guardando === grupo}>{guardando === grupo ? 'Guardando…' : 'Guardar'}</Boton> : null)
  // Función (no componente) para que el campo no se vuelva a montar y pierda el foco al escribir.
  const numero = ({ k, etiqueta, unidad, def, grupo }) => (
    <Campo key={k} etiqueta={etiqueta}>
      {unidad === '$' ? <InputDinero value={v[k] ?? ''} onChange={e => cambiar(k, e.target.value, grupo)} placeholder={def != null ? String(def) : ''} className={campo} style={campoEstilo} />
        : <input inputMode="numeric" value={v[k] ?? ''} onChange={e => cambiar(k, e.target.value.replace(/\D/g, ''), grupo)} placeholder={def != null ? String(def) : ''} className={campo} style={campoEstilo} />}
    </Campo>
  )
  const alternarEmpresa = async (campoE) => {
    const { error } = await supabase.from('empresas').update({ [campoE]: !d.emp[campoE] }).eq('id', d.emp.id)
    if (error) { alert('Error: ' + error.message); return }
    cargar()
  }
  const agregarCat = async () => {
    const nombre = nuevaCat.trim()
    if (!nombre) return
    if (d.cats.some(c => c.nombre.toLowerCase() === nombre.toLowerCase())) { alert('Esa categoría ya existe.'); return }
    const { error } = await supabase.from('categorias_gasto').insert({ empresa_id: getEmpresaId(), nombre, tipo: 'ruta', estado: true })
    if (error) { alert('Error: ' + error.message); return }
    setNuevaCat(''); cargar()
  }
  const alternarCat = async (c) => {
    const { error } = await supabase.from('categorias_gasto').update({ estado: !c.estado }).eq('id', c.id)
    if (error) { alert('Error: ' + error.message); return }
    cargar()
  }
  const distribuye = (d.emp?.modelos || []).includes('distribucion')
  const fila = { gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta>
        <div className="flex justify-between gap-2 items-center"><H2>Crédito y pagos</H2><BotonGuardar grupo="credito" /></div>
        <div className="grid gap-2.5" style={fila}>
          {numero({ k: 'plazo_credito_dias', etiqueta: 'Plazo de crédito a clientes (días)', def: 7, grupo: 'credito' })}
          {numero({ k: 'plazo_proveedor_dias', etiqueta: 'Plazo general con proveedores (días)', def: 30, grupo: 'credito' })}
        </div>
      </Tarjeta>

      {d.rutas.length > 0 && (
        <Tarjeta>
          <div className="flex justify-between gap-2 items-center"><H2>Base de caja por ruta</H2><BotonGuardar grupo="base" /></div>
          <Tabla columnas={['Ruta', 'Base']} min={320}>
            {d.rutas.map(r => (
              <tr key={r.id}>
                <td style={td(true)}><b>{nombreLindo(r.nombre)}</b></td>
                <td style={td()}><InputDinero value={v[`base_ruta_${r.id}`] ?? ''} onChange={e => cambiar(`base_ruta_${r.id}`, e.target.value, 'base')} placeholder="Como el último despacho" aria-label={`Base de ${r.nombre}`} className={campo} style={{ ...campoEstilo, width: 200, marginLeft: 'auto' }} /></td>
              </tr>
            ))}
          </Tabla>
        </Tarjeta>
      )}

      {distribuye && (
        <Tarjeta>
          <div className="flex justify-between gap-2 items-center"><H2>Domicilios</H2><BotonGuardar grupo="domi" /></div>
          <div className="grid gap-2.5" style={fila}>
            {DOMICILIO.map(([k, e, u, def]) => numero({ k, etiqueta: e, unidad: u, def, grupo: 'domi' }))}
            <Campo etiqueta="Dirección de la bodega (para calcular km)"><input value={v.bodega_direccion ?? ''} onChange={e => cambiar('bodega_direccion', e.target.value, 'domi')} className={campo} style={campoEstilo} /></Campo>
          </div>
        </Tarjeta>
      )}

      {distribuye && (
        <Tarjeta>
          <H2>Gastos de ruta</H2>
          <div className="flex gap-1.5 flex-wrap">
            {d.cats.map(c => <button key={c.id} type="button" onClick={() => alternarCat(c)} title={c.estado ? 'Desactivar' : 'Activar'} className="rounded-full min-h-[34px] px-3 text-[13px] font-bold" style={c.estado ? { background: C.suave, color: C.tinta } : { background: '#fff', color: C.gris, textDecoration: 'line-through', boxShadow: `inset 0 0 0 1.5px ${C.linea}` }}>{c.nombre}</button>)}
          </div>
          <div className="flex gap-2"><input value={nuevaCat} onChange={e => setNuevaCat(e.target.value)} onKeyDown={e => e.key === 'Enter' && agregarCat()} placeholder="Nueva categoría" className={campo} style={{ ...campoEstilo, maxWidth: 260 }} /><Boton tono="tinta" onClick={agregarCat} disabled={!nuevaCat.trim()}>Agregar</Boton></div>
        </Tarjeta>
      )}

      <Tarjeta>
        <H2>Alertas y reglas</H2>
        {[['alertar_cambio_precio_compra', 'Avisar cambio de precio en Compras', 'Cuando un proveedor cobra distinto a la última compra'], ['cambios_incluye_proveedor', 'Cambios: opción "Descuenta al proveedor"', 'Productos dañados que el proveedor repone o descuenta']].map(([k, t, n], i) => (
          <div key={k} className="grid gap-2.5 items-center pt-2.5" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', borderTop: i ? `1px solid ${C.linea}` : 0 }}>
            <span className="min-w-0"><b>{t}</b><span className="block text-[13px]" style={{ color: C.gris }}>{n}</span></span>
            <Segmento etiqueta={t} opciones={[[true, 'Sí'], [false, 'No']]} valor={!!d.emp?.[k]} onCambio={(x) => { if (x !== !!d.emp?.[k]) alternarEmpresa(k) }} />
          </div>
        ))}
      </Tarjeta>
    </div>
  )
}
