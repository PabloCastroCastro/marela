---
name: mergear
description: Mergea un pull request de Marela con la CI en verde, con el método que toca según la rama (squash a develop, merge commit de develop a main y de main a develop). Después deja develop al día, borra la rama y comprueba que la issue se ha cerrado. Úsala solo cuando el usuario pida mergear.
argument-hint: "[número de PR; por defecto, el de la rama actual]"
disable-model-invocation: true
---

# Mergear un PR

PR: **$ARGUMENTS**. Si no se indica, usa el de la rama actual: `gh pr view --json number`.

## 1. Comprobar

```
gh pr view <pr> --json state,baseRefName,headRefName,mergeable,mergeStateStatus,statusCheckRollup,body
```

- **Estado:** el PR debe estar abierto y ser mergeable.
- **CI:** "Resultado de la CI" debe estar en `SUCCESS`. Si la CI sigue en marcha, espera con `gh pr checks <pr> --watch --interval 15`. Si falla, **no mergees**: cuenta qué falla.
- **Comprobaciones:** si la descripción tiene comprobaciones sin marcar que sí aplican (por ejemplo "Probado en el móvil"), recuérdaselas al usuario antes de mergear.

## 2. Mergear

El método depende de las ramas:

| PR | Método | Comando |
|---|---|---|
| `feature/`, `fix/` → `develop` | squash | `gh pr merge <pr> --squash --delete-branch` |
| `hotfix/` → `main` | squash | `gh pr merge <pr> --squash --delete-branch` |
| `develop` → `main` (versión) | merge commit | `gh pr merge <pr> --merge` (nunca borres `develop`) |
| `main` → `develop` (tras un hotfix) | merge commit | `gh pr merge <pr> --merge` (nunca borres `main`) |

Con squash, el commit queda con el título del PR y `(#<pr>)`, así que el título debe seguir Conventional Commits y terminar en `GH-<n>`.

## 3. Después

```
git checkout develop && git pull --ff-only
git remote prune origin
git branch -D <rama>          # la local, si existe
```

- **Issue:** comprueba que se ha cerrado (`gh issue view <n> --json state`). `Closes #n` solo actúa en la rama por defecto, que es `develop`. En un PR a `main` (hotfix), ciérrala a mano con un comentario que remita al PR.
- **Hotfix:** tras mergearlo en `main`, sigue la skill `version` para el tag, la release y el despliegue, y abre el PR `main` → `develop`.

## 4. Informe

Di qué se ha mergeado, con qué método y el commit resultante, y qué issues se han cerrado. Propón lo siguiente del milestone sin empezarlo:

```
gh issue list --milestone "<milestone>" --state open
```
