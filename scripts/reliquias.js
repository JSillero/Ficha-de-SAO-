// scripts/reliquias.js
// Reliquias: equipo con habilidades que se usan a mano y tienen enfriamiento en turnos.
// Una reliquia se lleva en la mano derecha o izquierda (un arma con `reliquia` o un objeto de tipo
// "reliquia", de una mano y sin ataque) o como accesorio (un accesorio con `reliquia`).
// Sus habilidades se editan y usan en la tarjeta de esa mano o de ese accesorio.
// No toca el DOM: recibe el personaje, lo modifica y devuelve lo que ha pasado.
//
// turno.js importa avanzarEnfriamientos y este módulo importa turno.js: el ciclo es seguro porque
// ninguno de los dos usa lo importado al cargarse, solo dentro de funciones.

import { TIPOS_DOS_MANOS } from "./equipamiento.js";
export { cargarReliquia, cargarHabilidadReliquia } from "./equipamiento.js";
import { partesDeMano, puedeGastar } from "./turno.js";

/* Manos donde puede ir una reliquia (= MANOS de turno.js; no se importa por el ciclo de módulos).
   Los accesorios son las ranuras "accesorio-N". */
export const RANURAS_RELIQUIA = ["manoIzquierda", "manoDerecha"];

const esRanuraAccesorio = (ranura) => String(ranura).startsWith("accesorio-");

/** Equipo de una ranura: "manoIzquierda", "manoDerecha" o "accesorio-N" */
export function equipoDeRanura(pj, ranura) {
    if (esRanuraAccesorio(ranura)) return pj.accesorios?.[Number(ranura.slice("accesorio-".length))] ?? null;
    return pj[ranura] ?? null;
}

export function esReliquia(equipo) {
    return Boolean(equipo?.reliquia);
}

/** Equipos reliquia que lleva puestos el personaje (manos y accesorios): [{ ranura, equipo }] */
export function reliquiasEquipadas(pj) {
    const ranuras = [...RANURAS_RELIQUIA, ...(pj.accesorios || []).map((_, i) => `accesorio-${i}`)];
    return ranuras
        .map(ranura => ({ ranura, equipo: equipoDeRanura(pj, ranura) }))
        .filter(({ equipo }) => esReliquia(equipo) && equipo.tipo);
}

/* Acciones que gasta usar una habilidad:
   - en una mano, la de esa mano (las dos si es a dos manos);
   - en un accesorio, la de un brazo (el primero con acción, o el derecho para que la interfaz pregunte). */
function partesParaUsar(pj, ranura) {
    if (esRanuraAccesorio(ranura)) return [["derecha", "izquierda"].find(parte => puedeGastar(pj, parte)) ?? "derecha"];
    return partesDeMano(ranura, TIPOS_DOS_MANOS.includes(pj[ranura]?.tipo));
}

/** Motivo por el que no se puede usar la habilidad, o null */
export function motivoNoUsarHabilidad(pj, ranura, indice) {
    const equipo = equipoDeRanura(pj, ranura);
    const habilidad = equipo?.reliquia?.habilidades?.[indice];
    if (!habilidad) return "Esa habilidad no existe.";
    if (!equipo.tipo) return "La reliquia no está equipada.";
    if (habilidad.restante > 0) {
        return `En enfriamiento: ${habilidad.restante} turno${habilidad.restante === 1 ? "" : "s"}.`;
    }
    return null;
}

/**
 * Usa una habilidad de reliquia: gasta las acciones (gastar(partes, descripcion), como los objetos)
 * y la pone en enfriamiento. El resumen es la descripción escrita a mano.
 */
export function usarHabilidadReliquia(pj, ranura, indice, gastar) {
    const motivo = motivoNoUsarHabilidad(pj, ranura, indice);
    if (motivo) return { ok: false, resumen: [motivo] };
    const equipo = equipoDeRanura(pj, ranura);
    const habilidad = equipo.reliquia.habilidades[indice];
    const nombre = habilidad.nombre.trim() || "Habilidad";
    if (!gastar(partesParaUsar(pj, ranura), `Usar ${nombre}`)) return { ok: false, resumen: ["Sin acciones para usarla."] };
    habilidad.restante = habilidad.enfriamiento;
    const resumen = [habilidad.descripcion.trim() || "(La habilidad no tiene descripción)"];
    if (habilidad.enfriamiento > 0) resumen.push(`Enfriamiento: ${habilidad.enfriamiento} turno${habilidad.enfriamiento === 1 ? "" : "s"}`);
    return { ok: true, resumen, habilidad, equipo };
}

/** Al iniciar turno: un turno menos de enfriamiento. Devuelve las líneas del resumen. */
export function avanzarEnfriamientos(pj) {
    const resumen = [];
    for (const { equipo } of reliquiasEquipadas(pj)) {
        for (const habilidad of equipo.reliquia.habilidades) {
            if (!(habilidad.restante > 0)) continue;
            habilidad.restante--;
            if (habilidad.restante === 0) resumen.push(`${habilidad.nombre.trim() || "Habilidad"} lista`);
        }
    }
    return resumen;
}

/** Descanso corto (y por tanto también el largo): todas las habilidades listas. Devuelve las líneas del resumen. */
export function reiniciarEnfriamientos(pj) {
    let reiniciadas = 0;
    for (const { equipo } of reliquiasEquipadas(pj)) {
        for (const habilidad of equipo.reliquia.habilidades) {
            if (habilidad.restante > 0) reiniciadas++;
            habilidad.restante = 0;
        }
    }
    return reiniciadas ? [`Habilidades de reliquia listas (${reiniciadas})`] : [];
}
