'use client'
import { useState, useEffect, useCallback, Fragment } from 'react'
import { useDestino } from '@/lib/destino'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { cargarProductos, porCompletar, cargarHistorial, esBolsa, margenDe } from '@/lib/maestros'
import { abrirPdf } from '@/lib/exportar'
import InputDinero from '@/components/InputDinero'
import { C, $, fechaCorta, Pill, Kpi, Kpis, Tarjeta, H2, Nota, Boton, campo, campoEstilo, Campo, Segmento, Tabla, td } from '../gastos/ui'
import Categorias from './Categorias'
import Promociones from './Promociones'

// Maestros → Productos de la empresa activa: tabla por categoría con costo,
// precio, margen, mínimo y venta diaria; datos por completar; ficha con
// calculadora de precio, precios especiales, producto equivalente e
// historial; mínimos y cambio de precios en bloque; lista de precios en PDF.
const num = (n, d = 1) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: d })
const pctTxt = (m) => m == null ? '—' : m.toFixed(1).replace('.', ',') + '%'
const tonoMargen = (m) => m == null ? 'gris' : m >= 25 ? 'verde' : m >= 15 ? 'ambar' : 'rojo'
const CAMPOS = { precio_venta: 'Precio de venta', costo_compra: 'Costo de compra', precio_empleado: 'Precio empleado' }

export default function Productos({ usuario, empresa, nuevoRef }) {
  const router = useRouter()
  const hoy = obtenerFechaActual()
  const produce = (empresa?.modelos || []).includes('produccion')
  const [seccion, setSeccion] = useState('productos')
  const [d, setD] = useState(null)
  const [sel, setSel] = useState(null)
  const [modo, setModo] = useState(null) // null | 'minimos' | 'bloque' | 'nuevo' | 'editar'
  const [busqueda, setBusqueda] = useState(() => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('buscar')) || '')
  const [categoria, setCategoria] = useState('')
  const [verInactivos, setVerInactivos] = useState(false)

  const cargar = useCallback(async () => {
    try { setD(await cargarProductos(getEmpresaId(), hoy, produce)) } catch (e) { alert('No se pudieron cargar los productos: ' + e.message) }
  }, [hoy, produce])
  useEffect(() => { if (empresa) cargar() }, [empresa, cargar])
  useEffect(() => { if (nuevoRef) nuevoRef.current = () => { setSeccion('productos'); setModo('nuevo'); setSel(null) } }, [nuevoRef])
  useDestino('seccion', (v) => { if (['categorias', 'promociones'].includes(v)) { setSeccion(v); setModo(null) } })
  useDestino('producto', (id) => { setSeccion('productos'); setModo(null); setBusqueda(''); setCategoria(''); setVerInactivos(true); setSel(id) })

  if (!d) return <Nota>Cargando productos…</Nota>
  const visibles = d.productos.filter(p => (verInactivos || p.estado) && (!categoria || p.categoria === categoria)
    && (!busqueda || (p.nombre + ' ' + p.sku).toLowerCase().includes(busqueda.toLowerCase())))
  const cats = [...new Set(visibles.map(p => p.categoria || 'Sin categoría'))]
  const activos = d.productos.filter(p => p.estado)
  const conMargen = activos.filter(p => p.margen != null && p.tipo !== 'materia_prima')
  const faltan = porCompletar(d.productos, produce)
  const producto = d.productos.find(p => p.id === sel)

  const listaPrecios = () => {
    const lista = activos.filter(p => p.tipo !== 'materia_prima' && Number(p.precio_venta) > 0)
    abrirPdf({
      titulo: 'Lista de precios', empresa: empresa?.nombre, logo: empresa?.logo_url,
      periodo: `Vigente desde el ${new Date(hoy + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      secciones: [...new Set(lista.map(p => p.categoria))].map(c => ({
        titulo: c, tabla: { columnas: [{ titulo: 'Producto' }, { titulo: 'Presentación' }, { titulo: 'Precio', tipo: 'pesos' }], filas: lista.filter(p => p.categoria === c).map(p => [p.nombre, p.presentacion || '', Number(p.precio_venta)]) },
      })),
    }, router)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between gap-2 flex-wrap items-center">
        <Segmento etiqueta="Sección" opciones={[['productos', 'Productos'], ['categorias', 'Categorías'], ['promociones', 'Promociones']]} valor={seccion} onCambio={v => { setSeccion(v); setModo(null) }} />
        {seccion === 'productos' && <Boton onClick={listaPrecios}>Lista de precios PDF</Boton>}
      </div>
      {seccion === 'categorias' && <Categorias cats={d.cats} productos={d.productos} recargar={cargar} />}
      {seccion === 'promociones' && <Promociones productos={activos} />}
      {seccion === 'productos' && (<>
        <Kpis>
          <Kpi rotulo="Productos activos" valor={activos.length} nota={`${activos.filter(p => p.tipo !== 'materia_prima').length} terminados · ${activos.filter(p => p.tipo === 'materia_prima').length} insumos`} />
          <Kpi rotulo="Margen promedio" valor={conMargen.length ? pctTxt(conMargen.reduce((s, p) => s + p.margen, 0) / conMargen.length) : '—'} nota={produce ? '' : ''} />
          <Kpi rotulo="Margen bajo" valor={conMargen.filter(p => p.margen < 15).length} rojo={conMargen.some(p => p.margen < 15)} nota="Por debajo de 15%" />
          <Kpi rotulo="Datos por completar" valor={faltan.reduce((s, f) => s + f.lista.length, 0)} rojo={faltan.length > 0} nota={faltan.length ? 'Antes del 2 de noviembre' : 'Todo completo'} />
        </Kpis>

        {faltan.length > 0 && !modo && (
          <Tarjeta>
            <H2>Datos por completar</H2>
            {faltan.map((f, i) => (
              <div key={f.id} className="grid gap-2.5 items-center pt-2.5" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                <span className="min-w-0"><b>{f.titulo(f.lista.length)}</b><span className="block text-[13px]" style={{ color: C.gris }}>{typeof f.nota === 'function' ? f.nota(f.lista) : f.nota}</span></span>
                {f.id === 'minimo' ? <Boton onClick={() => setModo('minimos')}>Editar mínimos</Boton> : <Boton onClick={() => { setSel(f.lista[0].id); setModo('editar') }}>Completar</Boton>}
              </div>
            ))}
          </Tarjeta>
        )}

        {modo === 'bloque' && <CambioEnBloque productos={activos} cats={d.cats} provs={d.provs} produce={produce} cerrar={() => setModo(null)} recargar={cargar} />}
        {modo === 'nuevo' && <FormProducto nuevo productos={d.productos} cats={d.cats} provs={d.provs} produce={produce} cerrar={() => setModo(null)} guardado={(id) => { setModo(null); setSel(id); cargar() }} />}

        <div className="grid gap-4 items-start" style={{ gridTemplateColumns: producto && modo !== 'minimos' ? 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))' : '1fr' }}>
          <Tarjeta className={producto && modo !== 'minimos' ? 'columna-scroll' : ''}>
            <div className="flex justify-between gap-2 flex-wrap items-center">
              <H2>Productos</H2>
              <span className="flex gap-2 flex-wrap">
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre o SKU" aria-label="Buscar" className={campo} style={{ ...campoEstilo, width: 210 }} />
                <select value={categoria} onChange={e => setCategoria(e.target.value)} aria-label="Categoría" className={campo} style={{ ...campoEstilo, width: 180 }}>
                  <option value="">Todas las categorías</option>
                  {d.cats.filter(c => c.estado).map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                </select>
                {modo !== 'minimos' && <Boton onClick={() => setModo('minimos')}>Editar mínimos</Boton>}
                {modo !== 'bloque' && <Boton onClick={() => setModo('bloque')}>Cambiar precios en bloque</Boton>}
              </span>
            </div>
            {modo === 'minimos'
              ? <EditarMinimos productos={visibles.filter(p => p.estado && !esBolsa(p))} cerrar={() => setModo(null)} recargar={cargar} />
              : (<>
                <Tabla columnas={['Producto', 'Costo', 'Precio', 'Margen', 'Mínimo', 'Venta diaria']} min={640}>
                  {cats.map(c => (
                    <Fragment key={c}>
                      <tr><td colSpan={6} className="text-[12px] font-extrabold uppercase tracking-wider" style={{ background: C.fondo, color: C.gris, padding: '6px 8px' }}>{c}</td></tr>
                      {visibles.filter(p => (p.categoria || 'Sin categoría') === c).map(p => (
                        <tr key={p.id} onClick={() => { setSel(p.id); setModo(null) }} className="cursor-pointer" style={{ background: sel === p.id ? C.fondo : undefined, opacity: p.estado ? 1 : 0.55 }}>
                          <td style={td(true)}><b>{p.nombre}</b><span className="block text-[12.5px]" style={{ color: C.gris }}>{p.sku}{p.presentacion ? ` · ${p.presentacion}` : ''}{!p.estado ? ' · inactivo' : ''}</span></td>
                          <td style={td()}>{p.costo ? $(p.costo) : <Pill tono={produce && p.tipo !== 'materia_prima' ? 'gris' : 'ambar'}>{produce && p.tipo !== 'materia_prima' ? 'En Costos' : 'Sin costo'}</Pill>}</td>
                          <td style={td()}>{p.tipo === 'materia_prima' ? '—' : Number(p.precio_venta) ? $(p.precio_venta) : <Pill tono="ambar">Sin precio</Pill>}</td>
                          <td style={td()}>{p.margen == null ? '—' : <Pill tono={tonoMargen(p.margen)}>{pctTxt(p.margen)}</Pill>}</td>
                          <td style={td()}>{Number(p.stock_minimo) ? num(p.stock_minimo, 0) : esBolsa(p) ? '—' : <Pill tono="ambar">Sin mínimo</Pill>}</td>
                          <td style={td()}>{p.diaria ? num(p.diaria) : '—'}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </Tabla>
                <label className="flex gap-2 items-center text-sm cursor-pointer w-max"><input type="checkbox" checked={verInactivos} onChange={e => setVerInactivos(e.target.checked)} className="w-[18px] h-[18px]" style={{ accentColor: C.tinta }} />Incluir inactivos</label>
              </>)}
          </Tarjeta>
          {producto && modo !== 'minimos' && (
            modo === 'editar'
              ? <FormProducto producto={producto} productos={d.productos} cats={d.cats} provs={d.provs} produce={produce} cerrar={() => setModo(null)} guardado={() => { setModo(null); cargar() }} />
              : <Ficha p={producto} produce={produce} editar={() => setModo('editar')} cerrar={() => setSel(null)} recargar={cargar} esAdmin={usuario.rol === 'admin'} />
          )}
        </div>
      </>)}
    </div>
  )
}

function Dato({ r, children }) {
  return <div className="flex justify-between gap-3 py-[7px] text-sm" style={{ borderBottom: `1px solid ${C.linea}` }}><span style={{ color: C.gris }}>{r}</span><b className="text-right tabular-nums">{children}</b></div>
}

function Ficha({ p, produce, editar, cerrar, recargar, esAdmin }) {
  const [historial, setHistorial] = useState(null)
  useEffect(() => { setHistorial(null); cargarHistorial(p.id).then(setHistorial) }, [p.id, p.precio_venta, p.costo_compra, p.precio_empleado])
  const cambiarEstado = async () => {
    if (p.estado && !confirm(`¿Desactivar ${p.nombre}? Conserva su historial y deja de aparecer para vender y despachar.`)) return
    const { error } = await supabase.from('productos').update({ estado: !p.estado }).eq('id', p.id)
    if (error) { alert('Error: ' + error.message); return }
    recargar()
  }
  const e = p.espejo
  return (
    <Tarjeta className="columna-scroll">
      <div className="flex justify-between gap-2 items-start">
        <span className="min-w-0"><span className="text-[13px]" style={{ color: C.gris }}>{p.sku} · {p.categoria}</span><H2>{p.nombre}</H2></span>
        <button type="button" onClick={cerrar} className="text-[13px] font-bold shrink-0" style={{ color: C.gris }}>Cerrar</button>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        <Pill tono={p.estado ? 'verde' : 'gris'}>{p.estado ? 'Activo' : 'Inactivo'}</Pill>
        <Pill>{p.tipo === 'materia_prima' ? (esBolsa(p) ? 'Insumo de reparto' : 'Materia prima') : 'Producto terminado'}</Pill>
        {p.presentacion && <Pill>{p.presentacion}</Pill>}
      </div>
      {p.tipo !== 'materia_prima' && (
        <div>
          <h3 className="text-[15px] font-extrabold mb-1">Precios</h3>
          <Dato r="Precio de lista">{Number(p.precio_venta) ? $(p.precio_venta) : 'Sin precio'}</Dato>
          <Dato r="Precio empleado">{p.precio_empleado ? $(p.precio_empleado) : 'Igual al de lista'}</Dato>
          <Dato r="Precios especiales">{p.especiales.length ? [[p.especiales.filter(x => x.tipo === 'Ruta').length, 'ruta', 'rutas'], [p.especiales.filter(x => x.tipo === 'Cliente').length, 'cliente', 'clientes']].filter(([n]) => n).map(([n, a, b]) => `${n} ${n === 1 ? a : b}`).join(' · ') : 'Ninguno'}</Dato>
          {p.especiales.length > 0 && (
            <div className="flex flex-col pt-1">
              {p.especiales.slice(0, 8).map((x, i) => (
                <div key={i} className="flex justify-between gap-3 text-[13px] py-1"><span style={{ color: C.gris }}>{x.tipo} · {x.nombre}</span><span className="tabular-nums" style={{ color: p.costo && x.precio < p.costo ? C.rojo : C.tinta, fontWeight: 700 }}>{$(x.precio)}{p.costo && x.precio < p.costo ? ' · bajo el costo' : ''}</span></div>
              ))}
              {p.especiales.length > 8 && <Nota>y {p.especiales.length - 8} más</Nota>}
            </div>
          )}
        </div>
      )}
      <div>
        <h3 className="text-[15px] font-extrabold mb-1">Costo y margen</h3>
        <Dato r={p.ultimaCompra ? 'Última compra' : 'Costo registrado'}>{p.costo ? `${$(p.costo)}${p.ultimaCompra ? ' · ' + fechaCorta(p.ultimaCompra.fecha) : ''}` : produce && p.tipo !== 'materia_prima' ? 'Calculado en Costos' : 'Sin costo'}</Dato>
        {!produce && <Dato r="Proveedor">{p.proveedorNombre || 'Sin proveedor'}</Dato>}
        {p.tipo !== 'materia_prima' && <Dato r="Margen sobre la lista">{pctTxt(p.margen)}</Dato>}
      </div>
      {p.tipo !== 'materia_prima' && <Calculadora costo={p.costo} precio={p.precio_venta} productoId={p.id} alGuardar={recargar} />}
      {e && (
        <div>
          <h3 className="text-[15px] font-extrabold mb-1">Producto equivalente</h3>
          <Dato r={e.empresa || 'Otra empresa'}>{e.nombre} · {e.sku}</Dato>
          <Dato r={e.vendo ? `Precio pactado con ${e.empresa}` : `Precio pactado de ${e.empresa}`}>{e.precio ? $(e.precio) : '—'}</Dato>
          <Dato r={e.vendo ? `Costo registrado en ${e.empresa}` : 'Costo registrado aquí'}>{e.costoCompra ? $(e.costoCompra) : '—'}</Dato>
          {e.distinto && <p className="text-[13px] mt-1.5" style={{ color: C.rojo }}>El precio entre empresas no coincide con el costo registrado. Revise el precio pactado o la última compra.</p>}
        </div>
      )}
      <div>
        <h3 className="text-[15px] font-extrabold mb-1">Inventario</h3>
        {!/kilo de masa/i.test(p.nombre) && <Dato r="Existencias en bodega">{p.bodega == null ? 'Sin conteo' : num(p.bodega, 0)}</Dato>}
        {!esBolsa(p) && <Dato r="Mínimo">{Number(p.stock_minimo) ? num(p.stock_minimo, 0) : 'Sin definir'}</Dato>}
        <Dato r="Venta diaria (14 días)">{p.diaria ? num(p.diaria) : '—'}</Dato>
        {p.orden_despacho != null && <Dato r="Orden en el despacho">{p.orden_despacho}</Dato>}
      </div>
      {produce && p.tipo !== 'materia_prima' && (p.peso_estandar_g || p.paquetes_por_caja || p.bolsa) && (
        <div>
          <h3 className="text-[15px] font-extrabold mb-1">Planta</h3>
          {p.bolsa && <Dato r="Bolsa">{p.bolsa.nombre}{Number(p.bolsa.costo_compra) ? ` · ${pesosBolsa(p.bolsa.costo_compra)}` : ''}</Dato>}
          {p.bolsasOtras?.length > 0 && <Dato r="Otras bolsas">{p.bolsasOtras.map(x => x.nombre).join(' · ')}</Dato>}
          {p.peso_estandar_g && <Dato r="Peso estándar del paquete">{num(p.peso_estandar_g)} g</Dato>}
          {p.paquetes_por_caja && <Dato r="Paquetes por caja">{p.paquetes_por_caja}</Dato>}
        </div>
      )}
      <div>
        <h3 className="text-[15px] font-extrabold mb-1">Historial de precios</h3>
        {!historial ? <Nota>Cargando…</Nota> : historial.length === 0 ? <Nota>Sin cambios registrados</Nota> : historial.map(h => (
          <div key={h.id} className="flex justify-between gap-3 text-[13px] py-1.5" style={{ borderBottom: `1px solid ${C.linea}` }}>
            <span style={{ color: C.gris }}>{fechaCorta(h.created_at)} · {CAMPOS[h.campo]}{h.usuario ? ` · ${h.usuario}` : ''}</span>
            <span className="tabular-nums font-bold whitespace-nowrap">{h.antes != null ? $(h.antes) : '—'} → {h.despues != null ? $(h.despues) : '—'}</span>
          </div>
        ))}
      </div>
      {esAdmin && <div className="flex gap-2 flex-wrap"><Boton tono="rojo" onClick={editar}>Editar</Boton><Boton onClick={cambiarEstado}>{p.estado ? 'Desactivar' : 'Activar'}</Boton></div>}
    </Tarjeta>
  )
}

// Calculadora de precio: costo y margen deseado dan el precio sugerido
// (redondeado si se quiere); con el precio final, la utilidad y el margen real.
const sugerido = (costo, margen, red) => { const c = Number(costo), m = Number(String(margen).replace(',', '.')); if (!c || !m || m >= 100) return null; return Math.ceil(c / (1 - m / 100) / red) * red }
export function Calculadora({ costo: costoIni, precio: precioIni, onCambio, productoId, alGuardar }) {
  const [costo, setCosto] = useState(costoIni ? String(Math.round(costoIni)) : '')
  const [margen, setMargen] = useState('')
  const [red, setRed] = useState(100)
  const [precio, setPrecio] = useState(precioIni ? String(Math.round(precioIni)) : '')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { setCosto(costoIni ? String(Math.round(costoIni)) : ''); setPrecio(precioIni ? String(Math.round(precioIni)) : '') }, [costoIni, precioIni, productoId])
  const sug = sugerido(costo, margen, red)
  const u = Number(precio) && Number(costo) ? Number(precio) - Number(costo) : null
  const real = u != null ? u / Number(precio) * 100 : null
  const cambiar = (c, p) => { onCambio?.({ costo: c, precio: p }) }
  const guardar = async () => {
    setGuardando(true)
    const { error } = await supabase.from('productos').update({ precio_venta: Number(precio) || 0 }).eq('id', productoId)
    setGuardando(false)
    if (error) { alert('No se pudo guardar el precio: ' + error.message); return }
    alGuardar?.()
  }
  return (
    <div className="rounded-[14px] p-3 flex flex-col gap-2.5" style={{ background: C.fondo }}>
      <h3 className="text-[15px] font-extrabold">Calculadora de precio</h3>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <Campo etiqueta="Costo de compra"><InputDinero value={costo} onChange={e => { setCosto(e.target.value); cambiar(e.target.value, precio) }} placeholder="$" className={campo} style={campoEstilo} /></Campo>
        <Campo etiqueta="Margen deseado (%)"><input inputMode="decimal" value={margen} onChange={e => setMargen(e.target.value.replace(/[^\d.,]/g, ''))} className={campo} style={campoEstilo} /></Campo>
      </div>
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <span className="text-[13px]" style={{ color: C.gris }}>Redondear</span>
        <Segmento etiqueta="Redondeo" opciones={[[1, 'Exacto'], [100, 'A $100'], [500, 'A $500']]} valor={red} onCambio={setRed} />
      </div>
      <div className="flex justify-between items-center gap-2 bg-white rounded-xl px-3 py-2.5">
        <span className="text-[13px]" style={{ color: C.gris }}>Precio sugerido</span>
        <b className="tabular-nums text-[19px]" style={{ fontFamily: 'var(--font-titulo), Georgia, serif' }}>{sug ? $(sug) : '—'}</b>
        <Boton tono="blanco" disabled={!sug} onClick={() => { setPrecio(String(sug)); cambiar(costo, String(sug)) }}>Usar</Boton>
      </div>
      <Campo etiqueta="Precio de venta final"><InputDinero value={precio} onChange={e => { setPrecio(e.target.value); cambiar(costo, e.target.value) }} placeholder="$" className={campo} style={{ ...campoEstilo, fontSize: 18, fontWeight: 800 }} /></Campo>
      <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="bg-white rounded-xl px-3 py-2"><span className="block text-[12.5px]" style={{ color: C.gris }}>Utilidad por unidad</span><b className="tabular-nums">{u != null ? $(u) : '—'}</b></div>
        <div className="bg-white rounded-xl px-3 py-2"><span className="block text-[12.5px]" style={{ color: C.gris }}>Margen real</span><b className="tabular-nums" style={{ color: real != null && real < 15 ? C.rojo : C.tinta }}>{pctTxt(real)}</b></div>
      </div>
      {productoId && Number(precio) !== Math.round(Number(precioIni || 0)) && Number(precio) > 0 && (
        <div className="flex justify-end"><Boton tono="rojo" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : `Guardar precio ${$(precio)}`}</Boton></div>
      )}
    </div>
  )
}

function EditarMinimos({ productos, cerrar, recargar }) {
  const [val, setVal] = useState(() => Object.fromEntries(productos.map(p => [p.id, Number(p.stock_minimo) ? String(p.stock_minimo) : ''])))
  const [guardando, setGuardando] = useState(false)
  const cambiados = productos.filter(p => String(Number(val[p.id]) || 0) !== String(Number(p.stock_minimo) || 0))
  const guardar = async () => {
    setGuardando(true)
    const res = await Promise.all(cambiados.map(p => supabase.from('productos').update({ stock_minimo: parseInt(val[p.id]) || 0 }).eq('id', p.id)))
    setGuardando(false)
    const err = res.find(r => r.error)
    if (err) { alert('Algunos mínimos no se guardaron: ' + err.error.message); return }
    cerrar(); recargar()
  }
  const cats = [...new Set(productos.map(p => p.categoria || 'Sin categoría'))]
  return (
    <div className="flex flex-col gap-3">
      <Tabla columnas={['Producto', 'Venta diaria', 'Existencias', 'Mínimo', 'Cubre']} min={560}>
        {cats.map(c => (
          <Fragment key={c}>
            <tr><td colSpan={5} className="text-[12px] font-extrabold uppercase tracking-wider" style={{ background: C.fondo, color: C.gris, padding: '6px 8px' }}>{c}</td></tr>
            {productos.filter(p => (p.categoria || 'Sin categoría') === c).map(p => {
              const m = Number(val[p.id]) || 0
              return (
                <tr key={p.id}>
                  <td style={td(true)}><b>{p.nombre}</b><span className="block text-[12.5px]" style={{ color: C.gris }}>{p.sku}</span></td>
                  <td style={td()}>{p.diaria ? num(p.diaria) : '—'}</td>
                  <td style={td()}>{p.bodega == null ? '—' : num(p.bodega, 0)}</td>
                  <td style={td()}><input inputMode="numeric" value={val[p.id]} onChange={e => setVal({ ...val, [p.id]: e.target.value.replace(/\D/g, '').slice(0, 6) })} aria-label={`Mínimo de ${p.nombre}`}
                    className="h-9 w-[88px] rounded-[10px] px-2 text-right font-bold outline-none" style={{ border: `2px solid ${m ? C.linea : C.amarillo}`, background: m ? '#fff' : C.ambarF, color: C.tinta }} /></td>
                  <td style={td()}>{m && p.diaria ? `${num(m / p.diaria)} días` : '—'}</td>
                </tr>
              )
            })}
          </Fragment>
        ))}
      </Tabla>
      <div className="flex gap-2 justify-end flex-wrap items-center">
        <span className="text-[13px]" style={{ color: C.gris }}>{cambiados.length ? `${cambiados.length} ${cambiados.length === 1 ? 'cambio' : 'cambios'} sin guardar` : 'Sin cambios'}</span>
        <Boton onClick={cerrar}>Cancelar</Boton>
        <Boton tono="rojo" onClick={guardar} disabled={guardando || !cambiados.length}>{guardando ? 'Guardando…' : 'Guardar mínimos'}</Boton>
      </div>
    </div>
  )
}

// Cambio de precio o costo en bloque: por categoría, proveedor o todos; en
// porcentaje o valor fijo; vista previa con el margen nuevo antes de aplicar.
function CambioEnBloque({ productos, cats, provs, produce, cerrar, recargar }) {
  const [f, setF] = useState({ alcance: 'categoria', categoria: cats.find(c => c.estado)?.nombre || '', proveedor: '', campo: 'precio_venta', forma: 'pct', valor: '', red: 100 })
  const [aplicando, setAplicando] = useState(false)
  const valor = parseFloat(String(f.valor).replace(',', '.')) || 0
  const elegidos = productos.filter(p => p.tipo !== 'materia_prima' || f.campo === 'costo_compra')
    .filter(p => f.alcance === 'todos' || (f.alcance === 'categoria' ? p.categoria === f.categoria : p.proveedor_id === f.proveedor))
  const actual = (p) => f.campo === 'costo_compra' ? Number(p.costo || p.costo_compra || 0) : Number(p[f.campo] || 0)
  const nuevo = (p) => { const a = actual(p); if (!a || !valor) return a; const n = f.forma === 'pct' ? a * (1 + valor / 100) : a + valor; return Math.max(0, f.red > 1 ? Math.round(n / f.red) * f.red : Math.round(n)) }
  const filas = elegidos.map(p => {
    const n = nuevo(p)
    const precio = f.campo === 'precio_venta' ? n : Number(p.precio_venta)
    const costo = f.campo === 'costo_compra' ? n : p.costo
    return { p, antes: actual(p), despues: n, margen: margenDe(precio, costo) }
  }).filter(x => x.antes > 0)
  const aplicar = async () => {
    if (!valor) { alert('Escriba el cambio.'); return }
    if (!confirm(`¿Aplicar el cambio a ${filas.length} ${filas.length === 1 ? 'producto' : 'productos'}?`)) return
    setAplicando(true)
    const res = await Promise.all(filas.filter(x => x.despues !== x.antes).map(x => supabase.from('productos').update({ [f.campo]: x.despues }).eq('id', x.p.id)))
    setAplicando(false)
    const err = res.find(r => r.error)
    if (err) { alert('Algunos cambios no se aplicaron: ' + err.error.message); return }
    cerrar(); recargar()
  }
  return (
    <Tarjeta>
      <div className="flex justify-between gap-2 items-center flex-wrap"><H2>Cambiar precios en bloque</H2><Boton onClick={cerrar}>Cerrar</Boton></div>
      <div className="flex flex-col gap-2.5">
        <div className="flex gap-2 flex-wrap items-end">
          <Segmento etiqueta="Alcance" opciones={[['categoria', 'Una categoría'], ...(produce ? [] : [['proveedor', 'Un proveedor']]), ['todos', 'Todos']]} valor={f.alcance} onCambio={v => setF({ ...f, alcance: v })} />
          {f.alcance === 'categoria' && <select value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value })} aria-label="Categoría" className={campo} style={{ ...campoEstilo, width: 200 }}>{cats.filter(c => c.estado).map(c => <option key={c.id}>{c.nombre}</option>)}</select>}
          {f.alcance === 'proveedor' && <select value={f.proveedor} onChange={e => setF({ ...f, proveedor: e.target.value })} aria-label="Proveedor" className={campo} style={{ ...campoEstilo, width: 220 }}><option value="">Seleccione</option>{provs.filter(p => p.estado).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>}
        </div>
        <div className="grid gap-2.5 items-end" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <Campo etiqueta="Qué cambia">
            <select value={f.campo} onChange={e => setF({ ...f, campo: e.target.value })} className={campo} style={campoEstilo}>
              <option value="precio_venta">Precio de venta</option><option value="costo_compra">Costo de compra</option><option value="precio_empleado">Precio empleado</option>
            </select>
          </Campo>
          <Campo etiqueta={f.forma === 'pct' ? 'Cambio (%)' : 'Cambio ($ por unidad)'}><input inputMode="decimal" value={f.valor} onChange={e => setF({ ...f, valor: e.target.value.replace(/[^\d.,-]/g, '') })} placeholder={f.forma === 'pct' ? '5 o -3' : '300 o -200'} className={campo} style={campoEstilo} /></Campo>
          <Segmento etiqueta="Forma" opciones={[['pct', 'Porcentaje'], ['valor', 'Valor fijo']]} valor={f.forma} onCambio={v => setF({ ...f, forma: v })} />
          <Segmento etiqueta="Redondeo" opciones={[[1, 'Exacto'], [100, 'A $100'], [500, 'A $500']]} valor={f.red} onCambio={v => setF({ ...f, red: v })} />
        </div>
      </div>
      {filas.length === 0 ? <Nota>Sin productos con valor registrado</Nota> : (
        <Tabla columnas={['Producto', 'Antes', 'Después', 'Margen nuevo']} min={480}>
          {filas.map(x => (
            <tr key={x.p.id}>
              <td style={td(true)}><b>{x.p.nombre}</b><span className="block text-[12.5px]" style={{ color: C.gris }}>{x.p.sku}</span></td>
              <td style={td()}>{$(x.antes)}</td>
              <td style={{ ...td(), fontWeight: 800 }}>{$(x.despues)}</td>
              <td style={td()}>{x.margen == null ? '—' : <Pill tono={tonoMargen(x.margen)}>{pctTxt(x.margen)}</Pill>}</td>
            </tr>
          ))}
        </Tabla>
      )}
      <div className="flex justify-end"><Boton tono="rojo" onClick={aplicar} disabled={aplicando || !valor || !filas.length}>{aplicando ? 'Aplicando…' : `Aplicar a ${filas.length} ${filas.length === 1 ? 'producto' : 'productos'}`}</Boton></div>
    </Tarjeta>
  )
}

// SKU siguiente según el prefijo de la categoría.
const pesosBolsa = (v) => `$${Number(v).toLocaleString('es-CO', { maximumFractionDigits: 2 })}`

function generarSku(categoria, productos, cats) {
  const prefijo = cats.find(c => c.nombre === categoria)?.prefijo_sku || 'PRD'
  const nums = productos.filter(p => p.sku.startsWith(prefijo + '-')).map(p => parseInt(p.sku.split('-')[1])).filter(n => !isNaN(n))
  return `${prefijo}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`
}

function FormProducto({ nuevo, producto, productos, cats, provs, produce, cerrar, guardado }) {
  const catIni = producto?.categoria || cats.find(c => c.estado)?.nombre || ''
  const [f, setF] = useState(() => producto ? {
    ...producto, precio_venta: producto.precio_venta ?? '', costo_compra: producto.costo_compra ?? '', precio_empleado: producto.precio_empleado ?? '',
    stock_minimo: producto.stock_minimo ?? 0, peso_estandar_g: producto.peso_estandar_g ?? '', tolerancia_gramaje_pct: producto.tolerancia_gramaje_pct ?? 5, paquetes_por_caja: producto.paquetes_por_caja ?? '',
  } : { tipo: 'terminado', categoria: catIni, sku: generarSku(catIni, productos, cats), nombre: '', presentacion: '', precio_venta: '', costo_compra: '', precio_empleado: '', proveedor_id: '', stock_minimo: 0, peso_estandar_g: '', tolerancia_gramaje_pct: 5, paquetes_por_caja: '', estado: true })
  const [guardando, setGuardando] = useState(false)
  const [nuevaBolsa, setNuevaBolsa] = useState(null)
  const [creadas, setCreadas] = useState([])
  const mp = f.tipo === 'materia_prima'
  const todos = [...productos, ...creadas]
  const bolsas = todos.filter(p => p.tipo === 'materia_prima' && p.estado && !p.consumo_por_cochada)
  // La bolsa se crea aquí mismo, sin salir del producto.
  const crearBolsa = async () => {
    const costo = Number(nuevaBolsa.costo)
    if (!nuevaBolsa.nombre.trim() || !(costo > 0) || !nuevaBolsa.proveedor_id) { alert('Escriba el nombre, el costo y el proveedor de la bolsa.'); return }
    const categoria = cats.find(c => c.estado && /materia|insumo/i.test(c.nombre))?.nombre || f.categoria
    setGuardando(true)
    const { data, error } = await supabase.from('productos').insert({
      empresa_id: getEmpresaId(), sku: generarSku(categoria, todos, cats), nombre: nuevaBolsa.nombre.trim(), categoria, tipo: 'materia_prima',
      precio_venta: 0, costo_compra: costo, proveedor_id: nuevaBolsa.proveedor_id || null, stock_minimo: 0, no_se_cuenta: true, estado: true, perecedero: false, origen: 'tercero', dias_cobertura: 7,
    }).select('id, sku, nombre, categoria, tipo, estado, consumo_por_cochada, costo_compra').single()
    setGuardando(false)
    if (error) { alert('No se pudo crear la bolsa: ' + error.message); return }
    setCreadas(l => [...l, data])
    setF(x => x.bolsa_id ? { ...x, bolsas_otras: [...(x.bolsas_otras || []), data.id] } : { ...x, bolsa_id: data.id })
    setNuevaBolsa(null)
  }
  const guardar = async () => {
    if (!f.nombre.trim() || !f.sku.trim()) { alert('Escriba el nombre y el SKU.'); return }
    if (!mp && !(Number(f.precio_venta) > 0) && !confirm('El producto queda sin precio de venta. ¿Guardar de todas formas?')) return
    if (!nuevo && mp && producto.tipo !== 'materia_prima' && Number(producto.precio_venta) > 0 && !confirm('Como materia prima pierde su precio de venta. ¿Continuar?')) return
    if (nuevo && productos.some(p => p.sku.toUpperCase() === f.sku.trim().toUpperCase())) { alert('Ya existe un producto con ese SKU.'); return }
    setGuardando(true)
    const datos = {
      nombre: f.nombre.trim(), categoria: f.categoria, presentacion: f.presentacion?.trim() || null, tipo: f.tipo,
      precio_venta: mp ? 0 : Number(f.precio_venta) || 0, costo_compra: f.costo_compra !== '' ? Number(f.costo_compra) : null, precio_empleado: f.precio_empleado !== '' && Number(f.precio_empleado) ? Number(f.precio_empleado) : null,
      proveedor_id: f.proveedor_id || null, stock_minimo: parseInt(f.stock_minimo) || 0,
      peso_estandar_g: f.peso_estandar_g !== '' ? Number(f.peso_estandar_g) : null, tolerancia_gramaje_pct: Number(f.tolerancia_gramaje_pct) || 5, paquetes_por_caja: f.paquetes_por_caja !== '' ? parseInt(f.paquetes_por_caja) : null,
      bolsa_id: !mp && f.bolsa_id ? f.bolsa_id : null,
      bolsas_otras: !mp && f.bolsa_id ? (f.bolsas_otras || []).filter(id => id !== f.bolsa_id) : [],
      no_se_cuenta: mp && !!f.no_se_cuenta,
    }
    const res = nuevo
      ? await supabase.from('productos').insert({ ...datos, empresa_id: getEmpresaId(), sku: f.sku.trim().toUpperCase(), estado: true, perecedero: true, origen: produce ? 'propio' : 'tercero', dias_cobertura: 7 }).select('id').single()
      : await supabase.from('productos').update(datos).eq('id', producto.id).select('id').single()
    setGuardando(false)
    if (res.error) { alert('No se pudo guardar: ' + res.error.message); return }
    guardado(res.data.id)
  }
  const fila = { gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }
  return (
    <Tarjeta>
      <div className="flex justify-between gap-2 items-center"><H2>{nuevo ? 'Nuevo producto' : `Editar ${producto.nombre}`}</H2><Boton onClick={cerrar}>Cancelar</Boton></div>
      <Segmento etiqueta="Tipo" opciones={[['terminado', 'Producto terminado'], ['materia_prima', 'Materia prima o insumo']]} valor={f.tipo} onCambio={v => setF({ ...f, tipo: v })} />
      <div className="grid gap-2.5" style={fila}>
        <Campo etiqueta="Categoría">
          <select value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value, ...(nuevo ? { sku: generarSku(e.target.value, productos, cats), ...(/materia|insumo|bolsa/i.test(e.target.value) ? { tipo: 'materia_prima' } : {}) } : {}) })} className={campo} style={campoEstilo}>
            {cats.filter(c => c.estado || c.nombre === f.categoria).map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="SKU"><input value={f.sku} disabled={!nuevo} onChange={e => setF({ ...f, sku: e.target.value.toUpperCase() })} className={campo} style={{ ...campoEstilo, opacity: nuevo ? 1 : 0.6 }} /></Campo>
        <Campo etiqueta="Nombre"><input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} className={campo} style={campoEstilo} /></Campo>
        <Campo etiqueta="Presentación"><input value={f.presentacion || ''} onChange={e => setF({ ...f, presentacion: e.target.value })} placeholder="x5 und, x500 g" className={campo} style={campoEstilo} /></Campo>
        {!produce || mp ? (
          <Campo etiqueta="Proveedor">
            <select value={f.proveedor_id || ''} onChange={e => setF({ ...f, proveedor_id: e.target.value })} className={campo} style={campoEstilo}>
              <option value="">Sin proveedor</option>
              {provs.filter(p => p.estado || p.id === f.proveedor_id).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Campo>
        ) : null}
        {!esBolsa(f) && <Campo etiqueta="Mínimo de inventario"><input inputMode="numeric" value={f.stock_minimo} onChange={e => setF({ ...f, stock_minimo: e.target.value.replace(/\D/g, '') })} className={campo} style={campoEstilo} /></Campo>}
        {!mp && <Campo etiqueta="Precio empleado"><InputDinero value={f.precio_empleado} onChange={e => setF({ ...f, precio_empleado: e.target.value })} placeholder="Igual al de lista" className={campo} style={campoEstilo} /></Campo>}
        {mp && <Campo etiqueta="Costo de compra"><InputDinero value={f.costo_compra} onChange={e => setF({ ...f, costo_compra: e.target.value })} placeholder="$" className={campo} style={campoEstilo} /></Campo>}
      </div>
      {produce && mp && (
        <label className="flex items-center gap-2 text-[14px] font-bold">
          <input type="checkbox" checked={!!f.no_se_cuenta} onChange={e => setF({ ...f, no_se_cuenta: e.target.checked })} className="w-4 h-4 accent-[#1C1B19]" />
          No se cuenta en el conteo
        </label>
      )}
      {produce && !mp && (
        <div className="grid gap-2.5" style={fila}>
          <Campo etiqueta="Peso estándar del paquete (g)"><input inputMode="decimal" value={f.peso_estandar_g} onChange={e => setF({ ...f, peso_estandar_g: e.target.value.replace(/[^\d.]/g, '') })} className={campo} style={campoEstilo} /></Campo>
          <Campo etiqueta="Tolerancia (%)"><input inputMode="decimal" value={f.tolerancia_gramaje_pct} onChange={e => setF({ ...f, tolerancia_gramaje_pct: e.target.value.replace(/[^\d.]/g, '') })} className={campo} style={campoEstilo} /></Campo>
          <Campo etiqueta="Paquetes por caja"><input inputMode="numeric" value={f.paquetes_por_caja} onChange={e => setF({ ...f, paquetes_por_caja: e.target.value.replace(/\D/g, '') })} className={campo} style={campoEstilo} /></Campo>
          <Campo etiqueta="Bolsa principal">
            <select value={f.bolsa_id || ''} onChange={e => setF({ ...f, bolsa_id: e.target.value })} className={campo} style={campoEstilo}>
              <option value="">Sin bolsa</option>
              {bolsas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </Campo>
        </div>
      )}
      {produce && !mp && f.bolsa_id && bolsas.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13.5px] font-bold">Otras bolsas</span>
          <div className="flex gap-2 flex-wrap">
            {bolsas.filter(b => b.id !== f.bolsa_id).map(b => {
              const si = (f.bolsas_otras || []).includes(b.id)
              return <button key={b.id} type="button" aria-pressed={si} onClick={() => setF({ ...f, bolsas_otras: si ? f.bolsas_otras.filter(x => x !== b.id) : [...(f.bolsas_otras || []), b.id] })} className="opcion rounded-full min-h-[40px] px-3.5 text-[13.5px] font-bold">{b.nombre}</button>
            })}
          </div>
        </div>
      )}
      {produce && !mp && (nuevaBolsa ? (
        <div className="grid gap-2.5 items-end" style={fila}>
          <Campo etiqueta="Nombre de la bolsa"><input value={nuevaBolsa.nombre} onChange={e => setNuevaBolsa({ ...nuevaBolsa, nombre: e.target.value })} className={campo} style={campoEstilo} /></Campo>
          <Campo etiqueta="Costo por bolsa"><InputDinero value={nuevaBolsa.costo} onChange={e => setNuevaBolsa({ ...nuevaBolsa, costo: e.target.value })} placeholder="$" className={campo} style={campoEstilo} /></Campo>
          <Campo etiqueta="Proveedor">
            <select value={nuevaBolsa.proveedor_id} onChange={e => setNuevaBolsa({ ...nuevaBolsa, proveedor_id: e.target.value })} className={campo} style={campoEstilo}>
              <option value="">Sin proveedor</option>
              {provs.filter(p => p.estado).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Campo>
          <div className="flex gap-2">
            <Boton onClick={() => setNuevaBolsa(null)}>Cancelar</Boton>
            <Boton tono="rojo" onClick={crearBolsa} disabled={guardando}>Crear bolsa</Boton>
          </div>
        </div>
      ) : <div><Boton onClick={() => setNuevaBolsa({ nombre: '', costo: '', proveedor_id: '' })}>+ Nueva bolsa</Boton></div>)}
      {!mp && <Calculadora costo={f.costo_compra || producto?.costo} precio={f.precio_venta} onCambio={({ costo, precio }) => setF(x => ({ ...x, costo_compra: costo, precio_venta: precio }))} />}
      <div className="flex justify-end"><Boton tono="rojo" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : nuevo ? 'Crear producto' : 'Guardar cambios'}</Boton></div>
    </Tarjeta>
  )
}
