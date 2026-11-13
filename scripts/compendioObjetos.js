/* Compendio de objetos comunes del máster, sin DOM (como el de NPC en compendio.js).
 * - Entrada: { id, piso, nombre, categoria, pagina, json }. json = el objeto normalizado (cargarObjeto) con
 *   cantidad 1 y limpio (sin poción aplicada, escudo sin usar, reliquias sin enfriamiento); piso 1-100 o null.
 *   nombre y categoria salen del objeto para listar sin cargarlo.
 * - Páginas, caché ("fichaSAO.compendioObjetos"), cambios para subir y nube: almacenPaginado.js.
 * - Categorías (CATEGORIAS_OBJETO): tipo de equipo (arma, escudo, armadura, accesorio, reliquia), el resto de
 *   tipos de objeto y los materiales por su uso. */
import { nuevoIdPersonaje } from "./PJ.js";
import { ARMAS, TIPOS_ARMADURA, TIPO_ACCESORIO, TIPO_RELIQUIA } from "./equipamiento.js";
import { cargarObjeto, TIPOS_MATERIAL } from "./objetos.js";
import { crearAlmacenPaginado } from "./almacenPaginado.js";

export const VERSION_EXPORTAR = 1;
export const TIPO_EXPORTAR = "compendioObjetosSAO";
export const PISO_MAXIMO = 100;

/* Categorías en el orden en que se listan: clave → etiqueta */
export const CATEGORIAS_OBJETO = {
    arma: "Armas",
    escudo: "Escudos",
    armadura: "Armaduras",
    accesorio: "Accesorios",
    reliquia: "Reliquias",
    otroEquipo: "Otro equipamiento",
    arrojadiza: "Armas arrojadizas",
    pocion: "Pociones",
    comida: "Comida",
    cristal: "Cristales",
    ...Object.fromEntries(Object.entries(TIPOS_MATERIAL).filter(([clave]) => clave)
        .map(([clave, info]) => [`material-${clave}`, `Materiales: ${info.etiqueta.toLowerCase()}`])),
    material: "Materiales sin tipo"
};
const ORDEN_CATEGORIAS = Object.keys(CATEGORIAS_OBJETO);

const nuevoIdEntrada = () => `obj-${nuevoIdPersonaje()}`;

/** Categoría de un objeto (clave de CATEGORIAS_OBJETO) */
export function categoriaObjeto(objeto) {
    if (objeto?.tipo === "equipo") {
        const tipo = objeto.equipo?.tipo;
        if (ARMAS[tipo]) return ARMAS[tipo].escudo ? "escudo" : "arma";
        if (TIPOS_ARMADURA.includes(tipo)) return "armadura";
        if (tipo === TIPO_ACCESORIO) return "accesorio";
        if (tipo === TIPO_RELIQUIA) return "reliquia";
        return "otroEquipo";
    }
    if (objeto?.tipo === "material") return objeto.subtipo ? `material-${objeto.subtipo}` : "material";
    return CATEGORIAS_OBJETO[objeto?.tipo] ? objeto.tipo : "material";
}

/** Piso válido (1-100) o null */
export function normalizarPiso(piso) {
    if (piso === null || piso === undefined || piso === "") return null;
    const n = Math.trunc(Number(piso));
    return Number.isFinite(n) && n >= 1 ? Math.min(PISO_MAXIMO, n) : null;
}

/* Objeto listo para el compendio: una unidad, sin poción aplicada, escudo sin usar y reliquia sin enfriamiento */
function limpiarObjeto(datos) {
    const objeto = cargarObjeto(JSON.parse(JSON.stringify(datos)));
    if (!objeto) return null;
    objeto.cantidad = 1;
    if (objeto.equipo) {
        objeto.equipo.pocionAplicada = null;
        objeto.equipo.enUso = false;
        objeto.equipo.reliquia?.habilidades?.forEach(h => { h.restante = 0; });
    }
    return objeto;
}

/* Una entrada guardada, de la nube o importada; null si no tiene un objeto válido */
function cargarEntrada(datos) {
    if (!datos || typeof datos !== "object" || typeof datos.json !== "string") return null;
    let objeto;
    try {
        objeto = limpiarObjeto(JSON.parse(datos.json));
    } catch {
        return null;
    }
    if (!objeto || !objeto.nombre.trim()) return null;
    return {
        id: String(datos.id || nuevoIdEntrada()).slice(0, 80),
        piso: normalizarPiso(datos.piso),
        nombre: objeto.nombre,
        categoria: categoriaObjeto(objeto),
        json: JSON.stringify(objeto)
    };
}

const almacen = crearAlmacenPaginado({ clave: "fichaSAO.compendioObjetos", cargarEntrada, camposTexto: ["piso", "json"] });

/* Copia del compendio del máster de la sala (la que ven los jugadores) ____________
 * "fichaSAO.objetosComunesSala" = { dueno, actualizado, entradas }. Solo lectura: se sustituye entera al leer la
 * nube, y solo si el índice dice que ha cambiado (actualizado). */
const CLAVE_SALA = "fichaSAO.objetosComunesSala";
let copiaSala = null;

function leerCopiaSala() {
    if (copiaSala) return copiaSala;
    try { copiaSala = JSON.parse(localStorage.getItem(CLAVE_SALA)); } catch { copiaSala = null; }
    if (!copiaSala || typeof copiaSala !== "object" || !Array.isArray(copiaSala.entradas)) copiaSala = { dueno: null, actualizado: null, entradas: [] };
    copiaSala.entradas = copiaSala.entradas.map(cargarEntrada).filter(Boolean);
    return copiaSala;
}

/** De quién es la copia de la sala y de cuándo: { dueno, actualizado } */
export function infoSala() {
    const { dueno, actualizado, entradas } = leerCopiaSala();
    return { dueno, actualizado, entradas: entradas.length };
}

/** Sustituye la copia de la sala por la de la nube ({ actualizado, paginas: [texto] }, o null si no tiene) */
export function guardarCopiaSala(dueno, nube) {
    const entradas = [];
    (nube?.paginas ?? []).forEach(texto => {
        let lista = [];
        try { lista = JSON.parse(texto); } catch { lista = []; }
        (Array.isArray(lista) ? lista : []).forEach(datos => {
            const e = cargarEntrada(datos);
            if (e) entradas.push(e);
        });
    });
    copiaSala = { dueno, actualizado: nube ? Number(nube.actualizado) || 0 : 0, entradas };
    try { localStorage.setItem(CLAVE_SALA, JSON.stringify(copiaSala)); } catch (error) { console.warn("No cabe la copia de los objetos comunes:", error); }
}

/* Lectura _________________________________________________________________________ */

const entradasDe = (fuente) => (fuente === "sala" ? leerCopiaSala().entradas : almacen.entradas());

/**
 * Entradas (con el objeto ya cargado), por categoría, piso (sin piso al final) y nombre.
 * fuente: "propio" (el compendio de este navegador, el del máster) o "sala" (la copia del de la sala).
 */
export function listar(fuente = "propio") {
    return entradasDe(fuente)
        .map(({ id, piso, nombre, categoria, json }) => ({ id, piso, nombre, categoria, objeto: JSON.parse(json) }))
        .sort((a, b) => ORDEN_CATEGORIAS.indexOf(a.categoria) - ORDEN_CATEGORIAS.indexOf(b.categoria)
            || (a.piso ?? Infinity) - (b.piso ?? Infinity) || a.nombre.localeCompare(b.nombre));
}

export const existe = (id) => almacen.existe(id);

/** Copia del objeto de una entrada (lista para dar o editar), o null */
export function objetoDe(id, fuente = "propio") {
    const entrada = entradasDe(fuente).find(e => e.id === id);
    return entrada ? cargarObjeto(JSON.parse(entrada.json)) : null;
}

/** Id de una entrada con ese nombre (sin distinguir mayúsculas), o null */
export function idPorNombre(nombre) {
    const buscado = String(nombre ?? "").trim().toLocaleLowerCase();
    return almacen.entradas().find(e => e.nombre.trim().toLocaleLowerCase() === buscado)?.id ?? null;
}

export const info = () => almacen.info();
export const setDueno = (uid) => almacen.setDueno(uid);

/* Cambios ________________________________________________________________________ */

/** Añade un objeto. Devuelve el id, o null si el objeto no vale. */
export function anadirObjeto(objeto, piso = null) {
    const limpio = limpiarObjeto(objeto);
    return limpio ? almacen.anadir({ id: nuevoIdEntrada(), piso: normalizarPiso(piso), json: JSON.stringify(limpio) })?.id ?? null : null;
}

/** Cambia el objeto de una entrada (y su piso si se pasa). Devuelve true si se ha guardado. */
export function guardarObjeto(id, objeto, piso = almacen.porId(id)?.piso ?? null) {
    const limpio = limpiarObjeto(objeto);
    return Boolean(limpio && almacen.sustituir(id, { piso: normalizarPiso(piso), json: JSON.stringify(limpio) }));
}

/** Cambia solo el piso de una entrada */
export function cambiarPiso(id, piso) {
    const entrada = almacen.porId(id);
    return Boolean(entrada && almacen.sustituir(id, { piso: normalizarPiso(piso), json: entrada.json }));
}

/** Copia una entrada (nombre con "(copia)"). Devuelve el id nuevo. */
export function duplicarObjeto(id) {
    const entrada = almacen.porId(id);
    if (!entrada) return null;
    const objeto = JSON.parse(entrada.json);
    objeto.nombre = `${objeto.nombre} (copia)`.slice(0, 60);
    if (objeto.equipo) objeto.equipo.nombre = objeto.nombre;
    return anadirObjeto(objeto, entrada.piso);
}

export const borrarObjeto = (id) => almacen.borrar(id);

/* Nube ______________________________________________________________________________ */

export const cambiosParaSubir = () => almacen.cambiosParaSubir();
export const marcarSubido = (actualizado) => almacen.marcarSubido(actualizado);
export const marcarTodoCambiado = () => almacen.marcarTodoCambiado();
export const cargarDeNube = (datos) => almacen.cargarDeNube(datos);
export const setTamanoMaxPagina = (tamano) => almacen.setTamanoMaxPagina(tamano);

/* Exportar / importar ______________________________________________________________ */

/** Texto del fichero de exportación: todas las páginas a la vez */
export function exportar() {
    return JSON.stringify({ tipo: TIPO_EXPORTAR, version: VERSION_EXPORTAR, paginas: almacen.paginasParaExportar() });
}

/** Entradas válidas de un fichero exportado ({ id, piso, json }[]) */
export function leerImportacion(datos) {
    if (datos?.tipo !== TIPO_EXPORTAR || !Array.isArray(datos.paginas)) return [];
    return datos.paginas.flat().map(cargarEntrada).filter(Boolean).map(almacen.texto);
}

/** Añade las entradas importadas (con id nuevo si ya hay una con el suyo) y reparte las páginas */
export const importar = (lista) => almacen.importar(lista, nuevoIdEntrada);
