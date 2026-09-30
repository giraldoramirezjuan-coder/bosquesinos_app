const mongoose = require('mongoose');

// Usa la misma URI de tu base de datos en MongoDB Atlas
const uri = process.env.MONGO_URI;

if (!uri) {
  console.error("ERROR: Variable MONGO_URI no encontrada.");
  process.exit(1);
}

// 1. Esquema del inventario antiguo
const plantulaViejaSchema = new mongoose.Schema({
  especie: String,
  nombreCientifico: String,
  caracteristicas: String,
  imagenUrl: String,
  cantidad: Number,
  estado: String
}, { collection: 'plantulas' }); // Fuerza la lectura de la colección original

const PlantulaVieja = mongoose.model('PlantulaVieja', plantulaViejaSchema);

// 2. Nuevos esquemas 2.0
const especieSchema = new mongoose.Schema({
  nombreComun: { type: String, required: true, unique: true },
  nombreCientifico: { type: String, default: '' },
  caracteristicas: { type: String, default: '' },
  imagenUrl: { type: String, default: '' },
  saberCampesino: { type: String, default: '' },
  fechaRegistro: { type: Date, default: Date.now }
});
const Especie = mongoose.model('Especie', especieSchema);

const loteSchema = new mongoose.Schema({
  codigoLote: { type: String, required: true, unique: true },
  especieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Especie', required: true },
  origen: {
    finca: { type: String, default: 'Vivero Central Bosquesinos' },
    responsableRecoleccion: { type: String, default: 'Registro Histórico' },
    arbolMadreInfo: { type: String, default: 'Lote previo a versión 2.0' },
    fechaRecoleccion: { type: Date, default: Date.now }
  },
  cantidadInicial: { type: Number, required: true },
  cantidadActual: { type: Number, required: true },
  estadoActual: { type: String, default: 'Vivero' },
  historial: [{
    fechaEvento: { type: Date, default: Date.now },
    estadoAlcanzado: { type: String },
    cantidadSuperviviente: { type: Number },
    observaciones: { type: String },
    responsable: { type: String }
  }]
});
const Lote = mongoose.model('Lote', loteSchema);

async function ejecutarMigracion() {
  try {
    await mongoose.connect(uri);
    console.log("Conectado a MongoDB Atlas. Iniciando migración...");

    const plantulasViejas = await PlantulaVieja.find();
    console.log(`Registros encontrados en el inventario anterior: ${plantulasViejas.length}`);

    if (plantulasViejas.length === 0) {
      console.log("No se encontraron registros antiguos para migrar.");
      process.exit(0);
    }

    let migradas = 0;

    for (const pl of plantulasViejas) {
      const nombreComun = pl.especie ? pl.especie.trim() : 'Especie Sin Nombre';

      // 1. Buscar o crear la ficha en Especies
      let especie = await Especie.findOne({ nombreComun: new RegExp(`^${nombreComun}$`, 'i') });
      if (!especie) {
        especie = new Especie({
          nombreComun: nombreComun,
          nombreCientifico: pl.nombreCientifico || '',
          caracteristicas: pl.caracteristicas || '',
          imagenUrl: pl.imagenUrl || '',
          saberCampesino: ''
        });
        await especie.save();
        console.log(`[Especie Creada]: ${nombreComun}`);
      }

      // 2. Mapear estado al nuevo catálogo de etapas
      let estadoNuevo = 'Vivero';
      if (pl.estado === 'Germinación') estadoNuevo = 'Germinación';
      if (pl.estado === 'Lista') estadoNuevo = 'Lista para transplante';

      const cant = parseInt(pl.cantidad) || 0;
      const sufijo = Math.random().toString(36).substring(2, 6).toUpperCase();
      const codigo = `HIST-${sufijo}`;

      // 3. Crear el lote asociado
      const nuevoLote = new Lote({
        codigoLote: codigo,
        especieId: especie._id,
        origen: {
          finca: 'Vivero Central San Luis',
          responsableRecoleccion: 'Equipo Bosquesinos',
          arbolMadreInfo: 'Inventario inicial migrado',
          fechaRecoleccion: new Date()
        },
        cantidadInicial: cant,
        cantidadActual: cant,
        estadoActual: estadoNuevo,
        historial: [{
          estadoAlcanzado: estadoNuevo,
          cantidadSuperviviente: cant,
          observaciones: 'Migración automática desde inventario 1.0',
          responsable: 'Sistema'
        }]
      });

      await nuevoLote.save();
      console.log(`[Lote Creado]: ${codigo} para ${nombreComun} (${cant} uds.)`);
      migradas++;
    }

    console.log(`Migración completada con éxito. Total registros procesados: ${migradas}`);
    process.exit(0);

  } catch (error) {
    console.error("Error durante la migración:", error);
    process.exit(1);
  }
}

ejecutarMigracion();