// scripts/artes.js
// Artes: carga y normalización de los datos, requisitos, memoria de artes, equipar y usar.
// No toca el DOM. Los datos siguen data/artes.schema.json (el catálogo está en data/artes.json):
// así otro sistema (un backend, por ejemplo) puede leer las artes sin ejecutar este código.
//
// Ciclos de módulos: PJ.js importa este módulo y este importa zonas.js, objetos.js, ataque.js...
// Es seguro porque nada de lo importado se usa al cargarse, solo dentro de funciones.

import { ARMAS, TIPOS_DOS_MANOS, ELEMENTOS, cargarValoresElementales } from "./equipamiento.js";
import { MANOS, partesDeMano } from "./turno.js";
import { esZonaSegura, MOTIVOS_ZONA } from "./zonas.js";
import { gastarEstricto } from "./objetos.js";
import { calcularDannoAtaque, dannoElementalArma } from "./ataque.js";

export const VERSION_FORMATO_ARTES = 1;
export const URL_CATALOGO_ARTES = "./data/artes.json";

/* Grupos del catálogo, en el orden en que se muestran. "propia" = creada por el jugador. */
export const GRUPOS_ARTE = {
    cuchillo: "Cuchillo", lanza: "Lanza", estoque: "Estoque", espadon: "Espadón", espada: "Espada",
    hacha: "Hacha", martillo: "Martillo de guerra", escudo: "Escudo", profesion: "Profesión",
    atletismo: "Atletismo", percepcion: "Percepción", sigilo: "Sigilo", carisma: "Carisma", cultura: "Cultura",
    gritos: "Gritos (rocas dragón)", underworld: "Underworld (guardianes)", ocultas: "Artes ocultas", propia: "Propias"
};

/* Partes del cuerpo que puede gastar un arte activa ("ninguna" = no gasta acción) */
export const PARTES_USO_ARTE = {
    izquierda: "Brazo izquierdo", derecha: "Brazo derecho", cabeza: "Cabeza", pies: "Piernas", ninguna: "Ninguna"
};

export const TIPOS_REQUISITO = ["nivel", "caracteristica", "habilidad", "armadura", "arma", "escudo"];

export const ETIQUETAS_CARACTERISTICA = {
    fortaleza: "Fortaleza", reflejos: "Reflejos", voluntad: "Voluntad", inteligencia: "Inteligencia", aguante: "Aguante"
};
export const ETIQUETAS_HABILIDAD = {
    atletismo: "Atletismo", combate: "Combate", percepcion: "Percepción", subterfugio: "Sigilo",
    comunicacion: "Carisma", cultura: "Cultura", profesion: "Profesión", sacro: "Sacro"
};
export const ETIQUETAS_ARMADURA = { pesada: "Pesada", media: "Media", ligera: "Ligera", ropa: "Ropa", real: "Real" };

/* Carga y normalización ______________________________________________________ */

const entero = (valor, minimo = 0, porDefecto = 0) => {
    const numero = Math.floor(Number(valor));
    return Number.isFinite(numero) ? Math.max(minimo, numero) : porDefecto;
};
const texto = (valor) => String(valor ?? "");
const listaDe = (valor, validos) => (Array.isArray(valor) ? valor : []).map(String).filter(v => validos.includes(v));

let contadorIds = 0;
/** Id nuevo para una copia de un arte en la ficha (o para un arte propia) */
export function nuevoIdArte(base = "arte") {
    const raiz = texto(base).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "arte";
    return `${raiz}-${Date.now().toString(36)}${(contadorIds++).toString(36)}`;
}

/** Requisito normalizado, o null si no es válido */
export function cargarRequisito(datos) {
    if (!datos || typeof datos !== "object") return null;
    const alternativo = Boolean(datos.alternativo);
    switch (datos.tipo) {
        case "nivel":
            return { tipo: "nivel", valor: entero(datos.valor, 1, 1), alternativo };
        case "caracteristica":
            if (!ETIQUETAS_CARACTERISTICA[datos.clave]) return null;
            // El Aguante puede tener ,5 (Voluntad / 2)
            return { tipo: "caracteristica", clave: datos.clave, valor: Math.max(0, Number(datos.valor) || 0), alternativo };
        case "habilidad":
            if (!ETIQUETAS_HABILIDAD[datos.clave]) return null;
            return { tipo: "habilidad", clave: datos.clave, valor: entero(datos.valor), alternativo };
        case "armadura": {
            const tipos = listaDe(datos.tipos, Object.keys(ETIQUETAS_ARMADURA));
            return tipos.length ? { tipo: "armadura", tipos, alternativo } : null;
        }
        case "arma": {
            const tipos = listaDe(datos.tipos, Object.keys(ARMAS));
            return tipos.length ? { tipo: "arma", tipos, ambasManos: Boolean(datos.ambasManos), alternativo } : null;
        }
        case "escudo": {
            const tipos = listaDe(datos.tipos, ["escudo", "gran_escudo"]);
            return tipos.length ? { tipo: "escudo", tipos, alternativo } : null;
        }
        default:
            return null;
    }
}

/** Uso de un arte activa; por defecto no gasta acción */
export function cargarUso(datos) {
    if (datos?.tipo === "arma") {
        const armas = listaDe(datos.armas, Object.keys(ARMAS));
        if (armas.length) return { tipo: "arma", armas, ambasManos: Boolean(datos.ambasManos) };
    }
    const parte = PARTES_USO_ARTE[datos?.parte] ? datos.parte : "ninguna";
    return { tipo: "parte", parte };
}

/**
 * Arte normalizada (catálogo o ficha). Solo guarda los campos de su tipo:
 * las pasivas, modificadores; las activas, coste, uso y daño.
 */
export function cargarArte(datos = {}) {
    const tipo = datos.tipo === "pasiva" ? "pasiva" : "activa";
    const arte = {
        id: /^[a-z0-9-]+$/.test(texto(datos.id)) ? datos.id : nuevoIdArte(datos.nombre),
        idCatalogo: datos.idCatalogo ? texto(datos.idCatalogo) : null,
        equipada: Boolean(datos.equipada),
        nombre: texto(datos.nombre).trim() || "Arte sin nombre",
        tipo,
        grupo: GRUPOS_ARTE[datos.grupo] ? datos.grupo : "propia",
        etiquetas: (Array.isArray(datos.etiquetas) ? datos.etiquetas : []).map(texto).filter(Boolean),
        descripcion: texto(datos.descripcion),
        ranuras: entero(datos.ranuras, 1, 1),
        requisitos: (Array.isArray(datos.requisitos) ? datos.requisitos : []).map(cargarRequisito).filter(Boolean),
        notaRequisitos: texto(datos.notaRequisitos)
    };
    if (tipo === "pasiva") {
        arte.modificadores = (Array.isArray(datos.modificadores) ? datos.modificadores : [])
            .filter(mod => mod && mod.modificado)
            .map(mod => ({ modificado: texto(mod.modificado), numero: Math.trunc(Number(mod.numero) || 0) }));
    } else {
        Object.assign(arte, {
            costePA: entero(datos.costePA, 0, 1),
            combo: Boolean(datos.combo),
            uso: cargarUso(datos.uso),
            danno: entero(datos.danno),
            dannoElemental: cargarValoresElementales(datos.dannoElemental),
            golpes: entero(datos.golpes, 1, 1), // ataques separados que hace al usarla

            haceDanno: datos.haceDanno !== false
        });
    }
    return arte;
}

/** Artes de la ficha (lista guardada) */
export function cargarArtes(lista) {
    return Array.isArray(lista) ? lista.map(cargarArte) : [];
}

/* Catálogo ____________________________________________________________________ */

/** Catálogo a partir del JSON de data/artes.json. Las artes conservan su id del catálogo. */
export function cargarCatalogo(json) {
    if (json?.version !== VERSION_FORMATO_ARTES) {
        console.warn(`Catálogo de artes con versión ${json?.version}; se esperaba ${VERSION_FORMATO_ARTES}.`);
    }
    return (Array.isArray(json?.artes) ? json.artes : [])
        .map(arte => cargarArte({ ...arte, idCatalogo: null, equipada: false }));
}

/** Descarga el catálogo (necesita servidor: con file:// fetch falla) */
export async function descargarCatalogo(url = URL_CATALOGO_ARTES) {
    const respuesta = await fetch(url);
    if (!respuesta.ok) throw new Error(`No se pudo cargar ${url} (${respuesta.status})`);
    return cargarCatalogo(await respuesta.json());
}

/** Copia de un arte del catálogo para la ficha: id propio, idCatalogo = id original, sin equipar */
export function copiarDelCatalogo(arteCatalogo) {
    const copia = JSON.parse(JSON.stringify(arteCatalogo));
    return cargarArte({ ...copia, id: nuevoIdArte(arteCatalogo.id), idCatalogo: arteCatalogo.id, equipada: false });
}

/* Desbloqueos de arte _________________________________________________________
   Conseguir un arte (del catálogo o creada) cuesta un desbloqueo. Se consiguen de forma natural
   con el nivel y se pueden sumar o quitar a mano (otras fuentes), como el Cor.
   Disponibles = naturales (por nivel) + extra (a mano) − gastados. Así, si el nivel sube o baja,
   los naturales se recalculan solos. */

export const COSTE_DESBLOQUEO_ARTE = 1;

/** Naturales por nivel: uno en el 16, 31, 46 y 61; desde el 61, uno cada 5 niveles (66, 71...) */
export function desbloqueosNaturales(nivel) {
    const n = Number(nivel) || 0;
    if (n >= 61) return 4 + Math.floor((n - 61) / 5);
    if (n >= 16) return Math.floor((n - 1) / 15);
    return 0;
}

export function desbloqueosDisponibles(pj) {
    return desbloqueosNaturales(pj.nivel) + (Number(pj.desbloqueosArteExtra) || 0) - (Number(pj.desbloqueosArteGastados) || 0);
}

const cantidadDesbloqueos = (cantidad) => Math.floor(Number(cantidad) || 0);

export function anadirDesbloqueos(pj, cantidad) {
    const n = cantidadDesbloqueos(cantidad);
    if (n <= 0) return { ok: false, resumen: ["Indica una cantidad mayor que 0."] };
    pj.desbloqueosArteExtra = (Number(pj.desbloqueosArteExtra) || 0) + n;
    return { ok: true, resumen: [`+${n} desbloqueo${n === 1 ? "" : "s"} de arte`, `Disponibles: ${desbloqueosDisponibles(pj)}`] };
}

/** Quita desbloqueos; si no hay bastantes no quita nada (nunca quedan en negativo) */
export function quitarDesbloqueos(pj, cantidad) {
    const n = cantidadDesbloqueos(cantidad);
    if (n <= 0) return { ok: false, resumen: ["Indica una cantidad mayor que 0."] };
    const disponibles = desbloqueosDisponibles(pj);
    if (n > disponibles) return { ok: false, resumen: [`No tienes suficientes desbloqueos de arte (tienes ${Math.max(0, disponibles)}).`] };
    pj.desbloqueosArteExtra = (Number(pj.desbloqueosArteExtra) || 0) - n;
    return { ok: true, resumen: [`−${n} desbloqueo${n === 1 ? "" : "s"} de arte`, `Disponibles: ${desbloqueosDisponibles(pj)}`] };
}

/** Motivo por el que no se puede conseguir un arte nueva, o null */
export function motivoNoConseguirArte(pj) {
    return desbloqueosDisponibles(pj) < COSTE_DESBLOQUEO_ARTE ? "No te quedan desbloqueos de arte." : null;
}

/** Añade un arte nueva a las sin equipar gastando un desbloqueo */
export function conseguirArte(pj, arte) {
    const motivo = motivoNoConseguirArte(pj);
    if (motivo) return { ok: false, resumen: [motivo] };
    pj.desbloqueosArteGastados = (Number(pj.desbloqueosArteGastados) || 0) + COSTE_DESBLOQUEO_ARTE;
    pj.artes.push(arte);
    return { ok: true, resumen: [`${arte.nombre} está en las artes sin equipar.`, `Desbloqueos de arte: ${desbloqueosDisponibles(pj)}`] };
}

/* Requisitos ___________________________________________________________________ */
// Las características y habilidades se comparan con su valor base (sin modificadores).
// Así los modificadores de las propias artes no pueden activar ni desactivar otras.

const tiposEnManos = (pj) => MANOS.map(mano => pj[mano]?.tipo).filter(Boolean);
const etiquetaArma = (tipo) => ARMAS[tipo]?.etiqueta ?? tipo;
const unirConO = (lista) => lista.length > 1 ? `${lista.slice(0, -1).join(", ")} o ${lista.at(-1)}` : lista[0] ?? "";

/** Valor base que compara un requisito de característica o habilidad */
function valorBase(pj, req) {
    if (req.tipo === "nivel") return Number(pj.nivel) || 0;
    if (req.clave === "aguante") return (Number(pj.fortaleza) || 0) + (Number(pj.voluntad) || 0) / 2;
    return Number(pj[req.clave]) || 0;
}

/** Texto legible de un requisito, p. ej. "Combate 8", "Espada en las dos manos" */
export function textoRequisito(req) {
    switch (req.tipo) {
        case "nivel": return `Nivel ${req.valor}`;
        case "caracteristica": return `${ETIQUETAS_CARACTERISTICA[req.clave]} ${req.valor}`;
        case "habilidad": return `${ETIQUETAS_HABILIDAD[req.clave]} ${req.valor}`;
        case "armadura": return `Armadura ${unirConO(req.tipos.map(t => ETIQUETAS_ARMADURA[t].toLowerCase()))}`;
        case "arma": return `${unirConO(req.tipos.map(etiquetaArma))}${req.ambasManos ? " en las dos manos" : ""}`;
        case "escudo": return unirConO(req.tipos.map(etiquetaArma));
        default: return req.tipo;
    }
}

/** @returns {boolean} si el personaje cumple ese requisito */
export function cumpleRequisito(pj, req) {
    switch (req.tipo) {
        case "nivel":
        case "caracteristica":
        case "habilidad":
            return valorBase(pj, req) >= req.valor;
        case "armadura":
            return req.tipos.includes(pj.equipoArmadura?.tipo);
        case "arma":
            return req.ambasManos
                ? MANOS.every(mano => req.tipos.includes(pj[mano]?.tipo))
                : tiposEnManos(pj).some(tipo => req.tipos.includes(tipo));
        case "escudo":
            return tiposEnManos(pj).some(tipo => req.tipos.includes(tipo));
        default:
            return false;
    }
}

/**
 * Estado de los requisitos de un arte: cumple todos los obligatorios y, si hay alternativos,
 * al menos uno de ellos.
 * @returns {{ cumple: boolean, obligatorios: {req, ok, texto}[], alternativos: {req, ok, texto}[] }}
 */
export function estadoRequisitos(pj, arte) {
    const evaluar = (req) => ({ req, ok: cumpleRequisito(pj, req), texto: textoRequisito(req) });
    const obligatorios = arte.requisitos.filter(req => !req.alternativo).map(evaluar);
    const alternativos = arte.requisitos.filter(req => req.alternativo).map(evaluar);
    const cumple = obligatorios.every(r => r.ok) && (alternativos.length === 0 || alternativos.some(r => r.ok));
    return { cumple, obligatorios, alternativos };
}

export function cumpleRequisitos(pj, arte) {
    return estadoRequisitos(pj, arte).cumple;
}

/** Por qué no se cumplen los requisitos, o null */
export function motivoRequisitos(pj, arte) {
    const { cumple, obligatorios, alternativos } = estadoRequisitos(pj, arte);
    if (cumple) return null;
    const faltan = obligatorios.filter(r => !r.ok).map(r => r.texto);
    if (alternativos.length && !alternativos.some(r => r.ok)) faltan.push(`uno de: ${unirConO(alternativos.map(r => r.texto))}`);
    return `Requisitos no cumplidos: ${faltan.join(", ")}`;
}

/** Un arte equipada está activa si cumple sus requisitos; si no, queda inactiva pero sigue equipada */
export function arteActiva(pj, arte) {
    return Boolean(arte?.equipada) && cumpleRequisitos(pj, arte);
}

/** Modificadores que aportan las artes pasivas equipadas y activas a un atributo (lo usa PJ.getModificador) */
export function modificadorArtes(pj, atributo) {
    return (pj.artes || [])
        .filter(arte => arte.tipo === "pasiva" && arteActiva(pj, arte))
        .reduce((suma, arte) => suma + arte.modificadores
            .reduce((s, mod) => s + (mod.modificado === atributo ? Number(mod.numero) || 0 : 0), 0), 0);
}

/* Memoria de artes: equipar y desequipar _______________________________________ */

export function artesEquipadas(pj) {
    return (pj.artes || []).filter(arte => arte.equipada);
}

export function ranurasUsadas(pj) {
    return artesEquipadas(pj).reduce((suma, arte) => suma + arte.ranuras, 0);
}

export function ranurasLibres(pj) {
    return (Number(pj.espaciosArte) || 0) - ranurasUsadas(pj);
}

export function motivoNoEquiparArte(pj, arte) {
    if (arte.equipada) return "Ya está equipada.";
    const requisitos = motivoRequisitos(pj, arte);
    if (requisitos) return requisitos + ".";
    const libres = ranurasLibres(pj);
    if (arte.ranuras > libres) {
        return `No queda memoria de artes: ocupa ${arte.ranuras} y ${libres === 1 ? "queda 1 libre" : `quedan ${Math.max(0, libres)} libres`}.`;
    }
    if (!esZonaSegura(pj)) return MOTIVOS_ZONA.artes + ".";
    return null;
}

/**
 * Si las artes equipadas ocupan más memoria de la que hay (p. ej. al bajar Cultura o nivel),
 * desequipa la última equipada hasta que quepan. No depende de la zona: es forzoso.
 * @returns {object[]} las artes desequipadas (vacío si cabían)
 */
export function ajustarMemoriaArtes(pj) {
    const desequipadas = [];
    // Desequipar una pasiva puede quitar memoria (modificador "espacios"): se recalcula cada vez
    while (ranurasUsadas(pj) > (Number(pj.espaciosArte) || 0)) {
        const ultima = artesEquipadas(pj).at(-1);
        if (!ultima) break;
        ultima.equipada = false;
        desequipadas.push(ultima);
        pj.calcularCaracteristicas();
    }
    return desequipadas;
}

export function motivoNoDesequiparArte(pj, arte) {
    if (!arte.equipada) return "No está equipada.";
    if (!esZonaSegura(pj)) return MOTIVOS_ZONA.artes + ".";
    return null;
}

export function equiparArte(pj, arte) {
    const motivo = motivoNoEquiparArte(pj, arte);
    if (motivo) return { ok: false, resumen: [motivo] };
    arte.equipada = true;
    // Al final de la lista: las equipadas quedan en orden de equipado (la última es la primera
    // que se desequipa si falta memoria, ver ajustarMemoriaArtes)
    const indice = pj.artes.indexOf(arte);
    if (indice !== -1) pj.artes.push(...pj.artes.splice(indice, 1));
    pj.calcularCaracteristicas(); // los modificadores de las pasivas cuentan desde ya
    return { ok: true, resumen: [`${arte.nombre} equipada (memoria ${ranurasUsadas(pj)} / ${pj.espaciosArte})`] };
}

export function desequiparArte(pj, arte) {
    const motivo = motivoNoDesequiparArte(pj, arte);
    if (motivo) return { ok: false, resumen: [motivo] };
    arte.equipada = false;
    pj.calcularCaracteristicas();
    return { ok: true, resumen: [`${arte.nombre} guardada en las artes sin equipar`] };
}

/* Usar un arte activa __________________________________________________________ */

/** Mano con la que se usa un arte de arma (null si no hay arma de esos tipos) */
export function manoDeArte(pj, arte) {
    if (arte.uso?.tipo !== "arma") return null;
    if (arte.uso.ambasManos) {
        return MANOS.every(mano => arte.uso.armas.includes(pj[mano]?.tipo)) ? "manoDerecha" : null;
    }
    return MANOS.find(mano => arte.uso.armas.includes(pj[mano]?.tipo)) ?? null;
}

/** Acciones que gasta: ninguna si es combo o no usa parte; la de su parte; o la del brazo del arma
    (los dos si el arma es a dos manos o el arte usa las dos manos) */
export function partesDeArte(pj, arte) {
    if (arte.combo) return [];
    if (arte.uso.tipo === "parte") return arte.uso.parte === "ninguna" ? [] : [arte.uso.parte];
    const mano = manoDeArte(pj, arte);
    if (!mano) return [];
    if (arte.uso.ambasManos) return ["izquierda", "derecha"];
    return partesDeMano(mano, TIPOS_DOS_MANOS.includes(pj[mano]?.tipo));
}

export function motivoNoUsarArte(pj, arte) {
    if (arte.tipo === "pasiva") return "Las artes pasivas no se usan: su efecto está siempre activo.";
    if (!arte.equipada) return "Equípala para poder usarla.";
    const requisitos = motivoRequisitos(pj, arte);
    if (requisitos) return `Inactiva. ${requisitos}.`;
    if (arte.uso.tipo === "arma" && !manoDeArte(pj, arte)) {
        return `Necesitas ${unirConO(arte.uso.armas.map(etiquetaArma))}${arte.uso.ambasManos ? " en las dos manos" : " equipado"}.`;
    }
    if ((Number(pj.puntosArte) || 0) < arte.costePA) return `Faltan PA: cuesta ${arte.costePA} y tienes ${pj.puntosArte}.`;
    return null;
}

/** Suma dos listas de daño elemental [{ tipo, cantidad, ... }] por elemento */
function sumarElementales(...listas) {
    const total = cargarValoresElementales();
    listas.flat().forEach(({ tipo, cantidad }) => { total[tipo] += cantidad; });
    return dannoElementalArma({ dannoElemental: total });
}

/**
 * Mano de cada golpe: la del arma; si el arte usa las dos manos, los golpes alternan
 * entre la derecha y la izquierda (Tajo X: un golpe con cada arma).
 */
function manosDeGolpes(pj, arte, mano) {
    if (!mano) return Array(arte.golpes).fill(null);
    if (!arte.uso.ambasManos) return Array(arte.golpes).fill(mano);
    return Array.from({ length: arte.golpes }, (_, i) => (i % 2 === 0 ? "manoDerecha" : "manoIzquierda"));
}

/**
 * Daño de un arte, sin tirar dados: una entrada por golpe, o null si no hace daño.
 * Cada golpe: { etiqueta, total, desglose, notas, elemental }.
 * - Con arma: daño del arma + bonificador CaC (como un ataque sin crítico) + daño del arte,
 *   y el daño elemental del arma más el del arte. La poción aplicada solo cuenta en el primer
 *   golpe de esa arma.
 * - Sin arma: solo el daño (y el daño elemental) del arte.
 */
export function calcularDannoArte(pj, arte, mano = manoDeArte(pj, arte)) {
    if (arte.tipo !== "activa" || !arte.haceDanno) return null;
    const elementalArte = dannoElementalArma(arte);
    const conPocion = new Set();

    const golpes = manosDeGolpes(pj, arte, mano).map((manoGolpe, i) => {
        const prefijo = arte.golpes > 1 ? `Golpe ${i + 1}` : "";
        if (!manoGolpe) {
            return {
                etiqueta: prefijo, total: arte.danno, notas: [], elemental: elementalArte,
                desglose: arte.danno > 0 ? [`${arte.danno} (Arte)`] : []
            };
        }
        let item = pj[manoGolpe];
        if (conPocion.has(manoGolpe)) item = { ...item, pocionAplicada: null };
        else if (item?.pocionAplicada) conPocion.add(manoGolpe);
        const ataque = calcularDannoAtaque(pj, item, false);
        const nombreArma = item?.nombre?.trim() || ARMAS[item?.tipo]?.etiqueta || "";
        return {
            etiqueta: [prefijo, arte.uso.ambasManos ? nombreArma : ""].filter(Boolean).join(" · "),
            total: ataque.total + arte.danno,
            desglose: arte.danno > 0 ? [...ataque.desglose, `${arte.danno} (Arte)`] : ataque.desglose,
            notas: ataque.notas,
            elemental: sumarElementales(ataque.elemental, elementalArte)
        };
    });

    if (golpes.every(golpe => golpe.total <= 0 && golpe.elemental.length === 0)) return null;
    return golpes;
}

/**
 * Usa un arte activa: gasta las acciones (gastar(partes, descripcion), como los objetos) y los PA.
 * @returns {{ ok: boolean, resumen: string[], danno?: object[]|null, arte?: object }} danno: un elemento por golpe
 */
export function usarArte(pj, arte, gastar = gastarEstricto(pj)) {
    const motivo = motivoNoUsarArte(pj, arte);
    if (motivo) return { ok: false, resumen: [motivo] };

    const partes = partesDeArte(pj, arte);
    if (partes.length && !gastar(partes, `Usar ${arte.nombre}`)) return { ok: false, resumen: ["Sin acciones para usarla."] };

    const mano = manoDeArte(pj, arte);
    const danno = calcularDannoArte(pj, arte, mano);
    // Como en un ataque normal, la poción aplicada a cada arma usada se gasta en su primer golpe
    if (danno) new Set(manosDeGolpes(pj, arte, mano)).forEach(m => { if (m && pj[m]?.pocionAplicada) pj[m].pocionAplicada = null; });

    pj.puntosArte = Math.max(0, (Number(pj.puntosArte) || 0) - arte.costePA);
    const resumen = [arte.descripcion.trim() || "(El arte no tiene descripción)"];
    if (arte.costePA > 0) resumen.push(`−${arte.costePA} PA (quedan ${pj.puntosArte})`);
    if (arte.combo) resumen.push("Combo: no gasta acción");
    return { ok: true, resumen, danno, arte };
}
