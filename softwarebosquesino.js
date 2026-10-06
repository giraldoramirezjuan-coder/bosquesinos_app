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

// --- 2. MODELOS DE DATOS ---
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    rol: { type: String, default: 'Operario' }
});
const User = mongoose.model('User', userSchema);

const especieSchema = new mongoose.Schema({
    nombreComun: { type: String, required: true, unique: true },
    nombreCientifico: { type: String, default: '' },
    caracteristicas: { type: String, default: '' },
    imagenUrl: { type: String, default: '' },
    saberes: [{
        descripcion: { type: String, required: true },
        autor: { type: String, required: true }, 
        fechaAporte: { type: Date, default: Date.now }
    }],
    fechaRegistro: { type: Date, default: Date.now }
});
const Especie = mongoose.model('Especie', especieSchema);

// 2.3 Árboles Matriz (Bajo Protocolo de Ofuscación Geográfica Preventiva)
const arbolMatrizSchema = new mongoose.Schema({
    codigoArbol: { type: String, required: true, unique: true }, 
    especieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Especie', required: true },
    finca: { type: String, required: true },
    veredaSector: { type: String, required: true }, // Macrolocalización preventiva (sin GPS exacto)
    custodio: { type: String, required: true },     // Nombre del campesino/asociado custodio
    registradoPor: { type: String, required: true },// Correo del asociado en sesión
    fechaSeleccion: { type: Date, default: Date.now },
    monitoreos: [{
        fechaObservacion: { type: Date, default: Date.now },
        estadoFenologico: { type: String, required: true }, // Ej: Floración, Fructificación, Semilla madura
        observaciones: { type: String },
        registrador: { type: String }
    }]
});

const ArbolMatriz = mongoose.model('ArbolMatriz', arbolMatrizSchema);

// REEMPLAZA EL MODELO LOTE ACTUAL POR ESTE:
const loteSchema = new mongoose.Schema({
    codigoLote: { type: String, required: true, unique: true }, 
    especieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Especie', required: true },
    arbolMatrizId: { type: mongoose.Schema.Types.ObjectId, ref: 'ArbolMatriz', required: true }, // Vínculo directo de trazabilidad
    registradoPor: { type: String, required: true },
    origen: {
        fechaRecoleccion: { type: Date, required: true },
        responsableRecoleccion: { type: String, required: true } 
    },
    cantidadInicial: { type: Number, required: true }, 
    cantidadActual: { type: Number, required: true },  
    estadoActual: { type: String, default: 'Semillero' },
    historial: [{
        fechaEvento: { type: Date, default: Date.now },
        estadoAlcanzado: { type: String },
        cantidadSuperviviente: { type: Number },
        observaciones: { type: String },
        responsable: { type: String } 
    }]
});
const Lote = mongoose.model('Lote', loteSchema);

// REEMPLAZA LA RUTA POST /api/lotes POR ESTA:
app.post('/api/lotes', verificarAcceso, async (req, res) => {
    try {
        const { especieId, arbolMatrizId, origen, cantidadInicial } = req.body;
        const codigoLote = `BQ-${new Date().getMonth()+1}${new Date().getFullYear().toString().slice(-2)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    
        const nuevoLote = new Lote({
            codigoLote,
            especieId,
            arbolMatrizId,
            registradoPor: req.usuarioActual,
            origen,
            cantidadInicial,
            cantidadActual: cantidadInicial,
            estadoActual: 'Semillero',
            historial: [{
                estadoAlcanzado: 'Recolección',
                cantidadSuperviviente: cantidadInicial,
                observaciones: 'Ingreso al vivero tras cosecha',
                responsable: req.usuarioActual
            }]
        });
    
        await nuevoLote.save();
        res.status(201).json({ mensaje: `Lote ${codigoLote} registrado correctamente en semillero.` });
    } catch (error) {
        res.status(400).json({ error: 'Faltan datos requeridos o error al registrar el lote' });
    }
});

// --- 3. AUTO-CREACIÓN DE USUARIO BASE ---
async function crearUsuarioAdmin() {
  try {
    const usuarioExiste = await User.findOne({ email: 'bosquesinos' });
    if (!usuarioExiste) {
      const passwordEncriptada = await bcrypt.hash('bosquesinas', 10);
      const nuevoUsuario = new User({ email: 'bosquesinos', password: passwordEncriptada, rol: 'Admin' });
      await nuevoUsuario.save();
      console.log('✅ Usuario admin base creado.');
    }
  } catch (error) {
    console.log('Error inicial:', error);
  }
}

// --- MIDDLEWARE DE SEGURIDAD ---
function verificarAcceso(req, res, next) {
    const headerAuth = req.headers['authorization'];
    if (!headerAuth) return res.status(403).json({ error: 'Acceso denegado: falta token' });

    try {
        const tokenLimpio = headerAuth.replace('Bearer ', '').trim();
        const decodificado = jwt.verify(tokenLimpio, process.env.JWT_SECRET);
        req.usuarioActual = decodificado.email; 
        req.rol = decodificado.rol;
        next(); 
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
}

// =======================================================
//   RUTAS PÚBLICAS
// =======================================================
app.get('/api/especies', async (req, res) => {
    try {
      const especies = await Especie.find();
      res.json(especies);
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener especies' });
    }
});
  
app.get('/api/lotes', async (req, res) => {
    try {
      const lotes = await Lote.find().populate('especieId');
      res.json(lotes);
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener los lotes' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const usuario = await User.findOne({ email: String(req.body.email).trim() });
        if (!usuario) return res.status(401).json({ error: 'Credenciales incorrectas' });

        const claveValida = await bcrypt.compare(String(req.body.password), usuario.password);
        if (!claveValida) return res.status(401).json({ error: 'Credenciales incorrectas' });

        const token = jwt.sign(
            { id: usuario._id, email: usuario.email, rol: usuario.rol }, 
            process.env.JWT_SECRET, 
            { expiresIn: '12h' }
        );
        
        res.json({ mensaje: 'Bienvenido', token, rol: usuario.rol, email: usuario.email });
    } catch (error) { 
        res.status(500).json({ error: 'Error en el servidor durante el login' });
    }
});

// =======================================================
//   RUTAS PROTEGIDAS (ASOCIACIÓN)
// =======================================================

// Solo el ADMIN puede registrar nuevos asociados
app.post('/api/registrar-asociado', verificarAcceso, async (req, res) => {
    try {
        if (req.rol !== 'Admin') {
            return res.status(403).json({ error: 'Permiso denegado: solo el Administrador puede crear cuentas.' });
        }

        const existe = await User.findOne({ email: String(req.body.email).trim() });
        if (existe) return res.status(400).json({ error: 'Este usuario ya está registrado' });

        const passwordEncriptada = await bcrypt.hash(String(req.body.password), 10);
        const nuevoAsociado = new User({ 
            email: String(req.body.email).trim(), 
            password: passwordEncriptada, 
            rol: 'Operario' 
        });
        await nuevoAsociado.save();
        res.status(201).json({ mensaje: `Asociado ${nuevoAsociado.email} registrado con éxito.` });
    } catch (error) {
        res.status(400).json({ error: 'Error al registrar el asociado' });
    }
});

app.post('/api/especies', verificarAcceso, async (req, res) => {
    try {
      const nuevaEspecie = new Especie(req.body); 
      await nuevaEspecie.save();
      res.status(201).json({ mensaje: 'Especie registrada exitosamente' });
    } catch (error) {
      res.status(400).json({ error: 'Error al registrar especie (posible nombre duplicado)' });
    }
});
  
app.put('/api/especies/:id', verificarAcceso, async (req, res) => {
    try {
        const { id } = req.params;
        const { caracteristicas, nuevoSaber } = req.body;

        const especie = await Especie.findById(id);
        if (!especie) return res.status(404).json({ error: 'Especie no encontrada' });

        if (caracteristicas) especie.caracteristicas = caracteristicas;

        if (nuevoSaber && nuevoSaber.autor && nuevoSaber.descripcion) {
            especie.saberes.push({
                autor: nuevoSaber.autor,
                descripcion: nuevoSaber.descripcion,
                fechaAporte: new Date()
            });
        }

        await especie.save();
        res.json({ mensaje: 'Ficha actualizada con éxito', especie });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar la ficha' });
    }
});

app.post('/api/lotes', verificarAcceso, async (req, res) => {
    try {
      const { especieId, origen, cantidadInicial } = req.body;
      const codigoLote = `BQ-${new Date().getMonth()+1}${new Date().getFullYear().toString().slice(-2)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  
      const nuevoLote = new Lote({
          codigoLote,
          especieId,
          registradoPor: req.usuarioActual,
          origen,
          cantidadInicial,
          cantidadActual: cantidadInicial,
          estadoActual: 'Semillero',
          historial: [{
              estadoAlcanzado: 'Recolección',
              cantidadSuperviviente: cantidadInicial,
              observaciones: 'Lote inicial registrado',
              responsable: req.usuarioActual
          }]
      });
  
      await nuevoLote.save();
      res.status(201).json({ mensaje: `Lote ${codigoLote} registrado correctamente.` });
    } catch (error) {
      res.status(400).json({ error: 'Faltan datos requeridos para registrar el lote' });
    }
});

// Obtener árboles matriz (EXCLUSIVO ASOCIADOS - NUNCA PÚBLICO)
app.get('/api/arboles-matriz', verificarAcceso, async (req, res) => {
    try {
        let filtro = {};
        // Si es operario, audita solo los árboles que registró o custodia en su finca
        if (req.rol !== 'Admin') {
            filtro = { registradoPor: req.usuarioActual };
        }
        const arboles = await ArbolMatriz.find(filtro).populate('especieId');
        res.json(arboles);
    } catch (error) {
        res.status(500).json({ error: 'Error al consultar árboles semilleros' });
    }
});

// Registrar nuevo árbol matriz en finca
app.post('/api/arboles-matriz', verificarAcceso, async (req, res) => {
    try {
        const { codigoArbol, especieId, finca, veredaSector, custodio } = req.body;

        const existe = await ArbolMatriz.findOne({ codigoArbol: String(codigoArbol).trim().toUpperCase() });
        if (existe) return res.status(400).json({ error: 'El código de árbol ya existe' });

        const nuevoArbol = new ArbolMatriz({
            codigoArbol: String(codigoArbol).trim().toUpperCase(),
            especieId,
            finca,
            veredaSector,
            custodio,
            registradoPor: req.usuarioActual
        });

        await nuevoArbol.save();
        res.status(201).json({ mensaje: `Árbol matriz ${nuevoArbol.codigoArbol} registrado con éxito bajo custodia comunitaria.` });
    } catch (error) {
        res.status(400).json({ error: 'Error al registrar el árbol matriz' });
    }
});

// Añadir seguimiento fenológico a un árbol matriz
app.post('/api/arboles-matriz/:id/monitoreo', verificarAcceso, async (req, res) => {
    try {
        const { estadoFenologico, observaciones } = req.body;
        const arbol = await ArbolMatriz.findById(req.params.id);
        if (!arbol) return res.status(404).json({ error: 'Árbol matriz no encontrado' });

        arbol.monitoreos.push({
            estadoFenologico,
            observaciones,
            registrador: req.usuarioActual,
            fechaObservacion: new Date()
        });

        await arbol.save();
        res.json({ mensaje: 'Monitoreo fenológico registrado exitosamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al registrar seguimiento' });
    }
});

// Tanto Admin como Asociados pueden avanzar etapas
app.post('/api/lotes/avanzar', verificarAcceso, async (req, res) => {
    try {
        const { loteId, nuevoEstado, cantidadSuperviviente, observaciones } = req.body;
        const lote = await Lote.findById(loteId);
        if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

        const cant = Number(cantidadSuperviviente);
        if (isNaN(cant) || cant < 0) {
            return res.status(400).json({ error: 'Cantidad superviviente no válida' });
        }

        lote.estadoActual = nuevoEstado;
        lote.cantidadActual = cant;
        lote.historial.push({
            estadoAlcanzado: nuevoEstado,
            cantidadSuperviviente: cant,
            observaciones: observaciones || 'Avance de etapa',
            responsable: req.usuarioActual
        });

        await lote.save();
        res.json({ mensaje: `Lote ${lote.codigoLote} avanzado a ${nuevoEstado}.` });
    } catch (error) {
        res.status(500).json({ error: 'Error al procesar avance del lote' });
    }
});

// Tanto Admin como Asociados pueden registrar salidas/mermas
app.post('/api/lotes/retirar', verificarAcceso, async (req, res) => {
    try {
        const { loteId, cantidadRetirar, motivo } = req.body;
        const lote = await Lote.findById(loteId);
        if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

        const cant = Number(cantidadRetirar);
        if (isNaN(cant) || cant <= 0 || cant > lote.cantidadActual) {
            return res.status(400).json({ error: 'Cantidad a retirar inválida o superior a las plantas vivas' });
        }

        lote.cantidadActual -= cant;
        lote.historial.push({
            estadoAlcanzado: lote.estadoActual,
            cantidadSuperviviente: lote.cantidadActual,
            observaciones: `Retiro de ${cant} uds. Motivo: ${motivo || 'Salida de vivero'}`,
            responsable: req.usuarioActual
        });

        await lote.save();
        res.json({ mensaje: `Se retiraron ${cant} unidades del lote ${lote.codigoLote}.` });
    } catch (error) {
        res.status(500).json({ error: 'Error al procesar el retiro del lote' });
    }
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor Bosquesinos activo en puerto ${PORT}`);
});