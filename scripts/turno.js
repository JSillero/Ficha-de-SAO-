// scripts/turno.js
// Reglas del turno y de las acciones (05-combate-y-estados.md §2, 10-sigilo.md).
// No toca el DOM: recibe el personaje, lo modifica y devuelve lo que ha pasado.

import { TURNOS_PERMANENTE } from "./modificador.js";

/* Máximo de acciones por turno: se pueden usar 3 de los 4 tipos */
export const ACCIONES_MAX = 3;

/* Tipos de acción (campos booleanos de PJ: true = disponible) */
export const PARTES_ACCION = ["izquierda", "derecha", "cabeza", "pies"];

/* Acciones ____________________________________________________________________ */

/* Estados que impiden actuar mientras estén activos (no solo al iniciar turno) */
const ESTADOS_INCAPACITANTES = ["paralisis", "dormido"];

export function estaIncapacitado(pj) {
    return ESTADOS_INCAPACITANTES.some(estado => (Number(pj.estados?.[estado]?.valor) || 0) > 0);
}

export function accionesUsadas(pj) {
    return PARTES_ACCION.filter(parte => !pj[parte]).length;
}

export function accionesRestantes(pj) {
    if (estaIncapacitado(pj)) return 0;
    const libres = PARTES_ACCION.filter(parte => pj[parte]).length;
    return Math.max(0, Math.min(libres, pj.numeroAcciones - accionesUsadas(pj)));
}

export function puedeGastar(pj, parte) {
    return !estaIncapacitado(pj) && Boolean(pj[parte]) && accionesUsadas(pj) < pj.numeroAcciones;
}

/** Gasta la acción de una parte del cuerpo. Devuelve false si no se puede. */
export function gastarAccion(pj, parte) {
    if (!puedeGastar(pj, parte)) return false;
    pj[parte] = false;
    return true;
}

/** ¿Se pueden gastar todas estas acciones a la vez? (p. ej. un arma a dos manos gasta ambos brazos) */
export function puedeGastarVarias(pj, partes) {
    return !estaIncapacitado(pj)
        && partes.every(parte => pj[parte])
        && accionesUsadas(pj) + partes.length <= pj.numeroAcciones;
}

/** Gasta varias acciones; no gasta ninguna si no se pueden gastar todas. */
export function gastarVarias(pj, partes) {
    if (!puedeGastarVarias(pj, partes)) return false;
    partes.forEach(parte => { pj[parte] = false; });
    return true;
}

/** Acciones que gasta usar lo que hay en una mano: su brazo, o los dos si es a dos manos. */
export function partesDeMano(propMano, aDosManos) {
    if (aDosManos) return ["izquierda", "derecha"];
    return [propMano === "manoIzquierda" ? "izquierda" : "derecha"];
}

/** Devuelve una acción gastada (para corregir un clic por error). */
export function devolverAccion(pj, parte) {
    pj[parte] = true;
}

/* Movimiento __________________________________________________________________ */

/** Casillas de movimiento normal; en sigilo se reduce un tercio. */
export function velocidadMovimiento(pj) {
    return pj.enSigilo ? Math.floor(pj.vMovimiento * 2 / 3) : pj.vMovimiento;
}

/** Correr duplica la distancia. */
export function velocidadCorrer(pj) {
    return pj.vMovimiento * 2;
}

export function puedeMoverse(pj) {
    return puedeGastar(pj, "pies");
}

/** Correr gasta las tres acciones del turno y no se puede en sigilo. */
export function puedeCorrer(pj) {
    return !estaIncapacitado(pj) && !pj.enSigilo && accionesUsadas(pj) === 0 && pj.numeroAcciones >= ACCIONES_MAX;
}

export function correr(pj) {
    if (!puedeCorrer(pj)) return false;
    pj.pies = false;
    pj.izquierda = false;
    pj.derecha = false;
    return true;
}

/* Sigilo ______________________________________________________________________ */

/**
 * Modo de la tirada de sigilo según la armadura: 0 desventaja, 1 normal, 2 ventaja,
 * o null si no se puede entrar en sigilo (armadura pesada).
 */
export function modoSigiloPorArmadura(tipoArmadura) {
    switch (tipoArmadura) {
        case "pesada": return null;
        case "media": return 0;
        case "ligera": return 1;
        default: return 2; // ropa, real o sin armadura
    }
}

export function puedeEntrarEnSigilo(pj) {
    return !pj.enSigilo
        && modoSigiloPorArmadura(pj.equipoArmadura?.tipo) !== null
        && puedeGastar(pj, "pies");
}

export function entrarEnSigilo(pj, valorTirada) {
    if (!puedeEntrarEnSigilo(pj)) return false;
    pj.pies = false;
    pj.enSigilo = true;
    pj.valorSigilo = valorTirada;
    pj.calcularCaracteristicas(); // los bonificadores de daño pasan a usar Sigilo
    return true;
}

export function salirDeSigilo(pj) {
    pj.enSigilo = false;
    pj.valorSigilo = 0;
    pj.calcularCaracteristicas();
}

/* Hielo (05-combate-y-estados.md §3.1) _______________________________________ */

export function efectoHielo(escarcha, aguante) {
    const m = aguante > 0 ? Math.floor(escarcha / aguante) : Infinity;
    return {
        accionesPerdidas: m >= 3 ? 2 : m >= 2 ? 1 : 0, // siempre queda >= 1 acción
        // Supuesto por defecto: 1 PA por cada múltiplo de Aguante a partir del 4º
        paPerdidos: m >= 4 ? (Number.isFinite(m) ? m - 3 : 1) : 0
    };
}

/* Inicio de turno _____________________________________________________________ */

/**
 * Aplica todo lo que pasa al empezar el turno del personaje, en este orden:
 * 0. Terminan los estados que ya agotaron sus turnos (turnos = 0).
 * 1. Resetea las acciones (y pierde la reacción guardada).
 * 2. Los escudos en uso dejan de sumar defensa ("hasta tu siguiente turno").
 * 3. Efectos de los estados sobre los PV.
 * 4. Escarcha: quita acciones o PA y después se reduce a la mitad.
 * 5. Descuenta un turno de estados y modificadores temporales.
 *
 * Duración de los estados: un estado de N turnos está activo durante los N turnos siguientes
 * del personaje y termina al iniciar el turno N+1 (se descuenta en el paso 5 y se quita en el 0).
 * La parálisis y el sueño no se aplican aquí: bloquean las acciones mientras estén activos.
 * @returns {string[]} resumen legible de lo que ha cambiado
 */
export function iniciarTurno(pj) {
    const resumen = [];
    const estados = pj.estados;
    const valor = (estado) => Number(estados[estado]?.valor) || 0;

    // 0. Estados que ya agotaron sus turnos
    for (const [nombre, estado] of Object.entries(estados)) {
        if (estado.turnos === 0 && estado.valor > 0) {
            estado.valor = 0;
            resumen.push(`Termina: ${nombre}`);
        }
    }
    pj.calcularCaracteristicas();

    // 1. Acciones
    PARTES_ACCION.forEach(parte => { pj[parte] = true; });
    pj.numeroAcciones = ACCIONES_MAX;
    pj.reaccionGuardada = false;

    // 2. Escudos
    [pj.manoIzquierda, pj.manoDerecha].forEach(mano => {
        if (mano?.enUso) {
            mano.enUso = false;
            resumen.push(`${mano.nombre || "Escudo"}: deja de sumar defensa`);
        }
    });

    // 3. Estados (el daño de estados no rompe el sigilo)
    const vidaInicial = pj.vida;
    if (valor("veneno") > 0) {
        pj.vida -= valor("veneno");
        resumen.push(`Veneno: −${valor("veneno")} PV`);
    }
    const sobranteQuemadura = valor("quemadura") > 0 ? Math.max(0, -pj.getGenerico("combate")) : 0;
    if (sobranteQuemadura > 0) {
        pj.vida -= sobranteQuemadura;
        resumen.push(`Quemadura: −${sobranteQuemadura} PV (Combate por debajo de 0)`);
    }
    if (valor("hemorragia") > 0 && valor("hemorragia") > pj.aguante) {
        pj.vida -= valor("hemorragia");
        resumen.push(`Hemorragia: −${valor("hemorragia")} PV`);
    }
    if (valor("wither") > 0 && pj.vida > 1) {
        const antes = pj.vida;
        pj.vida = Math.max(1, pj.vida - 2);
        resumen.push(`Wither: −${antes - pj.vida} PV`);
    }
    if (valor("regeneracion") > 0) {
        // vidaMax ya descuenta la oscuridad
        const antes = pj.vida;
        pj.vida = Math.min(pj.vidaMax, pj.vida + valor("regeneracion"));
        if (pj.vida > antes) resumen.push(`Regeneración: +${pj.vida - antes} PV`);
    }
    pj.vida = Math.max(0, pj.vida);
    if (pj.vida !== vidaInicial) resumen.push(`PV: ${vidaInicial} → ${pj.vida}`);

    if (valor("paralisis") > 0) resumen.push("Paralizado: no puede actuar");
    else if (valor("dormido") > 0) resumen.push("Dormido: no actúa hasta que le despierten");

    // 4. Escarcha
    const escarcha = valor("congelacion");
    if (escarcha > 0) {
        const { accionesPerdidas, paPerdidos } = efectoHielo(escarcha, pj.aguante);
        if (accionesPerdidas > 0 && pj.numeroAcciones > 0) {
            const antes = pj.numeroAcciones;
            pj.numeroAcciones = Math.max(1, pj.numeroAcciones - accionesPerdidas);
            resumen.push(`Escarcha: −${antes - pj.numeroAcciones} acción(es)`);
        }
        if (paPerdidos > 0 && pj.puntosArte > 0) {
            const antes = pj.puntosArte;
            pj.puntosArte = Math.max(0, pj.puntosArte - paPerdidos);
            resumen.push(`Escarcha: −${antes - pj.puntosArte} PA`);
        }
        estados.congelacion.valor = Math.floor(escarcha / 2);
        resumen.push(`Escarcha: ${escarcha} → ${estados.congelacion.valor}`);
    }

    // 5. Duraciones de estados: turnos > 0 cuenta hacia atrás; al llegar a 0 el estado sigue activo
    //    este turno y termina al iniciar el siguiente (paso 0). Permanente (-1) no caduca.
    for (const estado of Object.values(estados)) {
        if (estado.turnos > 0 && estado.valor > 0) estado.turnos--;
    }

    const listasModificadores = [
        pj.modificadores, pj.manoIzquierda?.modificadores, pj.manoDerecha?.modificadores,
        pj.equipoArmadura?.modificadores, ...(pj.accesorios || []).map(acc => acc.modificadores)
    ].filter(Array.isArray);
    for (const lista of listasModificadores) {
        for (let i = lista.length - 1; i >= 0; i--) {
            const mod = lista[i];
            if (mod.turnos === TURNOS_PERMANENTE || !(mod.turnos > 0)) continue;
            mod.turnos--;
            if (mod.turnos === 0) {
                resumen.push(`Termina el modificador: ${mod.nombre}`);
                lista.splice(i, 1);
            }
        }
    }

    pj.calcularCaracteristicas();
    if (resumen.length === 0) resumen.push("Sin efectos");
    return resumen;
}
