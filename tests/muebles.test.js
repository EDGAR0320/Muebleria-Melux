const request = require('supertest');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDb } = require('../src/db');
const { createApp } = require('../src/app');

let db;
let app;
let uploadDir;

const PNG = Buffer.from('imagen-falsa-para-pruebas');

function crearMueble(datos = {}, conImagen = false) {
  const base = { nombre: 'Silla Nordica', categoria: 'Sillas', precio: '350.5', stock: '4', ...datos };
  let req = request(app).post('/muebles');
  Object.entries(base).forEach(([k, v]) => {
    req = req.field(k, v);
  });
  if (conImagen) req = req.attach('imagen', PNG, { filename: 'silla.png', contentType: 'image/png' });
  return req;
}

beforeEach(() => {
  db = createDb(':memory:');
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'muebles-'));
  app = createApp(db, uploadDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

describe('Catalogo de muebles - API', () => {
  test('GET /health debe retornar status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('POST /muebles crea un mueble sin imagen', async () => {
    const res = await crearMueble();
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ id: 1, nombre: 'Silla Nordica', precio: 350.5, stock: 4, imagen_url: null });
  });

  test('POST /muebles guarda la imagen en disco', async () => {
    const res = await crearMueble({}, true);
    expect(res.statusCode).toBe(201);
    expect(res.body.imagen_url).toMatch(/^\/uploads\/.+\.png$/);
    expect(fs.existsSync(path.join(uploadDir, res.body.imagen))).toBe(true);
    const img = await request(app).get(res.body.imagen_url);
    expect(img.statusCode).toBe(200);
  });

  test('POST /muebles rechaza datos invalidos', async () => {
    const res = await crearMueble({ nombre: '', precio: '-5' });
    expect(res.statusCode).toBe(400);
    expect(res.body.errores.length).toBe(2);
  });

  test('POST /muebles rechaza archivos que no son imagen', async () => {
    const res = await request(app)
      .post('/muebles')
      .field('nombre', 'Mesa')
      .field('categoria', 'Mesas')
      .field('precio', '100')
      .attach('imagen', Buffer.from('hola'), { filename: 'nota.txt', contentType: 'text/plain' });
    expect(res.statusCode).toBe(400);
    expect(fs.readdirSync(uploadDir).length).toBe(0);
  });

  test('POST /muebles borra la imagen si los datos son invalidos', async () => {
    const res = await crearMueble({ precio: 'abc' }, true);
    expect(res.statusCode).toBe(400);
    expect(fs.readdirSync(uploadDir).length).toBe(0);
  });

  test('GET /muebles lista y filtra por categoria', async () => {
    await crearMueble();
    await crearMueble({ nombre: 'Mesa Roble', categoria: 'Mesas', precio: '900' });
    const todos = await request(app).get('/muebles');
    expect(todos.body.length).toBe(2);
    const mesas = await request(app).get('/muebles?categoria=Mesas');
    expect(mesas.body.length).toBe(1);
    expect(mesas.body[0].nombre).toBe('Mesa Roble');
  });

  // ADICION PRUEBA DE ERROR INTENCIONAL: el test de filtrado por precio maximo tiene un error en la expectativa de cantidad de resultados
    test('GET /muebles?precio_max filtra por precio maximo', async () => {
    await crearMueble({ nombre: 'Silla', precio: '200' });
    await crearMueble({ nombre: 'Sofa', categoria: 'Sofas', precio: '1500' });
    await crearMueble({ nombre: 'Mesa', categoria: 'Mesas', precio: '450' });
    const res = await request(app).get('/muebles?precio_max=500');
    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBe(3); // ERROR INTENCIONAL: el valor correcto es 2
    const invalido = await request(app).get('/muebles?precio_max=abc');
    expect(invalido.statusCode).toBe(400);
  });

  test('GET /muebles/:id retorna el mueble o 404', async () => {
    await crearMueble();
    const ok = await request(app).get('/muebles/1');
    expect(ok.statusCode).toBe(200);
    expect(ok.body.nombre).toBe('Silla Nordica');
    const no = await request(app).get('/muebles/99');
    expect(no.statusCode).toBe(404);
  });

  test('PUT /muebles/:id actualiza los datos', async () => {
    await crearMueble();
    const res = await request(app)
      .put('/muebles/1')
      .send({ nombre: 'Silla Premium', categoria: 'Sillas', precio: 420, stock: 10 });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ nombre: 'Silla Premium', precio: 420, stock: 10 });
  });

  test('PUT /muebles/:id reemplaza la imagen anterior', async () => {
    const creado = await crearMueble({}, true);
    const res = await request(app)
      .put('/muebles/1')
      .field('nombre', 'Silla Nordica')
      .field('categoria', 'Sillas')
      .field('precio', '350.5')
      .attach('imagen', PNG, { filename: 'nueva.png', contentType: 'image/png' });
    expect(res.statusCode).toBe(200);
    expect(res.body.imagen).not.toBe(creado.body.imagen);
    expect(fs.existsSync(path.join(uploadDir, creado.body.imagen))).toBe(false);
    expect(fs.readdirSync(uploadDir).length).toBe(1);
  });

  test('PUT /muebles/:id valida datos y existencia', async () => {
    await crearMueble();
    const invalido = await request(app).put('/muebles/1').send({ nombre: '' });
    expect(invalido.statusCode).toBe(400);
    const noExiste = await request(app)
      .put('/muebles/99')
      .send({ nombre: 'X', categoria: 'Y', precio: 1 });
    expect(noExiste.statusCode).toBe(404);
  });

  test('DELETE /muebles/:id elimina el registro y su imagen', async () => {
    const creado = await crearMueble({}, true);
    const res = await request(app).delete('/muebles/1');
    expect(res.statusCode).toBe(200);
    expect(fs.existsSync(path.join(uploadDir, creado.body.imagen))).toBe(false);
    const otra = await request(app).delete('/muebles/1');
    expect(otra.statusCode).toBe(404);
  });
});
