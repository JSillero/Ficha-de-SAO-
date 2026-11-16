/* Jefes del máster, sin DOM.
 * Un jefe es un NPC (esNpc) con esJefe = true y varias fases (pj.npc.fases). Cada fase tiene su barra de vida
 * (sus PV máximos) y puede cambiar los valores de combate (salvo los PA, comunes), las tiradas, las partes del
 * cuerpo, el equipo, las artes y el comportamiento. El nombre, los PA, la EXP y la recompensa son del jefe.
 *
 * La fase activa vive en los campos normales del PJ (pj.npc.vidaMax, manoIzquierda, artes...), así el resto
 * de la ficha (ataques, modificadores, partes) no sabe nada de fases. pj.npc.fases[faseActual] es una copia que
 * se pone al día con guardarFaseActiva (al guardar el JSON y antes de cambiar de fase).
 *
 * Cuando la vida de una fase baja de 0, lo que sobra se resta a la siguiente (pasarFaseSiToca). Curar no
 * devuelve fases pasadas: la vida no supera los PV máximos de la fase actual. */
import { VALORES_NPC, cargarParteNpc, cargarTiradaNpc, partesPorDefecto, MAX_PARTES_NPC, MAX_TIRADAS_NPC } from "./npc.js";
import { cargarEquipo } from "./objetos.js";
import { cargarArtes, nuevoIdArte } from "./artes.js";
import { ESTADOS_INFO, curaConTodosLosNegativos, estaActivo, quitarEstado } from "./estados.js";
import { restablecerAcciones } from "./turno.js";

export const MAX_FASES_JEFE = 10;

/* Valores de combate propios de cada fase: todos los del NPC menos los PA (comunes al jefe). Función y no
   constante: npc.js importa este módulo (ciclo) y VALORES_NPC aún no existe al cargarse */
export const valoresFase = () => VALORES_NPC.filter(valor => valor.clave !== "puntosArteMax");

/* Lo que puede pasar al empezar una fase (cada una lo marca por separado) */
export const OPCIONES_FASE = [
    { clave: "rellenarPA", etiqueta: "Rellenar PA" },
    { clave: "curarNegativos", etiqueta: "Curar estados negativos" },
    { clave: "restablecerAcciones", etiqueta: "Restablecer acciones" }
];

const entero = (valor, porDefecto, min = 0) => {
    const n = Math.trunc(Number(valor));
    return Number.isFinite(n) ? Math.max(min, n) : porDefecto;
};
const copia = (valor) => (valor === undefined ? undefined : JSON.parse(JSON.stringify(valor)));

/** Normaliza una fase guardada (null si no es un objeto) */
export function cargarFase(datos) {
    if (!datos || typeof datos !== "object") return null;
    const valores = {};
    for (const { clave, min } of valoresFase()) valores[clave] = entero(datos.valores?.[clave], 0, min);
    let partes = partesPorDefecto();
    if (Array.isArray(datos.partes)) {
        const vistos = new Set();
        partes = datos.partes.slice(0, MAX_PARTES_NPC).map(cargarParteNpc)
            .filter(parte => !vistos.has(parte.id) && vistos.add(parte.id));
        if (!vistos.has("pies")) partes.push(partesPorDefecto().find(parte => parte.id === "pies"));
    }
    const fase = {
        valores,
        tiradas: (Array.isArray(datos.tiradas) ? datos.tiradas : []).slice(0, MAX_TIRADAS_NPC).map(cargarTiradaNpc),
        partes,
        manoIzquierda: cargarEquipo(datos.manoIzquierda),
        manoDerecha: cargarEquipo(datos.manoDerecha),
        equipoArmadura: cargarEquipo(datos.equipoArmadura),
        accesorios: Array.isArray(datos.accesorios) ? datos.accesorios.map(cargarEquipo) : [],
        artes: cargarArtes(datos.artes),
        comportamiento: String(datos.comportamiento ?? "").slice(0, 5000)
    };
    OPCIONES_FASE.forEach(({ clave }) => { fase[clave] = datos[clave] === true; });
    return fase;
}

export function cargarFases(lista) {
    return (Array.isArray(lista) ? lista : []).slice(0, MAX_FASES_JEFE).map(cargarFase).filter(Boolean);
}

/** La fase activa del PJ como datos sueltos (sin compartir nada con el PJ) */
function faseDelPj(pj, opciones = {}) {
    const valores = {};
    valoresFase().forEach(({ clave }) => { valores[clave] = pj.npc[clave]; });
    const fase = copia({
        valores,
        tiradas: pj.npc.tiradas,
        partes: pj.npc.partes,
        manoIzquierda: pj.manoIzquierda,
        manoDerecha: pj.manoDerecha,
        equipoArmadura: pj.equipoArmadura,
        accesorios: pj.accesorios,
        artes: pj.artes,
        comportamiento: pj.comportamientoCombate ?? ""
    });
    OPCIONES_FASE.forEach(({ clave }) => { fase[clave] = opciones[clave] === true; });
    return cargarFase(fase);
}

export const esJefe = (pj) => Boolean(pj?.esNpc && pj.esJefe && pj.npc?.fases?.length);
export const faseActual = (pj) => Math.min(Math.max(0, pj.npc?.faseActual ?? 0), Math.max(0, (pj.npc?.fases?.length ?? 1) - 1));
export const numeroFases = (pj) => pj.npc?.fases?.length ?? 0;

/** Copia la fase activa del PJ a pj.npc.fases[faseActual] (conserva sus opciones) */
export function guardarFaseActiva(pj) {
    if (!pj.esJefe || !pj.npc?.fases?.length) return;
    const i = faseActual(pj);
    pj.npc.fases[i] = faseDelPj(pj, pj.npc.fases[i]);
}

/** Pone en el PJ los datos de la fase i (sin guardar la que había: llamar antes a guardarFaseActiva) */
function cargarFaseEnPj(pj, i) {
    const fase = cargarFase(copia(pj.npc.fases[i]));
    valoresFase().forEach(({ clave }) => { pj.npc[clave] = fase.valores[clave]; });
    pj.npc.tiradas = fase.tiradas;
    pj.npc.partes = fase.partes;
    pj.manoIzquierda = fase.manoIzquierda;
    pj.manoDerecha = fase.manoDerecha;
    pj.equipoArmadura = fase.equipoArmadura;
    pj.accesorios = fase.accesorios;
    pj.artes = fase.artes;
    pj.comportamientoCombate = fase.comportamiento;
    pj.npc.faseActual = i;
    // Con otras partes puede haber menos acciones
    pj.numeroAcciones = Math.min(pj.numeroAcciones, Math.max(0, pj.npc.partes.length - 1));
}

/**
 * Cambia a la fase i. Con { empezar: true } (al pasar de fase en combate) aplica sus opciones: rellenar PA,
 * curar los estados negativos y restablecer las acciones. Sin él solo cambia los datos (editar en el perfil).
 */
export function aplicarFase(pj, i, { empezar = false } = {}) {
    if (!pj.npc?.fases?.[i]) return false;
    guardarFaseActiva(pj);
    cargarFaseEnPj(pj, i);
    pj.calcularCaracteristicas();
    if (empezar) {
        const fase = pj.npc.fases[i];
        if (fase.curarNegativos) {
            Object.keys(ESTADOS_INFO).filter(clave => curaConTodosLosNegativos(clave) && estaActivo(pj, clave))
                .forEach(clave => quitarEstado(pj, clave));
        }
        if (fase.restablecerAcciones) restablecerAcciones(pj);
        pj.calcularCaracteristicas();
        if (fase.rellenarPA) pj.puntosArte = pj.puntosArteMax;
    }
    return true;
}

/** Convierte un NPC en jefe: la fase 1 es su estado actual */
export function convertirEnJefe(pj) {
    pj.esNpc = true;
    pj.esJefe = true;
    pj.npc.fases = [faseDelPj(pj)];
    pj.npc.faseActual = 0;
}

/** Fase nueva al final, copia de la activa (artes con ids nuevos). Devuelve su índice o -1 */
export function copiarFase(pj) {
    if (numeroFases(pj) >= MAX_FASES_JEFE) return -1;
    guardarFaseActiva(pj);
    const nueva = faseDelPj(pj, pj.npc.fases[faseActual(pj)]);
    nueva.artes.forEach(arte => { arte.id = nuevoIdArte(arte.idCatalogo || arte.nombre); });
    pj.npc.fases.push(nueva);
    return pj.npc.fases.length - 1;
}

/** Quita la fase i (no la única). La activa pasa a ser la anterior (o la primera) */
export function borrarFase(pj, i) {
    if (numeroFases(pj) <= 1 || !pj.npc.fases[i]) return false;
    guardarFaseActiva(pj);
    const activa = faseActual(pj);
    pj.npc.fases.splice(i, 1);
    const nueva = activa > i ? activa - 1 : Math.min(activa, pj.npc.fases.length - 1);
    cargarFaseEnPj(pj, nueva);
    pj.calcularCaracteristicas();
    return true;
}

/**
 * Si la vida de la fase actual ha bajado de 0 y quedan fases, pasa a la siguiente con lo que sobra restado
 * (las veces que haga falta). Devuelve las fases a las que ha pasado (índices; vacío si no ha cambiado).
 */
export function pasarFaseSiToca(pj) {
    const pasadas = [];
    if (!esJefe(pj)) return pasadas;
    while (pj.vida <= 0 && faseActual(pj) < numeroFases(pj) - 1) {
        const sobra = -pj.vida;
        const siguiente = faseActual(pj) + 1;
        aplicarFase(pj, siguiente, { empezar: true });
        pj.vida = pj.vidaMax - sobra;
        pasadas.push(siguiente);
    }
    return pasadas;
}

/** Vuelve a la fase 1 con la vida llena (copia nueva de una plantilla, crear) */
export function reiniciarJefe(pj) {
    if (!esJefe(pj)) return;
    aplicarFase(pj, 0);
    pj.vida = pj.vidaMax;
    pj.puntosArte = pj.puntosArteMax;
}

/**
 * Fracción de vida de cada fase (0-1): las pasadas a 0, la actual vida / máx. y las siguientes llenas.
 * La de la fase actual sale de vidaMax (con modificadores); las demás, de sus PV escritos.
 */
export function barrasJefe(pj) {
    if (!esJefe(pj)) return [];
    const actual = faseActual(pj);
    return pj.npc.fases.map((_, i) => {
        if (i < actual) return 0;
        if (i > actual) return 1;
        return Math.max(0, Math.min(1, pj.vida / Math.max(1, pj.vidaMax)));
    });
}
