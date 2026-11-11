/* NPC del máster (monstruos, jefes...), sin DOM.
 * Un NPC es un PJ con esNpc = true: no tiene características ni habilidades, sus valores de combate se
 * escriben a mano (pj.npc) y PJ.calcularCaracteristicas les suma los modificadores. También guarda la EXP
 * y la recompensa que da al morir, sus tiradas libres y sus partes del cuerpo (cada parte = una acción). */
import { cargarObjeto, cargarObjetosClave, cargarEquipo } from "./objetos.js";
import { TIPOS_DOS_MANOS, ARMAS } from "./equipamiento.js";

/* Valores de combate que se editan a mano (clave en pj.npc → derivado del PJ que calcula) */
export const VALORES_NPC = [
    { clave: "vidaMax", etiqueta: "PV máximos", icono: "regeneracion", min: 1 },
    { clave: "puntosArteMax", etiqueta: "PA máximos", icono: "artes", min: 0 },
    { clave: "defensa", etiqueta: "Defensa", icono: "escudo", min: 5 },
    { clave: "iniciativa", etiqueta: "Iniciativa", icono: "iniciativa", min: 0 },
    { clave: "vMovimiento", etiqueta: "Movimiento", icono: "movimiento", min: 0, unidad: "casillas" },
    { clave: "perspicacia", etiqueta: "Perspicacia", icono: "perspicacia", min: 0 },
    { clave: "percepcionPasiva", etiqueta: "Percepción pasiva", icono: "percepcion", min: 0 },
    { clave: "aguante", etiqueta: "Aguante", icono: "aguante", min: 1,
        ayuda: "Solo para el frío (escarcha) y la hemorragia." }
];

/* La Defensa de un NPC nunca baja de aquí (como la de un personaje: 5 + Reflejos + Atletismo). El electrocutado
   la resta hasta este mínimo y, al llegar, lo paraliza. */
export const DEFENSA_MINIMA_NPC = 5;

/** Defensa a la que el electrocutado paraliza a un NPC (y de la que no la baja): el mínimo más la penalización
    de Atletismo de su armadura. Con penalización 5 y Defensa 15, 5 de electricidad lo paralizan. */
export function defensaParalisisNpc(pj) {
    return DEFENSA_MINIMA_NPC + Math.max(0, Number(pj.equipoArmadura?.penalizacionAtletismo) || 0);
}

/* Partes del cuerpo por defecto: mismos ids que las acciones de un personaje (turno.js) */
export const PARTES_POR_DEFECTO = [
    { id: "izquierda", nombre: "Brazo izquierdo" },
    { id: "derecha", nombre: "Brazo derecho" },
    { id: "cabeza", nombre: "Boca" },
    { id: "pies", nombre: "Piernas" }
];

export const MAX_TIRADAS_NPC = 30;
export const MAX_PISO = 100;
export const MAX_PARTES_NPC = 20;
const MAX_TEXTO = 60;

export function partesPorDefecto() {
    return PARTES_POR_DEFECTO.map(parte => ({ ...parte, disponible: true, equipo: null }));
}

/* Los brazos llevan su equipo en manoIzquierda / manoDerecha (las tarjetas de siempre); el resto de partes
   (boca, piernas, cola...) lo guarda en parte.equipo */
export const PARTES_MANO = { izquierda: "manoIzquierda", derecha: "manoDerecha" };
export const PARTE_DE_MANO = { manoIzquierda: "izquierda", manoDerecha: "derecha" };

/** Datos de un NPC nuevo */
export function crearNpc() {
    return {
        vidaMax: 20, puntosArteMax: 0, defensa: 10, iniciativa: 5, vMovimiento: 4,
        perspicacia: 10, percepcionPasiva: 10, aguante: 5,
        expRecompensa: 0,
        piso: null, // piso de Aincrad en el compendio (1-100), o null = sin piso
        tiradas: [],
        recompensa: { cor: 0, objetos: [], objetosClave: [] },
        partes: partesPorDefecto()
    };
}

const entero = (valor, porDefecto, min = 0) => {
    const n = Math.trunc(Number(valor));
    return Number.isFinite(n) ? Math.max(min, n) : porDefecto;
};
const texto = (valor, porDefecto = "") => String(valor ?? porDefecto).trim().slice(0, MAX_TEXTO);

/** Piso entre 1 y MAX_PISO, o null (sin piso) */
export function cargarPiso(valor) {
    if (valor === null || valor === undefined || valor === "") return null;
    const n = Math.trunc(Number(valor));
    return Number.isFinite(n) && n >= 1 ? Math.min(MAX_PISO, n) : null;
}

export function cargarTiradaNpc(datos = {}) {
    return { nombre: texto(datos?.nombre, "Tirada") || "Tirada", valor: entero(datos?.valor, 0, -99) };
}

export function cargarParteNpc(datos = {}, indice = 0) {
    const id = texto(datos?.id) || `parte-${indice}`;
    const equipo = !PARTES_MANO[id] && datos?.equipo?.tipo ? cargarEquipo(datos.equipo) : null;
    return { id, nombre: texto(datos?.nombre) || "Parte", disponible: datos?.disponible !== false, equipo };
}

/** Normaliza los datos de un NPC (lo que falte toma el valor por defecto) */
export function cargarNpc(datos) {
    const base = crearNpc();
    if (!datos || typeof datos !== "object") return base;
    const npc = { ...base };
    for (const { clave, min } of VALORES_NPC) npc[clave] = entero(datos[clave], base[clave], min);
    npc.expRecompensa = entero(datos.expRecompensa, 0);
    npc.piso = cargarPiso(datos.piso);
    npc.tiradas = (Array.isArray(datos.tiradas) ? datos.tiradas : []).slice(0, MAX_TIRADAS_NPC).map(cargarTiradaNpc);
    const recompensa = datos.recompensa ?? {};
    npc.recompensa = {
        cor: entero(recompensa.cor, 0),
        objetos: (Array.isArray(recompensa.objetos) ? recompensa.objetos : []).map(cargarObjeto).filter(Boolean),
        objetosClave: cargarObjetosClave(recompensa.objetosClave)
    };
    if (Array.isArray(datos.partes)) {
        const vistos = new Set();
        npc.partes = datos.partes.slice(0, MAX_PARTES_NPC).map(cargarParteNpc)
            .filter(parte => !vistos.has(parte.id) && vistos.add(parte.id));
        // Las piernas siempre están (un NPC guardado sin ellas las recupera)
        if (!vistos.has("pies")) npc.partes.push(partesPorDefecto().find(parte => parte.id === "pies"));
    }
    return npc;
}

/* Partes ____________________________________________________________________________ */

export const parteNpc = (pj, id) => pj.npc?.partes.find(parte => parte.id === id) ?? null;
export const tieneParte = (pj, id) => Boolean(parteNpc(pj, id));

/** Partes que no son brazos (tienen su propia tarjeta de equipo) */
export const partesExtra = (pj) => (pj.esNpc ? pj.npc.partes.filter(parte => !PARTES_MANO[parte.id]) : []);

/** Equipo de las partes que no son brazos */
export const equiposDePartes = (pj) => partesExtra(pj).map(parte => parte.equipo).filter(Boolean);

/** Equipo que hay en una ranura: una mano, "parte:<id>" o el de un brazo por su id */
export function equipoDeParte(pj, id) {
    if (PARTES_MANO[id]) return pj[PARTES_MANO[id]];
    return parteNpc(pj, id)?.equipo ?? null;
}

/** Parte cuyo arma a dos manos ocupa esta (o null). Un arma a dos manos en un brazo ocupa el otro brazo. */
export function parteQueOcupa(pj, id) {
    const otraMano = { izquierda: "manoDerecha", derecha: "manoIzquierda" }[id];
    if (otraMano && TIPOS_DOS_MANOS.includes(pj[otraMano]?.tipo) && !pj[otraMano]?.parteSecundaria) return PARTE_DE_MANO[otraMano];
    for (const parte of pj.npc?.partes ?? []) {
        const equipo = equipoDeParte(pj, parte.id);
        if (equipo?.tipo && equipo.parteSecundaria === id) return parte.id;
    }
    return null;
}

/** Acciones que gasta usar el equipo de una parte: la suya y, si es a dos manos, la otra que ocupa */
export function partesDeEquipoNpc(pj, id) {
    const equipo = equipoDeParte(pj, id);
    if (!equipo?.tipo || !TIPOS_DOS_MANOS.includes(equipo.tipo)) return [id];
    if (equipo.parteSecundaria) return [id, equipo.parteSecundaria];
    // Brazo con arma a dos manos sin otra parte elegida: los dos brazos, como un personaje
    return PARTES_MANO[id] ? ["izquierda", "derecha"] : [id];
}

/** Por qué no se puede quitar una parte, o null */
/* Las piernas no se quitan: son las que mueven al NPC (mover y correr) */
export const PARTES_FIJAS = ["pies"];

export function motivoNoQuitarParte(pj, id) {
    if (PARTES_FIJAS.includes(id)) return "Las piernas no se pueden quitar.";
    if ((pj.npc?.partes.length ?? 0) <= 1) return "Un NPC necesita al menos una parte.";
    if (equipoDeParte(pj, id)?.tipo) return "Quita antes lo que lleva equipado.";
    if (parteQueOcupa(pj, id)) return "La ocupa un arma a dos manos.";
    return null;
}

export function quitarParte(pj, id) {
    if (motivoNoQuitarParte(pj, id)) return false;
    pj.npc.partes = pj.npc.partes.filter(parte => parte.id !== id);
    pj.numeroAcciones = Math.min(pj.numeroAcciones, Math.max(0, pj.npc.partes.length - 1));
    return true;
}

/** Añade una parte (id nuevo; si es un brazo que no tiene, recupera su id para usar la tarjeta de mano) */
export function anadirParte(pj, nombre = "Parte nueva") {
    if (pj.npc.partes.length >= MAX_PARTES_NPC) return null;
    let n = pj.npc.partes.length + 1;
    while (tieneParte(pj, `parte-${n}`)) n++;
    const parte = { id: `parte-${n}`, nombre: texto(nombre) || "Parte nueva", disponible: true, equipo: null };
    pj.npc.partes.push(parte);
    return parte;
}

/** Vuelve a añadir un brazo quitado (izquierda o derecha), con su tarjeta de mano */
export function anadirBrazo(pj, id) {
    if (!PARTES_MANO[id] || tieneParte(pj, id) || pj.npc.partes.length >= MAX_PARTES_NPC) return null;
    const parte = { id, nombre: PARTES_POR_DEFECTO.find(p => p.id === id).nombre, disponible: true, equipo: null };
    pj.npc.partes.push(parte);
    return parte;
}

/** Acierto de su mejor arma con los modificadores, sin lo que resta la quemadura (0 si no tiene armas).
    La quemadura de un NPC quita PV cada turno por lo que supere este valor. */
export function aciertoMaximo(pj) {
    const armas = [pj.manoIzquierda, pj.manoDerecha, ...equiposDePartes(pj)]
        .filter(item => ARMAS[item?.tipo] && !ARMAS[item.tipo].escudo);
    const mejor = armas.length ? Math.max(...armas.map(item => Number(item.acierto) || 0)) : 0;
    return mejor + (Number(pj.getModificador("acierto")) || 0) - pj.getModificadorEstados("acierto");
}

/** ¿Tiene exactamente las cuatro partes de un personaje? (entonces se ve el muñeco de acciones) */
export function esCuerpoPorDefecto(pj) {
    const partes = pj.npc?.partes ?? [];
    return partes.length === PARTES_POR_DEFECTO.length && PARTES_POR_DEFECTO.every(p => partes.some(q => q.id === p.id));
}
