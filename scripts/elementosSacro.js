// scripts/elementosSacro.js
// Elementos de la magia de Sacro (13-sacro.md §4). Sin imports: lo usan sacro.js y objetos.js (cristales elementales)
// sin crear un ciclo de módulos.

/**
 * Elementos de la magia:
 * - tipoDanno: el de estados.js con el que se aplica ("fisico" lo reduce la armadura salvo con ignoraArmadura).
 * - multiplicador: del daño mágico por dedo.
 * - coste: múltiplo del coste de generar (null = no se puede generar).
 * - fijo: daño por dedo que no depende del daño mágico (Metala guardado en la mano; en un hechizo lo pone el máster).
 * - enCristal: false si no se puede guardar en un cristal elemental.
 * - icono (iconos.js), color y colorGlifo: los del tipo de daño que hacen (los de TIPOS_DANNO de estados.js); los
 *   físicos tienen el suyo. textoDanno: qué daño hace, para los pop-ups ("fuego", "físico", "ignora armadura").
 */
export const ELEMENTOS_SACRO = {
    hela: { etiqueta: "Hela", que: "Luz", tipoDanno: "luz", multiplicador: 1, coste: 2,
        icono: "luz", color: "#F4C20D", colorGlifo: "#5A4500", textoDanno: "luz" },
    morna: { etiqueta: "Morna", que: "Oscuridad", tipoDanno: "oscuridad", multiplicador: 1, coste: null,
        icono: "oscuridad", color: "#2B1E3F", colorGlifo: "#C9B6F2", textoDanno: "oscuridad" },
    akva: { etiqueta: "Akva", que: "Agua", tipoDanno: "fisico", multiplicador: 1, coste: 1,
        icono: "akva", color: "#2E86C1", textoDanno: "físico" },
    kriogenia: { etiqueta: "Kriogenia", que: "Frío", tipoDanno: "hielo", multiplicador: 0.5, coste: 1,
        icono: "hielo", color: "#3A9AD9", textoDanno: "hielo" },
    termika: { etiqueta: "Termika", que: "Calor", tipoDanno: "fuego", multiplicador: 0.75, coste: 1,
        icono: "fuego", color: "#E25B12", textoDanno: "fuego" },
    kristala: { etiqueta: "Kristala", que: "Cristal", tipoDanno: "fisico", ignoraArmadura: true, multiplicador: 1, coste: 1, enCristal: false,
        icono: "cristal", color: "#48C9B0", colorGlifo: "#0E4D40", textoDanno: "ignora armadura" },
    metala: { etiqueta: "Metala", que: "Metal", tipoDanno: "fisico", multiplicador: 0, fijo: 20, coste: 10,
        icono: "metala", color: "#7F8C8D", textoDanno: "físico" }
};

/**
 * Daño de un elemento como entrada de golpe.elemental (el formato que pintan los pop-ups, htmlBloqueDanno, con su
 * color y "Termika · fuego"). Las físicas llevan tipo "fisico" (y ignoraArmadura la Kristala): recibirGolpe las
 * aplica como un impacto físico aparte.
 */
export function entradaDannoSacro(clave, cantidad) {
    const info = ELEMENTOS_SACRO[clave];
    return {
        tipo: info.tipoDanno, cantidad, etiqueta: `${info.etiqueta} · ${info.textoDanno}`,
        color: info.color, colorTexto: info.colorGlifo ?? "#FBFBFB",
        ...(info.ignoraArmadura ? { ignoraArmadura: true } : {}), sacro: clave
    };
}
export const CLAVES_ELEMENTOS_SACRO = Object.keys(ELEMENTOS_SACRO);
export const esElementoSacro = (clave) => Object.hasOwn(ELEMENTOS_SACRO, clave);

/* Elementos que se pueden guardar en un cristal elemental (Kristala no) */
export const ELEMENTOS_CRISTAL = CLAVES_ELEMENTOS_SACRO.filter(clave => ELEMENTOS_SACRO[clave].enCristal !== false);

/* Energía guardada en las manos (13-sacro.md §7) ______________________________________________
 * pj.energiaManos = { manoIzquierda, manoDerecha }, cada una null o { dedos: [{ elemento, puntos|null }], plays }.
 * puntos: los de un cristal elemental absorbido (null = se calcula con el daño mágico al soltarla).
 * plays: veces que se ha pulsado Play desde que se guardó; al segundo se pierde (avanzarEnergiaManos). */
export const MANOS_ENERGIA = ["manoIzquierda", "manoDerecha"];
export const PLAYS_ENERGIA = 2;
const MAX_DEDOS_MANO = 5;

export const energiaVacia = () => ({ manoIzquierda: null, manoDerecha: null });

function cargarEnergiaMano(datos) {
    const dedos = (Array.isArray(datos?.dedos) ? datos.dedos : []).slice(0, MAX_DEDOS_MANO)
        .filter(dedo => esElementoSacro(dedo?.elemento))
        .map(dedo => {
            const puntos = Math.floor(Number(dedo.puntos));
            return { elemento: dedo.elemento, puntos: dedo.puntos !== null && Number.isFinite(puntos) && puntos >= 0 ? puntos : null };
        });
    if (!dedos.length) return null;
    return { dedos, plays: Math.max(0, Math.min(PLAYS_ENERGIA, Math.floor(Number(datos.plays) || 0))) };
}

/** Normaliza pj.energiaManos guardado */
export function cargarEnergiaManos(datos) {
    return Object.fromEntries(MANOS_ENERGIA.map(mano => [mano, cargarEnergiaMano(datos?.[mano])]));
}

const ETIQUETA_MANO = { manoIzquierda: "mano izquierda", manoDerecha: "mano derecha" };

/** Al pulsar Play: la energía cuenta un turno más y se pierde al segundo. @returns {string[]} resumen */
export function avanzarEnergiaManos(pj) {
    const resumen = [];
    for (const mano of MANOS_ENERGIA) {
        const energia = pj.energiaManos?.[mano];
        if (!energia) continue;
        energia.plays++;
        if (energia.plays >= PLAYS_ENERGIA) {
            pj.energiaManos[mano] = null;
            resumen.push(`Se pierde la energía de la ${ETIQUETA_MANO[mano]}`);
        }
    }
    return resumen;
}

/** Descansos: se pierde toda la energía de las manos. @returns {string[]} resumen */
export function vaciarEnergiaManos(pj) {
    const resumen = [];
    for (const mano of MANOS_ENERGIA) {
        if (!pj.energiaManos?.[mano]) continue;
        pj.energiaManos[mano] = null;
        resumen.push(`Se pierde la energía de la ${ETIQUETA_MANO[mano]}`);
    }
    return resumen;
}

/** "Termika ×2, Hela" */
export function describirEnergia(energia) {
    const cuenta = new Map();
    (energia?.dedos ?? []).forEach(dedo => cuenta.set(dedo.elemento, (cuenta.get(dedo.elemento) ?? 0) + 1));
    return [...cuenta].map(([clave, n]) => `${ELEMENTOS_SACRO[clave].etiqueta}${n > 1 ? ` ×${n}` : ""}`).join(", ");
}

/* Petición de hechizo enviada al máster (13-sacro.md §6.4): pj.hechizo = null o
 * { id, dedos: [{ id, elemento, origen, fuente, puntos? }], forma, hora }. Se guarda con la ficha. */
const DEDO_VALIDO = /^(manoIzquierda-[0-4]|manoDerecha-[0-4]|pies-\d)$/;
const ORIGENES = ["generar", "ambiente", "cinturon", "quitado"];
export function cargarHechizo(datos) {
    if (!datos || typeof datos !== "object" || !Array.isArray(datos.dedos)) return null;
    const dedos = datos.dedos.slice(0, 20)
        .filter(d => DEDO_VALIDO.test(String(d?.id)) && esElementoSacro(d.elemento))
        .map(d => ({
            id: String(d.id), elemento: d.elemento, origen: ORIGENES.includes(d.origen) ? d.origen : "generar",
            fuente: String(d.fuente ?? "").slice(0, 40),
            ...(Number.isFinite(Number(d.puntos)) && d.puntos !== null && d.puntos !== undefined ? { puntos: Math.max(0, Math.floor(Number(d.puntos))) } : {})
        }));
    if (!dedos.length) return null;
    return { id: String(datos.id ?? "").slice(0, 60) || `h-${Date.now().toString(36)}`, dedos, forma: String(datos.forma ?? "").slice(0, 500), hora: Number(datos.hora) || 0 };
}

/* Ambiente que concede el máster para un hechizo (13-sacro.md §3.2): pj.ambienteSacro = [{ elemento, dedos }] (dedos que
 * se pueden absorber de cada elemento, 1–20). Vale solo para el siguiente hechizo; se guarda con la ficha. */
export function cargarAmbiente(datos) {
    return (Array.isArray(datos) ? datos : [])
        .filter(a => esElementoSacro(a?.elemento))
        .map(a => ({ elemento: a.elemento, dedos: Math.max(0, Math.min(20, Math.floor(Number(a.dedos) || 0))) }))
        .filter(a => a.dedos > 0)
        .filter((a, i, lista) => lista.findIndex(b => b.elemento === a.elemento) === i);
}
