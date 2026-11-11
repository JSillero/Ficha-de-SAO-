/* Compendio de NPC del máster, sin DOM. Son plantillas: en la sesión se usan copias (copiaDePlantilla).
 * - Plantilla: { id, piso, nombre, pagina, json }. json = toJSONString de un NPC con PV y PA llenos y sin estados;
 *   piso y nombre se copian del NPC para listar sin cargarlo.
 * - Páginas: para no pasar el límite de 1 MB de un documento de Firestore, las plantillas se reparten en páginas
 *   de menos de TAMANO_MAX_PAGINA bytes. Una nueva va a la última página; si no cabe, se abre otra. Solo se
 *   suben las páginas cambiadas (cambiadas).
 * - Caché: "fichaSAO.compendio" en localStorage = { actualizado, pendiente, cambiadas, total, plantillas }.
 *   pendiente = hay cambios sin subir (sin sesión, o falló la subida). actualizado = hora del último cambio (ms),
 *   para saber si manda la copia local o la de la nube. dueno = uid con el que se sincronizó (si otro usuario
 *   inicia sesión en este navegador, manda su nube, no la copia local).
 * La nube la gestiona la interfaz (interfazMaster.js) con leerCompendio / guardarPaginasCompendio de servicio.js. */
import PJ, { nuevoIdPersonaje, ESTADOS_LISTA } from "./PJ.js";

const CLAVE = "fichaSAO.compendio";
export const VERSION_EXPORTAR = 1;
export const TIPO_EXPORTAR = "compendioNpcSAO";
// Margen bajo el límite de 1 MiB de Firestore (y bajo las 900 000 letras de firestore.rules)
let tamanoMaxPagina = 850000;

let estado = null;

const bytes = (texto) => new TextEncoder().encode(texto).length;
const nuevoIdPlantilla = () => `npc-${nuevoIdPersonaje()}`;

function vacio() {
    return { actualizado: 0, pendiente: false, cambiadas: [], total: 0, plantillas: [], dueno: null };
}

function leer() {
    if (estado) return estado;
    try {
        estado = JSON.parse(localStorage.getItem(CLAVE)) ?? null;
    } catch {
        estado = null;
    }
    if (!estado || typeof estado !== "object" || !Array.isArray(estado.plantillas)) estado = vacio();
    estado.plantillas = estado.plantillas.map(cargarPlantilla).filter(Boolean);
    estado.cambiadas = Array.isArray(estado.cambiadas) ? estado.cambiadas.filter(Number.isInteger) : [];
    estado.total = Math.max(Number(estado.total) || 0, ...estado.plantillas.map(p => p.pagina + 1), 0);
    return estado;
}

/** Guarda la caché. Devuelve false si no cabe en el navegador (sigue en memoria y se puede subir a la nube). */
function escribir() {
    try {
        localStorage.setItem(CLAVE, JSON.stringify(leer()));
        return true;
    } catch (error) {
        console.warn("No cabe el compendio en el navegador:", error);
        return false;
    }
}

/* Una plantilla guardada o importada; null si no es un NPC válido */
function cargarPlantilla(datos) {
    if (!datos || typeof datos !== "object" || typeof datos.json !== "string") return null;
    let pj;
    try {
        pj = new PJ();
        pj.cargarJSON(JSON.parse(datos.json));
    } catch {
        return null;
    }
    if (!pj.esNpc) return null;
    return {
        id: String(datos.id || nuevoIdPlantilla()).slice(0, 80),
        piso: pj.npc.piso,
        nombre: pj.nombre,
        pagina: Number.isInteger(datos.pagina) && datos.pagina >= 0 ? datos.pagina : 0,
        json: datos.json
    };
}

/* NPC listo para guardar como plantilla: sin estados, con las acciones, PV y PA llenos y sin plantilla propia */
function jsonDePlantilla(pj) {
    const copia = new PJ();
    copia.cargarJSON(JSON.parse(pj.toJSONString()));
    ESTADOS_LISTA.forEach(clave => { copia.estados[clave] = { valor: 0, turnos: 0 }; });
    ["izquierda", "derecha", "cabeza", "pies"].forEach(parte => { copia[parte] = true; });
    copia.npc.partes.forEach(parte => { parte.disponible = true; });
    copia.numeroAcciones = 3;
    copia.reaccionGuardada = false;
    copia.enSigilo = false;
    copia.idPlantilla = null;
    copia.calcularCaracteristicas();
    copia.vida = copia.vidaMax;
    copia.puntosArte = copia.puntosArteMax;
    return copia.toJSONString();
}

const tamanoPlantilla = (p) => bytes(JSON.stringify(textoPlantilla(p))) + 1;
const textoPlantilla = ({ id, json }) => ({ id, json });
const dePagina = (n) => leer().plantillas.filter(p => p.pagina === n);
const tamanoPagina = (n, salvo = null) => dePagina(n).filter(p => p !== salvo).reduce((s, p) => s + tamanoPlantilla(p), 2);

function marcar(...paginas) {
    const d = leer();
    paginas.forEach(n => { if (!d.cambiadas.includes(n)) d.cambiadas.push(n); });
    d.actualizado = Date.now();
    d.pendiente = true;
}

/* Página para una plantilla de este tamaño: la última si cabe; si no, una nueva */
function paginaPara(tamano, salvo = null) {
    const d = leer();
    const ultima = Math.max(0, d.total - 1);
    if (d.total === 0) {
        d.total = 1;
        return 0;
    }
    if (tamanoPagina(ultima, salvo) + tamano <= tamanoMaxPagina) return ultima;
    d.total += 1;
    return d.total - 1;
}

/* Lectura _________________________________________________________________________ */

/** Plantillas (sin el json), ordenadas por piso (sin piso al final) y nombre */
export function listar() {
    return leer().plantillas
        .map(({ id, piso, nombre, pagina }) => ({ id, piso, nombre, pagina, resumen: resumenDe(id) }))
        .sort((a, b) => (a.piso ?? Infinity) - (b.piso ?? Infinity) || a.nombre.localeCompare(b.nombre));
}

const porId = (id) => leer().plantillas.find(p => p.id === id) ?? null;
export const existe = (id) => Boolean(id && porId(id));
export const jsonDe = (id) => porId(id)?.json ?? null;

/* Datos para la fila del compendio (nivel, PV, EXP) */
function resumenDe(id) {
    const p = porId(id);
    try {
        const datos = JSON.parse(p.json);
        return { nivel: datos.nivel, vidaMax: datos.npc?.vidaMax, exp: datos.npc?.expRecompensa ?? 0 };
    } catch {
        return {};
    }
}

/** Estado para la interfaz: páginas, si hay cambios sin subir */
export function info() {
    const d = leer();
    return { total: d.total, plantillas: d.plantillas.length, pendiente: d.pendiente, actualizado: d.actualizado, dueno: d.dueno ?? null };
}

/** Usuario con el que se ha sincronizado con la nube */
export function setDueno(uid) {
    leer().dueno = uid ?? null;
    escribir();
}

/* Cambios ________________________________________________________________________ */

/** Guarda un NPC como plantilla nueva. Devuelve su id. */
export function anadirPlantilla(pj) {
    const json = jsonDePlantilla(pj);
    const plantilla = cargarPlantilla({ id: nuevoIdPlantilla(), json });
    plantilla.pagina = paginaPara(tamanoPlantilla(plantilla));
    leer().plantillas.push(plantilla);
    marcar(plantilla.pagina);
    escribir();
    return plantilla.id;
}

/** Sobrescribe una plantilla con este NPC (si ya no existe, la crea con ese id). Devuelve su id. */
export function guardarPlantilla(id, pj) {
    const anterior = porId(id);
    if (!anterior) {
        const nuevo = anadirPlantilla(pj);
        porId(nuevo).id = id;
        escribir();
        return id;
    }
    const nueva = cargarPlantilla({ id, json: jsonDePlantilla(pj) });
    const paginaAntes = anterior.pagina;
    Object.assign(anterior, { piso: nueva.piso, nombre: nueva.nombre, json: nueva.json });
    // Si ha crecido y ya no cabe en su página, pasa a la última (o a una nueva)
    if (tamanoPagina(paginaAntes) > tamanoMaxPagina) anterior.pagina = paginaPara(tamanoPlantilla(anterior), anterior);
    marcar(paginaAntes, anterior.pagina);
    escribir();
    return id;
}

/** Copia una plantilla (nombre con "(copia)"). Devuelve el id nuevo. */
export function duplicarPlantilla(id) {
    const original = porId(id);
    if (!original) return null;
    const pj = new PJ();
    pj.cargarJSON(JSON.parse(original.json));
    pj.nombre = `${pj.nombre} (copia)`.slice(0, 60);
    return anadirPlantilla(pj);
}

export function borrarPlantilla(id) {
    const d = leer();
    const i = d.plantillas.findIndex(p => p.id === id);
    if (i < 0) return false;
    const [borrada] = d.plantillas.splice(i, 1);
    marcar(borrada.pagina);
    escribir();
    return true;
}

/** JSON de un NPC nuevo sacado de la plantilla: id propio, idPlantilla, PV y PA llenos y sin estados */
export function copiaDePlantilla(id) {
    const plantilla = porId(id);
    if (!plantilla) return null;
    const pj = new PJ();
    pj.cargarJSON(JSON.parse(plantilla.json));
    pj.idPersonaje = nuevoIdPersonaje();
    pj.idPlantilla = plantilla.id;
    pj.calcularCaracteristicas();
    pj.vida = pj.vidaMax;
    pj.puntosArte = pj.puntosArteMax;
    return pj.toJSONString();
}

/** Vuelve a repartir todas las plantillas en páginas (al importar o al cambiar el tamaño de página) */
export function repaginar() {
    const d = leer();
    const totalAntes = d.total;
    d.total = 0;
    d.plantillas.forEach(p => { p.pagina = -1; });
    d.plantillas.forEach(p => { p.pagina = paginaPara(tamanoPlantilla(p)); });
    marcar(...Array.from({ length: Math.max(totalAntes, d.total) }, (_, i) => i));
    escribir();
}

/** Solo para el debug: páginas más pequeñas para comprobar que se reparten */
export function setTamanoMaxPagina(tamano) {
    tamanoMaxPagina = Math.max(1000, Math.trunc(Number(tamano)) || 850000);
    repaginar();
    return info();
}

/* Nube ______________________________________________________________________________ */

/** Lo que hay que subir: { actualizado, total, paginas: { n: texto }, borrar: [n] } (null si nada) */
export function cambiosParaSubir() {
    const d = leer();
    if (!d.pendiente) return null;
    const paginas = {};
    const borrar = [];
    d.cambiadas.forEach(n => {
        if (n < d.total) paginas[n] = JSON.stringify(dePagina(n).map(textoPlantilla));
        else borrar.push(n);
    });
    return { actualizado: d.actualizado, total: d.total, paginas, borrar };
}

/** La subida ha ido bien: ya no hay cambios pendientes */
export function marcarSubido(actualizado) {
    const d = leer();
    if (d.actualizado !== actualizado) return; // ha cambiado mientras se subía: queda pendiente
    d.pendiente = false;
    d.cambiadas = [];
    escribir();
}

/** Todas las páginas cambiadas (para subir el compendio entero, p. ej. si en la nube no hay nada) */
export function marcarTodoCambiado() {
    const d = leer();
    d.cambiadas = Array.from({ length: d.total }, (_, i) => i);
    d.pendiente = true;
    if (!d.actualizado) d.actualizado = Date.now();
    escribir();
}

/** Pone el compendio de la nube ({ actualizado, paginas: [texto] }) en lugar del local */
export function cargarDeNube({ actualizado, paginas }) {
    const plantillas = [];
    paginas.forEach((texto, n) => {
        let lista = [];
        try { lista = JSON.parse(texto); } catch { lista = []; }
        (Array.isArray(lista) ? lista : []).forEach(datos => {
            const p = cargarPlantilla({ ...datos, pagina: n });
            if (p) plantillas.push(p);
        });
    });
    estado = { actualizado: Number(actualizado) || 0, pendiente: false, cambiadas: [], total: paginas.length, plantillas, dueno: estado?.dueno ?? null };
    return escribir();
}

/* Exportar / importar ______________________________________________________________ */

/** Texto del fichero de exportación: todas las páginas a la vez */
export function exportar() {
    const d = leer();
    const paginas = Array.from({ length: d.total }, (_, n) => dePagina(n).map(textoPlantilla));
    return JSON.stringify({ tipo: TIPO_EXPORTAR, version: VERSION_EXPORTAR, paginas });
}

/**
 * Plantillas válidas de un fichero: un compendio exportado o la ficha de un NPC suelta.
 * @returns {{ id, json }[]}
 */
export function leerImportacion(datos) {
    if (datos?.tipo === TIPO_EXPORTAR && Array.isArray(datos.paginas)) {
        return datos.paginas.flat().map(cargarPlantilla).filter(Boolean).map(textoPlantilla);
    }
    if (datos && typeof datos === "object" && datos.esNpc) {
        const p = cargarPlantilla({ json: JSON.stringify(datos) });
        if (p) {
            const pj = new PJ();
            pj.cargarJSON(datos);
            return [{ id: nuevoIdPlantilla(), json: jsonDePlantilla(pj) }];
        }
    }
    return [];
}

/** Añade las plantillas importadas (con id nuevo si ya hay una con el suyo) y reparte las páginas */
export function importar(lista) {
    const d = leer();
    lista.forEach(({ id, json }) => {
        const p = cargarPlantilla({ id: existe(id) ? nuevoIdPlantilla() : id, json });
        if (p) d.plantillas.push(p);
    });
    repaginar();
    return lista.length;
}
