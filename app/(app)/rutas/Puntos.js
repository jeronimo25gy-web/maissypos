'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { DIAS } from '@/lib/rutero'
import { esAncla, horarioPunto } from '@/lib/paradas'

// Rutas > Puntos: el punto de venta (parque, unidad, esquina) con su
// dirección, horario y días, y sus clientes adentro. En el rutero lo
// representa el cliente ancla (tipo_inmueble 'punto'), que también recibe las
// ventas sueltas del punto; los clientes del punto no van uno por uno.
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: 'var(--hoja)', linea: '#E3E1D8', suave: '#EFEDE6', rojo: 'var(--rojo)', rojoF: 'var(--rojo-suave)', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8' }
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const campo = 'w-full h-11 rounded-xl border-2 px-3 text-[15px] bg-white focus:outline-none focus:border-[#1C1B19]'
const etq = 'text-[13px] font-bold block mb-1'
const digitos = (t) => String(t || '').replace(/\D/g, '').slice(-10)
const puntoVacio = { id: null, nombre: '', direccion: '', barrio: '', notas: '', hora_llegada: '', hora_salida: '', dias: [] }
const Pill = ({ tono = 'gris', children }) => {
  const t = { gris: [C.suave, C.gris], ambar: [C.ambarF, C.ambar], verde: [C.verdeF, C.verde], rojo: [C.rojoF, C.rojo] }[tono]
  return <span className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: t[0], color: t[1] }}>{children}</span>
}
const Boton = ({ tipo = 'suave', className = '', ...p }) => <button type="button" {...p} className={`rounded-xl min-h-[40px] px-3.5 text-sm font-bold disabled:opacity-40 ${className}`}
  style={tipo === 'rojo' ? { background: 'var(--primario)', color: '#fff' } : tipo === 'tinta' ? { background: C.tinta, color: '#fff' } : { background: C.suave, color: C.tinta }} />

// Filas de un Excel o CSV → [{ nombre, telefono }]. Busca la fila de títulos
// (nombre, teléfono/celular/WhatsApp); si no hay, toma la 1.ª y 2.ª columna.
async function leerArchivo(file) {
  const XLSX = await import('xlsx')
  const libro = XLSX.read(await file.arrayBuffer())
  const filas = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { header: 1, defval: '' })
  const esNombre = (c) => /nombre|cliente/i.test(String(c)), esTel = (c) => /tel|cel|whats|m[oó]vil|n[uú]mero/i.test(String(c))
  const conAmbas = filas.findIndex(f => f.some(esNombre) && f.some(esTel))
  const iTit = conAmbas >= 0 ? conAmbas : filas.findIndex(f => f.some(esNombre))
  const tit = iTit >= 0 ? filas[iTit].map(c => String(c)) : []
  const colN = Math.max(0, tit.findIndex(esNombre))
  const colT = tit.length ? tit.findIndex(esTel) : 1
  return filas.slice(iTit + 1).map(f => ({ nombre: String(f[colN] || '').trim(), telefono: colT >= 0 ? String(f[colT] || '').trim() : '' })).filter(x => x.nombre || digitos(x.telefono).length >= 7)
}

export default function Puntos({ rutaId, filas, edificios, esAdmin, onCambio }) {
  const empresaId = getEmpresaId()
  const [miembros, setMiembros] = useState({}) // punto id -> clientes
  const [abierto, setAbierto] = useState(null) // punto en edición (puntoVacio + id)
  const [guardando, setGuardando] = useState(false)
  const [nuevo, setNuevo] = useState({ nombre: '', telefono: '', avisos: true })
  const [buscar, setBuscar] = useState('')
  const [base, setBase] = useState([])
  const [importe, setImporte] = useState(null) // { filas, nuevos, ligar, repetidos }
  const [filtro, setFiltro] = useState('')

  const puntos = Object.values(edificios).filter(e => e.tipo === 'punto' && e.ruta_id === rutaId).sort((a, b) => a.nombre.localeCompare(b.nombre))
  const anclaDe = (id) => filas.find(f => f.clientes?.edificio_id === id && esAncla(f.clientes))?.clientes
  const diasDe = (id) => [...new Set(filas.filter(f => f.clientes?.edificio_id === id && esAncla(f.clientes)).map(f => f.dia_semana))].sort()

  const cargarMiembros = async () => {
    const ids = puntos.map(p => p.id)
    if (!ids.length) { setMiembros({}); return }
    const { data } = await supabase.from('clientes').select('id, nombre, telefono, avisos_whatsapp, edificio_id, tipo_inmueble')
      .in('edificio_id', ids).eq('estado', true).eq('empresa_id', empresaId).order('nombre')
    const m = {}
    ;(data || []).filter(c => !esAncla(c)).forEach(c => { (m[c.edificio_id] = m[c.edificio_id] || []).push(c) })
    setMiembros(m)
  }
  useEffect(() => { cargarMiembros() }, [rutaId, Object.keys(edificios).length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clientes de la empresa sin edificio ni punto, para pasarlos al punto.
  useEffect(() => {
    const q = buscar.trim()
    if (q.length < 2) { setBase([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('clientes').select('id, nombre, telefono, direccion, barrio')
        .is('edificio_id', null).eq('estado', true).eq('empresa_id', empresaId)
        .or(`nombre.ilike.%${q.replace(/[%,()]/g, '')}%,telefono.ilike.%${q.replace(/\D/g, '') || '#'}%`).limit(8)
      setBase(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [buscar]) // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = (e) => {
    setNuevo({ nombre: '', telefono: '', avisos: true }); setBuscar(''); setImporte(null); setFiltro('')
    setAbierto(e ? { ...puntoVacio, ...Object.fromEntries(['id', 'nombre', 'direccion', 'barrio', 'notas'].map(k => [k, e[k] || ''])), hora_llegada: (e.hora_llegada || '').slice(0, 5), hora_salida: (e.hora_salida || '').slice(0, 5), dias: diasDe(e.id) } : { ...puntoVacio })
  }

  const guardar = async () => {
    const p = abierto
    const nombre = p.nombre.trim()
    if (!nombre) { alert('Escriba el nombre del punto'); return }
    setGuardando(true)
    try {
      const datos = { empresa_id: empresaId, tipo: 'punto', ruta_id: rutaId, nombre, direccion: p.direccion.trim() || null, barrio: p.barrio.trim() || null, notas: p.notas.trim() || null, hora_llegada: p.hora_llegada || null, hora_salida: p.hora_salida || null }
      let id = p.id
      if (id) { const { error } = await supabase.from('edificios').update(datos).eq('id', id).eq('empresa_id', empresaId); if (error) throw error }
      else { const { data, error } = await supabase.from('edificios').insert(datos).select('id').single(); if (error) throw error; id = data.id }

      // El ancla del punto en el rutero (y las ventas sueltas del punto).
      const { data: ya } = await supabase.from('clientes').select('id').eq('edificio_id', id).eq('tipo_inmueble', 'punto').eq('empresa_id', empresaId).maybeSingle()
      const anc = { nombre, edificio: nombre, direccion: datos.direccion, barrio: datos.barrio, ruta_id: rutaId }
      let anclaId = ya?.id
      if (anclaId) await supabase.from('clientes').update(anc).eq('id', anclaId).eq('empresa_id', empresaId)
      else {
        const { data, error } = await supabase.from('clientes').insert({ ...anc, empresa_id: empresaId, edificio_id: id, tipo_inmueble: 'punto', estado: true, frecuencia_dias: 7, avisos_whatsapp: false }).select('id').single()
        if (error) throw error
        anclaId = data.id
      }
      await supabase.from('clientes').update({ edificio: nombre }).eq('edificio_id', id).neq('tipo_inmueble', 'punto').eq('empresa_id', empresaId)

      // Días: el punto entra al final del día nuevo (se reacomoda en el rutero) y sale de los que se quitaron.
      const actuales = filas.filter(f => f.cliente_id === anclaId)
      for (const d of p.dias.filter(d => !actuales.some(f => f.dia_semana === d))) {
        const ultimo = Math.max(0, ...filas.filter(f => f.dia_semana === d).map(f => f.orden || 0))
        const { error } = await supabase.from('rutero').insert({ empresa_id: empresaId, cliente_id: anclaId, ruta_id: rutaId, dia_semana: d, orden: ultimo + 1 })
        if (error) throw error
      }
      for (const f of actuales.filter(f => !p.dias.includes(f.dia_semana))) {
        await supabase.from('rutero').delete().eq('id', f.id).eq('empresa_id', empresaId)
        const quedan = filas.filter(x => x.dia_semana === f.dia_semana && x.id !== f.id).sort((a, b) => a.orden - b.orden).map(x => x.id)
        if (quedan.length) await supabase.rpc('reordenar_rutero', { p_ids: quedan })
      }
      setAbierto({ ...p, id, nombre })
      await onCambio()
    } catch (e) { alert('No se pudo guardar el punto: ' + e.message) }
    setGuardando(false)
  }

  const quitarPunto = async () => {
    const p = abierto
    if (!confirm(`¿Quitar el punto ${p.nombre}? Sale del rutero; sus clientes quedan en la ruta sin punto.`)) return
    setGuardando(true)
    const anclaId = anclaDe(p.id)?.id
    if (anclaId) {
      for (const f of filas.filter(f => f.cliente_id === anclaId)) {
        await supabase.from('rutero').delete().eq('id', f.id).eq('empresa_id', empresaId)
        const quedan = filas.filter(x => x.dia_semana === f.dia_semana && x.id !== f.id).sort((a, b) => a.orden - b.orden).map(x => x.id)
        if (quedan.length) await supabase.rpc('reordenar_rutero', { p_ids: quedan })
      }
      await supabase.from('clientes').update({ estado: false }).eq('id', anclaId).eq('empresa_id', empresaId)
    }
    await supabase.from('clientes').update({ edificio_id: null, edificio: null }).eq('edificio_id', p.id).neq('tipo_inmueble', 'punto').eq('empresa_id', empresaId)
    await supabase.from('edificios').update({ activo: false }).eq('id', p.id).eq('empresa_id', empresaId)
    setGuardando(false); setAbierto(null); await onCambio()
  }

  // --- Clientes del punto ---
  const deCliente = (x) => ({ empresa_id: empresaId, ruta_id: rutaId, edificio_id: abierto.id, edificio: abierto.nombre, direccion: abierto.direccion || null, barrio: abierto.barrio || null, tipo_inmueble: 'casa', estado: true, frecuencia_dias: 7, ...x })
  const agregar = async () => {
    const nombre = nuevo.nombre.trim()
    if (!nombre) { alert('Escriba el nombre del cliente'); return }
    setGuardando(true)
    const { error } = await supabase.from('clientes').insert(deCliente({ nombre, telefono: nuevo.telefono.trim() || null, avisos_whatsapp: nuevo.avisos }))
    setGuardando(false)
    if (error) { alert('No se pudo crear: ' + error.message); return }
    setNuevo({ nombre: '', telefono: '', avisos: true })
    cargarMiembros()
  }
  const pasar = async (c) => {
    const { error } = await supabase.from('clientes').update({ edificio_id: abierto.id, edificio: abierto.nombre, ruta_id: rutaId }).eq('id', c.id).eq('empresa_id', empresaId)
    if (error) { alert('No se pudo pasar: ' + error.message); return }
    setBase(b => b.filter(x => x.id !== c.id))
    cargarMiembros()
  }
  const cambiarAvisos = async (c) => {
    await supabase.from('clientes').update({ avisos_whatsapp: !c.avisos_whatsapp }).eq('id', c.id).eq('empresa_id', empresaId)
    cargarMiembros()
  }
  const sacar = async (c) => {
    if (!confirm(`¿Sacar a ${c.nombre} del punto? Sigue como cliente de la ruta.`)) return
    await supabase.from('clientes').update({ edificio_id: null, edificio: null }).eq('id', c.id).eq('empresa_id', empresaId)
    cargarMiembros()
  }

  // Excel: los que ya son clientes de la empresa (mismo celular) se pasan al punto; los demás se crean.
  const leerExcel = async (file) => {
    try {
      const lista = await leerArchivo(file)
      if (!lista.length) { alert('No se encontraron clientes en el archivo. Debe tener una columna Nombre y otra Teléfono o Celular.'); return }
      const { data: todos } = await supabase.from('clientes').select('id, telefono, edificio_id, tipo_inmueble').eq('estado', true).eq('empresa_id', empresaId)
      const porTel = {}
      ;(todos || []).filter(c => !esAncla(c) && digitos(c.telefono).length >= 7).forEach(c => { porTel[digitos(c.telefono)] = c })
      const vistos = new Set(), nuevos = [], ligar = []
      let repetidos = 0
      lista.forEach(x => {
        const t = digitos(x.telefono)
        if (t && vistos.has(t)) { repetidos++; return }
        if (t) vistos.add(t)
        const ya = t ? porTel[t] : null
        if (ya?.edificio_id === abierto.id) repetidos++
        else if (ya && !ya.edificio_id) ligar.push(ya.id)
        else if (ya) repetidos++
        else nuevos.push(x)
      })
      setImporte({ archivo: file.name, total: lista.length, nuevos, ligar, repetidos })
    } catch (e) { alert('No se pudo leer el archivo: ' + e.message) }
  }
  const confirmarImporte = async () => {
    setGuardando(true)
    try {
      if (importe.nuevos.length) {
        const { error } = await supabase.from('clientes').insert(importe.nuevos.map(x => deCliente({ nombre: x.nombre || `Cliente ${digitos(x.telefono)}`, telefono: x.telefono || null, avisos_whatsapp: true })))
        if (error) throw error
      }
      if (importe.ligar.length) {
        const { error } = await supabase.from('clientes').update({ edificio_id: abierto.id, edificio: abierto.nombre, ruta_id: rutaId }).in('id', importe.ligar).eq('empresa_id', empresaId)
        if (error) throw error
      }
      setImporte(null)
      cargarMiembros()
    } catch (e) { alert('No se pudo importar: ' + e.message) }
    setGuardando(false)
  }

  const inp = (valor, cambiar, extra = {}) => <input value={valor} onChange={e => cambiar(e.target.value)} className={campo} style={{ borderColor: C.linea }} {...extra} />

  if (abierto) {
    const p = abierto
    const lista = (miembros[p.id] || []).filter(c => !filtro || [c.nombre, c.telefono].some(t => (t || '').toLowerCase().includes(filtro.toLowerCase())))
    const conWa = (miembros[p.id] || []).filter(c => c.avisos_whatsapp && digitos(c.telefono).length === 10).length
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h3 className="text-lg font-extrabold" style={titulo}>{p.id ? p.nombre : 'Nuevo punto'}</h3>
          <Boton onClick={() => setAbierto(null)}>Volver a los puntos</Boton>
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div><label className={etq}>Nombre</label>{inp(p.nombre, v => setAbierto({ ...p, nombre: v }), { placeholder: 'Parque de Laureles' })}</div>
          <div><label className={etq}>Dirección</label>{inp(p.direccion, v => setAbierto({ ...p, direccion: v }), { placeholder: 'Circular 1 con Carrera 76' })}</div>
          <div><label className={etq}>Barrio</label>{inp(p.barrio, v => setAbierto({ ...p, barrio: v }))}</div>
          <div><label className={etq}>Llega</label>{inp(p.hora_llegada, v => setAbierto({ ...p, hora_llegada: v }), { type: 'time' })}</div>
          <div><label className={etq}>Sale</label>{inp(p.hora_salida, v => setAbierto({ ...p, hora_salida: v }), { type: 'time' })}</div>
          <div><label className={etq}>Nota para el vendedor</label>{inp(p.notas, v => setAbierto({ ...p, notas: v }), { placeholder: 'Parquear frente a la iglesia' })}</div>
        </div>
        <div>
          <span className={etq}>Días que se va al punto</span>
          <div className="flex gap-1 rounded-full p-1 flex-wrap w-max max-w-full" style={{ background: C.fondo }} role="group" aria-label="Días">
            {DIAS.map(d => { const on = p.dias.includes(d.n); return (
              <button key={d.n} type="button" aria-pressed={on} onClick={() => setAbierto({ ...p, dias: on ? p.dias.filter(x => x !== d.n) : [...p.dias, d.n].sort() })}
                className="rounded-full min-h-[36px] px-3 text-[13.5px] font-bold" style={on ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { color: C.gris }}>{d.corto}</button>
            ) })}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Boton tipo="rojo" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : p.id ? 'Guardar cambios' : 'Crear punto'}</Boton>
          {p.id && esAdmin && <Boton onClick={quitarPunto} disabled={guardando}>Quitar punto</Boton>}
        </div>

        {p.id && (
          <div className="flex flex-col gap-3 pt-3" style={{ borderTop: `1px solid ${C.linea}` }}>
            <div className="flex flex-wrap justify-between items-baseline gap-2">
              <b className="text-[16px]">Clientes del punto · {(miembros[p.id] || []).length}</b>
              <span className="text-[13px]" style={{ color: C.gris }}>{conWa} reciben el aviso de llegada por WhatsApp</span>
            </div>

            <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: C.fondo }}>
              <b className="text-sm">Agregar cliente</b>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                {inp(nuevo.nombre, v => setNuevo({ ...nuevo, nombre: v }), { placeholder: 'Nombre', 'aria-label': 'Nombre' })}
                {inp(nuevo.telefono, v => setNuevo({ ...nuevo, telefono: v }), { placeholder: 'Celular', inputMode: 'tel', 'aria-label': 'Celular' })}
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={nuevo.avisos} onChange={e => setNuevo({ ...nuevo, avisos: e.target.checked })} className="w-5 h-5" />Acepta avisos de llegada por WhatsApp</label>
              <div><Boton tipo="tinta" onClick={agregar} disabled={guardando}>Agregar</Boton></div>
            </div>

            <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: C.fondo }}>
              <b className="text-sm">Pasar desde la base de clientes</b>
              {inp(buscar, setBuscar, { placeholder: 'Buscar por nombre o celular', type: 'search', 'aria-label': 'Buscar cliente' })}
              {base.map(c => (
                <div key={c.id} className="bg-white rounded-xl px-3 py-2 flex items-center gap-2">
                  <span className="flex-1 min-w-0 text-sm"><b className="block truncate">{c.nombre}</b><span className="block truncate text-[12.5px]" style={{ color: C.gris }}>{[c.telefono, c.direccion, c.barrio].filter(Boolean).join(' · ') || 'Sin datos'}</span></span>
                  <Boton onClick={() => pasar(c)}>Pasar al punto</Boton>
                </div>
              ))}
              {buscar.trim().length >= 2 && !base.length && <span className="text-[13px]" style={{ color: C.gris }}>Nadie sin edificio ni punto coincide.</span>}
            </div>

            <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: C.fondo }}>
              <b className="text-sm">Importar desde Excel</b>
              <span className="text-[13px]" style={{ color: C.gris }}>Una columna Nombre y otra Teléfono o Celular. Si el celular ya es de un cliente de la empresa, se pasa al punto en vez de repetirlo.</span>
              {!importe ? (
                <label className="rounded-xl min-h-[40px] px-3.5 text-sm font-bold bg-white flex items-center w-max cursor-pointer">Escoger archivo
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) leerExcel(f) }} />
                </label>
              ) : (
                <div className="bg-white rounded-xl p-3 flex flex-col gap-2 text-sm">
                  <span><b>{importe.archivo}</b> · {importe.total} filas</span>
                  <span>{importe.nuevos.length} clientes nuevos · {importe.ligar.length} ya eran clientes y se pasan al punto{importe.repetidos ? ` · ${importe.repetidos} repetidos o en otro edificio, se omiten` : ''}</span>
                  <div className="flex gap-2"><Boton onClick={() => setImporte(null)}>Cancelar</Boton><Boton tipo="tinta" onClick={confirmarImporte} disabled={guardando || !(importe.nuevos.length + importe.ligar.length)}>{guardando ? 'Importando…' : 'Importar'}</Boton></div>
                </div>
              )}
            </div>

            {(miembros[p.id] || []).length > 8 && inp(filtro, setFiltro, { placeholder: 'Buscar en el punto', type: 'search', 'aria-label': 'Buscar en el punto' })}
            <div className="flex flex-col">
              {lista.map((c, i) => (
                <div key={c.id} className="flex items-center gap-2 py-2" style={{ borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                  <span className="flex-1 min-w-0 text-sm"><b className="block truncate">{c.nombre}</b><span className="block truncate text-[12.5px]" style={{ color: C.gris }}>{c.telefono || 'Sin celular'}</span></span>
                  <button type="button" onClick={() => cambiarAvisos(c)} aria-pressed={!!c.avisos_whatsapp} className="shrink-0">
                    {!digitos(c.telefono) ? <Pill>Sin WhatsApp</Pill> : c.avisos_whatsapp ? <Pill tono="verde">Avisos sí</Pill> : <Pill tono="ambar">Avisos no</Pill>}
                  </button>
                  <Boton onClick={() => sacar(c)}>Sacar</Boton>
                </div>
              ))}
              {!(miembros[p.id] || []).length && <span className="text-[13px] py-2" style={{ color: C.gris }}>Todavía no tiene clientes.</span>}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between gap-2 flex-wrap items-center">
        <span className="text-[13px]" style={{ color: C.gris }}>{puntos.length} {puntos.length === 1 ? 'punto' : 'puntos'} en esta ruta · el punto es una parada del rutero con sus clientes adentro</span>
        <Boton tipo="rojo" onClick={() => abrir(null)}>+ Punto</Boton>
      </div>
      {puntos.length === 0 && <div className="text-center py-10"><b>Esta ruta no tiene puntos</b><p className="text-sm" style={{ color: C.gris }}>Cree el primero con “+ Punto”: dirección, horario, días y sus clientes.</p></div>}
      {puntos.map(e => {
        const dias = diasDe(e.id)
        const ms = miembros[e.id] || []
        return (
          <button key={e.id} type="button" onClick={() => abrir(e)} className="rounded-2xl p-3 text-left flex flex-wrap gap-3 items-center" style={{ boxShadow: `inset 0 0 0 1.5px ${C.linea}` }}>
            <span className="flex-1 min-w-[200px]"><b>{e.nombre}</b><br /><span className="text-[13px]" style={{ color: C.gris }}>{[e.direccion, horarioPunto(e), dias.length ? dias.map(d => DIAS.find(x => x.n === d)?.corto).join(' · ') : 'Sin días'].filter(Boolean).join(' · ')}</span></span>
            <Pill tono={ms.length ? 'verde' : 'gris'}>{ms.length} {ms.length === 1 ? 'cliente' : 'clientes'}</Pill>
          </button>
        )
      })}
    </div>
  )
}
