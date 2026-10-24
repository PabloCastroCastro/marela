// Crea el propietario de la plataforma, que después crea las explotaciones y sus administradores.
//
//   npm run crear-propietario                                             (desarrollo)
//   docker compose exec backend node dist/scripts/crear-propietario.js    (servidor)
//
// Pregunta lo que no se indique con --usuario, --nombre y --email. Muestra una contraseña temporal,
// que hay que cambiar en el primer inicio de sesión.
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { pool } from '../db/cliente.js'
import { crearUsuario, ErrorUsuario } from '../usuarios.js'

const { values: argumentos } = parseArgs({
  options: {
    usuario: { type: 'string' },
    nombre: { type: 'string' },
    email: { type: 'string' },
  },
})

const terminal = createInterface({ input: stdin, output: stdout })
const preguntar = async (texto: string, valor?: string) => valor ?? (await terminal.question(texto))

let codigo = 0
try {
  const usuario = await preguntar('Nombre de usuario: ', argumentos.usuario)
  const nombre = await preguntar('Nombre: ', argumentos.nombre)
  const email = await preguntar('Email: ', argumentos.email)

  const { usuario: creado, contrasenaTemporal } = await crearUsuario({
    usuario,
    nombre,
    email,
    propietario: true,
  })
  console.log(`\nCreado el propietario ${creado.name} (${creado.username}, ${creado.email})`)
  console.log(`Contraseña temporal: ${contrasenaTemporal}`)
  console.log('Se pedirá cambiarla en el primer inicio de sesión. No se volverá a mostrar.')
} catch (error) {
  if (!(error instanceof ErrorUsuario)) throw error
  console.error(`No se ha creado nada: ${error.message}`)
  codigo = 1
} finally {
  terminal.close()
  await pool.end()
}
process.exit(codigo)
