// scripts/estadosAlAcertar.js
// Estados que un arma, un arte o un efecto de equipo provoca al acertar, cada uno con su probabilidad.
// Sin DOM. La tirada se hace al calcular el daño (lado del atacante): los que salen viajan en el efecto
// del golpe (golpe.efecto.estados) y quien recibe el golpe se los aplica (aplicarEfectoEnObjetivo en objetos.js).

import { ESTADOS_INFO } from "./estados.js";
import { TURNOS_PERMANENTE } from "./modificador.js";

export const MAX_ESTADOS_AL_ACERTAR = 6;

/** Un estado al acertar normalizado ({ clave, valor, turnos, probabilidad }), o null si no es válido */
export function cargarEstadoAlAcertar(datos) {
    if (!datos || !ESTADOS_INFO[datos.clave]) return null;
    const info = ESTADOS_INFO[datos.clave];
    const turnos = Math.trunc(Number(datos.turnos));
    const probabilidad = Math.trunc(Number(datos.probabilidad));
    return {
        clave: datos.clave,
        valor: Math.max(1, Math.trunc(Number(datos.valor) || info.valorPorDefecto || 1)),
        turnos: Number.isFinite(turnos) && (turnos > 0 || turnos === TURNOS_PERMANENTE) ? turnos : (info.turnos ?? TURNOS_PERMANENTE),
        probabilidad: Number.isFinite(probabilidad) ? Math.min(100, Math.max(1, probabilidad)) : 100
    };
}

/** Lista guardada (de un equipo o de un arte) normalizada */
export function cargarEstadosAlAcertar(lista) {
    return (Array.isArray(lista) ? lista : []).map(cargarEstadoAlAcertar).filter(Boolean).slice(0, MAX_ESTADOS_AL_ACERTAR);
}

/** "Envenenado 2 · 3 turnos" (sin la probabilidad) */
export function textoEstadoAlAcertar(estado) {
    const info = ESTADOS_INFO[estado.clave];
    const duracion = estado.turnos === TURNOS_PERMANENTE ? "permanente" : `${estado.turnos} turno${estado.turnos === 1 ? "" : "s"}`;
    return `${info?.etiqueta ?? estado.clave}${info?.unidad ? ` ${estado.valor}` : ""} · ${duracion}`;
}

/** Resumen de una lista para detalles y fichas: "Envenenado 2 · 3 turnos (40 %), Aturdido · permanente" */
export function describirEstadosAlAcertar(lista) {
    return cargarEstadosAlAcertar(lista)
        .map(estado => `${textoEstadoAlAcertar(estado)}${estado.probabilidad < 100 ? ` (${estado.probabilidad} %)` : ""}`)
        .join(", ");
}

/** Tira cada estado: [{ ...estado, aplicado }] */
export function tirarEstadosAlAcertar(lista, azar = Math.random) {
    return cargarEstadosAlAcertar(lista).map(estado => ({ ...estado, aplicado: azar() * 100 < estado.probabilidad }));
}

/**
 * Tira los estados de una fuente (arma, arte o efecto) y los añade al golpe: una nota por estado con el
 * resultado y, los que salen, en golpe.efecto.estados (si el golpe no llevaba efecto se crea uno con el
 * nombre de la fuente). Devuelve el mismo golpe.
 */
export function anadirEstadosAlGolpe(golpe, lista, nombre = "", azar = Math.random) {
    if (!golpe) return golpe;
    const tirados = tirarEstadosAlAcertar(lista, azar);
    if (!tirados.length) return golpe;
    golpe.notas = Array.isArray(golpe.notas) ? golpe.notas : [];
    for (const estado of tirados) {
        const probabilidad = estado.probabilidad < 100 ? ` (${estado.probabilidad} %)` : "";
        golpe.notas.push(`Al acertar: ${textoEstadoAlAcertar(estado)}${probabilidad}${estado.aplicado ? "" : ": no sale"}`);
    }
    const aplicados = tirados.filter(estado => estado.aplicado).map(({ clave, valor, turnos }) => ({ clave, valor, turnos }));
    if (!aplicados.length) return golpe;
    golpe.efecto ??= { nombre: nombre || "Al acertar", pv: 0, estado: null, elemental: null };
    golpe.efecto.estados = [...(Array.isArray(golpe.efecto.estados) ? golpe.efecto.estados : []), ...aplicados];
    return golpe;
}
