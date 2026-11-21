// scripts/objetos.js
// Objetos del inventario y del baúl: tipos, apilado, carga y usos (06-equipo-y-objetos.md §5 y §6).
// No toca el DOM: recibe el personaje, lo modifica y devuelve lo que ha pasado.

import Modificador, { cargarModificador, TURNOS_PERMANENTE } from "./modificador.js";
import Equipamiento, { ARMAS, TIPOS_DOS_MANOS, TIPOS_ARMADURA, TIPO_ACCESORIO, TIPO_RELIQUIA, cargarEquipamiento, tipoArmaduraDe } from "./equipamiento.js";
import { activarEstado, quitarEstado, aplicarDanno, aplicarRotura, ESTADOS_INFO, TIPOS_DANNO, CURAR_NEGATIVOS, curaConTodosLosNegativos, estaActivo, noSeCura } from "./estados.js";
import { MANOS, gastarVarias, gastarTodas, partesDeMano, parteDeMano, manoVacia, puedeGastar } from "./turno.js";
import { esZonaSegura, baulAccesible } from "./zonas.js";
import { cargarEfectos } from "./efectosEquipo.js";
import { cargarEstadosAlAcertar, cargarEstadoAlAcertar, MAX_ESTADOS_AL_ACERTAR } from "./estadosAlAcertar.js";
import { esPesadilla, equiposDePartes } from "./npc.js";
import { ELEMENTOS_SACRO, ELEMENTOS_CRISTAL } from "./elementosSacro.js";
import { cargarMascota } from "./mascotas.js";

/* Huecos base del inventario; el modificador `inventario` los amplía (o reduce) */
export const TAMANO_INVENTARIO = 5;
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

/* Subtipos de material (para qué sirve); "" = sin tipo (los materiales antiguos) */
export const TIPOS_MATERIAL = {
    "": { etiqueta: "Sin tipo" },
    cristal: { etiqueta: "Para cristales" },
    herreria: { etiqueta: "Herrería y armería" },
    cocina: { etiqueta: "Cocina" },
    alquimia: { etiqueta: "Alquimia" }
};

/** "Cocina · potencia 3" (vacío si no tiene subtipo ni potencia; la fila ya pone "Material" delante) */
export function detalleMaterial(objeto) {
    const partes = [];
    if (objeto?.subtipo && TIPOS_MATERIAL[objeto.subtipo]) partes.push(TIPOS_MATERIAL[objeto.subtipo].etiqueta);
    if (Number(objeto?.potencia) > 0) partes.push(`potencia ${objeto.potencia}`);
    return partes.join(" · ");
}

/* Daños elementales que puede llevar una arrojadiza (claves de TIPOS_DANNO) */
export const ELEMENTOS_ARROJADIZA = ["fuego", "electricidad", "hielo", "luz", "oscuridad", "hemorragia"];

export function crearInventarioVacio(tamano = TAMANO_INVENTARIO) {
    return Array.from({ length: tamano }, () => null);
}

/** Huecos que permite el personaje: los base más los modificadores `inventario`.
    Los NPC no tienen límite: siempre les queda un hueco libre más que los ocupados. */
export function capacidadInventario(pj) {
    if (pj.esNpc) return (pj.inventario ?? []).filter(Boolean).length + 1;
    return Math.max(0, TAMANO_INVENTARIO + (Number(pj.getModificador("inventario")) || 0));
}

/**
 * Ajusta los huecos a la capacidad sin perder objetos: añade huecos vacíos si faltan,
 * baja los objetos de más a huecos libres y quita los vacíos sobrantes del final.
 * Lo que queda por encima de la capacidad son objetos sobrantes. Devuelve cuántos hay.
 */
export function ajustarInventario(pj) {
    const capacidad = capacidadInventario(pj);
    const lista = pj.inventario;
    while (lista.length < capacidad) lista.push(null);
    for (let i = capacidad; i < lista.length; i++) {
        if (!lista[i]) continue;
        const libre = lista.findIndex((hueco, k) => k < capacidad && !hueco);
        if (libre < 0) break;
        lista[libre] = lista[i];
        lista[i] = null;
    }
    // Por encima de la capacidad no quedan huecos vacíos: solo los objetos sobrantes
    const sobrantes = lista.slice(capacidad).filter(Boolean);
    lista.splice(capacidad, lista.length - capacidad, ...sobrantes);
    return sobrantes.length;
}

/* Carga y normalización ______________________________________________________ */

/* Un estado que provoca o cura un objeto: { clave, valor, turnos, quitar }. La comida dura hasta el descanso
   corto (se guarda permanente y se quita con quitarComida); una arrojadiza no cura */
function cargarEstadoObjeto(datos, tipo = "") {
    // Curar todos los estados negativos (solo comida y poción)
    if (datos?.clave === CURAR_NEGATIVOS) {
        return datos.quitar && tipo !== "arrojadiza" ? { clave: CURAR_NEGATIVOS, valor: 0, turnos: TURNOS_PERMANENTE, quitar: true } : null;
    }
    if (!datos?.clave || !ESTADOS_INFO[datos.clave]) return null;
    const turnos = Math.trunc(Number(datos.turnos));
    return {
        clave: datos.clave,
        valor: Math.max(0, Math.trunc(Number(datos.valor) || 0)),
        turnos: tipo === "comida" ? TURNOS_PERMANENTE
            : Number.isFinite(turnos) ? turnos : (ESTADOS_INFO[datos.clave].turnos ?? TURNOS_PERMANENTE),
        quitar: tipo !== "arrojadiza" && Boolean(datos.quitar)
    };
}

/** Estados de una comida, poción o arrojadiza (lista `estados`; acepta el antiguo `estado`, uno solo) */
export function cargarEstadosObjeto(datos, tipo = "") {
    const lista = Array.isArray(datos?.estados) ? datos.estados : datos?.estado ? [datos.estado] : [];
    return lista.map(estado => cargarEstadoObjeto(estado, tipo)).filter(Boolean).slice(0, MAX_ESTADOS_AL_ACERTAR);
}

function cargarElemental(datos) {
    if (!datos?.tipo || !TIPOS_DANNO[datos.tipo]) return null;
    return { tipo: datos.tipo, cantidad: Math.max(0, Number(datos.cantidad) || 0) };
}

/** Equipamiento guardado, con la poción aplicada (si la hay) normalizada */
export function cargarEquipo(datos) {
    const equipo = cargarEquipamiento(datos);
    equipo.cinturon = cargarCinturon(equipo.cinturon);
    equipo.pocionAplicada = cargarObjeto(equipo.pocionAplicada);
    equipo.efectos = cargarEfectos(equipo.efectos);
    equipo.estadosAlAcertar = cargarEstadosAlAcertar(equipo.estadosAlAcertar);
    // Arma de fuego: cada bala es un material de herrería con cantidad 1 (lo que pase del cargador se pierde)
    equipo.balas = (Array.isArray(equipo.balas) ? equipo.balas : [])
        .map(bala => cargarObjeto({ ...bala, tipo: "material", cantidad: 1 })).filter(Boolean).slice(0, equipo.cargador);
    return equipo;
}

/* Cristal elemental (13-sacro.md §11): arma arrojadiza con subtipo "cristalElemental" que guarda un solo elemento de
   la magia de Sacro (elemento = { clave, puntos }, hasta su capacidad en puntos de daño). Lleno no entra en el
   inventario (solo en el cinturón o el baúl); al lanzarlo libera el elemento y se rompe. */
export const SUBTIPO_CRISTAL_ELEMENTAL = "cristalElemental";
export const MAX_CAPACIDAD_CRISTAL = 999;
export const esCristalElemental = (objeto) => objeto?.tipo === "arrojadiza" && objeto.subtipo === SUBTIPO_CRISTAL_ELEMENTAL;
/** ¿Es un cristal elemental con un elemento dentro? */
export const cristalConElemento = (objeto) => esCristalElemental(objeto) && Boolean(objeto.elemento);
function cargarElementoCristal(datos, capacidad) {
    const puntos = Math.min(capacidad, Math.floor(Number(datos?.puntos) || 0));
    return ELEMENTOS_CRISTAL.includes(datos?.clave) && puntos > 0 ? { clave: datos.clave, puntos } : null;
}

/**
 * Descansos: los cristales elementales pierden su elemento. Hela en cualquier descanso, Metala nunca y el resto en el
 * descanso largo. En el cinturón, el baúl, el botín y (por si acaso) el inventario. @returns {string[]} resumen
 */
export function vaciarCristalesElementales(pj, largo) {
    const resumen = [];
    const listas = [pj.inventario, pj.baul, pj.botin, ...(pj.accesorios ?? []).map(acc => acc?.cinturon?.objetos)];
    for (const lista of listas) {
        for (const objeto of lista ?? []) {
            if (!cristalConElemento(objeto)) continue;
            const clave = objeto.elemento.clave;
            if (clave === "metala" || (clave !== "hela" && !largo)) continue;
            resumen.push(`${objeto.nombre} pierde su ${ELEMENTOS_SACRO[clave].etiqueta}`);
            objeto.elemento = null;
        }
    }
    return resumen;
}

/* Cinturón (accesorio con inventario propio, ver cinturon.js): una unidad por hueco de los tipos admitidos */
export const TIPOS_CINTURON = ["pocion", "cristal", "arrojadiza"];
export const MAX_HUECOS_CINTURON = 30; // límite técnico: el personaje tiene que caber en un documento de la nube
export function cargarCinturon(datos) {
    if (!datos || typeof datos !== "object") return null;
    const huecos = Math.max(1, Math.min(MAX_HUECOS_CINTURON, Math.floor(Number(datos.huecos) || 1)));
    const guardados = Array.isArray(datos.objetos) ? datos.objetos : [];
    // Lo que no cabe en los huecos (o no es de un tipo admitido) se pierde: no debería pasar
    const objetos = Array.from({ length: huecos }, (_, i) => {
        const objeto = cargarObjeto(guardados[i]);
        return objeto && TIPOS_CINTURON.includes(objeto.tipo) ? { ...objeto, cantidad: 1 } : null;
    });
    return { huecos, objetos };
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
            objeto.estados = cargarEstadosObjeto(datos, tipo);
            break;
        case "pocion":
            objeto.pv = Number(datos.pv) || 0;
            objeto.pa = Math.max(0, Number(datos.pa) || 0); // PA que recupera (solo en zona segura o base)
            objeto.estados = cargarEstadosObjeto(datos, tipo);
            break;
        case "arrojadiza":
            objeto.danno = Math.max(0, Number(datos.danno) || 0);
            objeto.estados = cargarEstadosObjeto(datos, tipo);
            objeto.elemental = cargarElemental(datos.elemental);
            if (datos.subtipo === SUBTIPO_CRISTAL_ELEMENTAL) {
                objeto.subtipo = SUBTIPO_CRISTAL_ELEMENTAL;
                objeto.capacidad = Math.max(1, Math.min(MAX_CAPACIDAD_CRISTAL, Math.floor(Number(datos.capacidad) || 1)));
                objeto.elemento = cargarElementoCristal(datos.elemento, objeto.capacidad);
            }
            break;
        case "equipo":
            objeto.equipo = cargarEquipo(datos.equipo);
            objeto.cantidad = 1; // el equipo no se apila
            break;
        case "material":
            // Para qué sirve y su potencia (informativa por ahora; distinta potencia = distinta pila)
            objeto.subtipo = TIPOS_MATERIAL[datos.subtipo] ? datos.subtipo : "";
            objeto.potencia = Math.max(0, Math.floor(Number(datos.potencia) || 0));
            break;
    }
    return objeto;
}

/**
 * Objetos clave: no ocupan hueco ni se usan (como materiales), cada uno en su fila y sin cantidad.
 * Guardados como [{ nombre, descripcion }]; se descartan los que no tienen nombre.
 */
export function cargarObjetosClave(datos) {
    return (Array.isArray(datos) ? datos : [])
        .map(objeto => {
            const clave = { nombre: String(objeto?.nombre ?? "").trim(), descripcion: String(objeto?.descripcion ?? "") };
            // Cristal de mascota (mascotas.js): la ficha de la mascota y si está invocada
            const mascota = cargarMascota(objeto?.mascota);
            if (mascota) {
                clave.mascota = mascota;
                if (objeto.invocada === true && !mascota.agrietado) clave.invocada = true;
            }
            return clave;
        })
        .filter(objeto => objeto.nombre);
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

/* Mete el objeto en la lista: primero en pilas iguales, luego en huecos libres. Devuelve lo que no cabe.
   Solo usa las posiciones por debajo de `limite` (en el inventario, los sobrantes no reciben nada). */
function apilar(lista, objeto, maxPila, huecoLibre, limite = Infinity) {
    const pila = objeto.tipo === "equipo" ? 1 : maxPila;
    let resto = objeto.cantidad;
    for (const [i, item] of lista.entries()) {
        if (resto <= 0 || i >= limite) break;
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

/* Primer hueco libre dentro de la capacidad, o -1 */
const huecoInventario = (capacidad) => (lista) => lista.findIndex((hueco, i) => i < capacidad && !hueco);

/* Mete el objeto en una lista con huecos de inventario (la del personaje o una copia) */
function apilarEnInventario(pj, lista, objeto) {
    // Un cristal elemental con elemento solo puede estar en el cinturón o en el baúl
    if (cristalConElemento(objeto)) return objeto.cantidad;
    // NPC: sin límite, cada pila nueva va a un hueco vacío o al final
    if (pj.esNpc) return apilar(lista, objeto, MAX_PILA_INVENTARIO, (l) => {
        const i = l.findIndex(hueco => !hueco);
        return i >= 0 ? i : l.length;
    });
    const capacidad = capacidadInventario(pj);
    while (lista.length < capacidad) lista.push(null);
    return apilar(lista, objeto, MAX_PILA_INVENTARIO, huecoInventario(capacidad), capacidad);
}

/** Añade al inventario lo que quepa. Devuelve la cantidad que no cabe. */
export function anadirAInventario(pj, objeto) {
    return apilarEnInventario(pj, pj.inventario, objeto);
}

/** Añade al baúl (siempre cabe todo). */
export function anadirABaul(pj, objeto) {
    return apilar(pj.baul, objeto, Infinity, (lista) => lista.length);
}

/** Cuántas unidades del objeto caben en el inventario, sin modificarlo. */
export function cabenEnInventario(pj, objeto) {
    const copia = pj.inventario.map(hueco => hueco && { ...hueco });
    return objeto.cantidad - apilarEnInventario(pj, copia, objeto);
}

export function hayHuecoLibre(pj) {
    return huecoInventario(capacidadInventario(pj))(pj.inventario) >= 0;
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
    if (cristalConElemento(objeto)) return fallo("Un cristal elemental con elemento no puede ir al inventario: solo al cinturón o al baúl.");
    const resto = anadirAInventario(pj, objeto);
    if (resto === objeto.cantidad) return fallo("No queda espacio en el inventario para este objeto.");
    const movidos = objeto.cantidad - resto;
    if (resto > 0) objeto.cantidad = resto;
    else pj.baul.splice(indice, 1);
    return exito(`${objeto.nombre} ×${movidos} → inventario` + (resto > 0 ? ` (quedan ${resto} en el baúl)` : ""));
}

/** Cambia de sitio un elemento de la lista (ordenar arrastrando: inventario, baúl, objetos clave) */
export function moverEnLista(lista, desde, hasta) {
    const valido = (i) => Number.isInteger(i) && i >= 0 && i < lista.length;
    if (!valido(desde) || !valido(hasta) || desde === hasta) return false;
    const [elemento] = lista.splice(desde, 1);
    lista.splice(hasta, 0, elemento);
    return true;
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

/* Los usos de objetos aceptan un índice del inventario o una referencia { origen, ranura?, indice }:
   origen "inventario" o "cinturon" (ranura = "accesorio-N" del cinturón, ver cinturon.js) */
const esRefCinturon = (ref) => ref && typeof ref === "object" && ref.origen === "cinturon";
/** Objeto al que apunta una referencia (o un índice del inventario), o null */
export function objetoEn(pj, ref) {
    if (esRefCinturon(ref)) return equipoEnRanura(pj, ref.ranura)?.cinturon?.objetos?.[ref.indice] ?? null;
    return pj.inventario[ref && typeof ref === "object" ? ref.indice : ref] ?? null;
}
/** Gasta una unidad del objeto de la referencia (en el cinturón, el hueco queda vacío) */
function consumirDe(pj, ref) {
    if (esRefCinturon(ref)) {
        const lista = equipoEnRanura(pj, ref.ranura)?.cinturon?.objetos;
        if (lista) descartar(lista, ref.indice, true);
        return;
    }
    consumir(pj, ref && typeof ref === "object" ? ref.indice : ref);
}

/* Usos _______________________________________________________________________ */
// Cada uso recibe `gastar(partes, descripcion)`: partes es una lista de acciones (PARTES_ACCION)
// o "todas". Devuelve true si se puede seguir. Por defecto exige tener las acciones; la interfaz
// pasa una versión que pregunta si hacerlo igualmente.

export function gastarEstricto(pj) {
    return (partes) => partes === "todas" ? gastarTodas(pj) : gastarVarias(pj, partes);
}

function exito(...resumen) { return { ok: true, resumen }; }
function fallo(motivo) { return { ok: false, resumen: [motivo] }; }

/* Cor (monedas): no ocupan hueco, sin límite y nunca en negativo _____________ */

const cantidadCor = (cantidad) => Math.floor(Number(cantidad) || 0);

export function anadirCor(pj, cantidad) {
    const n = cantidadCor(cantidad);
    if (n <= 0) return fallo("Indica una cantidad mayor que 0.");
    pj.cor = (Number(pj.cor) || 0) + n;
    return exito(`+${n} Cor`, `Total: ${pj.cor} Cor`);
}

/** Gasta Cor; si no hay bastante no gasta nada. */
export function gastarCor(pj, cantidad) {
    const n = cantidadCor(cantidad);
    if (n <= 0) return fallo("Indica una cantidad mayor que 0.");
    const actual = Number(pj.cor) || 0;
    if (n > actual) return fallo(`No tienes suficiente Cor (tienes ${actual}).`);
    pj.cor = actual - n;
    return exito(`−${n} Cor`, `Total: ${pj.cor} Cor`);
}

/* Puntos de ego (perfil): como el Cor, sin límite y nunca en negativo */
export function anadirEgo(pj, cantidad) {
    const n = cantidadCor(cantidad);
    if (n <= 0) return fallo("Indica una cantidad mayor que 0.");
    pj.puntosEgo = (Number(pj.puntosEgo) || 0) + n;
    return exito(`+${n} puntos de ego`, `Total: ${pj.puntosEgo}`);
}

/** Quita puntos de ego; si no hay bastantes no quita nada. */
export function gastarEgo(pj, cantidad) {
    const n = cantidadCor(cantidad);
    if (n <= 0) return fallo("Indica una cantidad mayor que 0.");
    const actual = Number(pj.puntosEgo) || 0;
    if (n > actual) return fallo(`No tienes suficientes puntos de ego (tienes ${actual}).`);
    pj.puntosEgo = actual - n;
    return exito(`−${n} puntos de ego`, `Total: ${pj.puntosEgo}`);
}

/** Mano para usar algo del inventario (prefiere una con la acción disponible). null si las dos están ocupadas.
 *  Con un arma a dos manos, cualquiera de las dos sirve: se suelta un momento el arma (gasta la acción de esa mano). */
export function manoParaUsar(pj) {
    const conDosManos = MANOS.some(mano => TIPOS_DOS_MANOS.includes(pj[mano]?.tipo));
    const libres = MANOS.filter(mano => manoVacia(pj, mano) || conDosManos);
    return libres.find(mano => puedeGastar(pj, parteDeMano(mano))) ?? libres[0] ?? null;
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
    const resumen = efectoComida(pj, objeto);
    consumir(pj, indice);
    return exito(...resumen);
}

/* Ofrecer comida o pociones a otro jugador ____________________________________
   Ofrecer gasta la acción de una mano libre y una unidad del inventario; quien la recibe la consume
   gastando la acción de la boca (consumirOfrecido). Si no la consume, se pierde. */

export const TIPOS_OFRECIBLES = ["comida", "pocion"];

/** Saca una unidad del inventario para ofrecerla. Devuelve { ok, resumen, objeto } (objeto = la unidad) */
export function ofrecerObjeto(pj, indice, gastar = gastarEstricto(pj), nombreDestino = "otro jugador") {
    const objeto = objetoEn(pj, indice);
    if (!TIPOS_OFRECIBLES.includes(objeto?.tipo)) return fallo("Solo se puede ofrecer comida o pociones.");
    const mano = manoParaUsar(pj);
    if (!mano) return fallo("Necesitas una mano libre para ofrecerlo.");
    if (!gastar([parteDeMano(mano)], `Ofrecer ${objeto.nombre} a ${nombreDestino}`)) return fallo("Sin acción en la mano libre.");
    const unidad = { ...copiar(objeto), cantidad: 1 };
    consumirDe(pj, indice);
    return { ok: true, resumen: [`Ofreces ${objeto.nombre} a ${nombreDestino}`], objeto: unidad };
}

/** Consume comida o una poción que te han ofrecido (datos de otro jugador: se normalizan). Gasta la boca. */
export function consumirOfrecido(pj, datos, gastar = gastarEstricto(pj)) {
    const objeto = cargarObjeto(datos);
    if (!TIPOS_OFRECIBLES.includes(objeto?.tipo)) return fallo("Solo se puede consumir comida o pociones.");
    if (objeto.tipo === "pocion") {
        const motivo = motivoNoBeber(pj, objeto);
        if (motivo) return fallo(motivo);
    }
    if (!gastar(["cabeza"], `${objeto.tipo === "comida" ? "Comer" : "Beber"} ${objeto.nombre}`)) return fallo("Sin acción de boca.");
    const resumen = objeto.tipo === "comida" ? efectoComida(pj, objeto) : aplicarEfectoPocion(pj, objeto);
    return { ok: true, resumen, objeto };
}

/* Efecto de comer: sustituye a la comida anterior (sus modificadores y estados llevan origen "comida") */
function efectoComida(pj, objeto) {
    const anterior = quitarComida(pj);
    objeto.modificadores.forEach(mod => {
        const nuevo = new Modificador(objeto.nombre || "Comida", mod.modificado, Number(mod.numero) || 0, TURNOS_PERMANENTE);
        nuevo.origen = "comida";
        pj.modificadores.push(nuevo);
    });
    pj.comidaActiva = objeto.nombre || "Comida";
    const lineasEstado = (objeto.estados ?? []).flatMap(estado => aplicarEstadoObjeto(pj, estado, "comida"));
    pj.calcularCaracteristicas();
    const resumen = [`Comes ${pj.comidaActiva}`, ...lineasEstado];
    if (anterior) resumen.push(`Pierdes el efecto de ${anterior}`);
    resumen.push("Dura hasta el siguiente descanso corto");
    return resumen;
}

/* Estado que provoca o cura un objeto (poción o comida). origen: marca el estado (p. ej. "comida", que dura hasta
   el descanso corto). */
function aplicarEstadoObjeto(pj, estado, origen = null) {
    if (!estado?.clave) return [];
    if (estado.clave === CURAR_NEGATIVOS) {
        if (!estado.quitar) return [];
        const curados = Object.keys(ESTADOS_INFO).filter(clave => curaConTodosLosNegativos(clave) && estaActivo(pj, clave));
        curados.forEach(clave => quitarEstado(pj, clave));
        return curados.length ? curados.map(clave => `Cura: ${ESTADOS_INFO[clave].etiqueta}`) : ["Cura los estados negativos (no había ninguno)"];
    }
    const etiqueta = ESTADOS_INFO[estado.clave].etiqueta;
    if (estado.quitar) {
        quitarEstado(pj, estado.clave);
        return [`Cura: ${etiqueta}`];
    }
    if (!(estado.valor > 0)) return [];
    const deComida = origen === "comida";
    const turnos = deComida ? TURNOS_PERMANENTE : estado.turnos;
    activarEstado(pj, estado.clave, estado.valor, turnos);
    if (origen) pj.estados[estado.clave].origen = origen;
    const duracion = deComida ? "hasta el descanso corto" : turnos === TURNOS_PERMANENTE ? "permanente" : `${turnos} turnos`;
    return [`${etiqueta} ${estado.valor} (${duracion})`];
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
    if (pv > 0 && noSeCura(pj)) resumen.push(esPesadilla(pj) ? "Una pesadilla no se cura" : "Anticuración: no recupera PV");
    else if (pv !== 0) {
        const antes = pj.vida;
        // Una poción que hace daño puede dejar los PV en negativo
        pj.vida = pv > 0 ? Math.max(pj.vida, Math.min(pj.vidaMax, pj.vida + pv)) : pj.vida + pv;
        resumen.push(`PV: ${antes} → ${pj.vida}`);
    }
    const pa = Number(pocion.pa) || 0;
    if (pa > 0) {
        const antes = pj.puntosArte;
        pj.puntosArte = Math.min(pj.puntosArteMax, pj.puntosArte + pa);
        // Se comparte en la sala: de un NPC (o jefe) no se dicen sus PA, solo lo que recupera
        resumen.push(pj.esNpc ? `+${pj.puntosArte - antes} PA` : `PA: ${antes} → ${pj.puntosArte}`);
    }
    (pocion.estados ?? []).forEach(estado => resumen.push(...aplicarEstadoObjeto(pj, estado)));
    pj.calcularCaracteristicas();
    if (!resumen.length) resumen.push("Sin efecto");
    return resumen;
}

/**
 * Efecto de una poción aplicada a un arma (o de una arrojadiza) sobre quien recibe el golpe
 * (efectoDeObjeto en ataque.js): PV, estado (p. ej. veneno) y daño elemental, que resta su resistencia.
 * No da PA. Puede venir de otro jugador, así que se valida todo.
 * @returns {string[]} resumen
 */
/* Escudos que lleva (manos y, en un NPC, sus otras partes) */
function escudosDe(pj) {
    return [pj.manoIzquierda, pj.manoDerecha, ...equiposDePartes(pj)].filter(equipo => ARMAS[equipo?.tipo]?.escudo);
}

/** ¿Tiene algún escudo levantado? */
export const escudoLevantado = (pj) => (Number(pj.getDefensaEscudos?.()) || 0) > 0;

/** Defensa sin lo que suman los escudos levantados */
export const defensaSinEscudo = (pj) => (Number(pj.defensa) || 0) - (Number(pj.getDefensaEscudos?.()) || 0);

/* Estados de un efecto de golpe que se aplican antes del daño (rotura y escudo inhabilitado) */
const ESTADOS_PREVIOS = ["rotura", "escudoInhabilitado"];

/** ¿El golpe trae Escudo inhabilitado (de un arma, arte o arrojadiza)? */
export function efectoInhabilitaEscudo(efecto) {
    if (!efecto || typeof efecto !== "object") return false;
    const lista = [...(Array.isArray(efecto.estados) ? efecto.estados : []), ...(Array.isArray(efecto.estadosObjeto) ? efecto.estadosObjeto : [])];
    return lista.some(datos => datos?.clave === "escudoInhabilitado" && !datos.quitar);
}

/** ¿Ese golpe le inhabilitaría el escudo? Levantado y la tirada (null = arte, no falla) llega a la Defensa sin escudo */
export function inhabilitaEscudo(pj, efecto, tirada = null) {
    return efectoInhabilitaEscudo(efecto) && escudoLevantado(pj) && !esPesadilla(pj)
        && (tirada === null || Number(tirada) >= defensaSinEscudo(pj));
}

/** Escudo inhabilitado: baja los escudos y activa el estado */
export function inhabilitarEscudo(pj, turnos = ESTADOS_INFO.escudoInhabilitado.turnos) {
    escudosDe(pj).forEach(escudo => { escudo.enUso = false; });
    activarEstado(pj, "escudoInhabilitado", 1, turnos);
}

/** Motivo por el que no puede levantar ni guardar un escudo, o null */
export function motivoEscudoInhabilitado(pj, equipo) {
    return ARMAS[equipo?.tipo]?.escudo && estaActivo(pj, "escudoInhabilitado") ? "Tienes el escudo inhabilitado." : null;
}

/**
 * Efectos de un golpe que van antes de su daño: la rotura de armadura (su sobrante entra como daño y el golpe
 * ya usa la armadura rota) y el escudo inhabilitado (solo con el escudo levantado y si la tirada llega a la
 * Defensa sin escudo). Devuelve el resumen y el efecto sin ellos, para aplicarEfectoEnObjetivo.
 * @param {{ tirada?: number|null, multiplicador?: number, notaMultiplicador?: string }} opciones
 */
export function aplicarEfectosPrevios(pj, efecto, { tirada = null, ...opcionesDanno } = {}) {
    if (!efecto || typeof efecto !== "object") return { resumen: [], efecto };
    const esPrevio = (datos) => ESTADOS_PREVIOS.includes(datos?.clave) && !datos.quitar;
    const deArma = (Array.isArray(efecto.estados) ? efecto.estados : []).slice(0, MAX_ESTADOS_AL_ACERTAR * 2);
    const deObjeto = (Array.isArray(efecto.estadosObjeto) ? efecto.estadosObjeto : []).slice(0, MAX_ESTADOS_AL_ACERTAR);
    const previos = [
        ...deArma.filter(esPrevio).map(cargarEstadoAlAcertar),
        ...deObjeto.filter(esPrevio).map(datos => cargarEstadoObjeto(datos, "arrojadiza"))
    ].filter(Boolean);
    if (!previos.length) return { resumen: [], efecto };
    const sinPrevios = { ...efecto, estados: deArma.filter(datos => !esPrevio(datos)) };
    // (estadosObjeto solo si venía como lista: los clientes antiguos mandan uno solo en `estado`)
    if (Array.isArray(efecto.estadosObjeto)) sinPrevios.estadosObjeto = deObjeto.filter(datos => !esPrevio(datos));
    // Si no queda nada más en el efecto, no se aplica (así no sale "Sin efecto")
    const vacio = !Number(sinPrevios.pv) && !sinPrevios.estados.length && !(sinPrevios.estadosObjeto?.length) && !sinPrevios.estado
        && !(Number(sinPrevios.elemental?.cantidad) > 0);
    const resto = vacio ? null : sinPrevios;
    // Pesadilla: los efectos no se aplican solos (el máster los pone a mano)
    if (esPesadilla(pj)) return { resumen: [], efecto: resto };
    const resumen = [];
    const escudoAntes = inhabilitaEscudo(pj, efecto, tirada);
    for (const estado of previos) {
        if (estado.clave === "rotura") resumen.push(...aplicarRotura(pj, estado.valor, estado.turnos, opcionesDanno));
        else if (escudoAntes) {
            inhabilitarEscudo(pj, estado.turnos);
            resumen.push("Escudo inhabilitado: el escudo cae");
        } else resumen.push(escudoLevantado(pj)
            ? "Escudo inhabilitado: no supera la Defensa sin escudo"
            : "Escudo inhabilitado: no tiene el escudo levantado");
    }
    pj.calcularCaracteristicas();
    return { resumen, efecto: resto };
}

export function aplicarEfectoEnObjetivo(pj, efecto) {
    if (!efecto || typeof efecto !== "object") return [];
    // Pesadilla: los efectos de los golpes no se aplican solos (el máster los pone a mano)
    if (esPesadilla(pj)) return ["Sin efecto en una pesadilla (se aplica a mano)"];
    const resumen = [];
    const pv = Math.trunc(Number(efecto.pv) || 0);
    if (pv > 0 && noSeCura(pj)) resumen.push("Anticuración: no recupera PV");
    else if (pv !== 0) {
        const antes = pj.vida;
        pj.vida = pv > 0 ? Math.max(pj.vida, Math.min(pj.vidaMax, pj.vida + pv)) : pj.vida + pv;
        resumen.push(`${pv > 0 ? `Cura ${pv}` : `${-pv} de daño`} (PV: ${antes} → ${pj.vida})`);
    }
    // Estados de la poción o arrojadiza (estadosObjeto; los clientes antiguos mandan uno solo en `estado`)
    const deObjeto = Array.isArray(efecto.estadosObjeto) ? efecto.estadosObjeto : efecto.estado ? [efecto.estado] : [];
    deObjeto.slice(0, MAX_ESTADOS_AL_ACERTAR).forEach(datos => {
        const estado = cargarEstadoObjeto(datos, "pocion");
        if (estado) resumen.push(...aplicarEstadoObjeto(pj, estado));
    });
    // Estados al acertar del arma o del arte (ya tirados por el atacante; vienen de otro jugador: se validan)
    const estados = (Array.isArray(efecto.estados) ? efecto.estados : []).slice(0, MAX_ESTADOS_AL_ACERTAR * 2);
    for (const datos of estados) {
        const estado = cargarEstadoAlAcertar(datos);
        if (estado) resumen.push(...aplicarEstadoObjeto(pj, { clave: estado.clave, valor: estado.valor, turnos: estado.turnos, quitar: false }));
    }
    const elemental = efecto.elemental;
    if (TIPOS_DANNO[elemental?.tipo] && Number(elemental.cantidad) > 0) {
        resumen.push(...aplicarDanno(pj, elemental.cantidad, elemental.tipo));
    }
    pj.calcularCaracteristicas();
    if (!resumen.length) resumen.push("Sin efecto");
    return resumen;
}

/** Beber una poción gasta la acción de cabeza (boca). */
export function beberPocion(pj, indice, gastar = gastarEstricto(pj)) {
    const objeto = objetoEn(pj, indice);
    if (objeto?.tipo !== "pocion") return fallo("No es una poción.");
    const motivo = motivoNoBeber(pj, objeto);
    if (motivo) return fallo(motivo);
    if (!gastar(["cabeza"], `Beber ${objeto.nombre}`)) return fallo("Sin acción de cabeza.");
    const resumen = aplicarEfectoPocion(pj, objeto);
    consumirDe(pj, indice);
    return exito(...resumen);
}

/** Manos con un arma (no escudo ni arma de fuego) a la que se puede aplicar una poción */
export function manosConArma(pj) {
    return MANOS.filter(mano => {
        const arma = ARMAS[pj[mano]?.tipo];
        return arma && !arma.escudo && !arma.fuego;
    });
}

/** Aplicar una poción al arma gasta la acción de la mano del arma; se aplica en el siguiente ataque. */
export function aplicarPocionAArma(pj, indice, mano, gastar = gastarEstricto(pj)) {
    const objeto = objetoEn(pj, indice);
    if (objeto?.tipo !== "pocion") return fallo("No es una poción.");
    if (!manosConArma(pj).includes(mano)) return fallo("En esa mano no hay un arma.");
    const arma = pj[mano];
    const nombreArma = arma.nombre?.trim() || ARMAS[arma.tipo].etiqueta;
    if (!gastar(partesDeMano(mano, ARMAS[arma.tipo].manos === 2), `Aplicar ${objeto.nombre} a ${nombreArma}`)) {
        return fallo("Sin acción en esa mano.");
    }
    const anterior = arma.pocionAplicada;
    arma.pocionAplicada = { ...copiar(objeto), cantidad: 1 };
    consumirDe(pj, indice);
    const resumen = [`${objeto.nombre} aplicada a ${nombreArma}: se aplica en el siguiente ataque`];
    if (anterior) resumen.push(`Sustituye a ${anterior.nombre}`);
    return exito(...resumen);
}

/** Usar un cristal gasta la acción de una mano libre. Devuelve su descripción como mensaje. */
export function usarCristal(pj, indice, gastar = gastarEstricto(pj)) {
    const objeto = objetoEn(pj, indice);
    if (objeto?.tipo !== "cristal") return fallo("No es un cristal.");
    const mano = manoParaUsar(pj);
    if (!mano) return fallo("Necesitas una mano libre para usar el cristal.");
    if (!gastar([parteDeMano(mano)], `Usar ${objeto.nombre}`)) return fallo("Sin acción en la mano libre.");
    consumirDe(pj, indice);
    return { ok: true, resumen: [objeto.descripcion || "(El cristal no tiene descripción)"], objeto };
}

/** Lanzar una arrojadiza: necesita una mano libre (gasta su acción) y gasta una unidad. */
export function lanzarArrojadiza(pj, indice, gastar = gastarEstricto(pj)) {
    const objeto = objetoEn(pj, indice);
    if (objeto?.tipo !== "arrojadiza") return fallo("No es un arma arrojadiza.");
    const mano = manoParaUsar(pj);
    if (!mano) return fallo("Necesitas una mano libre para lanzar.");
    if (!gastar([parteDeMano(mano)], `Lanzar ${objeto.nombre}`)) return fallo("Sin acción en la mano libre.");
    const lanzado = { ...copiar(objeto), cantidad: 1 };
    consumirDe(pj, indice);
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

/* Los NPC no tienen límite de accesorios (salvo este máximo): siempre les queda una ranura libre más */
export const MAX_ACCESORIOS_NPC = 20;

/** Ranuras de accesorio del personaje: las que permite su armadura (sin armadura, como ropa); en un NPC, las ocupadas + 1 */
export function ranurasAccesorio(pj) {
    if (!pj.esNpc) return getCantidadAccesoriosPorArmadura(tipoArmaduraDe(pj));
    let ultima = -1;
    (pj.accesorios ?? []).forEach((accesorio, i) => { if (!accesorioVacio(accesorio)) ultima = i; });
    return Math.min(MAX_ACCESORIOS_NPC, ultima + 2);
}

/** Primera ranura de accesorio libre que permite la armadura, o -1 */
export function ranuraAccesorioLibre(pj) {
    const ranuras = ranurasAccesorio(pj);
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

/* Acción que gasta ponerse o quitarse un accesorio: la de una mano libre. En zona segura o base no hace falta
   ninguna mano libre (allí no se gastan acciones), así que con las dos ocupadas no se gasta nada. */
function partesManoAccesorio(pj) {
    const mano = manoParaUsar(pj);
    return mano ? [parteDeMano(mano)] : [];
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
            // Sin armadura (como ropa) puede llevar accesorios: los que no quepan con la nueva se perderían
            if (!pj.esNpc) {
                const permite = getCantidadAccesoriosPorArmadura(objeto.equipo.tipo);
                if ((pj.accesorios ?? []).some((acc, i) => i >= permite && !accesorioVacio(acc))) {
                    return permite
                        ? `Esta armadura solo permite ${permite} accesorio${permite === 1 ? "" : "s"}: quítate antes los que sobran.`
                        : "Esta armadura no permite accesorios: quítatelos antes.";
                }
            }
            // El Atletismo efectivo no puede bajar de 0 por la armadura (09-modelo-de-datos.md §5, #17)
            const penalizacion = Number(objeto.equipo.penalizacionAtletismo) || 0;
            return penalizacion > pj.getBaseHabilidad("atletismo")
                ? `Penaliza ${penalizacion} de Atletismo y solo tienes ${pj.getBaseHabilidad("atletismo")}: no puedes llevarla.`
                : null;
        }
        case "accesorio": {
            const ranuras = ranurasAccesorio(pj);
            if (ranuraAccesorioLibre(pj) < 0) return ranuras ? "No quedan ranuras de accesorio libres." : "Tu armadura no permite accesorios.";
            return manoParaUsar(pj) || esZonaSegura(pj) ? null : "Necesitas una mano libre para ponerte el accesorio.";
        }
        default:
            return "Este equipo no tiene un tipo válido.";
    }
}

/**
 * Equipa un objeto del inventario.
 * - Arma o escudo: en una mano vacía (destino), gasta la acción de esa mano (o de las dos).
 * - Armadura: si no llevas ninguna, gasta todas las acciones del turno.
 * - Accesorio: en la primera ranura libre, gasta la acción de una mano libre (en zona segura o base no hace falta).
 * - Reliquia que no es arma: como un arma de una mano.
 */
export function equipar(pj, indice, destino, gastar = gastarEstricto(pj)) {
    const objeto = pj.inventario[indice];
    if (objeto?.tipo !== "equipo") return fallo("No es equipamiento.");
    const motivo = motivoNoEquipar(pj, objeto);
    if (motivo) return fallo(motivo);

    const equipo = equipoDeObjeto(objeto);

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
            if (!gastar(partesManoAccesorio(pj), `Ponerte ${objeto.nombre}`)) return fallo("Sin acción en la mano libre.");
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

/* Armas lanzadas (lanza, cuchillo) _________________________________________ */
// Al lanzarla sale de la mano (que queda vacía) a pj.armasLanzadas = [{ mano, equipo }]. La tirada y el
// daño están en ataque.js y la interfaz. Recoger: vuelve a su mano si está libre (gasta la acción de esa
// mano, o las dos si es a dos manos); si no, al inventario (gasta la acción de una mano libre).
// Las que no se recogen se pierden con el descanso (descansoCorto en zonas.js).

/** Armas lanzadas guardadas: solo lanzables y en una mano válida */
export function cargarArmasLanzadas(datos) {
    return (Array.isArray(datos) ? datos : [])
        .map(arma => ({ mano: MANOS.includes(arma?.mano) ? arma.mano : "manoDerecha", equipo: cargarEquipo(arma?.equipo) }))
        .filter(({ equipo }) => ARMAS[equipo.tipo]?.lanzable);
}

/** Motivo por el que no se puede lanzar el arma de esa mano, o null */
export function motivoNoLanzar(pj, mano) {
    if (!ARMAS[pj[mano]?.tipo]?.lanzable) return "Solo se pueden lanzar lanzas y cuchillos.";
    return null;
}

/** Saca el arma de la mano a las armas lanzadas (después de la tirada, que la interfaz hace antes) */
export function lanzarArma(pj, mano) {
    const motivo = motivoNoLanzar(pj, mano);
    if (motivo) return fallo(motivo);
    const equipo = pj[mano];
    equipo.enUso = false;
    equipo.pocionAplicada = null; // se ha gastado en el golpe
    pj.armasLanzadas.push({ mano, equipo });
    pj[mano] = new Equipamiento("", "", "");
    pj.calcularCaracteristicas();
    return exito(`Lanzas ${equipo.nombre?.trim() || ARMAS[equipo.tipo].etiqueta}`);
}

/** A dónde iría al recogerla: "mano" (la suya, si está libre), "inventario" o null si no cabe */
export function destinoRecoger(pj, indice) {
    const arma = pj.armasLanzadas?.[indice];
    if (!arma) return null;
    if (!motivoNoEquiparEnMano(pj, arma.equipo.tipo, arma.mano)) return "mano";
    return hayHuecoLibre(pj) ? "inventario" : null;
}

export function motivoNoRecoger(pj, indice) {
    if (!pj.armasLanzadas?.[indice]) return "Esa arma no está lanzada.";
    const destino = destinoRecoger(pj, indice);
    if (!destino) return "Su mano está ocupada y el inventario está lleno.";
    if (destino === "inventario" && !manoParaUsar(pj)) return "Necesitas una mano libre para recogerla.";
    return null;
}

/** Recoge un arma lanzada (a su mano o al inventario, ver destinoRecoger) */
export function recogerArma(pj, indice, gastar = gastarEstricto(pj)) {
    const motivo = motivoNoRecoger(pj, indice);
    if (motivo) return fallo(motivo);
    const { mano, equipo } = pj.armasLanzadas[indice];
    const nombre = equipo.nombre?.trim() || ARMAS[equipo.tipo].etiqueta;
    if (destinoRecoger(pj, indice) === "mano") {
        if (!gastar(partesDeMano(mano, TIPOS_DOS_MANOS.includes(equipo.tipo)), `Recoger ${nombre}`)) return fallo("Sin acción en esa mano.");
        pj[mano] = equipo;
    } else {
        if (!gastar([parteDeMano(manoParaUsar(pj))], `Recoger ${nombre}`)) return fallo("Sin acción en la mano libre.");
        anadirAInventario(pj, cargarObjeto({ tipo: "equipo", nombre, descripcion: equipo.descripcion || "", cantidad: 1, equipo: JSON.parse(JSON.stringify(equipo)) }));
    }
    pj.armasLanzadas.splice(indice, 1);
    pj.calcularCaracteristicas();
    return exito(pj[mano] === equipo ? `Recoges ${nombre} (${mano === "manoIzquierda" ? "mano izquierda" : "mano derecha"})` : `Recoges ${nombre} → inventario`);
}

/** Motivo por el que no se puede guardar lo equipado en esa ranura, o null. */
export function motivoNoGuardar(pj, ranura) {
    if (!ranuraTieneEquipo(pj, ranura)) return "No hay nada equipado.";
    const inhabilitado = motivoEscudoInhabilitado(pj, equipoEnRanura(pj, ranura));
    if (inhabilitado) return `${inhabilitado} No se puede guardar.`;
    if (!hayHuecoLibre(pj) && !baulAccesible(pj)) return "El inventario está lleno.";
    if (equipoEnRanura(pj, ranura)?.cinturon?.objetos.some(Boolean)) return "Vacía antes el cinturón: no se puede quitar con objetos.";
    if (ranura.startsWith("accesorio-") && !manoParaUsar(pj) && !esZonaSegura(pj)) return "Necesitas una mano libre para quitarte el accesorio.";
    return null;
}

/** Guarda en el inventario lo equipado en una ranura, con el mismo coste en acciones que equiparlo. En la base, con el
 *  inventario lleno, va al baúl. */
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
        if (!gastar(partesManoAccesorio(pj), `Quitarte ${nombre}`)) return fallo("Sin acción en la mano libre.");
    }

    const alBaul = !hayHuecoLibre(pj);
    (alBaul ? anadirABaul : anadirAInventario)(pj, objetoDeRanura(pj, ranura));
    vaciarRanura(pj, ranura);
    pj.calcularCaracteristicas();
    return exito(alBaul ? `${nombre} → baúl (el inventario está lleno)` : `${nombre} → inventario`);
}

/* Equipo (Equipamiento) a partir de un objeto de equipo del inventario o del baúl */
function equipoDeObjeto(objeto) {
    const equipo = cargarEquipo(JSON.parse(JSON.stringify(objeto.equipo)));
    equipo.nombre = objeto.nombre;
    equipo.descripcion = objeto.descripcion;
    equipo.enUso = false;
    return equipo;
}

/** Nombre que se muestra de un equipo puesto */
export function nombreEquipo(equipo) {
    return equipo?.nombre?.trim() || ARMAS[equipo?.tipo]?.etiqueta || "Equipo";
}

/* Objeto de inventario con una copia de lo equipado en la ranura (no cambia la ranura) */
function objetoDeRanura(pj, ranura) {
    const equipo = equipoEnRanura(pj, ranura);
    const datos = JSON.parse(JSON.stringify(equipo));
    datos.enUso = false;
    if (ranura.startsWith("accesorio-")) datos.tipo = TIPO_ACCESORIO;
    return cargarObjeto({ tipo: "equipo", nombre: nombreEquipo(equipo), descripcion: equipo.descripcion || "", cantidad: 1, equipo: datos });
}

function vaciarRanura(pj, ranura) {
    if (ranura.startsWith("accesorio-")) pj.accesorios[Number(ranura.slice("accesorio-".length))] = new Equipamiento("", "", TIPO_ACCESORIO);
    else pj[ranura] = new Equipamiento("", "", "");
}

/* Equipar intercambiando (zona segura o base) _________________________________
 * Allí no se gastan acciones, así que equipar sustituye lo que llevas: lo quitado va al mismo sitio del que sale el
 * objeto nuevo (inventario o baúl; en la base también se equipa desde el baúl). Si el cambio obliga a quitar más
 * cosas (la otra mano con un arma a dos manos o un estoque, los accesorios que no permite la armadura nueva), se
 * quitan también. Lo que no cabe en el inventario va al baúl en la base; en zona segura no se puede. */

/** ¿Equipar intercambia lo que llevas? Solo en zona segura o base */
export const equiparIntercambia = (pj) => esZonaSegura(pj);

const listaDeOrigen = (pj, origen) => origen === "baul" ? pj.baul : pj.inventario;

/* Motivo por el que no se puede quitar lo de esa ranura al intercambiar, o null */
function motivoNoQuitar(pj, ranura) {
    const equipo = equipoEnRanura(pj, ranura);
    const inhabilitado = motivoEscudoInhabilitado(pj, equipo);
    if (inhabilitado) return `${inhabilitado} No se puede quitar.`;
    if (equipo?.cinturon?.objetos.some(Boolean)) return `Vacía antes el cinturón de ${nombreEquipo(equipo)}: no se puede quitar con objetos.`;
    return null;
}

/* Ranuras que habría que quitar para poner este equipo en destino: { ranura, quitar } o { motivo } */
function quitarParaEquipar(pj, equipo, destino) {
    const tipo = equipo.tipo;
    let ranura = destino;
    const quitar = [];
    switch (categoriaEquipo(tipo)) {
        case "mano": {
            if (!MANOS.includes(destino)) return { motivo: "Elige una mano." };
            const otra = destino === "manoIzquierda" ? "manoDerecha" : "manoIzquierda";
            const conEnergia = (mano) => Boolean(pj.energiaManos?.[mano]) && !pj[mano]?.tipo;
            if (TIPOS_DOS_MANOS.includes(tipo)) {
                if (MANOS.some(conEnergia)) return { motivo: "Tienes energía de Sacro guardada en una mano." };
                quitar.push(...MANOS.filter(mano => pj[mano]?.tipo));
                break;
            }
            if (conEnergia(destino)) return { motivo: "En esa mano tienes energía de Sacro guardada." };
            const tipoOtra = pj[otra]?.tipo || "";
            if (pj[destino]?.tipo) quitar.push(destino);
            if (TIPOS_DOS_MANOS.includes(tipoOtra)
                || (tipo === "estoque" && tipoOtra && tipoOtra !== "escudo")
                || (tipoOtra === "estoque" && tipo !== "escudo")) quitar.push(otra);
            break;
        }
        case "armadura": {
            ranura = "equipoArmadura";
            if (pj.equipoArmadura?.tipo) quitar.push("equipoArmadura");
            const penalizacion = Number(equipo.penalizacionAtletismo) || 0;
            if (penalizacion > pj.getBaseHabilidad("atletismo")) {
                return { motivo: `Penaliza ${penalizacion} de Atletismo y solo tienes ${pj.getBaseHabilidad("atletismo")}: no puedes llevarla.` };
            }
            if (!pj.esNpc) {
                const permite = getCantidadAccesoriosPorArmadura(tipo);
                (pj.accesorios ?? []).forEach((acc, i) => { if (i >= permite && !accesorioVacio(acc)) quitar.push(`accesorio-${i}`); });
            }
            break;
        }
        case "accesorio": {
            const ranuras = ranurasAccesorio(pj);
            const i = Number(String(destino).slice("accesorio-".length));
            if (!String(destino).startsWith("accesorio-") || !(i >= 0 && i < ranuras)) {
                return { motivo: ranuras ? "Elige una ranura de accesorio." : "Tu armadura no permite accesorios." };
            }
            if (!accesorioVacio(pj.accesorios[i])) quitar.push(destino);
            break;
        }
        default:
            return { motivo: "Este equipo no tiene un tipo válido." };
    }
    for (const r of quitar) {
        const motivo = motivoNoQuitar(pj, r);
        if (motivo) return { motivo };
    }
    return { ranura, quitar };
}

/**
 * Dónde se puede equipar intercambiando: [{ destino, quitar: [ranuras], motivo? }].
 * Manos: una por mano (un arma a dos manos, solo la derecha). Armadura: una. Accesorio: la primera ranura libre o,
 * si no hay, una por accesorio puesto (se elige cuál sustituir).
 */
export function destinosIntercambio(pj, objeto) {
    if (objeto?.tipo !== "equipo") return [];
    const equipo = equipoDeObjeto(objeto);
    const opcion = (destino) => {
        const r = quitarParaEquipar(pj, equipo, destino);
        return r.motivo ? { destino, quitar: [], motivo: r.motivo } : { destino, quitar: r.quitar };
    };
    switch (categoriaEquipo(equipo.tipo)) {
        case "mano":
            return TIPOS_DOS_MANOS.includes(equipo.tipo) ? [opcion("manoDerecha")] : MANOS.map(opcion);
        case "armadura":
            return [opcion("equipoArmadura")];
        case "accesorio": {
            const ranuras = ranurasAccesorio(pj);
            if (!ranuras) return [{ destino: null, quitar: [], motivo: "Tu armadura no permite accesorios." }];
            const libre = ranuraAccesorioLibre(pj);
            if (libre >= 0) return [opcion(`accesorio-${libre}`)];
            return Array.from({ length: ranuras }, (_, i) => opcion(`accesorio-${i}`));
        }
        default:
            return [{ destino: null, quitar: [], motivo: "Este equipo no tiene un tipo válido." }];
    }
}

/**
 * Plan de equipar intercambiando, sin cambiar nada: { ranura, quitar: [ranuras], alBaul: [ranuras], motivo }.
 * alBaul: lo quitado que no cabe en el inventario (solo desde el inventario; en la base va al baúl).
 */
export function planIntercambio(pj, origen, indice, destino) {
    const vacio = { ranura: null, quitar: [], alBaul: [] };
    if (!equiparIntercambia(pj)) return { ...vacio, motivo: "Solo se intercambia el equipo en zona segura o en la base." };
    if (origen === "baul" && !baulAccesible(pj)) return { ...vacio, motivo: "Solo en la base se puede usar el baúl." };
    const objeto = listaDeOrigen(pj, origen)[indice];
    if (objeto?.tipo !== "equipo") return { ...vacio, motivo: "No es equipamiento." };
    const r = quitarParaEquipar(pj, equipoDeObjeto(objeto), destino);
    if (r.motivo) return { ...vacio, motivo: r.motivo };
    const alBaul = [];
    if (origen === "inventario") {
        // Lo primero que se quita va al hueco que deja el objeto; el resto, donde quepa
        const copia = pj.inventario.map(hueco => hueco && { ...hueco });
        const capacidad = capacidadInventario(pj);
        copia[indice] = null;
        r.quitar.forEach((ranura, k) => {
            const quitado = objetoDeRanura(pj, ranura);
            if (k === 0 && indice < capacidad) copia[indice] = quitado;
            else if (apilarEnInventario(pj, copia, quitado) > 0) alBaul.push(ranura);
        });
        if (alBaul.length && !baulAccesible(pj)) {
            return { ...vacio, motivo: `No cabe${alBaul.length === 1 ? "" : "n"} en el inventario: ${alBaul.map(x => nombreEquipo(equipoEnRanura(pj, x))).join(", ")}.` };
        }
    }
    return { ranura: r.ranura, quitar: r.quitar, alBaul, motivo: null };
}

/** Equipa desde el inventario o el baúl sustituyendo lo que haga falta (ver planIntercambio). No gasta acciones. */
export function equiparIntercambiando(pj, origen, indice, destino) {
    const plan = planIntercambio(pj, origen, indice, destino);
    if (plan.motivo) return fallo(plan.motivo);
    const lista = listaDeOrigen(pj, origen);
    const objeto = lista[indice];
    const equipo = equipoDeObjeto(objeto);
    const quitados = plan.quitar.map(ranura => ({ ranura, objeto: objetoDeRanura(pj, ranura) }));
    plan.quitar.forEach(ranura => vaciarRanura(pj, ranura));

    // Sale el objeto de su sitio y entra lo quitado
    const resumen = [`Equipas ${objeto.nombre}`];
    if (origen === "baul") {
        if (objeto.cantidad > 1) objeto.cantidad -= 1;
        else lista.splice(indice, 1);
        quitados.forEach(q => { anadirABaul(pj, q.objeto); resumen.push(`${q.objeto.nombre} → baúl`); });
    } else {
        lista[indice] = null;
        quitados.forEach((q, k) => {
            if (plan.alBaul.includes(q.ranura)) {
                anadirABaul(pj, q.objeto);
                resumen.push(`${q.objeto.nombre} → baúl (no cabe en el inventario)`);
                return;
            }
            if (k === 0 && indice < capacidadInventario(pj)) lista[indice] = q.objeto;
            else anadirAInventario(pj, q.objeto);
            resumen.push(`${q.objeto.nombre} → inventario`);
        });
    }

    // Se pone el nuevo
    if (plan.ranura.startsWith("accesorio-")) {
        const i = Number(plan.ranura.slice("accesorio-".length));
        for (let k = pj.accesorios.length; k < i; k++) pj.accesorios[k] = new Equipamiento("", "", TIPO_ACCESORIO);
        pj.accesorios[i] = equipo;
    } else {
        pj[plan.ranura] = equipo;
    }
    pj.calcularCaracteristicas();
    return exito(...resumen);
}
