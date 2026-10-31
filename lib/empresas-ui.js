'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId, setEmpresaId } from '@/lib/empresa'
import { logoRecortado } from '@/lib/cuenta-pago'

// Las empresas que maneja el usuario, para el selector de empresa (menu,
// encabezado, modulos y entrada): logo sin el blanco sobrante, nombre corto y
// el color de cada una. Se carga una vez por usuario: al salir y entrar con otra
// cuenta la pagina no se recarga, y la lista de la cuenta anterior no sirve.
const COLOR_PRODUCCION = '#2E5E3A', COLOR_DISTRIBUCION = '#F2B21B'
let cache = null // { usuarioId, lista }

const usuarioActual = (usuario) => usuario || (typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('maissy_usuario') || 'null') : null)
const guardadas = (u) => (cache && u && cache.usuarioId === u.id ? cache.lista : null)

export async function cargarEmpresasUsuario(usuario) {
  const u = usuarioActual(usuario)
  const yaCargadas = guardadas(u)
  if (yaCargadas) return yaCargadas
  const { data } = await supabase.from('empresas').select('id, nombre, nit, logo_url, modelos').eq('activo', true).order('nombre')
  const lista = (data || []).filter(e => !u?.empresas || u.empresas.includes(e.id))
  const empresas = await Promise.all(lista.map(async e => ({
    ...e,
    corto: e.nombre.replace(/\s*maissy\s*/i, ' ').trim() || e.nombre,
    color: (e.modelos || []).includes('produccion') ? COLOR_PRODUCCION : COLOR_DISTRIBUCION,
    logo: (await logoRecortado(e.logo_url)) || e.logo_url,
  })))
  cache = { usuarioId: u?.id, lista: empresas }
  return empresas
}

export function useEmpresas(usuario) {
  const [empresas, setEmpresas] = useState(() => guardadas(usuarioActual(usuario)) || [])
  useEffect(() => { let vivo = true; cargarEmpresasUsuario(usuario).then(l => { if (vivo) setEmpresas(l) }); return () => { vivo = false } }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const actualId = typeof window !== 'undefined' ? getEmpresaId() : null
  return { empresas, actual: empresas.find(e => e.id === actualId) || null }
}

// Abre la tarjeta para cambiar de empresa (la monta el layout).
export const abrirEmpresas = () => window.dispatchEvent(new Event('maissy:empresas'))

// Cambia toda la sesion a otra empresa; al recargar sale el aviso "Ahora en ...".
export function cambiarEmpresa(e) {
  if (!e || e.id === getEmpresaId()) return
  setEmpresaId(e.id)
  try { sessionStorage.setItem('maissy_aviso_empresa', e.nombre) } catch { /* sin aviso */ }
  window.location.reload()
}
