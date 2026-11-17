// scripts/cinturon.js
// Cinturón: un accesorio con inventario propio (06-equipo-y-objetos.md §4.1), sin DOM.
// - equipo.cinturon = { huecos, objetos: [objeto|null] } (se normaliza con cargarCinturon en cargarEquipo, objetos.js).
// - Pociones, cristales y arrojadizas (también los cristales elementales), una unidad por hueco: no se apilan.
// - Usar un objeto del cinturón es igual que desde el inventario: los usos de objetos.js aceptan la referencia
//   { origen: "cinturon", ranura: "accesorio-N", indice }.
// - Meter o sacar gasta la acción de una mano libre en zona no segura; en zona segura y en la base, nada.
// - No se puede quitar mientras tenga objetos (motivoNoGuardar en objetos.js).

import {
    TIPOS_CINTURON, accesorioVacio, equipoEnRanura, anadirAInventario, anadirABaul, cabenEnInventario, descartar, manoParaUsar,
    gastarEstricto, cargarObjeto, cristalConElemento
} from "./objetos.js";
import { parteDeMano } from "./turno.js";
import { esZonaSegura, baulAccesible } from "./zonas.js";

export const esCinturon = (equipo) => Boolean(equipo?.cinturon);

/** Cinturones puestos: [{ ranura: "accesorio-N", equipo }] */
export function cinturonesPuestos(pj) {
    return (pj.accesorios ?? [])
        .map((equipo, i) => ({ ranura: `accesorio-${i}`, equipo }))
        .filter(({ equipo }) => esCinturon(equipo) && !accesorioVacio(equipo));
}

/** Todos los huecos de los cinturones puestos: [{ ranura, indice, objeto|null }] */
export function huecosCinturon(pj) {
    return cinturonesPuestos(pj).flatMap(({ ranura, equipo }) =>
        equipo.cinturon.objetos.map((objeto, indice) => ({ ranura, indice, objeto })));
}

export const objetosEnCinturon = (pj) => huecosCinturon(pj).filter(hueco => hueco.objeto);

/** Primer hueco libre de los cinturones puestos ({ ranura, indice }) o null */
export function huecoLibreCinturon(pj) {
    const hueco = huecosCinturon(pj).find(h => !h.objeto);
    return hueco ? { ranura: hueco.ranura, indice: hueco.indice } : null;
}

const listaDe = (pj, ranura) => equipoEnRanura(pj, ranura)?.cinturon?.objetos ?? null;
export const objetoCinturon = (pj, ranura, indice) => listaDe(pj, ranura)?.[indice] ?? null;

/** Por qué no puede entrar este objeto en un cinturón (null = puede) */
export function motivoNoCinturon(pj, objeto) {
    if (!objeto) return "No hay objeto.";
    if (!TIPOS_CINTURON.includes(objeto.tipo)) return "En el cinturón solo caben pociones, cristales y armas arrojadizas.";
    if (!cinturonesPuestos(pj).length) return "No llevas ningún cinturón puesto.";
    if (!huecoLibreCinturon(pj)) return "El cinturón está lleno.";
    return null;
}

/* Meter o sacar gasta la acción de una mano libre fuera de zona segura */
function gastarMano(pj, gastar, descripcion) {
    if (esZonaSegura(pj)) return null;
    const mano = manoParaUsar(pj);
    if (!mano) return "Necesitas una mano libre.";
    return gastar([parteDeMano(mano)], descripcion) ? null : "Sin acción en la mano libre.";
}

const fallo = (texto) => ({ ok: false, resumen: [texto] });

/**
 * Mete una unidad de un objeto en el primer hueco libre (o en destino = { ranura, indice } si está libre).
 * origen: "inventario" | "baul" | "botin" (el baúl solo en la base). Gasta una mano fuera de zona segura.
 */
export function meterEnCinturon(pj, origen, indiceOrigen, gastar = gastarEstricto(pj), destino = null) {
    const lista = origen === "baul" ? pj.baul : origen === "botin" ? pj.botin : pj.inventario;
    const objeto = lista?.[indiceOrigen];
    const motivo = motivoNoCinturon(pj, objeto);
    if (motivo) return fallo(motivo);
    if (origen === "baul" && !baulAccesible(pj)) return fallo("Solo en la base se puede usar el baúl.");
    const hueco = destino && listaDe(pj, destino.ranura) && !objetoCinturon(pj, destino.ranura, destino.indice)
        ? destino : huecoLibreCinturon(pj);
    const sinMano = gastarMano(pj, gastar, `Meter ${objeto.nombre} en el cinturón`);
    if (sinMano) return fallo(sinMano);
    listaDe(pj, hueco.ranura)[hueco.indice] = cargarObjeto({ ...JSON.parse(JSON.stringify(objeto)), cantidad: 1 });
    // Una unidad menos en su sitio (en el inventario el hueco queda vacío; en el baúl y el botín se quita la fila)
    descartar(lista, indiceOrigen, origen === "inventario");
    return { ok: true, resumen: [`${objeto.nombre} → cinturón`] };
}

/** Adónde va al sacarlo: "inventario", o "baul" un cristal elemental lleno (en la base); null si no puede salir */
export function destinoSacar(pj, objeto) {
    if (cristalConElemento(objeto)) return baulAccesible(pj) ? "baul" : null;
    return cabenEnInventario(pj, objeto) > 0 ? "inventario" : null;
}

/** Saca un objeto del cinturón al inventario (un cristal elemental lleno, al baúl, solo en la base). Gasta una mano
 *  fuera de zona segura. */
export function sacarDeCinturon(pj, ranura, indice, gastar = gastarEstricto(pj)) {
    const objeto = objetoCinturon(pj, ranura, indice);
    if (!objeto) return fallo("Ese hueco está vacío.");
    const destino = destinoSacar(pj, objeto);
    if (!destino) return fallo(cristalConElemento(objeto) ? "Un cristal elemental con elemento solo puede ir al baúl de la base." : "No cabe en el inventario.");
    const sinMano = gastarMano(pj, gastar, `Sacar ${objeto.nombre} del cinturón`);
    if (sinMano) return fallo(sinMano);
    if (destino === "baul") anadirABaul(pj, { ...objeto, cantidad: 1 });
    else anadirAInventario(pj, { ...objeto, cantidad: 1 });
    listaDe(pj, ranura)[indice] = null;
    return { ok: true, resumen: [`${objeto.nombre} → ${destino === "baul" ? "baúl" : "inventario"}`] };
}

/** Descarta el objeto de un hueco del cinturón */
export function descartarDeCinturon(pj, ranura, indice) {
    const lista = listaDe(pj, ranura);
    if (!lista?.[indice]) return false;
    lista[indice] = null;
    return true;
}

/**
 * Mete en los huecos libres las unidades de un objeto que llega (trueque devuelto, botín). Sin gastar acciones.
 * @returns {number} unidades que no han cabido
 */
export function anadirACinturon(pj, objeto) {
    if (!objeto || !TIPOS_CINTURON.includes(objeto.tipo)) return objeto?.cantidad ?? 0;
    let resto = Math.max(1, Math.floor(Number(objeto.cantidad) || 1));
    while (resto > 0) {
        const hueco = huecoLibreCinturon(pj);
        if (!hueco) break;
        listaDe(pj, hueco.ranura)[hueco.indice] = cargarObjeto({ ...JSON.parse(JSON.stringify(objeto)), cantidad: 1 });
        resto--;
    }
    return resto;
}
