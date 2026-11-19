# Laboratorio 5.2: Configuración de un Pipeline de Despliegue Continuo con Docker

**Universidad San Francisco Xavier de Chuquisaca**

**Asignatura:** Trabajando en la Nube (COM610)\
**Estudiante:** Edgar Tito Gonzales\
**Docente:** Ing. Marcelo Quispe Ortega\
**Semestre:** 2/2026

---

## Introducción

En el Laboratorio 5.1 se desarrolló una API REST para administrar un catálogo de muebles utilizando Node.js, Express y SQLite. También se configuró un proceso de Integración Continua (CI) con GitHub Actions, encargado de instalar las dependencias, ejecutar el linting y realizar las pruebas automatizadas.

En esta segunda parte se amplía el proyecto mediante un proceso de Despliegue Continuo (CD) basado en Docker. El objetivo es empaquetar la aplicación en una imagen, publicarla en Docker Hub y desplegarla automáticamente en un servidor Linux remoto. De esta manera, los cambios que llegan a la rama principal pueden convertirse en una nueva versión ejecutable de la API.

La implementación conserva la estructura y funcionalidad del proyecto del Laboratorio 5.1. Por tanto, se utiliza la carpeta `src/`, el servidor `src/server.js`, la aplicación `src/app.js`, la base de datos SQLite y el directorio `uploads/` para las imágenes.

## Objetivos

- Crear un `Dockerfile` con construcción de múltiples etapas (*multi-stage build*).
- Preparar un contexto de construcción limpio mediante `.dockerignore`.
- Construir y probar localmente una imagen Docker de la API.
- Configurar secretos y variables para conectar GitHub Actions con Docker Hub y el servidor remoto.
- Crear un workflow identificado como **LAB 5.2** que construya y publique la imagen Docker.
- Automatizar el despliegue remoto mediante conexión SSH.
- Configurar los entornos `staging` y `production` en GitHub.
- Incorporar un análisis de vulnerabilidades de la imagen.
- Verificar el funcionamiento de la API desplegada y documentar el procedimiento de rollback.

## 1. Continuidad del proyecto del Laboratorio 5.1

Para esta práctica se reutiliza el repositorio `EDGAR0320/Muebleria-Melux`, desarrollado en el Laboratorio 5.1. Antes de comenzar, se verifica que el proyecto se encuentre actualizado y que el workflow de CI anterior continúe disponible.

La estructura relevante del proyecto es la siguiente:

```text
catalogo-muebles-ci/
├── .github/
│   └── workflows/
│       └── ci.yml
├── img/
├── src/
│   ├── app.js
│   ├── db.js
│   └── server.js
├── tests/
├── uploads/
├── package.json
├── package-lock.json
├── README.md
└── INFORME.md


```

El archivo `ci.yml` corresponde al Laboratorio 5.1 y debe conservarse. Para el Laboratorio 5.2 se amplió el mismo archivo `.github/workflows/ci.yml`, integrando CI y CD en un único workflow.

**Verificación inicial:**

```bash
git checkout main
git pull origin main
git status
```

**Resultado esperado:** el repositorio se encuentra actualizado y no presenta cambios pendientes que puedan interferir con la práctica.

**Evidencia 1 — Estado inicial del repositorio**
![imagen](img/image%20copy%2014.png)

*Descripción sugerida:* Se observa la estructura del proyecto del Laboratorio 5.1 que será reutilizado para implementar el pipeline de Despliegue Continuo del Laboratorio 5.2.

## 2. Creación del Dockerfile multi-stage

Se creó el archivo `Dockerfile` en la raíz del repositorio para empaquetar la API en una imagen Docker. Se utilizó una construcción de múltiples etapas para separar la instalación de dependencias y herramientas de compilación del entorno final de ejecución.

Como el proyecto utiliza `better-sqlite3`, se mantiene Node.js 22 o superior, de acuerdo con el requisito establecido en el Laboratorio 5.1 para esa dependencia. Además, se contempla que la aplicación utiliza `src/server.js` como punto de entrada.

Contenido utilizado:

```
touch Dockerfile
```

```dockerfile
# Etapa 1: instalación de dependencias de producción
FROM node:22-alpine AS dependencies

WORKDIR /app

# Herramientas necesarias para compilar dependencias nativas
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

# Etapa 2: imagen final de ejecución
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_FILE=/data/catalogo.db

# Bibliotecas necesarias para ejecutar módulos nativos
RUN apk add --no-cache libstdc++ \
    && mkdir -p /data /app/uploads \
    && chown -R node:node /app /data

# Copiar únicamente los archivos necesarios
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node src ./src

USER node

EXPOSE 3000

CMD ["node", "src/server.js"]


```

La primera etapa instala las dependencias de producción y permite compilar los módulos nativos que lo necesiten. La segunda etapa utiliza una imagen limpia, copia los módulos y el código fuente necesario, y ejecuta el servidor mediante `src/server.js`.

También se definió `DB_FILE=/data/catalogo.db` para ubicar la base de datos en una ruta que pueda persistirse mediante un volumen. El directorio `uploads/` también deberá persistirse, porque allí se almacenan las imágenes enviadas a la API.

**Nota técnica:** el Dockerfile de ejemplo general del enunciado utiliza archivos `app.js` y `server.js` en la raíz. En este proyecto se adaptaron las rutas a `src/app.js` y `src/server.js`. No se debe copiar el ejemplo sin realizar esta adaptación.

*Descripción sugerida:* Se observa el Dockerfile multi-stage adaptado a la estructura del catálogo de muebles, con Node.js 22, dependencias de producción y el punto de entrada `src/server.js`.

## 3. Configuración del archivo .dockerignore

Se creó `.dockerignore` en la raíz del proyecto para excluir archivos y directorios que no deben formar parte del contexto de construcción de la imagen.

Contenido:

```
touch .dockerignore


```

```text
node_modules
npm-debug.log
.git
.github
.env
coverage
uploads/*
!uploads/.gitkeep
Dockerfile
.dockerignore


```

Con esta configuración se evita copiar dependencias instaladas localmente, información del repositorio, archivos de entorno y otros elementos que no son necesarios para construir la imagen. Se conserva `uploads/.gitkeep` para mantener el directorio en el repositorio, aunque las imágenes reales se almacenarán de forma persistente en el servidor.

*Descripción sugerida:* Se observa la configuración de `.dockerignore`, donde se excluyen dependencias, archivos sensibles y directorios que no deben incluirse en el contexto de construcción.

## 4. Construcción y prueba local de la imagen Docker

Una vez creados los archivos `Dockerfile` y `.dockerignore`, se construyó localmente la imagen para comprobar que la aplicación pudiera empaquetarse correctamente.

```bash
docker build -t catalogo-muebles:lab5.2 .
```

**Resultado esperado:** Docker completa las etapas de construcción sin errores y genera la imagen `catalogo-muebles:lab5.2`.

Para comprobar que la imagen puede ejecutarse, se inició un contenedor local. Se asignó el puerto 3000 del equipo al puerto 3000 del contenedor y se montaron directorios para conservar la base de datos y las imágenes:

```bash
MSYS_NO_PATHCONV=1 docker run -d \
  --name catalogo-muebles-lab52 \
  -p 3000:3000 \
  -e DB_FILE=/data/catalogo.db \
  --mount type=volume,source=catalogo_data,target=/data \
  --mount type=volume,source=catalogo_uploads,target=/app/uploads \
  --entrypoint sh \
  catalogo-muebles:lab5.2 \
  -c "mkdir -p /data && node src/server.js"
```

Después se consultó el endpoint de salud:

```bash
docker ps -a
```

```bash
curl http://localhost:3000/health
```

**Resultado esperado:** la API responde con HTTP 200 y un contenido JSON similar al siguiente:

```json
{
  "status": "ok"
}
```

Para finalizar la prueba se detuvo y eliminó el contenedor:

```bash
docker stop catalogo-muebles-lab52
docker rm catalogo-muebles-lab52
```

**Evidencia 4 — Construcción de la imagen**

![imagen](img/image%20copy%2015.png)

*Descripción sugerida:* Se observa la construcción local de la imagen Docker del catálogo de muebles, con las etapas de instalación y preparación de la imagen final completadas correctamente.

**Evidencia 5 — Ejecución del contenedor y endpoint health**

![imagen](img/image%20copy%2016.png)
*Descripción sugerida:* Se observa el contenedor del catálogo de muebles en ejecución y la respuesta satisfactoria del endpoint `/health`, confirmando que la aplicación funciona dentro de Docker.

A continuacion se suben los archivos de **Dockerfile** y **.dockerignore** al repositorio:

```bash
git add Dockerfile .dockerignore
git commit -m "feat: agrega Dockerfile multi-stage para contenerizacion"
git switch -c feature/lab5.2-docker
git push -u origin feature/lab5.2-docker
```

## 5. Configuración de secretos y variables en GitHub

Para permitir que GitHub Actions publique imágenes en Docker Hub y se conecte al servidor remoto, se configuraron secretos en el repositorio.

La configuración se realizó desde:

**GitHub → Repositorio → Settings → Secrets and variables → Actions → New repository secret**

Se utilizaron los siguientes secretos de repositorio:

| Nombre            | Descripción                                                               |
| :---------------- | :------------------------------------------------------------------------ |
| `DOCKER_USERNAME` | Usuario de Docker Hub.                                                    |
| `DOCKER_PASSWORD` | Access Token de Docker Hub.                                               |
| `SSH_HOST`        | Dirección IP pública del servidor remoto, si se utiliza un único entorno. |
| `SSH_USER`        | Usuario SSH del servidor.                                                 |
| `SSH_PRIVATE_KEY` | Contenido de la llave privada SSH.                                        |

Para los dos entornos de despliegue, se recomienda configurar `SSH_HOST`, `SSH_USER` y `SSH_PRIVATE_KEY` como **Environment Secrets** independientes dentro de `staging` y `production`. Así cada entorno puede utilizar su propio servidor y sus propias credenciales.

También se creó la variable de repositorio:

| Nombre       | Valor                                      |
| :----------- | :----------------------------------------- |
| `IMAGE_NAME` | `kafciel/catalogo-muebles-ci` |

El valor debe reemplazarse por el nombre real del usuario y del repositorio de imagen en Docker Hub.

**Importante:** el Access Token de Docker Hub y la llave privada SSH no deben escribirse directamente en los archivos YAML ni subirse al repositorio. Deben almacenarse como secretos de GitHub.

**Evidencia 6 — Secretos de GitHub**

![imagen](img/image%20copy%2017.png)

*Descripción sugerida:* Se observa la sección de secretos de GitHub Actions con los nombres de las credenciales necesarias para la autenticación en Docker Hub y la conexión SSH al servidor remoto. Los valores permanecen ocultos.

**Evidencia 7 — Variable IMAGE_NAME**

![imagen](img/image%20copy%2018.png)

*Descripción sugerida:* Se observa la variable `IMAGE_NAME`, utilizada para identificar el repositorio de Docker Hub donde se publicará la imagen del catálogo de muebles.

## 6. Configuración de los entornos staging y production

Como parte de la práctica individual se configuraron dos entornos en GitHub para separar las etapas de despliegue.

La configuración se realizó desde:

**GitHub → Repositorio → Settings → Environments**

Se crearon los siguientes entornos:

- **staging:** destinado a probar una nueva versión de la aplicación antes de promoverla a producción.
- **production:** destinado a ejecutar la versión estable que estará disponible para los usuarios.

En cada entorno se configuraron los secretos SSH correspondientes. De esta manera, el job de despliegue puede utilizar las credenciales del entorno al que está asociado.

**Evidencia 8 — Entornos configurados**

**staging** **production**

![imagen](img/image%20copy%2019.png)
![imagen](img/image%20copy%2020.png)

*Descripción sugerida:* Se observan los dos entornos creados en GitHub, `staging` y `production`, que permiten separar las configuraciones y credenciales utilizadas durante el despliegue.

## 7. Configurar un único YAML con CI y CD

### 7.1. Workflow definitivo: `.github/workflows/ci.yml`

Este archivo ejecuta CI en cada PR; solo publica y despliega en un `push` a `main` cuando **las dos versiones de Node.js** aprueban. Trivy produce evidencia pero no bloquea por hallazgos (`exit-code: '0'`); puede configurarse como bloqueante más adelante. En `staging` usa puerto 8080 y en `production` puerto 80.

```yaml
name: LAB 5.1 + 5.2 - CI CD Catalogo de Muebles

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: catalogo-muebles-${{ github.ref }}
  cancel-in-progress: false

jobs:
  build-and-test:
    name: Lint y pruebas (Node ${{ matrix.node-version }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node-version: [22, 24]
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Node.js
        uses: actions/setup-node@v6
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm
      - name: Instalar dependencias exactas
        run: npm ci
      - name: Lint
        run: npm run lint
      - name: Pruebas y cobertura
        run: npm run test:coverage
      - name: Guardar cobertura
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage-node-${{ matrix.node-version }}
          path: coverage/
          if-no-files-found: warn

  build-and-push:
    name: CD - Docker Build and Push
    needs: build-and-test
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Configurar Buildx
        uses: docker/setup-buildx-action@v3
      - name: Entrar en Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
      - name: Build y push con version inmutable
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ${{ vars.IMAGE_NAME }}:${{ github.sha }}
            ${{ vars.IMAGE_NAME }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  scan:
    name: CD - Analisis Trivy
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Trivy - imagen publicada
        uses: aquasecurity/trivy-action@v0.36.0
        with:
          image-ref: ${{ vars.IMAGE_NAME }}:${{ github.sha }}
          format: table
          exit-code: '0'
          ignore-unfixed: true
          vuln-type: os,library
          severity: CRITICAL,HIGH

  deploy-staging:
    name: CD - Deploy staging
    needs: scan
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: staging
    timeout-minutes: 15
    steps:
      - name: Desplegar contenedor verificado por SSH
        uses: appleboy/ssh-action@v1.2.0
        env:
          IMAGE: ${{ vars.IMAGE_NAME }}:${{ github.sha }}
          DEPLOY_ENV: staging
          PUBLIC_PORT: '8080'
          CHECK_PORT: '13080'
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          port: 22
          # Recomendada: establecer SSH_FINGERPRINT por entorno.
          fingerprint: ${{ secrets.SSH_FINGERPRINT }}
          envs: IMAGE,DEPLOY_ENV,PUBLIC_PORT,CHECK_PORT
          command_timeout: 12m
          script: |
            set -eu
            APP="catalogo-muebles-${DEPLOY_ENV}"
            PREV="${APP}-previous"
            CAND="${APP}-candidate"
            DATA_VOL="catalogo_${DEPLOY_ENV}_data"
            UPLOAD_VOL="catalogo_${DEPLOY_ENV}_uploads"

            echo "Desplegando $IMAGE en $DEPLOY_ENV"
            docker pull "$IMAGE"
            docker volume create "$DATA_VOL" >/dev/null
            docker volume create "$UPLOAD_VOL" >/dev/null

            # La validacion usa tmpfs independientes: nunca toca SQLite ni imagenes reales.
            docker rm -f "$CAND" >/dev/null 2>&1 || true
            cleanup() { docker rm -f "$CAND" >/dev/null 2>&1 || true; }
            trap cleanup EXIT
            docker run -d --name "$CAND" \
              --tmpfs /data:rw,uid=1000,gid=1000 \
              --tmpfs /app/uploads:rw,uid=1000,gid=1000 \
              -e DB_FILE=/data/catalogo.db \
              -p "127.0.0.1:${CHECK_PORT}:3000" "$IMAGE" >/dev/null
            healthy=0
            for i in $(seq 1 20); do
              if curl --fail --silent --show-error --max-time 2 \
                  "http://127.0.0.1:${CHECK_PORT}/health" >/dev/null 2>&1; then
                healthy=1; break
              fi
              sleep 2
            done
            if [ "$healthy" -ne 1 ]; then
              docker logs "$CAND" || true
              echo 'FALLO: candidato no supera el health check'
              exit 1
            fi
            docker rm -f "$CAND" >/dev/null
            trap - EXIT

            # Conserva la version anterior detenida para recuperarla.
            docker rm -f "$PREV" >/dev/null 2>&1 || true
            if docker container inspect "$APP" >/dev/null 2>&1; then
              docker rename "$APP" "$PREV"
              docker stop "$PREV" >/dev/null
            fi

            if ! docker run -d --name "$APP" \
              --restart unless-stopped \
              -p "${PUBLIC_PORT}:3000" \
              -e DB_FILE=/data/catalogo.db \
              --mount "type=volume,source=${DATA_VOL},target=/data" \
              --mount "type=volume,source=${UPLOAD_VOL},target=/app/uploads" \
              "$IMAGE"; then
              echo 'ERROR: no se pudo iniciar el nuevo contenedor'
              docker rm -f "$APP" >/dev/null 2>&1 || true
              if docker container inspect "$PREV" >/dev/null 2>&1; then
                docker rename "$PREV" "$APP"; docker start "$APP"
              fi
              exit 1
            fi

            healthy=0
            for i in $(seq 1 20); do
              if curl --fail --silent --show-error --max-time 2 \
                  "http://127.0.0.1:${PUBLIC_PORT}/health" >/dev/null 2>&1; then
                healthy=1; break
              fi
              sleep 2
            done
            if [ "$healthy" -ne 1 ]; then
              echo 'ERROR: despliegue fallido, restaurando contenedor anterior'
              docker logs "$APP" || true
              docker rm -f "$APP" >/dev/null 2>&1 || true
              if docker container inspect "$PREV" >/dev/null 2>&1; then
                docker rename "$PREV" "$APP"; docker start "$APP"
              fi
              exit 1
            fi
            echo "OK: $APP ($IMAGE) publicado en puerto $PUBLIC_PORT"
            docker ps --filter "name=^/${APP}$"

  deploy-production:
    name: CD - Deploy production
    needs: deploy-staging
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    timeout-minutes: 15
    steps:
      - name: Desplegar contenedor verificado por SSH
        uses: appleboy/ssh-action@v1.2.0
        env:
          IMAGE: ${{ vars.IMAGE_NAME }}:${{ github.sha }}
          DEPLOY_ENV: production
          PUBLIC_PORT: '80'
          CHECK_PORT: '13081'
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          port: 22
          # Recomendada: establecer SSH_FINGERPRINT por entorno.
          fingerprint: ${{ secrets.SSH_FINGERPRINT }}
          envs: IMAGE,DEPLOY_ENV,PUBLIC_PORT,CHECK_PORT
          command_timeout: 12m
          script: |
            set -eu
            APP="catalogo-muebles-${DEPLOY_ENV}"
            PREV="${APP}-previous"
            CAND="${APP}-candidate"
            DATA_VOL="catalogo_${DEPLOY_ENV}_data"
            UPLOAD_VOL="catalogo_${DEPLOY_ENV}_uploads"

            echo "Desplegando $IMAGE en $DEPLOY_ENV"
            docker pull "$IMAGE"
            docker volume create "$DATA_VOL" >/dev/null
            docker volume create "$UPLOAD_VOL" >/dev/null

            # La validacion usa tmpfs independientes: nunca toca SQLite ni imagenes reales.
            docker rm -f "$CAND" >/dev/null 2>&1 || true
            cleanup() { docker rm -f "$CAND" >/dev/null 2>&1 || true; }
            trap cleanup EXIT
            docker run -d --name "$CAND" \
              --tmpfs /data:rw,uid=1000,gid=1000 \
              --tmpfs /app/uploads:rw,uid=1000,gid=1000 \
              -e DB_FILE=/data/catalogo.db \
              -p "127.0.0.1:${CHECK_PORT}:3000" "$IMAGE" >/dev/null
            healthy=0
            for i in $(seq 1 20); do
              if curl --fail --silent --show-error --max-time 2 \
                  "http://127.0.0.1:${CHECK_PORT}/health" >/dev/null 2>&1; then
                healthy=1; break
              fi
              sleep 2
            done
            if [ "$healthy" -ne 1 ]; then
              docker logs "$CAND" || true
              echo 'FALLO: candidato no supera el health check'
              exit 1
            fi
            docker rm -f "$CAND" >/dev/null
            trap - EXIT

            # Conserva la version anterior detenida para recuperarla.
            docker rm -f "$PREV" >/dev/null 2>&1 || true
            if docker container inspect "$APP" >/dev/null 2>&1; then
              docker rename "$APP" "$PREV"
              docker stop "$PREV" >/dev/null
            fi

            if ! docker run -d --name "$APP" \
              --restart unless-stopped \
              -p "${PUBLIC_PORT}:3000" \
              -e DB_FILE=/data/catalogo.db \
              --mount "type=volume,source=${DATA_VOL},target=/data" \
              --mount "type=volume,source=${UPLOAD_VOL},target=/app/uploads" \
              "$IMAGE"; then
              echo 'ERROR: no se pudo iniciar el nuevo contenedor'
              docker rm -f "$APP" >/dev/null 2>&1 || true
              if docker container inspect "$PREV" >/dev/null 2>&1; then
                docker rename "$PREV" "$APP"; docker start "$APP"
              fi
              exit 1
            fi

            healthy=0
            for i in $(seq 1 20); do
              if curl --fail --silent --show-error --max-time 2 \
                  "http://127.0.0.1:${PUBLIC_PORT}/health" >/dev/null 2>&1; then
                healthy=1; break
              fi
              sleep 2
            done
            if [ "$healthy" -ne 1 ]; then
              echo 'ERROR: despliegue fallido, restaurando contenedor anterior'
              docker logs "$APP" || true
              docker rm -f "$APP" >/dev/null 2>&1 || true
              if docker container inspect "$PREV" >/dev/null 2>&1; then
                docker rename "$PREV" "$APP"; docker start "$APP"
              fi
              exit 1
            fi
            echo "OK: $APP ($IMAGE) publicado en puerto $PUBLIC_PORT"
            docker ps --filter "name=^/${APP}$"

```

**Explicación de las cinco etapas:** `build-and-test` ejecuta lint y pruebas en Node 22 y 24 y guarda la cobertura; `build-and-push` publica `IMAGE_NAME:SHA` y `IMAGE_NAME:latest`; `scan` registra vulnerabilidades; `deploy-staging` valida y publica en 8080; `deploy-production` lo hace en 80 únicamente después de staging.

**Notas técnicas:**

- El `SHA` identifica exactamente el commit y permite rollback; `latest` no debe utilizarse como referencia de despliegue reproducible.
- El contenedor de prueba usa `--tmpfs` y escucha únicamente en `127.0.0.1` del servidor. No publica un servicio de prueba a Internet.
- El contenedor anterior se conserva detenido con sufijo `-previous` hasta el siguiente despliegue. Ante fallo de arranque o salud, se intenta restaurar automáticamente. Puede existir una interrupción corta cuando se intercambian los contenedores; **no es zero-downtime**.
- Los volúmenes nombrados preservan SQLite e imágenes al reemplazar el contenedor. **No** sustituyen copias de seguridad ni garantizan rollback de cambios incompatibles de esquema.
- `fingerprint` permite verificar la clave del servidor SSH; configura el valor real de cada entorno. No inventes una huella digital.
- Si `staging` y `production` comparten máquina, usan puertos y volúmenes separados. Son dos entornos lógicos, **no** dos servidores independientes.

### 7.2. Preparar el servidor Linux: obligatorio para deploy remoto

El enunciado exige una instancia remota (EC2, Lightsail o servidor Linux propio). **Docker Hub almacena imágenes, pero no ejecuta un contenedor públicamente por sí solo.** Docker Desktop en tu Windows sirve para desarrollo local, pero no sustituye automáticamente un servidor accesible por SSH desde GitHub Actions.

Puedes usar **una VM Ubuntu Linux propia accesible públicamente** como servidor de práctica, con ambos entornos en puertos diferentes. Si tu VM está en modo NAT, GitHub Actions no podrá conectarse salvo que configures acceso de red seguro; la opción más sencilla para evaluar el laboratorio suele ser una instancia Linux con IP pública (EC2 o similar).

En el servidor Ubuntu por SSH, una sola vez:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl docker.io
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"

```

**Cierra la sesión SSH y vuelve a entrar** para aplicar el grupo `docker`. Después:

```bash
docker --version
docker ps
curl -I http://127.0.0.1 || true

```

Configura acceso SSH mediante clave pública (por ejemplo `ssh-keygen -t ed25519 -f ~/.ssh/lab52_deploy -C lab52-deploy` en tu equipo, y añade el contenido de `lab52_deploy.pub` a `~/.ssh/authorized_keys` en el servidor; añade **solo la privada** como secreto GitHub). Para consultar la huella de la clave host del servidor, verifica localmente con el administrador o la consola del proveedor: `sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256` (elige el algoritmo realmente utilizado por SSH).

El servidor debe permitir TCP **22** desde el runner por la política de acceso elegida, y HTTP **80** y **8080** para la demostración. Si usas UFW, revisa primero las reglas SSH para evitar bloquearte:

```bash
sudo ufw status
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 8080/tcp
sudo ufw enable

```

Si es EC2, habilita los puertos correspondientes en el **Security Group**. Para un sistema real se recomienda HTTPS, firewall restrictivo y no exponer staging a todo Internet. GitHub-hosted runners cambian sus IP; no asumas que puedes usar `127.0.0.1` ni una IP privada de LAN como `SSH_HOST`.

![imagen](img/image%20copy%2021.png)

*Evidencia: configuración de la instancia EC2 y reglas de acceso de red.*

### 7.3. Probar la imagen en el servidor (antes del primer pipeline)

Comprueba permisos Docker y que los puertos estén libres:

```bash
docker ps -a
sudo ss -ltnp | grep -E ':(80|8080|13080|13081)\b' || true

```

Si otro servidor ocupa el puerto 80, no mates procesos sin identificar qué servicio es. Cambia la configuración deliberadamente o libera el puerto de forma segura. Si usas dos servidores diferentes, no hace falta abrir 8080 en producción.

## 8. Subir el cambio mediante rama y pull request (CI primero)

> En el 5.1 configuraste protección de `main`. La forma adecuada es crear una rama y abrir PR, no hacer `git push origin main` directamente.

```bash
git switch main
git pull origin main
git switch -c feature/lab5-2-cicd
# Edita .github/workflows/ci.yml con el contenido de 7.1
npm run lint
npm run test:coverage
git diff --check
git add .github/workflows/ci.yml 
git commit -m "ci: integra CI 5.1 y CD 5.2 con staging y production"
git push -u origin feature/lab5-2-cicd

```

En GitHub abre **Pull requests → New pull request**, base `main`, compara `feature/lab5-2-cicd`. Verifica que los dos trabajos `Lint y pruebas (Node 22)` y `Lint y pruebas (Node 24)` queden verdes; durante PR es correcto que `build-and-push` y los deploys aparezcan omitidos.

Después de fusionar, ve a **Actions → LAB 5.1 + 5.2 - CI CD Catalogo de Muebles**. El `push` de la fusión a `main` activa publicación, escaneo y despliegue. **Si hay dos workflows desplegando, elimina el obsoleto antes de fusionar**.

![imagen](img/image%20copy%2022.png)

## 9. Verificar Docker Hub y escaneo Trivy

En **Docker Hub → Repositories → imagen configurada en `IMAGE_NAME`**, deben existir dos tags: el SHA completo del commit y `latest` (el último push de `main`). Si no aparece, revisa `build-and-push` y el token Docker Hub.

En **Actions → CD - Analisis Trivy → Run Trivy**, se obtuvo un reporte de **10 hallazgos HIGH y 0 CRITICAL** para la imagen del commit `8fe44faabd00934b765d544beb0809f767ab5043`. El escaneo está en **modo informe**: `exit-code: '0'` deja pasar vulnerabilidades reportadas; errores de herramienta/conectividad pueden seguir fallando el job. En una política estricta se puede usar `exit-code: '1'` para bloquear despliegues ante hallazgos.

![imagen](img/image%20copy%2023.png)

**Trivia**

![imagen](img/image%20copy%2024.png)

**Evidencias: publicación en Docker Hub y resultado del escaneo en GitHub Actions.

## 10. Comprobar staging y producción

Al finalizar ambos deploys, el servidor tendrá:

| Entorno    | Contenedor                    | Puerto del servidor | Persistencia                                              |
| :--------- | :---------------------------- | :------------------ | :-------------------------------------------------------- |
| Staging    | `catalogo-muebles-staging`    | `8080`              | `catalogo_staging_data`, `catalogo_staging_uploads`       |
| Production | `catalogo-muebles-production` | `80`                | `catalogo_production_data`, `catalogo_production_uploads` |

En el servidor:

```bash
docker ps
docker volume ls | grep catalogo
curl -i http://127.0.0.1:8080/health
curl -i http://127.0.0.1:80/health
```

En tu Windows/Git Bash (reemplaza por IP pública real):

```bash
curl -i http://3.149.100.192:8080/health
curl -i http://3.149.100.192/health
curl -i http://3.149.100.192/muebles
```

Respuestas esperadas: `200 OK`, `{"status":"ok"}` en `/health` y arreglo JSON en `/muebles` (vacío si todavía no se registró ningún mueble). Si `curl` devuelve `Connection refused`, revisa Docker y los puertos; si da timeout, revisa Security Group/firewall; si SSH falla, revisa `SSH_HOST`, usuario, clave y conectividad desde GitHub.

**Prueba de persistencia:** crea un mueble en staging, comprueba que aparece, realiza otro despliegue y verifica que sigue allí. Haz las pruebas CRUD de laboratorio en staging, **no** uses datos reales de producción.

```bash
curl -i -X POST http://3.149.100.192:8080/muebles \
  -F 'nombre=Escritorio demo' -F 'categoria=Escritorios' \
  -F 'precio=500' -F 'stock=2'
curl http://3.149.100.192:8080/muebles
```
![imagen](img/image%20copy%2026.png)

![imagen](img/image%20copy%2025.png)


## 11. Comprobar actualización automática

Edita **solo** el endpoint ya existente de `src/app.js` (no crees otro `app.get('/health')`):

```javascript
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', version: '2.0.0' });
});

```

Las pruebas del 5.1 siguen funcionando porque `status: 'ok'` se conserva. En rama nueva:

```bash
git switch main
git pull origin main
git switch -c feature/lab52-health-v2
# modificar src/app.js
npm run lint
npm run test:coverage
git add src/app.js
git commit -m "feat: agrega version a health check"
git push -u origin feature/lab52-health-v2

```

Abre PR, valida CI y fusiona a `main`. Al finalizar el despliegue, verifica `http://3.149.100.192/health` y `http://3.149.100.192:8080/health` con `version: '2.0.0'`. 

![imagen](img/image%20copy%2027.png)

## 12. Prueba de rollback de la aplicación

El rollback permite regresar a una imagen anterior cuando una nueva versión presenta fallas. La práctica se realiza **en `staging` (puerto 8080)** para conservar intacto el servicio de `production` (puerto 80). El workflow almacena las imágenes con el SHA del commit y conserva, cuando existe, el contenedor anterior con el sufijo `-previous`.

### 12.1. Ingresar a EC2 y registrar el estado inicial

Desde Git Bash en Windows se accede al servidor (sustituir la ruta de la llave `.pem` por la utilizada en AWS):

```bash
ssh -i "RUTA_A_TU_LLAVE.pem" ubuntu@3.149.100.192
```

**Los siguientes comandos se ejecutan dentro de EC2**, no en Docker Desktop de Windows:

```bash
docker ps -a --filter "name=catalogo-muebles-staging"
docker inspect catalogo-muebles-staging --format '{{.Config.Image}}'
curl -i http://127.0.0.1:8080/health
```

Se registra la imagen actualmente publicada y el JSON del endpoint `/health`. Si la versión `2.0.0` ya se desplegó, la respuesta esperada incluye `"version":"2.0.0"`.

![imagen](img/image%20copy%2028.png)

### 12.2. Identificar y validar la versión anterior

Primero se comprueba si existe el contenedor de respaldo:

```bash
docker ps -a --filter "name=catalogo-muebles-staging-previous"
docker inspect catalogo-muebles-staging-previous \
  --format '{{.Config.Image}}'
```

Si el respaldo **existe** y contiene la versión que se desea recuperar, se continúa con el punto 12.3. Si no existe, se usa el procedimiento alternativo del punto **12.4**, basado en una etiqueta SHA de Docker Hub.

![imagen](img/image%20copy%2029.png)

### 12.3. Rollback mediante el contenedor `-previous`

**Condición:** confirmar previamente que el contenedor `catalogo-muebles-staging-previous` existe y que `catalogo-muebles-staging-pre-rollback` **no** existe. No se ejecutan estas instrucciones sobre producción.

Se detiene y conserva el contenedor actual para poder restaurarlo al finalizar la demostración:

```bash
# Verificar que no exista el nombre reservado para el respaldo de esta prueba
docker container inspect catalogo-muebles-staging-pre-rollback \
  >/dev/null 2>&1 && echo "DETENER: respaldo ya existe" || echo "Nombre libre"

# Ejecutar SOLO si el nombre estaba libre
docker stop catalogo-muebles-staging
docker rename catalogo-muebles-staging catalogo-muebles-staging-pre-rollback

# Recuperar el contenedor previo
docker rename catalogo-muebles-staging-previous catalogo-muebles-staging
docker start catalogo-muebles-staging
curl -i http://127.0.0.1:8080/health
```

La respuesta `HTTP/1.1 200 OK` confirma que el contenedor recuperado responde. Para demostrar que se volvió a la versión anterior, se compara también el campo `version` del JSON con la evidencia inicial y la etiqueta de la imagen.

![imagen](img/image%20copy%2031.png)

![imagen](img/image%20copy%2030.png)

### 12.4. Alternativa: rollback con un SHA publicado en Docker Hub

Este método se utiliza **en lugar del punto 12.3** si el contenedor `-previous` no está disponible. Se toma como ejemplo el SHA de la imagen original registrada en la ejecución de GitHub Actions:

```bash
IMAGE='kafciel/catalogo-muebles-ci:8fe44faabd00934b765d544beb0809f767ab5043'
docker pull "$IMAGE"
```

Antes de reemplazar nada, se valida la imagen en un contenedor temporal que utiliza datos independientes:

```bash
docker rm -f catalogo-muebles-rollback-test 2>/dev/null || true
docker run -d --name catalogo-muebles-rollback-test \
  --tmpfs /data:rw,uid=1000,gid=1000 \
  --tmpfs /app/uploads:rw,uid=1000,gid=1000 \
  -e DB_FILE=/data/catalogo.db \
  -p 127.0.0.1:13082:3000 "$IMAGE"
curl -i http://127.0.0.1:13082/health
docker rm -f catalogo-muebles-rollback-test
```

**Solo si el health check de la imagen anterior responde correctamente** y el nombre de respaldo está libre, se sustituye el contenedor activo de staging:

```bash
# Conservar la versión actual
docker stop catalogo-muebles-staging
docker rename catalogo-muebles-staging catalogo-muebles-staging-pre-rollback

# Ejecutar la versión histórica con los volúmenes persistentes de staging
docker run -d --name catalogo-muebles-staging \
  --restart unless-stopped \
  -p 8080:3000 \
  -e DB_FILE=/data/catalogo.db \
  --mount type=volume,source=catalogo_staging_data,target=/data \
  --mount type=volume,source=catalogo_staging_uploads,target=/app/uploads \
  "$IMAGE"
curl -i http://127.0.0.1:8080/health
```

**Precaución:** antes de un rollback que involucre migraciones incompatibles de SQLite, se debe respaldar la base de datos. Cambiar la imagen no revierte los datos. En ningún caso ejecutar `docker volume rm` ni `docker system prune --volumes`.

### 12.5. Comprobar el rollback desde Windows y restaurar la versión actual

Desde el navegador o Git Bash de Windows se consulta:

```bash
curl -i http://3.149.100.192:8080/health
curl -i http://3.149.100.192/health
```

Se verifica que **staging** responda con la versión recuperada y que **production** siga operativo. Para dejar el laboratorio como estaba antes de la prueba, se regresa a la sesión SSH de EC2 y se restaura el contenedor original que se guardó en `-pre-rollback`:

```bash
# Recuperar la versión que estaba activa antes de la demostración
docker rm -f catalogo-muebles-staging
docker rename catalogo-muebles-staging-pre-rollback catalogo-muebles-staging
docker start catalogo-muebles-staging
curl -i http://127.0.0.1:8080/health
```

El resultado final debe corresponder a la versión inicial registrada en 12.1. Se conserva la persistencia de SQLite y de las imágenes mediante los volúmenes Docker. **Estos pasos son una guía de ejecución; las capturas y resultados de rollback deben añadirse solo después de realizar la prueba.**

**Evidencia:** 
![imagen](img/image%20copy%2030.png)


## 13. Reflexión sobre las ventajas de los contenedores y el despliegue continuo

La implementación del Laboratorio 5.2 permitió comprender la importancia de utilizar contenedores Docker y procesos de CI/CD para mejorar la administración y publicación de aplicaciones en entornos reales.

**Una de las principales ventajas de Docker es la portabilidad de las aplicaciones.** Al empaquetar la API REST junto con sus dependencias y configuraciones, se obtiene una imagen que puede ejecutarse de manera consistente en distintos servidores compatibles. Esto reduce los problemas relacionados con diferencias entre los entornos de desarrollo y producción.

Asimismo, el uso de un `Dockerfile` multi-stage permite optimizar la imagen final, separando las herramientas necesarias para la construcción de aquellas que se requieren durante la ejecución. Esta práctica contribuye a reducir el tamaño de la imagen y la cantidad de componentes innecesarios presentes en producción.

Por otra parte, **el despliegue continuo automatiza la publicación de nuevas versiones de software**. Mediante GitHub Actions, cada cambio integrado en la rama `main` pasa por las etapas de verificación del código, construcción de la imagen, publicación en Docker Hub y despliegue remoto. Esto disminuye las tareas manuales, mejora la repetibilidad del proceso y reduce la posibilidad de errores durante las actualizaciones.

La separación entre los entornos `staging` y `production` representa otra ventaja importante. Permite comprobar el funcionamiento de una nueva versión antes de publicarla en el entorno principal, reduciendo el riesgo de afectar a los usuarios finales.

En materia de seguridad, la incorporación de Trivy permite identificar vulnerabilidades conocidas en las imágenes Docker. Durante la práctica se detectaron **10 vulnerabilidades de severidad alta (HIGH) y 0 críticas (CRITICAL)**, demostrando la importancia de mantener actualizadas las dependencias y revisar los componentes utilizados antes de desplegar una aplicación. Debido a que el análisis se configuró en modo informativo, los hallazgos no bloquearon automáticamente el despliegue.

Finalmente, el etiquetado de imágenes mediante el SHA de cada commit facilita la trazabilidad de las versiones y permite recuperar una imagen anterior mediante un procedimiento de rollback. Junto con los volúmenes persistentes de Docker, esta estrategia contribuye a mantener la continuidad del servicio y conservar los datos de la aplicación durante las actualizaciones.

---

## 14. Conclusión

El Laboratorio 5.2 permitió ampliar la Integración Continua desarrollada en el Laboratorio 5.1 mediante la implementación de un pipeline completo de **Integración Continua y Despliegue Continuo (CI/CD)** para la API REST del catálogo de muebles.

Se integraron **GitHub Actions, Docker Hub, Trivy y Amazon EC2** para automatizar la validación del código, la construcción de imágenes, el análisis de seguridad y el despliegue en los entornos `staging` y `production`.

Las verificaciones realizadas confirmaron el funcionamiento de la API en ambos entornos mediante respuestas **HTTP 200 OK**:

- **Staging:** [http://3.149.100.192:8080/health](http://3.149.100.192:8080/health)
- **Producción:** [http://3.149.100.192/health](http://3.149.100.192/health)

Asimismo, el uso de imágenes etiquetadas por SHA, comprobaciones de salud y volúmenes persistentes proporciona mecanismos para realizar actualizaciones controladas y facilitar la recuperación de versiones anteriores.

**En conclusión, la contenerización y el despliegue continuo representan herramientas fundamentales para el desarrollo de software moderno**, ya que mejoran la portabilidad, la automatización, la trazabilidad y la confiabilidad de las entregas. Su aplicación en proyectos reales permite reducir tiempos de publicación, estandarizar procesos y administrar de manera más eficiente el ciclo de vida de las aplicaciones.

Como mejoras futuras, se considera la implementación de certificados TLS para HTTPS, políticas de seguridad más estrictas, copias de seguridad automatizadas y controles de vulnerabilidades que bloqueen despliegues cuando se detecten riesgos críticos.
