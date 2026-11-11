const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];

function parsear(body) {
  const nombre = String(body.nombre ?? '').trim();
  const categoria = String(body.categoria ?? '').trim();
  const precio = body.precio === undefined || body.precio === '' ? NaN : Number(body.precio);
  const stock = body.stock === undefined || body.stock === '' ? 0 : Number(body.stock);

  const errores = [];
  if (!nombre) errores.push('nombre es requerido');
  if (!categoria) errores.push('categoria es requerida');
  if (!Number.isFinite(precio) || precio < 0) errores.push('precio debe ser un numero mayor o igual a 0');
  if (!Number.isInteger(stock) || stock < 0) errores.push('stock debe ser un entero mayor o igual a 0');

  return { datos: { nombre, categoria, precio, stock }, errores };
}

function createApp(db, uploadDir = path.join(__dirname, '..', 'uploads')) {
  fs.mkdirSync(uploadDir, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
      },
    }),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (TIPOS_PERMITIDOS.includes(file.mimetype)) return cb(null, true);
      cb(new Error('Solo se permiten imagenes JPG, PNG o WEBP'));
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/uploads', express.static(uploadDir));

  // Ruta principal
  app.get('/', (req, res) => {
    res.json({
      mensaje: 'Bienvenido a la API de Muebleria Melux',
      estado: 'Servidor funcionando correctamente',
      rutas: {
        salud: '/health',
        listarMuebles: '/muebles',
        buscarMueble: '/muebles/:id'
      }
    });
  });

  const conUrl = (fila) =>
    fila && { ...fila, imagen_url: fila.imagen ? `/uploads/${fila.imagen}` : null };
  const buscar = (id) => conUrl(db.prepare('SELECT * FROM muebles WHERE id = ?').get(id));
  const borrarImagen = (archivo) => {
    if (archivo) fs.rmSync(path.join(uploadDir, archivo), { force: true });
  };

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // CREATE
  app.post('/muebles', upload.single('imagen'), (req, res) => {
    const { datos, errores } = parsear(req.body || {});
    if (errores.length) {
      if (req.file) borrarImagen(req.file.filename);
      return res.status(400).json({ errores });
    }
    const imagen = req.file ? req.file.filename : null;
    const info = db
      .prepare('INSERT INTO muebles (nombre, categoria, precio, stock, imagen) VALUES (?, ?, ?, ?, ?)')
      .run(datos.nombre, datos.categoria, datos.precio, datos.stock, imagen);
    res.status(201).json(buscar(info.lastInsertRowid));
  });

  // READ (todos)
  app.get('/muebles', (req, res) => {
    const { categoria } = req.query;
    const filas = categoria
      ? db.prepare('SELECT * FROM muebles WHERE categoria = ? ORDER BY id').all(categoria)
      : db.prepare('SELECT * FROM muebles ORDER BY id').all();
    res.json(filas.map(conUrl));
  });

  // READ (uno)
  app.get('/muebles/:id', (req, res) => {
    const mueble = buscar(req.params.id);
    if (!mueble) return res.status(404).json({ error: 'Mueble no encontrado' });
    res.json(mueble);
  });

  // UPDATE
  app.put('/muebles/:id', upload.single('imagen'), (req, res) => {
    const actual = buscar(req.params.id);
    if (!actual) {
      if (req.file) borrarImagen(req.file.filename);
      return res.status(404).json({ error: 'Mueble no encontrado' });
    }
    const { datos, errores } = parsear(req.body || {});
    if (errores.length) {
      if (req.file) borrarImagen(req.file.filename);
      return res.status(400).json({ errores });
    }
    const imagen = req.file ? req.file.filename : actual.imagen;
    db.prepare('UPDATE muebles SET nombre = ?, categoria = ?, precio = ?, stock = ?, imagen = ? WHERE id = ?')
      .run(datos.nombre, datos.categoria, datos.precio, datos.stock, imagen, req.params.id);
    if (req.file) borrarImagen(actual.imagen);
    res.json(buscar(req.params.id));
  });

  // DELETE
  app.delete('/muebles/:id', (req, res) => {
    const actual = buscar(req.params.id);
    if (!actual) return res.status(404).json({ error: 'Mueble no encontrado' });
    db.prepare('DELETE FROM muebles WHERE id = ?').run(req.params.id);
    borrarImagen(actual.imagen);
    res.json({ mensaje: 'Mueble eliminado' });
  });

  // Manejo de errores (incluye los de multer)
  app.use((err, req, res, _next) => {
    if (err instanceof multer.MulterError || err.message.startsWith('Solo se permiten')) {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  });

  return app;
}

module.exports = { createApp };
