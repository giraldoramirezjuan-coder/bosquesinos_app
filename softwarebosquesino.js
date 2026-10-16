const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken'); 
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Carga segura de nodemailer (evita que Render falle si no está en package.json)
let nodemailer = null;
try {
    nodemailer = require('nodemailer');
} catch (e) {
    console.log('Aviso: nodemailer no instalado, recuperación por correo desactivada temporalmente.');
}

const app = express();
app.use(cors());         
app.use(express.json()); 
app.use(express.static(__dirname));

// --- CONFIGURACIÓN DE SEGURIDAD AES-256 ---
const CLAVE_SECRETA = process.env.JWT_SECRET || 'bosquesinos_secreto_seguro_2026';
const ENCRYPTION_KEY = crypto.scryptSync(CLAVE_SECRETA, 'salt_bosquesinos', 32);
const ALGORITMO = 'aes-256-cbc';

function encriptarCoordenadas(texto) {
    if (!texto) return '';
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITMO, ENCRYPTION_KEY, iv);
    let encriptado = cipher.update(texto, 'utf8', 'hex');
    encriptado += cipher.final('hex');
    return iv.toString('hex') + ':' + encriptado;
}

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
    rol: { 
        type: String, 
        enum: ['Fundador', 'Custodio', 'Vigía'],
        default: 'Vigía'
    },
    postulacionCustodio: {
        estado: { type: String, enum: ['Ninguna', 'Pendiente', 'Aprobada', 'Rechazada'], default: 'Ninguna' },
        vereda: { type: String, default: '' },
        tamañoPredio: { type: String, default: '' },
        tipoBosque: { type: String, default: '' }
    },
    resetPasswordToken: { type: String },
    resetPasswordExpire: { type: Date }
});
const User = mongoose.model('User', userSchema);

// FASE 1: El Origen (Árbol Matriz con GPS Encriptado)
const arbolMatrizSchema = new mongoose.Schema({
    codigoArbol: { type: String, required: true, unique: true }, 
    nombreComun: { type: String, required: true },
    nombreCientifico: { type: String, default: '' },
    finca: { type: String, required: true },
    veredaSector: { type: String, required: true },
    custodio: { type: String, required: true },
    registradoPor: { type: String, required: true },
    coordenadasGPSEncriptadas: { type: String, default: '' },
    fechaSeleccion: { type: Date, default: Date.now },
    monitoreos: [{
        fechaObservacion: { type: Date, default: Date.now },
        estadoFenologico: { type: String, required: true },
        observaciones: { type: String },
        registrador: { type: String }
    }]
});
const ArbolMatriz = mongoose.model('ArbolMatriz', arbolMatrizSchema);

// FASE 2: El Proceso (Lote que nace del Árbol)
const loteSchema = new mongoose.Schema({
    codigoLote: { type: String, required: true, unique: true }, 
    arbolMatrizId: { type: mongoose.Schema.Types.ObjectId, ref: 'ArbolMatriz', required: true },
    registradoPor: { type: String, required: true },
    origen: {
        responsableRecoleccion: { type: String, required: true },
        fechaRecoleccion: { type: Date, required: true }
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

// FASE 3: El Resultado (Vitrina Pública)
const especieSchema = new mongoose.Schema({
    nombreComun: { type: String, required: true, unique: true },
    nombreCientifico: { type: String, default: '' },
    caracteristicas: { type: String, default: '' },
    imagenUrl: { type: String, default: '' },
    saberes: [{
        descripcion: { type: String, required: true },
        autor: { type: String, required: true }, 
        fechaAporte: { type: Date, default: Date.now }
    }]
});
const Especie = mongoose.model('Especie', especieSchema);

// --- AUTO-CREACIÓN FUNDADOR ---
async function crearUsuarioAdmin() {
  try {
    const usuarioExiste = await User.findOne({ email: 'bosquesinos' });
    if (!usuarioExiste) {
      const passwordEncriptada = await bcrypt.hash('bosquesinas', 10);
      await new User({ email: 'bosquesinos', password: passwordEncriptada, rol: 'Fundador' }).save();
    }
  } catch (error) { console.log('Error inicial:', error); }
}

// --- MIDDLEWARE DE SEGURIDAD ---
function verificarAcceso(req, res, next) {
    const headerAuth = req.headers['authorization'];
    if (!headerAuth) return res.status(403).json({ error: 'Acceso denegado' });
    try {
        const decodificado = jwt.verify(headerAuth.replace('Bearer ', '').trim(), CLAVE_SECRETA);
        req.usuarioActual = decodificado.email; 
        req.rol = decodificado.rol;
        next(); 
    } catch (error) { return res.status(401).json({ error: 'Token inválido' }); }
}

function soloGestores(req, res, next) {
    if (req.rol === 'Fundador' || req.rol === 'Custodio') {
        next();
    } else {
        return res.status(403).json({ error: 'Acceso denegado: Se requiere rango de Custodio o Fundador.' });
    }
}

// =======================================================
//   RUTAS PÚBLICAS
// =======================================================
app.get('/api/especies', async (req, res) => {
    try { res.json(await Especie.find()); } catch (error) { res.status(500).json({ error: 'Error al obtener vitrina' }); }
});
  
app.get('/api/lotes', async (req, res) => {
    try { res.json(await Lote.find().populate('arbolMatrizId')); } catch (error) { res.status(500).json({ error: 'Error al obtener lotes' }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const usuario = await User.findOne({ email: String(req.body.email).trim() });
        if (!usuario || !(await bcrypt.compare(String(req.body.password), usuario.password))) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }
        const token = jwt.sign({ id: usuario._id, email: usuario.email, rol: usuario.rol }, CLAVE_SECRETA, { expiresIn: '12h' });
        res.json({ token, rol: usuario.rol, email: usuario.email });
    } catch (error) { res.status(500).json({ error: 'Error en el servidor' }); }
});

app.post('/api/registro-publico', async (req, res) => {
    try {
        if (await User.findOne({ email: String(req.body.email).trim() })) {
            return res.status(400).json({ error: 'El correo ya está registrado.' });
        }
        const passwordEncriptada = await bcrypt.hash(String(req.body.password), 10);
        const nuevoUsuario = new User({ 
            email: String(req.body.email).trim(), 
            password: passwordEncriptada, 
            rol: 'Vigía' 
        });
        await nuevoUsuario.save();
        res.status(201).json({ mensaje: 'Cuenta creada con éxito. Ya puedes iniciar sesión.' });
    } catch (error) { res.status(500).json({ error: 'Error al registrar la cuenta.' }); }
});

app.post('/api/olvide-password', async (req, res) => {
    try {
        if (!nodemailer) return res.status(503).json({ error: 'Servicio de correo en mantenimiento.' });
        const usuario = await User.findOne({ email: req.body.email });
        if (!usuario) return res.status(404).json({ error: 'No hay un usuario con ese correo.' });

        const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
        usuario.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        usuario.resetPasswordExpire = Date.now() + 15 * 60 * 1000;
        await usuario.save();

        const transporter = nodemailer.createTransport({
            service: 'Gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });

        await transporter.sendMail({
            from: '"Bosquesinos San Luis" <tu-correo@gmail.com>',
            to: usuario.email,
            subject: 'Recuperación de Contraseña - Bosquesinos',
            text: `Has solicitado restablecer tu contraseña.\n\nTu código de recuperación es: ${resetToken}\n\nEste código es válido por 15 minutos.`
        });

        res.json({ mensaje: 'Código enviado a tu correo electrónico.' });
    } catch (error) { 
        console.error(error);
        res.status(500).json({ error: 'Error enviando el correo.' }); 
    }
});

app.post('/api/reset-password', async (req, res) => {
    try {
        const resetPasswordToken = crypto.createHash('sha256').update(req.body.token).digest('hex');
        const usuario = await User.findOne({
            resetPasswordToken,
            resetPasswordExpire: { \$gt: Date.now() }
        });
        if (!usuario) return res.status(400).json({ error: 'Código inválido o ha expirado.' });

        usuario.password = await bcrypt.hash(req.body.nuevaPassword, 10);
        usuario.resetPasswordToken = undefined;
        usuario.resetPasswordExpire = undefined;
        await usuario.save();

        res.json({ mensaje: 'Contraseña actualizada con éxito.' });
    } catch (error) { res.status(500).json({ error: 'Error al actualizar contraseña.' }); }
});

// =======================================================
//   RUTAS PROTEGIDAS (ASOCIACIÓN)
// =======================================================
app.post('/api/registrar-asociado', verificarAcceso, async (req, res) => {
    try {
        if (req.rol !== 'Fundador') return res.status(403).json({ error: 'Solo Fundador puede crear cuentas.' });
        if (await User.findOne({ email: String(req.body.email).trim() })) return res.status(400).json({ error: 'Usuario ya registrado' });
        const passwordEncriptada = await bcrypt.hash(String(req.body.password), 10);
        await new User({ email: String(req.body.email).trim(), password: passwordEncriptada, rol: 'Custodio' }).save();
        res.status(201).json({ mensaje: 'Custodio registrado con éxito.' });
    } catch (error) { res.status(400).json({ error: 'Error al registrar' }); }
});

app.get('/api/arboles-matriz', verificarAcceso, soloGestores, async (req, res) => {
    try {
        const filtro = req.rol === 'Fundador' ? {} : { registradoPor: req.usuarioActual };
        res.json(await ArbolMatriz.find(filtro));
    } catch (error) { res.status(500).json({ error: 'Error al obtener árboles' }); }
});

app.post('/api/arboles-matriz', verificarAcceso, soloGestores, async (req, res) => {
    try {
        const { codigoArbol, nombreComun, nombreCientifico, finca, veredaSector, custodio, coordenadasGPS } = req.body;
        const nuevoArbol = new ArbolMatriz({
            codigoArbol: String(codigoArbol).trim().toUpperCase(),
            nombreComun: String(nombreComun).trim(),
            nombreCientifico: String(nombreCientifico).trim(),
            finca, veredaSector, custodio,
            registradoPor: req.usuarioActual,
            coordenadasGPSEncriptadas: encriptarCoordenadas(coordenadasGPS)
        });
        await nuevoArbol.save();

        if (!(await Especie.findOne({ nombreComun: nuevoArbol.nombreComun }))) {
            await new Especie({ nombreComun: nuevoArbol.nombreComun, nombreCientifico: nuevoArbol.nombreCientifico }).save();
        }

        res.status(201).json({ mensaje: `Árbol ${nuevoArbol.codigoArbol} custodiado y coordenadas protegidas.` });
    } catch (error) { res.status(400).json({ error: 'Error o código repetido' }); }
});

// PUT: Editar datos de un Árbol Semillero
app.put('/api/arboles-matriz/:id', verificarAcceso, soloGestores, async (req, res) => {
    try {
        const arbolActualizado = await ArbolMatriz.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!arbolActualizado) return res.status(404).json({ error: 'Árbol no encontrado' });
        res.json({ mensaje: 'Árbol actualizado', arbol: arbolActualizado });
    } catch (error) { res.status(500).json({ error: 'Error al actualizar árbol' }); }
});

app.post('/api/arboles-matriz/:id/monitoreo', verificarAcceso, soloGestores, async (req, res) => {
    try {
        const arbol = await ArbolMatriz.findById(req.params.id);
        if (!arbol) return res.status(404).json({ error: 'Árbol no encontrado' });
        arbol.monitoreos.push({
            estadoFenologico: req.body.estadoFenologico,
            observaciones: req.body.observaciones,
            registrador: req.usuarioActual,
            fechaObservacion: new Date()
        });
        await arbol.save();
        res.json({ mensaje: 'Monitoreo actualizado' });
    } catch (error) { res.status(500).json({ error: 'Error al reportar' }); }
});

app.post('/api/lotes', verificarAcceso, soloGestores, async (req, res) => {
    try {
        const { arbolMatrizId, origen, cantidadInicial } = req.body;
        const codigoLote = `BQ-${new Date().getMonth()+1}${new Date().getFullYear().toString().slice(-2)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const nuevoLote = new Lote({
            codigoLote, arbolMatrizId, registradoPor: req.usuarioActual,
            origen, cantidadInicial, cantidadActual: cantidadInicial, estadoActual: 'Semillero',
            historial: [{ estadoAlcanzado: 'Recolección', cantidadSuperviviente: cantidadInicial, observaciones: 'Ingreso a vivero', responsable: req.usuarioActual }]
        });
        await nuevoLote.save();
        res.status(201).json({ mensaje: `Lote ${codigoLote} en semillero.` });
    } catch (error) { res.status(400).json({ error: 'Error al crear lote' }); }
});

app.post('/api/lotes/avanzar', verificarAcceso, soloGestores, async (req, res) => {
    try {
        const lote = await Lote.findById(req.body.loteId);
        const cant = Number(req.body.cantidadSuperviviente);
        lote.estadoActual = req.body.nuevoEstado;
        lote.cantidadActual = cant;
        lote.historial.push({ estadoAlcanzado: req.body.nuevoEstado, cantidadSuperviviente: cant, observaciones: req.body.observaciones, responsable: req.usuarioActual });
        await lote.save();
        res.json({ mensaje: `Lote avanzado a ${req.body.nuevoEstado}.` });
    } catch (error) { res.status(500).json({ error: 'Error al avanzar' }); }
});

app.post('/api/lotes/retirar', verificarAcceso, soloGestores, async (req, res) => {
    try {
        const lote = await Lote.findById(req.body.loteId);
        const cant = Number(req.body.cantidadRetirar);
        lote.cantidadActual -= cant;
        
        if (lote.cantidadActual <= 0) {
            await Lote.findByIdAndDelete(req.body.loteId);
            return res.json({ mensaje: 'Registro eliminado porque la cantidad llegó a 0' });
        }

        lote.historial.push({ estadoAlcanzado: lote.estadoActual, cantidadSuperviviente: lote.cantidadActual, observaciones: `Retiro: ${req.body.motivo}`, responsable: req.usuarioActual });
        await lote.save();
        res.json({ mensaje: `Se retiraron ${cant} unidades.` });
    } catch (error) { res.status(500).json({ error: 'Error al retirar' }); }
});

app.delete('/api/lotes/:id', verificarAcceso, soloGestores, async (req, res) => {
    try {
        const registroEliminado = await Lote.findByIdAndDelete(req.params.id);
        if (!registroEliminado) return res.status(404).json({ error: 'Registro no encontrado' });
        res.json({ mensaje: 'Registro eliminado correctamente' });
    } catch (error) { res.status(500).json({ error: 'Error al eliminar' }); }
});

app.put('/api/especies/:id', verificarAcceso, soloGestores, async (req, res) => {
    try {
        const especie = await Especie.findById(req.params.id);
        if (req.body.caracteristicas) especie.caracteristicas = req.body.caracteristicas;
        if (req.body.imagenUrl) especie.imagenUrl = req.body.imagenUrl;
        if (req.body.nuevoSaber && req.body.nuevoSaber.autor) {
            especie.saberes.push({ autor: req.body.nuevoSaber.autor, descripcion: req.body.nuevoSaber.descripcion, fechaAporte: new Date() });
        }
        await especie.save();
        res.json({ mensaje: 'Vitrina actualizada', especie });
    } catch (error) { res.status(500).json({ error: 'Error al actualizar vitrina' }); }
});

// --- RUTAS DE PERFIL Y POSTULACIÓN A CUSTODIO ---
app.get('/api/mi-perfil', verificarAcceso, async (req, res) => {
    try {
        const usuario = await User.findOne({ email: req.usuarioActual }, '-password');
        res.json(usuario);
    } catch (error) { res.status(500).json({ error: 'Error al obtener perfil' }); }
});

app.post('/api/postular-custodio', verificarAcceso, async (req, res) => {
    try {
        const { vereda, tamañoPredio, tipoBosque } = req.body;
        const usuario = await User.findOne({ email: req.usuarioActual });
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

        usuario.postulacionCustodio = {
            estado: 'Pendiente',
            vereda: String(vereda || '').trim(),
            tamañoPredio: String(tamañoPredio || '').trim(),
            tipoBosque: String(tipoBosque || '').trim()
        };
        await usuario.save();
        res.json({ mensaje: '¡Postulación enviada! El equipo Fundador revisará tu solicitud.' });
    } catch (error) { res.status(500).json({ error: 'Error al procesar la postulación' }); }
});

app.get('/api/postulaciones-pendientes', verificarAcceso, async (req, res) => {
    try {
        if (req.rol !== 'Fundador') return res.status(403).json({ error: 'Solo el Fundador puede ver postulaciones' });
        const pendientes = await User.find({ 'postulacionCustodio.estado': 'Pendiente' }, '-password');
        res.json(pendientes);
    } catch (error) { res.status(500).json({ error: 'Error al obtener postulaciones' }); }
});

app.put('/api/resolver-postulacion/:id', verificarAcceso, async (req, res) => {
    try {
        if (req.rol !== 'Fundador') return res.status(403).json({ error: 'No autorizado' });
        const { decision } = req.body;
        const usuario = await User.findById(req.params.id);
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

        usuario.postulacionCustodio.estado = decision;
        if (decision === 'Aprobada') usuario.rol = 'Custodio';
        await usuario.save();
        res.json({ mensaje: `Postulación ${decision.toLowerCase()} con éxito.` });
    } catch (error) { res.status(500).json({ error: 'Error al resolver postulación' }); }
});

// --- MODELO Y RUTAS PARA "DEL MONTE A LA PLAZA" Y "BITÁCORA" ---
const publicacionTerritorioSchema = new mongoose.Schema({
    categoria: { type: String, enum: ['plaza', 'bitacora'], required: true }, // 'plaza' o 'bitacora'
    titulo: { type: String, required: true },
    fechaLugar: { type: String, required: true }, // Ej: "Octubre 2026 • Parque de San Luis"
    descripcion: { type: String, required: true },
    imagenUrl: { type: String, default: '' },
    autor: { type: String, required: true },
    fechaCreacion: { type: Date, default: Date.now }
});
const PublicacionTerritorio = mongoose.model('PublicacionTerritorio', publicacionTerritorioSchema);

// GET Público: Cualquier visitante ve lo que el grupo haya decidido publicar
app.get('/api/territorio', async (req, res) => {
    try {
        const publicaciones = await PublicacionTerritorio.find().sort({ fechaCreacion: -1 });
        res.json(publicaciones);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar publicaciones' });
    }
});

// POST Protegido: Fundador o Custodio agrega una historia o jornada desde su cuenta
app.post('/api/territorio', verificarAcceso, soloGestores, async (req, res) => {
    try {
        const { categoria, titulo, fechaLugar, descripcion, imagenUrl, autorNombre } = req.body;
        const nuevaPub = new PublicacionTerritorio({
            categoria,
            titulo: String(titulo).trim(),
            fechaLugar: String(fechaLugar).trim(),
            descripcion: String(descripcion).trim(),
            imagenUrl: String(imagenUrl || '').trim(),
            autor: String(autorNombre || req.usuarioActual).trim()
        });
        await nuevaPub.save();
        res.status(201).json({ mensaje: '¡Historia publicada en Territorio Vivo!' });
    } catch (error) {
        res.status(400).json({ error: 'Error al guardar la publicación' });
    }
});

// DELETE Protegido: Fundador o Custodio puede borrar una tarjeta si se equivocó
app.delete('/api/territorio/:id', verificarAcceso, soloGestores, async (req, res) => {
    try {
        await PublicacionTerritorio.findByIdAndDelete(req.params.id);
        res.json({ mensaje: 'Publicación eliminada.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar publicación' });
    }
});

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { console.log(`Servidor activo en puerto ${PORT}`); });