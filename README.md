# Marela

[![CI](https://github.com/PabloCastroCastro/marela/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/PabloCastroCastro/marela/actions/workflows/ci.yml)

Aplicación web para gestionar ganaderías de vacuno de carne de cría desde el móvil y el ordenador, con varias explotaciones: animales (ficha, tratamientos, reproducción y pesos), comida (almacenes con entradas y salidas), fincas (labores, tratamientos y pastoreo) y finanzas (facturas, ventas e informes).

Se instala como PWA desde el navegador, sin tiendas de aplicaciones, y se autoaloja en un servidor propio con software libre.

> **Estado:** estructura base. El trabajo se organiza en issues y milestones de GitHub.

## Documentación

Todas las decisiones funcionales, técnicas y de organización están en el [documento de diseño](docs/diseno.md):

- Requisitos de cada sección: Animales, Comida, Fincas y Finanzas
- Usuarios, roles y autenticación
- Arquitectura, alojamiento e interfaz
- Flujo de trabajo: ramas, commits, versiones y definición de terminado

La instalación en el servidor y los despliegues están en [docs/servidor.md](docs/servidor.md); las copias de seguridad diarias y la copia en el PC, en [docs/operacion.md](docs/operacion.md).

El plan de ciclos y el backlog de issues están en [docs/backlog.md](docs/backlog.md); el avance de cada ciclo se sigue en los [milestones](https://github.com/PabloCastroCastro/marela/milestones).

## Arquitectura

Un repositorio con tres proyectos independientes, cada uno con sus dependencias y su contenedor, orquestados con Docker Compose:

| Proyecto | Carpeta | Tecnología |
|---|---|---|
| Frontend | `frontend/` | React + TypeScript + Vite, PWA |
| Backend | `backend/` | Node.js LTS + TypeScript, Hono, Zod, Drizzle ORM, Better Auth y PostgreSQL |
| Proxy | `proxy/` | nginx: sirve la PWA y redirige `/api` al backend |

Se autoaloja en una Raspberry Pi, con acceso inicialmente por Tailscale.

## Cómo contribuir

- Ramas `feature/GH-<n>`, `fix/GH-<n>` y `hotfix/GH-<n>`; `develop` es la rama de integración y `main` solo contiene versiones publicadas.
- Commits con [Conventional Commits](https://www.conventionalcommits.org/es/) y referencia a la issue, por ejemplo `feat(animales): alta de partos GH-12`.
- Todo cambio entra por pull request con `Closes #<n>`.

El detalle está en la [guía de contribución](CONTRIBUTING.md).

## Estructura del repositorio

```
frontend/                    PWA (React + Vite)
backend/                     API (Node + Hono) y base de datos (PostgreSQL)
proxy/                       nginx: sirve la PWA y redirige /api al backend
docker-compose.dev.yml       desarrollo local
docker-compose.yml           servidor (pruebas y producción) y versión de servidor en local
docker-compose.servidor.yml  solo en el servidor: certificado HTTPS de Tailscale
.env.example                 configuración de Compose
scripts/                     despliegue y copias de seguridad en el servidor, y su copia en el PC
docs/                        documento de diseño, backlog, guía del servidor y operación
```

Cada proyecto es independiente: tiene sus propias dependencias, su Dockerfile y su README, y no importa código de los demás.

## Desarrollo local

Requisitos: [Docker](https://docs.docker.com/get-docker/) con Docker Compose. Node.js 24 solo hace falta para trabajar en un proyecto fuera de Docker.

Arranca todo con un solo comando:

```
docker compose -f docker-compose.dev.yml up --build
```

| Servicio | Dirección |
|---|---|
| Aplicación (Vite, con recarga en caliente) | http://localhost:5173 |
| API | http://localhost:3000/api/health (también a través de http://localhost:5173/api) |
| Documentación de la API | http://localhost:3000/api/docs |
| PostgreSQL | `localhost:5432`, usuario, contraseña y base de datos `marela` |

Para cargar los datos de ejemplo (dos explotaciones con sus usuarios, listados en el [README del backend](backend/README.md#datos-de-ejemplo)) y poder iniciar sesión, por ejemplo con `ana` y `marela-dev`:

```
docker compose -f docker-compose.dev.yml exec backend npm run db:seed
```

El código de `backend/` y `frontend/` se monta en los contenedores, así que los cambios se aplican al guardar. **En Windows**, con el repositorio en `C:\`, los cambios no llegan como eventos a los contenedores y la recarga no se produce: pon `RECARGA_POLLING=true` en un `.env` (copia de `.env.example`). Si clonas el repositorio dentro de WSL no hace falta.

Si cambian las dependencias de un proyecto, reconstruye y renueva sus `node_modules`:

```
docker compose -f docker-compose.dev.yml up --build --renew-anon-volumes
```

Los tests se ejecutan en su contenedor:

```
docker compose -f docker-compose.dev.yml exec backend npm test
docker compose -f docker-compose.dev.yml exec frontend npm test
```

Para probar la versión de servidor en local (nginx con la PWA compilada en http://localhost:8080):

```
POSTGRES_PASSWORD=local BETTER_AUTH_SECRET=local-sin-valor-real-0123456789abcdef URL_PUBLICA=http://localhost:8080 docker compose up --build
```

Para trabajar en un solo proyecto sin Docker, sigue el README de su carpeta.
