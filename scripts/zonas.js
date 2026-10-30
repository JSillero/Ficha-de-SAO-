// scripts/zonas.js
// Zona en la que está el personaje (no segura, segura o base) y lo que permite cada una,
// más los descansos corto (zona segura) y largo (base).
// No toca el DOM: recibe el personaje, lo modifica y devuelve lo que ha pasado.
//
// turno.js importa esZonaSegura y este módulo importa turno.js: el ciclo es seguro porque
// ninguno de los dos usa lo importado al cargarse, solo dentro de funciones.

import { TURNOS_PERMANENTE } from "./modificador.js";
import { PARTES_ACCION, ACCIONES_MAX } from "./turno.js";
import { quitarComida } from "./objetos.js";
import { ESTADOS_INFO, quitarEstado } from "./estados.js";
import { reiniciarEnfriamientos } from "./reliquias.js";

/* Zonas: etiqueta e icono (iconos.js y imgs/<icono>.svg) */
export const ZONAS = {
    noSegura: { etiqueta: "Zona no segura", icono: "mapa" },
    segura: { etiqueta: "Zona segura", icono: "pueblo" },
    base: { etiqueta: "Base", icono: "casa" }
};

export const ZONA_POR_DEFECTO = "noSegura";

/* Estados que no se curan con el descanso largo (no son negativos) */
const ESTADOS_POSITIVOS = ["regeneracion"];

/** Zona segura o base: no se gastan acciones ni se recibe daño */
export function esZonaSegura(pj) {
    return pj.zona === "segura" || pj.zona === "base";
}

/** Solo en la base se pueden mover objetos entre el baúl y el inventario o crearlos en el baúl */
export function baulAccesible(pj) {
    return pj.zona === "base";
}

/** Los puntos de habilidad solo se reparten en zona segura o en la base */
export function puedeRepartirHabilidades(pj) {
    return esZonaSegura(pj);
}

/** Solo se recibe daño fuera de las zonas seguras */
export function puedeRecibirDanno(pj) {
    return !esZonaSegura(pj);
}

/* Motivos que ve el usuario cuando algo no se puede hacer por la zona */
export const MOTIVOS_ZONA = {
    baul: "Solo en la base se pueden mover objetos entre el baúl y el inventario",
    crearEnBaul: "Solo en la base se pueden crear objetos en el baúl",
    habilidades: "Los puntos de habilidad solo se reparten en zona segura o en la base",
    danno: "En zona segura y en la base no se recibe daño",
    artes: "Solo se pueden cambiar las artes equipadas en zona segura o en la base"
};

/**
 * Cambia de zona. Al entrar en zona segura o base se restablecen las acciones.
 * @returns {boolean} true si ha cambiado
 */
export function cambiarZona(pj, zona) {
    if (!ZONAS[zona] || pj.zona === zona) return false;
    pj.zona = zona;
    if (esZonaSegura(pj)) restablecerAcciones(pj);
    return true;
}

function restablecerAcciones(pj) {
    PARTES_ACCION.forEach(parte => { pj[parte] = true; });
    pj.numeroAcciones = ACCIONES_MAX;
    pj.reaccionGuardada = false;
}

/* Listas de modificadores del personaje y de todo su equipo */
function listasModificadores(pj) {
    return [
        pj.modificadores, pj.manoIzquierda?.modificadores, pj.manoDerecha?.modificadores,
        pj.equipoArmadura?.modificadores, ...(pj.accesorios || []).map(acc => acc?.modificadores)
    ].filter(Array.isArray);
}

const etiquetaEstado = (clave) => ESTADOS_INFO[clave]?.etiqueta ?? clave;
const estadoActivo = (estado) => (Number(estado?.valor) || 0) > 0;

/**
 * Descanso corto (zona segura). Termina:
 * - el efecto de la comida;
 * - los estados con duración en turnos (no permanentes) y los marcados "Descanso corto";
 * - los modificadores con duración en turnos y los marcados "Descanso corto" (personaje y equipo);
 * - el enfriamiento de las habilidades de reliquia (quedan listas).
 * No recarga los PA.
 * @returns {string[]} resumen legible
 */
export function descansoCorto(pj) {
    const resumen = [];
    const comida = quitarComida(pj);
    if (comida) resumen.push(`Termina el efecto de ${comida}`);

    for (const [clave, estado] of Object.entries(pj.estados)) {
        const porTurnos = estado.turnos !== TURNOS_PERMANENTE;
        if (!estadoActivo(estado) || !(porTurnos || estado.descansoCorto)) continue;
        quitarEstado(pj, clave);
        resumen.push(`Termina: ${etiquetaEstado(clave)}`);
    }

    for (const lista of listasModificadores(pj)) {
        for (let i = lista.length - 1; i >= 0; i--) {
            const mod = lista[i];
            if (!(mod.turnos > 0) && !mod.descansoCorto) continue;
            lista.splice(i, 1);
            resumen.push(`Termina el modificador: ${mod.nombre || mod.modificado}`);
        }
    }

    resumen.push(...reiniciarEnfriamientos(pj));
    pj.calcularCaracteristicas();
    if (!resumen.length) resumen.push("Sin cambios");
    return resumen;
}

/**
 * Descanso largo (base): todo lo del descanso corto y además cura todos los estados negativos
 * (también la oscuridad y los permanentes), recarga los PA y llena los PV.
 * @returns {string[]} resumen legible
 */
export function descansoLargo(pj) {
    const resumen = descansoCorto(pj).filter(linea => linea !== "Sin cambios");

    for (const [clave, estado] of Object.entries(pj.estados)) {
        if (!estadoActivo(estado) || ESTADOS_POSITIVOS.includes(clave)) continue;
        quitarEstado(pj, clave);
        resumen.push(`Cura: ${etiquetaEstado(clave)}`);
    }
    pj.calcularCaracteristicas(); // sin oscuridad, vidaMax vuelve a su valor

    if (pj.puntosArte < pj.puntosArteMax) {
        resumen.push(`PA: ${pj.puntosArte} → ${pj.puntosArteMax}`);
        pj.puntosArte = pj.puntosArteMax;
    }
    if (pj.vida < pj.vidaMax) {
        resumen.push(`PV: ${pj.vida} → ${pj.vidaMax}`);
        pj.vida = pj.vidaMax;
    }
    restablecerAcciones(pj);

    if (!resumen.length) resumen.push("Sin cambios");
    return resumen;
}
