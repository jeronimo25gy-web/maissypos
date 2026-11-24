// Traduce al español los errores que PostgreSQL / PostgREST devuelven en inglés
// (columna obligatoria, duplicado, permisos…). Los mensajes propios de las
// funciones (raise exception) ya vienen en español y no se tocan.
// Se conserva error.code, así que los chequeos como code === '23505' siguen funcionando.

const campo = (s) => (s || '').replace(/_/g, ' ')

const traductores = {
  // Columna obligatoria vacía
  '23502': (m) => {
    const col = m.match(/column "([^"]+)"/)?.[1]
    return col ? `Falta el dato obligatorio "${campo(col)}".` : 'Falta un dato obligatorio.'
  },
  // Valor repetido
  '23505': (m, d) => {
    const k = (d || '').match(/Key \((.+?)\)=\((.*?)\) already exists/)
    if (!k) return 'Ya existe un registro con esos datos.'
    const cols = k[1].split(', '), vals = k[2].split(', ')
    const partes = cols.length === vals.length
      ? cols.map((c, i) => [c, vals[i]]).filter(([c]) => c !== 'empresa_id' && !c.includes('('))
      : []
    return partes.length
      ? `Ya existe un registro con ${partes.map(([c, v]) => `${campo(c)} "${v}"`).join(' y ')}.`
      : 'Ya existe un registro con esos datos.'
  },
  // Llave foránea
  '23503': (m) => {
    if (/update or delete/.test(m)) {
      const t = m.match(/on table "([^"]+)"\s*$/)?.[1]
      return t ? `No se puede borrar porque se está usando en ${campo(t)}.` : 'No se puede borrar porque se está usando en otra parte.'
    }
    return 'Uno de los datos hace referencia a un registro que no existe.'
  },
  '23514': () => 'Uno de los valores no es válido.',
  '22P02': (m) => {
    const v = m.match(/: "(.*)"$/)?.[1]
    return v !== undefined ? `Valor no válido: "${v}".` : 'Uno de los valores no es válido.'
  },
  '22001': () => 'Uno de los textos es demasiado largo.',
  '22003': () => 'Uno de los números es demasiado grande.',
  '22007': () => 'Fecha u hora no válida.',
  '22008': () => 'Fecha u hora fuera de rango.',
  '22012': () => 'División por cero.',
  '42501': () => 'No tiene permiso para hacer esto.',
  '57014': () => 'La operación tardó demasiado. Intente de nuevo.',
  '40001': () => 'Otra persona estaba guardando al mismo tiempo. Intente de nuevo.',
  '40P01': () => 'Otra persona estaba guardando al mismo tiempo. Intente de nuevo.',
  PGRST116: () => 'No se encontró el registro.',
  PGRST301: () => 'La sesión expiró. Vuelva a iniciar sesión.',
  PGRST303: () => 'La sesión expiró. Vuelva a iniciar sesión.',
}

export function traducirErrorDb(err) {
  if (!err || typeof err.message !== 'string') return err
  const t = traductores[err.code]
  if (!t) return err
  try {
    return { ...err, message: t(err.message, err.details), mensaje_original: err.message }
  } catch {
    return err
  }
}

// Envuelve la respuesta de fetch: si es un error JSON de PostgREST, cambia el
// mensaje por la traducción. Cualquier otra respuesta pasa igual.
export async function traducirRespuesta(res) {
  if (res.ok || !(res.headers.get('content-type') || '').includes('json')) return res
  let texto
  try { texto = await res.clone().text() } catch { return res }
  let cuerpo
  try { cuerpo = JSON.parse(texto) } catch { return res }
  if (!cuerpo || Array.isArray(cuerpo) || !traductores[cuerpo.code]) return res
  const nuevo = traducirErrorDb(cuerpo)
  return new Response(JSON.stringify(nuevo), { status: res.status, statusText: res.statusText, headers: res.headers })
}
