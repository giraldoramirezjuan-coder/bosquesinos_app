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
    crearEntornoBase(); 
  })
  .catch(err => console.error('Error conectando a la base de datos:', err));

// --- 2. MODELOS DE DATOS ---

const viveroSchema = new mongoose.Schema({
    nombre: { type: String, required: true, unique: true }, 
    ubicacion: { type: String, default: 'San Luis, Antioquia' },
    fechaRegistro: { type: Date, default: Date.now }
});
const Vivero = mongoose.model('Vivero', viveroSchema);

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    rol: { type: String, default: 'Operario' }, 
    viveroId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vivero', required: true } 
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

const arbolMatrizSchema = new mongoose.Schema({
    codigoArbol: { type: String, required: true, unique: true }, 
    especieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Especie', required: true },
    viveroId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vivero', required: true }, 
    finca: { type: String, required: true },
    custodio: { type: String, required: true },
    fechaSeleccion: { type: Date, default: Date.now },
    coordenadasGPS: { type: String, default: '' },
    monitoreos: [{
        fechaObservacion: { type: Date, default: Date.now },
        estadoFenologico: { type: String, required: true },
        observaciones: { type: String },
        fotoUrl: { type: String },
        registrador: { type: String } 
    }]
});
const ArbolMatriz = mongoose.model('ArbolMatriz', arbolMatrizSchema);

const loteSchema = new mongoose.Schema({
    codigoLote: { type: String, required: true, unique: true }, 
    especieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Especie', required: true },
    viveroId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vivero', required: true }, 
    origen: {
        arbolMatrizId: { type: mongoose.Schema.Types.ObjectId, ref: 'ArbolMatriz' },
        fechaRecoleccion: { type: Date, required: true },
        finca: { type: String, required: true },
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

// --- 3. AUTO-CREACIÓN DE ENTORNO BASE ---
async function crearEntornoBase() {
  try {
    let viveroPrincipal = await Vivero.findOne({ nombre: 'Vivero Bosquesinos Central' });
    if (!viveroPrincipal) {
        viveroPrincipal = new Vivero({ nombre: 'Vivero Bosquesinos Central' });
        await viveroPrincipal.save();
    }

    const usuarioExiste = await User.findOne({ email: 'bosquesinos' });
    if (!usuarioExiste) {
      const passwordEncriptada = await bcrypt.hash('bosquesinas', 10);
      const nuevoUsuario = new User({ 
          email: 'bosquesinos', 
          password: passwordEncriptada, 
          rol: 'Admin',
          viveroId: viveroPrincipal._id 
      });
      await nuevoUsuario.save();
    }
  } catch (error) {
    console.log('Error inicial:', error);
  }
}

// --- MIDDLEWARE DE SEGURIDAD INTERNA ---
function verificarAcceso(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: 'Acceso denegado' });

    try {
        const tokenLimpio = token.replace('Bearer ', '');
        const decodificado = jwt.verify(tokenLimpio, process.env.JWT_SECRET);
        req.usuarioActual = decodificado.email; 
        req.rol = decodificado.rol;
        req.viveroId = decodificado.viveroId; 
        next(); 
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido' });
    }
}

// =======================================================
//   RUTAS PÚBLICAS (VIVERO COMÚN / VISITANTES)
//   Cualquiera puede entrar a ver sin iniciar sesión.
// =======================================================

// Obtener catálogo de especies
app.get('/api/especies', async (req, res) => {
    try {
      const especies = await Especie.find();
      res.json(especies);
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener especies' });
    }
});
  
// Obtener plantas disponibles
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
        const usuario = await User.findOne({ email: String(req.body.email) });
        if (!usuario) return res.status(401).json({ error: 'Credenciales incorrectas' });

        const claveValida = await bcrypt.compare(String(req.body.password), usuario.password);
        if (!claveValida) return res.status(401).json({ error: 'Credenciales incorrectas' });

        const token = jwt.sign({ 
            id: usuario._id, 
            email: usuario.email, 
            rol: usuario.rol,
            viveroId: usuario.viveroId
        }, process.env.JWT_SECRET, { expiresIn: '8h' });
        
        res.json({ mensaje: 'Bienvenido', token: token, rol: usuario.rol });
    } catch (error) { 
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// =======================================================
//   RUTAS PRIVADAS (MULTI-VIVERO / GESTIÓN)
//   Solo usuarios con token (verificarAcceso) pueden modificar.
// =======================================================

app.post('/api/registrar-asociado', verificarAcceso, async (req, res) => {
    try {
        const passwordEncriptada = await bcrypt.hash(String(req.body.password), 10);
        const nuevoAsociado = new User({ 
            email: String(req.body.email), 
            password: passwordEncriptada, 
            rol: 'Operario',
            viveroId: req.viveroId 
        });
        await nuevoAsociado.save();
        res.status(201).json({ mensaje: 'Asociado registrado' });
    } catch (error) {
        res.status(400).json({ error: 'Error al registrar' });
    }
});

app.post('/api/especies', verificarAcceso, async (req, res) => {
    try {
      const nuevaEspecie = new Especie(req.body); 
      await nuevaEspecie.save();
      res.status(201).json({ mensaje: 'Especie registrada' });
    } catch (error) {
      res.status(400).json({ error: 'Error al registrar especie' });
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
          res.json({ mensaje: 'Ficha actualizada', especie });
      } catch (error) {
          res.status(500).json({ error: 'Error al actualizar' });
      }
});

app.post('/api/lotes', verificarAcceso, async (req, res) => {
    try {
      const { especieId, origen, cantidadInicial } = req.body;
      const codigoLote = `BQ-${new Date().getMonth()+1}${new Date().getFullYear().toString().slice(-2)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  
      const nuevoLote = new Lote({
          codigoLote,
          especieId,
          viveroId: req.viveroId, 
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
      res.status(201).json({ mensaje: `Lote ${codigoLote} registrado.` });
    } catch (error) {
      res.status(400).json({ error: 'Error al crear lote' });
    }
});

app.post('/api/lotes/avanzar', verificarAcceso, async (req, res) => {
    try {
        const { loteId, nuevoEstado, cantidadSuperviviente, observaciones } = req.body;
        const lote = await Lote.findOne({ _id: loteId, viveroId: req.viveroId }); // Filtro de seguridad multi-vivero
        if (!lote) return res.status(404).json({ error: 'Lote no encontrado o sin permisos' });

        lote.estadoActual = nuevoEstado;
        lote.cantidadActual = cantidadSuperviviente;
        lote.historial.push({
            estadoAlcanzado: nuevoEstado,
            cantidadSuperviviente: cantidadSuperviviente,
            observaciones: observaciones || '',
            responsable: req.usuarioActual
        });

        await lote.save();
        res.json({ mensaje: 'Lote avanzado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar lote' });
    }
});

app.post('/api/lotes/retirar', verificarAcceso, async (req, res) => {
    try {
        const { loteId, cantidadRetirar, motivo } = req.body;
        const lote = await Lote.findOne({ _id: loteId, viveroId: req.viveroId }); // Filtro de seguridad multi-vivero
        if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

        const cant = Number(cantidadRetirar);
        lote.cantidadActual -= cant;
        
        lote.historial.push({
            estadoAlcanzado: lote.estadoActual,
            cantidadSuperviviente: lote.cantidadActual,
            observaciones: `Retiro: ${motivo}`,
            responsable: req.usuarioActual
        });

        await lote.save();
        res.json({ mensaje: 'Unidades retiradas' });
    } catch (error) {
        res.status(500).json({ error: 'Error al retirar' });
    }
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor en línea en el puerto ${PORT}`);
});