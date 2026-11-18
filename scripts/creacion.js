/* Creación de objetos por profesión, sin DOM (ventanas en interfazCreacion.js).
 *
 * El jugador junta 2 o más unidades de materiales del subtipo del objeto, describe lo que quiere y tira
 * (dado + característica del tipo + Profesión). Los materiales quedan apartados (como en el trueque) hasta que el
 * máster decide: enviar lo creado (los materiales se gastan), perder los materiales o devolverlos.
 *
 * pj.creacion (se guarda con la ficha): la creación en espera, o null
 *   { id, tipo, materiales: [{ objeto, origen }], descripcion, tirada, dificultad, hora }
 *   tirada: { total, dados, dadoUsado, critico, pifia, caracteristica, valorCaracteristica, valorProfesion } */
import { cargarObjeto } from "./objetos.js";
import { disponiblesTrueque, apartarOferta, devolverOferta, cargarOferta } from "./trueque.js";
import { esZonaSegura } from "./zonas.js";

/* Tipos de objeto que se pueden crear. profesiones: null = cualquiera. objeto/tipoEquipo: lo que se preselecciona
   en el formulario del máster. */
export const TIPOS_CREACION = {
    cristal: { etiqueta: "Cristal", icono: "cristal", profesiones: null, material: "cristal", caracteristica: "inteligencia", objeto: "cristal" },
    accesorio: { etiqueta: "Accesorio", icono: "accesorio", profesiones: ["armero"], material: "herreria", caracteristica: "voluntad", objeto: "equipo", tipoEquipo: "accesorio" },
    armadura: { etiqueta: "Armadura", icono: "armadura", profesiones: ["armero"], material: "herreria", caracteristica: "voluntad", objeto: "equipo", tipoEquipo: "ligera" },
    arma: { etiqueta: "Arma", icono: "espada", profesiones: ["herrero"], material: "herreria", caracteristica: "voluntad", objeto: "equipo", tipoEquipo: "espada" },
    arrojadiza: { etiqueta: "Arma arrojadiza", icono: "arrojadiza", profesiones: ["herrero"], material: "herreria", caracteristica: "voluntad", objeto: "arrojadiza" },
    comida: { etiqueta: "Comida", icono: "comida", profesiones: ["cocinero"], material: "cocina", caracteristica: "voluntad", objeto: "comida" },
    pocion: { etiqueta: "Poción", icono: "pocion", profesiones: ["alquimista"], material: "alquimia", caracteristica: "voluntad", objeto: "pocion" }
};

/* Nombre de cada oficio (igual que PROFESIONES de resumenFicha.js, que importa PJ.js: aquí no para no hacer ciclo) */
const OFICIOS = { herrero: "herrero", armero: "armero", cocinero: "cocinero", alquimista: "alquimista" };

export const ETIQUETAS_CARACTERISTICA = { inteligencia: "Inteligencia", voluntad: "Voluntad" };

/** Unidades de material mínimas para crear algo */
export const MIN_UNIDADES_MATERIAL = 2;
export const MAX_DESCRIPCION_CREACION = 1000;
/** Máximo de objetos que el máster envía de una vez */
export const MAX_OBJETOS_CREADOS = 10;
const MAX_MATERIALES = 30;

const entero = (valor, maximo = 1e6) => Math.max(0, Math.min(maximo, Math.floor(Number(valor) || 0)));
const texto = (valor, maximo) => String(valor ?? "").slice(0, maximo);

/** Motivo por el que este personaje no puede crear ese tipo, o null. Sin tipo: si puede crear algo. */
export function motivoNoCrear(pj, tipo = null) {
    if (pj.esNpc) return "Los NPC no crean objetos.";
    if (pj.creacion) return "Ya estás esperando el resultado de otra creación.";
    if (!esZonaSegura(pj)) return "Solo se pueden crear objetos en zona segura o en la base.";
    if (!tipo) return null;
    const info = TIPOS_CREACION[tipo];
    if (!info) return "Elige qué quieres crear.";
    return motivoProfesion(pj, tipo);
}

/** Motivo por el que la profesión del personaje no crea ese tipo, o null (los cristales los crea cualquiera) */
export function motivoProfesion(pj, tipo) {
    const profesiones = TIPOS_CREACION[tipo]?.profesiones;
    if (!profesiones || profesiones.includes(pj.tipoProfesion)) return null;
    return `Lo crea un ${profesiones.map(p => OFICIOS[p] ?? p).join(" o ")}.`;
}

/** Materiales que sirven para ese tipo: del inventario y, en la base, del baúl. [{ origen, indice, objeto }] */
export function materialesDisponibles(pj, tipo) {
    const material = TIPOS_CREACION[tipo]?.material;
    if (!material) return [];
    return disponiblesTrueque(pj).objetos.filter(({ objeto }) => objeto.tipo === "material" && objeto.subtipo === material);
}

/** Unidades en total de una lista de materiales ([{ objeto }]) */
export const unidadesMateriales = (materiales) => (materiales ?? []).reduce((suma, { objeto }) => suma + (Number(objeto?.cantidad) || 0), 0);

/** Dificultad: 10 × la potencia media por unidad + 5 */
export function dificultadCreacion(materiales) {
    const unidades = unidadesMateriales(materiales);
    if (!unidades) return 5;
    const potencia = materiales.reduce((suma, { objeto }) => suma + (Number(objeto.potencia) || 0) * (Number(objeto.cantidad) || 0), 0);
    return Math.round(10 * potencia / unidades) + 5;
}

/** Sugerencia para el máster según la diferencia entre la tirada y la dificultad */
export function sugerenciaCreacion(diferencia, critico = false) {
    const lineas = [];
    if (diferencia <= -5) lineas.push("Se pierden los materiales.");
    else if (diferencia <= -1) lineas.push("Se crea el objeto con una calidad peor.");
    else if (diferencia <= 3) lineas.push("Se crea el objeto de la calidad correspondiente.");
    else lineas.push("Se crea el objeto con un efecto extra.");
    if (critico) lineas.push("Crítico: categoría superior o dos efectos extra.");
    return lineas;
}

/**
 * Aparta los materiales elegidos (seleccion = [{ origen, indice, cantidad }]) para ese tipo.
 * @returns {{ ok: boolean, resumen: string[], materiales?: { objeto, origen }[] }}
 */
export function apartarMateriales(pj, tipo, seleccion) {
    const fallo = (motivo) => ({ ok: false, resumen: [motivo] });
    const motivo = motivoNoCrear(pj, tipo);
    if (motivo) return fallo(motivo);
    const material = TIPOS_CREACION[tipo].material;
    const lista = (origen) => (origen === "baul" ? pj.baul : pj.inventario);
    const filas = (seleccion ?? []).filter(f => entero(f.cantidad) > 0);
    if (filas.some(f => lista(f.origen)?.[f.indice]?.tipo !== "material" || lista(f.origen)[f.indice].subtipo !== material)) {
        return fallo("Solo se pueden usar materiales del tipo que pide el objeto.");
    }
    const unidades = filas.reduce((suma, f) => suma + entero(f.cantidad), 0);
    if (unidades < MIN_UNIDADES_MATERIAL) return fallo(`Hacen falta al menos ${MIN_UNIDADES_MATERIAL} unidades de material.`);
    const resultado = apartarOferta(pj, { objetos: filas, objetosClave: [], cor: 0 });
    if (!resultado.ok) return resultado;
    return { ok: true, resumen: resultado.resumen, materiales: resultado.oferta.objetos };
}

/** Devuelve los materiales apartados a su sitio (lo que no cabe, al botín). @returns {string[]} */
export function devolverMateriales(pj, materiales) {
    return devolverOferta(pj, { objetos: materiales ?? [], objetosClave: [], cor: 0 });
}

function cargarTirada(datos) {
    const total = Math.trunc(Number(datos?.total) || 0);
    const valorCaracteristica = Math.trunc(Number(datos?.valorCaracteristica) || 0);
    const valorProfesion = Math.trunc(Number(datos?.valorProfesion) || 0);
    // El dado que cuenta (sin el dato, el que da el total con los sumandos)
    const dadoUsado = datos?.dadoUsado != null ? entero(datos.dadoUsado, 10) : entero(total - valorCaracteristica - valorProfesion, 10);
    return {
        total,
        dados: (Array.isArray(datos?.dados) ? datos.dados : []).slice(0, 3).map(d => entero(d, 10)),
        dadoUsado,
        critico: entero(datos?.critico, 10),
        pifia: entero(datos?.pifia, 10),
        caracteristica: ETIQUETAS_CARACTERISTICA[datos?.caracteristica] ? datos.caracteristica : "voluntad",
        valorCaracteristica,
        valorProfesion
    };
}

/** Normaliza una creación (la guardada en la ficha o la que llega de otro jugador). null si no es válida. */
export function cargarCreacion(datos) {
    if (!datos || typeof datos !== "object" || !datos.id || !TIPOS_CREACION[datos.tipo]) return null;
    const materiales = cargarOferta({ objetos: Array.isArray(datos.materiales) ? datos.materiales.slice(0, MAX_MATERIALES) : [] }).objetos;
    return {
        id: texto(datos.id, 80),
        tipo: datos.tipo,
        materiales,
        descripcion: texto(datos.descripcion, MAX_DESCRIPCION_CREACION),
        tirada: cargarTirada(datos.tirada),
        // Soñar despierto: tirada extra de Voluntad (dado + Voluntad, con ventaja); el máster puede encantar el objeto
        sonarDespierto: datos.sonarDespierto && typeof datos.sonarDespierto === "object"
            ? cargarTirada({ ...datos.sonarDespierto, caracteristica: "voluntad", valorProfesion: 0 }) : null,
        dificultad: dificultadCreacion(materiales),
        hora: texto(datos.hora, 40)
    };
}

/** Objetos que envía el máster, validados */
export function cargarObjetosCreados(lista) {
    return (Array.isArray(lista) ? lista : []).slice(0, MAX_OBJETOS_CREADOS).map(cargarObjeto).filter(Boolean);
}

/** Id nuevo para una creación */
export function nuevoIdCreacion() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `cr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
