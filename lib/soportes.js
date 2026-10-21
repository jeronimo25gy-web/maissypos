import { supabase } from './supabase'
import { getEmpresaId } from './empresa'

// Fotos de soporte (pantallazos de transferencias, recibos de gastos) en el
// bucket privado "soportes", separadas por empresa: <empresa>/<carpeta>/<archivo>.
// Se reducen antes de subir (las fotos del celular pesan varios MB).
const reducir = (file, max = 1600) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    const escala = Math.min(1, max / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * escala)
    canvas.height = Math.round(img.height * escala)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(url)
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo leer la foto')), 'image/jpeg', 0.82)
  }
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo abrir la foto')) }
  img.src = url
})

export async function subirSoporte(file, carpeta) {
  // Los PDF (facturas, garantías) se suben tal cual; las fotos se reducen.
  const pdf = file.type === 'application/pdf'
  const blob = pdf ? file : await reducir(file)
  const ruta = `${getEmpresaId()}/${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${pdf ? 'pdf' : 'jpg'}`
  const { error } = await supabase.storage.from('soportes').upload(ruta, blob, { contentType: pdf ? 'application/pdf' : 'image/jpeg' })
  if (error) throw new Error(error.message)
  return ruta
}

export async function verSoporte(ruta) {
  if (!ruta) return null
  const { data } = await supabase.storage.from('soportes').createSignedUrl(ruta, 3600)
  return data?.signedUrl || null
}

// Lee un comprobante con el lector de la app (valor, banco, referencia y a
// que cuenta de la empresa llego). Devuelve un comprobante listo para la
// liquidacion, o lanza un error con el motivo.
export async function leerComprobante(file) {
  const blob = await reducir(file)
  const imagen = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(blob) })
  const { data: { session } } = await supabase.auth.getSession()
  const resp = await fetch('/api/leer-comprobante', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify({ imagen, media_type: 'image/jpeg', empresa_id: getEmpresaId() }),
  })
  const json = await resp.json()
  if (!resp.ok) throw new Error(json.error || 'No se pudo leer')
  const l = json.lectura
  if (!l.es_comprobante || !l.valor) throw new Error('No parece un comprobante de una transferencia exitosa' + (l.observacion ? ` (${l.observacion})` : ''))
  return {
    origen: 'foto', valor: String(l.valor), referencia: l.referencia || '', banco: l.banco || '',
    fecha_comprobante: l.fecha || '', destino: [l.destino_numero, l.destino_nombre].filter(Boolean).join(' · '),
    cuenta_maissy: json.coincidencia === 'numero' || json.coincidencia === 'nombre' ? true : json.coincidencia === 'ninguna' ? false : null,
    coincidencia: json.coincidencia, cuenta_id: json.cuenta_id, cuenta_nombre: json.cuenta_nombre, repetida: json.repetida, observacion: l.observacion,
  }
}

// Lee la licencia (frente y reverso) o el carné de manipulación de alimentos.
// Devuelve { nombre, numero, categoria, vence, servicio, observacion } para confirmar.
export async function leerDocumentoConductor(archivos, tipo) {
  const imagenes = await Promise.all(archivos.slice(0, 2).map(async (file) => {
    const blob = await reducir(file)
    const data = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(blob) })
    return { data, media_type: 'image/jpeg' }
  }))
  const { data: { session } } = await supabase.auth.getSession()
  const resp = await fetch('/api/leer-documento', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify({ imagenes, tipo, empresa_id: getEmpresaId() }),
  })
  const json = await resp.json()
  if (!resp.ok) throw new Error(json.error || 'No se pudo leer')
  if (!json.lectura?.es_documento) throw new Error('La foto no parece ' + (tipo === 'licencia' ? 'una licencia de conducción' : 'un carné de manipulación de alimentos'))
  return json.lectura
}
