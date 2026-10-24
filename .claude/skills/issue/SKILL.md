---
name: issue
description: Trabaja una issue de GitHub de Marela de principio a fin, siguiendo el flujo del proyecto. Lee la issue, crea la rama desde develop, implementa, pasa las comprobaciones, hace el commit convencional, abre el PR con la plantilla y espera la CI. Úsala cuando el usuario pida empezar o hacer una issue ("vamos con la 7", "haz la GH-12").
argument-hint: <número de issue>
---

# Trabajar una issue

Issue: **#$ARGUMENTS**. Todo se comunica en español. El flujo completo está en `CONTRIBUTING.md` y en la sección "Flujo de trabajo" de `docs/diseno.md`.

## 1. Entender la issue

1. Lee la issue con su milestone y sus etiquetas: `gh issue view <n> --json title,body,labels,milestone`.
2. Si depende de otra issue que sigue abierta ("Depende de #n"), avisa al usuario antes de seguir.
3. Lee las secciones de `docs/diseno.md` que la afectan, y la issue en `docs/backlog.md` si hace falta contexto del ciclo.
4. Mira cómo está resuelto algo parecido en el propio repositorio y sigue el mismo patrón antes que inventar uno nuevo.
5. Si la issue deja abierta una decisión que es del usuario (funcional, de diseño o de alcance), pregúntala antes de implementar. Las decisiones técnicas con una opción convencional las tomas tú y las cuentas al final.

## 2. Rama

```
git status --short                        # debe estar limpio
git checkout develop && git pull --ff-only
git checkout -b feature/GH-<n>-<descripcion-corta>
```

Usa `fix/GH-<n>-...` si la issue es un fallo (etiqueta `bug`). Un hotfix (`hotfix/GH-<n>`, etiqueta `hotfix`) sale de `main`, no de `develop`.

## 3. Implementar

- **Estilo:** el código, los nombres, los comentarios y los mensajes van en español, con la misma densidad de comentarios que el código de alrededor.
- **Proyectos:** `frontend/`, `backend/` y `proxy/` son independientes. Ninguno importa código de otro; el contrato entre frontend y backend es `backend/openapi.json`.
- **Base de datos:** si cambia el esquema, sigue la skill `esquema`.
- **Interfaz:** si toca la interfaz, sigue la skill `diseno-frontend`.
- **Tests:** cada criterio de aceptación tiene que poder comprobarse con un test cuando sea razonable. Los del backend van contra PostgreSQL de verdad.
- **Contrato de la API:** si cambia la API, regenera el contrato y el cliente:
  ```
  cd backend && npm run openapi
  cd ../frontend && npm run api:generar
  ```
- **Configuración:** una variable de entorno nueva va en `src/config.ts`, en `.env.example`, en los Compose y en el README del proyecto.

## 4. Comprobaciones

Node 24 está instalado en el equipo: lint, tipos y compilación se pueden ejecutar fuera de Docker. Los tests del backend necesitan PostgreSQL, así que se ejecutan en el entorno de desarrollo:

```
docker compose -f docker-compose.dev.yml up -d --build              # --renew-anon-volumes si cambian dependencias
docker compose -f docker-compose.dev.yml exec -T backend npm test
docker compose -f docker-compose.dev.yml exec -T frontend npm test
```

Ejecuta en cada proyecto que hayas tocado lo mismo que la CI (`.github/workflows/ci.yml`):

| Proyecto | Comandos |
|---|---|
| backend | `npm run format`, `npm run lint`, `npm run typecheck`, `npm run build`, tests, `npm run db:check`, `npm run openapi:check` |
| frontend | `npm run format`, `npm run lint`, `npm run typecheck`, `npm run build`, tests, `npm run api:check` |
| proxy | `docker compose build proxy` |

Si cambia algo que se ve, arranca la aplicación y compruébalo en el navegador, también a ancho de móvil (360 px). Borra `dist/` si la compilación lo deja.

## 5. Documentación

Actualiza lo que haya cambiado: los README de cada proyecto, `CONTRIBUTING.md`, `.env.example`, y `docs/diseno.md` si cambia una decisión. Si te desvías de lo que dice la issue o el diseño, explícalo en el PR.

## 6. Commit y PR

1. Haz un solo commit, salvo que haya partes claramente separables, con Conventional Commits y la issue al final:
   ```
   feat(<ámbito>): <qué hace, en minúsculas> GH-<n>
   ```
   - Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `build`.
   - Ámbitos: `animales`, `comida`, `fincas`, `finanzas`, `auth`, `db`, `infra`...
   - En el cuerpo, una lista breve de los cambios y las líneas de atribución que correspondan.
2. Sube la rama: `git push -u origin <rama>`.
3. Abre el PR contra `develop` (contra `main` si es un hotfix) con `.github/pull_request_template.md` rellena:
   - `Closes #<n>`.
   - El tipo de rama marcado.
   - "Cambios" con lo que cambia y por qué. Si hay decisiones que el usuario deba revisar, van destacadas.
   - Las comprobaciones que se cumplen marcadas. Las que no aplican, con la razón.
4. Espera la CI: `gh pr checks <pr> --watch --interval 15`.
   - Si falla, lee el log (`gh run view <id> --log-failed`), corrígelo y sube otro commit.
   - Cuando pase, marca "Pasa la CI" en la descripción del PR.

## 7. Informe

Cuenta al usuario, en pocas líneas, qué se ha hecho, las decisiones que has tomado, lo que queda pendiente y el enlace al PR. **No mergees** salvo que el usuario lo pida; para eso está la skill `mergear`.
