// Misma regla que usa components/Sidebar.js para decidir que modulos ve un
// usuario. Orden: Gerencia ve todo; si tiene `modulos` (acceso personalizado
// asignado en Configuracion), eso manda; si no, los permisos de su rol que
// Gerencia configuro (`modulosRol`); si no hay, los roles de cada pagina.
// Cada pagina debe llamar esto en vez de comparar `usuario.rol` a mano, para
// que un acceso personalizado no quede bloqueado por un redirect fijo.
export function puedeVerModulo(usuario, moduloId, rolesPermitidos) {
  if (!usuario) return false
  if (usuario.gerencia) return true
  if (usuario.modulos) return usuario.modulos.includes(moduloId)
  if (usuario.modulosRol) return usuario.modulosRol.includes(moduloId)
  return rolesPermitidos.includes(usuario.rol)
}

// Gerencia trabaja como administrador en todo el sistema (rol 'admin') con la
// marca `gerencia`; el administrador queda limitado por los permisos de su rol.
export function normalizarUsuario(u, permisosRol) {
  if (!u) return u
  const gerencia = u.rol === 'gerencia' || !!u.gerencia
  const rol = u.rol === 'gerencia' ? 'admin' : u.rol
  return { ...u, rol, gerencia, modulosRol: gerencia ? null : (permisosRol?.[rol] || null) }
}

export const nombreRol = (u) => u?.gerencia ? 'Gerencia' : ({ admin: 'Administrador', auxiliar: 'Auxiliar', vendedor: 'Vendedor', planta: 'Planta', plataforma: 'Plataforma' }[u?.rol] || u?.rol || '')
