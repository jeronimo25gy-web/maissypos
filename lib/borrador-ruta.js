import { supabase } from './supabase'
import { getEmpresaId } from './empresa'

// Lo que el vendedor anota durante el dia (abonos cobrados, transferencias y
// fiados del PdV) va al borrador "en curso" de su despacho y llega solo al
// cierre (Cerrar mi ruta) y a Liquidacion. Si ya envio el cierre, no se toca.
export async function leerEnCurso(despachoId) {
  if (!despachoId) return null
  const { data } = await supabase.from('liquidaciones_borrador').select('id, estado, datos').eq('despacho_id', despachoId).eq('empresa_id', getEmpresaId()).maybeSingle()
  return data || null
}

// agregar: { campo: [items] }, ej. { pagosFiados: [...], comprobantes: [...] }
export async function anotarEnCurso({ despachoId, vendedorId, usuarioNombre, agregar }) {
  const empresaId = getEmpresaId()
  const b = await leerEnCurso(despachoId)
  if (b && b.estado !== 'en_curso') throw new Error('Ya cerraste este día. Si falta algo, corrígelo desde Cerrar.')
  const datos = { ...(b?.datos || {}) }
  Object.entries(agregar).forEach(([campo, items]) => { datos[campo] = [...(datos[campo] || []), ...items] })
  if (b) {
    const { error } = await supabase.from('liquidaciones_borrador').update({ datos }).eq('id', b.id).eq('empresa_id', empresaId)
    if (error) throw new Error(error.message)
    return datos
  }
  const { data: d } = await supabase.from('despachos_encab').select('fecha').eq('id', despachoId).eq('empresa_id', empresaId).maybeSingle()
  const { error } = await supabase.from('liquidaciones_borrador').insert({
    empresa_id: empresaId, despacho_id: despachoId, vendedor_id: vendedorId, fecha: d?.fecha, datos, estado: 'en_curso', enviado_por: usuarioNombre || null,
  })
  if (error) throw new Error(error.message)
  return datos
}
