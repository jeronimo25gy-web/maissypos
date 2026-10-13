// Dias del rutero (1 = lunes ... 6 = sabado), compartido por Rutas y su impresion.
export const DIAS = [
  { n: 1, corto: 'Lun', nombre: 'Lunes' },
  { n: 2, corto: 'Mar', nombre: 'Martes' },
  { n: 3, corto: 'Mié', nombre: 'Miércoles' },
  { n: 4, corto: 'Jue', nombre: 'Jueves' },
  { n: 5, corto: 'Vie', nombre: 'Viernes' },
  { n: 6, corto: 'Sáb', nombre: 'Sábado' },
]

// Lo que se muestra debajo del nombre: apto (si no va ya en el nombre),
// direccion y barrio.
export const detalleCliente = (c) => [c.edificio && c.apto ? null : c.apto, c.direccion, c.barrio].filter(Boolean).join(' · ')
