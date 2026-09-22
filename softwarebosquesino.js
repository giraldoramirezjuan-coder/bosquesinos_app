const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken'); // Importado al inicio por orden
const bcrypt = require('bcrypt');    // Importado al inicio por orden

const app = express();
app.use(cors());         
app.use(express.json()); 
app.use(express.static(__dirname));

// --- 1. CONEXIÓN A BASE DE DATOS ---
const uri = process.env.MONGO_URI;
  
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

// --- 3. AUTO-CREACIÓN DE TU USUARIO (BLINDADA) ---
async function crearUsuarioAdmin() {
  try {
    const usuarioExiste = await User.findOne({ email: 'bosquesinojuan' });
    if (!usuarioExiste) {
      // IMPORTANTE: Cambia 'tu_nueva_clave_secreta' por la contraseña que quieras usar
      const passwordEncriptada = await bcrypt.hash('superbosquesinos', 10);
      
      const nuevoUsuario = new User({ 
        email: 'bosquesinojuan', 
        password: passwordEncriptada, 
        rol: 'Admin' 
      });
      await nuevoUsuario.save();
      console.log('✅ Usuario administrador creado de forma segura');
    }
  } catch (error) {
    console.log('Error al verificar el usuario:', error);
  }
}

// --- MIDDLEWARE DE SEGURIDAD ("EL PORTERO") ---
function verificarAdmin(req, res, next) {
    const token = req.headers['authorization'];
    
    if (!token) {
        return res.status(403).json({ error: 'Acceso denegado, falta tu credencial' });
    }

    try {
        const tokenLimpio = token.replace('Bearer ', '');
        const decodificado = jwt.verify(tokenLimpio, process.env.JWT_SECRET);
        
        if (decodificado.rol !== 'Admin') {
            return res.status(403).json({ error: 'No tienes permisos de Administrador' });
        }

        next(); 
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
}

// --- 4. RUTAS DE AUTENTICACIÓN Y GESTIÓN DE USUARIOS ---

// Registro de asociados (Protegido por verificarAdmin y con contraseña cifrada)
app.post('/api/registrar-asociado', verificarAdmin, async (req, res) => {
    try {
        const email = String(req.body.email);
        const passwordPlana = String(req.body.password);
        
        const passwordEncriptada = await bcrypt.hash(passwordPlana, 10);
        
        const nuevoAsociado = new User({ 
            email: email, 
            password: passwordEncriptada, 
            rol: 'Asociado' 
        });
        
        await nuevoAsociado.save();
        res.status(201).json({ mensaje: '¡Nuevo asociado registrado con éxito!' });
    } catch (error) {
        res.status(400).json({ error: 'El usuario ya existe o faltan datos.' });
    }
});

// Login (Blindado contra inyección NoSQL y emitiendo Token JWT)
app.post('/api/login', async (req, res) => {
    try {
        const email = String(req.body.email);
        const passwordPlana = String(req.body.password);

        const usuario = await User.findOne({ email: email });
        
        if (!usuario) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        const claveValida = await bcrypt.compare(passwordPlana, usuario.password);
        
        if (!claveValida) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        const token = jwt.sign(
            { id: usuario._id, email: usuario.email, rol: usuario.rol }, 
            process.env.JWT_SECRET, 
            { expiresIn: '2h' }     
        );

        res.json({ 
            mensaje: '¡Bienvenido al sistema!', 
            token: token, 
            rol: usuario.rol 
        });

    } catch (error) { 
        res.status(500).json({ error: 'Error en el servidor' });
    }
});


// --- 5. RUTAS DEL INVENTARIO (PLÁNTULAS) ---

// Obtener catálogo (PÚBLICA - No lleva verificarAdmin porque cualquiera puede ver el catálogo)
app.get('/api/plantulas', async (req, res) => {
  try {
    const inventario = await Plantula.find();
    res.json(inventario);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener catálogo' });
  }
});

// Crear plántula (PROTEGIDA)
app.post('/api/plantulas', verificarAdmin, async (req, res) => {
  try {
    const nuevaPlantula = new Plantula(req.body); 
    await nuevaPlantula.save();
    res.status(201).json({ mensaje: 'Plántula registrada' });
  } catch (error) {
    res.status(400).json({ error: 'Error al registrar' });
  }
});

// Retirar stock de plántula (PROTEGIDA)
app.post('/api/plantulas/retirar', verificarAdmin, async (req, res) => {
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

// Editar plántula (PROTEGIDA)
app.put('/api/plantulas/:id', verificarAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const datosActualizados = req.body;
    
    const plantula = await Plantula.findByIdAndUpdate(id, datosActualizados, { new: true });
    
    if (!plantula) return res.status(404).json({ error: 'Plántula no encontrada' });
    res.json({ mensaje: 'Inventario actualizado correctamente', plantula });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar la plántula' });
  }
});


// --- 6. FRONTEND Y PUERTO ---
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor en línea en el puerto ${PORT}`);
});