// scripts/sacro.js
// Magia del Underworld (Sacro), sin DOM. Reglas en .claude/13-sacro.md.
// Cada punto de Sacro es un dedo (máximo 20: manos y pies) y cada dedo sostiene un elemento, que se genera con PV
// o se absorbe (ambiente, cristales elementales del cinturón, lo quitado a otro). El daño de cada dedo es el daño
// mágico × el multiplicador del elemento; los dedos con el mismo elemento suman y cada elemento hace su daño aparte.

import { TIPOS_DOS_MANOS } from "./equipamiento.js";
import { MANOS, puedeGastarVarias, gastarVarias, puedeGastarTodas, gastarTodas, accionesUsadas } from "./turno.js";

/* Máximo de dedos (los 10 de las manos y los 10 de los pies); más Sacro solo sube el daño mágico */
export const MAX_DEDOS = 20;
export const DEDOS_MANO = 5;
export const DEDOS_PIES = 10;
/* Alerta del sistema por matar con magia (en lugar del +1 de matar con el Underworld activo) */
export const ALERTA_MAGIA = 2;
/* PV de generar un elemento: Aguante / DIVISOR_COSTE × el coste del elemento */
export const DIVISOR_COSTE = 3;
/* Armaduras con las que se pueden usar los dedos de los pies */
export const ARMADURAS_PIES = ["ropa", "real"];

export { ELEMENTOS_SACRO, CLAVES_ELEMENTOS_SACRO, esElementoSacro, ELEMENTOS_CRISTAL, describirEnergia, PLAYS_ENERGIA, entradaDannoSacro, cargarHechizo, cargarAmbiente } from "./elementosSacro.js";
import { ELEMENTOS_SACRO, esElementoSacro, ELEMENTOS_CRISTAL, describirEnergia, entradaDannoSacro } from "./elementosSacro.js";

/* De dónde sale el elemento de un dedo */
export const ORIGENES_DEDO = ["generar", "ambiente", "cinturon", "quitado"];

/* Dedos: "manoIzquierda-0".."manoIzquierda-4", "manoDerecha-0".."manoDerecha-4", "pies-0".."pies-9" */
export const DEDOS = [
    ...MANOS.flatMap(mano => Array.from({ length: DEDOS_MANO }, (_, i) => `${mano}-${i}`)),
    ...Array.from({ length: DEDOS_PIES }, (_, i) => `pies-${i}`)
];
/** "manoIzquierda", "manoDerecha" o "pies" */
export const parteDeDedo = (id) => String(id).split("-")[0];

/** ¿Puede usar magia? Solo personajes del Underworld (casilla del perfil, esUnderworld); los NPC no */
export const puedeUsarMagia = (pj) => Boolean(pj && !pj.esNpc && pj.esUnderworld);

/** Dedos que permite el Sacro (con modificadores), de 0 a 20 */
export function dedosSacro(pj) {
    if (!puedeUsarMagia(pj)) return 0;
    return Math.max(0, Math.min(MAX_DEDOS, Math.floor(Number(pj.getGenerico("sacro")) || 0)));
}

/** Energía guardada en una mano (fase de energía en las manos), o null */
export const energiaEnMano = (pj, mano) => pj?.energiaManos?.[mano] ?? null;

/** Mano libre para la magia: sin nada equipado (ni un arma a dos manos en la otra) y sin energía guardada */
export function manoLibreMagia(pj, mano) {
    const otra = mano === "manoIzquierda" ? "manoDerecha" : "manoIzquierda";
    return !pj[mano]?.tipo && !TIPOS_DOS_MANOS.includes(pj[otra]?.tipo) && !energiaEnMano(pj, mano);
}

/** Los pies solo con ropa o armadura real */
export const piesUsables = (pj) => ARMADURAS_PIES.includes(pj?.equipoArmadura?.tipo);

/** Por qué no se puede usar un dedo (null = se puede). No cuenta el límite del Sacro, que va por número de dedos. */
export function motivoDedoNoUsable(pj, id) {
    const parte = parteDeDedo(id);
    if (parte === "pies") return piesUsables(pj) ? null : "Los dedos de los pies solo con ropa o armadura real.";
    if (!MANOS.includes(parte)) return "Dedo desconocido.";
    if (energiaEnMano(pj, parte)) return "Esta mano ya tiene energía guardada.";
    return manoLibreMagia(pj, parte) ? null : "La mano no está libre.";
}

/* Dedo de un hechizo: { id, elemento, origen, puntos? } (puntos: los de un cristal elemental; si no, se calcula) */
export function cargarDedo(datos) {
    if (!datos || !DEDOS.includes(datos.id) || !esElementoSacro(datos.elemento)) return null;
    const origen = ORIGENES_DEDO.includes(datos.origen) ? datos.origen : "generar";
    const dedo = { id: datos.id, elemento: datos.elemento, origen };
    const puntos = Math.floor(Number(datos.puntos));
    if (Number.isFinite(puntos) && puntos >= 0) dedo.puntos = puntos;
    return dedo;
}
/** Dedos normalizados, sin repetir dedo (se queda el primero) */
export function cargarDedos(lista) {
    const vistos = new Set();
    return (Array.isArray(lista) ? lista : []).map(cargarDedo).filter(dedo => {
        if (!dedo || vistos.has(dedo.id)) return false;
        vistos.add(dedo.id);
        return true;
    });
}

/** Por qué no vale esta selección de dedos (null = vale): límite del Sacro, dedos usables y Morna generada */
export function motivoNoDedos(pj, dedos) {
    if (!puedeUsarMagia(pj)) return "Solo los personajes del Underworld pueden usar la magia.";
    if (!dedos.length) return "Pon algún elemento en los dedos.";
    const maximo = dedosSacro(pj);
    if (dedos.length > maximo) return `Tu Sacro solo da para ${maximo} dedo${maximo === 1 ? "" : "s"}.`;
    for (const dedo of dedos) {
        const motivo = motivoDedoNoUsable(pj, dedo.id);
        if (motivo) return motivo;
        if (dedo.origen === "generar" && ELEMENTOS_SACRO[dedo.elemento].coste === null) {
            return `${ELEMENTOS_SACRO[dedo.elemento].etiqueta} no se puede generar.`;
        }
    }
    return null;
}

/** PV que cuesta generar los dedos con origen "generar": Aguante / 3 × coste de cada uno, redondeado al final */
export function costeGenerar(pj, dedos) {
    const suma = dedos.filter(dedo => dedo.origen === "generar")
        .reduce((total, dedo) => total + (ELEMENTOS_SACRO[dedo.elemento]?.coste ?? 0), 0);
    return Math.round(suma * (Number(pj.aguante) || 0) / DIVISOR_COSTE);
}

/** Por qué no se pueden pagar los PV de generar (null = se puede): no se puede quedar por debajo de 0 */
export function motivoNoGenerar(pj, dedos) {
    const coste = costeGenerar(pj, dedos);
    if (coste > 0 && (Number(pj.vida) || 0) - coste < 0) return `Generar cuesta ${coste} PV y tienes ${pj.vida}.`;
    return null;
}

/** Daño de un dedo sin redondear. enMano: energía guardada (Metala hace su daño fijo; en un hechizo, 0: lo pone el máster) */
export function dannoDedo(pj, dedo, { enMano = false } = {}) {
    const elemento = ELEMENTOS_SACRO[dedo?.elemento];
    if (!elemento) return 0;
    if (Number.isFinite(dedo.puntos)) return dedo.puntos;
    if (elemento.fijo) return enMano ? elemento.fijo : 0;
    return (Number(pj.dMagico) || 0) * elemento.multiplicador;
}

/** Lo que cabe en un dedo de un elemento al absorberlo de un cristal: el daño de ese elemento con un dedo */
export function maximoPorDedo(pj, elemento) {
    return Math.floor(dannoDedo(pj, { elemento }, { enMano: true }));
}

/* Cristales elementales (13-sacro.md §11) ______________________________________________ */

/** Por qué no se puede llenar este cristal con este elemento (null = se puede) */
export function motivoNoLlenar(cristal, elemento) {
    if (cristal?.tipo !== "arrojadiza" || cristal.subtipo !== "cristalElemental") return "No es un cristal elemental.";
    if (!ELEMENTOS_CRISTAL.includes(elemento)) return `${ELEMENTOS_SACRO[elemento]?.etiqueta ?? "Ese elemento"} no se puede guardar en un cristal.`;
    if (cristal.elemento && cristal.elemento.clave !== elemento) return `Ya tiene ${ELEMENTOS_SACRO[cristal.elemento.clave].etiqueta}: solo guarda un elemento.`;
    if ((cristal.elemento?.puntos ?? 0) >= cristal.capacidad) return "Está lleno.";
    return null;
}

/**
 * Llena un cristal con los dedos de un elemento: cada dedo añade su daño (daño mágico × multiplicador; Metala 20)
 * hasta la capacidad; lo que sobra se pierde. Modifica el cristal. @returns {{ anadido, perdido }}
 */
export function llenarCristal(pj, cristal, elemento, dedos = 1) {
    if (motivoNoLlenar(cristal, elemento)) return { anadido: 0, perdido: 0 };
    const bruto = Math.floor(dannoDedo(pj, { elemento }, { enMano: true }) * Math.max(0, Math.floor(dedos)));
    const antes = cristal.elemento?.puntos ?? 0;
    const puntos = Math.min(cristal.capacidad, antes + bruto);
    cristal.elemento = puntos > 0 ? { clave: elemento, puntos } : cristal.elemento;
    return { anadido: puntos - antes, perdido: bruto - (puntos - antes) };
}

/**
 * Absorbe un cristal con un dedo: el dedo recibe sus puntos, como mucho el daño de ese elemento con un dedo, y el
 * cristal queda vacío (lo que sobra se pierde). Modifica el cristal. @returns dedo { elemento, puntos } o null
 */
export function absorberDeCristal(pj, cristal) {
    const elemento = cristal?.subtipo === "cristalElemental" ? cristal.elemento : null;
    if (!elemento) return null;
    const puntos = Math.min(elemento.puntos, maximoPorDedo(pj, elemento.clave));
    cristal.elemento = null;
    return { elemento: elemento.clave, puntos };
}

/** Multiplicador del daño en radio: 1×1 entero, 2×2 la mitad, 3×3 un cuarto… */
export function factorRadio(lado) {
    const n = Math.max(1, Math.floor(Number(lado) || 1));
    return 1 / 2 ** (n - 1);
}

/**
 * Daño de unos dedos: una entrada por elemento (los dedos del mismo elemento suman), o por tipo de daño con
 * juntarPorTipo. Con el radio aplicado y cada total redondeado hacia abajo.
 * @returns {{ clave, etiqueta, tipoDanno, ignoraArmadura, cantidad }[]}
 */
export function dannoElementos(pj, dedos, { radio = 1, juntarPorTipo = false, enMano = false } = {}) {
    const grupos = new Map();
    for (const dedo of dedos) {
        const elemento = ELEMENTOS_SACRO[dedo.elemento];
        if (!elemento) continue;
        const clave = juntarPorTipo ? `${elemento.tipoDanno}${elemento.ignoraArmadura ? "-ignora" : ""}` : dedo.elemento;
        const grupo = grupos.get(clave) ?? {
            clave, etiqueta: juntarPorTipo ? null : elemento.etiqueta, tipoDanno: elemento.tipoDanno,
            ignoraArmadura: Boolean(elemento.ignoraArmadura), elemento: dedo.elemento, elementos: new Set(), bruto: 0
        };
        grupo.elementos.add(elemento.etiqueta);
        grupo.bruto += dannoDedo(pj, dedo, { enMano });
        grupos.set(clave, grupo);
    }
    const factor = factorRadio(radio);
    return [...grupos.values()].map(({ elementos, bruto, ...grupo }) => ({
        ...grupo,
        etiqueta: grupo.etiqueta ?? [...elementos].join(" + "),
        cantidad: Math.floor(bruto * factor)
    }));
}

/* Entradas de golpe.elemental (con su color y el daño que hacen) a partir del daño por elemento */
const entradasDeDanno = (entradas) => entradas.filter(e => e.cantidad > 0).map(e => entradaDannoSacro(e.elemento, e.cantidad));

/**
 * Golpe para recibirGolpe / mostrarPopupDanno a partir del daño por elemento: cada elemento es una ficha de su color
 * (las físicas se aplican como impactos aparte; la Kristala ignora la armadura). Con magia: true.
 */
export function golpesDeElementos(entradas, etiqueta = "Magia") {
    const elemental = entradasDeDanno(entradas);
    return elemental.length ? [{ etiqueta, total: 0, elemental, magia: true }] : [];
}

/** Acciones de un hechizo: siempre la boca, cada brazo cuyos dedos se usan y piernas si se usan los pies */
export function partesHechizo(dedos) {
    const partes = new Set(["cabeza"]);
    for (const dedo of dedos) {
        const parte = parteDeDedo(dedo.id);
        if (parte === "manoIzquierda") partes.add("izquierda");
        else if (parte === "manoDerecha") partes.add("derecha");
        else if (parte === "pies") partes.add("pies");
    }
    return [...partes];
}

/** ¿Se pueden gastar? Las 4 a la vez (más que el máximo de 3) solo si no se ha gastado ninguna en el turno */
export function puedeGastarHechizo(pj, partes) {
    return partes.length > pj.numeroAcciones ? puedeGastarTodas(pj) && accionesUsadas(pj) === 0 : puedeGastarVarias(pj, partes);
}

export function gastarHechizo(pj, partes) {
    if (!puedeGastarHechizo(pj, partes)) return false;
    return partes.length > pj.numeroAcciones ? gastarTodas(pj) : gastarVarias(pj, partes);
}

/* Energía guardada en la mano (13-sacro.md §7) _____________________________________________ */

const fallo = (texto) => ({ ok: false, resumen: [texto] });

/**
 * Guarda en una mano los elementos de sus dedos. Gasta solo la boca y los PV de generar (el ambiente y los cristales
 * de donde salgan los descuenta quien llama). gastar(partes, descripcion) como en objetos.js.
 */
export function guardarEnMano(pj, mano, dedos, gastar) {
    if (!MANOS.includes(mano)) return fallo("Elige una mano.");
    if (dedos.some(dedo => parteDeDedo(dedo.id) !== mano)) return fallo("Solo se guardan los dedos de esa mano.");
    const motivo = motivoNoDedos(pj, dedos) || motivoNoGenerar(pj, dedos);
    if (motivo) return fallo(motivo);
    if (!gastar(["cabeza"], "Guardar energía en la mano")) return fallo("Sin acción de boca.");
    const coste = costeGenerar(pj, dedos);
    const antes = pj.vida;
    pj.vida -= coste;
    pj.energiaManos[mano] = {
        dedos: dedos.map(dedo => ({ elemento: dedo.elemento, puntos: Number.isFinite(dedo.puntos) ? dedo.puntos : null })),
        plays: 0
    };
    const resumen = [`Guarda ${describirEnergia(pj.energiaManos[mano])} en la ${mano === "manoIzquierda" ? "mano izquierda" : "mano derecha"}`];
    if (coste > 0) resumen.push(`Generar: −${coste} PV (${antes} → ${pj.vida})`);
    return { ok: true, resumen };
}

/** Daño de la energía de una mano por elemento (dannoElementos con el daño fijo de Metala) */
export const dannoEnergia = (pj, mano) => dannoElementos(pj, energiaEnMano(pj, mano)?.dedos ?? [], { enMano: true });

/**
 * Suma al golpe de un puñetazo la energía de esa mano (toda de golpe): cada elemento como una ficha de
 * golpe.elemental con su color (entradaDannoSacro). Marca el golpe como magia.
 * No vacía la mano (lo hace quien ataca, quitarEnergia).
 */
export function golpeConEnergia(pj, golpe, mano) {
    const energia = energiaEnMano(pj, mano);
    if (!energia) return golpe;
    // Cada elemento, una ficha de su color aparte del bonificador (las físicas se aplican como impactos aparte)
    golpe.elemental = [...(golpe.elemental ?? []), ...entradasDeDanno(dannoEnergia(pj, mano))];
    golpe.magia = true;
    golpe.notas = [...(golpe.notas ?? []), `Suelta la energía de la mano: ${describirEnergia(energia)}. Es magia.`];
    return golpe;
}

/** Golpes para ofrecer la energía de una mano (sin tirada ni bonificador CaC) */
export function golpesOfrecerEnergia(pj, mano) {
    const energia = energiaEnMano(pj, mano);
    return energia ? golpesDeElementos(dannoEnergia(pj, mano), `Energía: ${describirEnergia(energia)}`) : [];
}

/** Vacía la mano (tras soltar u ofrecer la energía) */
export function quitarEnergia(pj, mano) {
    if (pj.energiaManos) pj.energiaManos[mano] = null;
}

/* Escanear y quitar elementos (13-sacro.md §12) ________________________________________ */

/** Elementos que lleva encima un personaje: la energía de sus manos y, en un NPC, los que le ha puesto el máster
 *  (npc.energia). @returns [{ elemento, dedos }] */
export function energiaDe(pj) {
    const cuenta = new Map();
    for (const mano of MANOS) (pj?.energiaManos?.[mano]?.dedos ?? []).forEach(d => cuenta.set(d.elemento, (cuenta.get(d.elemento) ?? 0) + 1));
    if (pj?.esNpc) (pj.npc?.energia ?? []).forEach(a => cuenta.set(a.elemento, (cuenta.get(a.elemento) ?? 0) + a.dedos));
    return [...cuenta].filter(([, n]) => n > 0).map(([elemento, dedos]) => ({ elemento, dedos }));
}

/**
 * Quita un dedo de ese elemento a un personaje (sin tirada): primero de la energía de sus manos y, en un NPC, de los
 * que lleva cargados. Modifica el personaje. @returns {{ puntos: number|null }} o null si no lo tiene
 */
export function quitarElemento(pj, elemento) {
    for (const mano of MANOS) {
        const energia = pj?.energiaManos?.[mano];
        const i = energia?.dedos.findIndex(d => d.elemento === elemento) ?? -1;
        if (i < 0) continue;
        const [dedo] = energia.dedos.splice(i, 1);
        if (!energia.dedos.length) pj.energiaManos[mano] = null;
        return { puntos: Number.isFinite(dedo.puntos) ? dedo.puntos : null };
    }
    const cargado = pj?.esNpc ? pj.npc?.energia?.find(a => a.elemento === elemento && a.dedos > 0) : null;
    if (!cargado) return null;
    cargado.dedos--;
    pj.npc.energia = pj.npc.energia.filter(a => a.dedos > 0);
    return { puntos: null };
}

/* Transfusión de sangre (13-sacro.md §9) ________________________________________________ */

/** PV que se pueden transferir como mucho: 3 × Sacro (con modificadores) */
export const maxTransfusion = (pj) => 3 * Math.max(0, Math.floor(Number(pj?.getGenerico?.("sacro")) || 0));

/* Modalidades: quién pierde y quién recibe, y cuántas manos libres hacen falta (además de la boca) */
export const MODOS_TRANSFUSION = {
    aMi: { etiqueta: "Quitar PV a otro y dármelos", manos: 1, icono: "transfusionQuitar" },
    dar: { etiqueta: "Dar mis PV a otro", manos: 1, icono: "transfusionDar" },
    otro: { etiqueta: "Quitar PV a uno y dárselos a otro", manos: 2, icono: "transfusionOtro" }
};

/** PV por debajo de los que no deja a nadie una transfusión: 1 en zona segura o en la base (allí no se muere), 0 fuera */
export const minimoTransfusion = (pj) => (pj?.zona === "segura" || pj?.zona === "base" ? 1 : 0);
