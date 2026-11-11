const { createDb } = require('./db');
const { createApp } = require('./app');

const PORT = process.env.PORT || 3000;
const app = createApp(createDb());

app.listen(PORT, () => {
  console.log(`Catalogo de muebles escuchando en el puerto ${PORT}`);
});
