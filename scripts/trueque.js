/* Trueque entre personajes de la sala, sin DOM (la ventana está en interfazTrueque.js).
 *
 * Oferta: { objetos: [{ objeto, origen }], objetosClave: [{ nombre, descripcion }], cor }
 * - origen: "inventario", "baul" o "cinturon/accesorio-N" (de dónde salió, para devolverlo allí si se cancela).
 * Lo ofrecido queda apartado: sale del inventario, del baúl y del Cor al enviar la oferta y vuelve si se rechaza
 * o se cancela (devolverOferta). Así no se puede gastar mientras se negocia.
 *
 * pj.trueque (se guarda con la ficha): el trueque en curso, o null
 *   { id, con: { instancia, nombre }, estado, version, mia, suya }
 * - estado: "elegir" (preparas tu oferta o tu contraoferta), "esperando" (has enviado la tuya y esperas al otro) o
 *   "decidir" (el otro ha respondido: aceptar, rechazar o contraoferta).
 * - mia: lo que tienes apartado (null mientras no hayas enviado nada); suya: la última oferta del otro.
 * - version: sube con cada oferta enviada; aceptar lleva la versión aceptada para que no valga una vieja.
 * Si la ficha se carga con un trueque que esta pestaña no está negociando (se cerró a medias), lo apartado se
 * devuelve (la interfaz lo comprueba en actualizarTodo). */
import {
    cargarObjeto, cargarObjetosClave, anadirAInventario, anadirABaul, anadirCor, gastarCor, manoParaUsar, equipoEnRanura
} from "./objetos.js";
import { cinturonesPuestos, anadirACinturon } from "./cinturon.js";
import { puedeGastar, parteDeMano, gastarAccion } from "./turno.js";
import { esZonaSegura, baulAccesible } from "./zonas.js";

/** Máximo de filas de objetos (y de objetos clave) en una oferta: el evento cabe de sobra en la sala */
export const MAX_OBJETOS_TRUEQUE = 30;
const MAX_COR = 1e7;

const entero = (valor, maximo = MAX_COR) => Math.max(0, Math.min(maximo, Math.floor(Number(valor) || 0)));

export const ofertaVacia = () => ({ objetos: [], objetosClave: [], cor: 0 });
/* Tamaño máximo de los objetos clave de una oferta (caracteres): un cristal de mascota lleva la ficha entera */
const MAX_CARACTERES_CLAVES = 15000;

/* Origen de un objeto del cinturón: "cinturon/accesorio-N" (sin ":", que separa las claves de la ventana) */
const PREFIJO_CINTURON = "cinturon/";
export const esOrigenCinturon = (origen) => String(origen ?? "").startsWith(PREFIJO_CINTURON);
const origenValido = (origen) => origen === "baul" || (esOrigenCinturon(origen) && /^accesorio-\d+$/.test(origen.slice(PREFIJO_CINTURON.length)))
    ? origen : "inventario";
/* Lista de la que sale un objeto según su origen (null si ese cinturón ya no está) */
function listaOrigen(pj, origen) {
    if (origen === "baul") return pj.baul;
    if (esOrigenCinturon(origen)) return equipoEnRanura(pj, origen.slice(PREFIJO_CINTURON.length))?.cinturon?.objetos ?? null;
    return pj.inventario;
}

/** ¿No ofrece nada? */
export const ofertaSinNada = (oferta) => !oferta || (!oferta.objetos.length && !oferta.objetosClave.length && !oferta.cor);

/** Normaliza una oferta (propia guardada o recibida de otro jugador). */
export function cargarOferta(datos) {
    const objetos = (Array.isArray(datos?.objetos) ? datos.objetos : []).slice(0, MAX_OBJETOS_TRUEQUE)
        .map(fila => {
            const objeto = cargarObjeto(fila?.objeto);
            return objeto ? { objeto, origen: origenValido(fila?.origen) } : null;
        })
        .filter(Boolean);
    const objetosClave = cargarObjetosClave(Array.isArray(datos?.objetosClave) ? datos.objetosClave.slice(0, MAX_OBJETOS_TRUEQUE) : []);
    return { objetos, objetosClave, cor: entero(datos?.cor) };
}

/** Normaliza pj.trueque guardado (null si no hay o no es válido). */
export function cargarTrueque(datos) {
    if (!datos || typeof datos !== "object" || !datos.id) return null;
    return {
        id: String(datos.id).slice(0, 80),
        con: { instancia: String(datos.con?.instancia ?? "").slice(0, 120), nombre: String(datos.con?.nombre ?? "").slice(0, 60) },
        estado: String(datos.estado ?? "esperando"),
        version: entero(datos.version, 1e6),
        mia: datos.mia ? cargarOferta(datos.mia) : null,
        suya: datos.suya ? cargarOferta(datos.suya) : null
    };
}

/** Texto corto de una oferta: "Poción ×2, Llave, 50 Cor" */
export function describirOferta(oferta) {
    if (ofertaSinNada(oferta)) return "Nada";
    return [
        ...oferta.objetos.map(({ objeto }) => `${objeto.nombre} ×${objeto.cantidad}`),
        ...oferta.objetosClave.map(objeto => objeto.nombre),
        oferta.cor > 0 ? `${oferta.cor} Cor` : ""
    ].filter(Boolean).join(", ");
}

/** Motivo por el que este personaje no puede hacer un trueque ahora, o null.
 *  En zona no segura hace falta una mano libre con su acción (se gasta al cerrarse el trueque). */
export function motivoNoTrueque(pj) {
    if (pj.esNpc && !pj.permitirTrueque) return "Este NPC no tiene activado el trueque.";
    if (esZonaSegura(pj)) return null;
    const mano = manoParaUsar(pj);
    if (!mano || !puedeGastar(pj, parteDeMano(mano))) return "Necesitas una mano libre con su acción para hacer un trueque.";
    return null;
}

/** Lo que se puede ofrecer: inventario, el baúl (solo en la base) y los objetos clave. */
export function disponiblesTrueque(pj) {
    const objetos = [];
    (pj.inventario ?? []).forEach((objeto, indice) => { if (objeto) objetos.push({ origen: "inventario", indice, objeto }); });
    if (!pj.esNpc && baulAccesible(pj)) (pj.baul ?? []).forEach((objeto, indice) => objetos.push({ origen: "baul", indice, objeto }));
    cinturonesPuestos(pj).forEach(({ ranura, equipo }) => equipo.cinturon.objetos.forEach((objeto, indice) => {
        if (objeto) objetos.push({ origen: `${PREFIJO_CINTURON}${ranura}`, indice, objeto });
    }));
    // Un cristal de mascota con la mascota invocada no se puede dar (hay que guardarla antes)
    const objetosClave = (pj.objetosClave ?? []).map((objeto, indice) => ({ indice, objeto })).filter(({ objeto }) => !objeto.invocada);
    return { objetos, objetosClave, cor: Number(pj.cor) || 0 };
}

/**
 * Aparta lo elegido: lo saca del inventario, del baúl y del Cor y devuelve la oferta.
 * seleccion: { objetos: [{ origen, indice, cantidad }], objetosClave: [indice], cor }
 * permitirVacia: una respuesta o contraoferta puede no ofrecer nada (la propuesta no).
 * No aparta nada si algo no es válido. @returns {{ ok: boolean, resumen: string[], oferta?: object }}
 */
export function apartarOferta(pj, seleccion, { permitirVacia = false } = {}) {
    const fallo = (texto) => ({ ok: false, resumen: [texto] });
    const lista = (origen) => listaOrigen(pj, origen);
    const filas = (seleccion?.objetos ?? []).filter(fila => entero(fila.cantidad) > 0);
    const claves = [...new Set((seleccion?.objetosClave ?? []).map(Number))];
    const cor = entero(seleccion?.cor);
    if (!filas.length && !claves.length && !cor && !permitirVacia) return fallo("Elige algo que ofrecer.");
    if (filas.length > MAX_OBJETOS_TRUEQUE || claves.length > MAX_OBJETOS_TRUEQUE) return fallo(`Como mucho ${MAX_OBJETOS_TRUEQUE} objetos por trueque.`);
    if (filas.some(fila => fila.origen === "baul") && !baulAccesible(pj)) return fallo("Solo en la base puedes ofrecer objetos del baúl.");
    for (const fila of filas) {
        const objeto = lista(fila.origen)?.[fila.indice];
        if (!objeto) return fallo("Uno de los objetos ya no está.");
        if (entero(fila.cantidad) > objeto.cantidad) return fallo(`No tienes tantos ${objeto.nombre}.`);
    }
    if (claves.some(i => !pj.objetosClave[i])) return fallo("Uno de los objetos clave ya no está.");
    if (claves.some(i => pj.objetosClave[i].invocada)) return fallo("Guarda antes a tu mascota en su cristal.");
    // Los eventos de la sala tienen un límite de tamaño: un cristal de mascota muy grande no cabe
    if (claves.reduce((suma, i) => suma + JSON.stringify(pj.objetosClave[i]).length, 0) > MAX_CARACTERES_CLAVES) {
        return fallo("Los objetos clave que ofreces ocupan demasiado para enviarlos (un cristal de mascota muy grande).");
    }
    if (cor > (Number(pj.cor) || 0)) return fallo(`No tienes suficiente Cor (tienes ${Number(pj.cor) || 0}).`);

    const oferta = ofertaVacia();
    for (const fila of filas) {
        const objeto = lista(fila.origen)[fila.indice];
        const cantidad = entero(fila.cantidad);
        oferta.objetos.push({ objeto: cargarObjeto({ ...JSON.parse(JSON.stringify(objeto)), cantidad }), origen: fila.origen });
        objeto.cantidad -= cantidad;
    }
    // Las pilas que se quedan a 0: hueco vacío en el inventario, fila fuera en el baúl
    pj.inventario = pj.inventario.map(objeto => (objeto && objeto.cantidad <= 0 ? null : objeto));
    cinturonesPuestos(pj).forEach(({ equipo }) => {
        equipo.cinturon.objetos = equipo.cinturon.objetos.map(objeto => (objeto && objeto.cantidad <= 0 ? null : objeto));
    });
    pj.baul = pj.baul.filter(objeto => objeto.cantidad > 0);
    claves.sort((a, b) => b - a).forEach(i => oferta.objetosClave.unshift(...pj.objetosClave.splice(i, 1)));
    if (cor > 0) gastarCor(pj, cor);
    oferta.cor = cor;
    return { ok: true, resumen: [describirOferta(oferta)], oferta };
}

/**
 * Devuelve lo apartado a su sitio: al inventario (o al baúl si salió de allí y estás en la base); lo que no cabe,
 * al botín. @returns {string[]} resumen
 */
export function devolverOferta(pj, oferta) {
    if (ofertaSinNada(oferta)) return [];
    const alBotin = [];
    for (const { objeto, origen } of oferta.objetos) {
        if (origen === "baul" && !pj.esNpc && baulAccesible(pj)) {
            anadirABaul(pj, objeto);
            continue;
        }
        // Del cinturón vuelve al cinturón; lo que no quepa, al inventario y después al botín
        const restoCinturon = esOrigenCinturon(origen) ? anadirACinturon(pj, objeto) : objeto.cantidad;
        if (restoCinturon <= 0) continue;
        const resto = anadirAInventario(pj, { ...objeto, cantidad: restoCinturon });
        if (resto > 0) {
            pj.botin.push({ ...objeto, cantidad: resto });
            alBotin.push(`${objeto.nombre} ×${resto}`);
        }
    }
    pj.objetosClave.push(...oferta.objetosClave.map(({ invocada: _invocada, ...objeto }) => ({ ...objeto })));
    if (oferta.cor > 0) anadirCor(pj, oferta.cor);
    const resumen = [`Vuelve: ${describirOferta(oferta)}`];
    if (alBotin.length) resumen.push(`No cabe en el inventario (al botín): ${alBotin.join(", ")}`);
    return resumen;
}

/* Mismo objeto sin contar la cantidad (el equipo también, para volver a elegirlo) */
const igualSinCantidad = (a, b) => Boolean(a && b) && JSON.stringify({ ...a, cantidad: 0 }) === JSON.stringify({ ...b, cantidad: 0 });

/**
 * Para una contraoferta: tras devolver lo apartado, qué filas de disponiblesTrueque vuelven a quedar elegidas
 * (clave "inventario:3" | "baul:0" | "clave:1" → cantidad), buscando cada objeto ofrecido por su forma.
 */
export function seleccionDeOferta(pj, oferta) {
    const elegidas = new Map();
    if (!oferta) return elegidas;
    const { objetos, objetosClave } = disponiblesTrueque(pj);
    for (const { objeto } of oferta.objetos) {
        let falta = objeto.cantidad;
        for (const fila of objetos) {
            if (falta <= 0) break;
            const clave = `${fila.origen}:${fila.indice}`;
            const libre = fila.objeto.cantidad - (elegidas.get(clave) ?? 0);
            if (libre <= 0 || !igualSinCantidad(fila.objeto, objeto)) continue;
            const n = Math.min(libre, falta);
            elegidas.set(clave, (elegidas.get(clave) ?? 0) + n);
            falta -= n;
        }
    }
    for (const objeto of oferta.objetosClave) {
        const fila = objetosClave.find(f => !elegidas.has(`clave:${f.indice}`)
            && f.objeto.nombre === objeto.nombre && f.objeto.descripcion === objeto.descripcion);
        if (fila) elegidas.set(`clave:${fila.indice}`, 1);
    }
    return elegidas;
}

/** Al cerrarse el trueque, en zona no segura se gasta la acción de una mano libre (con un arma a dos manos, la de
 *  un brazo). Devuelve si se ha podido gastar (en zona segura no hace falta). */
export function gastarManoTrueque(pj) {
    if (esZonaSegura(pj)) return true;
    const mano = manoParaUsar(pj);
    return Boolean(mano) && gastarAccion(pj, parteDeMano(mano));
}

/** Lo que se recibe al cerrar el trueque: los objetos al botín (para cogerlos, guardarlos en el baúl, darlos o
 *  tirarlos) y el Cor y los objetos clave directamente. @returns {string[]} resumen */
export function recibirOferta(pj, oferta) {
    if (ofertaSinNada(oferta)) return ["No recibes nada."];
    pj.botin.push(...oferta.objetos.map(({ objeto }) => cargarObjeto(JSON.parse(JSON.stringify(objeto)))).filter(Boolean));
    pj.objetosClave.push(...oferta.objetosClave.map(({ invocada: _invocada, ...objeto }) => ({ ...objeto })));
    if (oferta.cor > 0) anadirCor(pj, oferta.cor);
    const resumen = [`Recibes: ${describirOferta(oferta)}`];
    if (oferta.objetos.length) resumen.push("Los objetos están en el botín (menú del inventario).");
    return resumen;
}

/** Id nuevo para un trueque */
export function nuevoIdTrueque() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `tq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
