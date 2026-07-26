'use client'
import { createContext, useContext, useState } from 'react'

const SidebarContext = createContext(null)

export function SidebarProvider({ children }) {
  const [abierto, setAbierto] = useState(false)
  return <SidebarContext.Provider value={{ abierto, setAbierto }}>{children}</SidebarContext.Provider>
}

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebar debe usarse dentro de SidebarProvider')
  return ctx
}
