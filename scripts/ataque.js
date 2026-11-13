// scripts/ataque.js
// Ataques con armas (05-combate-y-estados.md §1, 04-tiradas.md §2, 10-sigilo.md §5).
// No toca el DOM: prepara los valores de la tirada y calcula el daño.

import { ARMAS, ELEMENTOS } from "./equipamiento.js";
import { combinarModos } from "./dados.js";
import { ESTADOS_INFO, TIPOS_DANNO } from "./estados.js";
import { anadirEstadosAlGolpe } from "./estadosAlAcertar.js";

/* Nombre del arma para el efecto del golpe */
const nombreArma = (item) => item?.nombre?.trim() || ARMAS[item?.tipo]?.etiqueta || "Arma";

const NOMBRES_CARACTERISTICA = { reflejos: "Reflejos", fortaleza: "Fortaleza" };

/** Característica que suma el arma; "mejor" = la más alta entre Reflejos y Fortaleza. */
export function caracteristicaArma(pj, tipo) {
    let clave = ARMAS[tipo]?.caracteristica ?? "reflejos";
    if (clave === "mejor") clave = pj.fortaleza > pj.reflejos ? "fortaleza" : "reflejos";
    return { clave, valor: Number(pj[clave]) || 0, etiqueta: NOMBRES_CARACTERISTICA[clave] };
}

/**
 * Valores de la tirada de ataque con el arma de una mano:
 * dado (según el arma, combinado con el modo elegido) + característica del arma + Combate
 * (o Sigilo si está en sigilo). Devuelve null si en esa mano no hay un arma.
 * @param {"manoIzquierda"|"manoDerecha"} propMano
 * @param {number|number[]} modosExtra modo del panel de tiradas y demás fuentes de ventaja/desventaja
 *   (p. ej. aturdido): cada una es 0 desventaja, 1 normal o 2 ventaja
 */
export function prepararAtaque(pj, propMano, modosExtra = [1]) {
    const item = pj[propMano];
    const arma = ARMAS[item?.tipo];
    if (!arma || arma.escudo) return null;
    if (pj.esNpc) return prepararAtaqueNpc(pj, item, modosExtra);

    const caracteristica = caracteristicaArma(pj, item.tipo);
    const habilidad = pj.getHabilidadAtaque();
    // El dado del arma es una fuente de ventaja/desventaja más (estoque + ventaja = ventaja +2)
    const { modo, bonificador } = combinarModos(arma.dado, ...[].concat(modosExtra));

    return {
        nombre: item.nombre?.trim() || arma.etiqueta,
        tipo: item.tipo,
        modo,
        bonificador,
        valorHabilidad: Math.max(0, Number(pj.getGenerico(habilidad)) || 0),
        etiquetaHabilidad: pj.enSigilo ? "Sigilo" : "Combate",
        valorCaracteristica: caracteristica.valor,
        etiquetaCaracteristica: caracteristica.etiqueta
    };
}

/* NPC _____________________________________________________________________________
 * Sin características ni habilidades: la tirada es el dado del arma (el suyo o el de su tipo) + su acierto
 * (+ modificadores "acierto"), y el daño es el del arma (+ modificadores "dFisico"). El crítico multiplica
 * el daño físico por CRITICO_NPC, hacia abajo; el elemental no. */
export const CRITICO_NPC = 1.25;

/** Dado del arma de un NPC: el elegido en el arma o, si no tiene, el de su tipo */
export const dadoArmaNpc = (item) => item?.dado ?? ARMAS[item?.tipo]?.dado ?? 1;

/** Acierto total de un arma de NPC (el suyo más los modificadores "acierto") */
export const aciertoNpc = (pj, item) => (Number(item?.acierto) || 0) + (Number(pj.getModificador("acierto")) || 0);

/** Tirada de ataque de un NPC con un equipo cualquiera (de un brazo o de otra parte), o null si no ataca */
export function prepararAtaqueNpc(pj, item, modosExtra = [1]) {
    const arma = ARMAS[item?.tipo];
    if (!arma || arma.escudo) return null;
    const { modo, bonificador } = combinarModos(dadoArmaNpc(item), ...[].concat(modosExtra));
    return {
        nombre: item.nombre?.trim() || arma.etiqueta,
        tipo: item.tipo,
        modo,
        bonificador,
        valorHabilidad: aciertoNpc(pj, item),
        etiquetaHabilidad: "Acierto",
        valorCaracteristica: 0,
        etiquetaCaracteristica: null
    };
}

function calcularDannoAtaqueNpc(pj, item, critico) {
    const dannoArma = Math.max(0, Number(item?.danno) || 0);
    const bono = Number(pj.dFisico) || 0; // solo modificadores
    const base = Math.max(0, dannoArma + bono);
    const total = critico ? Math.floor(base * CRITICO_NPC) : base;
    const desglose = [`${dannoArma} (Arma)`];
    if (bono) desglose.push(`${bono > 0 ? "" : "−"}${Math.abs(bono)} (Modificadores)`);
    if (critico) desglose.push(`×${String(CRITICO_NPC).replace(".", ",")} (Crítico)`);
    const notas = [];
    if (item?.pocionAplicada) notas.push(`Poción aplicada: ${describirEfecto(item.pocionAplicada)}`);
    const golpe = { total, desglose, elemental: dannoElementalArma(item), efecto: efectoDeObjeto(item?.pocionAplicada), notas };
    return anadirEstadosAlGolpe(golpe, item?.estadosAlAcertar, nombreArma(item));
}

/**
 * Daño del ataque = daño del arma + bonificador CaC.
 * - Crítico: el bonificador ×2 (el daño del arma no se duplica).
 * - En sigilo: bonificador ×2 (×4 si es crítico) y, con cuchillo, el daño del arma ×2.
 * El bonificador ya usa Sigilo en lugar de Combate cuando el personaje está en sigilo (PJ.dFisico).
 * @returns {{ total: number, desglose: string[], notas: string[] }}
 */
export function calcularDannoAtaque(pj, item, critico) {
    if (pj.esNpc) return calcularDannoAtaqueNpc(pj, item, critico);
    const dannoArma = Math.max(0, Number(item?.danno) || 0);
    const bono = Math.max(0, Number(pj.dFisico) || 0);
    const esCuchillo = item?.tipo === "cuchillo";

    let multArma = 1;
    let multBono = critico ? 2 : 1;
    const notas = [];
    if (pj.enSigilo) {
        multArma = esCuchillo ? 2 : 1;
        multBono = critico ? 4 : 2;
        notas.push("Ataque desde el sigilo. Si el objetivo no muere, sales del sigilo.");
    }
    if (critico) notas.push("Crítico: bonificador de daño multiplicado.");

    if (item?.pocionAplicada) notas.push(`Poción aplicada: ${describirEfecto(item.pocionAplicada)}`);

    return anadirEstadosAlGolpe({
        total: dannoArma * multArma + bono * multBono,
        desglose: [
            `${conMult(dannoArma, multArma)} (Arma)`,
            `${conMult(bono, multBono)} (Bonif. CaC)`
        ],
        elemental: dannoElementalArma(item),
        efecto: efectoDeObjeto(item?.pocionAplicada),
        notas
    }, item?.estadosAlAcertar, nombreArma(item));
}

/**
 * Daño al lanzar una lanza o un cuchillo equipado (la tirada es la del ataque normal, prepararAtaque):
 * daño del arma + bonificador a distancia. Crítico y sigilo multiplican el bonificador como en el
 * cuerpo a cuerpo, y en sigilo el cuchillo también duplica su daño, como al atacar con él.
 * El daño elemental del arma va aparte y la poción aplicada se lleva en el golpe.
 */
export function calcularDannoLanzamientoArma(pj, item, critico) {
    const dannoArma = Math.max(0, Number(item?.danno) || 0);
    const bono = Math.max(0, Number(pj.dDistancia) || 0);
    let multArma = 1;
    let multBono = critico ? 2 : 1;
    const notas = ["Arma lanzada: queda en el suelo hasta recogerla."];
    if (pj.enSigilo) {
        multArma = item?.tipo === "cuchillo" ? 2 : 1;
        multBono = critico ? 4 : 2;
        notas.push("Ataque desde el sigilo. Si el objetivo no muere, sales del sigilo.");
    }
    if (critico) notas.push("Crítico: bonificador de daño multiplicado.");
    if (item?.pocionAplicada) notas.push(`Poción aplicada: ${describirEfecto(item.pocionAplicada)}`);

    return anadirEstadosAlGolpe({
        total: dannoArma * multArma + bono * multBono,
        desglose: [`${conMult(dannoArma, multArma)} (Arma)`, `${conMult(bono, multBono)} (Bonif. distancia)`],
        elemental: dannoElementalArma(item),
        efecto: efectoDeObjeto(item?.pocionAplicada),
        notas
    }, item?.estadosAlAcertar, nombreArma(item));
}

/**
 * Efecto que un golpe lleva al objetivo (poción aplicada al arma o efecto de una arrojadiza):
 * { nombre, pv, estado, elemental }, o null si no hace nada. Va en el golpe para que quien lo
 * reciba se lo aplique (aplicarEfectoEnObjetivo en objetos.js).
 */
export function efectoDeObjeto(objeto) {
    if (!objeto) return null;
    const pv = Number(objeto.pv) || 0;
    const estado = objeto.estado?.clave ? { ...objeto.estado } : null;
    const elemental = objeto.elemental?.tipo && Number(objeto.elemental.cantidad) > 0 ? { ...objeto.elemental } : null;
    if (!pv && !estado && !elemental) return null;
    return { nombre: objeto.nombre || "Poción", pv, estado, elemental };
}

/**
 * Daño elemental del arma: [{ tipo, cantidad, etiqueta }] de los elementos con daño > 0.
 * Va aparte del físico (no lo multiplican crítico ni sigilo; al objetivo lo reducen sus resistencias).
 */
export function dannoElementalArma(item) {
    return ELEMENTOS
        .map(tipo => ({ tipo, cantidad: Math.max(0, Number(item?.dannoElemental?.[tipo]) || 0) }))
        .filter(({ cantidad }) => cantidad > 0)
        .map(({ tipo, cantidad }) => ({ tipo, cantidad, etiqueta: TIPOS_DANNO[tipo].etiqueta,
            color: TIPOS_DANNO[tipo].color, colorTexto: TIPOS_DANNO[tipo].colorGlifo }));
}

const conMult = (valor, mult) => mult > 1 ? `${valor}×${mult}` : `${valor}`;

/* Texto del efecto de una poción o arrojadiza sobre el objetivo (PV, estado y daño elemental) */
export function describirEfecto(objeto, conNombre = true) {
    const partes = [];
    const pv = Number(objeto?.pv) || 0;
    if (pv > 0) partes.push(`cura ${pv} PV`);
    if (pv < 0) partes.push(`${-pv} de daño`);
    const pa = Number(objeto?.pa) || 0;
    if (pa > 0) partes.push(`recupera ${pa} PA`);
    const estado = objeto?.estado;
    if (estado?.clave) {
        const etiqueta = ESTADOS_INFO[estado.clave]?.etiqueta ?? estado.clave;
        if (estado.quitar) partes.push(`cura ${etiqueta.toLowerCase()}`);
        else partes.push(`${etiqueta} ${estado.valor}${estado.turnos > 0 ? ` (${estado.turnos} turnos)` : ""}`);
    }
    const elemental = objeto?.elemental;
    if (elemental?.tipo && Number(elemental.cantidad) > 0) {
        partes.push(`${elemental.cantidad} de daño de ${(TIPOS_DANNO[elemental.tipo]?.etiqueta ?? elemental.tipo).toLowerCase()}`);
    }
    if (!conNombre) return partes.join(", ");
    return `${objeto?.nombre || "Poción"}${partes.length ? ": " + partes.join(", ") : ""}`;
}

/* Armas arrojadizas ___________________________________________________________ */

/**
 * Tirada de lanzamiento: dado medio (combinado con el panel) + Reflejos + Combate
 * (o Sigilo si está en sigilo).
 */
export function prepararLanzamiento(pj, objeto, modosExtra = [1]) {
    const { modo, bonificador } = combinarModos(1, ...[].concat(modosExtra));
    return {
        nombre: objeto?.nombre?.trim() || "Arma arrojadiza",
        modo,
        bonificador,
        valorHabilidad: Math.max(0, Number(pj.getGenerico(pj.getHabilidadAtaque())) || 0),
        etiquetaHabilidad: pj.enSigilo ? "Sigilo" : "Combate",
        valorCaracteristica: Number(pj.reflejos) || 0,
        etiquetaCaracteristica: "Reflejos"
    };
}

/**
 * Daño del lanzamiento = daño fijo del objeto + bonificador a distancia.
 * Crítico y sigilo multiplican el bonificador como en el cuerpo a cuerpo (no cuenta como cuchillo).
 */
export function calcularDannoLanzamiento(pj, objeto, critico) {
    const dannoObjeto = Math.max(0, Number(objeto?.danno) || 0);
    const bono = Math.max(0, Number(pj.dDistancia) || 0);
    let multBono = critico ? 2 : 1;
    const notas = [];
    if (pj.enSigilo) {
        multBono = critico ? 4 : 2;
        notas.push("Ataque desde el sigilo. Si el objetivo no muere, sales del sigilo.");
    }
    if (critico) notas.push("Crítico: bonificador de daño multiplicado.");
    if (objeto?.estado?.clave || objeto?.elemental?.tipo) notas.push(`Efecto: ${describirEfecto(objeto)}`);

    return {
        total: dannoObjeto + bono * multBono,
        desglose: [
            `${dannoObjeto} (Objeto)`,
            `${conMult(bono, multBono)} (Bonif. distancia)`
        ],
        efecto: efectoDeObjeto(objeto),
        notas
    };
}
