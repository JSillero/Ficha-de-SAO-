// scripts/objetos.js
// Objetos del inventario y del baúl: tipos, apilado, carga y usos (06-equipo-y-objetos.md §5 y §6).
// No toca el DOM: recibe el personaje, lo modifica y devuelve lo que ha pasado.

import Modificador, { cargarModificador, TURNOS_PERMANENTE } from "./modificador.js";
import Equipamiento, { ARMAS, TIPOS_DOS_MANOS, TIPOS_ARMADURA, TIPO_ACCESORIO, TIPO_RELIQUIA, cargarEquipamiento } from "./equipamiento.js";
import { activarEstado, quitarEstado, ESTADOS_INFO, TIPOS_DANNO } from "./estados.js";
import { MANOS, gastarVarias, gastarTodas, partesDeMano, parteDeMano, manoVacia, puedeGastar } from "./turno.js";
import { esZonaSegura } from "./zonas.js";

/* Huecos base del inventario: 10 objetos distintos apilables */
export const TAMANO_INVENTARIO = 10;
/* Unidades por hueco en el inventario. El baúl no tiene límite de huecos ni de pila. */
export const MAX_PILA_INVENTARIO = 5;

/* Tipos de objeto: etiqueta e icono (iconos.js) */
export const TIPOS_OBJETO = {
    comida: { etiqueta: "Comida", icono: "comida" },
    pocion: { etiqueta: "Poción", icono: "pocion" },
    equipo: { etiqueta: "Equipamiento", icono: "equipo" },
    cristal: { etiqueta: "Cristal", icono: "cristal" },
    material: { etiqueta: "Material", icono: "material" },
    arrojadiza: { etiqueta: "Arma arrojadiza", icono: "arrojadiza" }
};

/* Daños elementales que puede llevar una arrojadiza (claves de TIPOS_DANNO) */
export const ELEMENTOS_ARROJADIZA = ["fuego", "electricidad", "hielo", "luz", "oscuridad", "hemorragia"];

export function crearInventarioVacio(tamano = TAMANO_INVENTARIO) {
    return Array.from({ length: tamano }, () => null);
}

/* Carga y normalización ______________________________________________________ */

function cargarEstadoObjeto(datos) {
    if (!datos?.clave || !ESTADOS_INFO[datos.clave]) return null;
    const turnos = Number(datos.turnos);
    return {
        clave: datos.clave,
        valor: Math.max(0, Number(datos.valor) || 0),
        turnos: Number.isFinite(turnos) ? turnos : (ESTADOS_INFO[datos.clave].turnos ?? TURNOS_PERMANENTE),
        quitar: Boolean(datos.quitar)
    };
}

function cargarElemental(datos) {
    if (!datos?.tipo || !TIPOS_DANNO[datos.tipo]) return null;
    return { tipo: datos.tipo, cantidad: Math.max(0, Number(datos.cantidad) || 0) };
}

/** Equipamiento guardado, con la poción aplicada (si la hay) normalizada */
export function cargarEquipo(datos) {
    const equipo = cargarEquipamiento(datos);
    equipo.pocionAplicada = cargarObjeto(equipo.pocionAplicada);
    return equipo;
}

/**
 * Normaliza un objeto guardado (o recién creado). Devuelve null si no hay objeto.
 * Acepta el formato antiguo { nombre, cantidad }: con nombre pasa a ser un material.
 */
export function cargarObjeto(datos) {
    if (!datos || typeof datos !== "object") return null;
    const nombre = String(datos.nombre ?? "");
    if (!datos.tipo && !nombre.trim()) return null;

    const tipo = TIPOS_OBJETO[datos.tipo] ? datos.tipo : "material";
    const objeto = {
        tipo,
        nombre,
        descripcion: String(datos.descripcion ?? ""),
        cantidad: Math.max(1, Math.floor(Number(datos.cantidad) || 1))
    };

    switch (tipo) {
        case "comida":
            objeto.modificadores = Array.isArray(datos.modificadores) ? datos.modificadores.map(cargarModificador) : [];
            objeto.estado = cargarEstadoObjeto(datos.estado);
            break;
        case "pocion":
            objeto.pv = Number(datos.pv) || 0;
            objeto.pa = Math.max(0, Number(datos.pa) || 0); // PA que recupera (solo en zona segura o base)
            objeto.estado = cargarEstadoObjeto(datos.estado);
            break;
        case "arrojadiza":
            objeto.danno = Math.max(0, Number(datos.danno) || 0);
            objeto.estado = cargarEstadoObjeto(datos.estado);
            objeto.elemental = cargarElemental(datos.elemental);
            break;
        case "equipo":
            objeto.equipo = cargarEquipo(datos.equipo);
            objeto.cantidad = 1; // el equipo no se apila
            break;
    }
    return objeto;
}

/** Baúl guardado: array de objetos, o texto de las fichas antiguas (cada línea es un material). */
export function cargarBaul(datos) {
    if (Array.isArray(datos)) return datos.map(cargarObjeto).filter(Boolean);
    if (typeof datos === "string") {
        return datos.split(/\r?\n/).map(linea => linea.trim()).filter(Boolean)
            .map(nombre => cargarObjeto({ tipo: "material", nombre, cantidad: 1 }));
    }
    return [];
}

const copiar = (objeto) => cargarObjeto(JSON.parse(JSON.stringify(objeto)));

/* Apilado ____________________________________________________________________ */

/** Dos objetos se apilan si son iguales salvo en la cantidad. El equipo nunca se apila. */
export function mismoObjeto(a, b) {
    if (!a || !b || a.tipo !== b.tipo || a.tipo === "equipo") return false;
    return JSON.stringify({ ...a, cantidad: 0 }) === JSON.stringify({ ...b, cantidad: 0 });
}

/* Mete el objeto en la lista: primero en pilas iguales, luego en huecos libres. Devuelve lo que no cabe. */
function apilar(lista, objeto, maxPila, huecoLibre) {
    const pila = objeto.tipo === "equipo" ? 1 : maxPila;
    let resto = objeto.cantidad;
    for (const item of lista) {
        if (resto <= 0) break;
        if (item && mismoObjeto(item, objeto) && item.cantidad < pila) {
            const n = Math.min(pila - item.cantidad, resto);
            item.cantidad += n;
            resto -= n;
        }
    }
    while (resto > 0) {
        const i = huecoLibre(lista);
        if (i < 0) break;
        const n = Math.min(pila, resto);
        lista[i] = { ...copiar(objeto), cantidad: n };
        resto -= n;
    }
    return resto;
}

const huecoInventario = (lista) => lista.findIndex(hueco => !hueco);

/** Añade al inventario lo que quepa. Devuelve la cantidad que no cabe. */
export function anadirAInventario(pj, objeto) {
    return apilar(pj.inventario, objeto, MAX_PILA_INVENTARIO, huecoInventario);
}

/** Añade al baúl (siempre cabe todo). */
export function anadirABaul(pj, objeto) {
    return apilar(pj.baul, objeto, Infinity, (lista) => lista.length);
}

/** Cuántas unidades del objeto caben en el inventario, sin modificarlo. */
export function cabenEnInventario(pj, objeto) {
    const copia = pj.inventario.map(hueco => hueco && { ...hueco });
    return objeto.cantidad - apilar(copia, objeto, MAX_PILA_INVENTARIO, huecoInventario);
}

export function hayHuecoLibre(pj) {
    return pj.inventario.some(hueco => !hueco);
}

/* Transferir y descartar _____________________________________________________ */

export function transferirABaul(pj, indice) {
    const objeto = pj.inventario[indice];
    if (!objeto) return fallo("No hay objeto en ese hueco.");
    anadirABaul(pj, objeto);
    pj.inventario[indice] = null;
    return exito(`${objeto.nombre} ×${objeto.cantidad} → baúl`);
}

/** Mueve al inventario todo lo que quepa; el resto se queda en el baúl. */
export function transferirAInventario(pj, indice) {
    const objeto = pj.baul[indice];
    if (!objeto) return fallo("No hay objeto en ese hueco.");
    const resto = anadirAInventario(pj, objeto);
    if (resto === objeto.cantidad) return fallo("No queda espacio en el inventario para este objeto.");
    const movidos = objeto.cantidad - resto;
    if (resto > 0) objeto.cantidad = resto;
    else pj.baul.splice(indice, 1);
    return exito(`${objeto.nombre} ×${movidos} → inventario` + (resto > 0 ? ` (quedan ${resto} en el baúl)` : ""));
}

/** Quita una unidad. En el inventario el hueco queda vacío; en el baúl se elimina la fila. */
export function descartar(lista, indice, huecosFijos) {
    const objeto = lista[indice];
    if (!objeto) return;
    objeto.cantidad--;
    if (objeto.cantidad > 0) return;
    if (huecosFijos) lista[indice] = null;
    else lista.splice(indice, 1);
}

const consumir = (pj, indice) => descartar(pj.inventario, indice, true);

/* Usos _______________________________________________________________________ */
// Cada uso recibe `gastar(partes, descripcion)`: partes es una lista de acciones (PARTES_ACCION)
// o "todas". Devuelve true si se puede seguir. Por defecto exige tener las acciones; la interfaz
// pasa una versión que pregunta si hacerlo igualmente.

export function gastarEstricto(pj) {
    return (partes) => partes === "todas" ? gastarTodas(pj) : gastarVarias(pj, partes);
}

function exito(...resumen) { return { ok: true, resumen }; }
function fallo(motivo) { return { ok: false, resumen: [motivo] }; }

/** Mano vacía para usar algo (prefiere una con la acción disponible). null si las dos están ocupadas. */
export function manoParaUsar(pj) {
    const vacias = MANOS.filter(mano => manoVacia(pj, mano));
    return vacias.find(mano => puedeGastar(pj, parteDeMano(mano))) ?? vacias[0] ?? null;
}

/* Comida: un solo efecto activo; se pierde con el descanso corto.
   Sus modificadores y el estado que provoca llevan origen "comida" y se van con ella. */
export function quitarComida(pj) {
    const antes = pj.comidaActiva;
    pj.modificadores = pj.modificadores.filter(mod => mod.origen !== "comida");
    for (const [clave, estado] of Object.entries(pj.estados)) {
        if (estado.origen === "comida") quitarEstado(pj, clave);
    }
    pj.comidaActiva = "";
    pj.calcularCaracteristicas();
    return antes;
}

export function comer(pj, indice) {
    const objeto = pj.inventario[indice];
    if (objeto?.tipo !== "comida") return fallo("No es comida.");
    const anterior = quitarComida(pj);
    objeto.modificadores.forEach(mod => {
        const nuevo = new Modificador(objeto.nombre || "Comida", mod.modificado, Number(mod.numero) || 0, TURNOS_PERMANENTE);
        nuevo.origen = "comida";
        pj.modificadores.push(nuevo);
    });
    pj.comidaActiva = objeto.nombre || "Comida";
    const lineasEstado = aplicarEstadoObjeto(pj, objeto.estado, "comida");
    consumir(pj, indice);
    pj.calcularCaracteristicas();
    const resumen = [`Comes ${pj.comidaActiva}`, ...lineasEstado];
    if (anterior) resumen.push(`Pierdes el efecto de ${anterior}`);
    resumen.push("Dura hasta el siguiente descanso corto");
    return exito(...resumen);
}

/* Estado que provoca o cura un objeto (poción o comida). origen: marca el estado (p. ej. "comida"). */
function aplicarEstadoObjeto(pj, estado, origen = null) {
    if (!estado?.clave) return [];
    const etiqueta = ESTADOS_INFO[estado.clave].etiqueta;
    if (estado.quitar) {
        quitarEstado(pj, estado.clave);
        return [`Cura: ${etiqueta}`];
    }
    if (!(estado.valor > 0)) return [];
    activarEstado(pj, estado.clave, estado.valor, estado.turnos);
    if (origen) pj.estados[estado.clave].origen = origen;
    return [`${etiqueta} ${estado.valor}` + (estado.turnos === TURNOS_PERMANENTE ? " (permanente)" : ` (${estado.turnos} turnos)`)];
}

/** Las pociones que recuperan PA solo se pueden tomar en zona segura o en la base */
export function motivoNoBeber(pj, pocion) {
    return (Number(pocion?.pa) || 0) > 0 && !esZonaSegura(pj)
        ? "Las pociones que recuperan PA solo se toman en zona segura o en la base."
        : null;
}

/* Efecto de una poción sobre el personaje */
function aplicarEfectoPocion(pj, pocion) {
    const resumen = [];
    const pv = Number(pocion.pv) || 0;
    if (pv !== 0) {
        const antes = pj.vida;
        pj.vida = pv > 0 ? Math.min(pj.vidaMax, pj.vida + pv) : Math.max(0, pj.vida + pv);
        resumen.push(`PV: ${antes} → ${pj.vida}`);
    }
    const pa = Number(pocion.pa) || 0;
    if (pa > 0) {
        const antes = pj.puntosArte;
        pj.puntosArte = Math.min(pj.puntosArteMax, pj.puntosArte + pa);
        resumen.push(`PA: ${antes} → ${pj.puntosArte}`);
    }
    resumen.push(...aplicarEstadoObjeto(pj, pocion.estado));
    pj.calcularCaracteristicas();
    if (!resumen.length) resumen.push("Sin efecto");
    return resumen;
}

/** Beber una poción gasta la acción de cabeza (boca). */
export function beberPocion(pj, indice, gastar = gastarEstricto(pj)) {
    const objeto = pj.inventario[indice];
    if (objeto?.tipo !== "pocion") return fallo("No es una poción.");
    const motivo = motivoNoBeber(pj, objeto);
    if (motivo) return fallo(motivo);
    if (!gastar(["cabeza"], `Beber ${objeto.nombre}`)) return fallo("Sin acción de cabeza.");
    const resumen = aplicarEfectoPocion(pj, objeto);
    consumir(pj, indice);
    return exito(...resumen);
}

/** Manos con un arma (no escudo) a la que se puede aplicar una poción */
export function manosConArma(pj) {
    return MANOS.filter(mano => {
        const arma = ARMAS[pj[mano]?.tipo];
        return arma && !arma.escudo;
    });
}

/** Aplicar una poción al arma gasta la acción de la mano del arma; se aplica en el siguiente ataque. */
export function aplicarPocionAArma(pj, indice, mano, gastar = gastarEstricto(pj)) {
    const objeto = pj.inventario[indice];
    if (objeto?.tipo !== "pocion") return fallo("No es una poción.");
    if (!manosConArma(pj).includes(mano)) return fallo("En esa mano no hay un arma.");
    const arma = pj[mano];
    const nombreArma = arma.nombre?.trim() || ARMAS[arma.tipo].etiqueta;
    if (!gastar(partesDeMano(mano, ARMAS[arma.tipo].manos === 2), `Aplicar ${objeto.nombre} a ${nombreArma}`)) {
        return fallo("Sin acción en esa mano.");
    }
    const anterior = arma.pocionAplicada;
    arma.pocionAplicada = { ...copiar(objeto), cantidad: 1 };
    consumir(pj, indice);
    const resumen = [`${objeto.nombre} aplicada a ${nombreArma}: se aplica en el siguiente ataque`];
    if (anterior) resumen.push(`Sustituye a ${anterior.nombre}`);
    return exito(...resumen);
}

/** Usar un cristal gasta la acción de una mano libre. Devuelve su descripción como mensaje. */
export function usarCristal(pj, indice, gastar = gastarEstricto(pj)) {
    const objeto = pj.inventario[indice];
    if (objeto?.tipo !== "cristal") return fallo("No es un cristal.");
    const mano = manoParaUsar(pj);
    if (!mano) return fallo("Necesitas una mano libre para usar el cristal.");
    if (!gastar([parteDeMano(mano)], `Usar ${objeto.nombre}`)) return fallo("Sin acción en la mano libre.");
    consumir(pj, indice);
    return { ok: true, resumen: [objeto.descripcion || "(El cristal no tiene descripción)"], objeto };
}

/** Lanzar una arrojadiza: necesita una mano libre (gasta su acción) y gasta una unidad. */
export function lanzarArrojadiza(pj, indice, gastar = gastarEstricto(pj)) {
    const objeto = pj.inventario[indice];
    if (objeto?.tipo !== "arrojadiza") return fallo("No es un arma arrojadiza.");
    const mano = manoParaUsar(pj);
    if (!mano) return fallo("Necesitas una mano libre para lanzar.");
    if (!gastar([parteDeMano(mano)], `Lanzar ${objeto.nombre}`)) return fallo("Sin acción en la mano libre.");
    const lanzado = { ...copiar(objeto), cantidad: 1 };
    consumir(pj, indice);
    return { ok: true, resumen: [], objeto: lanzado, mano };
}

/* Equipo _____________________________________________________________________ */

/** "mano", "armadura", "accesorio" o null según el tipo de Equipamiento (la reliquia se lleva en la mano) */
export function categoriaEquipo(tipo) {
    if (ARMAS[tipo] || tipo === TIPO_RELIQUIA) return "mano";
    if (TIPOS_ARMADURA.includes(tipo)) return "armadura";
    if (tipo === TIPO_ACCESORIO) return "accesorio";
    return null;
}

/** Ranuras de accesorio que permite la armadura */
export function getCantidadAccesoriosPorArmadura(tipoArmadura) {
    switch ((tipoArmadura || "").toLowerCase().trim()) {
        case "pesada": return 0;
        case "media": return 1;
        case "ligera": return 2;
        case "ropa":
        case "real": return 3;
        default: return 0;
    }
}

export function accesorioVacio(accesorio) {
    return !accesorio || (!accesorio.nombre?.trim() && !(accesorio.modificadores?.length));
}

/** Primera ranura de accesorio libre que permite la armadura, o -1 */
export function ranuraAccesorioLibre(pj) {
    const ranuras = getCantidadAccesoriosPorArmadura(pj.equipoArmadura?.tipo);
    return Array.from({ length: ranuras }, (_, i) => pj.accesorios[i]).findIndex(accesorioVacio);
}

/** Motivo por el que no se puede equipar ese tipo en esa mano, o null si se puede. */
export function motivoNoEquiparEnMano(pj, tipo, mano) {
    const otra = mano === "manoIzquierda" ? "manoDerecha" : "manoIzquierda";
    const tipoOtra = pj[otra]?.tipo || "";
    if (!manoVacia(pj, mano)) return "Esa mano no está vacía.";
    if (TIPOS_DOS_MANOS.includes(tipo) && tipoOtra) return "Un arma a dos manos necesita las dos manos vacías.";
    if (tipo === "estoque" && tipoOtra && tipoOtra !== "escudo") return "El estoque solo se lleva con la otra mano vacía o con escudo.";
    if (tipoOtra === "estoque" && tipo !== "escudo") return "Con un estoque en la otra mano solo puedes llevar un escudo.";
    return null;
}

/** Manos en las que se puede equipar ese tipo (un arma a dos manos solo da una opción) */
export function manosParaEquipar(pj, tipo) {
    const posibles = MANOS.filter(mano => !motivoNoEquiparEnMano(pj, tipo, mano));
    return TIPOS_DOS_MANOS.includes(tipo) ? posibles.slice(-1) : posibles;
}

/** Motivo por el que no se puede equipar el objeto del inventario, o null. */
export function motivoNoEquipar(pj, objeto) {
    const tipo = objeto?.equipo?.tipo;
    switch (categoriaEquipo(tipo)) {
        case "mano":
            if (manosParaEquipar(pj, tipo).length) return null;
            return motivoNoEquiparEnMano(pj, tipo, "manoDerecha") || motivoNoEquiparEnMano(pj, tipo, "manoIzquierda");
        case "armadura": {
            if (pj.equipoArmadura?.tipo) return "Ya llevas una armadura: guárdala antes.";
            // El Atletismo efectivo no puede bajar de 0 por la armadura (09-modelo-de-datos.md §5, #17)
            const penalizacion = Number(objeto.equipo.penalizacionAtletismo) || 0;
            return penalizacion > pj.atletismo
                ? `Penaliza ${penalizacion} de Atletismo y solo tienes ${pj.atletismo}: no puedes llevarla.`
                : null;
        }
        case "accesorio": {
            const ranuras = getCantidadAccesoriosPorArmadura(pj.equipoArmadura?.tipo);
            if (ranuraAccesorioLibre(pj) < 0) return ranuras ? "No quedan ranuras de accesorio libres." : "Tu armadura no permite accesorios.";
            return manoParaUsar(pj) ? null : "Necesitas una mano libre para ponerte el accesorio.";
        }
        default:
            return "Este equipo no tiene un tipo válido.";
    }
}

/**
 * Equipa un objeto del inventario.
 * - Arma o escudo: en una mano vacía (destino), gasta la acción de esa mano (o de las dos).
 * - Armadura: si no llevas ninguna, gasta todas las acciones del turno.
 * - Accesorio: en la primera ranura libre, gasta la acción de una mano libre.
 * - Reliquia que no es arma: como un arma de una mano.
 */
export function equipar(pj, indice, destino, gastar = gastarEstricto(pj)) {
    const objeto = pj.inventario[indice];
    if (objeto?.tipo !== "equipo") return fallo("No es equipamiento.");
    const motivo = motivoNoEquipar(pj, objeto);
    if (motivo) return fallo(motivo);

    const equipo = cargarEquipo(JSON.parse(JSON.stringify(objeto.equipo)));
    equipo.nombre = objeto.nombre;
    equipo.descripcion = objeto.descripcion;
    equipo.enUso = false;

    switch (categoriaEquipo(equipo.tipo)) {
        case "mano": {
            const mano = manosParaEquipar(pj, equipo.tipo).includes(destino) ? destino : manosParaEquipar(pj, equipo.tipo)[0];
            const partes = partesDeMano(mano, TIPOS_DOS_MANOS.includes(equipo.tipo));
            if (!gastar(partes, `Equipar ${objeto.nombre}`)) return fallo("Sin acción en esa mano.");
            pj[mano] = equipo;
            break;
        }
        case "armadura":
            if (!gastar("todas", `Equipar ${objeto.nombre} (gasta todas las acciones)`)) return fallo("Cambiar de armadura gasta todas las acciones del turno.");
            pj.equipoArmadura = equipo;
            break;
        case "accesorio": {
            const mano = manoParaUsar(pj);
            if (!gastar([parteDeMano(mano)], `Ponerte ${objeto.nombre}`)) return fallo("Sin acción en la mano libre.");
            const ranura = ranuraAccesorioLibre(pj);
            for (let i = pj.accesorios.length; i < ranura; i++) pj.accesorios[i] = new Equipamiento("", "", TIPO_ACCESORIO);
            pj.accesorios[ranura] = equipo;
            break;
        }
    }
    pj.inventario[indice] = null;
    pj.calcularCaracteristicas();
    return exito(`Equipas ${objeto.nombre}`);
}

/* Objeto equipado de una ranura: "manoIzquierda", "manoDerecha", "equipoArmadura" o "accesorio-N" */
export function equipoEnRanura(pj, ranura) {
    if (ranura?.startsWith("accesorio-")) return pj.accesorios[Number(ranura.slice("accesorio-".length))] ?? null;
    return pj[ranura] ?? null;
}

export function ranuraTieneEquipo(pj, ranura) {
    const equipo = equipoEnRanura(pj, ranura);
    if (!equipo) return false;
    return ranura.startsWith("accesorio-") ? !accesorioVacio(equipo) : Boolean(equipo.tipo);
}

/** Motivo por el que no se puede guardar lo equipado en esa ranura, o null. */
export function motivoNoGuardar(pj, ranura) {
    if (!ranuraTieneEquipo(pj, ranura)) return "No hay nada equipado.";
    if (!hayHuecoLibre(pj)) return "El inventario está lleno.";
    if (ranura === "equipoArmadura" && pj.accesorios.some(acc => !accesorioVacio(acc))) {
        return "Guarda antes los accesorios: sin armadura no hay ranuras.";
    }
    if (ranura.startsWith("accesorio-") && !manoParaUsar(pj)) return "Necesitas una mano libre para quitarte el accesorio.";
    return null;
}

/** Guarda en el inventario lo equipado en una ranura, con el mismo coste en acciones que equiparlo. */
export function guardarEquipado(pj, ranura, gastar = gastarEstricto(pj)) {
    const motivo = motivoNoGuardar(pj, ranura);
    if (motivo) return fallo(motivo);
    const equipo = equipoEnRanura(pj, ranura);
    const nombre = equipo.nombre?.trim() || ARMAS[equipo.tipo]?.etiqueta || "Equipo";

    if (ranura === "manoIzquierda" || ranura === "manoDerecha") {
        if (!gastar(partesDeMano(ranura, TIPOS_DOS_MANOS.includes(equipo.tipo)), `Guardar ${nombre}`)) return fallo("Sin acción en esa mano.");
    } else if (ranura === "equipoArmadura") {
        if (!gastar("todas", `Quitarte ${nombre} (gasta todas las acciones)`)) return fallo("Cambiar de armadura gasta todas las acciones del turno.");
    } else {
        if (!gastar([parteDeMano(manoParaUsar(pj))], `Quitarte ${nombre}`)) return fallo("Sin acción en la mano libre.");
    }

    equipo.enUso = false;
    const datos = JSON.parse(JSON.stringify(equipo));
    if (ranura.startsWith("accesorio-")) datos.tipo = TIPO_ACCESORIO;
    anadirAInventario(pj, cargarObjeto({ tipo: "equipo", nombre, descripcion: equipo.descripcion || "", cantidad: 1, equipo: datos }));

    if (ranura.startsWith("accesorio-")) {
        pj.accesorios[Number(ranura.slice("accesorio-".length))] = new Equipamiento("", "", TIPO_ACCESORIO);
    } else {
        pj[ranura] = new Equipamiento("", "", "");
    }
    pj.calcularCaracteristicas();
    return exito(`${nombre} → inventario`);
}
