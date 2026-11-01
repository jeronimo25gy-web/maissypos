'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { puedeVerModulo } from '@/lib/permisos'
import Conteo from './Conteo'

// Quien ve Inventario cuenta desde su pestaña; aquí queda el que solo cuenta.
export default function PaginaConteo() {
  const router = useRouter()
  const [soloConteo, setSoloConteo] = useState(false)
  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (u && puedeVerModulo(u, 'inventario', ['admin'])) router.replace('/inventario?vista=conteo')
    else setSoloConteo(true)
  }, [router])
  return soloConteo ? <Conteo /> : null
}
