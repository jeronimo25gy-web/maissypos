'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { puedeVerModulo } from '@/lib/permisos'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { subirSoporte, verSoporte } from '@/lib/soportes'
import { CLASIFICACION, proximaFecha, cargarProgramados } from '@/lib/gastos'
import { PageHeader } from '@/components/ui'
import InputDinero from '@/components/InputDinero'
import Exportar from '@/components/Exportar'
import SelectorEmpresa from '@/components/SelectorEmpresa'
import { C, $, fechaCorta, pct, Pill, Kpi, Kpis, Tarjeta, H2, Nota, Boton, campo, campoEstilo, Campo, Segmento, Tabla, td } from './ui'

// Gastos de la empresa activa: registro con soporte, gastos programados,
// categorías clasificadas para Costos y Finanzas, comparación con el mes
// anterior y anulación (solo admin).
const finDeMes = (mes) => { const [y, m] = mes.split('-').map(Number); return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` }
const mesAnterior = (mes) => { const [y, m] = mes.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}` }
const NOMBRE_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const nombreMes = (mes) => NOMBRE_MES[Number(mes.slice(5, 7)) - 1]
const esPrestamo = (cat) => (cat || '').toLowerCase().includes('restamo')
const formVacio = (hoy) => ({ fecha: hoy, categoria: '', descripcion: '', valor: '', cuentaId: '', empleadoId: '', rutaId: '', foto: null, programar: false, dia: String(Number(hoy.slice(8, 10))), variable: false, programadoId: null })

export default function Gastos() {
  const router = useRouter()
  const hoy = obtenerFechaActual()
  const [usuario, setUsuario] = useState(null)
  const [empresa, setEmpresa] = useState(null)
  const [mes, setMes] = useState(hoy.slice(0, 7))
  const [datos, setDatos] = useState(null)
  const [form, setForm] = useState(formVacio(hoy))
  const [guardando, setGuardando] = useState(false)
  const [verCategorias, setVerCategorias] = useState(false)
  const [filtro, setFiltro] = useState('')

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (!u) { router.push('/'); return }
    if (!puedeVerModulo(u, 'gastos', ['admin', 'auxiliar'])) { router.push('/despacho'); return }
    setUsuario(u)
    supabase.from('empresas').select('id, nombre, modelos, logo_url').eq('id', getEmpresaId()).maybeSingle().then(({ data }) => setEmpresa(data))
  }, [router])

  const cargar = useCallback(async () => {
    const id = getEmpresaId(), ant = mesAnterior(mes)
    const [{ data: gastos }, { data: previos }, { data: cats }, { data: cuentas }, { data: empleados }, { data: rutas }, programados] = await Promise.all([
      supabase.from('gastos_admin').select('*, rutas(nombre), cuentas(nombre)').eq('empresa_id', id).gte('fecha', `${mes}-01`).lte('fecha', finDeMes(mes)).order('fecha', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('gastos_admin').select('categoria, valor').eq('empresa_id', id).eq('anulado', false).gte('fecha', `${ant}-01`).lte('fecha', finDeMes(ant)),
      supabase.from('categorias_gasto').select('id, nombre, tipo_costo, estado').eq('empresa_id', id).eq('tipo', 'admin').order('nombre'),
      supabase.from('cuentas').select('id, nombre').eq('empresa_id', id).eq('estado', true).order('tipo').order('nombre'),
      supabase.from('empleados').select('id, nombre').eq('empresa_id', id).eq('activo', true).order('nombre'),
      supabase.from('rutas').select('id, nombre').eq('empresa_id', id).eq('estado', true).order('nombre'),
      cargarProgramados(id),
    ])
    setDatos({ gastos: gastos || [], previos: previos || [], cats: cats || [], cuentas: cuentas || [], empleados: empleados || [], rutas: rutas || [], programados })
  }, [mes])
  useEffect(() => { if (usuario) cargar() }, [usuario, cargar])

  if (!usuario || !datos) return null
  const esAdmin = usuario.rol === 'admin'
  const produce = (empresa?.modelos || []).includes('produccion')
  const clase = Object.fromEntries(datos.cats.map(c => [c.nombre, c.tipo_costo]))
  const vigentes = datos.gastos.filter(g => !g.anulado)
  const total = vigentes.reduce((s, g) => s + Number(g.valor || 0), 0)
  const totalAnt = datos.previos.reduce((s, g) => s + Number(g.valor || 0), 0)
  const porClase = (k) => vigentes.filter(g => clase[g.categoria] === k).reduce((s, g) => s + Number(g.valor || 0), 0)
  const porCat = {}
  vigentes.forEach(g => { porCat[g.categoria] = (porCat[g.categoria] || 0) + Number(g.valor || 0) })
  const porCatAnt = {}
  datos.previos.forEach(g => { porCatAnt[g.categoria] = (porCatAnt[g.categoria] || 0) + Number(g.valor || 0) })
  const filasCat = [...new Set([...Object.keys(porCat), ...Object.keys(porCatAnt)])].map(n => ({ nombre: n, mes: porCat[n] || 0, ant: porCatAnt[n] || 0, clase: clase[n] })).sort((a, b) => b.mes - a.mes || b.ant - a.ant)
  const sinClase = datos.cats.filter(c => c.estado && !c.tipo_costo)
  const sinSoporte = vigentes.filter(g => !g.soporte_url).length
  const variacion = totalAnt ? (total - totalAnt) / totalAnt * 100 : null
  const lista = filtro ? datos.gastos.filter(g => g.categoria === filtro) : datos.gastos

  const guardar = async () => {
    const valor = parseFloat(form.valor)
    if (!form.categoria || !(valor > 0)) { alert('Seleccione la categoría e ingrese el valor.'); return }
    setGuardando(true)
    try {
      const id = getEmpresaId()
      let programadoId = form.programadoId
      if (form.programar && !programadoId) {
        const { data: p, error } = await supabase.from('gastos_programados').insert({
          empresa_id: id, nombre: form.descripcion.trim() || form.categoria, categoria: form.categoria, valor, valor_variable: form.variable,
          dia: Math.min(31, Math.max(1, parseInt(form.dia) || 1)), cuenta_id: form.cuentaId || null, ruta_id: form.rutaId || null,
        }).select().single()
        if (error) throw new Error(error.message)
        programadoId = p.id
      }
      const soporte = form.foto ? await subirSoporte(form.foto, 'gastos') : null
      const { data: g, error } = await supabase.from('gastos_admin').insert({
        empresa_id: id, fecha: form.fecha, categoria: form.categoria, descripcion: form.descripcion.trim() || null, valor,
        registrado_por: usuario.nombre, cuenta_id: form.cuentaId || null, empleado_id: esPrestamo(form.categoria) ? (form.empleadoId || null) : null,
        ruta_id: form.rutaId || null, soporte_url: soporte, programado_id: programadoId,
      }).select().single()
      if (error) throw new Error(error.message)
      if (programadoId) await supabase.from('gastos_programados').update({ ultimo_mes: form.fecha.slice(0, 7) }).eq('id', programadoId)
      if (form.cuentaId) {
        const { error: e2 } = await supabase.from('movimientos_tesoreria').insert({
          empresa_id: id, cuenta_id: form.cuentaId, fecha: form.fecha, tipo: 'salida', monto: valor,
          concepto: `Gasto: ${form.categoria}${form.descripcion.trim() ? ' - ' + form.descripcion.trim() : ''}`, referencia_tipo: 'gasto', referencia_id: g.id,
        })
        if (e2) alert('El gasto quedó registrado, pero no se pudo registrar la salida de la cuenta: ' + e2.message)
      }
      setForm(formVacio(hoy))
      await cargar()
    } catch (e) { alert('No se pudo registrar: ' + e.message) }
    setGuardando(false)
  }

  // Registrar un gasto programado: llena el formulario con sus datos.
  const usarProgramado = (p) => {
    setForm({ ...formVacio(hoy), categoria: p.categoria, descripcion: p.nombre, valor: p.valor_variable ? '' : String(p.valor), cuentaId: p.cuenta_id || '', rutaId: p.ruta_id || '', programadoId: p.id, variable: p.valor_variable })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const armarReporte = () => ({
    titulo: 'Gastos', empresa: empresa?.nombre, logo: empresa?.logo_url, periodo: `${nombreMes(mes)} ${mes.slice(0, 4)}`,
    secciones: [
      { titulo: 'Resumen', kpis: [
        { rotulo: 'Gastos del mes', valor: $(total), valorNumero: total, nota: `${nombreMes(mesAnterior(mes))} ${$(totalAnt)}` },
        ...Object.entries(CLASIFICACION).map(([k, c]) => ({ rotulo: c.nombre, valor: $(porClase(k)), valorNumero: porClase(k) })),
      ] },
      { titulo: 'Por categoría', tabla: { columnas: [{ titulo: 'Categoría' }, { titulo: 'Clasificación' }, { titulo: nombreMes(mes), tipo: 'pesos' }, { titulo: nombreMes(mesAnterior(mes)), tipo: 'pesos' }],
        filas: filasCat.map(f => [f.nombre, CLASIFICACION[f.clase]?.nombre || 'Sin clasificar', f.mes, f.ant]), total: ['Total', '', total, totalAnt] } },
      { titulo: 'Movimientos', tabla: { columnas: [{ titulo: 'Fecha' }, { titulo: 'Categoría' }, { titulo: 'Descripción' }, { titulo: 'Cuenta' }, { titulo: 'Valor', tipo: 'pesos' }],
        filas: vigentes.map(g => [g.fecha, g.categoria, g.descripcion || '', g.cuentas?.nombre || '', Number(g.valor)]), total: ['Total', '', '', '', total] } },
    ],
  })

  return (
    <div style={{ background: C.fondo, color: C.tinta }} className="min-h-screen">
      <PageHeader title="Gastos" subtitle={empresa?.nombre}
        actions={<span className="flex gap-2 flex-wrap items-center">
          <input type="month" value={mes} max={hoy.slice(0, 7)} onChange={e => e.target.value && setMes(e.target.value)} aria-label="Mes" className="h-10 rounded-xl px-3 text-sm font-bold bg-white" style={campoEstilo} />
          <Exportar armar={armarReporte} />
        </span>} />
      <div className="p-4 max-w-6xl mx-auto flex flex-col gap-4">
        <SelectorEmpresa usuario={usuario} />
        <Kpis>
          <Kpi rotulo="Gastos del mes" valor={$(total)} nota={`${nombreMes(mesAnterior(mes))} ${$(totalAnt)}${variacion != null ? ` · ${pct(variacion)}` : ''}`} />
          {produce
            ? <Kpi rotulo="Gastos de planta" valor={$(porClase('cif'))} nota="Entran al costo de producción" />
            : <Kpi rotulo="Distribución" valor={$(porClase('distribucion'))} nota="Entran al costo de las rutas" />}
          <Kpi rotulo="Fijos administrativos" valor={$(porClase('costo_fijo'))} nota={porClase('financiero') ? `Financieros ${$(porClase('financiero'))}` : 'Gastos fijos de la empresa'} />
          {sinClase.length
            ? <Kpi rotulo="Categorías sin clasificar" valor={sinClase.length} rojo nota="No se reflejan bien en Costos" />
            : <Kpi rotulo="Sin soporte" valor={sinSoporte} rojo={sinSoporte > 0} nota={sinSoporte ? 'Gastos sin foto de la factura' : 'Todos con soporte'} />}
        </Kpis>

        <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
          <Tarjeta>
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <H2>{form.programadoId ? 'Registrar gasto programado' : 'Registrar gasto'}</H2>
              {form.programadoId && <Boton onClick={() => setForm(formVacio(hoy))}>Cancelar</Boton>}
            </div>
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
              <Campo etiqueta="Categoría">
                <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} className={campo} style={campoEstilo}>
                  <option value="">Seleccione</option>
                  {datos.cats.filter(c => c.estado).map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                </select>
              </Campo>
              <Campo etiqueta="Valor"><InputDinero value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} placeholder="$" className={campo} style={campoEstilo} /></Campo>
              <Campo etiqueta="Pagado desde">
                <select value={form.cuentaId} onChange={e => setForm({ ...form, cuentaId: e.target.value })} className={campo} style={campoEstilo}>
                  <option value="">Sin registrar en una cuenta</option>
                  {datos.cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </Campo>
              <Campo etiqueta="Fecha"><input type="date" value={form.fecha} max={hoy} onChange={e => setForm({ ...form, fecha: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            </div>
            <Campo etiqueta="Descripción"><input value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} placeholder="Factura, proveedor o detalle" className={campo} style={campoEstilo} /></Campo>
            {form.categoria && !clase[form.categoria] && (
              <div className="rounded-[14px] p-3 flex flex-col gap-2" style={{ background: C.ambarF }}>
                <span className="text-[13px] font-bold" style={{ color: C.ambar }}>Clasifique “{form.categoria}” para que entre bien a Costos y Finanzas</span>
                <ClasificarCategoria cat={datos.cats.find(c => c.nombre === form.categoria)} alCambiar={cargar} produce={produce} />
              </div>
            )}
            {(esPrestamo(form.categoria) || datos.rutas.length > 0) && (
              <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                {esPrestamo(form.categoria) && (
                  <Campo etiqueta="Empleado (se descuenta en su nómina)">
                    <select value={form.empleadoId} onChange={e => setForm({ ...form, empleadoId: e.target.value })} className={campo} style={campoEstilo}>
                      <option value="">Seleccione</option>
                      {datos.empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                    </select>
                  </Campo>
                )}
                {datos.rutas.length > 0 && (
                  <Campo etiqueta="Ruta">
                    <select value={form.rutaId} onChange={e => setForm({ ...form, rutaId: e.target.value })} className={campo} style={campoEstilo}>
                      <option value="">Sin asignar a una ruta</option>
                      {datos.rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                    </select>
                  </Campo>
                )}
              </div>
            )}
            {!form.programadoId && form.programar && (
              <div className="grid gap-2.5 items-end" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                <Campo etiqueta="Día de pago cada mes"><input inputMode="numeric" value={form.dia} onChange={e => setForm({ ...form, dia: e.target.value.replace(/\D/g, '').slice(0, 2) })} className={campo} style={campoEstilo} /></Campo>
                <Segmento etiqueta="Valor" opciones={[[false, 'Valor fijo'], [true, 'Valor variable']]} valor={form.variable} onCambio={v => setForm({ ...form, variable: v })} />
              </div>
            )}
            <div className="flex gap-2 flex-wrap items-center justify-between">
              <span className="flex gap-2 flex-wrap items-center">
                <label className="rounded-xl min-h-[42px] px-4 text-sm font-bold flex items-center cursor-pointer" style={{ background: form.foto ? C.verdeF : C.suave, color: form.foto ? C.verde : C.tinta }}>
                  {form.foto ? 'Soporte adjunto' : 'Adjuntar soporte'}
                  <input type="file" accept="image/*" className="hidden" onChange={e => setForm({ ...form, foto: e.target.files?.[0] || null })} />
                </label>
                {!form.programadoId && (
                  <label className="flex gap-2 items-center text-sm cursor-pointer">
                    <input type="checkbox" checked={form.programar} onChange={e => setForm({ ...form, programar: e.target.checked })} className="w-[18px] h-[18px]" style={{ accentColor: C.tinta }} />
                    Se repite cada mes
                  </label>
                )}
              </span>
              <Boton tono="rojo" onClick={guardar} disabled={guardando}>{guardando ? 'Registrando…' : 'Registrar gasto'}</Boton>
            </div>
          </Tarjeta>

          <Tarjeta>
            <H2>Gastos programados</H2>
            {datos.programados.length === 0
              ? <Nota>Sin gastos programados. Marque “Se repite cada mes” al registrar el arriendo, los servicios o el internet.</Nota>
              : datos.programados.map(p => <Programado key={p.id} p={p} hoy={hoy} usar={usarProgramado} esAdmin={esAdmin} alCambiar={cargar} />)}
          </Tarjeta>
        </div>

        <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
          <Tarjeta>
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <H2>Por categoría</H2>
              <Boton onClick={() => setVerCategorias(!verCategorias)}>{verCategorias ? 'Cerrar' : 'Administrar categorías'}</Boton>
            </div>
            {verCategorias && <AdministrarCategorias cats={datos.cats} alCambiar={cargar} produce={produce} />}
            {filasCat.length === 0 ? <Nota>Sin gastos en {nombreMes(mes)}.</Nota> : (
              <Tabla columnas={['Categoría', { t: 'Clasificación', izq: true }, nombreMes(mes), nombreMes(mesAnterior(mes)), 'Variación']} min={520}>
                {filasCat.map(f => {
                  const v = f.ant ? (f.mes - f.ant) / f.ant * 100 : null
                  return (
                    <tr key={f.nombre} onClick={() => setFiltro(filtro === f.nombre ? '' : f.nombre)} className="cursor-pointer" style={filtro === f.nombre ? { background: C.fondo } : {}}>
                      <td style={td(true)}><b>{f.nombre}</b></td>
                      <td style={td(true)}><Pill tono={f.clase ? 'gris' : 'ambar'}>{CLASIFICACION[f.clase]?.nombre || 'Sin clasificar'}</Pill></td>
                      <td style={td()}>{$(f.mes)}</td>
                      <td style={td()}>{f.ant ? $(f.ant) : '—'}</td>
                      <td style={{ ...td(), color: v > 0 ? C.rojo : v < 0 ? C.verde : C.gris }}>{v == null ? '—' : pct(v)}</td>
                    </tr>
                  )
                })}
                <tr><td style={{ ...td(true), fontWeight: 800, borderBottom: 0, borderTop: `1.5px solid ${C.tinta}` }}>Total</td><td style={{ ...td(), borderBottom: 0, borderTop: `1.5px solid ${C.tinta}` }} /><td style={{ ...td(), fontWeight: 800, borderBottom: 0, borderTop: `1.5px solid ${C.tinta}` }}>{$(total)}</td><td style={{ ...td(), fontWeight: 800, borderBottom: 0, borderTop: `1.5px solid ${C.tinta}` }}>{$(totalAnt)}</td><td style={{ ...td(), fontWeight: 800, borderBottom: 0, borderTop: `1.5px solid ${C.tinta}` }}>{variacion == null ? '—' : pct(variacion)}</td></tr>
              </Tabla>
            )}
          </Tarjeta>

          <Tarjeta>
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <H2>Movimientos de {nombreMes(mes)}</H2>
              {filtro && <Boton onClick={() => setFiltro('')}>Ver todos</Boton>}
            </div>
            {lista.length === 0 ? <Nota>Sin gastos registrados.</Nota> : (
              <div className="flex flex-col">
                {lista.map((g, i) => <Movimiento key={g.id} g={g} primero={i === 0} esAdmin={esAdmin} usuario={usuario} alCambiar={cargar} />)}
              </div>
            )}
          </Tarjeta>
        </div>
      </div>
    </div>
  )
}

function ClasificarCategoria({ cat, alCambiar, produce }) {
  const [ocupado, setOcupado] = useState(false)
  if (!cat) return null
  const opciones = Object.entries(CLASIFICACION).filter(([k]) => produce || k !== 'cif')
  const cambiar = async (k) => {
    setOcupado(true)
    const { error } = await supabase.from('categorias_gasto').update({ tipo_costo: k }).eq('id', cat.id)
    setOcupado(false)
    if (error) { alert('No se pudo clasificar: ' + error.message); return }
    alCambiar()
  }
  return (
    <div className="flex gap-1 rounded-full p-1 flex-wrap w-max max-w-full bg-white" role="group" aria-label={`Clasificación de ${cat.nombre}`} style={ocupado ? { opacity: 0.5 } : {}}>
      {opciones.map(([k, c]) => <button key={k} type="button" disabled={ocupado} aria-pressed={cat.tipo_costo === k} onClick={() => cambiar(k)} className="rounded-full min-h-[34px] px-3 text-[13px] font-bold"
        style={cat.tipo_costo === k ? { color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { color: C.gris }}>{c.nombre}</button>)}
    </div>
  )
}

function AdministrarCategorias({ cats, alCambiar, produce }) {
  const [nueva, setNueva] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const crear = async () => {
    const nombre = nueva.trim()
    if (!nombre) return
    if (cats.some(c => c.nombre.toLowerCase() === nombre.toLowerCase())) { alert('Esa categoría ya existe.'); return }
    setOcupado(true)
    const { error } = await supabase.from('categorias_gasto').insert({ empresa_id: getEmpresaId(), nombre, tipo: 'admin', estado: true })
    setOcupado(false)
    if (error) { alert('No se pudo crear: ' + error.message); return }
    setNueva('')
    alCambiar()
  }
  const activar = async (c) => {
    const { error } = await supabase.from('categorias_gasto').update({ estado: !c.estado }).eq('id', c.id)
    if (error) { alert('Error: ' + error.message); return }
    alCambiar()
  }
  return (
    <div className="rounded-[14px] p-3 flex flex-col gap-3" style={{ background: C.fondo }}>
      {cats.map(c => (
        <div key={c.id} className="flex flex-col gap-1.5 pb-2.5" style={{ borderBottom: `1px solid ${C.linea}`, opacity: c.estado ? 1 : 0.55 }}>
          <div className="flex justify-between items-center gap-2">
            <b className="text-sm">{c.nombre}</b>
            <button type="button" onClick={() => activar(c)} className="text-[13px] font-bold" style={{ color: C.gris }}>{c.estado ? 'Desactivar' : 'Activar'}</button>
          </div>
          {c.estado && <ClasificarCategoria cat={c} alCambiar={alCambiar} produce={produce} />}
        </div>
      ))}
      <div className="flex gap-2">
        <input value={nueva} onChange={e => setNueva(e.target.value)} onKeyDown={e => e.key === 'Enter' && crear()} placeholder="Nueva categoría" className={campo} style={campoEstilo} />
        <Boton tono="tinta" onClick={crear} disabled={ocupado || !nueva.trim()}>Crear</Boton>
      </div>
      <Nota>Gasto de planta: entra al costo de producción. Distribución: entra al costo de la ruta asignada. Fijo administrativo y financiero: gastos de la empresa en Finanzas.</Nota>
    </div>
  )
}

function Programado({ p, hoy, usar, esAdmin, alCambiar }) {
  const f = proximaFecha(p, hoy)
  const registrado = p.ultimo_mes === hoy.slice(0, 7)
  const dias = Math.round((new Date(f + 'T12:00:00') - new Date(hoy + 'T12:00:00')) / 864e5)
  const tono = registrado ? 'verde' : dias < 0 ? 'rojo' : dias === 0 ? 'rojo' : dias <= 5 ? 'ambar' : 'gris'
  const quitar = async () => {
    const { error } = await supabase.from('gastos_programados').update({ activo: false }).eq('id', p.id)
    if (error) { alert('Error: ' + error.message); return }
    alCambiar()
  }
  return (
    <div className="grid gap-2.5 items-center pt-2.5" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', borderTop: `1px solid ${C.linea}` }}>
      <span className="min-w-0">
        <b>{p.nombre}</b>
        <span className="block text-[13px]" style={{ color: C.gris }}>{p.categoria} · día {p.dia} de cada mes{p.valor_variable ? ' · valor variable' : ''}</span>
        <span className="flex gap-3 mt-1">
          {!registrado && <button type="button" onClick={() => usar(p)} className="text-[13px] font-bold" style={{ color: C.rojo }}>Registrar</button>}
          {esAdmin && <button type="button" onClick={quitar} className="text-[13px] font-bold" style={{ color: C.gris }}>Quitar</button>}
        </span>
      </span>
      <span className="text-right flex flex-col items-end gap-1">
        <b className="tabular-nums">{p.valor_variable ? '≈ ' : ''}{$(p.valor)}</b>
        <Pill tono={tono}>{registrado ? `Registrado · próximo ${fechaCorta(f)}` : dias < 0 ? `Vencido ${fechaCorta(f)}` : dias === 0 ? 'Hoy' : fechaCorta(f)}</Pill>
      </span>
    </div>
  )
}

function Movimiento({ g, primero, esAdmin, usuario, alCambiar }) {
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const verFoto = async () => { const url = await verSoporte(g.soporte_url); if (url) window.open(url, '_blank'); else alert('No se pudo abrir el soporte.') }
  const adjuntar = async (file) => {
    if (!file) return
    setOcupado(true)
    try {
      const ruta = await subirSoporte(file, 'gastos')
      const { error } = await supabase.from('gastos_admin').update({ soporte_url: ruta }).eq('id', g.id)
      if (error) throw new Error(error.message)
      alCambiar()
    } catch (e) { alert('No se pudo adjuntar: ' + e.message) }
    setOcupado(false)
  }
  const anular = async () => {
    if (!motivo.trim()) { alert('Escriba el motivo de la anulación.'); return }
    setOcupado(true)
    const { error } = await supabase.from('gastos_admin').update({ anulado: true, anulado_por: usuario.nombre, anulado_motivo: motivo.trim() }).eq('id', g.id)
    if (!error && g.cuenta_id) {
      await supabase.from('movimientos_tesoreria').insert({
        empresa_id: g.empresa_id, cuenta_id: g.cuenta_id, fecha: obtenerFechaActual(), tipo: 'entrada', monto: Number(g.valor),
        concepto: `Anulación de gasto: ${g.categoria}${g.descripcion ? ' - ' + g.descripcion : ''}`, referencia_tipo: 'gasto', referencia_id: g.id,
      })
    }
    setOcupado(false)
    if (error) { alert('No se pudo anular: ' + error.message); return }
    setAnulando(false)
    alCambiar()
  }
  return (
    <div className="py-2.5 flex flex-col gap-2" style={{ borderTop: primero ? 0 : `1px solid ${C.linea}`, opacity: g.anulado ? 0.55 : 1 }}>
      <div className="grid gap-2.5 items-start" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
        <span className="min-w-0">
          <b>{g.categoria}</b>{g.rutas?.nombre ? <span style={{ color: C.gris }}> · {g.rutas.nombre}</span> : ''}
          <span className="block text-[13px]" style={{ color: C.gris }}>{fechaCorta(g.fecha)}{g.descripcion ? ` · ${g.descripcion}` : ''}{g.cuentas?.nombre ? ` · ${g.cuentas.nombre}` : ''} · {g.registrado_por}</span>
          {g.anulado && <span className="block text-[13px]" style={{ color: C.rojo }}>Anulado por {g.anulado_por}: {g.anulado_motivo}</span>}
          {!g.anulado && (
            <span className="flex gap-3 mt-1 flex-wrap">
              {g.soporte_url
                ? <button type="button" onClick={verFoto} className="text-[13px] font-bold" style={{ color: C.tinta }}>Ver soporte</button>
                : <label className="text-[13px] font-bold cursor-pointer" style={{ color: C.tinta }}>{ocupado ? 'Subiendo…' : 'Adjuntar soporte'}<input type="file" accept="image/*" className="hidden" onChange={e => adjuntar(e.target.files?.[0])} /></label>}
              {esAdmin && !anulando && <button type="button" onClick={() => setAnulando(true)} className="text-[13px] font-bold" style={{ color: C.gris }}>Anular</button>}
            </span>
          )}
        </span>
        <span className="text-right flex flex-col items-end gap-1">
          <b className="tabular-nums" style={g.anulado ? { textDecoration: 'line-through' } : {}}>{$(g.valor)}</b>
          {!g.anulado && <Pill tono={g.soporte_url ? 'verde' : 'ambar'}>{g.soporte_url ? 'Con soporte' : 'Sin soporte'}</Pill>}
        </span>
      </div>
      {anulando && (
        <div className="flex gap-2 flex-wrap">
          <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo de la anulación" className={campo + ' flex-1'} style={{ ...campoEstilo, minWidth: 180 }} />
          <Boton onClick={() => setAnulando(false)}>Cancelar</Boton>
          <Boton tono="rojo" onClick={anular} disabled={ocupado}>Anular gasto</Boton>
        </div>
      )}
    </div>
  )
}
