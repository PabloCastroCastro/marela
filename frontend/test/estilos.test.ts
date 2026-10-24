// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Reglas de la guía de diseño que se pueden comprobar en los estilos

// Los tests se ejecutan desde la carpeta del frontend
const src = join(process.cwd(), 'src')

const modulos = (readdirSync(src, { recursive: true }) as string[])
  .filter((f) => f.endsWith('.module.css'))
  .map((f) => ({ archivo: f, css: readFileSync(join(src, f), 'utf8') }))

describe('estilos', () => {
  it('los componentes solo usan tokens, nunca colores sueltos', () => {
    const conColores = modulos
      .filter(({ css }) => /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(css))
      .map(({ archivo }) => archivo)
    expect(conColores).toEqual([])
  })

  it('ninguna clase se define dos veces en el mismo módulo', () => {
    const repetidas = modulos.flatMap(({ archivo, css }) => {
      // Solo las reglas de primer nivel con un único selector de clase
      const sinMedia = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
      const selectores = [...sinMedia.matchAll(/^(\.[\w-]+)\s*\{/gm)].map((m) => m[1])
      return selectores.filter((s, i) => selectores.indexOf(s) !== i).map((s) => `${archivo}: ${s}`)
    })
    expect(repetidas).toEqual([])
  })

  it('el tema oscuro forzado tiene los mismos valores que el del sistema', () => {
    const tokens = readFileSync(join(src, 'estilos', 'tokens.css'), 'utf8')
    const declaraciones = (bloque: string) =>
      [...bloque.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => `${m[1]}: ${m[2]}`).sort()

    const sistema = tokens.match(/:root:not\(\[data-tema="claro"\]\)\s*\{([^}]*)\}/)?.[1] ?? ''
    const forzado = tokens.match(/:root\[data-tema="oscuro"\]\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(declaraciones(sistema).length).toBeGreaterThan(20)
    expect(declaraciones(forzado)).toEqual(declaraciones(sistema))
  })
})
