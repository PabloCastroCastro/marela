import { z } from '@hono/zod-openapi'
import { ErrorApi } from './errores.js'

// Registros sin conexión (GH-31): el dispositivo genera el identificador de lo que da de alta, y si
// lo reenvía (porque no supo si llegó, o porque estaba en la cola de pendientes) se devuelve el que
// ya se guardó en lugar de duplicarlo.

export const IdCliente = z.uuid('Identificador no válido').optional().openapi({
  description:
    'Generado en el dispositivo. Si ya existe un registro con este id, se devuelve ese en lugar de crear otro: reenviar no duplica.',
})

// El id ya lo usa un registro de otra explotación, de otro animal o de otra tabla: no es un reenvío
export const idEnUso = () =>
  new ErrorApi(409, 'id_en_uso', 'El identificador ya lo usa otro registro', [
    { campo: 'id', mensaje: 'El identificador ya lo usa otro registro' },
  ])
