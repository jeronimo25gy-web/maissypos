'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import InputDinero from '@/components/InputDinero'
import { useDestino, mostrarFila } from '@/lib/destino'
import { nombreLindo } from '@/lib/maestros'
import { C, $, Pill, Tarjeta, H2, Nota, Boton, campo, campoEstilo, Campo, Segmento, Tabla, td } from '../gastos/ui'

// Vendedores y rutas de la empresa: datos de cada ruta (tipo, cargue, días,
// cuenta de transferencias), su vendedor, precios de la ruta y carga base por
// día. Paradas, clientes y metas viven en el módulo Rutas.
const DIAS = [[1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes'], [6, 'Sábado'], [0, 'Domingo']]
const TIPO_RUTA = { ruta: 'Ruta', punto_venta: 'Punto de venta', mostrador: 'Mostrador' }
const hora = (h) => h ? new Date(`2000-01-01T${h}`).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : null

export default function VendedoresRutas({ nuevoRef }) {
  const [d, setD] = useState(null)
  const [formV, setFormV] = useState(null)
  const [formR, setFormR] = useState(null)
  const [abierta, setAbierta] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [resaltado, setResaltado] = useState(null)

  const cargar = useCallback(async () => {
    const id = getEmpresaId()
    const hace60 = new Date(Date.now() - 60 * 864e5).toLocaleDateString('en-CA')
    const [{ data: vends }, { data: rutas }, { data: cuentas }, { data: emps }, { data: desps }, { data: prods }] = await Promise.all([
      supabase.from('vendedores').select('*').eq('empresa_id', id).order('nombre'),
      supabase.from('rutas').select('*, cuentas(nombre)').eq('empresa_id', id).order('nombre'),
      supabase.from('cuentas').select('id, nombre').eq('estado', true).eq('empresa_id', id).order('nombre'),
      supabase.from('empleados').select('vendedor_id, activo').eq('empresa_id', id).not('vendedor_id', 'is', null),
      supabase.from('despachos_encab').select('vendedor_id').eq('empresa_id', id).gte('fecha', hace60),
      supabase.from('productos').select('sku, nombre, precio_venta').eq('empresa_id', id).eq('estado', true).neq('tipo', 'materia_prima').order('orden_despacho', { ascending: true, nullsFirst: false }).order('nombre'),
    ])
    setD({ vends: vends || [], rutas: rutas || [], cuentas: cuentas || [], enNomina: new Set((emps || []).filter(e => e.activo).map(e => e.vendedor_id)), activos60: new Set((desps || []).map(x => x.vendedor_id)), prods: prods || [] })
  }, [])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { if (nuevoRef) nuevoRef.current = () => setFormV({ nombre: '', telefono: '', ruta_id: '' }) }, [nuevoRef])
  useDestino('vendedor', (id) => { setResaltado(id); mostrarFila(`fila-${id}`) }, !!d)
  if (!d) return <Nota>Cargando…</Nota>

  const guardarV = async () => {
    if (!formV.nombre.trim()) { alert('Escriba el nombre del vendedor.'); return }
    setGuardando(true)
    const datos = { nombre: formV.nombre.trim(), telefono: formV.telefono?.trim() || null, ruta_id: formV.ruta_id || null }
    const { error } = formV.id ? await supabase.from('vendedores').update(datos).eq('id', formV.id) : await supabase.from('vendedores').insert({ ...datos, estado: true, empresa_id: getEmpresaId() })
    setGuardando(false)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setFormV(null); cargar()
  }
  const guardarR = async () => {
    if (!formR.nombre.trim()) { alert('Escriba el nombre de la ruta.'); return }
    setGuardando(true)
    const datos = { nombre: formR.nombre.trim(), zona: formR.zona?.trim() || null, tipo: formR.tipo || 'ruta', hora_cargue: formR.hora_cargue || null, dias_operacion: formR.dias_operacion?.trim() || null, cuenta_id: formR.cuenta_id || null }
    const { error } = formR.id ? await supabase.from('rutas').update(datos).eq('id', formR.id) : await supabase.from('rutas').insert({ ...datos, estado: true, empresa_id: getEmpresaId() })
    setGuardando(false)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setFormR(null); cargar()
  }
  const alternar = async (tabla, x) => {
    if (x.estado && !confirm(`¿Desactivar ${nombreLindo(x.nombre)}? Conserva su historial.`)) return
    const { error } = await supabase.from(tabla).update({ estado: !x.estado }).eq('id', x.id)
    if (error) { alert('Error: ' + error.message); return }
    cargar()
  }
  const vendedorDe = (rutaId) => d.vends.filter(v => v.estado && v.ruta_id === rutaId)

  return (
    <div className="flex flex-col gap-4">
      {formV && (
        <Tarjeta>
          <div className="flex justify-between gap-2 items-center"><H2>{formV.id ? `Editar ${formV.nombre}` : 'Nuevo vendedor'}</H2><Boton onClick={() => setFormV(null)}>Cancelar</Boton></div>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <Campo etiqueta="Nombre"><input value={formV.nombre} onChange={e => setFormV({ ...formV, nombre: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Teléfono"><input inputMode="tel" value={formV.telefono || ''} onChange={e => setFormV({ ...formV, telefono: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Ruta">
              <select value={formV.ruta_id || ''} onChange={e => setFormV({ ...formV, ruta_id: e.target.value })} className={campo} style={campoEstilo}>
                <option value="">Sin ruta</option>
                {d.rutas.filter(r => r.estado).map(r => <option key={r.id} value={r.id}>{nombreLindo(r.nombre)}</option>)}
              </select>
            </Campo>
          </div>
          <div className="flex justify-end"><Boton tono="rojo" onClick={guardarV} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar vendedor'}</Boton></div>
        </Tarjeta>
      )}
      {formR && (
        <Tarjeta>
          <div className="flex justify-between gap-2 items-center"><H2>{formR.id ? `Editar ${nombreLindo(formR.nombre)}` : 'Nueva ruta'}</H2><Boton onClick={() => setFormR(null)}>Cancelar</Boton></div>
          <Segmento etiqueta="Tipo" opciones={Object.entries(TIPO_RUTA)} valor={formR.tipo || 'ruta'} onCambio={v => setFormR({ ...formR, tipo: v })} />
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <Campo etiqueta="Nombre"><input value={formR.nombre} onChange={e => setFormR({ ...formR, nombre: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Zona"><input value={formR.zona || ''} onChange={e => setFormR({ ...formR, zona: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Hora de cargue"><input type="time" value={formR.hora_cargue || ''} onChange={e => setFormR({ ...formR, hora_cargue: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Días de operación"><input value={formR.dias_operacion || ''} onChange={e => setFormR({ ...formR, dias_operacion: e.target.value })} placeholder="Lunes a sábado" className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Cuenta para transferencias">
              <select value={formR.cuenta_id || ''} onChange={e => setFormR({ ...formR, cuenta_id: e.target.value })} className={campo} style={campoEstilo}>
                <option value="">Sin cuenta</option>
                {d.cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Campo>
          </div>
          <div className="flex justify-end"><Boton tono="rojo" onClick={guardarR} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar ruta'}</Boton></div>
        </Tarjeta>
      )}
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))' }}>
        <Tarjeta>
          <div className="flex justify-between gap-2 items-center flex-wrap"><H2>Vendedores</H2><Boton tono="rojo" onClick={() => setFormV({ nombre: '', telefono: '', ruta_id: '' })}>+ Vendedor</Boton></div>
          <Tabla columnas={['Vendedor', { t: 'Ruta', izq: true }, 'Nómina', '']} min={480}>
            {d.vends.map(v => {
              const ruta = d.rutas.find(r => r.id === v.ruta_id)
              const quieto = v.estado && !d.activos60.has(v.id)
              return (
                <tr key={v.id} id={`fila-${v.id}`} style={{ opacity: v.estado ? 1 : 0.55, background: resaltado === v.id ? C.ambarF : undefined }}>
                  <td style={td(true)}><b>{v.nombre}</b><span className="block text-[12.5px]" style={{ color: C.gris }}>{v.telefono || 'Sin teléfono'}{quieto ? ' · sin despachos en 60 días' : ''}</span></td>
                  <td style={td(true)}>{ruta ? nombreLindo(ruta.nombre) : '—'}</td>
                  <td style={td()}>{!v.estado ? <Pill>Inactivo</Pill> : d.enNomina.has(v.id) ? <Pill tono="verde">Registrado</Pill> : d.activos60.has(v.id) ? <Pill tono="rojo">Sin registrar</Pill> : '—'}</td>
                  <td style={td()}><span className="flex gap-3 justify-end">
                    <button type="button" onClick={() => setFormV({ ...v })} className="text-[13px] font-bold">Editar</button>
                    <button type="button" onClick={() => alternar('vendedores', v)} className="text-[13px] font-bold" style={{ color: C.gris }}>{v.estado ? 'Desactivar' : 'Activar'}</button>
                  </span></td>
                </tr>
              )
            })}
          </Tabla>
          <Nota>Vendedores sin despachos en 60 días se pueden desactivar sin perder su historial. El registro en Nómina se hace en Nómina → Empleados.</Nota>
        </Tarjeta>
        <Tarjeta>
          <div className="flex justify-between gap-2 items-center flex-wrap"><H2>Rutas</H2><Boton onClick={() => setFormR({ nombre: '', zona: '', tipo: 'ruta', hora_cargue: '', dias_operacion: '', cuenta_id: '' })}>+ Ruta</Boton></div>
          {d.rutas.map((r, i) => (
            <div key={r.id} className="flex flex-col gap-2 pt-2.5" style={{ borderTop: i ? `1px solid ${C.linea}` : 0, opacity: r.estado ? 1 : 0.55 }}>
              <div className="grid gap-2.5 items-start" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                <button type="button" onClick={() => setAbierta(abierta === r.id ? null : r.id)} className="text-left min-w-0">
                  <b>{nombreLindo(r.nombre)}</b>
                  <span className="block text-[13px]" style={{ color: C.gris }}>{[TIPO_RUTA[r.tipo] || 'Ruta', hora(r.hora_cargue) && `cargue ${hora(r.hora_cargue)}`, r.dias_operacion, r.cuentas?.nombre && `transferencias a ${r.cuentas.nombre}`].filter(Boolean).join(' · ')}</span>
                </button>
                <span className="text-[13px] text-right" style={{ color: C.gris }}>{vendedorDe(r.id).map(v => v.nombre).join(', ') || 'Sin vendedor'}</span>
              </div>
              {abierta === r.id && <DetalleRuta r={r} prods={d.prods} editar={() => setFormR({ ...r, hora_cargue: r.hora_cargue?.slice(0, 5) || '' })} alternar={() => alternar('rutas', r)} />}
            </div>
          ))}
          <Nota>Toque una ruta para ver sus precios y su carga base. Paradas, clientes y metas: en <Link href="/rutas" className="font-bold underline" style={{ color: C.tinta }}>Rutas</Link>.</Nota>
        </Tarjeta>
      </div>
    </div>
  )
}

// Precios propios de la ruta y carga base por día de la semana.
function DetalleRuta({ r, prods, editar, alternar }) {
  const [precios, setPrecios] = useState(null)
  const [nuevo, setNuevo] = useState({ sku: '', precio: '' })
  const [dia, setDia] = useState(() => { const d = new Date().getDay(); return d === 0 ? 1 : d })
  const [carga, setCarga] = useState({})
  const [verCarga, setVerCarga] = useState(false)
  const cargarPrecios = useCallback(async () => {
    const { data } = await supabase.from('rutas_precios').select('*').eq('ruta_id', r.id).order('created_at')
    setPrecios(data || [])
  }, [r.id])
  useEffect(() => { cargarPrecios() }, [cargarPrecios])
  useEffect(() => {
    if (!verCarga) return
    supabase.from('cargas_ruta').select('sku, cantidad').eq('ruta_id', r.id).eq('dia_semana', dia).eq('empresa_id', getEmpresaId())
      .then(({ data }) => setCarga(Object.fromEntries((data || []).map(c => [c.sku, String(c.cantidad)]))))
  }, [r.id, dia, verCarga])

  const agregarPrecio = async () => {
    if (!nuevo.sku || !(Number(nuevo.precio) > 0)) { alert('Seleccione el producto y escriba el precio.'); return }
    const { error } = await supabase.from('rutas_precios').upsert({ empresa_id: getEmpresaId(), ruta_id: r.id, sku: nuevo.sku, precio_especial: Number(nuevo.precio) }, { onConflict: 'ruta_id,sku' })
    if (error) { alert('Error: ' + error.message); return }
    setNuevo({ sku: '', precio: '' }); cargarPrecios()
  }
  const quitarPrecio = async (p) => {
    const { error } = await supabase.from('rutas_precios').delete().eq('id', p.id)
    if (error) { alert('Error: ' + error.message); return }
    cargarPrecios()
  }
  const guardarCarga = async (sku, valor) => {
    const { error } = await supabase.from('cargas_ruta').upsert({ empresa_id: getEmpresaId(), ruta_id: r.id, sku, dia_semana: dia, cantidad: parseFloat(valor || 0) }, { onConflict: 'empresa_id,ruta_id,sku,dia_semana' })
    if (error) alert('No se guardó la carga: ' + error.message)
  }
  const prod = (sku) => prods.find(p => p.sku === sku)

  return (
    <div className="rounded-[14px] p-3 flex flex-col gap-3" style={{ background: C.fondo }}>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-extrabold uppercase tracking-wider" style={{ color: C.gris }}>Precios de la ruta</span>
        {!precios ? <Nota>Cargando…</Nota> : precios.length === 0 ? <Nota>Usa el precio de lista en todos los productos.</Nota> : precios.map(p => (
          <div key={p.id} className="flex justify-between gap-3 text-sm items-center">
            <span className="min-w-0">{prod(p.sku)?.nombre || p.sku} <span style={{ color: C.gris }}>· lista {prod(p.sku) ? $(prod(p.sku).precio_venta) : '—'}</span></span>
            <span className="flex gap-3 items-center"><b className="tabular-nums">{$(p.precio_especial)}</b><button type="button" onClick={() => quitarPrecio(p)} className="text-[13px] font-bold" style={{ color: C.gris }}>Quitar</button></span>
          </div>
        ))}
        <div className="flex gap-2 flex-wrap">
          <select value={nuevo.sku} onChange={e => setNuevo({ ...nuevo, sku: e.target.value })} aria-label="Producto" className={campo} style={{ ...campoEstilo, maxWidth: 260 }}>
            <option value="">Producto…</option>
            {prods.map(p => <option key={p.sku} value={p.sku}>{p.nombre}</option>)}
          </select>
          <InputDinero value={nuevo.precio} onChange={e => setNuevo({ ...nuevo, precio: e.target.value })} placeholder="Precio" aria-label="Precio" className={campo} style={{ ...campoEstilo, width: 130 }} />
          <Boton tono="tinta" onClick={agregarPrecio}>Agregar</Boton>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center gap-2 flex-wrap">
          <span className="text-[13px] font-extrabold uppercase tracking-wider" style={{ color: C.gris }}>Carga base por día</span>
          <Boton tono="blanco" onClick={() => setVerCarga(!verCarga)}>{verCarga ? 'Ocultar' : 'Ver carga base'}</Boton>
        </div>
        {verCarga && (<>
          <div className="flex gap-1 flex-wrap">{DIAS.map(([n, t]) => <button key={n} type="button" aria-pressed={dia === n} onClick={() => setDia(n)} className="rounded-full min-h-[34px] px-3 text-[13px] font-bold" style={dia === n ? { background: '#fff', color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { color: C.gris }}>{t}</button>)}</div>
          <Tabla columnas={['Producto', 'Cantidad']} min={300}>
            {prods.map(p => (
              <tr key={p.sku}>
                <td style={td(true)}>{p.nombre}</td>
                <td style={td()}><input inputMode="numeric" value={carga[p.sku] ?? ''} placeholder="0" onChange={e => setCarga({ ...carga, [p.sku]: e.target.value.replace(/\D/g, '') })} onBlur={e => guardarCarga(p.sku, e.target.value)} aria-label={`Carga de ${p.nombre}`}
                  className="h-9 w-[80px] rounded-[10px] px-2 text-right font-bold outline-none bg-white" style={{ border: `2px solid ${C.linea}` }} /></td>
              </tr>
            ))}
          </Tabla>
          <Nota>Se guarda al salir de cada casilla. Despacho la propone como carga del día.</Nota>
        </>)}
      </div>
      <div className="flex gap-2 flex-wrap"><Boton tono="blanco" onClick={editar}>Editar ruta</Boton><Boton tono="blanco" onClick={alternar}>{r.estado ? 'Desactivar' : 'Activar'}</Boton></div>
    </div>
  )
}
