/* Personajes del máster (modo ?master), sin DOM. Es la caché del modo máster, en localStorage:
 *   "fichaSAO.master" (índice, pequeño):
 *     { activo, personajes: { <idPersonaje>: { idNube, resumen } }, sesiones: { <código de sala o "local">: [id] } }
 *   "fichaSAO.master.pj.<idPersonaje>" (uno por personaje): { json, guardada, nube }
 * - json: la ficha tal como está; guardada: la última copia guardada o cargada (aviso de cambios sin guardar);
 *   nube: la última copia subida a la nube (se suben solo los que han cambiado); idNube: su id en la nube.
 * - resumen: lo que pinta la cabecera, calculado al guardar (así no hay que cargar cada ficha).
 * - sesiones: qué personajes están en la cabecera. "local" sin sala propia; con ella, el código de la sala.
 * Cada personaje va en su propia clave para que escribir el activo (en cada cambio) no reescriba los demás.
 * Echar un personaje de la sesión no lo borra: sigue guardado y se puede volver a añadir. */
import PJ from "./PJ.js";
import { ESTADOS_INFO, estaActivo } from "./estados.js";

const CLAVE = "fichaSAO.master";
const clavePj = (id) => `${CLAVE}.pj.${id}`;
export const SESION_LOCAL = "local";

let indice = null;
let claveSesion = SESION_LOCAL;

function leer() {
    if (indice) return indice;
    try {
        indice = JSON.parse(localStorage.getItem(CLAVE)) ?? null;
    } catch {
        indice = null;
    }
    if (!indice || typeof indice !== "object") indice = {};
    if (!indice.personajes || typeof indice.personajes !== "object") indice.personajes = {};
    if (!indice.sesiones || typeof indice.sesiones !== "object") indice.sesiones = {};
    // Sin personajes que ya no existen
    for (const [clave, ids] of Object.entries(indice.sesiones)) {
        indice.sesiones[clave] = Array.isArray(ids) ? [...new Set(ids)].filter(id => indice.personajes[id]) : [];
    }
    if (!indice.personajes[indice.activo]) indice.activo = null;
    return indice;
}

/* Escribe una clave. Devuelve false si el navegador no tiene sitio (o no hay almacenamiento). */
function escribirClave(clave, valor) {
    try {
        localStorage.setItem(clave, JSON.stringify(valor));
        return true;
    } catch (error) {
        console.warn("No se pudieron guardar los personajes del máster en el navegador:", error);
        return false;
    }
}
const escribirIndice = () => escribirClave(CLAVE, leer());

function leerPj(id) {
    try {
        const datos = JSON.parse(localStorage.getItem(clavePj(id)));
        return datos && typeof datos === "object" ? datos : {};
    } catch {
        return {};
    }
}

const sesion = () => {
    const d = leer();
    if (!Array.isArray(d.sesiones[claveSesion])) d.sesiones[claveSesion] = [];
    return d.sesiones[claveSesion];
};

/** Lo que pinta la cabecera de un personaje (vida y PA en fracción, como el grupo) */
export function resumenDe(pj) {
    return {
        nombre: String(pj.nombre ?? "").trim(),
        vida: pj.vidaMax > 0 ? Math.max(0, Math.min(1, pj.vida / pj.vidaMax)) : 0,
        pa: pj.puntosArteMax > 0 ? Math.max(0, Math.min(1, pj.puntosArte / pj.puntosArteMax)) : 0,
        nivel: pj.nivel,
        iniciativa: Number(pj.iniciativa) || 0,
        estados: Object.keys(ESTADOS_INFO).filter(clave => estaActivo(pj, clave))
    };
}

/* Resumen de un JSON guardado (para personajes añadidos sin pasar por la ficha) */
function resumenDeJson(json) {
    const pj = new PJ();
    pj.cargarJSON(JSON.parse(json));
    return resumenDe(pj);
}

/** Sesión actual: "local" o el código de una sala propia. El personaje activo siempre está en ella. */
export function setClaveSesion(clave) {
    claveSesion = clave || SESION_LOCAL;
    const d = leer();
    if (d.activo && !sesion().includes(d.activo)) {
        sesion().push(d.activo);
        escribirIndice();
    }
}
export const getClaveSesion = () => claveSesion;

export const getActivo = () => leer().activo;
export const existe = (id) => Boolean(leer().personajes[id]);
export const idsEnSesion = () => [...sesion()];
export const enSesion = (id) => sesion().includes(id);

/** Un personaje completo: { id, json, guardada, nube, idNube, resumen }, o null */
export function datosPersonaje(id) {
    const entrada = leer().personajes[id];
    return entrada ? { id, ...entrada, ...leerPj(id) } : null;
}

/** Todos los personajes guardados (sin las fichas): [{ id, idNube, resumen }] */
export const todos = () => Object.entries(leer().personajes).map(([id, p]) => ({ id, ...p }));

/** Guardados que no están en la sesión actual (para volver a añadirlos), por nombre */
export const fueraDeSesion = () => todos()
    .filter(p => !enSesion(p.id))
    .sort((a, b) => (a.resumen?.nombre ?? "").localeCompare(b.resumen?.nombre ?? ""));

const normalizarNombre = (nombre) => String(nombre ?? "").trim().toLocaleLowerCase();

/** Otro personaje del máster con este nombre, o null (los nombres son únicos; sin distinguir mayúsculas) */
export function nombreUsado(nombre, salvoId = null) {
    const buscado = normalizarNombre(nombre);
    if (!buscado) return null;
    return todos().find(p => p.id !== salvoId && normalizarNombre(p.resumen?.nombre) === buscado) ?? null;
}

/**
 * Guarda (o crea) un personaje. campos: { json?, guardada?, nube?, idNube?, resumen? }; lo que no se pasa se
 * conserva. Sin resumen, se calcula del json si cambia. Devuelve false si no cabe en el navegador.
 */
export function guardar(id, campos) {
    const d = leer();
    const antes = d.personajes[id];
    let ok = true;
    if (["json", "guardada", "nube"].some(campo => campos[campo] !== undefined) || !antes) {
        const previo = antes ? leerPj(id) : {};
        const ficha = {
            json: campos.json ?? previo.json ?? null,
            guardada: campos.guardada !== undefined ? campos.guardada : (previo.guardada ?? null),
            nube: campos.nube !== undefined ? campos.nube : (previo.nube ?? null)
        };
        ok = escribirClave(clavePj(id), ficha);
        if (!campos.resumen && (campos.json !== undefined || !antes?.resumen) && ficha.json) {
            campos = { ...campos, resumen: resumenDeJson(ficha.json) };
        }
    }
    d.personajes[id] = {
        idNube: campos.idNube !== undefined ? campos.idNube : (antes?.idNube ?? null),
        resumen: campos.resumen ?? antes?.resumen ?? null
    };
    return escribirIndice() && ok;
}

export function setActivo(id) {
    const d = leer();
    if (!d.personajes[id]) return;
    d.activo = id;
    if (!sesion().includes(id)) sesion().push(id);
    escribirIndice();
}

export function anadirASesion(id) {
    if (!existe(id) || enSesion(id)) return;
    sesion().push(id);
    escribirIndice();
}

/** Motivo por el que no se puede sacar de la sesión, o null */
export function motivoNoQuitar(id) {
    if (!enSesion(id)) return "No está en la sesión";
    if (sesion().length <= 1) return "Es el único personaje de la sesión";
    return null;
}

/** Saca un personaje de la sesión (sigue guardado). No se puede sacar el último. */
export function quitarDeSesion(id) {
    if (motivoNoQuitar(id)) return false;
    sesion().splice(sesion().indexOf(id), 1);
    escribirIndice();
    return true;
}

/** Borra un personaje guardado (de todas las sesiones). No se puede borrar el activo. */
export function borrar(id) {
    const d = leer();
    if (!d.personajes[id] || d.activo === id) return false;
    delete d.personajes[id];
    for (const ids of Object.values(d.sesiones)) {
        const i = ids.indexOf(id);
        if (i >= 0) ids.splice(i, 1);
    }
    try { localStorage.removeItem(clavePj(id)); } catch { /* sin almacenamiento */ }
    escribirIndice();
    return true;
}

/** Personajes que han cambiado desde la última vez que se subieron a la nube: [{ id, json, nube, idNube, resumen }] */
export const pendientesDeNube = () => todos()
    .map(p => datosPersonaje(p.id))
    .filter(p => p.json && p.json !== p.nube);

/** Personaje guardado con ese id de la nube, o null */
export const porIdNube = (idNube) => (idNube && todos().find(p => p.idNube === idNube)) || null;
