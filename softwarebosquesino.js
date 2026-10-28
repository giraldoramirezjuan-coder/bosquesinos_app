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
app.use(express.json({ limit: '1mb' })); 
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// Evitar que descarguen el código del backend o el package.json desde el navegador
app.use((req, res, next) => {
    const archivosProtegidos = ['/softwarebosquesino.js', '/package.json', '/package-lock.json', '/.env'];
    if (archivosProtegidos.includes(req.path.toLowerCase())) {
        return res.status(403).send('Acceso denegado');
    }
    next();
});
app.use(express.static(__dirname));

// --- CONFIGURACIÓN DE SEGURIDAD AES-256 ---
const CLAVE_SECRETA = process.env.JWT_SECRET 
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

// FASE 1: Árbol Matriz (Formato Campo MV26 + Vínculo con Finca)
const arbolMatrizSchema = new mongoose.Schema({
    codigoArbol: { type: String, required: true, unique: true }, 
    contador: { type: Number, default: 0 },        // Columna: Contador
    numeroArbol: { type: Number, default: 0 },     // Columna: No. Arbol
    nombreComun: { type: String, required: true }, // Columna: N. Local
    nombreCientifico: { type: String, default: '' }, // Columna: N. Cientifico
    dap: { type: Number, default: 0 },             // Columna: DAP (cm)
    flores: { type: Number, default: 0 },          // 0: Inexistente, 1: Inicio, 2: Abundante
    frutos: { type: Number, default: 0 },          // 0: Inexistente, 1: Inicio, 2: Abundante
    rebrote: { type: Number, default: 0 },         // 0: Inexistente, 1: Inicio, 2: Abundante
    fincaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Finca' },
    finca: { type: String, default: 'Predio en concertación' },
    veredaSector: { type: String, default: 'San Luis' },
    propietarioFinca: { type: String, default: '' },
    custodio: { type: String, required: true },    // Columna: ESTUDIANTE / Custodio
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

// FASE 2: Lote de Semillas y Vivero
const loteSchema = new mongoose.Schema({
    codigoLote: { type: String, required: true, unique: true }, 
    arbolMatrizId: { type: mongoose.Schema.Types.ObjectId, ref: 'ArbolMatriz' }, // <-- Ya NO es requerido
    especieNombre: { type: String, default: '' }, // <-- Enlace directo a la especie
    registradoPor: { type: String, required: true },
    origen: {
        responsableRecoleccion: { type: String, default: 'Inventario Base' },
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
      const passInicial = process.env.ADMIN_INITIAL_PASS || crypto.randomBytes(16).toString('hex');
        const passwordEncriptada = await bcrypt.hash(passInicial, 10);
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
            finca: String(finca || 'Predio Custodiado').trim(),
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
                observaciones: `Registro DAP: ${dap || 0} cm`,
                registrador: req.usuarioActual
            }]
        });
        await nuevoArbol.save();

        if (!(await Especie.findOne({ nombreComun: nuevoArbol.nombreComun }))) {
            await new Especie({ nombreComun: nuevoArbol.nombreComun, nombreCientifico: nuevoArbol.nombreCientifico }).save();
        }

        res.status(201).json({ mensaje: `Árbol ${nuevoArbol.codigoArbol} (${nuevoArbol.nombreComun}) guardado con éxito.` });
    } catch (error) { res.status(400).json({ error: 'Error al guardar el árbol o código repetido.' }); }
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

app.post('/api/lotes-base', verificarAcceso, soloMotorCampo, async (req, res) => {
    try {
        const { especieNombre, cantidad, tamanoBolsa } = req.body;
        const codigoLote = `INV-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        
        // Si la especie no existe en la vitrina, la crea sola
        let especie = await Especie.findOne({ nombreComun: String(especieNombre).trim() });
        if (!especie) {
            especie = new Especie({ nombreComun: String(especieNombre).trim() });
            await especie.save();
        }

        const nuevoLote = new Lote({
            codigoLote, 
            especieNombre: especie.nombreComun,
            registradoPor: req.usuarioActual,
            origen: { responsableRecoleccion: 'Inventario Base', fechaRecoleccion: new Date() },
            cantidadInicial: Number(cantidad), 
            cantidadActual: Number(cantidad), 
            estadoActual: 'Vivero',
            tamanoBolsa: tamanoBolsa,
            historial: [{ estadoAlcanzado: 'Vivero', cantidadSuperviviente: Number(cantidad), tamanoBolsa, observaciones: 'Ingreso directo de inventario sin origen', responsable: req.usuarioActual }]
        });
        await nuevoLote.save();
        res.status(201).json({ mensaje: `Ingresaron ${cantidad} plántulas de ${especieNombre} al vivero.` });
    } catch (error) { res.status(400).json({ error: 'Error al registrar inventario' }); }
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

app.post('/api/olvide-password', async (req, res) => {
    try {
        const emailLimpio = String(req.body.email || '').trim().toLowerCase();
        const usuario = await User.findOne({ 
            email: { $regex: new RegExp(`^${emailLimpio}$`, 'i') } 
        });
        if (!usuario) return res.status(404).json({ error: 'No hay ningún usuario registrado con ese correo.' });

        // Generar código de 6 dígitos y guardar su hash por 15 minutos
        const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
        usuario.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        usuario.resetPasswordExpire = Date.now() + 15 * 60 * 1000;
        await usuario.save();

        const scriptUrl = (process.env.GOOGLE_SCRIPT_URL || '').trim();
        if (!scriptUrl) {
            return res.status(500).json({ error: 'Falta la variable GOOGLE_SCRIPT_URL en el panel Environment de Render.' });
        }

        const textoCorreo = `Hola,\n\nHas solicitado restablecer tu contraseña en la plataforma Bosquesinos.\n\nTu código de seguridad de 6 dígitos es: ${resetToken}\n\nEste código vence en 15 minutos. Si no solicitaste este cambio, ignora este correo.`;

        // Usamos text/plain para evitar bloqueos CORS/302 en Google Apps Script
        const rta = await fetch(scriptUrl, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                secreto: "bosquesinos_correo_2026",
                to: usuario.email,
                subject: 'Código de Recuperación - Asociación Bosquesinos',
                text: textoCorreo
            })
        });

        const textoRespuesta = await rta.text();
        
        // Si Google devuelve HTML de login es porque falta poner "Cualquier usuario (Anyone)"
        if (textoRespuesta.includes('<!DOCTYPE html>') || textoRespuesta.includes('<html')) {
            console.error('Google pidió inicio de sesión. Revisa permisos del script.');
            return res.status(500).json({ error: 'El script de Google tiene acceso restringido. Cámbialo a "Cualquier usuario (Anyone)" en Implementar.' });
        }

        let resultado = {};
        try {
            resultado = JSON.parse(textoRespuesta);
        } catch (e) {
            // Si no es JSON pero el status fue 200, el correo igual salió
            if (rta.ok) return res.json({ mensaje: 'Código de 6 dígitos enviado a tu correo electrónico.' });
            throw new Error('Respuesta inesperada de Google: ' + textoRespuesta.substring(0, 100));
        }

        if (resultado.ok === false) {
            throw new Error(resultado.error || 'Error interno en el script de Google');
        }

        res.json({ mensaje: 'Código de 6 dígitos enviado a tu correo electrónico.' });
    } catch (error) { 
        console.error('Error enviando correo:', error);
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
        if (!usuario) return res.status(400).json({ error: 'El código es inválido o ya expiró.' });

        usuario.password = await bcrypt.hash(nuevaPassword, 10);
        usuario.resetPasswordToken = undefined;
        usuario.resetPasswordExpire = undefined;
        await usuario.save();

        res.json({ mensaje: '¡Contraseña actualizada con éxito! Ya puedes iniciar sesión.' });
    } catch (error) { 
        res.status(500).json({ error: 'Error al actualizar la contraseña.' }); 
    }
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

// =======================================================
//   RUTA TEMPORAL: IMPORTAR LOS 395 ÁRBOLES DEL EXCEL MV26
// =======================================================
app.get('/api/importar-mv26', async (req, res) => {
    try {
        const CUSTODIOS = ["Adriana Herrera", "Bertha Giraldo López", "Carlos Julio López", "Carlos Molina", "Deyby Ramos", "Flor Morelia - Reinaldo", "Humberto Aristizábal", "Jhony Gómez", "Jorge Muñoz", "José Azarías Franco", "José García", "Juan Betancur", "Julio Loaiza-Darly López", "Leonardo Calle", "Lucia Orozco V", "Marisol Arévalo", "Martha Chavaría", "Nora Giraldo", "Omar Giraldo - Abad Giraldo", "Yohana Ceballos", "Óscar Franco"];
        
        const ESPECIES_MV26 = [["Aceite maría", "Calophyllum sp"], ["Aceitillo", "Symphonia globulifera"], ["Algarrobillo", "Hymenaea sp."], ["Alma negra", "Magnolia sp."], ["Almendrón", "Caryocar sp."], ["Anime", "Protium sp"], ["Arenillo", "sp"], ["Avinge", "Licania sp"], ["Avinge corozo", "Licania sp"], ["Avinge culofierro", "Licania sp"], ["Baile pájaro", "Casearia arborea"], ["Caimo", "Pouteria sp"], ["Caimo castaño", "Pouteria sp"], ["Caimo naranjuelo", "Pouteria sp"], ["Caimo peludo", "Pouteria sp"], ["Caimo toronjo", "Pouteria sp"], ["Canelo", "Ocotea sp."], ["Cariaño", "Trattinnickia sp"], ["Cedrillo", "Simarouba amara"], ["Cedro rojo", "sp"], ["Ceiba cartagena", "Spirotheca rosea"], ["Chaquiro", "Podocarpus guatemalensis"], ["Chocho", "Ormosia sp."], ["Chocho rojo", "Ormosia sp."], ["Coco", "LECYTHIDACEAE"], ["Coco cabuyo", "Lecythis"], ["Coco cazuelo", "Lecythis"], ["Coco cristal", "Lecythis"], ["Coco hediondo", "Lecythis"], ["Coco mula muerta", "Gustabia"], ["Coco n.n", "LECYTHIDACEAE"], ["Coco rojo", "Lecythis"], ["Coco sabaleto", "Lecythis"], ["Combo n.n", "sp."], ["Comino", "Aniba sp"], ["Dormilón", "Vochisia sp."], ["Dormilón papelillo", "Vochisia sp."], ["Fresno cebollo", "Tapirira sp."], ["Guáimaro", "Brosimun sp."], ["Guáimaro blanco", "Brosimun sp"], ["Guáimaro rosado", "Brosimun sp"], ["Laurel amarillo", "Ocotea sp."], ["Laurel bobo", "Nectandra sp."], ["Laurel indio viejo", "Ocotea sp."], ["Laurel pelusa", "Nectandra sp"], ["Majagua", "Guatteria cestrifolia"], ["Melcocho blanco", "sp."], ["Melcocho colorado", "sp."], ["Mulamuerta", "Gustavia sp."], ["N.n arenillo", "N.N Arenillo"], ["N.n carne fiambre", "sp."], ["N.n copachí", "N.N Copachí"], ["N.n kimakí", "N.N Kimakí"], ["N.n melcocho", "N.N Melcocho"], ["N.n nogal", "N.N Nogal"], ["Sande", "Brosimum sp."], ["Sarzo mocoso", "Phithecellobium sp."], ["Sota", "Virola sp"], ["Sota sangretoro", "Virola sp"], ["Sota tirasucio", "Virola sp"], ["Soto", "Iryanthera sp"], ["Soto macho", "Iryanthera sp"], ["Soto orejamula", "Iryanthera sp"], ["Soto turmo", "Iryanthera sp"], ["Turmo", "Aptandra tubicina"], ["Turmo naranjo", "Aptandra tubicina"], ["Zaino", "Maprounea guianensis"]];

        // Formato compacto por árbol: [contador, numeroArbol, idxCustodio, idxEspecie, dap, flores, frutos, rebrote]
        const FILAS = [[182, 1, 10, 0, 40.43, 0, 0, 0], [272, 11, 4, 0, 20.69, 0, 0, 0], [335, 6, 2, 0, 17.51, 0, 0, 0], [336, 7, 2, 0, 12.73, 0, 0, 0], [337, 8, 2, 0, 12.1, 0, 0, 0], [339, 10, 2, 0, 20.05, 0, 0, 0], [342, 3, 19, 0, 10.5, 0, 0, 0], [345, 6, 19, 0, 18.46, 0, 0, 0], [228, 9, 7, 1, 17.83, 0, 0, 0], [122, 2, 12, 2, 70.03, 0, 0, 0], [215, 6, 3, 3, 28.01, 0, 0, 0], [217, 8, 3, 3, 19.1, 0, 0, 0], [219, 10, 3, 3, 47.75, 0, 0, 0], [53, 2, 5, 4, 12.41, 0, 0, 0], [60, 9, 5, 4, 20.69, 0, 0, 0], [63, 12, 5, 4, 20.05, 0, 0, 0], [107, 61, 5, 4, 15.92, 0, 0, 0], [109, 2, 18, 4, 29.6, 0, 0, 0], [160, 17, 16, 4, 25.46, 0, 0, 0], [161, 19, 16, 4, 20.69, 0, 0, 0], [162, 21, 16, 4, 22.6, 0, 0, 0], [165, 25, 16, 4, 25.78, 0, 0, 0], [170, 31, 16, 4, 13.05, 0, 0, 0], [180, 45, 16, 4, 13.05, 0, 0, 0], [181, 46, 16, 4, 29.28, 0, 0, 0], [125, 5, 12, 5, 38.52, 0, 0, 0], [130, 11, 12, 5, 42.34, 0, 0, 0], [268, 6, 4, 6, 21.96, 0, 0, 0], [29, 1, 17, 7, 30.24, 0, 0, 0], [44, 17, 17, 7, 31.83, 0, 0, 0], [48, 21, 17, 7, 38.2, 0, 0, 0], [354, 4, 9, 7, 44.56, 0, 0, 0], [385, 3, 20, 7, 46.79, 0, 0, 0], [52, 1, 5, 8, 33.42, 0, 0, 0], [105, 59, 5, 8, 27.69, 0, 0, 0], [380, 18, 11, 9, 23.87, 0, 0, 0], [146, 3, 16, 10, 17.83, 0, 0, 0], [216, 7, 3, 11, 8.59, 0, 0, 0], [252, 16, 1, 11, 38.2, 0, 0, 0], [254, 20, 1, 11, 11.78, 0, 0, 0], [259, 6, 14, 11, 24.19, 0, 0, 0], [262, 10, 14, 11, 17.51, 0, 0, 0], [263, 12, 14, 11, 20.69, 0, 0, 0], [319, 21, 6, 11, 48.7, 0, 0, 0], [324, 26, 6, 11, 25.46, 0, 0, 0], [364, 2, 11, 11, 38.52, 0, 0, 0], [16, 24, 0, 12, 39.79, 0, 0, 0], [64, 13, 5, 12, 23.24, 0, 0, 0], [66, 15, 5, 12, 17.19, 0, 0, 0], [71, 20, 5, 12, 20.37, 0, 0, 0], [72, 21, 5, 12, 30.56, 0, 0, 0], [90, 40, 5, 12, 27.06, 0, 0, 0], [93, 43, 5, 12, 17.19, 0, 0, 0], [95, 45, 5, 12, 23.24, 0, 0, 0], [102, 56, 5, 12, 25.78, 0, 0, 0], [244, 8, 1, 12, 25.15, 0, 0, 0], [278, 2, 8, 12, 19.1, 0, 0, 0], [279, 3, 8, 12, 25.15, 0, 0, 0], [280, 4, 8, 12, 19.1, 0, 0, 0], [296, 2, 15, 12, 14.96, 0, 0, 0], [302, 2, 6, 12, 14.96, 0, 0, 0], [303, 3, 6, 12, 17.19, 0, 0, 0], [304, 4, 6, 12, 12.73, 0, 0, 0], [307, 9, 6, 12, 31.19, 0, 0, 0], [313, 15, 6, 12, 14.01, 0, 0, 0], [315, 17, 6, 12, 20.69, 0, 0, 0], [323, 25, 6, 12, 38.2, 0, 0, 0], [199, 1, 13, 13, 20.69, 0, 0, 0], [355, 5, 9, 13, 24.83, 0, 0, 0], [383, 1, 20, 13, 42.97, 0, 0, 0], [394, 12, 20, 13, 66.84, 0, 0, 0], [7, 11, 0, 14, 11.14, 0, 0, 0], [80, 30, 5, 14, 11.46, 0, 0, 0], [85, 35, 5, 14, 13.05, 0, 0, 0], [99, 49, 5, 14, 13.37, 0, 0, 0], [33, 6, 17, 15, 39.79, 0, 0, 0], [34, 7, 17, 15, 39.79, 0, 0, 0], [39, 12, 17, 15, 42.97, 0, 0, 0], [45, 18, 17, 15, 20.37, 0, 0, 0], [47, 20, 17, 15, 58.57, 0, 0, 0], [50, 23, 17, 15, 26.42, 0, 0, 0], [135, 18, 12, 15, 27.69, 0, 0, 0], [226, 7, 7, 15, 14.64, 0, 0, 0], [312, 14, 6, 15, 31.19, 0, 0, 0], [367, 5, 11, 15, 39.15, 0, 0, 0], [372, 10, 11, 15, 24.51, 0, 0, 0], [377, 15, 11, 15, 13.69, 0, 0, 0], [2, 3, 0, 16, 28.33, 0, 0, 0], [11, 16, 0, 16, 31.19, 0, 0, 0], [12, 19, 0, 16, 50.93, 0, 0, 0], [20, 29, 0, 16, 29.6, 0, 0, 0], [23, 32, 0, 16, 34.06, 0, 0, 0], [46, 19, 17, 16, 20.37, 0, 0, 0], [69, 18, 5, 16, 20.69, 0, 0, 0], [88, 38, 5, 16, 10.19, 0, 0, 0], [166, 26, 16, 16, 14.96, 0, 0, 0], [168, 29, 16, 16, 22.28, 0, 0, 0], [179, 44, 16, 16, 16.23, 0, 0, 0], [309, 11, 6, 16, 16.23, 0, 0, 0], [310, 12, 6, 16, 28.97, 0, 0, 0], [6, 8, 0, 17, 14.96, 0, 0, 0], [8, 12, 0, 17, 19.74, 0, 0, 0], [9, 13, 0, 17, 14.96, 0, 0, 0], [18, 27, 0, 17, 25.46, 0, 0, 0], [147, 4, 16, 17, 17.19, 0, 0, 0], [175, 40, 16, 17, 27.37, 0, 0, 0], [227, 8, 7, 17, 16.87, 0, 0, 0], [261, 9, 14, 17, 36.92, 0, 0, 0], [188, 7, 10, 18, 30.88, 0, 0, 0], [193, 14, 10, 18, 29.92, 0, 0, 0], [225, 2, 7, 18, 13.05, 0, 0, 0], [230, 11, 7, 18, 14.64, 0, 0, 0], [231, 12, 7, 18, 27.69, 0, 0, 0], [232, 13, 7, 18, 22.28, 0, 0, 0], [236, 19, 7, 18, 24.19, 0, 0, 0], [237, 20, 7, 18, 27.37, 0, 0, 0], [281, 6, 8, 18, 22.6, 0, 0, 0], [282, 7, 8, 18, 15.92, 0, 0, 0], [283, 8, 8, 18, 32.79, 0, 0, 0], [293, 18, 8, 18, 33.42, 0, 0, 0], [294, 19, 8, 18, 21.33, 0, 0, 0], [365, 3, 11, 18, 23.87, 0, 0, 0], [389, 7, 20, 18, 47.75, 0, 0, 0], [298, 4, 15, 19, 44.56, 0, 0, 0], [299, 5, 15, 19, 47.75, 0, 0, 1], [300, 6, 15, 19, 19.1, 0, 0, 0], [207, 10, 13, 20, 30.88, 0, 0, 0], [40, 13, 17, 21, 13.05, 0, 0, 0], [308, 10, 6, 21, 49.34, 0, 0, 0], [316, 18, 6, 21, 40.74, 0, 0, 0], [317, 19, 6, 21, 37.24, 0, 0, 0], [318, 20, 6, 21, 38.2, 0, 0, 0], [322, 24, 6, 21, 42.34, 0, 0, 0], [329, 31, 6, 21, 44.56, 0, 0, 0], [330, 32, 6, 21, 32.15, 0, 0, 0], [363, 1, 11, 21, 35.33, 0, 0, 0], [371, 9, 11, 21, 20.05, 0, 0, 0], [265, 3, 4, 22, 18.46, 0, 0, 0], [267, 5, 4, 22, 35.33, 0, 0, 0], [346, 7, 19, 22, 23.55, 0, 0, 0], [348, 9, 19, 22, 21.33, 0, 0, 0], [349, 10, 19, 22, 21.96, 0, 0, 0], [350, 11, 19, 22, 21.33, 0, 0, 0], [224, 1, 7, 23, 19.1, 0, 0, 0], [233, 16, 7, 23, 20.37, 0, 0, 0], [234, 17, 7, 23, 15.6, 0, 0, 0], [235, 18, 7, 23, 15.92, 0, 0, 0], [211, 1, 3, 24, 35.65, 0, 0, 0], [119, 15, 18, 25, 28.65, 0, 0, 0], [220, 11, 3, 25, 36.61, 0, 0, 0], [266, 4, 4, 25, 21.33, 0, 0, 0], [269, 7, 4, 25, 21.65, 0, 0, 0], [270, 9, 4, 25, 15.92, 0, 0, 0], [271, 10, 4, 25, 20.05, 0, 0, 0], [36, 9, 17, 26, 53.16, 0, 0, 0], [42, 15, 17, 26, 31.83, 0, 0, 0], [65, 14, 5, 26, 29.6, 0, 0, 0], [70, 19, 5, 26, 17.51, 0, 0, 0], [74, 24, 5, 26, 32.79, 0, 0, 0], [87, 37, 5, 26, 14.64, 0, 0, 0], [92, 42, 5, 26, 20.37, 0, 0, 0], [96, 46, 5, 26, 11.46, 0, 0, 0], [241, 2, 1, 27, 63.66, 0, 0, 0], [340, 1, 19, 27, 2.07, 0, 1, 0], [24, 33, 0, 28, 32.47, 0, 0, 1], [68, 17, 5, 28, 40.11, 0, 0, 0], [273, 12, 4, 28, 22.92, 0, 0, 0], [67, 16, 5, 29, 15.92, 0, 0, 0], [390, 8, 20, 30, 46.15, 0, 0, 0], [208, 12, 13, 31, 34.38, 0, 0, 0], [104, 58, 5, 32, 21.01, 0, 0, 0], [213, 4, 3, 33, 73.21, 0, 0, 0], [21, 30, 0, 34, 20.37, 0, 0, 0], [28, 37, 0, 34, 35.33, 0, 0, 0], [54, 3, 5, 34, 21.96, 0, 0, 0], [57, 6, 5, 34, 11.46, 0, 0, 0], [59, 8, 5, 34, 19.42, 0, 0, 0], [84, 34, 5, 34, 13.05, 0, 0, 0], [103, 57, 5, 34, 20.69, 0, 0, 0], [154, 11, 16, 34, 24.51, 0, 0, 0], [155, 12, 16, 34, 17.83, 0, 0, 0], [157, 14, 16, 34, 14.01, 0, 0, 0], [158, 15, 16, 34, 13.69, 0, 0, 0], [159, 16, 16, 34, 11.78, 0, 0, 0], [164, 24, 16, 34, 24.51, 0, 0, 0], [167, 27, 16, 34, 20.05, 0, 0, 0], [169, 30, 16, 34, 20.05, 0, 0, 0], [171, 32, 16, 34, 20.37, 0, 0, 0], [172, 33, 16, 34, 14.01, 0, 0, 0], [173, 35, 16, 34, 17.83, 0, 0, 0], [174, 39, 16, 34, 17.51, 0, 0, 0], [177, 42, 16, 34, 26.42, 0, 0, 0], [200, 3, 13, 34, 30.24, 0, 0, 0], [370, 8, 11, 35, 25.46, 0, 0, 0], [374, 12, 11, 35, 23.87, 0, 0, 0], [375, 13, 11, 35, 36.61, 0, 0, 0], [277, 17, 4, 35, 35.01, 0, 0, 0], [286, 11, 8, 35, 24.51, 0, 0, 0], [344, 5, 19, 35, 18.46, 0, 0, 0], [379, 17, 11, 36, 31.83, 0, 0, 0], [382, 20, 11, 36, 17.51, 0, 0, 0], [343, 4, 19, 37, 21.96, 0, 0, 0], [120, 16, 18, 38, 63.66, 0, 0, 0], [3, 4, 0, 39, 22.6, 0, 0, 0], [10, 14, 0, 39, 14.01, 0, 0, 0], [26, 35, 0, 40, 23.87, 0, 0, 0], [27, 36, 0, 40, 18.78, 0, 0, 0], [75, 25, 5, 40, 20.05, 0, 0, 0], [55, 4, 5, 41, 23.87, 0, 0, 0], [61, 10, 5, 41, 28.97, 0, 0, 0], [101, 54, 5, 41, 12.73, 0, 0, 0], [112, 5, 18, 41, 23.55, 0, 0, 0], [113, 6, 18, 41, 23.55, 0, 0, 0], [114, 8, 18, 41, 18.14, 0, 0, 0], [117, 13, 18, 41, 28.65, 0, 0, 0], [121, 17, 18, 41, 31.83, 0, 0, 0], [123, 3, 12, 41, 40.74, 0, 0, 0], [138, 22, 12, 41, 21.65, 0, 0, 0], [141, 26, 12, 41, 16.23, 0, 0, 0], [142, 27, 12, 41, 15.92, 0, 0, 0], [144, 1, 16, 41, 33.1, 0, 0, 0], [185, 4, 10, 41, 27.69, 0, 0, 0], [187, 6, 10, 41, 34.06, 0, 0, 0], [197, 18, 10, 41, 23.87, 0, 0, 0], [210, 14, 13, 41, 20.05, 0, 0, 0], [212, 3, 3, 41, 26.1, 0, 0, 0], [214, 5, 3, 41, 19.1, 0, 0, 0], [218, 9, 3, 41, 19.1, 0, 0, 0], [222, 13, 3, 41, 27.06, 0, 0, 0], [223, 14, 3, 41, 15.92, 0, 0, 0], [333, 4, 2, 41, 12.73, 0, 0, 0], [334, 5, 2, 41, 17.51, 0, 0, 0], [338, 9, 2, 41, 18.46, 0, 0, 0], [360, 11, 9, 41, 28.01, 0, 0, 0], [392, 10, 20, 41, 28.65, 0, 0, 0], [184, 3, 10, 42, 32.79, 0, 0, 0], [189, 8, 10, 42, 34.06, 0, 0, 0], [198, 20, 10, 42, 27.37, 0, 0, 0], [41, 14, 17, 43, 32.47, 0, 0, 0], [78, 28, 5, 43, 16.23, 0, 0, 0], [89, 39, 5, 43, 23.24, 0, 0, 0], [98, 48, 5, 43, 12.41, 0, 0, 0], [118, 14, 18, 43, 30.24, 0, 0, 0], [134, 17, 12, 43, 38.83, 0, 0, 0], [238, 21, 7, 43, 24.19, 0, 0, 0], [239, 22, 7, 43, 21.33, 0, 0, 0], [289, 14, 8, 43, 18.78, 0, 0, 0], [376, 14, 11, 43, 11.14, 0, 0, 0], [341, 2, 19, 44, 10.82, 0, 0, 0], [183, 2, 10, 45, 29.28, 0, 0, 0], [186, 5, 10, 45, 40.43, 0, 0, 0], [191, 11, 10, 45, 34.06, 0, 0, 0], [196, 17, 10, 45, 29.6, 0, 0, 0], [110, 3, 18, 46, 18.14, 0, 0, 0], [115, 9, 18, 46, 19.1, 0, 0, 0], [366, 4, 11, 47, 19.42, 0, 0, 0], [292, 17, 8, 48, 26.74, 0, 0, 0], [19, 28, 0, 49, 19.42, 0, 0, 0], [137, 20, 12, 50, 33.74, 0, 0, 0], [139, 23, 12, 50, 47.43, 0, 0, 0], [140, 24, 12, 50, 50.93, 0, 0, 0], [143, 28, 12, 50, 46.47, 0, 0, 0], [145, 2, 16, 50, 17.19, 0, 0, 0], [15, 23, 0, 51, 20.37, 0, 0, 0], [31, 4, 17, 52, 41.38, 0, 0, 0], [32, 5, 17, 52, 42.97, 0, 0, 0], [14, 22, 0, 53, 22.6, 0, 0, 0], [13, 20, 0, 54, 31.83, 0, 0, 0], [116, 10, 18, 55, 22.28, 0, 0, 0], [124, 4, 12, 55, 42.34, 0, 0, 0], [126, 6, 12, 55, 32.47, 0, 0, 0], [129, 10, 12, 55, 32.15, 0, 0, 0], [132, 13, 12, 55, 17.51, 0, 0, 0], [133, 16, 12, 55, 26.1, 0, 0, 0], [205, 8, 13, 55, 26.42, 0, 0, 0], [221, 12, 3, 55, 31.83, 0, 0, 0], [240, 1, 1, 55, 25.46, 0, 0, 0], [243, 7, 1, 55, 15.92, 0, 0, 0], [248, 12, 1, 55, 63.66, 0, 0, 0], [288, 13, 8, 55, 18.46, 0, 0, 0], [301, 1, 6, 55, 28.65, 0, 0, 0], [305, 5, 6, 55, 13.37, 0, 0, 0], [306, 6, 6, 55, 18.78, 0, 0, 0], [314, 16, 6, 55, 22.28, 0, 0, 0], [320, 22, 6, 55, 16.55, 0, 0, 0], [321, 23, 6, 55, 20.69, 0, 0, 0], [331, 2, 2, 55, 44.56, 0, 0, 0], [332, 3, 2, 55, 34.38, 0, 0, 0], [357, 8, 9, 55, 39.15, 0, 0, 0], [368, 6, 11, 55, 15.92, 0, 0, 0], [373, 11, 11, 55, 19.1, 0, 0, 0], [384, 2, 20, 55, 40.11, 0, 0, 0], [387, 5, 20, 55, 30.88, 0, 0, 0], [388, 6, 20, 55, 40.43, 0, 0, 0], [391, 9, 20, 55, 45.84, 0, 0, 0], [192, 13, 10, 56, 34.06, 0, 0, 0], [264, 1, 4, 57, 20.37, 0, 1, 0], [274, 13, 4, 57, 12.41, 0, 0, 0], [275, 14, 4, 57, 14.32, 0, 0, 0], [359, 10, 9, 57, 45.52, 0, 0, 0], [361, 12, 9, 57, 22.92, 0, 0, 0], [362, 13, 9, 57, 36.92, 0, 0, 0], [194, 15, 10, 58, 31.83, 0, 0, 0], [195, 16, 10, 58, 27.06, 0, 0, 0], [276, 15, 4, 59, 25.46, 0, 0, 0], [201, 4, 13, 60, 45.52, 0, 0, 0], [347, 8, 19, 60, 32.47, 0, 0, 0], [351, 1, 9, 60, 33.42, 0, 0, 0], [352, 2, 9, 60, 22.92, 0, 0, 0], [353, 3, 9, 60, 13.37, 0, 0, 0], [356, 7, 9, 60, 30.56, 0, 0, 0], [358, 9, 9, 60, 35.01, 0, 0, 0], [393, 11, 20, 60, 27.37, 0, 0, 0], [395, 13, 20, 60, 39.79, 0, 0, 0], [229, 10, 7, 61, 15.6, 0, 0, 0], [30, 3, 17, 62, 16.55, 0, 0, 0], [35, 8, 17, 62, 13.69, 0, 0, 0], [37, 10, 17, 62, 33.1, 0, 0, 0], [38, 11, 17, 62, 14.64, 0, 0, 0], [43, 16, 17, 62, 19.1, 0, 0, 0], [49, 22, 17, 62, 11.14, 0, 0, 0], [51, 24, 17, 62, 19.1, 0, 0, 0], [111, 4, 18, 62, 25.78, 0, 0, 0], [127, 8, 12, 62, 66.84, 0, 0, 0], [128, 9, 12, 62, 63.66, 0, 0, 0], [131, 12, 12, 62, 57.3, 0, 0, 0], [136, 19, 12, 62, 14.64, 0, 0, 0], [202, 5, 13, 62, 25.78, 0, 0, 0], [203, 6, 13, 62, 35.01, 0, 0, 0], [204, 7, 13, 62, 21.33, 0, 0, 0], [206, 9, 13, 62, 37.24, 0, 0, 0], [209, 13, 13, 62, 20.69, 0, 0, 0], [242, 6, 1, 62, 42.97, 0, 0, 0], [245, 9, 1, 62, 20.37, 0, 0, 0], [246, 10, 1, 62, 31.83, 0, 0, 0], [247, 11, 1, 62, 20.69, 0, 0, 0], [249, 13, 1, 62, 21.01, 0, 0, 0], [250, 14, 1, 62, 17.51, 0, 0, 0], [251, 15, 1, 62, 12.73, 0, 0, 0], [253, 17, 1, 62, 25.46, 0, 0, 0], [255, 21, 1, 62, 17.83, 0, 0, 0], [284, 9, 8, 62, 17.51, 0, 0, 0], [285, 10, 8, 62, 21.96, 0, 0, 0], [287, 12, 8, 62, 25.46, 0, 0, 0], [290, 15, 8, 62, 22.92, 0, 0, 0], [291, 16, 8, 62, 14.01, 1, 1, 0], [295, 1, 15, 62, 24.51, 1, 1, 0], [297, 3, 15, 62, 38.52, 1, 1, 0], [311, 13, 6, 62, 12.1, 0, 0, 0], [325, 27, 6, 62, 12.73, 0, 0, 0], [326, 28, 6, 62, 15.92, 0, 0, 0], [327, 29, 6, 62, 16.87, 0, 0, 0], [328, 30, 6, 62, 23.24, 0, 0, 0], [369, 7, 11, 62, 11.14, 0, 0, 0], [378, 16, 11, 62, 15.28, 0, 0, 0], [381, 19, 11, 62, 12.73, 0, 0, 0], [386, 4, 20, 62, 15.6, 0, 0, 0], [190, 10, 10, 63, 21.65, 0, 0, 0], [256, 3, 14, 63, 27.06, 0, 0, 0], [257, 4, 14, 63, 25.78, 0, 0, 0], [258, 5, 14, 63, 35.01, 0, 0, 0], [260, 7, 14, 63, 21.96, 0, 0, 0], [1, 2, 0, 64, 16.87, 0, 0, 0], [4, 5, 0, 64, 11.14, 0, 0, 0], [5, 6, 0, 64, 13.37, 0, 0, 0], [17, 26, 0, 64, 15.28, 0, 0, 0], [22, 31, 0, 64, 13.69, 0, 0, 0], [25, 34, 0, 64, 42.02, 0, 0, 0], [62, 11, 5, 64, 28.65, 0, 0, 0], [73, 22, 5, 64, 18.78, 0, 0, 0], [76, 26, 5, 64, 12.1, 0, 0, 0], [77, 27, 5, 64, 20.05, 0, 0, 0], [79, 29, 5, 64, 17.83, 0, 0, 0], [81, 31, 5, 64, 17.19, 0, 0, 0], [82, 32, 5, 64, 11.14, 0, 0, 0], [83, 33, 5, 64, 10.19, 0, 0, 0], [86, 36, 5, 64, 12.73, 0, 0, 0], [91, 41, 5, 64, 18.46, 0, 0, 0], [94, 44, 5, 64, 12.73, 0, 0, 0], [97, 47, 5, 64, 13.37, 0, 0, 0], [100, 53, 5, 64, 19.1, 0, 0, 0], [106, 60, 5, 64, 15.6, 0, 0, 0], [108, 1, 18, 64, 28.65, 0, 0, 0], [56, 5, 5, 65, 16.87, 0, 0, 0], [58, 7, 5, 65, 16.55, 0, 0, 0], [148, 5, 16, 66, 14.96, 0, 0, 0], [149, 6, 16, 66, 15.28, 0, 0, 0], [150, 7, 16, 66, 19.1, 0, 0, 0], [151, 8, 16, 66, 26.74, 0, 0, 0], [152, 9, 16, 66, 20.37, 0, 0, 0], [153, 10, 16, 66, 26.42, 0, 0, 0], [156, 13, 16, 66, 19.74, 0, 0, 0], [163, 23, 16, 66, 32.47, 1, 0, 0], [176, 41, 16, 66, 14.96, 0, 0, 0], [178, 43, 16, 66, 33.1, 0, 0, 0]];

        // 1. Sembrar las 67 especies en el Catálogo (sin duplicar si alguna ya existe)
        for (const [nom, cient] of ESPECIES_MV26) {
            await Especie.updateOne(
                { nombreComun: nom },
                { $setOnInsert: { nombreComun: nom, nombreCientifico: cient } },
                { upsert: true }
            );
        }

        // 2. Limpiar e insertar los 395 árboles semilleros
        await ArbolMatriz.deleteMany({});
        const docsArboles = FILAS.map(([contador, numeroArbol, idxCust, idxEsp, dap, flores, frutos, rebrote]) => {
            const [nombreComun, nombreCientifico] = ESPECIES_MV26[idxEsp];
            const custodio = CUSTODIOS[idxCust];
            const resumenFeno = frutos === 2 ? 'Semilla madura' : (frutos === 1 ? 'Fruto verde' : (flores > 0 ? 'Floración' : 'Hojas'));
            return {
                codigoArbol: `MV26-${contador}-A${numeroArbol}`,
                contador,
                numeroArbol,
                nombreComun,
                nombreCientifico,
                dap,
                flores,
                frutos,
                rebrote,
                finca: 'Predio en concertación',
                veredaSector: 'San Luis, Antioquia',
                propietarioFinca: custodio,
                custodio,
                registradoPor: 'Base Campo MV26',
                monitoreos: [{
                    estadoFenologico: resumenFeno,
                    flores,
                    frutos,
                    rebrote,
                    observaciones: `DAP inicial: ${dap} cm`,
                    registrador: custodio
                }]
            };
        });

        await ArbolMatriz.insertMany(docsArboles);

        res.send(`
            <h1 style="color: #0d4a29; text-align: center; margin-top: 50px;">🌳 ¡Sabia Bosquesina (MV26) cargada con éxito!</h1>
            <p style="text-align: center; font-size: 18px;">Se importaron <b>${docsArboles.length} árboles semilleros</b>, <b>${ESPECIES_MV26.length} especies nativas</b> y <b>${CUSTODIOS.length} custodios</b>.</p>
            <p style="text-align: center;">Ya puedes entrar a <b>bosquesinos.com</b> (Catálogo y pestaña privada <b>🌳 Sabia y Custodios</b>).</p>
            <h3 style="color: #c86428; text-align: center;">⚠️ Recuerda borrar este bloque (/api/importar-mv26) de softwarebosquesino.js cuando termines.</h3>
        `);
    } catch (error) {
        res.status(500).send('Error importando MV26: ' + error.message);
    }
});

app.get('/custodios', (req, res) => { res.sendFile(__dirname + '/index.html'); });

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { console.log(`Servidor activo en puerto ${PORT}`); });