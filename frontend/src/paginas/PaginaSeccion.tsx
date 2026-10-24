import estilos from './Paginas.module.css'

// Sección todavía sin desarrollar
export function PaginaSeccion({ titulo }: { titulo: string }) {
  return (
    <section className={estilos.pagina}>
      <h1>{titulo}</h1>
      <p>Esta sección está en desarrollo.</p>
    </section>
  )
}
