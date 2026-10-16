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

// Link de Google Maps con la ruta en carro hasta el cliente. Con direccion se
// manda solo la direccion y la ciudad: el barrio confunde a Maps, porque
// "Estadio", "Velodromo" o "Floresta" son tambien lugares y lo manda alla.
// Las abreviaturas se escriben completas ("Cra" -> "Carrera").
const SIGUE = '(?![a-záéíóúñ])\\.?\\s*'
const ABREV = [['cra|kra|kr|cr|carr|cra', 'Carrera '], ['cll|cl|call', 'Calle '], ['tv|tr|transv|trans', 'Transversal '],
  ['dg|diag', 'Diagonal '], ['cq|circ', 'Circular '], ['av|avda', 'Avenida ']].map(([a, t]) => [new RegExp(`^(${a})${SIGUE}`, 'i'), t])
export const direccionNormalizada = (dir) => {
  let d = (dir || '').trim()
  for (const [re, txt] of ABREV) if (re.test(d)) { d = d.replace(re, txt); break }
  return d.replace(/\s*(?:#|\bno\.?\s*(?=\d)|n°)\s*/i, ' # ').replace(/\s+/g, ' ')
}
export const linkComoLlegar = (c) => 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' +
  encodeURIComponent(c.direccion ? `${direccionNormalizada(c.direccion)}, Medellín, Antioquia, Colombia` : [c.edificio, c.barrio, 'Medellín, Antioquia, Colombia'].filter(Boolean).join(', '))
