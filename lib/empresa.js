export function getEmpresaId() {
  return localStorage.getItem('maissy_empresa')
}

export function setEmpresaId(id) {
  localStorage.setItem('maissy_empresa', id)
}
