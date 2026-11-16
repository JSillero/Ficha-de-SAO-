// scripts/armasFuego.js
// Armas de fuego (06-equipo-y-objetos.md §2 bis): equipo de mano (tipos con `fuego` en ARMAS) que dispara las balas
// de su cargador. No toca el DOM: recibe el personaje, lo modifica y devuelve lo que ha pasado.
// - Tirada de cada disparo: dado del arma + Inteligencia + Percepción (en sigilo igual, sin bonus). NPC: dado + acierto.
// - Daño de cada disparo: daño del arma + potencia de la bala (sin bonificadores); crítico = bala ×2. Más el daño
//   elemental del arma y sus estados al acertar. El golpe lleva `armaFuego: true`: no cuenta para la notoriedad y,
//   si mata, nadie recibe recompensa (interfaz.js).
// - Un uso gasta la acción de las manos del arma y hace hasta `disparos` disparos, uno por bala.
// - Recargar gasta esas mismas acciones; cada bala es una unidad de un material de herrería del inventario y su
//   potencia es el daño de la bala. Vaciar devuelve las balas al inventario (lo que no cabe, al botín).
// - NPC con `balasInfinitas`: no gasta balas ni recarga; cada bala hace `dannoBala`.

import { ARMAS, esArmaFuego } from "./equipamiento.js";
import { combinarModos } from "./dados.js";
import { dannoElementalArma, dadoArmaNpc, aciertoNpc } from "./ataque.js";
import { anadirEstadosAlGolpe } from "./estadosAlAcertar.js";
import { cargarObjeto, anadirAInventario, descartar, mismoObjeto } from "./objetos.js";
import { equipoDeRanura } from "./reliquias.js";
import { partesDeEfecto } from "./efectosEquipo.js";

/* Material con el que se hacen las balas (TIPOS_MATERIAL en objetos.js) */
export const SUBTIPO_MUNICION = "herreria";
/* Multiplicador de la bala en un crítico */
export const MULT_CRITICO_BALA = 2;

const exito = (...resumen) => ({ ok: true, resumen });
const fallo = (motivo) => ({ ok: false, resumen: [motivo] });

export const nombreArmaFuego = (item) => item?.nombre?.trim() || ARMAS[item?.tipo]?.etiqueta || "Arma de fuego";

/** ¿Dispara sin gastar balas? Solo los NPC con la casilla de balas infinitas */
export const tieneBalasInfinitas = (pj, item) => Boolean(pj?.esNpc && item?.balasInfinitas);

/** Disparos que hará el siguiente uso: los del arma, o los que permitan las balas cargadas */
export function disparosPosibles(pj, item) {
    if (!esArmaFuego(item)) return 0;
    const disparos = Math.max(1, Number(item.disparos) || 1);
    return tieneBalasInfinitas(pj, item) ? disparos : Math.min(disparos, item.balas?.length ?? 0);
}

/** Acciones que gasta disparar o recargar el arma de esa ranura (manos o, en un NPC, sus partes) */
export const partesDeArmaFuego = (pj, ranura) => partesDeEfecto(pj, ranura);

/** Por qué no se puede disparar con el arma de esa ranura, o null */
export function motivoNoDisparar(pj, ranura) {
    const item = equipoDeRanura(pj, ranura);
    if (!esArmaFuego(item)) return "No es un arma de fuego.";
    if (!disparosPosibles(pj, item)) return "Cargador vacío: recarga el arma.";
    return null;
}

/** Valores de la tirada de un disparo (como prepararAtaque): personaje = dado + Inteligencia + Percepción */
export function prepararDisparo(pj, item, modosExtra = [1]) {
    if (!esArmaFuego(item)) return null;
    const nombre = nombreArmaFuego(item);
    if (pj.esNpc) {
        const { modo, bonificador } = combinarModos(dadoArmaNpc(item), ...[].concat(modosExtra));
        return { nombre, tipo: item.tipo, modo, bonificador, valorHabilidad: aciertoNpc(pj, item),
            etiquetaHabilidad: "Acierto", valorCaracteristica: 0, etiquetaCaracteristica: null };
    }
    const { modo, bonificador } = combinarModos(ARMAS[item.tipo].dado, ...[].concat(modosExtra));
    return {
        nombre, tipo: item.tipo, modo, bonificador,
        valorHabilidad: Math.max(0, Number(pj.getGenerico("percepcion")) || 0),
        etiquetaHabilidad: "Percepción",
        valorCaracteristica: Number(pj.inteligencia) || 0,
        etiquetaCaracteristica: "Inteligencia"
    };
}

/** Saca la siguiente bala del cargador (con balas infinitas, una bala de `dannoBala` sin gastar nada), o null */
export function sacarBala(pj, item) {
    if (tieneBalasInfinitas(pj, item)) return { nombre: "", potencia: Math.max(0, Number(item.dannoBala) || 0) };
    return item?.balas?.shift() ?? null;
}

const conMult = (valor, mult) => mult > 1 ? `${valor}×${mult}` : `${valor}`;

/**
 * Daño de un disparo = daño del arma + potencia de la bala (×2 en un crítico); sin bonificadores ni modificadores.
 * El daño elemental del arma va aparte y los estados al acertar se tiran aquí (uno por disparo).
 */
export function calcularDannoDisparo(pj, item, bala, critico) {
    const dannoArma = Math.max(0, Number(item?.danno) || 0);
    const potencia = Math.max(0, Number(bala?.potencia) || 0);
    const mult = critico ? MULT_CRITICO_BALA : 1;
    const notas = [];
    if (critico) notas.push(`Crítico: daño de la bala ×${MULT_CRITICO_BALA}.`);
    const nombreBala = String(bala?.nombre ?? "").trim();
    return anadirEstadosAlGolpe({
        total: dannoArma + potencia * mult,
        desglose: [`${dannoArma} (Arma)`, `${conMult(potencia, mult)} (Bala${nombreBala ? `: ${nombreBala}` : ""})`],
        elemental: dannoElementalArma(item),
        efecto: null,
        notas,
        armaFuego: true
    }, item?.estadosAlAcertar, nombreArmaFuego(item));
}

/* Recargar y vaciar _______________________________________________________________ */

/** ¿Sirve este objeto como bala? (material de herrería) */
export const esMunicion = (objeto) => objeto?.tipo === "material" && objeto.subtipo === SUBTIPO_MUNICION;

/** Materiales del inventario que sirven como balas: [{ indice, objeto }] */
export function municionDisponible(pj) {
    return (pj.inventario ?? []).map((objeto, indice) => ({ indice, objeto })).filter(({ objeto }) => esMunicion(objeto));
}

/** Balas que caben todavía en el cargador */
export const huecosCargador = (item) => Math.max(0, (Number(item?.cargador) || 0) - (item?.balas?.length ?? 0));

/** Por qué no se puede recargar el arma de esa ranura, o null */
export function motivoNoRecargar(pj, ranura) {
    const item = equipoDeRanura(pj, ranura);
    if (!esArmaFuego(item)) return "No es un arma de fuego.";
    if (tieneBalasInfinitas(pj, item)) return "Tiene balas infinitas: no hace falta recargarla.";
    if (!huecosCargador(item)) return "El cargador está lleno.";
    if (!municionDisponible(pj).length) return "No tienes materiales de herrería en el inventario.";
    return null;
}

/**
 * Mete en el cargador `cantidad` balas del material del hueco `indice` del inventario (cada unidad es una bala).
 * Gasta las acciones de las manos del arma con gastar(partes, descripcion).
 */
export function recargarArma(pj, ranura, indice, cantidad, gastar) {
    const motivo = motivoNoRecargar(pj, ranura);
    if (motivo) return fallo(motivo);
    const item = equipoDeRanura(pj, ranura);
    const objeto = pj.inventario[indice];
    if (!esMunicion(objeto)) return fallo("Ese objeto no es un material de herrería.");
    const n = Math.min(Math.floor(Number(cantidad) || 0), objeto.cantidad, huecosCargador(item));
    if (n < 1) return fallo("Elige cuántas balas cargar.");
    const nombre = nombreArmaFuego(item);
    if (!gastar(partesDeArmaFuego(pj, ranura), `Recargar ${nombre}`)) return fallo("Sin acciones para recargar.");
    const bala = cargarObjeto({ ...objeto, cantidad: 1 });
    for (let i = 0; i < n; i++) {
        item.balas.push({ ...bala });
        descartar(pj.inventario, indice, true);
    }
    return exito(`${nombre}: +${n} bala${n === 1 ? "" : "s"} de ${bala.nombre} (potencia ${bala.potencia})`,
        `Cargador: ${item.balas.length}/${item.cargador}`);
}

/** Devuelve las balas del cargador al inventario como materiales (lo que no cabe va al botín). Sin coste. */
export function vaciarCargador(pj, ranura) {
    const item = equipoDeRanura(pj, ranura);
    if (!esArmaFuego(item)) return fallo("No es un arma de fuego.");
    if (!item.balas?.length) return fallo("El cargador ya está vacío.");
    // Balas iguales juntas, para apilarlas
    const grupos = [];
    for (const bala of item.balas) {
        const grupo = grupos.find(g => mismoObjeto(g, bala));
        if (grupo) grupo.cantidad++;
        else grupos.push({ ...bala, cantidad: 1 });
    }
    item.balas = [];
    const resumen = [];
    for (const grupo of grupos) {
        const resto = anadirAInventario(pj, grupo);
        if (grupo.cantidad - resto > 0) resumen.push(`${grupo.nombre} ×${grupo.cantidad - resto} → inventario`);
        if (resto > 0) {
            pj.botin.push({ ...grupo, cantidad: resto });
            resumen.push(`${grupo.nombre} ×${resto} → botín (no cabe en el inventario)`);
        }
    }
    return exito(...resumen);
}

/** Texto corto del cargador: "Cargador 3/6 · 2 disparos" o "Balas infinitas (5) · 2 disparos" */
export function textoCargador(pj, item) {
    if (!esArmaFuego(item)) return "";
    const disparos = Math.max(1, Number(item.disparos) || 1);
    const textoDisparos = `${disparos} disparo${disparos === 1 ? "" : "s"}`;
    if (tieneBalasInfinitas(pj, item)) return `Balas infinitas (daño ${Number(item.dannoBala) || 0}) · ${textoDisparos}`;
    return `Cargador ${item.balas?.length ?? 0}/${item.cargador} · ${textoDisparos}`;
}
