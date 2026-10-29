const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken'); 
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const app = express();
app.use(cors());         
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ limit: '12mb', extended: true }));

// Proteger archivos del servidor
app.use((req, res, next) => {
    const archivosProtegidos = ['/softwarebosquesino.js', '/package.json', '/package-lock.json', '/.env'];
    if (archivosProtegidos.includes(req.path.toLowerCase())) {
        return res.status(403).send('Acceso denegado');
    }
    next();
});
app.use(express.static(__dirname));

// --- CONFIGURACIÓN DE SEGURIDAD AES-256 ---
const CLAVE_SECRETA = process.env.JWT_SECRET || 'bosquesinos_semilla_secreta_2026';
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
  .then(async () => {
    console.log('¡Conexión a MongoDB Atlas exitosa!');
    await crearUsuarioAdmin(); 
    await crearPublicacionesIniciales();
  })
  .catch(err => console.error('Error conectando a la base de datos:', err));

// --- 2. MODELOS DE DATOS ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, unique: true, sparse: true }, // Opcional, pero único si lo escriben
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

// FASE 0: Fincas Integrales Campesinas
const fincaSchema = new mongoose.Schema({
    nombreFinca: { type: String, required: true },
    vereda: { type: String, required: true },
    propietario: { type: String, required: true },
    contactoPropietario: { type: String, default: '' },
    observacionesBosque: { type: String, default: '' },
    registradaPor: { type: String, required: true },
    fechaRegistro: { type: Date, default: Date.now }
});
const Finca = mongoose.model('Finca', fincaSchema);

// FASE 1: Árbol Madre Semillero (Formato Campo MV26)
const arbolMatrizSchema = new mongoose.Schema({
    codigoArbol: { type: String, required: true, unique: true }, 
    contador: { type: Number, default: 0 },
    numeroArbol: { type: Number, default: 0 },
    nombreComun: { type: String, required: true },
    nombreCientifico: { type: String, default: '' },
    dap: { type: Number, default: 0 },
    flores: { type: Number, default: 0 },
    frutos: { type: Number, default: 0 },
    rebrote: { type: Number, default: 0 },
    fincaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Finca' },
    finca: { type: String, default: 'Finca en concertación' },
    veredaSector: { type: String, default: 'San Luis' },
    propietarioFinca: { type: String, default: '' },
    custodio: { type: String, required: true },
    registradoPor: { type: String, required: true },
    coordenadasGPSEncriptadas: { type: String, default: '' },
    fechaSeleccion: { type: Date, default: Date.now },
    monitoreos: [{
        fechaObservacion: { type: Date, default: Date.now },
        estadoFenologico: { type: String, required: true },
        flores: { type: Number, default: 0 },
        frutos: { type: Number, default: 0 },
        rebrote: { type: Number, default: 0 },
        observaciones: { type: String },
        registrador: { type: String }
    }]
});
const ArbolMatriz = mongoose.model('ArbolMatriz', arbolMatrizSchema);

// FASE 2: Camadas de Semillas y Vivero
const loteSchema = new mongoose.Schema({
    codigoLote: { type: String, required: true, unique: true }, 
    arbolMatrizId: { type: mongoose.Schema.Types.ObjectId, ref: 'ArbolMatriz' },
    especieNombre: { type: String, default: '' },
    registradoPor: { type: String, required: true },
    origen: {
        responsableRecoleccion: { type: String, default: 'Vivero Comunitario' },
        fechaRecoleccion: { type: Date, default: Date.now }
    },
    cantidadInicial: { type: Number, required: true }, 
    cantidadActual: { type: Number, required: true },  
    estadoActual: { type: String, default: 'Semillero' },
    tamanoBolsa: { type: String, default: 'Sin bolsa' },
    alturaCm: { type: Number, default: 0 },
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

// FASE 3: Catálogo de Especies y Saberes
const especieSchema = new mongoose.Schema({
    nombreComun: { type: String, required: true, unique: true },
    nombreCientifico: { type: String, default: '' },
    caracteristicas: { type: String, default: '' },
    imagenUrl: { type: String, default: '' },
    saberes: [{
        tipoSaber: { type: String, default: '🌿 Saber Campesino' },
        descripcion: { type: String, required: true },
        autor: { type: String, required: true }, 
        fechaAporte: { type: Date, default: Date.now }
    }]
});
const Especie = mongoose.model('Especie', especieSchema);

// FASE 4: Plaza de Saberes, Cosechas, Plantas Medicinales y Recetas
const cronicaSchema = new mongoose.Schema({
    titulo: { type: String, default: '' },
    categoria: { type: String, default: '🌱 Semillas Nativas y Criollas' },
    veredaTerritorio: { type: String, default: 'San Luis, Antioquia' },
    contactoDirecto: { type: String, default: '' },
    contenido: { type: String, required: true },
    imagenes: [{ type: String }], // Guarda una o varias fotos
    imagenUrl: { type: String, default: '' },
    usosSaberes: { type: String, default: '' }, // Para qué sirve, uso medicinal, receta o secreto de siembra
    imagenUrl: { type: String, default: '' },
    autor: { type: String, required: true },
    rolAutor: { type: String, default: 'Científico Empírico' },
    fechaPublicacion: { type: Date, default: Date.now },
    reacciones: {
        orgullo: { type: Number, default: 0 },
        trueque: { type: Number, default: 0 },
        semilla: { type: Number, default: 0 },
        saber: { type: Number, default: 0 }
    },
    comentarios: [{
        autor: { type: String, required: true },
        rolAutor: { type: String, default: 'Campesino' },
        tipoAporte: { type: String, default: '💬 Comentario / Conversa' }, // Uso medicinal, Receta, Saber ancestral, Trueque
        texto: { type: String, required: true },
        fecha: { type: Date, default: Date.now }
    }]
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

// --- AUTO-CREACIÓN FUNDADOR Y PUBLICACIÓN INICIAL ---
async function crearUsuarioAdmin() {
    try {
        const usuarioExiste = await User.findOne({ username: 'bosquesinos' });
        if (!usuarioExiste) {
            const passInicial = process.env.ADMIN_INITIAL_PASS || crypto.randomBytes(16).toString('hex');
            const passwordEncriptada = await bcrypt.hash(passInicial, 10);
            await new User({ username: 'bosquesinos', password: passwordEncriptada, rol: 'Fundador' }).save();
        } else if (usuarioExiste.rol !== 'Fundador') {
            await User.updateOne({ username: 'bosquesinos' }, { $set: { rol: 'Fundador' } });
        }
    } catch (error) { console.log('Error inicial:', error); }
}

async function crearPublicacionesIniciales() {
    try {
        const cuenta = await Cronica.countDocuments();
        if (cuenta === 0) {
            await Cronica.insertMany([
                {
                    titulo: 'Almendrón de montaña y semillas con memoria genética de San Luis',
                    categoria: '🌱 Semillas Nativas y Criollas',
                    veredaTerritorio: 'Veredas de San Luis, Antioquia',
                    contenido: 'Como científicos empíricos del bosque hemos aprendido que un árbol no es solo madera: detrás de cada Almendrón, Laurel o Soto hay alimento para las aves, abrigo para las quebradas y semillas con la memoria viva de nuestra tierra.',
                    usosSaberes: 'El fruto del Almendrón alimenta a la fauna silvestre en peligro y sus hojas ayudan a crear colchón de tierra fértil cerca de los nacimientos de agua.',
                    autor: 'Comunidad Bosquesinos',
                    rolAutor: 'Científicos Empíricos',
                    reacciones: { orgullo: 5, trueque: 2, semilla: 4, saber: 6 },
                    comentarios: [
                        {
                            autor: 'Sabedores del Oriente',
                            rolAutor: 'Custodio',
                            tipoAporte: '🌙 Saber Ancestral / Secreto de Siembra',
                            texto: 'Sembrar en menguante y con las primeras lluvias garantiza que la raíz agarre fuerza antes del verano.'
                        }
                    ]
                }
            ]);
        }
    } catch (e) { console.log('Error creando publicaciones iniciales:', e); }
}

// --- MIDDLEWARES DE ACCESO ---
function verificarAcceso(req, res, next) {
    const headerAuth = req.headers['authorization'];
    if (!headerAuth) return res.status(403).json({ error: 'Acceso denegado' });
    try {
        const decodificado = jwt.verify(headerAuth.replace('Bearer ', '').trim(), CLAVE_SECRETA);
        req.usuarioActual = decodificado.username; 
        req.rol = (decodificado.username === 'bosquesinos') ? 'Fundador' : decodificado.rol;
        next(); 
    } catch (error) { return res.status(401).json({ error: 'Token inválido o expirado' }); }
}

function soloMotorCampo(req, res, next) {
    if (req.rol === 'Fundador' || req.rol === 'Custodio') {
        next();
    } else {
        return res.status(403).json({ error: 'Espacio para Custodios y Coordinadores de Vivero.' });
    }
}

function soloGestoresPublicos(req, res, next) {
    if (req.rol === 'Fundador' || req.rol === 'Custodio' || req.rol === 'Admin') {
        next();
    } else {
        return res.status(403).json({ error: 'No tienes permisos para esta acción.' });
    }
}

function soloFundador(req, res, next) {
    if (req.rol === 'Fundador') {
        next();
    } else {
        return res.status(403).json({ error: 'Acción exclusiva del Coordinador Fundador.' });
    }
}

// =======================================================
//   RUTAS DE FINCAS CAMPESINAS INTEGRALES
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
        res.status(201).json({ mensaje: `Finca campesina "${nuevaFinca.nombreFinca}" guardada con éxito.`, finca: nuevaFinca });
    } catch (error) { res.status(400).json({ error: 'Error al registrar la finca' }); }
});

app.delete('/api/fincas/:id', verificarAcceso, soloFundador, async (req, res) => {
    try {
        await Finca.findByIdAndDelete(req.params.id);
        res.json({ mensaje: 'Finca eliminada.' });
    } catch (error) { res.status(500).json({ error: 'Error al eliminar finca' }); }
});

// =======================================================
//   RUTAS DE ÁRBOLES MADRE Y CAMADAS DE VIVERO
// =======================================================
app.get('/api/arboles-matriz', verificarAcceso, async (req, res) => {
    try {
        const arboles = await ArbolMatriz.find().sort({ contador: 1, fechaSeleccion: -1 });
        res.json(arboles);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener árboles' });
    }
});

app.post('/api/arboles-matriz', verificarAcceso, soloMotorCampo, async (req, res) => {
    try {
        const { codigoArbol, contador, numeroArbol, nombreComun, nombreCientifico, dap, flores, frutos, rebrote, fincaId, finca, veredaSector, propietarioFinca, custodio, coordenadasGPS } = req.body;
        
        const codGenerado = codigoArbol ? String(codigoArbol).trim().toUpperCase() : `MV26-${contador || 'X'}-A${numeroArbol || '1'}`;
        const fFlores = Number(flores) || 0;
        const fFrutos = Number(frutos) || 0;
        const fRebrote = Number(rebrote) || 0;
        const resumenFeno = fFrutos === 2 ? 'Semilla madura' : (fFrutos === 1 ? 'Fruto verde' : (fFlores > 0 ? 'Floración' : 'Hojas'));

        const nuevoArbol = new ArbolMatriz({
            codigoArbol: codGenerado,
            contador: Number(contador) || 0,
            numeroArbol: Number(numeroArbol) || 0,
            nombreComun: String(nombreComun).trim(),
            nombreCientifico: String(nombreCientifico || '').trim(),
            dap: Number(dap) || 0,
            flores: fFlores,
            frutos: fFrutos,
            rebrote: fRebrote,
            fincaId: fincaId || null,
            finca: String(finca || 'Finca Custodiada').trim(),
            veredaSector: String(veredaSector || 'San Luis').trim(),
            propietarioFinca: String(propietarioFinca || custodio || '').trim(),
            custodio: String(custodio || req.usuarioActual).trim(),
            registradoPor: req.usuarioActual,
            coordenadasGPSEncriptadas: encriptarCoordenadas(coordenadasGPS),
            monitoreos: [{
                estadoFenologico: resumenFeno,
                flores: fFlores,
                frutos: fFrutos,
                rebrote: fRebrote,
                observaciones: `Grosor inicial (DAP): ${dap || 0} cm`,
                registrador: req.usuarioActual
            }]
        });
        await nuevoArbol.save();

        if (!(await Especie.findOne({ nombreComun: nuevoArbol.nombreComun }))) {
            await new Especie({ nombreComun: nuevoArbol.nombreComun, nombreCientifico: nuevoArbol.nombreCientifico }).save();
        }

        res.status(201).json({ mensaje: `Árbol Madre ${nuevoArbol.codigoArbol} (${nuevoArbol.nombreComun}) guardado con éxito.` });
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
        res.json({ mensaje: 'Observación de campo registrada.' });
    } catch (error) { res.status(500).json({ error: 'Error al guardar observación' }); }
});

app.post('/api/lotes', verificarAcceso, soloMotorCampo, async (req, res) => {
    try {
        const { arbolMatrizId, origen, cantidadInicial } = req.body;
        const codigoLote = `BQ-${new Date().getMonth()+1}${new Date().getFullYear().toString().slice(-2)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const nuevoLote = new Lote({
            codigoLote, arbolMatrizId, registradoPor: req.usuarioActual,
            origen, cantidadInicial, cantidadActual: cantidadInicial, estadoActual: 'Semillero',
            historial: [{ estadoAlcanzado: 'Cosecha de semilla', cantidadSuperviviente: cantidadInicial, observaciones: 'Siembra en semillero', responsable: req.usuarioActual }]
        });
        await nuevoLote.save();
        res.status(201).json({ mensaje: `Camada ${codigoLote} puesta en el semillero.` });
    } catch (error) { res.status(400).json({ error: 'Error al crear camada' }); }
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
        res.json({ mensaje: `Camada actualizada a ${req.body.nuevoEstado}.` });
    } catch (error) { res.status(500).json({ error: 'Error al avanzar camada' }); }
});

app.post('/api/lotes/retirar', verificarAcceso, soloMotorCampo, async (req, res) => {
    try {
        const lote = await Lote.findById(req.body.loteId);
        const cant = Number(req.body.cantidadRetirar);
        lote.cantidadActual -= cant;
        if (lote.cantidadActual <= 0) {
            await Lote.findByIdAndDelete(req.body.loteId);
            return res.json({ mensaje: 'Camada cerrada porque la cantidad llegó a 0' });
        }
        lote.historial.push({ estadoAlcanzado: lote.estadoActual, cantidadSuperviviente: lote.cantidadActual, observaciones: `Salida: ${req.body.motivo}`, responsable: req.usuarioActual });
        await lote.save();
        res.json({ mensaje: `Se descontaron ${cant} arbolitos.` });
    } catch (error) { res.status(500).json({ error: 'Error al retirar' }); }
});

app.delete('/api/lotes/:id', verificarAcceso, soloMotorCampo, async (req, res) => {
    try {
        await Lote.findByIdAndDelete(req.params.id);
        res.json({ mensaje: 'Registro eliminado correctamente' });
    } catch (error) { res.status(500).json({ error: 'Error al eliminar' }); }
});

// =======================================================
//   CATÁLOGO DE ESPECIES Y SABERES ABIERTOS A TODAS LAS CUENTAS
// =======================================================
app.get('/api/especies', async (req, res) => {
    try { res.json(await Especie.find().sort({ nombreComun: 1 })); } catch (error) { res.status(500).json({ error: 'Error al obtener catálogo' }); }
});
  
app.get('/api/lotes', async (req, res) => {
    try { res.json(await Lote.find().populate('arbolMatrizId')); } catch (error) { res.status(500).json({ error: 'Error al obtener lotes' }); }
});

app.post('/api/lotes-base', verificarAcceso, soloMotorCampo, async (req, res) => {
    try {
        const { especieNombre, cantidad, tamanoBolsa } = req.body;
        const codigoLote = `VIV-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        
        let especie = await Especie.findOne({ nombreComun: String(especieNombre).trim() });
        if (!especie) {
            especie = new Especie({ nombreComun: String(especieNombre).trim() });
            await especie.save();
        }

        const nuevoLote = new Lote({
            codigoLote, 
            especieNombre: especie.nombreComun,
            registradoPor: req.usuarioActual,
            origen: { responsableRecoleccion: 'Vivero Comunitario', fechaRecoleccion: new Date() },
            cantidadInicial: Number(cantidad), 
            cantidadActual: Number(cantidad), 
            estadoActual: 'Vivero',
            tamanoBolsa: tamanoBolsa,
            historial: [{ estadoAlcanzado: 'Vivero', cantidadSuperviviente: Number(cantidad), tamanoBolsa, observaciones: 'Arbolitos en bolsa en vivero', responsable: req.usuarioActual }]
        });
        await nuevoLote.save();
        res.status(201).json({ mensaje: `Sumados ${cantidad} arbolitos de ${especieNombre} al vivero.` });
    } catch (error) { res.status(400).json({ error: 'Error al registrar en vivero' }); }
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
        res.json({ mensaje: `Historia y foto de ${especie.nombreComun} actualizada.`, especie });
    } catch (error) { res.status(500).json({ error: 'Error al actualizar especie' }); }
});

// CUALQUIER CUENTA REGISTRADA PUEDE APORTAR SABERES, USOS MEDICINALES O RECETAS A UNA ESPECIE
app.put('/api/especies/:id', verificarAcceso, async (req, res) => {
    try {
        const especie = await Especie.findById(req.params.id);
        if (!especie) return res.status(404).json({ error: 'Especie no encontrada' });

        if ((req.rol === 'Fundador' || req.rol === 'Custodio' || req.rol === 'Admin')) {
            if (req.body.caracteristicas) especie.caracteristicas = req.body.caracteristicas;
            if (req.body.imagenUrl) especie.imagenUrl = req.body.imagenUrl;
        }
        if (req.body.nuevoSaber && req.body.nuevoSaber.descripcion) {
            especie.saberes.push({
                tipoSaber: req.body.nuevoSaber.tipoSaber || '🌿 Saber Campesino',
                autor: req.body.nuevoSaber.autor || req.usuarioActual,
                descripcion: req.body.nuevoSaber.descripcion,
                fechaAporte: new Date()
            });
        }
        await especie.save();
        res.json({ mensaje: `¡Saber campesino guardado en ${especie.nombreComun}!`, especie });
    } catch (error) { res.status(500).json({ error: 'Error al guardar saber' }); }
});

// =======================================================
//   PLAZA DE SABERES, COSECHAS Y CULTURA CAMPESINA (ABIERTO A TODOS)
// =======================================================
app.get('/api/cronicas', async (req, res) => {
    try {
        const publicaciones = await Cronica.find().sort({ fechaPublicacion: -1, _id: -1 });
        res.json(publicaciones);
    } catch (error) { res.status(500).json({ error: 'Error al cargar la Plaza de Saberes' }); }
});

// TODAS LAS CUENTAS REGISTRADAS PUEDEN PUBLICAR
app.post('/api/cronicas', verificarAcceso, async (req, res) => {
    try {
        const { categoria, contenido, imagenes } = req.body;
    const nuevaPublicacion = new Cronica({
        categoria: categoria || '',
        contenido: String(contenido || '').trim(),
        imagenes: Array.isArray(imagenes) ? imagenes : [],
        autor: req.usuarioActual,
        rolAutor: req.rol
    });
        await nuevaPublicacion.save();
        res.status(201).json({ mensaje: '¡Compartido con éxito en la Plaza de Saberes!' });
    } catch (error) {
        res.status(400).json({ error: 'Error al publicar en el muro.' });
    }
});

app.post('/api/cronicas/:id/reaccionar', async (req, res) => {
    try {
        const { tipo } = req.body;
        if (!['orgullo', 'trueque', 'semilla', 'saber'].includes(tipo)) {
            return res.status(400).json({ error: 'Reacción no válida' });
        }
        const campo = `reacciones.${tipo}`;
        const pub = await Cronica.findByIdAndUpdate(
            req.params.id,
            { $inc: { [campo]: 1 } },
            { new: true }
        );
        res.json(pub.reacciones);
    } catch (error) {
        res.status(400).json({ error: 'Error al registrar reacción' });
    }
});

// TODAS LAS CUENTAS PUEDEN COMENTAR USOS, RECETAS Y SABERES ANCESTRALES
app.post('/api/cronicas/:id/comentarios', verificarAcceso, async (req, res) => {
    try {
        const pub = await Cronica.findById(req.params.id);
        if (!pub) return res.status(404).json({ error: 'Publicación no encontrada' });
        pub.comentarios.push({
            autor: req.usuarioActual,
            rolAutor: req.rol,
            tipoAporte: String(req.body.tipoAporte || '💬 Comentario / Conversa').trim(),
            texto: String(req.body.texto).trim()
        });
        await pub.save();
        res.status(201).json({ mensaje: 'Saber y comentario agregado' });
    } catch (error) {
        res.status(400).json({ error: 'Error al comentar' });
    }
});

app.delete('/api/cronicas/:id', verificarAcceso, async (req, res) => {
    try {
        const pub = await Cronica.findById(req.params.id);
        if (!pub) return res.status(404).json({ error: 'No encontrada' });
        if (req.rol !== 'Fundador' && req.rol !== 'Admin' && pub.autor !== req.usuarioActual) {
            return res.status(403).json({ error: 'Solo quien publicó o el Coordinador puede borrar esta publicación.' });
        }
        await Cronica.findByIdAndDelete(req.params.id);
        res.json({ mensaje: 'Publicación eliminada' });
    } catch (error) { res.status(500).json({ error: 'Error al eliminar' }); }
});

// =======================================================
//   APADRINAMIENTOS
// =======================================================
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
            estadoCuidado: 'Sembrado / Cuidado Campesino Activo',
            bitacoraMantenimiento: [{
                actividad: 'Asignación de Arbolitos y Apertura de Certificado',
                observaciones: 'Inicio de los 2 años de acompañamiento campesino.',
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
        res.json({ mensaje: 'Limpieza/Plateo registrado.', apadrinamiento: pad });
    } catch (error) { res.status(500).json({ error: 'Error al registrar mantenimiento.' }); }
});

app.delete('/api/apadrinamientos/:id', verificarAcceso, soloGestoresPublicos, async (req, res) => {
    try {
        if (req.rol !== 'Fundador' && req.rol !== 'Admin') return res.status(403).json({ error: 'Solo el Coordinador puede eliminar certificados.' });
        await Apadrinamiento.findByIdAndDelete(req.params.id);
        res.json({ mensaje: 'Certificado eliminado.' });
    } catch (error) { res.status(500).json({ error: 'Error al eliminar.' }); }
});

// =======================================================
//   CUENTAS Y COMUNIDAD (COMPATIBLE CON NOMBRE O CORREO)
// =======================================================
app.post('/api/login', async (req, res) => {
    try {
        const id = String(req.body.identificador || req.body.email || '').trim().toLowerCase();
        const usuario = await User.findOne({ 
            $or: [ { username: id }, { email: id } ] 
        });
        
        if (!usuario || !(await bcrypt.compare(String(req.body.password), usuario.password))) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }
        const rolReal = (usuario.username === 'bosquesinos') ? 'Fundador' : usuario.rol;
        const token = jwt.sign({ id: usuario._id, username: usuario.username, rol: rolReal }, CLAVE_SECRETA, { expiresIn: '12h' });
        res.json({ token, rol: rolReal, username: usuario.username });
    } catch (error) { res.status(500).json({ error: 'Error en el servidor' }); }
});

app.post('/api/registro-publico', async (req, res) => {
    try {
        const username = String(req.body.username || '').trim().toLowerCase();
        const email = req.body.email ? String(req.body.email).trim().toLowerCase() : undefined;
        
        if (!username) return res.status(400).json({ error: 'Escribe un nombre de usuario.' });
        if (await User.findOne({ username })) {
            return res.status(400).json({ error: 'Ese nombre de usuario ya está en uso.' });
        }
        if (email && await User.findOne({ email })) {
            return res.status(400).json({ error: 'Ese correo ya está registrado.' });
        }

        const passwordEncriptada = await bcrypt.hash(String(req.body.password), 10);
        const nuevoUser = new User({ username, password: passwordEncriptada, rol: 'Vigía' });
        if (email) nuevoUser.email = email;
        await nuevoUser.save();

        res.status(201).json({ mensaje: 'Cuenta creada con éxito. Ya puedes iniciar sesión.' });
    } catch (error) { 
        res.status(500).json({ error: 'Error al registrar la cuenta.' }); 
    }
});

app.post('/api/olvide-password', async (req, res) => {
    try {
        const emailLimpio = String(req.body.email || '').trim().toLowerCase();
        const usuario = await User.findOne({ 
            email: { $regex: new RegExp(`^${emailLimpio}$`, 'i') } 
        });
        if (!usuario) return res.status(404).json({ error: 'No hay ningún usuario registrado con ese correo.' });

        const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
        usuario.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        usuario.resetPasswordExpire = Date.now() + 15 * 60 * 1000;
        await usuario.save();

        const scriptUrl = (process.env.GOOGLE_SCRIPT_URL || '').trim();
        if (!scriptUrl) {
            return res.status(500).json({ error: 'Falta configurar GOOGLE_SCRIPT_URL en Render.' });
        }

        const textoCorreo = `Hola,\n\nHas solicitado recuperar tu clave en Bosquesinos.\n\nTu código de 6 números es: ${resetToken}\n\nVence en 15 minutos.`;

        const rta = await fetch(scriptUrl, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                secreto: "bosquesinos_correo_2026",
                to: usuario.email,
                subject: 'Código de Recuperación - Bosquesinos',
                text: textoCorreo
            })
        });

        const textoRespuesta = await rta.text();
        if (textoRespuesta.includes('<!DOCTYPE html>') || textoRespuesta.includes('<html')) {
            return res.status(500).json({ error: 'El script de correo requiere permisos públicos.' });
        }

        res.json({ mensaje: 'Código de 6 números enviado a tu correo.' });
    } catch (error) { 
        res.status(500).json({ error: 'Fallo al enviar: ' + error.message }); 
    }
});

app.post('/api/reset-password', async (req, res) => {
    try {
        const codigo = String(req.body.token || '').trim();
        const nuevaPassword = String(req.body.nuevaPassword || '');
        if (nuevaPassword.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
        }

        const resetPasswordToken = crypto.createHash('sha256').update(codigo).digest('hex');
        const usuario = await User.findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() }
        });
        if (!usuario) return res.status(400).json({ error: 'El código es inválido o ya venció.' });

        usuario.password = await bcrypt.hash(nuevaPassword, 10);
        usuario.resetPasswordToken = undefined;
        usuario.resetPasswordExpire = undefined;
        await usuario.save();

        res.json({ mensaje: '¡Contraseña actualizada! Ya puedes entrar.' });
    } catch (error) { 
        res.status(500).json({ error: 'Error al actualizar la contraseña.' }); 
    }
});

app.get('/api/mi-perfil', verificarAcceso, async (req, res) => {
    try {
        const usuario = await User.findOne({ $or: [{ email: req.usuarioActual }, { username: req.usuarioActual }] }, '-password');
        res.json(usuario);
    } catch (error) { res.status(500).json({ error: 'Error al obtener perfil' }); }
});

app.post('/api/postular-custodio', verificarAcceso, async (req, res) => {
    try {
        const { vereda, tamañoPredio, tipoBosque } = req.body;
        const usuario = await User.findOne({ $or: [{ email: req.usuarioActual }, { username: req.usuarioActual }] });
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
        usuario.postulacionCustodio = {
            estado: 'Pendiente',
            vereda: String(vereda || '').trim(),
            tamañoPredio: String(tamañoPredio || '').trim(),
            tipoBosque: String(tipoBosque || '').trim()
        };
        await usuario.save();
        res.json({ mensaje: '¡Solicitud enviada! Nos pondremos en contacto para conversar sobre tu bosque o finca.' });
    } catch (error) { res.status(500).json({ error: 'Error al enviar solicitud' }); }
});

app.get('/api/postulaciones-pendientes', verificarAcceso, soloFundador, async (req, res) => {
    try {
        const pendientes = await User.find({ 'postulacionCustodio.estado': 'Pendiente' }, '-password');
        res.json(pendientes);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener solicitudes' });
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
        res.json({ mensaje: `Compañero actualizado (${decision.toLowerCase()}).` });
    } catch (error) { res.status(500).json({ error: 'Error al actualizar solicitud' }); }
});

app.get('/api/usuarios', verificarAcceso, soloFundador, async (req, res) => {
    try {
        const usuarios = await User.find({}, '-password').sort({ rol: 1, email: 1 });
        res.json(usuarios);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener la lista de miembros.' });
    }
});

app.put('/api/usuarios/:id/rol', verificarAcceso, soloFundador, async (req, res) => {
    try {
        const { nuevoRol } = req.body;
        if (!['Fundador', 'Custodio', 'Admin', 'Vigía'].includes(nuevoRol)) {
            return res.status(400).json({ error: 'Rol no válido.' });
        }
        await User.findByIdAndUpdate(req.params.id, { $set: { rol: nuevoRol } });
        res.json({ mensaje: `Rol cambiado a ${nuevoRol}.` });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar el rol.' });
    }
});

app.post('/api/registrar-asociado', verificarAcceso, soloFundador, async (req, res) => {
    try {
        const id = String(req.body.email).trim();
        if (await User.findOne({ $or: [{ email: id }, { username: id }] })) return res.status(400).json({ error: 'Ese usuario ya existe' });
        const passwordEncriptada = await bcrypt.hash(String(req.body.password), 10);
        const rolAsignado = req.body.rol || 'Custodio';
        await new User({ email: id, username: id, password: passwordEncriptada, rol: rolAsignado }).save();
        res.status(201).json({ mensaje: `Compañero registrado como ${rolAsignado}.` });
    } catch (error) { res.status(400).json({ error: 'Error al registrar' }); }
});

app.get('/custodios', (req, res) => { res.sendFile(__dirname + '/index.html'); });
app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { console.log(`Servidor Bosquesinos activo en puerto ${PORT}`); });