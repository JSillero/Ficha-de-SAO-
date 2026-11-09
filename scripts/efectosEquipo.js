// scripts/efectosEquipo.js
// Efectos del equipo: pasivas y activas con el mismo formato que las artes (cargarArte), pero que
// van dentro de un equipo (`equipo.efectos`) y solo cuentan mientras está equipado. No son artes
// de la lista: no ocupan memoria ni tienen requisitos.
// - Pasivas: sus modificadores se suman en PJ.getModificador.
// - Activas: cuestan PA; en las manos gastan además la acción de esa mano (las dos si es a dos manos);
//   en la armadura o un accesorio no gastan acción. Si el equipo es un arma, el daño es el del arma
//   + bonificador CaC + el del efecto (como un arte de arma).
// No toca el DOM.

import { ARMAS, TIPOS_DOS_MANOS, equipoActivo } from "./equipamiento.js";
import { cargarArte, calcularDannoArte } from "./artes.js";
import { equipoDeRanura } from "./reliquias.js";
import { partesDeMano } from "./turno.js";

const MANOS_EFECTO = ["manoIzquierda", "manoDerecha"];

/** Efectos guardados: lista de artes normalizadas (sin requisitos ni memoria; las activas no gastan parte propia) */
export function cargarEfectos(lista) {
    return (Array.isArray(lista) ? lista : []).map(datos => {
        const efecto = cargarArte({ ...datos, equipada: true, requisitos: [], notaRequisitos: "", ranuras: 1, idCatalogo: null });
        if (efecto.tipo === "activa") Object.assign(efecto, { combo: false, uso: { tipo: "parte", parte: "ninguna" } });
        return efecto;
    });
}

/** Ranuras de equipo que pueden llevar efectos: manos, armadura y accesorios */
export function ranurasConEfectos(pj) {
    return [...MANOS_EFECTO, "equipoArmadura", ...(pj.accesorios || []).map((_, i) => `accesorio-${i}`)];
}

/** Equipos puestos con efectos: [{ ranura, equipo }] */
export function equiposConEfectos(pj) {
    return ranurasConEfectos(pj)
        .map(ranura => ({ ranura, equipo: equipoDeRanura(pj, ranura) }))
        .filter(({ equipo }) => equipoActivo(equipo) && equipo.efectos?.length);
}

/** Efectos pasivos del equipo puesto: [{ ranura, equipo, efecto }] */
export function pasivasDeEquipo(pj) {
    return equiposConEfectos(pj).flatMap(({ ranura, equipo }) =>
        equipo.efectos.filter(efecto => efecto.tipo === "pasiva").map(efecto => ({ ranura, equipo, efecto })));
}

/** Lo que suman las pasivas del equipo puesto a un atributo (lo usa PJ.getModificador) */
export function modificadorEfectosEquipo(pj, atributo) {
    return pasivasDeEquipo(pj).reduce((suma, { efecto }) => suma + efecto.modificadores
        .reduce((s, mod) => s + (mod.modificado === atributo ? Number(mod.numero) || 0 : 0), 0), 0);
}

const esMano = (ranura) => MANOS_EFECTO.includes(ranura);

/** Acciones que gasta usar un efecto activo de esa ranura */
export function partesDeEfecto(pj, ranura) {
    if (!esMano(ranura)) return [];
    return partesDeMano(ranura, TIPOS_DOS_MANOS.includes(pj[ranura]?.tipo));
}

/* Mano cuyo arma suma su daño al efecto (solo armas de ataque, no escudos ni reliquias) */
function manoDelArma(pj, ranura) {
    const tipo = pj[ranura]?.tipo;
    return esMano(ranura) && ARMAS[tipo] && !ARMAS[tipo].escudo ? ranura : null;
}

export function motivoNoUsarEfecto(pj, ranura, indice) {
    const equipo = equipoDeRanura(pj, ranura);
    const efecto = equipo?.efectos?.[indice];
    if (!efecto) return "Ese efecto no existe.";
    if (!equipo.tipo) return "El equipo no está puesto.";
    if (efecto.tipo === "pasiva") return "Los efectos pasivos no se usan: están siempre activos.";
    if ((Number(pj.puntosArte) || 0) < efecto.costePA) return `Faltan PA: cuesta ${efecto.costePA} y tienes ${pj.puntosArte}.`;
    return null;
}

/** Daño del efecto (un elemento por golpe) o null, sin gastar nada */
export function calcularDannoEfecto(pj, ranura, efecto) {
    const golpes = calcularDannoArte(pj, efecto, manoDelArma(pj, ranura));
    // En el desglose el daño propio sale como "(Efecto)", no "(Arte)"
    golpes?.forEach(golpe => { golpe.desglose = golpe.desglose.map(linea => linea.replace(/\(Arte\)$/, "(Efecto)")); });
    return golpes;
}

/**
 * Usa un efecto activo: gasta las acciones (gastar(partes, descripcion), como los objetos) y los PA.
 * @returns {{ ok: boolean, resumen: string[], danno?: object[]|null, arte?: object }} igual que usarArte
 */
export function usarEfectoEquipo(pj, ranura, indice, gastar) {
    const motivo = motivoNoUsarEfecto(pj, ranura, indice);
    if (motivo) return { ok: false, resumen: [motivo] };
    const equipo = equipoDeRanura(pj, ranura);
    const efecto = equipo.efectos[indice];

    const partes = partesDeEfecto(pj, ranura);
    if (partes.length && !gastar(partes, `Usar ${efecto.nombre}`)) return { ok: false, resumen: ["Sin acciones para usarlo."] };

    const mano = manoDelArma(pj, ranura);
    const danno = calcularDannoEfecto(pj, ranura, efecto);
    // Como en un ataque, la poción aplicada al arma se gasta en el golpe
    if (danno && mano && pj[mano]?.pocionAplicada) pj[mano].pocionAplicada = null;

    pj.puntosArte = Math.max(0, (Number(pj.puntosArte) || 0) - efecto.costePA);
    const resumen = [efecto.descripcion.trim() || "(El efecto no tiene descripción)"];
    if (efecto.costePA > 0) resumen.push(`−${efecto.costePA} PA (quedan ${pj.puntosArte})`);
    return { ok: true, resumen, danno, arte: efecto, equipo };
}
