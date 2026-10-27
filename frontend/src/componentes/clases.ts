// Une las clases que se aplican: clases(estilos.boton, activo && estilos.activo, className)
export const clases = (...lista: (string | false | null | undefined)[]) =>
  lista.filter(Boolean).join(' ')
