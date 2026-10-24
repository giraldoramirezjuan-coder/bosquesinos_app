const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken'); 
const bcrypt = require('bcrypt');
const crypto = require('crypto');

let nodemailer = null;
try {
    nodemailer = require('nodemailer');
} catch (e) {
    console.log('Aviso: nodemailer no instalado.');
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
        enum: ['Fundador', 'Custodio', 'Admin', 'Vigía'],
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

// NUEVO MODELO FASE 0: Fincas Registradas (Predios con Dueño y Vereda)
const fincaSchema = new mongoose.Schema({
    nombreFinca: { type: String, required: true },
    vereda: { type: String, required: true },
    propietario: { type: String, required: true }, // Dueño de la finca
    contactoPropietario: { type: String, default: '' },
    observacionesBosque: { type: String, default: '' },
    registradaPor: { type: String, required: true }, // Custodio o Fundador que la registró
    fechaRegistro: { type: Date, default: Date.now }
});
const Finca = mongoose.model('Finca', fincaSchema);

// FASE 1: Árbol Matriz (Vinculado a la Finca)
const arbolMatrizSchema = new mongoose.Schema({
    codigoArbol: { type: String, required: true, unique: true }, 
    nombreComun: { type: String, required: true },
    nombreCientifico: { type: String, default: '' },
    fincaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Finca' }, // Vínculo con la Finca
    finca: { type: String, required: true },
    veredaSector: { type: String, required: true },
    propietarioFinca: { type: String, default: '' },
    custodio: { type: String, required: true }, // Custodio encargado del seguimiento
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

// FASE 2: Lote de Semillas y Vivero
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
    tamanoBolsa: { type: String, default: 'Sin bolsa' }, // Pequeña, Mediana, Grande
    alturaCm: { type: Number, default: 0 }, // Altura aproximada en cm
    historial: [{
        fechaEvento: { type: Date, default: Date.now },
        estadoAlcanzado: { type: String },
        cantidadSuperviviente: { type: Number },
        tamanoBolsa: { type: String, default: '' },
        alturaCm: { type: Number, default: 0 },
        observaciones: { type: String },
        responsable: { type: String } 
    }]
});
const Lote = mongoose.model('Lote', loteSchema);

// FASE 3: Vitrina Pública (Catálogo)
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

// FASE 4: Territorio Vivo (Crónicas)
const cronicaSchema = new mongoose.Schema({
    titulo: { type: String, required: true },
    categoria: { type: String, enum: ['campo-mesa', 'salidas-bosque'], required: true },
    etiquetaLugarFecha: { type: String, required: true },
    resumen: { type: String, required: true },
    contenido: { type: String, required: true },
    imagenPortada: { type: String, default: '' },
    autor: { type: String, required: true },
    estado: { type: String, enum: ['Publicado', 'Pendiente'], default: 'Publicado' },
    fechaCreacion: { type: Date, default: Date.now }
});
const Cronica = mongoose.model('Cronica', cronicaSchema);

// FASE 5: Apadrinamientos y Certificados QR
const apadrinamientoSchema = new mongoose.Schema({
    codigoCertificado: { type: String, required: true, unique: true },
    nombrePadrino: { type: String, required: true },
    plan: { type: String, enum: ['Semilla', 'Raíz', 'Naciente', 'Cuenca'], required: true },
    cantidadArboles: { type: Number, required: true },
    especie: { type: String, required: true },
    veredaRuta: { type: String, default: 'Rutas Ecológicas San Luis, Antioquia' },
    loteCodigo: { type: String, default: '' },
    mensajeDedicatoria: { type: String, default: '' },
    imagenArbolUrl: { type: String, default: '' },
    fechaInicio: { type: Date, default: Date.now },
    fechaFinCuidado: { type: Date, required: true },
    estadoCuidado: { type: String, default: 'En Vivero / Preparación de Siembra' },
    bitacoraMantenimiento: [{
        fecha: { type: Date, default: Date.now },
        actividad: { type: String, required: true },
        observaciones: { type: String, default: '' },
        fotoUrl: { type: String, default: '' },
        responsable: { type: String, default: '' }
    }],
    registradoPor: { type: String, required: true }
});
const Apadrinamiento = mongoose.model('Apadrinamiento', apadrinamientoSchema);

// --- AUTO-CREACIÓN FUNDADOR Y CRÓNICAS BASE ---
async function crearUsuarioAdmin() {
  try {
    const usuarioExiste = await User.findOne({ email: 'bosquesinos' });
    if (!usuarioExiste) {
      const passwordEncriptada = await bcrypt.hash('bosquesinas', 10);
      await new User({ email: 'bosquesinos', password: passwordEncriptada, rol: 'Fundador' }).save();
    } else if (usuarioExiste.rol !== 'Fundador') {
      await User.updateOne({ email: 'bosquesinos' }, { $set: { rol: 'Fundador' } });
      console.log('Cuenta principal bosquesinos actualizada a rol Fundador.');
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
                    contenido: `Cada vez que bajamos de la montaña al parque principal, traemos mucho más que matas en bolsa: traemos el trabajo de las familias custodias y la memoria de nuestros bosques.\n\n[titulo]El vivero comunitario en la plaza[/titulo]\nLlegamos temprano a acomodar los arbolitos nativos listos para adopción.\n\n[cita]Cada arbolito que alguien se lleva en la plaza respalda directamente las caminadas de recolección en el monte y la gestión de los viveros en las veredas.[/cita]`
                }
            ]);
        }
    } catch (e) { console.log('Error creando crónicas iniciales:', e); }
}

// --- MIDDLEWARES DE ROLES SEPARADOS ---
function verificarAcceso(req, res, next) {
    const headerAuth = req.headers['authorization'];
    if (!headerAuth) return res.status(403).json({ error: 'Acceso denegado' });
    try {
        const decodificado = jwt.verify(headerAuth.replace('Bearer ', '').trim(), CLAVE_SECRETA);
        req.usuarioActual = decodificado.email; 
        // Si es la cuenta maestra 'bosquesinos', garantizamos rol Fundador aunque tenga un token viejo
        req.rol = (decodificado.email === 'bosquesinos') ? 'Fundador' : decodificado.rol;
        next(); 
    } catch (error) { return res.status(401).json({ error: 'Token inválido o expirado' }); }
}

// 1. Motor Cerrado (Fincas, Árboles Madre, Lotes): EXCLUSIVO Fundador y Custodio (Admin NO entra aquí)
function soloMotorCampo(req, res, next) {
    if (req.rol === 'Fundador' || req.rol === 'Custodio') {
        next();
    } else {
        return res.status(403).json({ error: 'Acceso exclusivo a campo y vivero (Fundador y Custodios).' });
    }
}

// 2. Sección Pública (Vitrina, Crónicas, Apadrinamientos): Fundador, Custodio y Admin
function soloGestoresPublicos(req, res, next) {
    if (req.rol === 'Fundador' || req.rol === 'Custodio' || req.rol === 'Admin') {
        next();
    } else {
        return res.status(403).json({ error: 'No tienes permisos para administrar secciones públicas.' });
    }
}

// 3. Gobernanza Total: EXCLUSIVO Fundador
function soloFundador(req, res, next) {
    if (req.rol === 'Fundador') {
        next();
    } else {
        return res.status(403).json({ error: 'Acción exclusiva del Fundador.' });
    }
}

// =======================================================
//   RUTAS DE FINCAS (NUEVA DINÁMICA DE PREDIO + DUEÑO)
// =======================================================
app.get('/api/fincas', verificarAcceso, soloMotorCampo, async (req, res) => {
    try {
        const fincas = await Finca.find().sort({ vereda: 1, nombreFinca: 1 });
        res.json(fincas);
    } catch (error) { res.status(500).json({ error: 'Error al obtener fincas' }); }
});

app.post('/api/fincas', verificarAcceso, soloMotorCampo, async (req, res) => {
    try {
        const { nombreFinca, vereda, propietario, contactoPropietario, observacionesBosque } = req.body;
        const nuevaFinca = new Finca({
            nombreFinca: String(nombreFinca).trim(),
            vereda: String(vereda).trim(),
            propietario: String(propietario).trim(),
            contactoPropietario: String(contactoPropietario || '').trim(),
            observacionesBosque: String(observacionesBosque || '').trim(),
            registradaPor: req.usuarioActual
        });
        await nuevaFinca.save();
        res.status(201).json({ mensaje: `Finca "${nuevaFinca.nombreFinca}" (Dueño: ${nuevaFinca.propietario}) registrada con éxito.`, finca: nuevaFinca });
    } catch (error) { res.status(400).json({ error: 'Error al registrar la finca' }); }
});

app.delete('/api/fincas/:id', verificarAcceso, soloFundador, async (req, res) => {
    try {
        await Finca.findByIdAndDelete(req.params.id);
        res.json({ mensaje: 'Finca eliminada.' });
    } catch (error) { res.status(500).json({ error: 'Error al eliminar finca' }); }
});

// =======================================================
//   RUTAS DEL MOTOR CERRADO (ÁRBOLES MADRE Y LOTES)
// =======================================================
app.get('/api/arboles-matriz', verificarAcceso, soloMotorCampo, async (req, res) => {
    try {
        // Todos los Custodios y el Fundador pueden ver y dar seguimiento a los árboles de las fincas
        const arboles = await ArbolMatriz.find().sort({ fechaSeleccion: -1 });
        res.json(arboles);
    } catch (error) {
        console.error('Error en /api/arboles-matriz:', error);
        res.status(500).json({ error: 'Error al obtener árboles' });
    }
});

app.post('/api/arboles-matriz', verificarAcceso, soloMotorCampo, async (req, res) => {
    try {
        const { codigoArbol, nombreComun, nombreCientifico, fincaId, finca, veredaSector, propietarioFinca, custodio, coordenadasGPS } = req.body;
        const nuevoArbol = new ArbolMatriz({
            codigoArbol: String(codigoArbol).trim().toUpperCase(),
            nombreComun: String(nombreComun).trim(),
            nombreCientifico: String(nombreCientifico || '').trim(),
            fincaId: fincaId || null,
            finca: String(finca).trim(),
            veredaSector: String(veredaSector).trim(),
            propietarioFinca: String(propietarioFinca || '').trim(),
            custodio: String(custodio || req.usuarioActual).trim(),
            registradoPor: req.usuarioActual,
            coordenadasGPSEncriptadas: encriptarCoordenadas(coordenadasGPS)
        });
        await nuevoArbol.save();

        if (!(await Especie.findOne({ nombreComun: nuevoArbol.nombreComun }))) {
            await new Especie({ nombreComun: nuevoArbol.nombreComun, nombreCientifico: nuevoArbol.nombreCientifico }).save();
        }

        res.status(201).json({ mensaje: `Árbol ${nuevoArbol.codigoArbol} guardado en la finca ${nuevoArbol.finca} y coordenadas encriptadas.` });
    } catch (error) { res.status(400).json({ error: 'Error al guardar el árbol o código repetido.' }); }
});

app.put('/api/arboles-matriz/:id', verificarAcceso, soloMotorCampo, async (req, res) => {
    try {
        const arbolActualizado = await ArbolMatriz.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!arbolActualizado) return res.status(404).json({ error: 'Árbol no encontrado' });
        res.json({ mensaje: 'Árbol actualizado', arbol: arbolActualizado });
    } catch (error) { res.status(500).json({ error: 'Error al actualizar árbol' }); }
});

app.post('/api/arboles-matriz/:id/monitoreo', verificarAcceso, soloMotorCampo, async (req, res) => {
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
        res.json({ mensaje: 'Seguimiento fenológico registrado.' });
    } catch (error) { res.status(500).json({ error: 'Error al reportar monitoreo' }); }
});

app.post('/api/lotes', verificarAcceso, soloMotorCampo, async (req, res) => {
    try {
        const { arbolMatrizId, origen, cantidadInicial } = req.body;
        const codigoLote = `BQ-${new Date().getMonth()+1}${new Date().getFullYear().toString().slice(-2)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const nuevoLote = new Lote({
            codigoLote, arbolMatrizId, registradoPor: req.usuarioActual,
            origen, cantidadInicial, cantidadActual: cantidadInicial, estadoActual: 'Semillero',
            historial: [{ estadoAlcanzado: 'Recolección', cantidadSuperviviente: cantidadInicial, observaciones: 'Ingreso a vivero', responsable: req.usuarioActual }]
        });
        await nuevoLote.save();
        res.status(201).json({ mensaje: `Lote ${codigoLote} registrado en semillero.` });
    } catch (error) { res.status(400).json({ error: 'Error al crear lote' }); }
});

app.post('/api/lotes/avanzar', verificarAcceso, soloMotorCampo, async (req, res) => {
    try {
        const lote = await Lote.findById(req.body.loteId);
        const cant = Number(req.body.cantidadSuperviviente);
        lote.estadoActual = req.body.nuevoEstado;
        lote.cantidadActual = cant;
        if (req.body.tamanoBolsa) lote.tamanoBolsa = req.body.tamanoBolsa;
        if (req.body.alturaCm !== undefined) lote.alturaCm = Number(req.body.alturaCm) || 0;

        lote.historial.push({ 
            estadoAlcanzado: req.body.nuevoEstado, 
            cantidadSuperviviente: cant, 
            tamanoBolsa: lote.tamanoBolsa,
            alturaCm: lote.alturaCm,
            observaciones: req.body.observaciones, 
            responsable: req.usuarioActual 
        });
        await lote.save();
        res.json({ mensaje: `Lote actualizado a ${req.body.nuevoEstado}.` });
    } catch (error) { res.status(500).json({ error: 'Error al avanzar lote' }); }
});

app.post('/api/lotes/retirar', verificarAcceso, soloMotorCampo, async (req, res) => {
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

app.delete('/api/lotes/:id', verificarAcceso, soloMotorCampo, async (req, res) => {
    try {
        await Lote.findByIdAndDelete(req.params.id);
        res.json({ mensaje: 'Registro eliminado correctamente' });
    } catch (error) { res.status(500).json({ error: 'Error al eliminar' }); }
});

// =======================================================
//   RUTAS PÚBLICAS Y DE ADMINISTRACIÓN PÚBLICA (ADMIN, CUSTODIO, FUNDADOR)
// =======================================================
app.get('/api/especies', async (req, res) => {
    try { res.json(await Especie.find()); } catch (error) { res.status(500).json({ error: 'Error al obtener vitrina' }); }
});
  
app.get('/api/lotes', async (req, res) => {
    try { res.json(await Lote.find().populate('arbolMatrizId')); } catch (error) { res.status(500).json({ error: 'Error al obtener lotes' }); }
});

app.put('/api/especies-vitrina', verificarAcceso, soloGestoresPublicos, async (req, res) => {
    try {
        const { nombreComun, nombreCientifico, imagenUrl, caracteristicas } = req.body;
        if (!nombreComun) return res.status(400).json({ error: 'Selecciona una especie.' });

        let especie = await Especie.findOne({ nombreComun: String(nombreComun).trim() });
        if (!especie) {
            especie = new Especie({ nombreComun: String(nombreComun).trim() });
        }
        if (nombreCientifico) especie.nombreCientifico = nombreCientifico;
        if (imagenUrl) especie.imagenUrl = imagenUrl;
        if (caracteristicas) especie.caracteristicas = caracteristicas;

        await especie.save();
        res.json({ mensaje: `Ficha pública de ${especie.nombreComun} actualizada.`, especie });
    } catch (error) { res.status(500).json({ error: 'Error al actualizar vitrina' }); }
});

app.put('/api/especies/:id', verificarAcceso, soloGestoresPublicos, async (req, res) => {
    try {
        const especie = await Especie.findById(req.params.id);
        if (req.body.caracteristicas) especie.caracteristicas = req.body.caracteristicas;
        if (req.body.imagenUrl) especie.imagenUrl = req.body.imagenUrl;
        if (req.body.nuevoSaber && req.body.nuevoSaber.autor) {
            especie.saberes.push({ autor: req.body.nuevoSaber.autor, descripcion: req.body.nuevoSaber.descripcion, fechaAporte: new Date() });
        }
        if (nombreCientifico) especie.nombreCientifico = nombreCientifico;
        if (imagenUrl) especie.imagenUrl = imagenUrl;
        if (caracteristicas) especie.caracteristicas = caracteristicas;

        await especie.save();
        res.json({ mensaje: `Ficha pública de ${especie.nombreComun} actualizada.`, especie });
    } catch (error) { res.status(500).json({ error: 'Error al actualizar vitrina' }); }
});

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
        const msj = estadoInicial === 'Publicado' ? '¡Crónica publicada en Territorio Vivo!' : '¡Tu relato fue enviado! Será revisado para publicarse.';
        res.status(201).json({ mensaje: msj, cronica: nueva });
    } catch (error) { res.status(400).json({ error: 'Completa todos los campos del relato.' }); }
});

app.put('/api/cronicas/:id', verificarAcceso, soloGestoresPublicos, async (req, res) => {
    try {
        const actualizada = await Cronica.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ mensaje: 'Crónica actualizada con éxito', cronica: actualizada });
    } catch (error) { res.status(500).json({ error: 'Error al actualizar la crónica' }); }
});

app.delete('/api/cronicas/:id', verificarAcceso, soloGestoresPublicos, async (req, res) => {
    try {
        if (req.rol !== 'Fundador' && req.rol !== 'Admin') return res.status(403).json({ error: 'Solo Fundador o Admin pueden borrar crónicas.' });
        await Cronica.findByIdAndDelete(req.params.id);
        res.json({ mensaje: 'Crónica eliminada' });
    } catch (error) { res.status(500).json({ error: 'Error al eliminar' }); }
});

// APADRINAMIENTOS
app.get('/api/apadrinamientos', async (req, res) => {
    try { res.json(await Apadrinamiento.find().sort({ fechaInicio: -1 })); } catch (error) { res.status(500).json({ error: 'Error al obtener apadrinamientos.' }); }
});

app.post('/api/apadrinamientos', verificarAcceso, soloGestoresPublicos, async (req, res) => {
    try {
        const { nombrePadrino, plan, cantidadArboles, especie, veredaRuta, loteCodigo, mensajeDedicatoria, imagenArbolUrl } = req.body;
        const sufijo = Math.random().toString(36).substring(2, 6).toUpperCase();
        const codigoCertificado = `PAD-26-${sufijo}`;
        const fechaFin = new Date();
        fechaFin.setFullYear(fechaFin.getFullYear() + 2);

        const nuevo = new Apadrinamiento({
            codigoCertificado,
            nombrePadrino: String(nombrePadrino).trim(),
            plan,
            cantidadArboles: Number(cantidadArboles) || 1,
            especie: String(especie).trim(),
            veredaRuta: String(veredaRuta || 'Bosques de San Luis, Antioquia').trim(),
            loteCodigo: String(loteCodigo || '').trim(),
            mensajeDedicatoria: String(mensajeDedicatoria || '').trim(),
            imagenArbolUrl: String(imagenArbolUrl || '').trim(),
            fechaFinCuidado: fechaFin,
            estadoCuidado: 'Sembrado / Ciclo de Establecimiento Activo',
            bitacoraMantenimiento: [{
                actividad: 'Apertura de Certificado y Asignación de Plántulas',
                observaciones: 'Inicio del ciclo de acompañamiento y establecimiento por 2 años.',
                fotoUrl: String(imagenArbolUrl || '').trim(),
                responsable: req.usuarioActual
            }],
            registradoPor: req.usuarioActual
        });
        await nuevo.save();
        res.status(201).json({ mensaje: `¡Certificado ${codigoCertificado} creado con éxito!`, apadrinamiento: nuevo });
    } catch (error) { res.status(400).json({ error: 'Error al registrar el apadrinamiento.' }); }
});

app.post('/api/apadrinamientos/:id/mantenimiento', verificarAcceso, soloGestoresPublicos, async (req, res) => {
    try {
        const pad = await Apadrinamiento.findById(req.params.id);
        if (!pad) return res.status(404).json({ error: 'Certificado no encontrado.' });
        if (req.body.estadoCuidado) pad.estadoCuidado = req.body.estadoCuidado;
        pad.bitacoraMantenimiento.push({
            actividad: req.body.actividad,
            observaciones: req.body.observaciones || '',
            fotoUrl: req.body.fotoUrl || '',
            responsable: req.usuarioActual,
            fecha: new Date()
        });
        await pad.save();
        res.json({ mensaje: 'Reporte de mantenimiento agregado.', apadrinamiento: pad });
    } catch (error) { res.status(500).json({ error: 'Error al registrar mantenimiento.' }); }
});

app.delete('/api/apadrinamientos/:id', verificarAcceso, soloGestoresPublicos, async (req, res) => {
    try {
        if (req.rol !== 'Fundador' && req.rol !== 'Admin') return res.status(403).json({ error: 'Solo Fundador o Admin pueden eliminar certificados.' });
        await Apadrinamiento.findByIdAndDelete(req.params.id);
        res.json({ mensaje: 'Certificado eliminado.' });
    } catch (error) { res.status(500).json({ error: 'Error al eliminar.' }); }
});

// =======================================================
//   AUTENTICACIÓN Y GOBERNANZA (FUNDADOR)
// =======================================================
app.post('/api/login', async (req, res) => {
    try {
        const usuario = await User.findOne({ email: String(req.body.email).trim() });
        if (!usuario || !(await bcrypt.compare(String(req.body.password), usuario.password))) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }
        const rolReal = (usuario.email === 'bosquesinos') ? 'Fundador' : usuario.rol;
        const token = jwt.sign({ id: usuario._id, email: usuario.email, rol: rolReal }, CLAVE_SECRETA, { expiresIn: '12h' });
        res.json({ token, rol: rolReal, email: usuario.email });
    } catch (error) { res.status(500).json({ error: 'Error en el servidor' }); }
});

app.post('/api/registro-publico', async (req, res) => {
    try {
        if (await User.findOne({ email: String(req.body.email).trim() })) {
            return res.status(400).json({ error: 'El correo o usuario ya está registrado.' });
        }
        const passwordEncriptada = await bcrypt.hash(String(req.body.password), 10);
        await new User({ email: String(req.body.email).trim(), password: passwordEncriptada, rol: 'Vigía' }).save();
        res.status(201).json({ mensaje: 'Cuenta creada con éxito. Ya puedes iniciar sesión.' });
    } catch (error) { res.status(500).json({ error: 'Error al registrar la cuenta.' }); }
});

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
        res.json({ mensaje: '¡Postulación enviada! El Fundador revisará tu solicitud.' });
    } catch (error) { res.status(500).json({ error: 'Error al procesar la postulación' }); }
});

app.get('/api/postulaciones-pendientes', verificarAcceso, soloFundador, async (req, res) => {
    try {
        const pendientes = await User.find({ 'postulacionCustodio.estado': 'Pendiente' }, '-password');
        res.json(pendientes);
    } catch (error) {
        console.error('Error en /api/postulaciones-pendientes:', error);
        res.status(500).json({ error: 'Error al obtener postulaciones' });
    }
});

app.put('/api/resolver-postulacion/:id', verificarAcceso, soloFundador, async (req, res) => {
    try {
        const { decision } = req.body;
        const usuario = await User.findById(req.params.id);
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
        usuario.postulacionCustodio.estado = decision;
        if (decision === 'Aprobada') usuario.rol = 'Custodio';
        await usuario.save();
        res.json({ mensaje: `Postulación ${decision.toLowerCase()} con éxito.` });
    } catch (error) { res.status(500).json({ error: 'Error al resolver postulación' }); }
});

app.get('/api/usuarios', verificarAcceso, soloFundador, async (req, res) => {
    try {
        const usuarios = await User.find({}, '-password').sort({ rol: 1, email: 1 });
        res.json(usuarios);
    } catch (error) {
        console.error('Error en /api/usuarios:', error);
        res.status(500).json({ error: 'Error al obtener la lista de usuarios.' });
    }
});

app.put('/api/usuarios/:id/rol', verificarAcceso, soloFundador, async (req, res) => {
    try {
        const { nuevoRol } = req.body;
        if (!['Fundador', 'Custodio', 'Admin', 'Vigía'].includes(nuevoRol)) {
            return res.status(400).json({ error: 'Rol no válido.' });
        }
        await User.findByIdAndUpdate(req.params.id, { $set: { rol: nuevoRol } });
        res.json({ mensaje: `Rol actualizado a ${nuevoRol}.` });
    } catch (error) {
        console.error('Error cambiando rol:', error);
        res.status(500).json({ error: 'Error al actualizar el rol.' });
    }
});

app.post('/api/registrar-asociado', verificarAcceso, soloFundador, async (req, res) => {
    try {
        if (await User.findOne({ email: String(req.body.email).trim() })) return res.status(400).json({ error: 'Usuario ya registrado' });
        const passwordEncriptada = await bcrypt.hash(String(req.body.password), 10);
        const rolAsignado = req.body.rol || 'Custodio';
        await new User({ email: String(req.body.email).trim(), password: passwordEncriptada, rol: rolAsignado }).save();
        res.status(201).json({ mensaje: `${rolAsignado} registrado con éxito.` });
    } catch (error) { res.status(400).json({ error: 'Error al registrar' }); }
});

app.put('/api/fundador-reset-password', verificarAcceso, soloFundador, async (req, res) => {
    try {
        const { identificador, nuevaPassword } = req.body;
        const usuario = await User.findOne({ email: String(identificador).trim() });
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado.' });
        const passwordEncriptada = await bcrypt.hash(String(nuevaPassword), 10);
        await User.updateOne({ _id: usuario._id }, { $set: { password: passwordEncriptada } });
        res.json({ mensaje: `¡Contraseña de ${usuario.email} restablecida!` });
    } catch (error) { res.status(500).json({ error: 'Error al cambiar la contraseña.' }); }
});

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { console.log(`Servidor activo en puerto ${PORT}`); });