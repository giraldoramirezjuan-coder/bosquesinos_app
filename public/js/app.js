const hostUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') 
    ? 'http://localhost:3000' 
    : window.location.origin;

let categoriaTerritorioActual = 'campo-mesa';
let listaCronicasGlobal = [];
let sesionIniciada = false;
let esGestor = false;
window.especiesGlobal = []; 
window.lotesGlobal = []; 
window.arbolesMatrizGlobal = [];
window.fincasGlobal = [];

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function urlSegura(url) {
    const u = String(url ?? '').trim();
    if (/^(https?:\/\/|data:image\/(png|jpe?g|gif|webp);base64,)/i.test(u)) {
        return escapeHtml(u);
    }
    return '';
}

function mostrarAvisoBosquesino(mensaje, tipo = 'auto') {
    const texto = String(mensaje ?? '').trim();
    if (!texto) return;

    let wrap = document.getElementById('bosquesinos-toasts');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'bosquesinos-toasts';
        wrap.className = 'bosquesinos-toast-wrap';
        document.body.appendChild(wrap);
    }

    const esError = tipo === 'error' || (tipo === 'auto' && /(error|no se pudo|incorrecto|inválid|expiró|denegado|falta|no encontrado|solo el|solo quien)/i.test(texto));
    const toast = document.createElement('div');
    toast.className = 'bosquesinos-toast' + (esError ? ' es-error' : '');

    const span = document.createElement('span');
    span.textContent = (esError ? '⚠️ ' : '🌿 ') + texto;

    const btnCerrar = document.createElement('button');
    btnCerrar.type = 'button';
    btnCerrar.className = 'bosquesinos-toast-close';
    btnCerrar.textContent = '×';
    btnCerrar.onclick = () => toast.remove();

    toast.appendChild(span);
    toast.appendChild(btnCerrar);
    wrap.appendChild(toast);

    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 4500);
}

window.alert = function(mensaje) {
    mostrarAvisoBosquesino(mensaje, 'auto');
};

function confirmarBosquesino(mensaje) {
    return new Promise((resolve) => {
        const previo = document.getElementById('bosquesinos-confirm-modal');
        if (previo) previo.remove();

        const modal = document.createElement('div');
        modal.id = 'bosquesinos-confirm-modal';
        modal.className = 'modal';

        const card = document.createElement('div');
        card.className = 'bosquesinos-confirm-card';

        const titulo = document.createElement('h3');
        titulo.textContent = '🌿 Confirmar acción';
        titulo.style.cssText = 'margin:0 0 10px 0; color:#1b4332; font-size:18px; font-family:Georgia, serif;';

        const p = document.createElement('p');
        p.textContent = String(mensaje ?? '');
        p.style.cssText = 'margin:0 0 20px 0; color:#354f52; font-size:14px; line-height:1.5;';

        const acciones = document.createElement('div');
        acciones.style.cssText = 'display:flex; gap:10px; justify-content:flex-end;';

        const btnCancelar = document.createElement('button');
        btnCancelar.type = 'button';
        btnCancelar.textContent = 'Cancelar';
        btnCancelar.style.cssText = 'width:auto; margin:0; padding:9px 18px; border-radius:10px; border:1px solid #c7dcd0; background:#f4f9f5; color:#1b4332; font-weight:600; cursor:pointer;';

        const btnOk = document.createElement('button');
        btnOk.type = 'button';
        btnOk.textContent = 'Confirmar';
        btnOk.style.cssText = 'width:auto; margin:0; padding:9px 18px; border-radius:10px; border:none; background:#1b4332; color:#fff; font-weight:600; cursor:pointer;';

        const cerrar = (valor) => {
            modal.remove();
            resolve(valor);
        };

        btnCancelar.onclick = () => cerrar(false);
        btnOk.onclick = () => cerrar(true);
        modal.onclick = (e) => { if (e.target === modal) cerrar(false); };

        acciones.appendChild(btnCancelar);
        acciones.appendChild(btnOk);
        card.appendChild(titulo);
        card.appendChild(p);
        card.appendChild(acciones);
        modal.appendChild(card);
        document.body.appendChild(modal);
    });
}

function obtenerCabecerasSeguras() {
    return {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (localStorage.getItem('tokenAdmin') || '')
    };
}

function tieneAccesoCampo() {
    const rol = localStorage.getItem('rolUsuario') || '';
    return (rol === 'Bosquesino' || rol === 'Custodio');
}
let especieActualId = null; 
let especieSeleccionadaMicrositio = null;
let especieInventarioActiva = null;
let carrito = [];
const ESPECIES_FIJAS_SAN_LUIS = [{"nombre": "Abarco", "cientifico": "Cariniana pyriformis"}, {"nombre": "Aceite maría", "cientifico": "Calophyllum sp"}, {"nombre": "Aceitillo", "cientifico": "Symphonia globulifera"}, {"nombre": "Algarrobillo", "cientifico": "Hymenaea sp."}, {"nombre": "Algarrobo", "cientifico": "Hymenaea courbaril"}, {"nombre": "Alma negra", "cientifico": "Magnolia sp."}, {"nombre": "Almendrón", "cientifico": "Caryocar sp."}, {"nombre": "Anime", "cientifico": "Protium sp"}, {"nombre": "Arenillo", "cientifico": "sp"}, {"nombre": "Avinge", "cientifico": "Licania sp"}, {"nombre": "Avinge corozo", "cientifico": "Licania sp"}, {"nombre": "Avinge culofierro", "cientifico": "Licania sp"}, {"nombre": "Baile pájaro", "cientifico": "Casearia arborea"}, {"nombre": "Caimo", "cientifico": "Pouteria sp"}, {"nombre": "Caimo castaño", "cientifico": "Pouteria sp"}, {"nombre": "Caimo naranjuelo", "cientifico": "Pouteria sp"}, {"nombre": "Caimo peludo", "cientifico": "Pouteria sp"}, {"nombre": "Caimo toronjo", "cientifico": "Pouteria sp"}, {"nombre": "Canelo", "cientifico": "Ocotea sp."}, {"nombre": "Cariaño", "cientifico": "Trattinnickia sp"}, {"nombre": "Cedrillo", "cientifico": "Simarouba amara"}, {"nombre": "Cedro", "cientifico": "Cedrela odorata"}, {"nombre": "Cedro rojo", "cientifico": "sp"}, {"nombre": "Ceiba cartagena", "cientifico": "Spirotheca rosea"}, {"nombre": "Chaquiro", "cientifico": "Podocarpus guatemalensis"}, {"nombre": "Chocho", "cientifico": "Ormosia sp."}, {"nombre": "Chocho rojo", "cientifico": "Ormosia sp."}, {"nombre": "Coco", "cientifico": "LECYTHIDACEAE"}, {"nombre": "Coco cabuyo", "cientifico": "Lecythis"}, {"nombre": "Coco cazuelo", "cientifico": "Lecythis"}, {"nombre": "Coco cristal", "cientifico": "Lecythis"}, {"nombre": "Coco hediondo", "cientifico": "Lecythis"}, {"nombre": "Coco mula muerta", "cientifico": "Gustabia"}, {"nombre": "Coco n.n", "cientifico": "LECYTHIDACEAE"}, {"nombre": "Coco rojo", "cientifico": "Lecythis"}, {"nombre": "Coco sabaleto", "cientifico": "Lecythis"}, {"nombre": "Combo n.n", "cientifico": "sp."}, {"nombre": "Comino", "cientifico": "Aniba sp"}, {"nombre": "Dormilón", "cientifico": "Vochisia sp."}, {"nombre": "Dormilón papelillo", "cientifico": "Vochisia sp."}, {"nombre": "Fresno cebollo", "cientifico": "Tapirira sp."}, {"nombre": "Guayacán amarillo", "cientifico": "Handroanthus chrysanthus"}, {"nombre": "Guáimaro", "cientifico": "Brosimun sp."}, {"nombre": "Guáimaro blanco", "cientifico": "Brosimun sp"}, {"nombre": "Guáimaro rosado", "cientifico": "Brosimun sp"}, {"nombre": "Laurel amarillo", "cientifico": "Ocotea sp."}, {"nombre": "Laurel bobo", "cientifico": "Nectandra sp."}, {"nombre": "Laurel indio viejo", "cientifico": "Ocotea sp."}, {"nombre": "Laurel pelusa", "cientifico": "Nectandra sp"}, {"nombre": "Majagua", "cientifico": "Guatteria cestrifolia"}, {"nombre": "Melcocho blanco", "cientifico": "sp."}, {"nombre": "Melcocho colorado", "cientifico": "sp."}, {"nombre": "Mulamuerta", "cientifico": "Gustavia sp."}, {"nombre": "N.n arenillo", "cientifico": "N.N Arenillo"}, {"nombre": "N.n carne fiambre", "cientifico": "sp."}, {"nombre": "N.n copachí", "cientifico": "N.N Copachí"}, {"nombre": "N.n kimakí", "cientifico": "N.N Kimakí"}, {"nombre": "N.n melcocho", "cientifico": "N.N Melcocho"}, {"nombre": "N.n nogal", "cientifico": "N.N Nogal"}, {"nombre": "Sande", "cientifico": "Brosimum sp."}, {"nombre": "Sarzo mocoso", "cientifico": "Phithecellobium sp."}, {"nombre": "Sota", "cientifico": "Virola sp"}, {"nombre": "Sota sangretoro", "cientifico": "Virola sp"}, {"nombre": "Sota tirasucio", "cientifico": "Virola sp"}, {"nombre": "Soto", "cientifico": "Iryanthera sp"}, {"nombre": "Soto macho", "cientifico": "Iryanthera sp"}, {"nombre": "Soto orejamula", "cientifico": "Iryanthera sp"}, {"nombre": "Soto turmo", "cientifico": "Iryanthera sp"}, {"nombre": "Tagua", "cientifico": "Phytelephas macrocarpa"}, {"nombre": "Turmo", "cientifico": "Aptandra tubicina"}, {"nombre": "Turmo naranjo", "cientifico": "Aptandra tubicina"}, {"nombre": "Zaino", "cientifico": "Maprounea guianensis"}];

window.mapaEspeciesCientifico = new Map();

function poblarSelectoresDeEspecies() {
    window.mapaEspeciesCientifico.clear();
    ESPECIES_FIJAS_SAN_LUIS.forEach(e => window.mapaEspeciesCientifico.set(e.nombre, e.cientifico));
    (window.especiesGlobal || []).forEach(e => {
        if (!window.mapaEspeciesCientifico.has(e.nombreComun)) {
            window.mapaEspeciesCientifico.set(e.nombreComun, e.nombreCientifico || '');
        }
    });

    const dList = document.getElementById('datalist-especies');
    if (dList) {
        let opciones = '';
        window.mapaEspeciesCientifico.forEach((cient, nom) => {
            opciones += `<option value="${nom}">${cient ? cient : 'Especie nativa'}</option>`;
        });
        dList.innerHTML = opciones;
    }
}

function autocompletarCientifico(nombreElegido, idInputDestino) {
    const limpio = String(nombreElegido || '').trim();
    const inputDest = document.getElementById(idInputDestino);
    if (inputDest && window.mapaEspeciesCientifico.has(limpio)) {
        inputDest.value = window.mapaEspeciesCientifico.get(limpio);
    }
}
window.fotosMuroArray = [];
window.publicacionesMuroGlobal = [];
window.filtroMuroActual = 'TODOS';

function abrirCreadorPost() {
    if (!sesionIniciada) return document.getElementById('modalLoginClasico').classList.remove('oculto');
    document.getElementById('caja-crear-post').classList.toggle('oculto');
}

function procesarVariasFotos(event) {
    const archivos = Array.from(event.target.files).slice(0, 4); // Hasta 4 fotos por post
    window.fotosMuroArray = [];
    const grid = document.getElementById('preview-fotos-grid');
    grid.innerHTML = '';

    archivos.forEach(archivo => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const max = 800;
                let w = img.width, h = img.height;
                if (w > max) { h = Math.round((h * max) / w); w = max; }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                const base64 = canvas.toDataURL('image/jpeg', 0.75);
                window.fotosMuroArray.push(base64);
                grid.innerHTML += `<img src="${base64}" style="height: 75px; width: 75px; object-fit: cover; border-radius: 8px; border: 1px solid #ccc;">`;
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(archivo);
    });
}

function toggleCamposIniciativa() {
    const tipo = document.getElementById('muro-tipo')?.value;
    const bloqueMeta = document.getElementById('bloque-meta-iniciativa');
    if (bloqueMeta) bloqueMeta.classList.toggle('oculto', tipo !== 'Iniciativa');
}

document.getElementById('formMuroCampesino')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const contenido = document.getElementById('muro-contenido').value.trim();
    const titulo = document.getElementById('muro-titulo')?.value.trim() || '';
    if (!contenido && !titulo && window.fotosMuroArray.length === 0) return alert('Agrega un título, texto o foto.');

    const res = await fetch(`${hostUrl}/api/cronicas`, {
        method: 'POST',
        headers: obtenerCabecerasSeguras(),
        body: JSON.stringify({
            tipoPublicacion: document.getElementById('muro-tipo')?.value || 'Publicación',
            titulo,
            veredaTerritorio: document.getElementById('muro-territorio')?.value.trim() || '',
            contactoDirecto: document.getElementById('muro-contacto')?.value.trim() || '',
            metaPatrocinio: Number(document.getElementById('muro-meta')?.value) || 0,
            categoria: document.getElementById('muro-categoria').value,
            contenido: contenido || 'Publicación con foto',
            imagenes: window.fotosMuroArray
        })
    });
    if (res.ok) {
        document.getElementById('formMuroCampesino').reset();
        toggleCamposIniciativa();
        document.getElementById('preview-fotos-grid').innerHTML = '';
        document.getElementById('caja-crear-post').classList.add('oculto');
        window.fotosMuroArray = [];
        cargarCronicasTerritorio();
    } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'No se pudo publicar.');
    }
});

window.paginaMuroActual = 1;
window.hayMasMuro = false;

async function cargarCronicasTerritorio(cargarMas = false) {
    try {
        if (!cargarMas) {
            window.paginaMuroActual = 1;
        } else {
            window.paginaMuroActual += 1;
        }
        const res = await fetch(`${hostUrl}/api/cronicas?page=${window.paginaMuroActual}&limit=10`);
        if (res.ok) {
            const data = await res.json();
            const nuevas = Array.isArray(data) ? data : (data.publicaciones || []);
            window.hayMasMuro = Array.isArray(data) ? false : Boolean(data.hasMore);
            window.publicacionesMuroGlobal = cargarMas
                ? [...(window.publicacionesMuroGlobal || []), ...nuevas]
                : nuevas;
            dibujarMuroCampesino();
        }
    } catch (e) { console.log(e); }
}

function filtrarMuro(filtro) {
    window.filtroMuroActual = filtro;
    dibujarMuroCampesino();
}

function formatearContenidoMuro(texto) {
    return escapeHtml(texto)
        .replace(/\[titulo\]([\s\S]*?)\[\/titulo\]/g, '<strong style="display:block; margin:10px 0 4px 0; color:#1b4332; font-size:15px;">$1</strong>')
        .replace(/\[cita\]([\s\S]*?)\[\/cita\]/g, '<blockquote style="margin:10px 0; padding:8px 12px; background:#f2f8f4; border-left:3px solid #2d6a4f; font-style:italic; color:#244232;">$1</blockquote>');
}

function dibujarMuroCampesino() {
    const cont = document.getElementById('contenedor-cronicas');
    if (!cont) return;
    const f = window.filtroMuroActual || 'TODOS';
    const lista = (window.publicacionesMuroGlobal || []).filter(p => {
        if (f === 'TODOS') return true;
        if (f.startsWith('TIPO:')) return (p.tipoPublicacion || 'Publicación') === f.slice(5);
        return (p.categoria || '').includes(f);
    });

    if (lista.length === 0) {
        cont.innerHTML = `<p style="text-align:center; color:#52796f;">Aún no hay publicaciones aquí.</p>`;
        const pagCont = document.getElementById('contenedor-paginacion-muro');
        if (pagCont) pagCont.innerHTML = '';
        return;
    }

    const miUsuario = (localStorage.getItem('emailUsuario') || '').toLowerCase();
    const miRol = localStorage.getItem('rolUsuario') || '';

    cont.innerHTML = lista.map(c => {
        const r = c.reacciones || { orgullo: 0, trueque: 0, semilla: 0 };
        const totalReacciones = (r.orgullo || 0) + (r.trueque || 0) + (r.semilla || 0);
        const fotos = (c.imagenes && c.imagenes.length > 0) ? c.imagenes : (c.imagenUrl ? [c.imagenUrl] : []);
        const tipo = c.tipoPublicacion || 'Publicación';
        const idEsc = escapeHtml(c._id);
        const puedeBorrar = sesionIniciada && (miRol === 'Bosquesino' || miRol === 'Admin' || (c.autor && c.autor.toLowerCase() === miUsuario));

        const galeriaHtml = fotos.length > 0 ? `
            <div style="display: grid; grid-template-columns: repeat(${fotos.length > 1 ? 2 : 1}, 1fr); gap: 6px; margin-top: 10px;">
                ${fotos.map(f => urlSegura(f) ? `<img src="${urlSegura(f)}" style="width:100%; height:${fotos.length > 1 ? '180px' : '340px'}; object-fit:cover; border-radius:10px;">` : '').join('')}
            </div>` : '';

        let bloqueIniciativa = '';
        if (tipo === 'Iniciativa') {
            const meta = Number(c.metaPatrocinio) || 0;
            const rec = Number(c.recaudadoPatrocinio) || 0;
            const pct = meta > 0 ? Math.min(100, Math.round((rec / meta) * 100)) : 0;
            const aportesHtml = (c.aportes || []).slice(-3).reverse().map(ap =>
                `<div style="font-size:12px; color:#354f52; margin-top:3px;"><b>${escapeHtml(ap.patrocinador)}</b> aportó $${Number(ap.monto).toLocaleString('es-CO')}${ap.mensaje ? ` — "${escapeHtml(ap.mensaje)}"` : ''}</div>`
            ).join('');

            bloqueIniciativa = `
                <div style="margin-top:10px; padding:10px 12px; background:#f2f8f4; border:1px solid #cce3d4; border-radius:10px;">
                    <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#1b4332; font-weight:bold;">
                        <span>Estado: ${escapeHtml(c.estadoIniciativa || 'Abierta')}</span>
                        <span>Recaudado: $${rec.toLocaleString('es-CO')}${meta > 0 ? ` / $${meta.toLocaleString('es-CO')} (${pct}%)` : ''}</span>
                    </div>
                    ${meta > 0 ? `<div style="height:7px; background:#dce8e0; border-radius:4px; margin-top:6px; overflow:hidden;"><div style="height:100%; width:${pct}%; background:#2d6a4f;"></div></div>` : ''}
                    ${aportesHtml ? `<div style="margin-top:6px;">${aportesHtml}</div>` : ''}
                    <div id="caja-pat-${idEsc}" class="oculto" style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
                        <input type="number" id="pat-monto-${idEsc}" min="1" placeholder="Monto (COP)" style="margin:0; width:130px; padding:6px; font-size:13px;">
                        <input type="text" id="pat-msj-${idEsc}" placeholder="Mensaje de apoyo (opcional)" style="margin:0; flex:1; min-width:140px; padding:6px; font-size:13px;">
                        <button type="button" onclick="patrocinarIniciativa('${idEsc}')" class="btn-classic-primary" style="width:auto; margin:0; padding:6px 12px; font-size:13px;">Confirmar aporte</button>
                    </div>
                </div>`;
        }

        return `
        <article style="background:white; border-radius:14px; border:1px solid #dce8e0; padding:16px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:8px;">
                <div>
                    <strong style="color:#1b4332; font-size:14.5px;">${escapeHtml(c.autor)}</strong>
                    ${c.veredaTerritorio ? `<span style="font-size:12px; color:#52796f; margin-left:6px;">${escapeHtml(c.veredaTerritorio)}</span>` : ''}
                </div>
                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                    ${tipo !== 'Publicación' ? `<span class="badge-rol" style="background:#fff8f0; border-color:#c86428; color:#b55016;">${escapeHtml(tipo)}</span>` : ''}
                    ${c.categoria ? `<span class="badge-rol">${escapeHtml(c.categoria)}</span>` : ''}
                    ${puedeBorrar ? `<button type="button" onclick="eliminarPublicacionMuro('${idEsc}')" style="width:auto; margin:0; padding:2px 8px; font-size:11px; background:#fff0f0; color:#cf222e; border:1px solid #cf222e; border-radius:6px; cursor:pointer;">Eliminar</button>` : ''}
                </div>
            </div>

            ${c.titulo ? `<h4 style="margin:0 0 6px 0; color:#0d4a29; font-size:16px;">${escapeHtml(c.titulo)}</h4>` : ''}
            ${c.contenido && c.contenido !== 'Publicación con foto' ? `<div style="margin:0; font-size:14.5px; color:#222; white-space:pre-line; line-height:1.55;">${formatearContenidoMuro(c.contenido)}</div>` : ''}
            ${galeriaHtml}
            ${bloqueIniciativa}

            <!-- ACCIONES DIRECTAS -->
            <div style="display:flex; gap:8px; margin-top:12px; padding-top:10px; border-top:1px solid #eef4f0; position:relative; flex-wrap:wrap;">
                <button class="btn-suave" onclick="document.getElementById('emojis-${idEsc}').classList.toggle('oculto')" style="width:auto; flex:1; background:#f8fbf9; border:1px solid #dce8e0; border-radius:8px; padding:7px; font-size:13px;">❤️ 🌱 🙌 ${totalReacciones}</button>
                <button class="btn-suave" onclick="document.getElementById('caja-com-${idEsc}').classList.toggle('oculto')" style="width:auto; flex:1; background:#f8fbf9; border:1px solid #dce8e0; border-radius:8px; padding:7px; font-size:13px;">💬 Comentar ${(c.comentarios || []).length}</button>
                ${tipo === 'Iniciativa' ? `<button class="btn-suave" onclick="abrirPatrocinio('${idEsc}')" style="width:auto; flex:1; background:#fff8f0; border:1px solid #c86428; border-radius:8px; padding:7px; font-size:13px; color:#b55016; font-weight:bold;">💚 Patrocinar</button>` : ''}
                <button class="btn-suave" onclick="iniciarChatConUsuario('${escapeHtml(c.autor)}', '${escapeHtml(c.contactoDirecto || '')}')" style="width:auto; flex:1; background:#e9f5ed; border:1px solid #74c69d; border-radius:8px; padding:7px; font-size:13px; color:#0d4a29; font-weight:bold;">✉️ Contactar</button>

                <div id="emojis-${idEsc}" class="oculto" style="position:absolute; bottom:42px; left:0; background:white; border:1px solid #cce3d4; border-radius:20px; padding:5px 12px; box-shadow:0 4px 12px rgba(0,0,0,0.12); display:flex; gap:12px;">
                    <span onclick="reaccionarMuro('${idEsc}','orgullo')" style="cursor:pointer; font-size:16px;" title="Orgullo">🙌</span>
                    <span onclick="reaccionarMuro('${idEsc}','semilla')" style="cursor:pointer; font-size:16px;" title="Buena semilla">🌱</span>
                    <span onclick="reaccionarMuro('${idEsc}','trueque')" style="cursor:pointer; font-size:16px;" title="Me interesa">🤝</span>
                </div>
            </div>

            <!-- Caja de comentarios desplegable -->
            <div id="caja-com-${idEsc}" class="oculto" style="margin-top:10px;">
                ${(c.comentarios || []).map(cm => `<div style="font-size:13px; background:#f4f9f5; padding:6px 10px; border-radius:6px; margin-top:4px;"><b>${escapeHtml(cm.autor)}:</b> ${escapeHtml(cm.texto)}</div>`).join('')}
                <div style="display:flex; gap:6px; margin-top:6px;">
                    <input type="text" id="input-com-${idEsc}" placeholder="Escribe un comentario..." style="margin:0; flex:1; padding:7px; font-size:13px;">
                    <button onclick="comentarMuro('${idEsc}')" class="btn-classic-primary" style="width:auto; padding:7px 12px;">Enviar</button>
                </div>
            </div>
        </article>`;
    }).join('');

    const pagCont = document.getElementById('contenedor-paginacion-muro');
    if (pagCont) {
        pagCont.innerHTML = window.hayMasMuro
            ? `<button type="button" class="btn-classic-secondary btn-suave" style="width: max-content; margin: 0 auto; padding: 10px 22px;" onclick="cargarCronicasTerritorio(true)">Cargar más publicaciones</button>`
            : '';
    }
}

function abrirPatrocinio(id) {
    if (!sesionIniciada) return document.getElementById('modalLoginClasico').classList.remove('oculto');
    document.getElementById(`caja-pat-${id}`)?.classList.toggle('oculto');
}

async function patrocinarIniciativa(id) {
    if (!sesionIniciada) return document.getElementById('modalLoginClasico').classList.remove('oculto');
    const monto = Number(document.getElementById(`pat-monto-${id}`)?.value);
    const mensaje = document.getElementById(`pat-msj-${id}`)?.value.trim() || '';
    if (!Number.isFinite(monto) || monto <= 0) return alert('Ingresa un monto válido.');
    const res = await fetch(`${hostUrl}/api/cronicas/${id}/patrocinar`, {
        method: 'POST',
        headers: obtenerCabecerasSeguras(),
        body: JSON.stringify({ monto, mensaje })
    });
    const rta = await res.json();
    alert(rta.mensaje || rta.error);
    if (res.ok) cargarCronicasTerritorio();
}

async function eliminarPublicacionMuro(id) {
    if (!(await confirmarBosquesino('¿Eliminar esta publicación?'))) return;
    const res = await fetch(`${hostUrl}/api/cronicas/${id}`, {
        method: 'DELETE',
        headers: obtenerCabecerasSeguras()
    });
    const rta = await res.json();
    if (res.ok) {
        cargarCronicasTerritorio();
    } else {
        alert(rta.error || 'No se pudo eliminar.');
    }
}

async function reaccionarMuro(id, tipo) {
    const res = await fetch(`${hostUrl}/api/cronicas/${id}/reaccionar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo })
    });
    if (res.ok) cargarCronicasTerritorio();
}

async function comentarMuro(id) {
    if (!sesionIniciada) return document.getElementById('modalLoginClasico').classList.remove('oculto');
    const input = document.getElementById(`input-com-${id}`);
    if (!input || !input.value.trim()) return;
    const res = await fetch(`${hostUrl}/api/cronicas/${id}/comentarios`, {
        method: 'POST',
        headers: obtenerCabecerasSeguras(),
        body: JSON.stringify({ texto: input.value.trim() })
    });
    if (res.ok) cargarCronicasTerritorio();
}

document.getElementById('formLote')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = {
        arbolMatrizId: document.getElementById('lote-arbolMatriz').value,
        cantidadInicial: document.getElementById('lote-cantidad').value,
        origen: {
            responsableRecoleccion: document.getElementById('lote-responsable').value,
            fechaRecoleccion: document.getElementById('lote-fecha').value
        }
    };
    const res = await fetch(`${hostUrl}/api/lotes`, { method: 'POST', headers: obtenerCabecerasSeguras(), body: JSON.stringify(datos) });
    const rta = await res.json();
    alert(rta.mensaje || rta.error);
    if (res.ok) { document.getElementById('formLote').reset(); cargarCatalogo(); }
});

function iniciarChatConUsuario(usuarioDestino, contactoDirecto) {
    const contacto = String(contactoDirecto || '').trim();
    if (!contacto) {
        alert(`Este autor (${usuarioDestino}) no dejó contacto directo; puedes escribirle en los comentarios.`);
        return;
    }
    const soloDigitos = contacto.replace(/\D/g, '');
    if (soloDigitos.length >= 10 && !contacto.includes('@')) {
        const msj = encodeURIComponent(`Hola ${usuarioDestino}, te escribo desde la Red Comunitaria Bosquesinos.`);
        window.open(`https://wa.me/${soloDigitos}?text=${msj}`, '_blank', 'noopener,noreferrer');
    } else {
        alert(`Contacto directo de ${usuarioDestino}: ${contacto}`);
    }
}

// =========================================================
//   FUNCIONES RESTAURADAS: CATÁLOGO, VIVERO, LOTES Y LOGIN
// =========================================================
async function cargarCatalogo() {
    const lista = document.getElementById('listaPlantulas');
    if (lista) {
        lista.innerHTML = '<div style="width: 100%; text-align: center; padding: 40px;"><h3 style="color: #2d6a4f;"> Conectando con el servidor...</h3><p>Esto puede tomar hasta 1 minuto si el sistema estaba en reposo.</p></div>';
    }

    const selVitrina = document.getElementById('esp-nombre-select');
    const selLoteArbol = document.getElementById('lote-arbolMatriz');
    
    try {
        const [resEspecies, resLotes] = await Promise.all([ fetch(`${hostUrl}/api/especies`), fetch(`${hostUrl}/api/lotes`) ]);
        window.especiesGlobal = await resEspecies.json(); 
        window.lotesGlobal = await resLotes.json();
        
        poblarSelectoresDeEspecies();

        if (tieneAccesoCampo()) {
            const resArboles = await fetch(`${hostUrl}/api/arboles-matriz`, { headers: obtenerCabecerasSeguras() });
            if (resArboles.ok) { window.arbolesMatrizGlobal = await resArboles.json(); }
            if (selLoteArbol) {
                selLoteArbol.innerHTML = '<option value="">-- Selecciona el árbol semillero --</option>';
                window.arbolesMatrizGlobal.forEach(a => selLoteArbol.innerHTML += `<option value="${a._id}">${a.codigoArbol} - ${a.nombreComun} • ${a.veredaSector}</option>`);
            }
        }

        
        if (lista) {
            lista.innerHTML = '';
            if (window.especiesGlobal.length === 0) { lista.innerHTML = '<p style="text-align:center; width:100%;">No hay especies aún.</p>'; actualizarDashboard(); return; }

            window.especiesGlobal.forEach(especie => {
            const misLotes = window.lotesGlobal.filter(l => (l.arbolMatrizId && l.arbolMatrizId.nombreComun === especie.nombreComun) || l.especieNombre === especie.nombreComun);
            let activas = 0, p = 0, m = 0, g = 0;
            
            misLotes.forEach(l => { 
                if (l.estadoActual === 'Vivero' || l.estadoActual === 'Lista para transplante') { 
                    activas += l.cantidadActual; 
                    if(l.tamanoBolsa === 'Bolsa Pequeña') p += l.cantidadActual;
                    else if(l.tamanoBolsa === 'Bolsa Mediana') m += l.cantidadActual;
                    else if(l.tamanoBolsa === 'Bolsa Grande') g += l.cantidadActual;
                    else p += l.cantidadActual; // Por defecto si no tiene bolsa
                } 
            });

            let img = urlSegura(especie.imagenUrl)
                ? `<img src="${urlSegura(especie.imagenUrl)}" class="img-arbol">`
                : `<div class="img-arbol" style="display:flex; flex-direction:column; justify-content:center; align-items:center; background: linear-gradient(145deg, #102a1b 0%, #234d34 60%, #463222 100%); color:#f3efe4; font-weight:700; font-size:14px; letter-spacing:0.6px; text-transform:uppercase;"><span>${escapeHtml(especie.nombreComun)}</span><small style="font-weight:400; font-size:11px; color:#d4c4a8; margin-top:4px; text-transform:none;">Bosque Nativo</small></div>`;
            const btnGest = tieneAccesoCampo() ? `<button class="btn-classic-secondary" style="width: 100%; margin-top: 8px; font-size: 13px;" onclick="abrirGestionInventario('${especie._id}')"> Gestionar Inventario</button>` : '';

            lista.innerHTML += `
                <li class="item-planta">
                    ${img}
                    <div class="info-arbol">
                        <h3 style="margin-bottom:2px;">${especie.nombreComun}</h3> 
                        <i style="color:#52796f; font-size:13px;">${especie.nombreCientifico || ''}</i>
                        <p style="margin-top:8px;">${(especie.caracteristicas || 'Especie nativa custodiada en San Luis.').substring(0, 75)}...</p>
                        
                        <div class="estadisticas" style="margin-top: 10px; margin-bottom: 10px;">
                            <strong style="font-size: 16px; color: #1b4332;">${activas} uds en vivero</strong>
                            <div style="font-size: 11.5px; color: #52796f; margin-top: 6px; display: flex; justify-content: space-between; background: #f2f8f4; padding: 6px; border-radius: 6px; border: 1px solid #dce8e0;">
                                <span> Peq: <b>${p}</b></span>
                                <span> Med: <b>${m}</b></span>
                                <span> Gde: <b>${g}</b></span>
                            </div>
                        </div>

                        <div class="acciones-tarjeta">
                            <button class="btn-classic-primary" style="width: 100%;" onclick="abrirMicrositio('${especie._id}')">Conocer especie</button>
                            ${btnGest}
                        </div>
                    </div>
                </li>`;
            });
        }
        actualizarDashboard();
    } catch (error) { console.log(error); }
}

function abrirGestionInventario(especieId) {
    if (!esGestor) return;
    especieInventarioActiva = especieId;
    const especie = window.especiesGlobal.find(e => e._id === especieId);
    if (!especie) return;
    const nombreComun = especie.nombreComun;
    document.getElementById('nombreEspecieLotes').innerText = `Trazabilidad e Inventario: ${nombreComun}`;
    
    const rolActual = localStorage.getItem('rolUsuario');
    const misLotes = window.lotesGlobal.filter(l => 
        ((l.arbolMatrizId && l.arbolMatrizId.nombreComun === nombreComun) || 
         (l.especieNombre === nombreComun)) && 
        (rolActual === 'Bosquesino' || rolActual === 'Admin' || l.registradoPor === localStorage.getItem('emailUsuario'))
    );
    
    const cont = document.getElementById('contenedorLotesActivos'); 
    if (misLotes.length === 0) {
        cont.innerHTML = '<p style="font-size:13px; color:#666; text-align:center;">No hay lotes registrados para esta especie.</p>';
        document.getElementById('modalGestionLotes').classList.remove('oculto');
        return;
    }

    let htmlSemillero = '<h4 style="color:#e07a5f; border-bottom: 2px solid #e07a5f; padding-bottom:5px; margin-top:0;"> 1. En Semillero </h4>';
    let htmlVivero = '<h4 style="color:#2d6a4f; border-bottom: 2px solid #2d6a4f; padding-bottom:5px; margin-top:20px;"> 2. En Vivero </h4>';
    let htmlSembrados = '<h4 style="color:#1b4332; border-bottom: 2px solid #1b4332; padding-bottom:5px; margin-top:20px;"> 3. Sembrados en Montaña</h4>';
    
    let cSem = 0, cViv = 0, cSemb = 0;

    misLotes.forEach(l => {
        const madre = l.arbolMatrizId ? `${l.arbolMatrizId.codigoArbol} (${l.arbolMatrizId.veredaSector || 'San Luis'})` : 'Madre Histórica';
        const recolector = (l.origen && l.origen.responsableRecoleccion) ? l.origen.responsableRecoleccion : l.registradoPor;
        const btnEliminar = `<button style="position: absolute; top: 10px; right: 10px; background: none; border: none; font-size: 14px; cursor: pointer; color: #cf222e;" onclick="eliminarRegistroDefinitivo('${l._id}')" title="Eliminar lote"></button>`;

        // Construir la línea de tiempo (historial) de este lote
        let pasosHtml = '';
        if (l.historial && l.historial.length > 0) {
            pasosHtml = l.historial.map(h => {
                const f = h.fechaEvento ? new Date(h.fechaEvento).toLocaleDateString('es-CO') : '';
                return `<li style="margin-bottom: 6px; font-size: 12px; color: #354f52;">
                    <b>${f} - ${h.estadoAlcanzado}:</b> ${h.cantidadSuperviviente} uds. 
                    <i>(${h.observaciones || 'Sin obs'})</i> —  ${h.responsable || ''}
                </li>`;
            }).join('');
        } else {
            pasosHtml = '<li style="font-size:12px; color:#888;">Sin eventos adicionales registrados.</li>';
        }

        const bloqueHistorial = `
            <details style="margin-top: 8px; background: #ffffff; border: 1px solid #dce8e0; border-radius: 6px; padding: 6px 10px;">
                <summary style="font-size: 12px; font-weight: bold; color: #2d6a4f; cursor: pointer; padding: 2px 0 !important;">
                     Ver Trazabilidad (${l.codigoLote || 'Lote'})
                </summary>
                <div style="margin-top: 8px; border-top: 1px dashed #dce8e0; padding-top: 6px; text-align: left;">
                    <div style="font-size: 11.5px; color: #52796f; margin-bottom: 6px;">
                         <b>Árbol Madre:</b> ${madre} |  <b>Recolector:</b> ${recolector}
                    </div>
                    <ul style="margin: 0; padding-left: 18px;">${pasosHtml}</ul>
                </div>
            </details>`;

        if (l.estadoActual === 'Semillero' || l.estadoActual === 'Germinación') {
            cSem++;
            htmlSemillero += `
                <div style="position: relative; border: 1px dashed #e07a5f; padding: 12px; border-radius: 8px; margin-bottom: 10px; background: #fffaf8;">
                    ${btnEliminar}
                    <span style="font-size:11px; background:#fde8e2; color:#c15539; padding:2px 8px; border-radius:10px; font-weight:bold;">${l.codigoLote}</span>
                    <strong style="color: #c15539; display:block; margin-top:4px;">Madre: ${madre}</strong>
                    <p style="font-size: 13px; color: #555; margin: 5px 0;"><b>${l.cantidadActual}</b> de ${l.cantidadInicial} semillas en tierra.</p>
                    ${bloqueHistorial}
                    <div style="display: flex; gap: 8px; margin-top: 10px;">
                        <button class="btn-classic-secondary" style="flex: 1; padding: 8px; font-size: 12px; border-color: #e07a5f; color: #c15539; font-weight: bold;" onclick="prepAvanzar('${l._id}')"> Pasar a Vivero</button>
                        <button class="btn-classic-danger" style="flex: 1; padding: 8px; font-size: 12px; font-weight: bold; background: #fff; border: 1px solid #e07a5f; color: #e07a5f;" onclick="prepRetirar('${l._id}')">Registrar pérdida</button>
                    </div>
                </div>`;
        } else if (l.estadoActual === 'Vivero' || l.estadoActual === 'Lista para transplante') {
            cViv++;
            htmlVivero += `
                <div style="position: relative; border: 1px solid #74c69d; padding: 12px; border-radius: 8px; margin-bottom: 10px; background: #f1f7f3;">
                    ${btnEliminar}
                    <span style="font-size:11px; background:#d8f3dc; color:#1b4332; padding:2px 8px; border-radius:10px; font-weight:bold;">${l.codigoLote}</span>
                    <strong style="color: #1b4332; display:block; margin-top:4px;">Madre: ${madre}</strong>
                    <p style="font-size: 13px; color: #1b4332; margin: 5px 0;"><b>${l.cantidadActual}</b> plántulas listas en bolsa (de ${l.cantidadInicial} semillas).</p>
                    ${bloqueHistorial}
                    <div style="display: flex; gap: 8px; margin-top: 10px;">
                        <button class="btn-classic-secondary" style="flex: 1; padding: 8px; font-size: 12px; border-color: #2d6a4f; color: #1b4332; font-weight: bold;" onclick="prepAvanzar('${l._id}')"> Sembrar en campo</button>
                        <button class="btn-classic-danger" style="flex: 1; padding: 8px; font-size: 12px; font-weight: bold; background: #fff; border: 1px solid #74c69d; color: #2d6a4f;" onclick="prepRetirar('${l._id}')">Registrar salida/pérdida</button>
                    </div>
                </div>`;
        } else if (l.estadoActual === 'Sembrada') {
            cSemb++;
            htmlSembrados += `
                <div style="position: relative; border: 2px solid #2d6a4f; padding: 12px; border-radius: 8px; margin-bottom: 10px; background: #e9f5ed;">
                    ${btnEliminar}
                    <span style="font-size:11px; background:#1b4332; color:#ffffff; padding:2px 8px; border-radius:10px; font-weight:bold;"> ${l.codigoLote} • EN MONTAÑA</span>
                    <strong style="color: #1b4332; display:block; margin-top:4px;">Origen: ${madre}</strong>
                    <p style="font-size: 13px; color: #1b4332; margin: 5px 0;"><b>${l.cantidadActual}</b> árboles sembrados en territorio.</p>
                    ${bloqueHistorial}
                </div>`;
        }
    });

    if (cSem === 0) htmlSemillero += '<p style="font-size:12.5px; color:#888;">No hay semillas en germinación.</p>';
    if (cViv === 0) htmlVivero += '<p style="font-size:12.5px; color:#888;">No hay plántulas en bolsa.</p>';
    if (cSemb === 0) htmlSembrados += '<p style="font-size:12.5px; color:#888;">Aún no hay lotes marcados como sembrados en campo.</p>';

    cont.innerHTML = htmlSemillero + htmlVivero + htmlSembrados;
    document.getElementById('modalGestionLotes').classList.remove('oculto');
}

async function eliminarRegistroDefinitivo(idRegistro) {
    if (!(await confirmarBosquesino('¿Seguro que deseas eliminar este registro por completo?'))) return;
    try {
        const res = await fetch(`${hostUrl}/api/lotes/${idRegistro}`, { method: 'DELETE', headers: obtenerCabecerasSeguras() });
        if (res.ok) { await cargarCatalogo(); abrirGestionInventario(especieInventarioActiva); } else { alert('No se pudo eliminar.'); }
    } catch (error) { console.error('Error al eliminar:', error); }
}

function actualizarDashboard() {
    if (!esGestor) return;
    let totalPlantas = 0; let registrosActivos = 0; let arbolesCosecha = 0;
    window.lotesGlobal.forEach(l => { if (l.estadoActual !== 'Sembrada' && l.estadoActual !== 'Semillero' && l.estadoActual !== 'Germinación') { totalPlantas += l.cantidadActual; registrosActivos++; } });
    window.arbolesMatrizGlobal.forEach(a => { let est = a.monitoreos.length ? a.monitoreos[a.monitoreos.length-1].estadoFenologico : ''; if (est === 'Semilla madura') arbolesCosecha++; });
    document.getElementById('stat-plantulas').innerText = totalPlantas;
    document.getElementById('stat-lotes').innerText = registrosActivos; 
    document.getElementById('stat-cosecha').innerText = arbolesCosecha;
}

async function cargarFincas() {
    if (!tieneAccesoCampo()) return;
    try {
        const res = await fetch(`${hostUrl}/api/fincas`, { headers: obtenerCabecerasSeguras() });
        if (!res.ok) return;
        window.fincasGlobal = await res.json();
        
        const selFinca = document.getElementById('arbol-finca-select');
        if (selFinca) {
            selFinca.innerHTML = '<option value="">-- Selecciona la Finca donde está el árbol --</option>';
            window.fincasGlobal.forEach(f => {
                selFinca.innerHTML += `<option value="${f._id}">${f.nombreFinca} — Vereda ${f.vereda} (Dueño: ${f.propietario})</option>`;
            });
        }

        const resumen = document.getElementById('lista-fincas-resumen');
        if (resumen) {
            resumen.innerHTML = window.fincasGlobal.length 
                ? ` <b>${window.fincasGlobal.length} fincas registradas:</b> ` + window.fincasGlobal.map(f => `${f.nombreFinca} (${f.vereda} - ${f.propietario})`).join(' • ')
                : 'Aún no hay fincas registradas. Registra la primera arriba.';
        }
    } catch (e) { console.log(e); }
}

function seleccionarFincaParaArbol() {
    const id = document.getElementById('arbol-finca-select').value;
    const finca = window.fincasGlobal.find(f => f._id === id);
    if (finca) {
        document.getElementById('arbol-finca').value = finca.nombreFinca;
        document.getElementById('arbol-vereda').value = finca.vereda;
        document.getElementById('arbol-propietario').value = finca.propietario;
    }
}

document.getElementById('formFinca')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = {
        nombreFinca: document.getElementById('finca-nombre').value,
        vereda: document.getElementById('finca-vereda').value,
        propietario: document.getElementById('finca-propietario').value,
        contactoPropietario: document.getElementById('finca-contacto').value,
        observacionesBosque: document.getElementById('finca-obs').value
    };
    const res = await fetch(`${hostUrl}/api/fincas`, {
        method: 'POST',
        headers: obtenerCabecerasSeguras(),
        body: JSON.stringify(datos)
    });
    const rta = await res.json();
    alert(rta.mensaje || rta.error);
    if (res.ok) {
        document.getElementById('formFinca').reset();
        cargarFincas();
    }
});

document.getElementById('formArbolMatriz')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const contador = document.getElementById('arbol-contador').value;
    const numeroArbol = document.getElementById('arbol-numero').value;
    const codigoManual = document.getElementById('arbol-codigo').value.trim();
    const datos = { 
        fincaId: document.getElementById('arbol-finca-select').value,
        finca: document.getElementById('arbol-finca').value || 'Predio Custodiado', 
        veredaSector: document.getElementById('arbol-vereda').value || 'San Luis', 
        propietarioFinca: document.getElementById('arbol-propietario').value,
        contador: contador,
        numeroArbol: numeroArbol,
        codigoArbol: codigoManual || `MV26-${contador}-A${numeroArbol}`, 
        nombreComun: document.getElementById('arbol-especie').value.trim(), 
        nombreCientifico: document.getElementById('arbol-cientifico').value.trim(), 
        dap: document.getElementById('arbol-dap').value,
        flores: document.getElementById('arbol-flores').value,
        frutos: document.getElementById('arbol-frutos').value,
        rebrote: document.getElementById('arbol-rebrote').value,
        custodio: document.getElementById('arbol-custodio').value.trim(), 
        coordenadasGPS: document.getElementById('arbol-gps').value 
    };
    const res = await fetch(`${hostUrl}/api/arboles-matriz`, { method: 'POST', headers: obtenerCabecerasSeguras(), body: JSON.stringify(datos) });
    const rta = await res.json();
    alert(rta.mensaje || rta.error);
    if (res.ok) { document.getElementById('formArbolMatriz').reset(); cargarCatalogo(); cargarVistaCustodios(); }
});

document.getElementById('esp-nombre-select')?.addEventListener('change', function() {
    const existente = (window.especiesGlobal || []).find(e => e.nombreComun === this.value);
    document.getElementById('esp-imagen').value = existente ? (existente.imagenUrl || '') : '';
    document.getElementById('esp-caracteristicas').value = existente ? (existente.caracteristicas || '') : '';
});

document.getElementById('formEspecie')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombreComun = document.getElementById('esp-nombre-select').value.trim();
    const nombreCientifico = window.mapaEspeciesCientifico.get(nombreComun) || '';
    const res = await fetch(`${hostUrl}/api/especies-vitrina`, { 
        method: 'PUT', 
        headers: obtenerCabecerasSeguras(), 
        body: JSON.stringify({ 
            nombreComun, 
            nombreCientifico,
            imagenUrl: document.getElementById('esp-imagen').value, 
            caracteristicas: document.getElementById('esp-caracteristicas').value 
        }) 
    });
    if (res.ok) { document.getElementById('formEspecie').reset(); alert('Vitrina actualizada.'); cargarCatalogo(); }
});

document.getElementById('formAvanzar')?.addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    await fetch(`${hostUrl}/api/lotes/avanzar`, { 
        method: 'POST', 
        headers: obtenerCabecerasSeguras(), 
        body: JSON.stringify({ 
            loteId: document.getElementById('avanzar-loteId').value, 
            nuevoEstado: document.getElementById('avanzar-estado').value, 
            tamanoBolsa: document.getElementById('avanzar-bolsa').value,
            alturaCm: document.getElementById('avanzar-altura').value,
            cantidadSuperviviente: document.getElementById('avanzar-cantidad').value, 
            observaciones: document.getElementById('avanzar-obs').value 
        }) 
    }); 
    document.getElementById('modalAvanzarLote').classList.add('oculto'); 
    await cargarCatalogo(); 
    abrirGestionInventario(especieInventarioActiva);
});

document.getElementById('formInventarioBase')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = { 
        especieNombre: document.getElementById('inv-especie').value,
        cantidad: document.getElementById('inv-cantidad').value,
        tamanoBolsa: document.getElementById('inv-bolsa').value
    };
    const res = await fetch(`${hostUrl}/api/lotes-base`, { method: 'POST', headers: obtenerCabecerasSeguras(), body: JSON.stringify(datos) });
    const rta = await res.json();
    alert(rta.mensaje || rta.error);
    if (res.ok) { document.getElementById('formInventarioBase').reset(); cargarCatalogo(); }
});

function abrirModalCarrito() {
    poblarSelectoresDeEspecies();
    actUI();
    document.getElementById('modalCarrito').classList.remove('oculto');
}

function adquirirEjemplar() { 
    let i = carrito.find(x => x.n === especieSeleccionadaMicrositio); 
    if (i) i.c++; else carrito.push({ n: especieSeleccionadaMicrositio, c: 1 }); 
    document.getElementById('modalDetalleEspecie').classList.add('oculto');
    abrirModalCarrito(); 
}

function agregarEspecieDesdeSelectCarrito() {
    const sel = document.getElementById('select-agregar-carrito');
    if (!sel.value) return;
    let i = carrito.find(x => x.n === sel.value);
    if (i) i.c++; else carrito.push({ n: sel.value, c: 1 });
    sel.value = '';
    actUI();
}

function cambiarCantCarrito(idx, cant) {
    const num = parseInt(cant);
    if (isNaN(num) || num <= 0) carrito.splice(idx, 1);
    else carrito[idx].c = num;
    actUI();
}

function actUI() { 
    document.getElementById('listaCarrito').innerHTML = carrito.map((i, idx) => `
        <li style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #eee;">
            <span> <b>${i.n}</b></span>
            <div style="display:flex; align-items:center; gap:6px;">
                <input type="number" min="1" value="${i.c}" onchange="cambiarCantCarrito(${idx}, this.value)" style="width:60px !important; padding:4px !important; margin:0 !important; text-align:center;">
                <span style="font-size:12px;">uds</span>
                <button type="button" onclick="cambiarCantCarrito(${idx}, 0)" style="background:none; border:none; color:#cf222e; cursor:pointer; width:auto !important; padding:4px !important; margin:0 !important;"></button>
            </div>
        </li>`).join(''); 
    const total = carrito.reduce((acc, i) => acc + i.c, 0);
    const spanCont = document.getElementById('contadorCarrito');
    if (spanCont) spanCont.innerText = total;
    document.getElementById('btnCarrito').className = carrito.length ? 'carrito-flotante' : 'oculto'; 
}

function enviarWhatsApp() { 
    if (!carrito.length) return;
    window.open(`https://wa.me/573105632387?text=Hola Bosquesinos, me interesa adquirir estos ejemplares: ` + carrito.map(i => `${i.c}x ${i.n}`).join(', '), '_blank'); 
}

function seguirExplorandoCatalogo() {
    document.getElementById('modalCarrito').classList.add('oculto');
    cambiarVista('vista-catalogo');
}

async function abrirModalPostulacion() {
    document.getElementById('modalPostulacionCustodio').classList.remove('oculto');
    const cajaEstado = document.getElementById('cajaEstadoPostulacion');
    const form = document.getElementById('formPostularCustodio');
    cajaEstado.style.display = 'block';
    cajaEstado.style.background = '#f8fbf9';
    cajaEstado.innerText = 'Consultando estado de tu perfil...';

    try {
        const res = await fetch(`${hostUrl}/api/mi-perfil`, { headers: obtenerCabecerasSeguras() });
        if (!res.ok) throw new Error('Error al leer perfil');
        const usuario = await res.json();
        const post = usuario.postulacionCustodio || { estado: 'Ninguna' };

        if (post.estado === 'Pendiente') {
            cajaEstado.style.background = '#fff3cd';
            cajaEstado.style.color = '#856404';
            cajaEstado.style.border = '1px solid #ffeeba';
            cajaEstado.innerHTML = ` <b>Solicitud en revisión:</b> Ya enviaste tu postulación para la vereda <b>${post.vereda}</b> (${post.tamañoPredio}). El equipo Bosquesino la revisará pronto.`;
            document.getElementById('post-vereda').value = post.vereda || '';
            document.getElementById('post-tamano').value = post.tamañoPredio || '';
            document.getElementById('post-bosque').value = post.tipoBosque || '';
            document.getElementById('btnEnviarPostulacion').innerText = 'Actualizar datos de mi postulación';
        } else if (post.estado === 'Aprobada' || usuario.rol === 'Custodio') {
            cajaEstado.style.background = '#d4edda';
            cajaEstado.style.color = '#155724';
            cajaEstado.style.border = '1px solid #c3e6cb';
            cajaEstado.innerHTML = ` <b>¡Felicidades! Tu solicitud fue aprobada.</b> Cierra sesión y vuelve a ingresar para activar tu Panel de Control de Custodio.`;
            form.classList.add('oculto');
        } else if (post.estado === 'Rechazada') {
            cajaEstado.style.background = '#f8d7da';
            cajaEstado.style.color = '#721c24';
            cajaEstado.style.border = '1px solid #f5c6cb';
            cajaEstado.innerHTML = ` Tu solicitud anterior no pudo ser aprobada en este momento. Puedes actualizar la información de tu predio y enviarla nuevamente.`;
        } else {
            cajaEstado.style.display = 'none';
        }
    } catch (error) { cajaEstado.style.display = 'none'; }
}

async function cargarPostulacionesPendientes() {
    const cont = document.getElementById('listaPostulacionesPendientes');
    if (!cont) return;
    try {
        const res = await fetch(`${hostUrl}/api/postulaciones-pendientes`, { headers: obtenerCabecerasSeguras() });
        if (!res.ok) { cont.innerHTML = '<p style="color:#888;">Sin acceso o ruta pendiente.</p>'; return; }
        const pendientes = await res.json();
        if (pendientes.length === 0) {
            cont.innerHTML = '<p style="color:#52796f; background:#f1f7f3; padding:10px; border-radius:6px;"> No hay solicitudes pendientes en este momento.</p>';
            return;
        }
        cont.innerHTML = '';
        pendientes.forEach(u => {
            const p = u.postulacionCustodio || {};
            cont.innerHTML += `
                <div style="border: 1px solid #dce8e0; background: #ffffff; padding: 12px; border-radius: 8px; margin-bottom: 10px; text-align: left;">
                    <strong style="color: #1b4332;"> ${u.username || u.email}</strong>
                    <p style="margin: 4px 0; font-size: 12px;"> <b>Vereda:</b> ${p.vereda || '-'} |  <b>Predio:</b> ${p.tamañoPredio || '-'}</p>
                    <p style="margin: 4px 0 10px 0; font-size: 12px; color: #354f52;"> <b>Bosque:</b> ${p.tipoBosque || '-'}</p>
                    <div style="display: flex; gap: 8px;">
                        <button type="button" class="btn-principal" style="background: #2d6a4f; padding: 6px 12px; font-size: 12px; flex: 1;" onclick="resolverPostulacion('${u._id}', 'Aprobada')"> Aprobar como Custodio</button>
                        <button type="button" class="btn-classic-danger" style="padding: 6px 12px; font-size: 12px; flex: 1;" onclick="resolverPostulacion('${u._id}', 'Rechazada')"> Rechazar</button>
                    </div>
                </div>`;
        });
    } catch (error) { cont.innerHTML = '<p style="color:#888;">No se pudieron cargar las solicitudes.</p>'; }
}

async function resolverPostulacion(userId, decision) {
    if (!(await confirmarBosquesino(`¿Seguro que deseas marcar esta postulación como ${decision}?`))) return;
    try {
        const res = await fetch(`${hostUrl}/api/resolver-postulacion/${userId}`, { method: 'PUT', headers: obtenerCabecerasSeguras(), body: JSON.stringify({ decision }) });
        const data = await res.json();
        alert(data.mensaje || data.error);
        cargarPostulacionesPendientes();
    } catch (error) { alert('Error al procesar la decisión.'); }
}

function cambiarTabAdmin(tab) {
    const rol = localStorage.getItem('rolUsuario') || '';
    const subVivero = document.getElementById('subpanel-vivero');
    const subGob = document.getElementById('subpanel-gobernanza');
    const btnVivero = document.getElementById('btn-tab-vivero');
    const btnGob = document.getElementById('btn-tab-gobernanza');

    if (tab === 'gobernanza') {
        if (rol !== 'Bosquesino') {
            alert('Acceso restringido al rol Bosquesino.');
            return;
        }
        subVivero.classList.add('oculto');
        subGob.classList.remove('oculto');
        btnGob.style.background = '#8a5a00';
        btnGob.style.color = '#ffffff';
        btnVivero.style.background = 'transparent';
        btnVivero.style.color = '#1b4332';
        btnVivero.style.border = '2px solid #1b4332';
        cargarTablaUsuarios();
        cargarPostulacionesPendientes();
    } else {
        subGob.classList.add('oculto');
        subVivero.classList.remove('oculto');
        btnVivero.style.background = '#1b4332';
        btnVivero.style.color = '#ffffff';
        btnGob.style.background = '#fffdf5';
        btnGob.style.color = '#8a5a00';
    }
}

async function cargarTablaUsuarios() {
    const cont = document.getElementById('contenedor-tabla-usuarios');
    if (!cont) return;
    try {
        const res = await fetch(`${hostUrl}/api/usuarios`, { headers: obtenerCabecerasSeguras() });
        if (!res.ok) { cont.innerHTML = '<p style="color:#888; font-size:13px;">Error al cargar usuarios.</p>'; return; }
        const usuarios = await res.json();

        let filas = usuarios.map(u => {
            const colorBadge = u.rol === 'Bosquesino' ? '#fff3cd; color:#856404;' : (u.rol === 'Custodio' ? '#d8f3dc; color:#1b4332;' : '#f1f3f5; color:#495057;');
            return `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 10px 8px; font-size: 13px; font-weight: 600; color: #1b4332;">${u.username || u.email}</td>
                    <td style="padding: 10px 8px;">
                        <span style="padding: 3px 8px; border-radius: 10px; font-size: 11px; font-weight: bold; background: ${colorBadge}">${u.rol}</span>
                    </td>
                    <td style="padding: 10px 8px;">
                        <select onchange="cambiarRolUsuario('${u._id}', this.value)" style="margin: 0 !important; padding: 6px 8px !important; font-size: 12px !important; border-radius: 6px; border: 1px solid #ccc; width: auto !important;">
                            <option value="Vigía" ${u.rol === 'Vigía' ? 'selected' : ''}>Vigía</option>
                            <option value="Custodio" ${u.rol === 'Custodio' ? 'selected' : ''}>Custodio</option>
                            <option value="Admin" ${u.rol === 'Admin' ? 'selected' : ''}>Admin</option>
                            <option value="Bosquesino" ${u.rol === 'Bosquesino' ? 'selected' : ''}>Bosquesino</option>
                        </select>
                    </td>
                </tr>`;
        }).join('');

        cont.innerHTML = `
            <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; text-align: left;">
                <thead>
                    <tr style="background: #f4efe0; color: #5c4308; font-size: 12px;">
                        <th style="padding: 10px 8px;">Usuario / Correo</th>
                        <th style="padding: 10px 8px;">Rol Actual</th>
                        <th style="padding: 10px 8px;">Asignar Rol</th>
                    </tr>
                </thead>
                <tbody>${filas}</tbody>
            </table>`;
    } catch (e) {
        cont.innerHTML = '<p style="color:#888; font-size:13px;">No se pudo conectar con el directorio de usuarios.</p>';
    }
}

async function cambiarRolUsuario(userId, nuevoRol) {
    try {
        const res = await fetch(`${hostUrl}/api/usuarios/${userId}/rol`, {
            method: 'PUT',
            headers: obtenerCabecerasSeguras(),
            body: JSON.stringify({ nuevoRol })
        });
        const data = await res.json();
        alert(data.mensaje || data.error);
        cargarTablaUsuarios();
        cargarPostulacionesPendientes();
    } catch (e) {
        alert('Error al cambiar el rol.');
    }
}


document.getElementById('formPostularCustodio')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = { vereda: document.getElementById('post-vereda').value, tamañoPredio: document.getElementById('post-tamano').value, tipoBosque: document.getElementById('post-bosque').value };
    try {
        const res = await fetch(`${hostUrl}/api/postular-custodio`, { method: 'POST', headers: obtenerCabecerasSeguras(), body: JSON.stringify(datos) });
        const data = await res.json();
        if (res.ok) { alert(data.mensaje || '¡Postulación enviada con éxito!'); abrirModalPostulacion(); } else { alert(data.error || 'No se pudo enviar la postulación.'); }
    } catch (error) { alert('Error de conexión al enviar la postulación.'); }
});

document.getElementById('formRegistrarAsociado')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await fetch(`${hostUrl}/api/registrar-asociado`, { method: 'POST', headers: obtenerCabecerasSeguras(), body: JSON.stringify({ email: document.getElementById('asociado-email').value, password: document.getElementById('asociado-password').value }) });
    const data = await res.json();
    if (res.ok) { document.getElementById('formRegistrarAsociado').reset(); alert(data.mensaje); } else { alert(data.error || 'Error al registrar Custodio'); }
});

async function abrirModalMonitoreo() {
    if (!esGestor) return;
    const cont = document.getElementById('listaArbolesMonitoreo');
    document.getElementById('modalMonitoreoArboles').classList.remove('oculto');
    cont.innerHTML = 'Cargando tus árboles...';
    const res = await fetch(`${hostUrl}/api/arboles-matriz`, { headers: obtenerCabecerasSeguras() });
    window.arbolesMatrizGlobal = await res.json();
    const rol = localStorage.getItem('rolUsuario');
    const miUsuario = (localStorage.getItem('emailUsuario') || '').toLowerCase();
    const misArboles = (rol === 'Bosquesino' || rol === 'Admin') 
        ? window.arbolesMatrizGlobal 
        : window.arbolesMatrizGlobal.filter(a => 
            (a.registradoPor && a.registradoPor.toLowerCase() === miUsuario) || 
            (a.custodio && a.custodio.toLowerCase().includes(miUsuario))
        );
    if (misArboles.length === 0) { cont.innerHTML = '<p style="font-size:13px; color:#666;">No tienes árboles bajo tu custodia.</p>'; return; }
    misArboles.forEach(a => {
        let est = a.monitoreos.length ? a.monitoreos[a.monitoreos.length-1].estadoFenologico : 'Recién registrado';
        let etiq = est === 'Semilla madura' ? `<div style="background:#cf222e;color:white;padding:4px;border-radius:4px;font-size:11px;"> ¡COSECHAR!</div>` : `<div style="background:#d8eadd;padding:4px;border-radius:4px;font-size:11px;">Actual: ${escapeHtml(est)}</div>`;
        cont.innerHTML += `<div style="border:1px solid #d0d7de; padding:15px; border-radius:8px; margin-bottom:10px; position: relative;"><div style="position: absolute; top: 15px; right: 15px;"><button style="background: none; border: none; font-size: 16px; cursor: pointer;" onclick="editarArbol('${escapeHtml(a._id)}')"></button></div>${etiq}<h4 style="margin-top: 10px; width: 85%;">${escapeHtml(a.codigoArbol)} - ${escapeHtml(a.nombreComun)}</h4><p> ${escapeHtml(a.veredaSector)} (Custodio: ${escapeHtml(a.custodio)})</p><div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;"><button onclick="registrarFenologia('${escapeHtml(a._id)}', 'Hojas')"> Hojas</button><button onclick="registrarFenologia('${escapeHtml(a._id)}', 'Floración')"> Flor</button><button onclick="registrarFenologia('${escapeHtml(a._id)}', 'Fruto verde')"> Verde</button><button onclick="registrarFenologia('${escapeHtml(a._id)}', 'Semilla madura')" style="color:red; font-weight:bold;"> Madura</button></div></div>`;
    });
    actualizarDashboard();
}

function editarArbol(id) {
    const arbol = window.arbolesMatrizGlobal.find(a => a._id === id);
    if (!arbol) return;
    document.getElementById('edit-arbol-id').value = arbol._id; document.getElementById('edit-arbol-especie').value = arbol.nombreComun || ''; document.getElementById('edit-arbol-cientifico').value = arbol.nombreCientifico || ''; document.getElementById('edit-arbol-codigo').value = arbol.codigoArbol || ''; document.getElementById('edit-arbol-finca').value = arbol.finca || ''; document.getElementById('edit-arbol-vereda').value = arbol.veredaSector || ''; document.getElementById('edit-arbol-custodio').value = arbol.custodio || '';
    document.getElementById('modalMonitoreoArboles').classList.add('oculto'); document.getElementById('modalEditarArbol').classList.remove('oculto');
}

document.getElementById('formEditarArbol')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-arbol-id').value;
    const datosActualizados = { nombreComun: document.getElementById('edit-arbol-especie').value, nombreCientifico: document.getElementById('edit-arbol-cientifico').value, codigoArbol: document.getElementById('edit-arbol-codigo').value, finca: document.getElementById('edit-arbol-finca').value, veredaSector: document.getElementById('edit-arbol-vereda').value, custodio: document.getElementById('edit-arbol-custodio').value };
    try {
        const res = await fetch(`${hostUrl}/api/arboles-matriz/${id}`, { method: 'PUT', headers: obtenerCabecerasSeguras(), body: JSON.stringify(datosActualizados) });
        if (res.ok) { document.getElementById('modalEditarArbol').classList.add('oculto'); alert('Árbol actualizado correctamente.'); abrirModalMonitoreo(); } else { alert('Hubo un error al guardar.'); }
    } catch (error) { console.error('Error:', error); }
});

async function registrarFenologia(id, estado) {
    if (!(await confirmarBosquesino(`¿Reportar estado fenológico: ${estado}?`))) return;
    await fetch(`${hostUrl}/api/arboles-matriz/${id}/monitoreo`, { method: 'POST', headers: obtenerCabecerasSeguras(), body: JSON.stringify({ estadoFenologico: estado, observaciones: 'Campo' }) });
    abrirModalMonitoreo();
}

function abrirModalDirectorio() {
    const cont = document.getElementById('listaDirectorioRed');
    document.getElementById('modalDirectorioArboles').classList.remove('oculto');
    cont.innerHTML = '';
    if (window.arbolesMatrizGlobal.length === 0) { cont.innerHTML = '<p style="font-size:13px; color:#666;">La red aún no tiene árboles registrados.</p>'; return; }
    window.arbolesMatrizGlobal.forEach(a => {
        let est = a.monitoreos.length ? a.monitoreos[a.monitoreos.length-1].estadoFenologico : 'Sin reporte';
        let colorBorde = est === 'Semilla madura' ? '#cf222e' : '#d0d7de';
        let alerta = est === 'Semilla madura' ? '<b style="color:#cf222e;"> ( Listo para cosechar)</b>' : '';
        cont.innerHTML += `<div style="border:1px solid ${colorBorde}; padding:12px; border-radius:8px; background:#f8fbf9;"><h4 style="margin: 0 0 5px 0; color:#1f2328; font-size:14px;">${escapeHtml(a.codigoArbol)} - ${escapeHtml(a.nombreComun)}</h4><p style="margin: 0 0 5px 0; font-size: 12px; color:#57606a;"> Vereda: ${escapeHtml(a.veredaSector)}</p><p style="margin: 0; font-size: 12px; color:#57606a;"> Custodio: <b>${escapeHtml(a.custodio)}</b></p><p style="margin: 5px 0 0 0; font-size: 12px; color:#1b4332;">Estado: ${escapeHtml(est)}${alerta}</p></div>`;
    });
}

function abrirMicrositio(id) {
    const especie = window.especiesGlobal.find(i => i._id === id); 
    if (!especie) return;
    especieActualId = id; 
    especieSeleccionadaMicrositio = especie.nombreComun;
    document.getElementById('detalle-nombre').innerText = especie.nombreComun; 
    document.getElementById('detalle-cientifico').innerText = especie.nombreCientifico || '';
    document.getElementById('detalle-caracteristicas').innerText = especie.caracteristicas || '';
    document.getElementById('detalle-imagen').src = especie.imagenUrl || ''; 
    document.getElementById('detalle-imagen').style.display = especie.imagenUrl ? 'block' : 'none';
    const contSaberes = document.getElementById('contenedor-saberes'); 
    contSaberes.innerHTML = '';
    if (especie.saberes && especie.saberes.length) {
        especie.saberes.forEach(s => contSaberes.innerHTML += `<p>"${s.descripcion}" - <b>${s.autor}</b></p>`);
    } else {
        contSaberes.innerHTML = 'Sin saberes registrados.';
    }
    document.getElementById('contenedorBotonAportarSaber').className = esGestor ? '' : 'oculto';
    cancelarSaber(); 
    document.getElementById('modalDetalleEspecie').classList.remove('oculto');
}

function activarAporteSaber() { document.getElementById('vistaLecturaEspecie').classList.add('oculto'); document.getElementById('formAportarSaber').classList.remove('oculto'); document.getElementById('contenedorBotonAportarSaber').classList.add('oculto'); }
function cancelarSaber() { document.getElementById('vistaLecturaEspecie').classList.remove('oculto'); document.getElementById('formAportarSaber').classList.add('oculto'); if (esGestor) document.getElementById('contenedorBotonAportarSaber').classList.remove('oculto'); }

document.getElementById('formAportarSaber')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await fetch(`${hostUrl}/api/especies/${especieActualId}`, { method: 'PUT', headers: obtenerCabecerasSeguras(), body: JSON.stringify({ nuevoSaber: { autor: document.getElementById('saber-autor').value, descripcion: document.getElementById('saber-desc').value } }) });
    if (res.ok) { await cargarCatalogo(); abrirMicrositio(especieActualId); }
});

function prepAvanzar(id) { document.getElementById('avanzar-loteId').value = id; document.getElementById('modalAvanzarLote').classList.remove('oculto'); }
function prepRetirar(id) { document.getElementById('retirar-loteId').value = id; document.getElementById('modalRetiroLote').classList.remove('oculto'); }

document.getElementById('formRetirarLote')?.addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    await fetch(`${hostUrl}/api/lotes/retirar`, { method: 'POST', headers: obtenerCabecerasSeguras(), body: JSON.stringify({ loteId: document.getElementById('retirar-loteId').value, cantidadRetirar: document.getElementById('retirar-loteCantidad').value, motivo: document.getElementById('retirar-loteMotivo').value }) }); 
    document.getElementById('modalRetiroLote').classList.add('oculto'); await cargarCatalogo(); abrirGestionInventario(especieInventarioActiva);
});

function apadrinarArbol() { document.getElementById('modalDetalleEspecie').classList.add('oculto'); cambiarVista('vista-apadrinar'); }

function cambiarMicrositio(idActual, idDestino) {
    document.getElementById(idActual).classList.add('oculto');
    document.getElementById(idDestino).classList.remove('oculto');
}

async function procesarRegistroPublico() {
    const username = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    const res = await fetch(`${hostUrl}/api/registro-publico`, { 
        method: 'POST', 
        headers: {'Content-Type':'application/json'}, 
        body: JSON.stringify({ username, email, password }) 
    });
    const data = await res.json();
    if (res.ok) { 
        alert(data.mensaje); 
        cambiarMicrositio('modalRegistroPublico', 'modalLoginClasico'); 
    } else { 
        alert(data.error); 
    }
}

async function procesarLoginClasico() {
    const identificador = document.getElementById('login-email-clasico').value;
    const password = document.getElementById('login-password-clasico').value;

    const res = await fetch(`${hostUrl}/api/login`, { 
        method: 'POST', 
        headers: {'Content-Type':'application/json'}, 
        body: JSON.stringify({ identificador, password }) 
    });
    if (res.ok) { 
        const d = await res.json(); 
        localStorage.setItem('tokenAdmin', d.token); 
        localStorage.setItem('rolUsuario', d.rol); 
        localStorage.setItem('emailUsuario', d.username);
        location.reload(); 
    } else { 
        alert('Usuario o contraseña incorrectos'); 
    }
}

async function solicitarRecuperacion() {
    const email = document.getElementById('rec-email').value.trim();
    const btn = document.getElementById('btnEnviarCodigoRec');
    btn.disabled = true;
    btn.innerText = 'Enviando código...';

    try {
        const res = await fetch(`${hostUrl}/api/olvide-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        alert(data.mensaje || data.error);
        if (res.ok) {
            document.getElementById('formSolicitarCodigo').classList.add('oculto');
            document.getElementById('formConfirmarCodigo').classList.remove('oculto');
        }
    } catch (error) {
        alert('Error de conexión con el servidor.');
    } finally {
        btn.disabled = false;
        btn.innerText = 'Enviar Código al Correo';
    }
}

async function confirmarNuevaPassword() {
    const token = document.getElementById('rec-codigo').value.trim();
    const nuevaPassword = document.getElementById('rec-nueva-pass').value;

    try {
        const res = await fetch(`${hostUrl}/api/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, nuevaPassword })
        });
        const data = await res.json();
        alert(data.mensaje || data.error);
        if (res.ok) {
            document.getElementById('formConfirmarCodigo').reset();
            document.getElementById('formSolicitarCodigo').reset();
            volverAlLoginDesdeRecuperacion();
        }
    } catch (error) {
        alert('Error al actualizar la contraseña.');
    }
}

function volverAlLoginDesdeRecuperacion() {
    document.getElementById('formSolicitarCodigo').classList.remove('oculto');
    document.getElementById('formConfirmarCodigo').classList.add('oculto');
    cambiarMicrositio('modalOlvidePassword', 'modalLoginClasico');
}

function toggleAdmin() { 
    if (sesionIniciada) { localStorage.clear(); location.reload(); } 
    else { document.getElementById('modalLoginClasico').classList.remove('oculto'); }
}

// =========================================================
//   BLOQUE INDEPENDIENTE: APADRINAMIENTOS Y CERTIFICADOS QR
// =========================================================
let listaApadrinamientosGlobal = [];

function autocompletarCantidadPlan() {
    const plan = document.getElementById('pad-plan').value;
    const inputCant = document.getElementById('pad-cantidad');
    if (plan === 'Semilla') inputCant.value = 1;
    if (plan === 'Raíz') inputCant.value = 3;
    if (plan === 'Naciente') inputCant.value = 10;
    if (plan === 'Cuenca') inputCant.value = 30;
}

function solicitarPlanWhatsApp(nombrePlan) {
    const msj = `Hola Asociación Bosquesinos , quiero apadrinar árboles nativos con el *${nombrePlan}* (Ciclo de 2 años de establecimiento + Certificado QR). ¿Cómo realizo el aporte?`;
    window.open(`https://wa.me/573226575786?text=${encodeURIComponent(msj)}`, '_blank');
}

async function cargarApadrinamientos() {
    if (esGestor) {
        const panelGestor = document.getElementById('panel-gestor-apadrinamiento');
        if (panelGestor) panelGestor.classList.remove('oculto');
    }
    try {
        const res = await fetch(`${hostUrl}/api/apadrinamientos`);
        if (res.ok) {
            listaApadrinamientosGlobal = await res.json();
        }
    } catch (e) {
        console.log('Cargando apadrinamientos locales...');
    }
    dibujarApadrinamientos(listaApadrinamientosGlobal);

    // Si alguien entró escaneando un Código QR (ej: ?certificado=PAD-26-XXXX)
    const params = new URLSearchParams(window.location.search);
    const certQR = params.get('certificado');
    if (certQR) {
        cambiarVista('vista-apadrinar');
        document.getElementById('input-buscar-certificado').value = certQR;
        buscarCertificadoPublico();
    }
}

function dibujarApadrinamientos(lista) {
    const cont = document.getElementById('contenedor-certificados-padrinos');
    if (!cont) return;

    if (!lista || lista.length === 0) {
        cont.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 35px; background: #fdfbf7; border-radius: 12px; border: 1px dashed #9ab8a5; color: #52796f;">
             Aún no hay certificados públicos en esta vista o no coinciden con tu búsqueda. ¡Sé el primero en apadrinar un árbol nativo!
        </div>`;
        return;
    }

    cont.innerHTML = lista.map(p => {
        const fInicio = new Date(p.fechaInicio).toLocaleDateString('es-CO');
        const fFin = new Date(p.fechaFinCuidado).toLocaleDateString('es-CO');
        const urlDirectaQR = `${window.location.origin}/?certificado=${encodeURIComponent(p.codigoCertificado)}`;
        const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(urlDirectaQR)}`;

        const historialHtml = (p.bitacoraMantenimiento || []).map(b => `
            <li style="margin-bottom: 8px; font-size: 0.85rem; color: #354f52;">
                <b>${new Date(b.fecha).toLocaleDateString('es-CO')} — ${escapeHtml(b.actividad)}:</b> ${escapeHtml(b.observaciones || '')}
                ${urlSegura(b.fotoUrl) ? `<br><a href="${urlSegura(b.fotoUrl)}" target="_blank" rel="noopener noreferrer" style="color:#0d4a29; font-weight:bold;"> Ver foto de evidencia</a>` : ''}
            </li>
        `).join('');

        const botonesGestor = esGestor ? `
            <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed #ccc; display: flex; gap: 8px; flex-wrap: wrap;">
                <button type="button" onclick="agregarMantenimientoPadrino('${escapeHtml(p._id)}')" style="width: max-content !important; margin: 0; padding: 6px 12px; font-size: 12px; background: #e9f5ed; color: #1b4332; border: 1px solid #2d6a4f; border-radius: 6px; cursor: pointer; font-weight: bold;">
                     + Reportar Plateo / Seguimiento
                </button>
                <button type="button" onclick="eliminarCertificadoPadrino('${escapeHtml(p._id)}')" style="width: max-content !important; margin: 0; padding: 6px 10px; font-size: 12px; background: #fff0f0; color: #cf222e; border: 1px solid #cf222e; border-radius: 6px; cursor: pointer;">
                    
                </button>
            </div>` : '';

        return `
            <div style="background: #fdfbf7; border: 2px solid #d4e3da; border-radius: 14px; padding: 22px; text-align: left; box-shadow: 0 4px 14px rgba(0,0,0,0.05); position: relative;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                    <div>
                        <span style="background: #0d4a29; color: white; padding: 4px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: bold; letter-spacing: 0.5px;">
                             ${escapeHtml(p.codigoCertificado)}
                        </span>
                        <h3 style="margin: 10px 0 4px 0; color: #1b4332; font-family: Georgia, serif; font-size: 1.35rem;">
                            ${escapeHtml(p.nombrePadrino)}
                        </h3>
                        <p style="margin: 0; font-size: 0.9rem; color: #b55016; font-weight: bold;">
                            Plan ${escapeHtml(p.plan)} • ${Number(p.cantidadArboles) || 0} ${p.cantidadArboles > 1 ? 'Árboles' : 'Árbol'} (${escapeHtml(p.especie)})
                        </p>
                    </div>
                    <img src="${qrImgUrl}" alt="QR ${escapeHtml(p.codigoCertificado)}" title="Escanea para abrir este certificado" style="width: 78px; height: 78px; border-radius: 8px; border: 1px solid #dce8e0; padding: 4px; background: white;">
                </div>

                ${p.mensajeDedicatoria ? `<blockquote style="margin: 12px 0; padding: 8px 12px; background: #f2f8f4; border-left: 3px solid #2d6a4f; font-style: italic; font-size: 0.88rem; color: #244232;">“${escapeHtml(p.mensajeDedicatoria)}”</blockquote>` : ''}

                <div style="font-size: 0.84rem; color: #4a5d52; margin-top: 12px; line-height: 1.6; background: white; padding: 10px 12px; border-radius: 8px; border: 1px solid #eef4f0;">
                    <div> <b>Ruta / Vereda:</b> ${escapeHtml(p.veredaRuta)} ${p.loteCodigo ? `(Lote: <b>${escapeHtml(p.loteCodigo)}</b>)` : ''}</div>
                    <div> <b>Cobertura de Cuidado (2 Años):</b> ${fInicio} al ${fFin}</div>
                    <div> <b>Estado actual:</b> <span style="color:#0d4a29; font-weight:bold;">${escapeHtml(p.estadoCuidado)}</span></div>
                </div>

                <details style="margin-top: 12px;">
                    <summary style="font-size: 0.85rem; font-weight: bold; color: #0d4a29; cursor: pointer;">
                         Ver Bitácora de Mantenimiento y QR Grande (${(p.bitacoraMantenimiento || []).length})
                    </summary>
                    <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #d8eadd;">
                        ${urlSegura(p.imagenArbolUrl) ? `<img src="${urlSegura(p.imagenArbolUrl)}" style="width:100%; max-height:220px; object-fit:cover; border-radius:8px; margin-bottom:10px;">` : ''}
                        <ul style="padding-left: 18px; margin: 0 0 12px 0;">${historialHtml}</ul>
                        <div style="text-align: center; background: white; padding: 10px; border-radius: 8px; border: 1px solid #e4ece7;">
                            <img src="${qrImgUrl}" style="width: 130px; height: 130px;"><br>
                            <small style="color: #666;">Escanea este QR para verificar el certificado <b>${escapeHtml(p.codigoCertificado)}</b></small>
                        </div>
                    </div>
                </details>

                ${botonesGestor}
            </div>`;
    }).join('');
}

function buscarCertificadoPublico() {
    const q = (document.getElementById('input-buscar-certificado').value || '').trim().toLowerCase();
    if (!q) { dibujarApadrinamientos(listaApadrinamientosGlobal); return; }
    const filtrados = listaApadrinamientosGlobal.filter(p => 
        p.codigoCertificado.toLowerCase().includes(q) || 
        p.nombrePadrino.toLowerCase().includes(q) ||
        p.especie.toLowerCase().includes(q)
    );
    dibujarApadrinamientos(filtrados);
}

function limpiarBusquedaCertificado() {
    document.getElementById('input-buscar-certificado').value = '';
    dibujarApadrinamientos(listaApadrinamientosGlobal);
}

document.getElementById('formNuevoApadrinamiento')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = {
        nombrePadrino: document.getElementById('pad-nombre').value,
        plan: document.getElementById('pad-plan').value,
        cantidadArboles: document.getElementById('pad-cantidad').value,
        especie: document.getElementById('pad-especie').value,
        veredaRuta: document.getElementById('pad-vereda').value,
        loteCodigo: document.getElementById('pad-lote').value,
        imagenArbolUrl: document.getElementById('pad-foto').value,
        mensajeDedicatoria: document.getElementById('pad-dedicatoria').value
    };
    const res = await fetch(`${hostUrl}/api/apadrinamientos`, {
        method: 'POST',
        headers: obtenerCabecerasSeguras(),
        body: JSON.stringify(datos)
    });
    const data = await res.json();
    alert(data.mensaje || data.error);
    if (res.ok) {
        document.getElementById('formNuevoApadrinamiento').reset();
        cargarApadrinamientos();
    }
});

async function agregarMantenimientoPadrino(id) {
    const actividad = prompt(' ¿Qué labor se realizó? (Ej: 1er Plateo y abono orgánico / Siembra en loma):');
    if (!actividad) return;
    const observaciones = prompt(' Observaciones del estado del árbol (Ej: Árbol de 65 cm, sano y con hojas nuevas):') || '';
    const fotoUrl = prompt(' Opcional: Pega el link (URL) de la foto de este mantenimiento:') || '';
    const estadoCuidado = prompt(' Estado actual (Ej: 1er Plateo Completado - Crecimiento Firme):') || 'En Mantenimiento Activo (Ciclo 2 Años)';

    const res = await fetch(`${hostUrl}/api/apadrinamientos/${id}/mantenimiento`, {
        method: 'POST',
        headers: obtenerCabecerasSeguras(),
        body: JSON.stringify({ actividad, observaciones, fotoUrl, estadoCuidado })
    });
    const data = await res.json();
    alert(data.mensaje || data.error);
    if (res.ok) cargarApadrinamientos();
}

async function eliminarCertificadoPadrino(id) {
    if (!(await confirmarBosquesino('¿Seguro que deseas eliminar este certificado?'))) return;
    const res = await fetch(`${hostUrl}/api/apadrinamientos/${id}`, {
        method: 'DELETE',
        headers: obtenerCabecerasSeguras()
    });
    if (res.ok) cargarApadrinamientos();
}

async function cargarVistaCustodios() {
    const tbody = document.getElementById('tbody-arboles-custodios');
    if (!sesionIniciada) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="padding: 25px; text-align: center; color: #666;">Inicia sesión para consultar la fuente semillera.</td></tr>';
        return;
    }
    try {
        const res = await fetch(`${hostUrl}/api/arboles-matriz`, { headers: obtenerCabecerasSeguras() });
        if (res.status === 401) {
            localStorage.removeItem('tokenAdmin');
            localStorage.removeItem('rolUsuario');
            localStorage.removeItem('emailUsuario');
            sesionIniciada = false;
            esGestor = false;
            document.getElementById('btn-nav-login')?.classList.remove('oculto');
            document.getElementById('btn-nav-cuenta')?.classList.add('oculto');
            document.getElementById('btn-nav-admin')?.classList.add('oculto');
            document.getElementById('btn-nav-custodios')?.classList.add('oculto');
            if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="padding: 25px; text-align: center; color: #b55016; font-weight: bold;">Tu sesión expiró (el servidor se reinició o venció el acceso). Inicia sesión nuevamente para ver los árboles.</td></tr>';
            document.getElementById('modalLoginClasico')?.classList.remove('oculto');
            return;
        }
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="padding: 25px; text-align: center; color: #cf222e;">Error al consultar fuente semillera: ${escapeHtml(err.error || res.status)}</td></tr>`;
            return;
        }
        window.arbolesMatrizGlobal = await res.json();

        // Llenar selector de Custodios/Estudiantes únicos
        const selEst = document.getElementById('filtro-cust-estudiante');
        if (selEst) {
            const custodiosUnicos = [...new Set(window.arbolesMatrizGlobal.map(a => a.custodio).filter(Boolean))].sort();
            selEst.innerHTML = '<option value="">Todos los Custodios / Estudiantes (' + custodiosUnicos.length + ')</option>';
            custodiosUnicos.forEach(c => {
                const cEsc = escapeHtml(c);
                selEst.innerHTML += `<option value="${cEsc}">${cEsc}</option>`;
            });
        }
        filtrarTablaCustodios();
    } catch (e) {
        console.error(e);
        if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="padding: 25px; text-align: center; color: #cf222e;">No se pudo conectar con el servidor para cargar los árboles.</td></tr>';
    }
}

function filtrarTablaCustodios() {
    const qEsp = (document.getElementById('filtro-cust-especie')?.value || '').trim().toLowerCase();
    const qEst = (document.getElementById('filtro-cust-estudiante')?.value || '').trim();
    const lista = (window.arbolesMatrizGlobal || []).filter(a => {
        const coincideEsp = !qEsp || (a.nombreComun && a.nombreComun.toLowerCase().includes(qEsp)) || (a.nombreCientifico && a.nombreCientifico.toLowerCase().includes(qEsp));
        const coincideEst = !qEst || a.custodio === qEst;
        return coincideEsp && coincideEst;
    });

    // Actualizar contadores superiores
    const espUnicas = new Set(lista.map(a => a.nombreComun));
    const custUnicos = new Set(lista.map(a => a.custodio));
    if (document.getElementById('cust-total-arboles')) document.getElementById('cust-total-arboles').innerText = lista.length;
    if (document.getElementById('cust-total-especies')) document.getElementById('cust-total-especies').innerText = espUnicas.size;
    if (document.getElementById('cust-total-custodios')) document.getElementById('cust-total-custodios').innerText = custUnicos.size;

    // Píldoras de conteo por especie
    const conteoPorEsp = {};
    lista.forEach(a => { conteoPorEsp[a.nombreComun] = (conteoPorEsp[a.nombreComun] || 0) + 1; });
    const divResumen = document.getElementById('resumen-especies-custodios');
    if (divResumen) {
        divResumen.innerHTML = Object.entries(conteoPorEsp)
            .sort((a, b) => b[1] - a[1])
            .map(([nom, cant]) => `<span onclick="document.getElementById('filtro-cust-especie').value='${nom}'; filtrarTablaCustodios();" style="cursor:pointer; white-space:nowrap; background:#e9f5ed; color:#1b4332; border:1px solid #74c69d; padding:5px 12px; border-radius:16px; font-size:12px; font-weight:bold;">${nom}: ${cant}</span>`)
            .join('');
    }

    // Dibujar filas de la tabla estilo Excel
    const tbody = document.getElementById('tbody-arboles-custodios');
    if (!tbody) return;
    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="padding: 25px; text-align: center; color: #666;">No hay árboles que coincidan con el filtro.</td></tr>';
        return;
    }

    tbody.innerHTML = lista.map(a => `
        <tr style="border-bottom: 1px solid #eef4f0;">
            <td style="padding: 10px; font-weight: bold; color: #52796f;">${escapeHtml(a.contador || '-')}</td>
            <td style="padding: 10px;">${escapeHtml(a.numeroArbol || '-')}</td>
            <td style="padding: 10px; font-weight: 600; color: #1b4332;">${escapeHtml(a.custodio || '-')}</td>
            <td style="padding: 10px; font-weight: bold; color: #0d4a29;">${escapeHtml(a.nombreComun)}</td>
            <td style="padding: 10px; font-style: italic; color: #52796f;">${escapeHtml(a.nombreCientifico || '-')}</td>
            <td style="padding: 10px;">${a.dap ? escapeHtml(a.dap) + ' cm' : '-'}</td>
            <td style="padding: 10px; text-align: center;">${Number(a.flores ?? 0)}</td>
            <td style="padding: 10px; text-align: center; font-weight: bold; color: ${a.frutos > 0 ? '#c86428' : '#666'};">${Number(a.frutos ?? 0)}</td>
            <td style="padding: 10px; text-align: center;">${Number(a.rebrote ?? 0)}</td>
        </tr>
    `).join('');
}

window.onload = function() { 
    const token = localStorage.getItem('tokenAdmin');
    let rol = localStorage.getItem('rolUsuario');
    if (rol === 'Fundador') {
        rol = 'Bosquesino';
        localStorage.setItem('rolUsuario', 'Bosquesino');
    }
    const email = localStorage.getItem('emailUsuario') || '';
    const vistaGuardada = sessionStorage.getItem('vistaActivaBosquesinos');

    if (token) { 
        sesionIniciada = true;
        esGestor = (rol === 'Bosquesino' || rol === 'Custodio' || rol === 'Admin');

        document.getElementById('btn-nav-custodios')?.classList.remove('oculto');
        cargarVistaCustodios();
        if (window.location.pathname === '/custodios') sessionStorage.setItem('vistaActivaBosquesinos', 'vista-custodios');

        const btnLogin = document.getElementById('btn-nav-login');
        if (btnLogin) btnLogin.classList.add('oculto');
        document.getElementById('btn-nav-cuenta')?.classList.remove('oculto');
        document.getElementById('btnModoAdmin').innerText = 'Cerrar Sesión';

        // MOSTRAR BOTONES DE CREAR CRÓNICA A CUALQUIERA CON CUENTA
        const btnEditor = document.getElementById('btn-abrir-editor-cronica');
        const cajaInvitacion = document.getElementById('caja-invitacion-escribir');
        if (btnEditor) btnEditor.classList.remove('oculto');
        if (cajaInvitacion) cajaInvitacion.classList.remove('oculto');

        // CONTROL ESTRICTO DE PERMISOS POR ROL
        const esMotorCampo = (rol === 'Bosquesino' || rol === 'Custodio');
        const esBosquesino = (rol === 'Bosquesino' || email === 'bosquesinos');

        if (esGestor) {
            document.getElementById('btn-nav-admin')?.classList.remove('oculto');
            document.getElementById('panel-gestor-apadrinamiento')?.classList.remove('oculto');
        } else {
            document.getElementById('btn-nav-admin')?.classList.add('oculto');
            document.getElementById('panel-gestor-apadrinamiento')?.classList.add('oculto');
            document.getElementById('btn-nav-postular')?.classList.remove('oculto');
            document.getElementById('bannerPostulacionAlianza')?.classList.remove('oculto');
        }

        if (esMotorCampo) {
            document.getElementById('bloque-motor-cerrado')?.classList.remove('oculto');
            cargarFincas();
        } else {
            document.getElementById('bloque-motor-cerrado')?.classList.add('oculto');
        }

        if (esBosquesino) {
            document.getElementById('btn-tab-gobernanza')?.classList.remove('oculto');
            cargarPostulacionesPendientes();
            cargarTablaUsuarios();
        } else {
            document.getElementById('btn-tab-gobernanza')?.classList.add('oculto');
            document.getElementById('subpanel-gobernanza')?.classList.add('oculto');
        }

        cargarCatalogo();
        cargarCronicasTerritorio();
        cargarApadrinamientos();
        cambiarVista(vistaGuardada || 'vista-catalogo');
    } else {
        cargarCatalogo(); 
        cargarCronicasTerritorio();
        cargarApadrinamientos();
        if (vistaGuardada) cambiarVista(vistaGuardada);
    } 
};

function cambiarVista(idVistaDestino) {
    document.getElementById('contenedor-botones-nav')?.classList.remove('menu-abierto');
    if (idVistaDestino === 'panelAdmin' && !esGestor) {
        idVistaDestino = 'vista-catalogo';
    }
    sessionStorage.setItem('vistaActivaBosquesinos', idVistaDestino);

    const vistas = ['vista-inicio', 'vista-catalogo', 'vista-gente', 'panelAdmin', 'vista-legal', 'vista-territorio', 'vista-apadrinar','vista-custodios'];
    vistas.forEach(function(vista) {
        const elemento = document.getElementById(vista);
        if (elemento) { 
            elemento.classList.add('oculto'); 
            elemento.classList.remove('vista-activa'); 
        }
    });
    const vistaDestino = document.getElementById(idVistaDestino);
    if (vistaDestino) { 
        vistaDestino.classList.remove('oculto'); 
        void vistaDestino.offsetWidth; 
        vistaDestino.classList.add('vista-activa'); 
    }
    if (idVistaDestino === 'vista-custodios') {
        cargarVistaCustodios();
    }
    const nav = document.getElementById('menu-principal');
    if (idVistaDestino === 'vista-inicio') { 
        nav.classList.add('oculto'); 
    } else { 
        nav.classList.remove('oculto'); 
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function enviarInteresWhatsApp() {
    window.open('https://wa.me/573226575786?text=Hola Bosquesinos, estoy interesado en colaborar con la asociación. Me gustaría hablar sobre...', '_blank');
}

async function abrirModalMiCuenta() {
    if (!sesionIniciada) return document.getElementById('modalLoginClasico')?.classList.remove('oculto');
    const modal = document.getElementById('modalMiCuenta');
    const resumen = document.getElementById('cuenta-resumen-usuario');
    const estadoEmail = document.getElementById('cuenta-estado-email');
    const inputEmail = document.getElementById('cuenta-email');
    const formVerif = document.getElementById('formCuentaVerificarEmail');
    const usuario = localStorage.getItem('emailUsuario') || '';
    const rol = localStorage.getItem('rolUsuario') || 'Vigía';
    if (resumen) resumen.textContent = `Usuario: ${usuario} • Rol: ${rol}`;
    if (formVerif) formVerif.classList.add('oculto');
    if (modal) modal.classList.remove('oculto');

    try {
        const res = await fetch(`${hostUrl}/api/mi-perfil`, { headers: obtenerCabecerasSeguras() });
        if (res.ok) {
            const perfil = await res.json();
            if (perfil && inputEmail) inputEmail.value = perfil.email || '';
            if (perfil && resumen) resumen.textContent = `Usuario: ${perfil.username} • Rol: ${perfil.rol}`;
            if (perfil && estadoEmail) {
                if (perfil.email && perfil.emailVerificado) {
                    estadoEmail.textContent = `Correo verificado: ${perfil.email}`;
                } else if (perfil.email) {
                    estadoEmail.textContent = `Correo registrado (sin verificar): ${perfil.email}`;
                } else {
                    estadoEmail.textContent = 'Aún no tienes un correo verificado en esta cuenta.';
                }
            }
        }
    } catch (e) { console.error(e); }
}

document.getElementById('formCuentaEmail')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('cuenta-email')?.value.trim();
    try {
        const res = await fetch(`${hostUrl}/api/mi-perfil/email`, {
            method: 'PUT',
            headers: obtenerCabecerasSeguras(),
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        alert(data.mensaje || data.error);
        if (res.ok) {
            document.getElementById('formCuentaVerificarEmail')?.classList.remove('oculto');
        }
    } catch (err) {
        alert('Error de conexión al enviar el código de verificación.');
    }
});

document.getElementById('formCuentaVerificarEmail')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const codigo = document.getElementById('cuenta-codigo-email')?.value.trim();
    try {
        const res = await fetch(`${hostUrl}/api/mi-perfil/email-confirmar`, {
            method: 'POST',
            headers: obtenerCabecerasSeguras(),
            body: JSON.stringify({ codigo })
        });
        const data = await res.json();
        alert(data.mensaje || data.error);
        if (res.ok) {
            document.getElementById('formCuentaVerificarEmail')?.classList.add('oculto');
            document.getElementById('formCuentaVerificarEmail')?.reset();
            const estadoEmail = document.getElementById('cuenta-estado-email');
            if (estadoEmail && data.email) estadoEmail.textContent = `Correo verificado: ${data.email}`;
        }
    } catch (err) {
        alert('Error de conexión al confirmar el correo.');
    }
});

document.getElementById('formCuentaPassword')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const passwordActual = document.getElementById('cuenta-pass-actual')?.value || '';
    const nuevaPassword = document.getElementById('cuenta-pass-nueva')?.value || '';
    const confirmar = document.getElementById('cuenta-pass-confirmar')?.value || '';
    if (nuevaPassword !== confirmar) {
        return alert('Las contraseñas nuevas no coinciden.');
    }
    try {
        const res = await fetch(`${hostUrl}/api/mi-perfil/password`, {
            method: 'PUT',
            headers: obtenerCabecerasSeguras(),
            body: JSON.stringify({ passwordActual, nuevaPassword })
        });
        const data = await res.json();
        alert(data.mensaje || data.error);
        if (res.ok) document.getElementById('formCuentaPassword').reset();
    } catch (err) {
        alert('Error de conexión al actualizar la contraseña.');
    }
});
