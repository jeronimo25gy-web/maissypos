// La base de datos entrega como mucho 1.000 filas por consulta y no avisa
// cuando hay más: la lista llega cortada. Toda consulta que pueda crecer
// (liquidaciones, despachos, movimientos, clientes, cartera, conteos…) se
// trae por páginas con estas funciones.
//
// todas(() => supabase.from('x').select('…').eq(…))  -> arreglo con todo
// paginado(() => supabase.from('x')…)                 -> { data, error } como una consulta normal
//
// El orden por id se agrega al final para que las páginas no se repitan ni
// salten filas (se respeta cualquier orden que ya traiga la consulta).

const TAM = 1000

export async function todas(armar, { orden = 'id' } = {}) {
  const out = []
  for (let desde = 0; ; desde += TAM) {
    let q = armar()
    if (orden) q = q.order(orden, { ascending: true })
    const { data, error } = await q.range(desde, desde + TAM - 1)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < TAM) break
  }
  return out
}

export async function paginado(armar, opciones) {
  try {
    return { data: await todas(armar, opciones), error: null }
  } catch (e) {
    return { data: null, error: { message: e.message || String(e) } }
  }
}

// Para filtros .in() con muchos ids (la dirección de la consulta tiene límite).
export const enTrozos = (lista, n = 100) => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n))
