const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken'); 
const bcrypt = require('bcrypt');    

const app = express();
app.use(cors());         
app.use(express.json()); 
app.use(express.static(__dirname));

// --- 1. CONEXIÓN A BASE DE DATOS ---
const uri = process.env.MONGO_URI;
  
mongoose.connect(uri)
  .then(() => {
    console.log('¡Conexión a MongoDB Atlas exitosa!');
    crearUsuarioAdmin(); 
  })
  .catch(err => console.error('Error conectando a la base de datos:', err));

// --- 2. MODELOS DE DATOS (VERSIÓN 2.0 - TRAZABILIDAD) ---
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    rol: { type: String, default: 'Admin' }
});
const User = mongoose.model('User', userSchema);

// 2.1 Catálogo Botánico (Especies)
const especieSchema = new mongoose.Schema({
    nombreComun: { type: String, required: true, unique: true },
    nombreCientifico: { type: String, default: '' },
    caracteristicas: { type: String, default: '' },
    imagenUrl: { type: String, default: '' },
    saberCampesino: { type: String, default: '' },
    fechaRegistro: { type: Date, default: Date.now }
});
const Especie = mongoose.model('Especie', especieSchema);

// 2.2 Motor de Trazabilidad (Lotes)
const loteSchema = new mongoose.Schema({
    codigoLote: { type: String, required: true, unique: true }, 
    especieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Especie', required: true },
    
    origen: {
        finca: { type: String, required: true },
        responsableRecoleccion: { type: String, required: true },
        arbolMadreInfo: { type: String, default: 'No especificado' },
        fechaRecoleccion: { type: Date, required: true }
    },
    
    cantidadInicial: { type: Number, required: true }, 
    cantidadActual: { type: Number, required: true },  
    estadoActual: { 
        type: String, 
        enum: ['Semillero', 'Germinación', 'Vivero', 'Crecimiento', 'Lista para transplante', 'Sembrada'],
        default: 'Semillero'
    },
    
    historial: [{
        fechaEvento: { type: Date, default: Date.now },
        estadoAlcanzado: { type: String },
        cantidadSuperviviente: { type: Number },
        observaciones: { type: String },
        responsable: { type: String } 
    }]
});
const Lote = mongoose.model('Lote', loteSchema);

// --- 3. AUTO-CREACIÓN DE TU USUARIO BASE ---
async function crearUsuarioAdmin() {
  try {
    const usuarioExiste = await User.findOne({ email: 'bosquesinos' });
    if (!usuarioExiste) {
      const passwordEncriptada = await bcrypt.hash('bosquesinas', 10);
      const nuevoUsuario = new User({ email: 'bosquesinos', password: passwordEncriptada, rol: 'Admin' });
      await nuevoUsuario.save();
      console.log('✅ Usuario base creado: bosquesinos');
    } else {
      console.log('✅ El usuario base ya está listo en la base de datos.');
    }
  } catch (error) {
    console.log('Error al verificar el usuario:', error);
  }
}

// --- MIDDLEWARE DE SEGURIDAD ---
function verificarAdmin(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: 'Acceso denegado, falta tu credencial' });

    try {
        const tokenLimpio = token.replace('Bearer ', '');
        const decodificado = jwt.verify(tokenLimpio, process.env.JWT_SECRET);
        
        if (decodificado.rol !== 'Admin' && decodificado.rol !== 'Asociado') {
            return res.status(403).json({ error: 'No tienes permisos en el sistema' });
        }
        req.usuarioActual = decodificado.email; // Guardamos quién hace la acción para el historial
        next(); 
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
}

// --- 4. RUTAS DE AUTENTICACIÓN ---
app.post('/api/registrar-asociado', verificarAdmin, async (req, res) => {
    try {
        const email = String(req.body.email);
        const passwordPlana = String(req.body.password);
        const passwordEncriptada = await bcrypt.hash(passwordPlana, 10);
        
        const nuevoAsociado = new User({ email: email, password: passwordEncriptada, rol: 'Asociado' });
        await nuevoAsociado.save();
        res.status(201).json({ mensaje: '¡Nuevo asociado registrado con éxito!' });
    } catch (error) {
        res.status(400).json({ error: 'El usuario ya existe o faltan datos.' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const usuario = await User.findOne({ email: String(req.body.email) });
        if (!usuario) return res.status(401).json({ error: 'Credenciales incorrectas' });

        const claveValida = await bcrypt.compare(String(req.body.password), usuario.password);
        if (!claveValida) return res.status(401).json({ error: 'Credenciales incorrectas' });

        const token = jwt.sign({ id: usuario._id, email: usuario.email, rol: usuario.rol }, process.env.JWT_SECRET, { expiresIn: '8h' });
        res.json({ mensaje: '¡Bienvenido al sistema!', token: token, rol: usuario.rol });
    } catch (error) { 
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// --- 5. RUTAS DE ESPECIES (CATÁLOGO) ---
app.get('/api/especies', async (req, res) => {
  try {
    const especies = await Especie.find();
    res.json(especies);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener especies' });
  }
});

app.post('/api/especies', verificarAdmin, async (req, res) => {
  try {
    const nuevaEspecie = new Especie(req.body); 
    await nuevaEspecie.save();
    res.status(201).json({ mensaje: 'Especie registrada en el catálogo botánico' });
  } catch (error) {
    res.status(400).json({ error: 'Error al registrar especie. Verifica que el nombre no esté repetido.' });
  }
});

// --- 6. RUTAS DE LOTES (TRAZABILIDAD) ---
app.get('/api/lotes', async (req, res) => {
  try {
    // populate() trae los datos de la especie conectada al lote
    const lotes = await Lote.find().populate('especieId');
    res.json(lotes);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener los lotes' });
  }
});

// Registrar una nueva recolección de semillas (Crear Lote)
app.post('/api/lotes', verificarAdmin, async (req, res) => {
  try {
    const { especieId, origen, cantidadInicial } = req.body;
    
    // Generar código único (Ej: BQ-1026-8A3F)
    const sufijoAleatorio = Math.random().toString(36).substring(2, 6).toUpperCase();
    const codigoLote = `BQ-${new Date().getMonth()+1}${new Date().getFullYear().toString().slice(-2)}-${sufijoAleatorio}`;

    const nuevoLote = new Lote({
        codigoLote,
        especieId,
        origen,
        cantidadInicial,
        cantidadActual: cantidadInicial,
        estadoActual: 'Semillero',
        historial: [{
            estadoAlcanzado: 'Recolección y Semillero',
            cantidadSuperviviente: cantidadInicial,
            observaciones: 'Lote inicial registrado en el sistema.',
            responsable: req.usuarioActual
        }]
    });

    await nuevoLote.save();
    res.status(201).json({ mensaje: `Lote ${codigoLote} registrado exitosamente.`, lote: nuevoLote });
  } catch (error) {
    res.status(400).json({ error: 'Error al crear el lote de semillas' });
  }
});

// Avanzar el lote a la siguiente etapa
app.post('/api/lotes/avanzar', verificarAdmin, async (req, res) => {
    try {
        const { loteId, nuevoEstado, cantidadSuperviviente, observaciones } = req.body;
        const lote = await Lote.findById(loteId);

        if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

        // Actualizamos el estado actual
        lote.estadoActual = nuevoEstado;
        lote.cantidadActual = cantidadSuperviviente;

        // Inyectamos el evento en la historia
        lote.historial.push({
            estadoAlcanzado: nuevoEstado,
            cantidadSuperviviente: cantidadSuperviviente,
            observaciones: observaciones || '',
            responsable: req.usuarioActual
        });

        await lote.save();
        res.json({ mensaje: `Lote avanzado a etapa: ${nuevoEstado}` });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar el historial del lote' });
    }
});


// --- 7. FRONTEND Y PUERTO ---
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor en línea en el puerto ${PORT}`);
});