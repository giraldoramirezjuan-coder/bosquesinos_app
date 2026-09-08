const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());         
app.use(express.json()); 
app.use(express.static(__dirname));

// --- 1. CONEXIÓN A BASE DE DATOS ---
const uri = 'mongodb+srv://erbmondt_db_user:wisLulWsZAX3XrRy@cluster0.nruxsel.mongodb.net/?appName=Cluster0';

mongoose.connect(uri)
  .then(() => {
    console.log('¡Conexión a MongoDB Atlas exitosa!');
    crearUsuarioAdmin(); // <-- Llama a la función que crea tu cuenta maestra
  })
  .catch(err => console.error('Error conectando a la base de datos:', err));

// --- 2. MODELOS DE DATOS ---
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    rol: { type: String, default: 'Admin' }
});
const User = mongoose.model('User', userSchema);

const plantulaSchema = new mongoose.Schema({
  especie: String,
  nombreCientifico: String,
  caracteristicas: String,
  imagenUrl: String,
  cantidad: Number,
  estado: { type: String, enum: ['Germinación', 'Vivero', 'Lista'] }
});
const Plantula = mongoose.model('Plantula', plantulaSchema);

// --- 3. AUTO-CREACIÓN DE TU USUARIO ---
async function crearUsuarioAdmin() {
  try {
    const usuarioExiste = await User.findOne({ email: 'bosquesinos' });
    if (!usuarioExiste) {
      const nuevoUsuario = new User({ email: 'bosquesinojuan', password: 'bosquesinas', rol: 'Admin' });
      await nuevoUsuario.save();
      console.log('✅ Usuario administrador creado: bosquesinojuan');
    } else {
      console.log('✅ El usuario administrador ya está listo en la base de datos.');
    }
  } catch (error) {
    console.log('Error al verificar el usuario:', error);
  }
}

// --- 4. RUTAS DE AUTENTICACIÓN Y CATÁLOGO ---
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const usuario = await User.findOne({ email, password });
        if (!usuario) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }
        res.json({ mensaje: '¡Bienvenido al sistema!', rol: usuario.rol });
    } catch (error) {
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

app.post('/api/plantulas', async (req, res) => {
  try {
    const nuevaPlantula = new Plantula(req.body); 
    await nuevaPlantula.save();
    res.status(201).json({ mensaje: 'Plántula registrada' });
  } catch (error) {
    res.status(400).json({ error: 'Error al registrar' });
  }
});

app.get('/api/plantulas', async (req, res) => {
  try {
    const inventario = await Plantula.find();
    res.json(inventario);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener catálogo' });
  }
});

app.post('/api/plantulas/retirar', async (req, res) => {
  try {
    const { id, cantidadRetirar } = req.body;
    const plantula = await Plantula.findById(id);

    if (!plantula) return res.status(404).json({ error: 'Plántula no encontrada' });

    plantula.cantidad -= Number(cantidadRetirar);
    const fechaSalida = new Date().toLocaleString();

    if (plantula.cantidad <= 0) {
      await Plantula.findByIdAndDelete(id);
      console.log(`[LOG] - Retiro: ${cantidadRetirar} | Fecha: ${fechaSalida} | Stock agotado (Registro eliminado).`);
      res.json({ mensaje: 'Stock agotado. Espacio liberado.' });
    } else {
      await plantula.save();
      console.log(`[LOG] - Retiro: ${cantidadRetirar} | Fecha: ${fechaSalida} | Quedan: ${plantula.cantidad}.`);
      res.json({ mensaje: 'Inventario actualizado.' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error al procesar salida' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// --- 5. INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor en línea en el puerto ${PORT}`);
});
