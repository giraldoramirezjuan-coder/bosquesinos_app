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
    crearCronicasIniciales();
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

// FASE 4: Territorio Vivo (Crónicas de "Del Campo a la Mesa" y "Salidas al Bosque")
const cronicaSchema = new mongoose.Schema({
    titulo: { type: String, required: true },
    categoria: { 
        type: String, 
        enum: ['campo-mesa', 'salidas-bosque'], 
        required: true 
    },
    etiquetaLugarFecha: { type: String, required: true },
    resumen: { type: String, required: true },
    contenido: { type: String, required: true },
    imagenPortada: { type: String, default: '' },
    autor: { type: String, required: true },
    estado: { type: String, enum: ['Publicado', 'Pendiente'], default: 'Publicado' },
    fechaCreacion: { type: Date, default: Date.now }
});
const Cronica = mongoose.model('Cronica', cronicaSchema);

// --- AUTO-CREACIÓN FUNDADOR Y CRÓNICAS BASE ---
async function crearUsuarioAdmin() {
  try {
    const usuarioExiste = await User.findOne({ email: 'bosquesinos' });
    if (!usuarioExiste) {
      const passwordEncriptada = await bcrypt.hash('bosquesinas', 10);
      await new User({ email: 'bosquesinos', password: passwordEncriptada, rol: 'Fundador' }).save();
    }
  } catch (error) { console.log('Error inicial:', error); }
}

async function crearCronicasIniciales() {
    try {
        const cuenta = await Cronica.countDocuments();
        if (cuenta === 0) {
            await Cronica.insertMany([
                {
                    titulo: 'Septiembre en el Parque: Plántulas, semillas y saberes de nuestra tierra',
                    categoria: 'campo-mesa',
                    etiquetaLugarFecha: '📍 Parque Principal San Luis • Septiembre 2026',
                    resumen: 'Bajamos de las veredas al parque principal con el vivero comunitario, cosechas frescas y la historia viva detrás de cada semilla.',
                    imagenPortada: '',
                    autor: 'Equipo Bosquesinos',
                    estado: 'Publicado',
                    contenido: `Cada vez que bajamos de la montaña al parque principal, traemos mucho más que matas en bolsa: traemos el trabajo de las familias custodias y la memoria de nuestros bosques. En esta jornada de septiembre armamos mesa en el parque para conversar sin afán con la gente del pueblo.

[titulo]El vivero comunitario en la plaza[/titulo]
Llegamos temprano a acomodar los arbolitos nativos listos para adopción. Muchas familias se acercaron a preguntar cómo sembrarlos en sus solares y fincas para cuidar los nacimientos de agua.

[titulo]Conversando sobre semillas y árboles madre[/titulo]
A mitad de la mañana se armó el mostrario alrededor de la mesa. Entre vecinos y productores estuvieron reconociendo las semillas de nuestros árboles maderables y frutales, recordando cuáles sirven para darle sombra al agua y cuáles alimentan a los animales del bosque.

[cita]Cada arbolito que alguien se lleva en la plaza respalda directamente las caminadas de recolección en el monte y la gestión de los viveros en las veredas.[/cita]

[titulo]Cosecha limpia y alimento de verdad[/titulo]
Se comparten los frutos de la tierra y preparaciones hechas en casa, demostrando que cuidar el monte y producir comida sana van de la mano.`
                },
                {
                    titulo: 'Hombro a hombro con la montaña: 1 km de ascenso con los árboles al hombro',
                    categoria: 'salidas-bosque',
                    etiquetaLugarFecha: '🌧️ Montañas de San Luis • Octubre 2026',
                    resumen: 'Subida en canasta por loma empinada y barro liso bajo el aguacero para devolverle el monte a la cordillera.',
                    imagenPortada: '',
                    autor: 'Equipo Bosquesinos',
                    estado: 'Publicado',
                    contenido: `Detrás de cada plántula que germina en el vivero hay kilómetros de trocha, loma parada y botas embarradas. En esta salida nos fuimos a sembrar en una ladera alta donde la montaña pedía árboles a gritos.

[titulo]Jornada en la montaña de la vereda La Linda[/titulo]
Aunque el clima nos recibió con aguacero y viento frío, nos repartimos el peso en canastas y arrancamos el ascenso de la montaña por el barro liso. Cuando el terreno se pone pesado es cuando más se mira el trabajo en equipo.

[cita]Sembrar en temporada de lluvias cuesta el doble en la subida, pero es la garantía de que el arbolito agarre raíz firme en su nueva tierra.[/cita]

Al final de la tarde dejamos los árboles bien plantados, sabiendo que en unos años esa loma volverá a ser abrigo para el agua y los animales del cañón.`
                }
            ]);
            console.log('Crónicas iniciales de Territorio Vivo creadas.');
        }
    } catch (e) { console.log('Error creando crónicas iniciales:', e); }
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
    if (req.rol === 'Fundador' || req.rol === 'Custodio' || req.rol === 'Admin') {
        next();
    } else {
        return res.status(403).json({ error: 'Solo Custodios y Fundadores pueden realizar esta acción.' });
    }
}

// =======================================================
//   RUTAS DE CRÓNICAS (TERRITORIO VIVO)
// =======================================================
app.get('/api/cronicas', async (req, res) => {
    try {
        const filtro = req.query.todas === 'true' ? {} : { estado: 'Publicado' };
        const cronicas = await Cronica.find(filtro).sort({ fechaCreacion: -1 });
        res.json(cronicas);
    } catch (error) { res.status(500).json({ error: 'Error al cargar las crónicas' }); }
});

app.post('/api/cronicas', verificarAcceso, async (req, res) => {
    try {
        const { titulo, categoria, etiquetaLugarFecha, resumen, contenido, imagenPortada } = req.body;
        const estadoInicial = (req.rol === 'Fundador' || req.rol === 'Custodio' || req.rol === 'Admin') ? 'Publicado' : 'Pendiente';
        
        const nueva = new Cronica({
            titulo, categoria, etiquetaLugarFecha, resumen, contenido, imagenPortada,
            autor: req.usuarioActual,
            estado: estadoInicial
        });
        await nueva.save();
        
        const msj = estadoInicial === 'Publicado' 
            ? '¡Crónica publicada en Territorio Vivo!' 
            : '¡Tu relato fue enviado! Un Fundador lo revisará para publicarlo.';
        res.status(201).json({ mensaje: msj, cronica: nueva });
    } catch (error) { res.status(400).json({ error: 'Completa todos los campos del relato.' }); }
});

app.put('/api/cronicas/:id', verificarAcceso, soloGestores, async (req, res) => {
    try {
        const actualizada = await Cronica.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ mensaje: 'Crónica actualizada con éxito', cronica: actualizada });
    } catch (error) { res.status(500).json({ error: 'Error al actualizar la crónica' }); }
});

app.delete('/api/cronicas/:id', verificarAcceso, async (req, res) => {
    try {
        if (req.rol !== 'Fundador' && req.rol !== 'Admin') return res.status(403).json({ error: 'Solo un Fundador puede borrar crónicas.' });
        await Cronica.findByIdAndDelete(req.params.id);
        res.json({ mensaje: 'Crónica eliminada' });
    } catch (error) { res.status(500).json({ error: 'Error al eliminar' }); }
});

// =======================================================
//   RUTAS PÚBLICAS (CATÁLOGO Y CUENTAS)
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
            return res.status(400).json({ error: 'El correo o usuario ya está registrado.' });
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
        if (!nodemailer) return res.status(503).json({ error: 'Por favor solicita el restablecimiento directo por WhatsApp con el Fundador.' });
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
            from: `"Asociación Bosquesinos San Luis" <${process.env.EMAIL_USER}>`,
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
            resetPasswordExpire: { $gt: Date.now() }
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
//   RUTAS PROTEGIDAS (VIVERO Y ASOCIACIÓN)
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

// PUT: Fundador restablece la contraseña de cualquier compañero directamente
app.put('/api/fundador-reset-password', verificarAcceso, async (req, res) => {
    try {
        if (req.rol !== 'Fundador') return res.status(403).json({ error: 'Solo el Fundador puede restablecer contraseñas.' });
        const { identificador, nuevaPassword } = req.body;
        const usuario = await User.findOne({ email: String(identificador).trim() });
        if (!usuario) return res.status(404).json({ error: 'No se encontró ningún usuario con ese nombre o correo.' });
        
        usuario.password = await bcrypt.hash(String(nuevaPassword), 10);
        await usuario.save();
        res.json({ mensaje: `¡Contraseña de ${usuario.email} restablecida con éxito!` });
    } catch (error) { res.status(500).json({ error: 'Error al cambiar la contraseña.' }); }
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

// GET: Listar todos los usuarios registrados (Exclusivo Fundador)
app.get('/api/usuarios', verificarAcceso, async (req, res) => {
    try {
        if (req.rol !== 'Fundador') return res.status(403).json({ error: 'Solo el Fundador puede ver el directorio de usuarios.' });
        const usuarios = await User.find({}, '-password').sort({ rol: 1, email: 1 });
        res.json(usuarios);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener la lista de usuarios.' });
    }
});

// PUT: Cambiar el rol de cualquier usuario con un clic (Exclusivo Fundador)
app.put('/api/usuarios/:id/rol', verificarAcceso, async (req, res) => {
    try {
        if (req.rol !== 'Fundador') return res.status(403).json({ error: 'Solo el Fundador puede cambiar roles.' });
        const { nuevoRol } = req.body;
        if (!['Fundador', 'Custodio', 'Vigía'].includes(nuevoRol)) {
            return res.status(400).json({ error: 'Rol no válido.' });
        }
        const usuario = await User.findById(req.params.id);
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado.' });

        usuario.rol = nuevoRol;
        if (nuevoRol === 'Custodio' && usuario.postulacionCustodio) {
            usuario.postulacionCustodio.estado = 'Aprobada';
        }
        await usuario.save();
        res.json({ mensaje: `Rol de ${usuario.email} actualizado a ${nuevoRol}.` });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar el rol.' });
    }
});

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { console.log(`Servidor activo en puerto ${PORT}`); });