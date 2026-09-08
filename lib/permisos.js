// Misma regla que usa components/Sidebar.js para decidir que modulos ve un
// usuario: si tiene `modulos` (acceso personalizado asignado en
// Configuracion), eso manda por encima del rol. Si no, se usa el rol.
// Cada pagina debe llamar esto en vez de comparar `usuario.rol` a mano, para
// que un acceso personalizado no quede bloqueado por un redirect fijo.
export function puedeVerModulo(usuario, moduloId, rolesPermitidos) {
  if (!usuario) return false
  if (usuario.modulos) return usuario.modulos.includes(moduloId)
  return rolesPermitidos.includes(usuario.rol)
}
