/* Historial de creaciones del máster, sin DOM (ventanas en interfazCreacion.js).
 *
 * Cada receta es una creación enviada: tipo + materiales con sus cantidades → objetos creados. Si llega otra petición
 * con la misma receta (claveReceta: mismo tipo, mismos materiales por nombre, subtipo y potencia, y mismas cantidades),
 * la ventana del máster propone esos objetos. Se guarda la diferencia (tirada − dificultad) de la primera vez; enviar
 * otra cosa con la misma receta solo la cambia si el máster lo pide (sobrescribir).
 *
 * Entrada: { id, clave, tipo, materiales: [{ nombre, subtipo, potencia, cantidad }], objetos, diferencia, critico,
 *   fecha (ISO de la primera vez o de la última vez que se sobrescribió), actualizada (si se ha sobrescrito) }.
 * Páginas, caché ("fichaSAO.historialCreaciones"), cambios para subir y nube (historialesCreacion/{uid}, solo su
 * dueño): almacenPaginado.js, como los compendios. */
import { crearAlmacenPaginado } from "./almacenPaginado.js";
import { TIPOS_CREACION, cargarObjetosCreados } from "./creacion.js";

export const TIPO_EXPORTAR = "historialCreacionesSAO";
export const VERSION_EXPORTAR = 1;
const MAX_MATERIALES = 30;

const texto = (valor, maximo) => String(valor ?? "").slice(0, maximo);
const entero = (valor, maximo = 1e6) => Math.max(0, Math.min(maximo, Math.floor(Number(valor) || 0)));
const normalizarNombre = (nombre) => String(nombre ?? "").trim().toLocaleLowerCase();
const nuevoIdReceta = () => `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Materiales de una receta, agrupados (el mismo material puede venir en dos filas: inventario y baúl) y ordenados.
 * Acepta los de una creación ([{ objeto }]) o los ya resumidos ([{ nombre, subtipo, potencia, cantidad }]).
 */
export function resumirMateriales(lista) {
    const grupos = new Map();
    (Array.isArray(lista) ? lista : []).slice(0, MAX_MATERIALES).forEach(item => {
        const m = item?.objeto ?? item;
        if (!m || typeof m !== "object") return;
        const nombre = texto(m.nombre, 60).trim();
        const subtipo = texto(m.subtipo, 20);
        const potencia = entero(m.potencia, 1000);
        const cantidad = entero(m.cantidad, 1000);
        if (!nombre || !cantidad) return;
        const clave = `${normalizarNombre(nombre)}#${subtipo}#${potencia}`;
        const grupo = grupos.get(clave);
        if (grupo) grupo.cantidad += cantidad;
        else grupos.set(clave, { nombre, subtipo, potencia, cantidad });
    });
    return [...grupos.values()].sort((a, b) => normalizarNombre(a.nombre).localeCompare(normalizarNombre(b.nombre))
        || a.subtipo.localeCompare(b.subtipo) || a.potencia - b.potencia);
}

/** Clave de una receta: mismo tipo + mismos materiales + mismas cantidades = misma clave */
export function claveReceta(tipo, materiales) {
    return `${tipo}|${resumirMateriales(materiales).map(m => `${normalizarNombre(m.nombre)}#${m.subtipo}#${m.potencia}#${m.cantidad}`).join(";")}`;
}

/* Una entrada guardada, de la nube o importada; null si no vale */
function cargarEntrada(datos) {
    if (!datos || typeof datos !== "object" || !TIPOS_CREACION[datos.tipo]) return null;
    const materiales = resumirMateriales(datos.materiales);
    const objetos = cargarObjetosCreados(datos.objetos);
    if (!materiales.length || !objetos.length) return null;
    return {
        id: texto(datos.id || nuevoIdReceta(), 80),
        clave: claveReceta(datos.tipo, materiales),
        tipo: datos.tipo,
        materiales,
        objetos,
        diferencia: Math.max(-1000, Math.min(1000, Math.trunc(Number(datos.diferencia) || 0))),
        critico: Boolean(datos.critico),
        fecha: texto(datos.fecha, 40),
        actualizada: Boolean(datos.actualizada)
    };
}

const almacen = crearAlmacenPaginado({
    clave: "fichaSAO.historialCreaciones",
    cargarEntrada,
    camposTexto: ["tipo", "materiales", "objetos", "diferencia", "critico", "fecha", "actualizada"]
});

/* Lectura _________________________________________________________________________ */

/** Recetas por tipo (orden de TIPOS_CREACION) y de la más reciente a la más antigua */
export function listar() {
    const orden = Object.keys(TIPOS_CREACION);
    return [...almacen.entradas()].sort((a, b) => orden.indexOf(a.tipo) - orden.indexOf(b.tipo) || b.fecha.localeCompare(a.fecha));
}

/** La receta con esa clave, o null */
export const buscarReceta = (clave) => almacen.entradas().find(e => e.clave === clave) ?? null;
/** La receta de una creación (cargarCreacion), o null */
export const recetaDe = (creacion) => (creacion ? buscarReceta(claveReceta(creacion.tipo, creacion.materiales)) : null);
export const porId = (id) => almacen.porId(id);

/** ¿Son los mismos objetos? (normalizados, para saber si lo que se envía cambia la receta) */
export function mismosObjetos(a, b) {
    return JSON.stringify(cargarObjetosCreados(a)) === JSON.stringify(cargarObjetosCreados(b));
}

/** Copia de los objetos de una receta (para proponerlos o editarlos sin tocar el historial) */
export const copiaObjetos = (receta) => cargarObjetosCreados(JSON.parse(JSON.stringify(receta?.objetos ?? [])));

export const info = () => almacen.info();
export const setDueno = (uid) => almacen.setDueno(uid);

/* Cambios ________________________________________________________________________ */

/**
 * Apunta lo enviado de una creación. Receta nueva: se guarda con la diferencia de esta tirada. Receta que ya existe:
 * solo se cambia con sobrescribir (objetos, diferencia y fecha nuevos) y si los objetos son distintos.
 * @returns {"nueva"|"sobrescrita"|null} lo que ha hecho
 */
export function apuntarReceta({ creacion, objetos, sobrescribir = false }) {
    if (!creacion || !objetos?.length) return null;
    const datos = {
        tipo: creacion.tipo,
        materiales: creacion.materiales,
        objetos,
        diferencia: creacion.tirada.total - creacion.dificultad,
        critico: creacion.tirada.critico >= 2,
        fecha: new Date().toISOString()
    };
    const existente = recetaDe(creacion);
    if (!existente) return almacen.anadir({ id: nuevoIdReceta(), ...datos }) ? "nueva" : null;
    if (!sobrescribir || mismosObjetos(existente.objetos, objetos)) return null;
    return almacen.sustituir(existente.id, { ...datos, actualizada: true }) ? "sobrescrita" : null;
}

/** Cambia los objetos de una receta (desde el historial). Sin objetos no vale (para eso, borrarla). */
export function editarObjetos(id, objetos) {
    const receta = almacen.porId(id);
    if (!receta || !cargarObjetosCreados(objetos).length) return false;
    return Boolean(almacen.sustituir(id, { ...receta, objetos }));
}

export const borrarReceta = (id) => almacen.borrar(id);

/* Nube ______________________________________________________________________________ */

export const cambiosParaSubir = () => almacen.cambiosParaSubir();
export const marcarSubido = (actualizado) => almacen.marcarSubido(actualizado);
export const marcarTodoCambiado = () => almacen.marcarTodoCambiado();
export const cargarDeNube = (datos) => almacen.cargarDeNube(datos);

/* Exportar / importar ______________________________________________________________ */

/** Texto del fichero de exportación */
export function exportar() {
    return JSON.stringify({ tipo: TIPO_EXPORTAR, version: VERSION_EXPORTAR, paginas: almacen.paginasParaExportar() });
}

/** Recetas válidas de un fichero exportado */
export function leerImportacion(datos) {
    if (datos?.tipo !== TIPO_EXPORTAR || !Array.isArray(datos.paginas)) return [];
    return datos.paginas.flat().map(cargarEntrada).filter(Boolean);
}

/** Cuántas de las recetas importadas ya están (misma clave) */
export const repetidasAlImportar = (lista) => lista.filter(r => buscarReceta(r.clave)).length;

/**
 * Añade las recetas importadas. Las que ya están (misma clave) se sustituyen si sustituirRepetidas; si no, se saltan.
 * @returns {{ nuevas: number, sustituidas: number }}
 */
export function importar(lista, sustituirRepetidas = false) {
    const nuevas = [];
    let sustituidas = 0;
    const vistas = new Set();
    lista.forEach(receta => {
        if (vistas.has(receta.clave)) return; // repetida dentro del propio fichero
        vistas.add(receta.clave);
        const existente = buscarReceta(receta.clave);
        if (!existente) nuevas.push(almacen.texto(receta));
        else if (sustituirRepetidas && almacen.sustituir(existente.id, receta)) sustituidas++;
    });
    return { nuevas: nuevas.length ? almacen.importar(nuevas, nuevoIdReceta) : 0, sustituidas };
}
