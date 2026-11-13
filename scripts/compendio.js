/* Compendio de NPC del máster, sin DOM. Son plantillas: en la sesión se usan copias (copiaDePlantilla).
 * - Plantilla: { id, piso, nombre, pagina, json }. json = toJSONString de un NPC con PV y PA llenos y sin estados;
 *   piso y nombre se copian del NPC para listar sin cargarlo.
 * - Páginas, caché ("fichaSAO.compendio"), cambios para subir y nube: almacenPaginado.js.
 * La nube la gestiona la interfaz (interfazMaster.js) con leerCompendio / guardarPaginasCompendio de servicio.js. */
import PJ, { nuevoIdPersonaje, ESTADOS_LISTA } from "./PJ.js";
import { crearAlmacenPaginado } from "./almacenPaginado.js";

export const VERSION_EXPORTAR = 1;
export const TIPO_EXPORTAR = "compendioNpcSAO";

const nuevoIdPlantilla = () => `npc-${nuevoIdPersonaje()}`;

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
    return { id: String(datos.id || nuevoIdPlantilla()).slice(0, 80), piso: pj.npc.piso, nombre: pj.nombre, json: datos.json };
}

const almacen = crearAlmacenPaginado({
    clave: "fichaSAO.compendio",
    cargarEntrada: cargarPlantilla,
    camposTexto: ["json"],
    claveListaAntigua: "plantillas"
});

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

/* Lectura _________________________________________________________________________ */

/** Plantillas (sin el json), ordenadas por piso (sin piso al final) y nombre */
export function listar() {
    return almacen.entradas()
        .map(({ id, piso, nombre, pagina }) => ({ id, piso, nombre, pagina, resumen: resumenDe(id) }))
        .sort((a, b) => (a.piso ?? Infinity) - (b.piso ?? Infinity) || a.nombre.localeCompare(b.nombre));
}

export const existe = (id) => almacen.existe(id);
export const jsonDe = (id) => almacen.porId(id)?.json ?? null;

/* Datos para la fila del compendio (nivel, PV, EXP) */
function resumenDe(id) {
    try {
        const datos = JSON.parse(almacen.porId(id).json);
        return { nivel: datos.nivel, vidaMax: datos.npc?.vidaMax, exp: datos.npc?.expRecompensa ?? 0 };
    } catch {
        return {};
    }
}

/** Estado para la interfaz: páginas, si hay cambios sin subir */
export function info() {
    const { entradas, ...resto } = almacen.info();
    return { ...resto, plantillas: entradas };
}

/** Usuario con el que se ha sincronizado con la nube */
export const setDueno = (uid) => almacen.setDueno(uid);

/* Cambios ________________________________________________________________________ */

/** Guarda un NPC como plantilla nueva. Devuelve su id. */
export function anadirPlantilla(pj, id = nuevoIdPlantilla()) {
    return almacen.anadir({ id, json: jsonDePlantilla(pj) })?.id ?? null;
}

/** Sobrescribe una plantilla con este NPC (si ya no existe, la crea con ese id). Devuelve su id. */
export function guardarPlantilla(id, pj) {
    if (!almacen.existe(id)) return anadirPlantilla(pj, id);
    almacen.sustituir(id, { json: jsonDePlantilla(pj) });
    return id;
}

/** Copia una plantilla (nombre con "(copia)"). Devuelve el id nuevo. */
export function duplicarPlantilla(id) {
    const original = almacen.porId(id);
    if (!original) return null;
    const pj = new PJ();
    pj.cargarJSON(JSON.parse(original.json));
    pj.nombre = `${pj.nombre} (copia)`.slice(0, 60);
    return anadirPlantilla(pj);
}

export const borrarPlantilla = (id) => almacen.borrar(id);

/** JSON de un NPC nuevo sacado de la plantilla: id propio, idPlantilla, PV y PA llenos y sin estados */
export function copiaDePlantilla(id) {
    const plantilla = almacen.porId(id);
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
export const repaginar = () => almacen.repaginar();

/** Solo para el debug: páginas más pequeñas para comprobar que se reparten */
export function setTamanoMaxPagina(tamano) {
    almacen.setTamanoMaxPagina(tamano);
    return info();
}

/* Nube ______________________________________________________________________________ */

export const cambiosParaSubir = () => almacen.cambiosParaSubir();
export const marcarSubido = (actualizado) => almacen.marcarSubido(actualizado);
export const marcarTodoCambiado = () => almacen.marcarTodoCambiado();
export const cargarDeNube = (datos) => almacen.cargarDeNube(datos);

/* Exportar / importar ______________________________________________________________ */

/** Texto del fichero de exportación: todas las páginas a la vez */
export function exportar() {
    return JSON.stringify({ tipo: TIPO_EXPORTAR, version: VERSION_EXPORTAR, paginas: almacen.paginasParaExportar() });
}

/**
 * Plantillas válidas de un fichero: un compendio exportado o la ficha de un NPC suelta.
 * @returns {{ id, json }[]}
 */
export function leerImportacion(datos) {
    if (datos?.tipo === TIPO_EXPORTAR && Array.isArray(datos.paginas)) {
        return datos.paginas.flat().map(cargarPlantilla).filter(Boolean).map(almacen.texto);
    }
    if (datos && typeof datos === "object" && datos.esNpc && cargarPlantilla({ json: JSON.stringify(datos) })) {
        const pj = new PJ();
        pj.cargarJSON(datos);
        return [{ id: nuevoIdPlantilla(), json: jsonDePlantilla(pj) }];
    }
    return [];
}

/** Añade las plantillas importadas (con id nuevo si ya hay una con el suyo) y reparte las páginas */
export const importar = (lista) => almacen.importar(lista, nuevoIdPlantilla);
