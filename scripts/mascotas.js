/* Mascotas: NPC que controla un jugador, guardados en un objeto clave, el cristal de mascota. Sin DOM.
 *
 * Un cristal de mascota es un objeto clave con
 *     mascota: { json, agrietado }     json = la ficha de la mascota (PJ.toJSONString de un NPC con esMascota)
 *     invocada: true                   la mascota está fuera (una sola a la vez)
 * Solo lo crea el máster (perfil del máster, tipo Mascota). El jugador la invoca y la guarda gastando una mano
 * libre fuera de zona segura, y con ella invocada puede cambiar a su ficha para actuar en combate. A 0 PV vuelve
 * al cristal agrietado y solo el máster la revive. Descansa y cambia de zona a la vez que su dueño.
 * La mascota sube de nivel con EXP como un personaje, pero cada nivel queda en nivelesPendientes hasta que el
 * máster ajusta sus valores y quita la marca. */
import PJ from "./PJ.js";
import { manoParaUsar, gastarEstricto } from "./objetos.js";
import { parteDeMano } from "./turno.js";
import { esZonaSegura, cambiarZona, descansoCorto, descansoLargo } from "./zonas.js";
import { ESTADOS_INFO, estaActivo } from "./estados.js";

/** Tamaño máximo de la ficha de una mascota guardada en un cristal (caracteres) */
export const MAX_JSON_MASCOTA = 200000;

/** Normaliza la mascota de un cristal ({ json, agrietado }), o null si no es válida. No carga el PJ: solo
 *  comprueba que la ficha es un objeto JSON de un NPC (así objetos.js no depende de PJ) */
export function cargarMascota(datos) {
    if (!datos || typeof datos !== "object") return null;
    const json = typeof datos.json === "string" ? datos.json : null;
    if (!json || json.length > MAX_JSON_MASCOTA) return null;
    try {
        const ficha = JSON.parse(json);
        if (!ficha || typeof ficha !== "object" || ficha.esNpc !== true) return null;
    } catch {
        return null;
    }
    return { json, agrietado: datos.agrietado === true };
}

export const esCristalMascota = (objetoClave) => Boolean(objetoClave?.mascota);

/** El PJ de la mascota de un cristal (siempre con esMascota), o null */
export function pjDeCristal(objetoClave) {
    if (!esCristalMascota(objetoClave)) return null;
    const pj = new PJ();
    try {
        pj.cargarJSON(JSON.parse(objetoClave.mascota.json));
    } catch {
        return null;
    }
    pj.esMascota = true;
    return pj;
}

/** Guarda el estado de la mascota en su cristal */
export function guardarPjEnCristal(objetoClave, pj) {
    if (!esCristalMascota(objetoClave) || !pj) return;
    objetoClave.mascota.json = pj.toJSONString();
}

/** idPersonaje de la mascota de un cristal (sin cargarla entera), o null */
export function idMascotaDeCristal(objetoClave) {
    if (!esCristalMascota(objetoClave)) return null;
    try {
        return String(JSON.parse(objetoClave.mascota.json).idPersonaje ?? "") || null;
    } catch {
        return null;
    }
}

/** Índice del cristal de la mascota con ese idPersonaje, o -1 */
export const indiceCristalDe = (pj, idMascota) => (pj?.objetosClave ?? [])
    .findIndex(o => esCristalMascota(o) && idMascotaDeCristal(o) === idMascota);

/** Índice del cristal con la mascota invocada, o -1 */
export const mascotaInvocada = (pj) => (pj?.objetosClave ?? []).findIndex(o => esCristalMascota(o) && o.invocada);

/** Índices de los cristales de mascota */
export const indicesCristales = (pj) => (pj?.objetosClave ?? [])
    .map((o, i) => (esCristalMascota(o) ? i : -1)).filter(i => i >= 0);

/** Lo que se pinta de una mascota: { id, nombre, nivel, pendientes, vida, vidaMax, pa, paMax, estados, iniciativa } */
export function resumenDePj(pj) {
    return {
        id: pj.idPersonaje, nombre: pj.nombre || "Sin nombre", nivel: pj.nivel, pendientes: Number(pj.nivelesPendientes) || 0,
        vida: pj.vida, vidaMax: pj.vidaMax, pa: pj.puntosArte, paMax: pj.puntosArteMax,
        estados: Object.keys(ESTADOS_INFO).filter(clave => estaActivo(pj, clave)), iniciativa: Number(pj.iniciativa) || 0
    };
}

/* Resúmenes ya calculados por ficha (cargar un PJ en cada repintado sería caro) */
const cacheResumen = new Map();
const MAX_CACHE_RESUMEN = 20;

/** Datos para pintar un cristal: resumenDePj + { agrietado, invocada }, o null */
export function resumenCristal(objetoClave) {
    if (!esCristalMascota(objetoClave)) return null;
    let base = cacheResumen.get(objetoClave.mascota.json);
    if (!base) {
        const pj = pjDeCristal(objetoClave);
        if (!pj) return null;
        base = resumenDePj(pj);
        if (cacheResumen.size >= MAX_CACHE_RESUMEN) cacheResumen.delete(cacheResumen.keys().next().value);
        cacheResumen.set(objetoClave.mascota.json, base);
    }
    return { ...base, estados: [...base.estados], agrietado: objetoClave.mascota.agrietado, invocada: Boolean(objetoClave.invocada) };
}

/* Mano libre del dueño para invocar o guardar: fuera de zona segura hace falta y se gasta */
function motivoMano(pj) {
    if (esZonaSegura(pj)) return null;
    return manoParaUsar(pj) ? null : "Necesitas una mano libre";
}

/** Motivo por el que no se puede invocar la mascota de ese cristal, o null */
export function motivoNoInvocar(pj, indice) {
    const cristal = pj?.objetosClave?.[indice];
    if (!esCristalMascota(cristal)) return "No es un cristal de mascota";
    if (cristal.mascota.agrietado) return "El cristal está agrietado: solo el máster puede revivirla";
    if (cristal.invocada) return "Ya está invocada";
    if (mascotaInvocada(pj) >= 0) return "Ya tienes otra mascota invocada";
    return motivoMano(pj);
}

/** Motivo por el que no se puede guardar la mascota de ese cristal, o null */
export function motivoNoGuardar(pj, indice) {
    const cristal = pj?.objetosClave?.[indice];
    if (!esCristalMascota(cristal) || !cristal.invocada) return "No está invocada";
    return motivoMano(pj);
}

/* Gasta la mano libre fuera de zona segura (gastar(partes, descripcion) → boolean) */
function gastarMano(pj, gastar, descripcion) {
    if (esZonaSegura(pj)) return true;
    const mano = manoParaUsar(pj);
    return Boolean(mano) && gastar([parteDeMano(mano)], descripcion);
}

/** Invoca la mascota de un cristal: se pone en la zona del dueño. { ok, resumen } */
export function invocar(pj, indice, gastar = gastarEstricto(pj)) {
    const motivo = motivoNoInvocar(pj, indice);
    if (motivo) return { ok: false, resumen: [`${motivo}.`] };
    const cristal = pj.objetosClave[indice];
    const mascota = pjDeCristal(cristal);
    if (!mascota) return { ok: false, resumen: ["La mascota del cristal no es válida."] };
    if (!gastarMano(pj, gastar, `Invocar a ${mascota.nombre}`)) return { ok: false, resumen: ["Sin acción en la mano libre."] };
    cambiarZona(mascota, pj.zona);
    guardarPjEnCristal(cristal, mascota);
    cristal.invocada = true;
    return { ok: true, resumen: [`${mascota.nombre} sale del cristal.`] };
}

/** Guarda la mascota invocada en su cristal. { ok, resumen } */
export function guardar(pj, indice, gastar = gastarEstricto(pj)) {
    const motivo = motivoNoGuardar(pj, indice);
    if (motivo) return { ok: false, resumen: [`${motivo}.`] };
    const cristal = pj.objetosClave[indice];
    const nombre = resumenCristal(cristal)?.nombre ?? "La mascota";
    if (!gastarMano(pj, gastar, `Guardar a ${nombre}`)) return { ok: false, resumen: ["Sin acción en la mano libre."] };
    cristal.invocada = false;
    return { ok: true, resumen: [`${nombre} vuelve al cristal.`] };
}

/** La mascota se ha quedado sin vida: vuelve a su cristal, agrietado */
export function agrietar(pj, indice) {
    const cristal = pj?.objetosClave?.[indice];
    if (!esCristalMascota(cristal)) return;
    cristal.invocada = false;
    cristal.mascota.agrietado = true;
}

/** Aplica una función a la mascota de cada cristal no agrietado (descansos y zona del dueño) y la guarda.
 *  salvo: PJ de la mascota que está en memoria (en la ficha), que se trata aparte */
export function conCadaMascota(pj, fn) {
    for (const indice of indicesCristales(pj)) {
        const cristal = pj.objetosClave[indice];
        if (cristal.mascota.agrietado) continue;
        const mascota = pjDeCristal(cristal);
        if (!mascota) continue;
        fn(mascota, cristal);
        guardarPjEnCristal(cristal, mascota);
    }
}

/** Descanso del dueño (corto o largo): también para sus mascotas (las agrietadas no) */
export const descansarMascotas = (pj, largo) => conCadaMascota(pj, m => (largo ? descansoLargo(m) : descansoCorto(m)));

/** Cambio de zona del dueño: sus mascotas van con él */
export const moverMascotas = (pj, zona) => conCadaMascota(pj, m => cambiarZona(m, zona));
