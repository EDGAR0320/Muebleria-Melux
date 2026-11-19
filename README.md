# Catálogo de Muebles — CI/CD con GitHub Actions y Docker

API REST (Node.js + Express + SQLite) para gestionar un catálogo de muebles con imágenes. Incluye integración continua (linting, pruebas, cobertura y matriz de Node.js 22/24) y despliegue continuo con Docker Hub, Trivy y Amazon EC2.

## Ejecución local

```bash
npm ci
npm start          # http://localhost:3000
npm test
npm run lint
```

## Aplicación desplegada en AWS EC2

| Entorno | URL pública | Puerto |
|---|---|---|
| **Producción** | [Ver API en producción](http://3.149.100.192/health) | 80 |
| **Staging** | [Ver API de pruebas](http://3.149.100.192:8080/health) | 8080 |

La ruta `/health` devuelve el estado de la API. El endpoint `/muebles` permite consultar el catálogo.

**Imagen Docker:** [kafciel/catalogo-muebles-ci](https://hub.docker.com/r/kafciel/catalogo-muebles-ci)

**Repositorio:** [EDGAR0320/Muebleria-Melux](https://github.com/EDGAR0320/Muebleria-Melux)

## Documentación del Laboratorio

Los informes incluyen procedimientos, código y evidencias de GitHub Actions, Docker Hub, Trivy y AWS EC2.

- [Ver informe del Laboratorio 5.1](./INFORME.md)
- [Ver informe del Laboratorio 5.2](./INFORME5.2.md)

**Workflow CI/CD:** [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)
