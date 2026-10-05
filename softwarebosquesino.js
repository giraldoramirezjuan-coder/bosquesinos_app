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
    crearEntornoBase(); // Modificado para crear el vivero principal
  })
  .catch(err => console.error('Error conectando a la base de datos:', err));

// --- 2. MODELOS DE DATOS (VERSIÓN 3.0 - MULTI-VIVERO) ---

// 2.0 Esquema de Viveros (¡NUEVO!)
const viveroSchema = new mongoose.Schema({
    nombre: { type: String, required: true, unique: true }, // Ej: Vivero San Luis Principal
    ubicacion: { type: String, default: 'San Luis, Antioquia' },
    fechaRegistro: { type: Date, default: Date.now }
});
const Vivero = mongoose.model('Vivero', viveroSchema);

// 2.1 Usuarios (Ahora pertenecen a un vivero)
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    rol: { type: String, default: 'Operario' }, // Admin, Coordinador, Operario
    viveroId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vivero', required: true } // ¡NUEVO! Conexión al vivero
});
const User = mongoose.model('User', userSchema);

// 2.2 Catálogo Botánico (Con reconocimiento de saberes individuales)
const especieSchema = new mongoose.Schema({
    nombreComun: { type: String, required: true, unique: true },
    nombreCientifico: { type: String, default: '' },
    caracteristicas: { type: String, default: '' },
    imagenUrl: { type: String, default: '' },
    
    // Convertimos el saber en una lista para que cada bosquesino firme su aporte
    saberes: [{
        descripcion: { type: String, required: true },
        autor: { type: String, required: true }, // Ej: "Juan Manuel - Tratamiento pre-germinativo"
        fechaAporte: { type: Date, default: Date.now }
    }],
    
    fechaRegistro: { type: Date, default: Date.now }
});
const Especie = mongoose.model('Especie', especieSchema);

// 2.3 Árboles Matriz (Ahora pertenecen a un vivero específico)
const arbolMatrizSchema = new mongoose.Schema({
    codigoArbol: { type: String, required: true, unique: true }, 
    especieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Especie', required: true },
    viveroId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vivero', required: true }, // ¡NUEVO!
    finca: { type: String, required: true },
    custodio: { type: String, required: true },
    fechaSeleccion: { type: Date, default: Date.now },
    coordenadasGPS: { type: String, default: '' },
    monitoreos: [{
        fechaObservacion: { type: Date, default: Date.now },
        estadoFenologico: { 
            type: String, 
            enum: ['Vegetativo', 'Botón floral', 'Floración abierta', 'Fructificación inmadura', 'Semillando'],
            required: true
        },
        observaciones: { type: String },
        fotoUrl: { type: String },
        registrador: { type: String } 
    }]
});
const ArbolMatriz = mongoose.model('ArbolMatriz', arbolMatrizSchema);

// 2.4 Motor de Trazabilidad (Lotes por vivero)
const loteSchema = new mongoose.Schema({
    codigoLote: { type: String, required: true, unique: true }, 
    especieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Especie', required: true },
    viveroId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vivero', required: true }, // ¡NUEVO!
    
    origen: {
        arbolMatrizId: { type: mongoose.Schema.Types.ObjectId, ref: 'ArbolMatriz', required: true },
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

// --- 3. AUTO-CREACIÓN DE ENTORNO BASE ---
async function crearEntornoBase() {
  try {
    // 1. Verificar si existe el Vivero Principal
    let viveroPrincipal = await Vivero.findOne({ nombre: 'Vivero Bosquesinos Central' });
    if (!viveroPrincipal) {
        viveroPrincipal = new Vivero({ nombre: 'Vivero Bosquesinos Central' });
        await viveroPrincipal.save();
        console.log('✅ Vivero central creado.');
    }

    // 2. Verificar si existe tu usuario Admin
    const usuarioExiste = await User.findOne({ email: 'bosquesinos' });
    if (!usuarioExiste) {
      const passwordEncriptada = await bcrypt.hash('bosquesinas', 10);
      const nuevoUsuario = new User({ 
          email: 'bosquesinos', 
          password: passwordEncriptada, 
          rol: 'Admin',
          viveroId: viveroPrincipal._id // Asignamos el admin al vivero central
      });
      await nuevoUsuario.save();
      console.log('✅ Usuario base creado y vinculado al vivero.');
    } else {
      console.log('✅ Entorno base listo.');
    }
  } catch (error) {
    console.log('Error en la configuración inicial:', error);
  }
}

// --- MIDDLEWARE DE SEGURIDAD (AHORA IDENTIFICA EL VIVERO) ---
function verificarAcceso(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: 'Acceso denegado, falta tu credencial' });

    try {
        const tokenLimpio = token.replace('Bearer ', '');
        const decodificado = jwt.verify(tokenLimpio, process.env.JWT_SECRET);
        
        req.usuarioActual = decodificado.email; 
        req.rol = decodificado.rol;
        req.viveroId = decodificado.viveroId; // ¡NUEVO! Extraemos el vivero del token
        next(); 
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
}

// --- 4. RUTAS DE AUTENTICACIÓN ---
// Registrar un asociado A TU VIVERO
app.post('/api/registrar-asociado', verificarAcceso, async (req, res) => {
    try {
        const email = String(req.body.email);
        const passwordPlana = String(req.body.password);
        const passwordEncriptada = await bcrypt.hash(passwordPlana, 10);
        
        const nuevoAsociado = new User({ 
            email: email, 
            password: passwordEncriptada, 
            rol: 'Operario',
            viveroId: req.viveroId // Se registra en el mismo vivero de quien lo invita
        });
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

        // Inyectamos el viveroId en el token
        const token = jwt.sign({ 
            id: usuario._id, 
            email: usuario.email, 
            rol: usuario.rol,
            viveroId: usuario.viveroId
        }, process.env.JWT_SECRET, { expiresIn: '8h' });
        
        res.json({ mensaje: '¡Bienvenido al sistema!', token: token, rol: usuario.rol });
    } catch (error) { 
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// --- RUTAS DE ÁRBOLES MATRIZ ---
app.get('/api/arboles-matriz', verificarAcceso, async (req, res) => {
    try {
        // ¡FILTRO MAGICO! Solo trae los árboles de SU vivero
        const arboles = await ArbolMatriz.find({ viveroId: req.viveroId }).populate('especieId');
        res.json(arboles);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar los árboles matriz' });
    }
});

app.post('/api/arboles-matriz', verificarAcceso, async (req, res) => {
    try {
        const datos = { ...req.body, viveroId: req.viveroId }; // Le pegamos la etiqueta del vivero
        const nuevoArbol = new ArbolMatriz(datos);
        await nuevoArbol.save();
        res.status(201).json({ mensaje: `Árbol matriz ${nuevoArbol.codigoArbol} registrado.` });
    } catch (error) {
        res.status(400).json({ error: 'Error al registrar el árbol. Verifica el código.' });
    }
});

// --- 5. RUTAS DE ESPECIES (CATÁLOGO GLOBAL) ---
// Las especies no se filtran por vivero porque el saber es compartido
app.get('/api/especies', verificarAcceso, async (req, res) => {
  try {
    const especies = await Especie.find();
    res.json(especies);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener especies' });
  }
});

app.post('/api/especies', verificarAcceso, async (req, res) => {
  try {
    const nuevaEspecie = new Especie(req.body); 
    await nuevaEspecie.save();
    res.status(201).json({ mensaje: 'Especie registrada en el catálogo botánico' });
  } catch (error) {
    res.status(400).json({ error: 'Error al registrar especie.' });
  }
});

// Actualizar descripción botánica y agregar un nuevo saber (PROTEGIDA)
app.put('/api/especies/:id', verificarAcceso, async (req, res) => {
    try {
        const { id } = req.params;
        const { caracteristicas, nuevoSaber } = req.body;

        const especie = await Especie.findById(id);
        if (!especie) return res.status(404).json({ error: 'Especie no encontrada' });

        // Actualizamos las características generales
        if (caracteristicas) especie.caracteristicas = caracteristicas;

        // Si el frontend nos mandó un nuevo saber firmado, lo empujamos a la lista
        if (nuevoSaber && nuevoSaber.autor && nuevoSaber.descripcion) {
            especie.saberes.push({
                autor: nuevoSaber.autor,
                descripcion: nuevoSaber.descripcion,
                fechaAporte: new Date()
            });
        }

        await especie.save();
        res.json({ mensaje: 'Ficha botánica actualizada', especie });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar la especie' });
    }
});

// --- 6. RUTAS DE LOTES (TRAZABILIDAD) ---
app.get('/api/lotes', verificarAcceso, async (req, res) => {
  try {
    // Solo trae los lotes del vivero del usuario que pregunta
    const lotes = await Lote.find({ viveroId: req.viveroId }).populate('especieId');
    res.json(lotes);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener los lotes' });
  }
});

app.post('/api/lotes', verificarAcceso, async (req, res) => {
  try {
    const { especieId, origen, cantidadInicial } = req.body;
    
    const sufijoAleatorio = Math.random().toString(36).substring(2, 6).toUpperCase();
    const codigoLote = `BQ-${new Date().getMonth()+1}${new Date().getFullYear().toString().slice(-2)}-${sufijoAleatorio}`;

    const nuevoLote = new Lote({
        codigoLote,
        especieId,
        viveroId: req.viveroId, // Asignado automáticamente
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
    res.status(201).json({ mensaje: `Lote ${codigoLote} registrado.`, lote: nuevoLote });
  } catch (error) {
    res.status(400).json({ error: 'Error al crear el lote de semillas' });
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