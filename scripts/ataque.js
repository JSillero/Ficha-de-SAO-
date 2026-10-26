// scripts/ataque.js
// Ataques con armas (05-combate-y-estados.md §1, 04-tiradas.md §2, 10-sigilo.md §5).
// No toca el DOM: prepara los valores de la tirada y calcula el daño.

import { ARMAS } from "./equipamiento.js";
import { combinarModos } from "./dados.js";

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

/**
 * Daño del ataque = daño del arma + bonificador CaC.
 * - Crítico: el bonificador ×2 (el daño del arma no se duplica).
 * - En sigilo: bonificador ×2 (×4 si es crítico) y, con cuchillo, el daño del arma ×2.
 * El bonificador ya usa Sigilo en lugar de Combate cuando el personaje está en sigilo (PJ.dFisico).
 * @returns {{ total: number, desglose: string[], notas: string[] }}
 */
export function calcularDannoAtaque(pj, item, critico) {
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

    const conMult = (valor, mult) => mult > 1 ? `${valor}×${mult}` : `${valor}`;
    return {
        total: dannoArma * multArma + bono * multBono,
        desglose: [
            `${conMult(dannoArma, multArma)} (Arma)`,
            `${conMult(bono, multBono)} (Bonif. CaC)`
        ],
        notas
    };
}
