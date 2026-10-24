import { Link } from 'react-router'
import estilos from './Paginas.module.css'

export function PaginaNoEncontrada() {
  return (
    <section className={estilos.pagina}>
      <h1>Página no encontrada</h1>
      <p>
        La dirección no existe. <Link to="/">Volver al inicio</Link>
      </p>
    </section>
  )
}
