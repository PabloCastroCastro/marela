import { sql } from 'drizzle-orm'
import { db } from './cliente.js'
import { ROL_APLICACION } from './schema/explotacion.js'

// Acceso a los datos de una explotación (separación con Row-Level Security; ver
// src/db/schema/explotacion.ts). Todas las consultas a tablas de datos de una explotación pasan por
// aquí: fuera de enExplotacion el backend usa el rol de la conexión, al que no se aplica la política.

export type ContextoExplotacion = {
  explotacionId: string
  // Usuario de la petición: queda en la auditoría de lo que se crea o modifica
  usuarioId: string
}

export type Transaccion = Parameters<Parameters<typeof db.transaction>[0]>[0]

// Ejecuta fn en una transacción con el rol de la aplicación y la explotación y el usuario fijados.
// Todo se deshace si fn lanza un error.
export function enExplotacion<T>(
  contexto: ContextoExplotacion,
  fn: (tx: Transaccion) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`set local role ${ROL_APLICACION}`))
    await tx.execute(
      sql`select set_config('marela.explotacion_id', ${contexto.explotacionId}, true),
                 set_config('marela.usuario_id', ${contexto.usuarioId}, true)`,
    )
    return fn(tx)
  })
}
