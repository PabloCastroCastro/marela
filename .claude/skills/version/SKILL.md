---
name: version
description: Publica una versión de Marela. Sube la versión (package.json, locks, app.ts y openapi.json) en un PR a develop, abre y mergea el PR develop → main con merge commit, y crea el tag, la release de GitHub y el despliegue en producción. También cierra un hotfix ya mergeado en main. Úsala solo cuando el usuario pida publicar una versión o cerrar un hotfix.
argument-hint: "[versión, p. ej. 0.2.0; por defecto se propone]"
disable-model-invocation: true
---

# Publicar una versión

Versión pedida: **$ARGUMENTS**. Si no se indica, propónla y espera a que el usuario la confirme.

## Qué número toca

Versionado semántico con tags `vMAYOR.MENOR.PARCHE` (`CONTRIBUTING.md`, "Versiones"):

- `0.x` durante el MVP. La `v1.0.0` sale al terminar Finanzas (ciclo 7), con el despliegue en producción.
- **MENOR:** cierre de un ciclo o de un conjunto de funcionalidades.
- **PARCHE:** hotfixes.

Mira la última versión (`gh release list --limit 3`) y lo que entra desde ella:

```
git log --oneline <último tag>..origin/develop
```

## Versión desde develop

### 1. Comprobar que se puede publicar

- **CI:** en verde en `develop`: `gh run list --branch develop --limit 3`.
- **Milestone:** si se cierra un ciclo, no le quedan issues abiertas: `gh issue list --milestone "<ciclo>" --state open`. Si quedan, pregunta si se publican igualmente o se mueven al siguiente.
- **Pruebas:** recuerda al usuario que lo nuevo debe estar probado en el entorno de pruebas (definición de terminado).

### 2. Subir la versión (PR a `develop`)

1. Crea la rama `chore/version-X.Y.Z` desde `develop`.
2. Cambia la versión en estos sitios:
   - `npm version X.Y.Z --no-git-tag-version`, en `backend/` y en `frontend/`. Actualiza `package.json` y `package-lock.json`.
   - `version` de `infoOpenApi` en `backend/src/app.ts`.
   - `cd backend && npm run openapi`, para regenerar `openapi.json`.
   - `cd frontend && npm run api:generar`, por si el cliente cambia.
3. Haz el commit `chore(release): versión X.Y.Z` y abre un PR contra `develop`.
   - En la descripción, lo que incluye: los ciclos y las issues (`GH-n`), las migraciones nuevas y los cambios de configuración o de `.env`.
4. Espera la CI y mergéalo con squash (skill `mergear`).

### 3. PR `develop` → `main`

```
gh pr create --base main --head develop --title "Release vX.Y.Z" --body-file -
```

- **Descripción:** "Versión X.Y.Z:" y la lista de lo que incluye, agrupada por ciclo con sus `GH-n`.
- **Avisos:** añade lo que haya que saber al desplegar: migraciones, variables nuevas de `.env` o pasos manuales.
- **Merge:** cuando pase la CI, mergea **con merge commit**, nunca squash, y sin borrar `develop`: `gh pr merge <pr> --merge`.

### 4. Tag y release

```
git fetch origin && git checkout main && git pull --ff-only
git tag -a vX.Y.Z -m "Versión X.Y.Z"
git push origin vX.Y.Z
gh release create vX.Y.Z --title "vX.Y.Z" --generate-notes --verify-tag
git checkout develop
```

### 5. Desplegar

El despliegue se hace en la Raspberry, con el `deploy.sh` de GH-13 y GH-41 (`docs/servidor.md`). Hace una copia de seguridad, compila, levanta los servicios y comprueba la salud; el backend aplica las migraciones al arrancar. Dale al usuario el comando para ejecutarlo allí:

```
/opt/marela/pro/scripts/deploy.sh pro vX.Y.Z
```

Si `scripts/deploy.sh` aún no existe, di que el despliegue queda pendiente de esas issues.

- **Variables nuevas:** recuérdale añadir antes las variables nuevas al `.env` de producción.
- **Comprobación:** después, que abra la aplicación y compruebe la versión en la pantalla de inicio.

## Cerrar un hotfix

Cuando el PR `hotfix/GH-n` ya está mergeado en `main` (skill `mergear`):

1. Comprueba que el PR del hotfix subió la versión PARCHE (mismos sitios que en el paso 2). Si no, haz un PR más a `main` que la suba.
2. Haz el tag y la release como en el paso 4, y el despliegue como en el paso 5.
3. Lleva el arreglo a `develop` con un PR `main` → `develop` y mergéalo con merge commit:
   ```
   gh pr create --base develop --head main --title "Llevar vX.Y.Z a develop" --body-file -
   ```
   Si hay conflictos, resuélvelos en una rama desde `develop` en lugar de tocar `main`.

## Informe

Di qué versión se ha publicado, el enlace a la release, qué incluye y si el despliegue está hecho o queda pendiente del usuario.
