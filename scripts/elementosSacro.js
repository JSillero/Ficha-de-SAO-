// scripts/elementosSacro.js
// Elementos de la magia de Sacro (13-sacro.md §4). Sin imports: lo usan sacro.js y objetos.js (cristales elementales)
// sin crear un ciclo de módulos.

/**
 * Elementos de la magia:
 * - tipoDanno: el de estados.js con el que se aplica ("fisico" lo reduce la armadura salvo con ignoraArmadura).
 * - multiplicador: del daño mágico por dedo.
 * - coste: múltiplo del coste de generar (null = no se puede generar).
 * - fijo: daño por dedo que no depende del daño mágico ni de la potencia (Metala: 20 por dedo, guardada, en un hechizo
 *   o recogida de un cristal; un cristal de Metala lanzado hace 20).
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

/* Daño físico normal que el máster puede poner en un golpe de magia (no es un elemento): va en golpe.total, como el
   de un arma, y lo reduce la armadura */
export const DANNO_FISICO = "fisico";
const INFO_FISICO = { etiqueta: "Físico", que: "Físico", tipoDanno: "fisico", textoDanno: "lo reduce la armadura", icono: "fisico", color: "#5a5a5a" };
/** Datos de un tipo de daño de la magia: un elemento o el físico normal (null si no existe) */
export const infoDannoMagia = (clave) => (clave === DANNO_FISICO ? INFO_FISICO : ELEMENTOS_SACRO[clave] ?? null);
export const esDannoMagia = (clave) => clave === DANNO_FISICO || esElementoSacro(clave);
/** Ficha de color de un daño de la magia para pintarla (resúmenes): { cantidad, etiqueta, color, colorTexto } */
export const fichaDannoMagia = (clave, cantidad) => (clave === DANNO_FISICO
    ? { cantidad, etiqueta: "Físico", color: INFO_FISICO.color, colorTexto: "#FBFBFB" }
    : entradaDannoSacro(clave, cantidad));

/** Resultado de la magia: entero; los decimales suben a partir de ,51 (1,5 → 1; 1,51 → 2) */
export const redondearMagia = (n) => Math.max(0, Math.floor(Math.round((Number(n) || 0) * 100) / 100 + 0.49 + 1e-9));

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
            const puntos = Math.round(Number(dedo.puntos) * 100) / 100; // con decimales: solo se redondea el resultado
            return { elemento: dedo.elemento, puntos: dedo.puntos !== null && dedo.puntos !== undefined && Number.isFinite(puntos) && puntos >= 0 ? puntos : null };
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

/* Tipos de petición al máster: hacer daño, crear un objeto con los elementos o cambiar el escenario */
export const TIPOS_HECHIZO = {
    danno: { etiqueta: "Daño", icono: "combate", ayuda: "Hacer daño" },
    objeto: { etiqueta: "Objeto", icono: "cristalElemental", ayuda: "Crear un objeto con los elementos" },
    escenario: { etiqueta: "Escenario", icono: "mapa", ayuda: "Cambiar el escenario" }
};

/* Petición de hechizo enviada al máster (13-sacro.md §6.4): pj.hechizo = null o
 * { id, tipo, dedos: [{ id, elemento, origen, fuente, puntos? }], forma (puede ir vacía), hora }. Se guarda con la ficha. */
const DEDO_VALIDO = /^(manoIzquierda-[0-4]|manoDerecha-[0-4]|pies-\d)$/;
const ORIGENES = ["generar", "ambiente", "cinturon", "quitado"];
export function cargarHechizo(datos) {
    if (!datos || typeof datos !== "object" || !Array.isArray(datos.dedos)) return null;
    const dedos = datos.dedos.slice(0, 20)
        .filter(d => DEDO_VALIDO.test(String(d?.id)) && esElementoSacro(d.elemento))
        .map(d => ({
            id: String(d.id), elemento: d.elemento, origen: ORIGENES.includes(d.origen) ? d.origen : "generar",
            fuente: String(d.fuente ?? "").slice(0, 40),
            ...(Number.isFinite(Number(d.puntos)) && d.puntos !== null && d.puntos !== undefined ? { puntos: Math.max(0, Math.round(Number(d.puntos) * 100) / 100) } : {})
        }));
    if (!dedos.length) return null;
    return {
        id: String(datos.id ?? "").slice(0, 60) || `h-${Date.now().toString(36)}`,
        tipo: Object.hasOwn(TIPOS_HECHIZO, datos.tipo) ? datos.tipo : "danno",
        dedos, forma: String(datos.forma ?? "").slice(0, 500), hora: Number(datos.hora) || 0
    };
}

/* Magia resuelta con varios golpes que el jugador lanza uno a uno (ventana #modalGolpesMagia de interfazSacro.js):
 * pj.magiaPendiente = null o { id, forma, radio, tirada: { caracteristica, habilidad, dado } | null, nota,
 * estados (los de una poción, se vuelven a validar al lanzar), golpes: [{ danno: [{ elemento, cantidad }], estados,
 * lanzado }] }. Se guarda con la ficha para poder seguir después de cerrar la ventana o recargar. */
export function cargarMagiaPendiente(datos) {
    if (!datos || typeof datos !== "object" || !Array.isArray(datos.golpes)) return null;
    const entero = (v, max = 999) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
    const golpes = datos.golpes.slice(0, 20).map(g => ({
        danno: (Array.isArray(g?.danno) ? g.danno : []).filter(f => esDannoMagia(f?.elemento))
            .map(f => ({ elemento: f.elemento, cantidad: entero(f.cantidad) })).slice(0, 20),
        estados: g?.estados === true,
        lanzado: g?.lanzado === true
    }));
    if (!golpes.some(g => !g.lanzado)) return null;
    const t = datos.tirada;
    return {
        id: String(datos.id ?? "").slice(0, 60),
        forma: String(datos.forma ?? "").slice(0, 500),
        radio: Math.max(1, Math.min(5, entero(datos.radio) || 1)),
        tirada: t && typeof t.caracteristica === "string" && typeof t.habilidad === "string"
            ? { caracteristica: t.caracteristica.slice(0, 20), habilidad: t.habilidad.slice(0, 20), dado: entero(t.dado, 2) } : null,
        nota: String(datos.nota ?? "").slice(0, 300),
        estados: (Array.isArray(datos.estados) ? datos.estados : []).slice(0, 10).filter(e => e && typeof e === "object")
            .map(e => ({ clave: String(e.clave ?? "").slice(0, 30), valor: Number(e.valor) || 0, turnos: Number(e.turnos) || 0, quitar: e.quitar === true })),
        golpes
    };
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
