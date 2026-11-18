// scripts/sacro.js
// Magia del Underworld (Sacro), sin DOM. Reglas en .claude/13-sacro.md.
// Cada punto de Sacro es un dedo (máximo 20: manos y pies) y cada dedo sostiene un elemento, que se genera con PV
// o se absorbe (ambiente, cristales elementales del cinturón, lo quitado a otro). El daño de cada dedo es el daño
// mágico × el multiplicador del elemento; los dedos con el mismo elemento suman y cada elemento hace su daño aparte.

import { TIPOS_DOS_MANOS, tipoArmaduraDe } from "./equipamiento.js";
import { MANOS, puedeGastarVarias, gastarVarias, puedeGastarTodas, gastarTodas, accionesUsadas } from "./turno.js";
import { cinturonesPuestos } from "./cinturon.js";

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

export { ELEMENTOS_SACRO, CLAVES_ELEMENTOS_SACRO, esElementoSacro, ELEMENTOS_CRISTAL, describirEnergia, PLAYS_ENERGIA, entradaDannoSacro, cargarHechizo, cargarAmbiente, TIPOS_HECHIZO, DANNO_FISICO, infoDannoMagia, esDannoMagia, redondearMagia } from "./elementosSacro.js";
import { ELEMENTOS_SACRO, esElementoSacro, ELEMENTOS_CRISTAL, describirEnergia, entradaDannoSacro, infoDannoMagia, redondearMagia, DANNO_FISICO } from "./elementosSacro.js";

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

/** ¿Lleva un arma a dos manos (en cualquiera de las dos ranuras)? */
export const conArmaDosManos = (pj) => MANOS.some(m => TIPOS_DOS_MANOS.includes(pj?.[m]?.tipo));

/** Mano libre para la magia: sin nada equipado y sin energía guardada. Con un arma a dos manos la derecha cuenta como
 *  libre (sus dedos sí; guardar energía en ella no: motivoNoGuardarEnMano) y la izquierda no. */
export function manoLibreMagia(pj, mano) {
    if (energiaEnMano(pj, mano)) return false;
    if (conArmaDosManos(pj)) return mano === "manoDerecha";
    return !pj[mano]?.tipo;
}

/** Por qué no se puede guardar energía en esa mano (null = se puede) */
export function motivoNoGuardarEnMano(pj, mano) {
    if (!MANOS.includes(mano)) return "Elige una mano.";
    if (conArmaDosManos(pj)) return "Con un arma a dos manos no se puede guardar energía en la mano.";
    return null;
}

/** PV por debajo de los que no deja a nadie la magia (generar, transfusión): 1 en zona segura o en la base (allí no
 *  se muere), 0 fuera */
export const minimoPV = (pj) => (pj?.zona === "segura" || pj?.zona === "base" ? 1 : 0);

/** Los pies solo con ropa o armadura real (sin armadura cuenta como ropa) */
export const piesUsables = (pj) => ARMADURAS_PIES.includes(tipoArmaduraDe(pj));

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
    const puntos = redondear2(Number(datos.puntos));
    if (datos.puntos !== null && datos.puntos !== undefined && Number.isFinite(puntos) && puntos >= 0) dedo.puntos = puntos;
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

/** Por qué no se pueden pagar los PV de generar (null = se puede): no se puede quedar por debajo de 0 (de 1 en zona
 *  segura o en la base, minimoPV) */
export function motivoNoGenerar(pj, dedos) {
    const coste = costeGenerar(pj, dedos);
    const minimo = minimoPV(pj);
    if (coste > 0 && (Number(pj.vida) || 0) - coste < minimo) {
        return minimo ? `Generar cuesta ${coste} PV y aquí no puedes bajar de ${minimo} PV (tienes ${pj.vida}).`
            : `Generar cuesta ${coste} PV y tienes ${pj.vida}.`;
    }
    return null;
}

/** Daño de un dedo sin redondear (el daño mágico tiene decimales; solo se redondea el resultado). Metala hace siempre su
 *  daño fijo (20 por dedo, sin contar la potencia); si no, los puntos que traiga (cristal, lo quitado) o el daño mágico ×
 *  el multiplicador del elemento. */
export function dannoDedo(pj, dedo) {
    const elemento = ELEMENTOS_SACRO[dedo?.elemento];
    if (!elemento) return 0;
    if (elemento.fijo) return elemento.fijo;
    if (Number.isFinite(dedo.puntos)) return dedo.puntos;
    return (Number(pj.dMagico) || 0) * elemento.multiplicador;
}

/* Decimales intermedios (puntos de un dedo): a dos cifras para no arrastrar restos de coma flotante */
export const redondear2 = (n) => Math.round(n * 100) / 100;

/** Lo que cabe en un dedo de un elemento al absorberlo de un cristal: el daño de ese elemento con un dedo */
export function maximoPorDedo(pj, elemento) {
    return redondearMagia(dannoDedo(pj, { elemento }));
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
    const bruto = redondearMagia(dannoDedo(pj, { elemento }) * Math.max(0, Math.floor(dedos)));
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

/**
 * Cristal al que va Llenar con estos dedos, de una lista de candidatos { objeto, ... }: uno donde quepa todo (primero
 * los vacíos, y de ellos el que menos hueco deja sin usar) y, si no cabe en ninguno, el que menos pierde.
 * @returns {{ candidato, anadido, perdido }} o null si ninguno admite el elemento
 */
export function cristalParaLlenar(pj, candidatos, elemento, dedos) {
    const bruto = redondearMagia(dannoDedo(pj, { elemento }) * Math.max(0, Math.floor(dedos)));
    const opciones = candidatos.filter(c => !motivoNoLlenar(c.objeto, elemento)).map(c => {
        const hueco = c.objeto.capacidad - (c.objeto.elemento?.puntos ?? 0);
        const anadido = Math.min(hueco, bruto);
        return { candidato: c, anadido, perdido: bruto - anadido, sobra: hueco - anadido, vacio: !c.objeto.elemento };
    });
    if (!opciones.length) return null;
    opciones.sort((a, b) => a.perdido - b.perdido
        || (a.perdido === 0 ? Number(b.vacio) - Number(a.vacio) || a.sobra - b.sobra : 0));
    const { candidato, anadido, perdido } = opciones[0];
    return { candidato, anadido, perdido };
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
export function dannoElementos(pj, dedos, { radio = 1, juntarPorTipo = false } = {}) {
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
        grupo.bruto += dannoDedo(pj, dedo);
        grupos.set(clave, grupo);
    }
    const factor = factorRadio(radio);
    return [...grupos.values()].map(({ elementos, bruto, ...grupo }) => ({
        ...grupo,
        etiqueta: grupo.etiqueta ?? [...elementos].join(" + "),
        cantidad: redondearMagia(bruto * factor)
    }));
}

/** Sugerencia para el máster: una fila { elemento, cantidad } por dedo, sin agrupar (cada una será un golpe) */
export function sugerenciaPorDedo(pj, dedos) {
    return dedos.filter(d => ELEMENTOS_SACRO[d.elemento]).map(d => {
        const bruto = redondear2(dannoDedo(pj, d));
        return { elemento: d.elemento, cantidad: redondearMagia(bruto), bruto };
    });
}

/* Clave de "mismo tipo de daño" (la Kristala, que atraviesa la armadura, no se junta con las otras físicas, ni estas con
   el físico normal, que reduce la armadura de una vez) */
const claveTipo = (elemento) => (elemento === DANNO_FISICO ? "fisico-normal" : `${ELEMENTOS_SACRO[elemento].tipoDanno}${ELEMENTOS_SACRO[elemento].ignoraArmadura ? "-ignora" : ""}`);

/**
 * Golpes que resuelve el máster a partir de sus filas [{ elemento (o DANNO_FISICO), cantidad, bruto?, estados }]: un golpe por fila;
 * juntarPorTipo suma las filas del mismo tipo de daño y unico lo junta todo en un golpe (sumando lo del mismo elemento). Se suma con decimales (bruto: el
 * daño sin redondear de la sugerencia, mientras el máster no cambie la cantidad) y el radio se aplica al final; el
 * resultado se redondea con redondearMagia (sube desde ,51). Un golpe lleva los estados si alguna de sus filas los lleva.
 * @returns [{ danno: [{ elemento, cantidad }], estados: boolean }]
 */
export function golpesDeFilas(filas, { juntarPorTipo = false, unico = false, radio = 1 } = {}) {
    let golpes = (Array.isArray(filas) ? filas : []).filter(f => infoDannoMagia(f?.elemento))
        .map(f => {
            const cantidad = Math.max(0, Number(Number.isFinite(Number(f.bruto)) ? f.bruto : f.cantidad) || 0);
            return { danno: [{ elemento: f.elemento, cantidad }], estados: Boolean(f.estados) };
        });
    if (juntarPorTipo) {
        const grupos = new Map();
        for (const g of golpes) {
            const clave = claveTipo(g.danno[0].elemento);
            const grupo = grupos.get(clave);
            if (grupo) {
                grupo.danno[0].cantidad += g.danno[0].cantidad;
                grupo.estados ||= g.estados;
            } else grupos.set(clave, { danno: [{ ...g.danno[0] }], estados: g.estados });
        }
        golpes = [...grupos.values()];
    }
    // Un único golpe: lo del mismo elemento se suma en una sola ficha (1,6 + 1,6 de Termika = 3,2 → 3)
    if (unico && golpes.length) {
        const porElemento = new Map();
        golpes.flatMap(g => g.danno).forEach(e => porElemento.set(e.elemento, (porElemento.get(e.elemento) ?? 0) + e.cantidad));
        golpes = [{ danno: [...porElemento].map(([elemento, cantidad]) => ({ elemento, cantidad })), estados: golpes.some(g => g.estados) }];
    }
    const factor = factorRadio(radio);
    return golpes.map(g => ({ ...g, danno: g.danno.map(e => ({ ...e, cantidad: redondearMagia(e.cantidad * factor) })) }))
        .filter(g => g.danno.some(e => e.cantidad > 0) || g.estados);
}

/**
 * Objetos que salen por defecto de "Crear objeto": un cristal elemental por dedo de Kristala, de capacidad el daño de
 * un dedo de Kristala, llenados por orden con los demás elementos (uno por cristal; lo que no cabe se pierde). Sin
 * Kristala y con Metala: un material de herrería con potencia = dedos de Metala. Si no, ninguno.
 * Devuelve objetos en bruto (quien llama los pasa por cargarObjeto).
 */
export function propuestaObjetos(pj, dedos) {
    const kristala = dedos.filter(d => d.elemento === "kristala");
    if (kristala.length) {
        const capacidad = Math.max(1, maximoPorDedo(pj, "kristala"));
        const puntos = new Map(); // elemento → puntos, en el orden en que aparecen
        for (const d of dedos.filter(x => x.elemento !== "kristala" && ELEMENTOS_CRISTAL.includes(x.elemento))) {
            puntos.set(d.elemento, (puntos.get(d.elemento) ?? 0) + dannoDedo(pj, d));
        }
        const llenos = [...puntos].map(([e, n]) => [e, redondearMagia(n)]).filter(([, n]) => n > 0);
        return kristala.map((_, i) => ({
            tipo: "arrojadiza", subtipo: "cristalElemental", nombre: "Cristal de Kristala", cantidad: 1, capacidad,
            descripcion: "Creado con magia de Kristala.",
            elemento: llenos[i] ? { clave: llenos[i][0], puntos: Math.min(capacidad, llenos[i][1]) } : null
        }));
    }
    const metala = dedos.filter(d => d.elemento === "metala").length;
    if (metala) {
        return [{ tipo: "material", subtipo: "herreria", nombre: "Lingote de Metala", cantidad: 1, potencia: metala,
            descripcion: "Metal creado con magia de Metala, para herrería o armería." }];
    }
    return [];
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
    const noMano = motivoNoGuardarEnMano(pj, mano);
    if (noMano) return fallo(noMano);
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
export const dannoEnergia = (pj, mano) => dannoElementos(pj, energiaEnMano(pj, mano)?.dedos ?? []);

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

/* Puntos de un dedo de energía en la mano de su dueño: los guardados o, si no, su daño con el daño mágico del dueño
   (Metala, su daño fijo). Así lo quitado conserva la potencia de quien lo generó. */
const puntosEnMano = (pj, dedo) => redondear2(dannoDedo(pj, dedo));

/* Cristales elementales llenos de los cinturones puestos: [{ ranura, indice, cristal }] */
const cristalesLlenos = (pj) => (pj?.accesorios ? cinturonesPuestos(pj) : []).flatMap(({ ranura, equipo }) => equipo.cinturon.objetos
    .map((cristal, indice) => ({ ranura, indice, cristal }))
    .filter(({ cristal }) => cristal?.subtipo === "cristalElemental" && cristal.elemento?.puntos > 0));

/** Elementos que lleva encima un personaje que se le pueden quitar, en este orden: la energía de sus manos, los
 *  cristales elementales llenos de sus cinturones (uno por dedo) y, en un NPC, los que le ha puesto el máster
 *  (npc.energia). puntos: los de cada dedo (null en los del NPC: se calculan con el daño mágico de quien los quita);
 *  origenes: "mano", "cinturon" o "npc" (lo de un cristal no pasa del daño de un dedo de quien lo quita).
 *  @returns [{ elemento, dedos, puntos: (number|null)[], origenes: string[] }] */
export function energiaDe(pj) {
    const cuenta = new Map();
    const anadir = (elemento, puntos, origen) => {
        const e = cuenta.get(elemento) ?? { elemento, dedos: 0, puntos: [], origenes: [] };
        e.dedos++;
        e.puntos.push(puntos);
        e.origenes.push(origen);
        cuenta.set(elemento, e);
    };
    for (const mano of MANOS) (pj?.energiaManos?.[mano]?.dedos ?? []).forEach(d => anadir(d.elemento, puntosEnMano(pj, d), "mano"));
    cristalesLlenos(pj).forEach(({ cristal }) => anadir(cristal.elemento.clave, cristal.elemento.puntos, "cinturon"));
    if (pj?.esNpc) (pj.npc?.energia ?? []).forEach(a => { for (let i = 0; i < a.dedos; i++) anadir(a.elemento, null, "npc"); });
    return [...cuenta.values()].filter(e => e.dedos > 0);
}

/**
 * Quita un dedo de ese elemento a un personaje (sin tirada), en el orden de energiaDe: la energía de sus manos, un
 * cristal elemental de su cinturón (queda vacío) y, en un NPC, lo que lleva cargado. Modifica el personaje.
 * @returns {{ puntos: number|null, mano?, ranura?, indice? }} o null si no lo tiene
 */
export function quitarElemento(pj, elemento) {
    for (const mano of MANOS) {
        const energia = pj?.energiaManos?.[mano];
        const i = energia?.dedos.findIndex(d => d.elemento === elemento) ?? -1;
        if (i < 0) continue;
        const puntos = puntosEnMano(pj, energia.dedos[i]);
        energia.dedos.splice(i, 1);
        if (!energia.dedos.length) pj.energiaManos[mano] = null;
        return { puntos, mano };
    }
    const lleno = cristalesLlenos(pj).find(({ cristal }) => cristal.elemento.clave === elemento);
    if (lleno) {
        const puntos = lleno.cristal.elemento.puntos;
        lleno.cristal.elemento = null;
        return { puntos, ranura: lleno.ranura, indice: lleno.indice };
    }
    const cargado = pj?.esNpc ? pj.npc?.energia?.find(a => a.elemento === elemento && a.dedos > 0) : null;
    if (!cargado) return null;
    cargado.dedos--;
    pj.npc.energia = pj.npc.energia.filter(a => a.dedos > 0);
    return { puntos: null };
}

/** ¿Tiene todos estos elementos (lista con repeticiones)? */
export function tieneElementos(pj, elementos) {
    const hay = new Map(energiaDe(pj).map(e => [e.elemento, e.dedos]));
    const pide = new Map();
    elementos.forEach(e => pide.set(e, (pide.get(e) ?? 0) + 1));
    return [...pide].every(([e, n]) => (hay.get(e) ?? 0) >= n);
}

/**
 * Quita varios elementos a la vez, todo o nada (al resolver una magia que los usa). Modifica el personaje.
 * @returns lo quitado [{ elemento, puntos, mano? }] (para devolverElementos) o null si le falta alguno
 */
export function quitarElementos(pj, elementos) {
    if (!tieneElementos(pj, elementos)) return null;
    return elementos.map(e => ({ elemento: e, ...quitarElemento(pj, e) }));
}

/** Deshace quitarElementos (si a otro dueño le faltaba lo suyo): vuelve a la mano de la que salió (hasta 5 dedos), al
 *  cristal del que salió (si sigue vacío) o, en un NPC, a lo que lleva cargado. Lo que no cabe se pierde. */
export function devolverElementos(pj, quitados) {
    for (const q of Array.isArray(quitados) ? quitados : []) {
        if (!esElementoSacro(q?.elemento)) continue;
        if (q.ranura !== undefined) {
            const cristal = cinturonesPuestos(pj).find(c => c.ranura === q.ranura)?.equipo.cinturon.objetos[q.indice];
            if (cristal?.subtipo === "cristalElemental" && !cristal.elemento && Number(q.puntos) > 0) {
                cristal.elemento = { clave: q.elemento, puntos: Math.min(cristal.capacidad, Math.floor(Number(q.puntos))) };
            }
        } else if (MANOS.includes(q.mano) && pj.energiaManos) {
            const energia = pj.energiaManos[q.mano] ?? (pj.energiaManos[q.mano] = { dedos: [], plays: 0 });
            if (energia.dedos.length < DEDOS_MANO) energia.dedos.push({ elemento: q.elemento, puntos: Number.isFinite(q.puntos) ? q.puntos : null });
        } else if (pj.esNpc && pj.npc) {
            const a = (pj.npc.energia ??= []).find(x => x.elemento === q.elemento);
            if (a) a.dedos++;
            else pj.npc.energia.push({ elemento: q.elemento, dedos: 1 });
        }
    }
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

/** PV por debajo de los que no deja a nadie una transfusión (= minimoPV) */
export const minimoTransfusion = minimoPV;
