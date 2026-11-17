/* Creación de objetos por profesión: ventana del jugador (#modalCreacion) y del máster (#modalCreacionMaster).
 * Reglas en creacion.js.
 *
 * Jugador: pulsar Profesión (zona segura o base) abre #modalCreacion: tipo, materiales y descripción. Al crear se
 * tira (dado + característica del tipo + Profesión; el pop-up es el de siempre, el grupo lo ve completo), los
 * materiales quedan apartados en pj.creacion y se envía el evento privado "creacion" al máster. Mientras espera, la
 * ventana muestra la tirada y deja cancelar (vuelven los materiales, evento "creacionCancelada").
 *
 * Máster: las peticiones van a una cola (localStorage fichaSAO.creacionesMaster) y se abren en #modalCreacionMaster:
 * a la izquierda los objetos que recibe (se crean con #modalCrearObjeto sobre un pj falso), a la derecha la tirada,
 * la dificultad, la sugerencia, los materiales y la descripción. Enviar, "Se pierden los materiales" o "Devolver
 * materiales" mandan "creacionResultado" ({ id, resultado, objetos }) y cierran la ventana (si hay más, se abre la
 * siguiente). Cerrarla sin elegir pide confirmación y los materiales se pierden. Las que llegan con la ventana
 * ocupada o tras recargar quedan pendientes (menú del inventario).
 * Los personajes del propio máster no envían nada: su petición entra en la cola y el resultado se aplica aquí.
 *
 * Historial (historialCreaciones.js, solo máster): lo enviado se apunta como receta (tipo + materiales con cantidades
 * → objetos). Una petición con la misma receta trae esos objetos propuestos y el panel muestra la diferencia de
 * entonces; si se envía otra cosa, el interruptor "Sobrescribir en el historial" (apagado) decide si se cambia.
 * Ventana #modalHistorialCreaciones (botón Historial o menú de opciones: ver, exportar, importar), sincronizada con
 * la nube como el compendio de objetos (historialesCreacion/{uid}).
 *
 * Eventos privados con para: PARA_TODOS (el resultado vale aunque el jugador haya recargado y cambiado de pestaña):
 * "creacion" solo lo atiende la pestaña en modo máster del máster de la sala; "creacionResultado" solo se acepta si
 * lo envía el máster de la sala y el id coincide con pj.creacion.
 *
 * ctx (inicializarCreacion, desde interfaz.js): esMaster, personaje(), enLectura(), aviso(titulo, lineas),
 *   iconoObjeto(objeto), detalleObjeto(objeto), leerPersonaje(instancia), conPersonaje(instancia, fn),
 *   abrirBotin(instancia), abrirCrearObjeto(lista, opciones), abrirEditorObjeto(lista, indice, opciones),
 *   confirmar({ titulo, texto }), tirar(opciones) → resultado de ejecutarTirada o null (borracho),
 *   crearVentanaHija(modal). */
import {
    TIPOS_CREACION, ETIQUETAS_CARACTERISTICA, MIN_UNIDADES_MATERIAL, MAX_DESCRIPCION_CREACION, motivoNoCrear, motivoProfesion,
    materialesDisponibles, unidadesMateriales, sugerenciaCreacion, apartarMateriales,
    devolverMateriales, cargarCreacion, cargarObjetosCreados, nuevoIdCreacion
} from "./creacion.js";
import * as historial from "./historialCreaciones.js";
import { getEstadoOnline, soyMasterDeSala, esDelMasterDeSala, leerHistorialCreacionesNube, guardarHistorialCreacionesNube,
    usuarioOnline, haySesionOnline, alCambiarSesionOnline, mensajeErrorOnline } from "./interfazOnline.js";
import { emitirPrivado, emitirEvento, registrarManejador, instanciaEmisora, PARA_TODOS } from "./eventos.js";
import { prepararFormularioSao } from "./formularioSao.js";
import { iconoSao } from "./iconos.js";
import { escaparHtml } from "./html.js";
import { reproducir } from "./sonidos.js";
import { anadirNuevosAlCompendio } from "./interfazCompendioObjetos.js";

let ctx = null;
const el = (id) => document.getElementById(id);
const ventana = () => el("modalCreacion");
const ventanaMaster = () => el("modalCreacionMaster");
const entero = (valor) => Math.max(0, Math.min(1e6, Math.floor(Number(valor) || 0)));
const nombreDe = (pj) => String(pj?.nombre ?? "").trim() || "Sin nombre";

/* Lo que se está eligiendo en la ventana del jugador */
const seleccion = { tipo: "cristal", cantidades: new Map() }; // "origen:indice" → cantidad

/* Personaje que crea: el de la ficha (en modo máster, con su instancia "m-<id>") */
const instanciaYo = () => instanciaEmisora();
const leerYo = () => ctx.leerPersonaje(instanciaYo());

/* Muestra una ventana cuando no hay otra a la vista (si ya está abierta, la repinta) */
function mostrarCuandoSePueda(modalEl, pintar) {
    if (modalEl.classList.contains("show")) {
        pintar();
        return;
    }
    const otra = document.querySelector(`.modal.show:not(#${modalEl.id})`);
    if (otra) {
        otra.addEventListener("hidden.bs.modal", () => setTimeout(() => mostrarCuandoSePueda(modalEl, pintar), 50), { once: true });
        return;
    }
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

/* HTML común _____________________________________________________________________ */

function filaMaterial(objeto, { extra = "", clave = "", elegida = false } = {}) {
    return `<div class="fila-objeto${clave ? " fila-trueque" : ""}${elegida ? " elegida" : ""}"${clave ? ` data-clave="${clave}"` : ""}>
        <span class="objeto-icono">${iconoSao(ctx.iconoObjeto(objeto))}</span>
        <div class="objeto-info">
            <div class="objeto-cabecera"><span class="objeto-nombre">${escaparHtml(objeto.nombre)}</span><span class="objeto-cantidad">×${objeto.cantidad}</span></div>
            <div class="objeto-detalle">${escaparHtml(ctx.detalleObjeto(objeto))}</div>
            ${objeto.descripcion ? `<div class="objeto-descripcion">${escaparHtml(objeto.descripcion)}</div>` : ""}
        </div>
        ${extra}
    </div>`;
}

/* Los tres dados, con el que cuenta resaltado (como en el pop-up de la tirada, dados.js) */
function htmlDados(tirada) {
    let marcado = false;
    return tirada.dados.map(d => {
        const usado = !marcado && d === tirada.dadoUsado;
        if (usado) marcado = true;
        return `<span class="dado-chip${usado ? " dado-seleccionado" : ""}">${d}</span>`;
    }).join("");
}

/* Tirada, dificultad, (sugerencia), materiales y descripción de una creación. master: con la sugerencia */
function htmlDetalle(creacion, { master = false } = {}) {
    const { tirada, dificultad } = creacion;
    const diferencia = tirada.total - dificultad;
    const critico = tirada.critico >= 2;
    const pifia = !critico && tirada.pifia >= 2;
    const caracteristica = ETIQUETAS_CARACTERISTICA[tirada.caracteristica];
    const signo = diferencia > 0 ? `+${diferencia}` : String(diferencia);
    return `
        <h6 class="panel-protagonistas-titulo">Tirada <small>${escaparHtml(TIPOS_CREACION[creacion.tipo].etiqueta)}</small></h6>
        <div class="creacion-tirada">
            <span class="creacion-total">${tirada.total}</span>
            <div class="creacion-tirada-detalle">
                <span>Dados: ${htmlDados(tirada)}</span>
                <span>${caracteristica} ${tirada.valorCaracteristica} + Profesión ${tirada.valorProfesion}</span>
                ${critico ? `<span class="creacion-marca positivo">Crítico</span>` : ""}${pifia ? `<span class="creacion-marca negativo">Pifia</span>` : ""}
            </div>
        </div>
        <p class="creacion-dificultad">Dificultad <b>${dificultad}</b> · Diferencia <b class="${diferencia >= 0 ? "positivo" : "negativo"}">${signo}</b></p>
        ${master ? `<h6 class="panel-protagonistas-titulo">Sugerencia</h6>
        <ul class="creacion-sugerencia">${sugerenciaCreacion(diferencia, critico).map(l => `<li>${escaparHtml(l)}</li>`).join("")}</ul>` : ""}
        <h6 class="panel-protagonistas-titulo">Materiales <small>${unidadesMateriales(creacion.materiales)} unidades</small></h6>
        <div class="lista-objetos">${creacion.materiales.map(({ objeto }) => filaMaterial(objeto)).join("")}</div>
        <h6 class="panel-protagonistas-titulo">Descripción</h6>
        <p class="creacion-descripcion">${escaparHtml(creacion.descripcion) || "<i>Sin descripción</i>"}</p>`;
}

/* Ventana del jugador ______________________________________________________________ */

/* Lo elegido, como lo pide apartarMateriales, y como materiales para calcular la dificultad */
function seleccionActual(pj) {
    const disponibles = materialesDisponibles(pj, seleccion.tipo);
    const filas = [];
    const materiales = [];
    for (const { origen, indice, objeto } of disponibles) {
        const cantidad = Math.min(objeto.cantidad, seleccion.cantidades.get(`${origen}:${indice}`) ?? 0);
        if (cantidad <= 0) continue;
        filas.push({ origen, indice, cantidad });
        materiales.push({ objeto: { ...objeto, cantidad }, origen });
    }
    return { filas, materiales };
}

/* Motivo por el que no se puede crear nada ahora (el botón sale desactivado), o null */
function motivoBotonCrear(pj) {
    const motivo = motivoNoCrear(pj, seleccion.tipo);
    if (motivo) return motivo;
    if (!ctx.esMaster && !getEstadoOnline().sala) return "Entra en una sala: el máster decide el resultado.";
    return null;
}

/* Lo que falta por rellenar (se avisa al pulsar Crear) */
function faltaParaCrear(pj) {
    const faltas = [];
    if (unidadesMateriales(seleccionActual(pj).materiales) < MIN_UNIDADES_MATERIAL) faltas.push(`Elige al menos ${MIN_UNIDADES_MATERIAL} unidades de material.`);
    if (!el("descripcionCreacion").value.trim()) faltas.push("Describe qué quieres crear.");
    return faltas;
}

function pintarBotonCrear(pj) {
    const boton = el("btnCrearCreacion");
    const motivo = pj.creacion ? null : motivoBotonCrear(pj);
    boton.hidden = Boolean(pj.creacion);
    boton.disabled = Boolean(motivo);
    boton.title = motivo ?? "Crear";
    boton.setAttribute("aria-label", motivo ?? "Crear");
}

function pintarResumen(pj) {
    const { materiales } = seleccionActual(pj);
    const unidades = unidadesMateriales(materiales);
    el("resumenMaterialesCreacion").textContent = unidades
        ? `${unidades} ${unidades === 1 ? "unidad" : "unidades"}`
        : `mínimo ${MIN_UNIDADES_MATERIAL} unidades`;
    pintarBotonCrear(pj);
}

function pintarElegir(pj) {
    // Tipos: los que no son de tu profesión salen desactivados con el motivo
    if (motivoProfesion(pj, seleccion.tipo)) seleccion.tipo = "cristal";
    el("tiposCreacion").innerHTML = Object.entries(TIPOS_CREACION).map(([clave, info]) => {
        const motivo = motivoProfesion(pj, clave) ?? "";
        return `<button type="button" class="ficha-sao" role="radio" data-valor="${clave}" aria-checked="${clave === seleccion.tipo}"
            ${motivo ? `disabled title="${escaparHtml(motivo)}"` : ""}>
            <span class="ficha-icono">${iconoSao(info.icono)}</span><span>${escaparHtml(info.etiqueta)}</span></button>`;
    }).join("");

    const disponibles = materialesDisponibles(pj, seleccion.tipo);
    el("listaMaterialesCreacion").innerHTML = disponibles.length ? disponibles.map(({ origen, indice, objeto }) => {
        const clave = `${origen}:${indice}`;
        const valor = Math.min(objeto.cantidad, seleccion.cantidades.get(clave) ?? 0);
        const extra = `<div class="objeto-acciones">
            <input type="number" class="cantidad-trueque" data-clave="${clave}" min="0" max="${objeto.cantidad}" value="${valor}"
                aria-label="Unidades de ${escaparHtml(objeto.nombre)} que usas">
        </div>`;
        return filaMaterial({ ...objeto, descripcion: `${origen === "baul" ? "Baúl" : "Inventario"}${objeto.descripcion ? ` · ${objeto.descripcion}` : ""}` },
            { extra, clave, elegida: valor > 0 });
    }).join("") : `<p class="lista-vacia">No tienes materiales de este tipo (${escaparHtml(TIPOS_CREACION[seleccion.tipo].etiqueta.toLowerCase())}).</p>`;
    pintarResumen(pj);
}

function pintar() {
    const pj = leerYo();
    const esperando = Boolean(pj.creacion);
    el("vistaElegirCreacion").hidden = esperando;
    el("vistaEsperaCreacion").hidden = !esperando;
    const motivo = esperando ? null : motivoNoCrear(pj);
    el("avisoCreacion").hidden = !motivo;
    el("avisoCreacion").textContent = motivo ?? "";
    if (esperando) {
        el("detalleEsperaCreacion").innerHTML = htmlDetalle(pj.creacion);
        pintarBotonCrear(pj);
    } else {
        pintarElegir(pj);
    }
}

/** Abre la ventana de creación (botón de Profesión en zona segura o base) */
export function abrirCreacion() {
    if (!ctx || ctx.enLectura()) return;
    seleccion.cantidades.clear();
    el("descripcionCreacion").value = "";
    bootstrap.Modal.getOrCreateInstance(ventana()).show();
}

function crear() {
    const pj = leerYo();
    const motivo = motivoBotonCrear(pj);
    if (motivo) return ctx.aviso("No se puede", [motivo]);
    const faltas = faltaParaCrear(pj);
    if (faltas.length) return ctx.aviso("Falta algo para crear", faltas);
    const tipo = seleccion.tipo;
    const info = TIPOS_CREACION[tipo];
    const { filas } = seleccionActual(pj);
    const descripcion = el("descripcionCreacion").value.trim().slice(0, MAX_DESCRIPCION_CREACION);
    const valorCaracteristica = Number(pj[info.caracteristica]) || 0;
    const valorProfesion = Math.max(0, Number(pj.getGenerico("profesion")) || 0);

    // Borracho: puede fallar antes de tirar (no se aparta nada)
    const resultado = ctx.tirar({
        nombreAccion: `Crear: ${info.etiqueta}`,
        valorHabilidad: valorProfesion,
        etiquetaHabilidad: "Profesión",
        valorCaracteristica,
        etiquetaCaracteristica: ETIQUETAS_CARACTERISTICA[info.caracteristica]
    });
    if (!resultado) return;

    const instancia = instanciaYo();
    const apartado = ctx.conPersonaje(instancia, p => {
        const r = apartarMateriales(p, tipo, filas);
        if (!r.ok) return r;
        p.creacion = cargarCreacion({
            id: nuevoIdCreacion(), tipo, materiales: r.materiales, descripcion, hora: new Date().toISOString(),
            tirada: {
                total: resultado.total, dados: resultado.dados, dadoUsado: resultado.resultadoDados,
                critico: resultado.critico, pifia: resultado.pifia,
                caracteristica: info.caracteristica, valorCaracteristica, valorProfesion
            }
        });
        return r;
    });
    if (!apartado?.ok) return ctx.aviso("No se puede", apartado?.resumen ?? ["No se encuentra el personaje."]);
    reproducir("click");
    const creacion = leerYo().creacion;
    seleccion.cantidades.clear();

    // Un personaje del máster: la petición entra directamente en su cola
    if (ctx.esMaster) {
        encolar({ id: creacion.id, creacion, de: { instancia, nombre: nombreDe(pj), local: true }, objetos: [] });
        pintar();
        bootstrap.Modal.getInstance(ventana())?.hide();
        abrirCreacionesMaster();
        return;
    }
    pintar();
    emitirPrivado("creacion", { para: PARA_TODOS, creacion }).catch(error => {
        // No ha salido: se deshace (vuelven los materiales)
        ctx.conPersonaje(instancia, p => {
            if (p.creacion?.id !== creacion.id) return;
            devolverMateriales(p, p.creacion.materiales);
            p.creacion = null;
        });
        ctx.aviso("Creación", [`No se pudo enviar al máster: ${error.message ?? error}`, "Los materiales vuelven a su sitio."]);
        if (ventana().classList.contains("show")) pintar();
    });
}

async function cancelarCreacion() {
    const pj = leerYo();
    if (!pj.creacion) return;
    const ok = await ctx.confirmar({ titulo: "Cancelar creación", texto: "¿Cancelar la creación? Los materiales vuelven a su sitio." });
    if (!ok) return;
    const instancia = instanciaYo();
    const id = pj.creacion.id;
    const resumen = ctx.conPersonaje(instancia, p => {
        if (p.creacion?.id !== id) return [];
        const lineas = devolverMateriales(p, p.creacion.materiales);
        p.creacion = null;
        return lineas;
    }) ?? [];
    if (ctx.esMaster) quitarDeCola(id);
    else emitirPrivado("creacionCancelada", { para: PARA_TODOS, id }).catch(() => {});
    ctx.aviso("Creación cancelada", resumen);
    if (ventana().classList.contains("show")) pintar();
}

/* Resultado del máster en el personaje de esa instancia (null = el de la ficha) */
function aplicarResultado(instancia, id, resultado, objetos) {
    const pj = ctx.leerPersonaje(instancia);
    if (pj?.creacion?.id !== id) return;
    const tipo = TIPOS_CREACION[pj.creacion.tipo]?.etiqueta ?? "objeto";
    const lineas = ctx.conPersonaje(instancia, p => {
        const { materiales } = p.creacion;
        p.creacion = null;
        if (resultado === "devuelto") return ["El máster ha devuelto los materiales.", ...devolverMateriales(p, materiales)];
        if (resultado === "perdido" || !objetos.length) return ["Los materiales se han perdido."];
        p.botin.push(...objetos);
        return [`Recibes: ${objetos.map(o => `${o.nombre} ×${o.cantidad}`).join(", ")}`, "Los objetos están en el botín (menú del inventario)."];
    }) ?? [];
    reproducir("notificacion");
    const nombre = nombreDe(ctx.leerPersonaje(instancia));
    ctx.aviso(`Creación (${tipo})`, lineas);
    if (ventana().classList.contains("show")) bootstrap.Modal.getInstance(ventana())?.hide();
    if (resultado === "enviado" && objetos.length) {
        // Lo ven todos en la sala (el grupo y los demás)
        emitirEvento("objeto", {
            titulo: `${nombre} ha creado ${objetos.map(o => o.nombre).join(", ")}`,
            subtitulo: `Creación · ${tipo}`,
            lineas: objetos.map(o => `${o.nombre} ×${o.cantidad}`)
        }, instancia ? { instancia, personaje: nombre } : {});
        ctx.abrirBotin(instancia ?? instanciaEmisora());
    }
}

function recibirResultado(evento) {
    if (ctx.esMaster || !esDelMasterDeSala(evento)) return;
    const d = evento.datos ?? {};
    const resultado = ["enviado", "perdido", "devuelto"].includes(d.resultado) ? d.resultado : null;
    if (!resultado || !d.id) return;
    aplicarResultado(null, String(d.id), resultado, resultado === "enviado" ? cargarObjetosCreados(d.objetos) : []);
}

/* Máster: cola de peticiones _______________________________________________________ */

const CLAVE_COLA = "fichaSAO.creacionesMaster";
/* [{ id, creacion, de: { instancia, nombre, local }, objetos }] */
let cola = [];
let actual = 0;

function leerCola() {
    try {
        const datos = JSON.parse(localStorage.getItem(CLAVE_COLA) ?? "[]");
        cola = (Array.isArray(datos) ? datos : []).map(p => {
            const creacion = cargarCreacion(p?.creacion);
            if (!creacion) return null;
            return {
                id: creacion.id, creacion,
                de: { instancia: String(p.de?.instancia ?? ""), jugador: String(p.de?.jugador ?? ""), nombre: String(p.de?.nombre ?? "").slice(0, 60) || "Alguien", local: Boolean(p.de?.local) },
                objetos: cargarObjetosCreados(p.objetos),
                propuesta: Boolean(p.propuesta) // ya se propusieron los objetos del historial
            };
        }).filter(Boolean);
    } catch {
        cola = [];
    }
}

function guardarCola() {
    try { localStorage.setItem(CLAVE_COLA, JSON.stringify(cola)); } catch { /* sin almacenamiento: solo en memoria */ }
}

function encolar(peticion) {
    if (cola.some(p => p.id === peticion.id)) return;
    cola.push(peticion);
    guardarCola();
}

function quitarDeCola(id) {
    const i = cola.findIndex(p => p.id === id);
    if (i < 0) return;
    const eraLaActual = i === actual;
    cola.splice(i, 1);
    if (i < actual) actual--;
    if (actual >= cola.length) actual = 0;
    guardarCola();
    if (!masterAbierta) return;
    // Resuelta (o cancelada) la que se veía: la ventana se cierra; si quedan más, se abre la siguiente
    if (eraLaActual) cerrarMaster();
    else pintarMaster();
}

/* Cierre de la ventana del máster. Cerrarla sin resolver la petición pide confirmación y los materiales se pierden.
   cerrandoResuelta: la cierra el código (petición ya resuelta), sin preguntar.
   yendoAHija: se oculta para abrir el formulario de objetos o una confirmación, y vuelve. */
let cerrandoResuelta = false;
let yendoAHija = false;
/* Abierta o abriéndose (al volver de una confirmación aún no tiene la clase show) */
let masterAbierta = false;

function cerrarMaster() {
    cerrandoResuelta = true;
    // Bootstrap ignora hide() mientras se está abriendo (p. ej. al volver de una confirmación): se repite en shown
    bootstrap.Modal.getInstance(ventanaMaster())?.hide();
}

function alOcultarMaster(e) {
    const modalEl = ventanaMaster();
    if (cerrandoResuelta || yendoAHija || modalEl.dataset.haciaHija || !cola[actual]) return;
    e.preventDefault();
    const peticion = cola[actual];
    setTimeout(async () => {
        const ok = await ctx.confirmar({
            titulo: "Cerrar sin resolver",
            texto: `Si cierras sin elegir nada, ${peticion.de.nombre} perderá los materiales. ¿Cerrar?`
        });
        if (ok && cola[actual] === peticion) resolver("perdido", { confirmado: true });
    }, 0);
}

function alOcultadaMaster() {
    masterAbierta = false;
    yendoAHija = false;
    if (!cerrandoResuelta) return;
    cerrandoResuelta = false;
    if (cola.length) setTimeout(() => mostrarCuandoSePueda(ventanaMaster(), pintarMaster), 50);
}

/** Peticiones de creación pendientes (modo máster) */
export const creacionesPendientes = () => cola.length;

/** Abre la ventana del máster con la primera petición pendiente */
export function abrirCreacionesMaster() {
    if (!cola.length) return ctx.aviso("Creación", ["No hay creaciones pendientes."]);
    if (actual >= cola.length) actual = 0;
    mostrarCuandoSePueda(ventanaMaster(), pintarMaster);
}

/* pj falso para el formulario de objetos: los objetos de la petición son su baúl */
const pjFalso = (peticion) => ({ baul: peticion.objetos, inventario: [], calcularCaracteristicas: () => {} });

/* Fecha corta de una receta */
const fechaCorta = (iso) => {
    const fecha = new Date(iso);
    return Number.isNaN(fecha.getTime()) ? "" : fecha.toLocaleDateString("es-ES");
};
const conSigno = (n) => (n > 0 ? `+${n}` : String(n));
const htmlDiferencia = (receta) => `Diferencia <b class="${receta.diferencia >= 0 ? "positivo" : "negativo"}">${conSigno(receta.diferencia)}</b>`
    + (receta.critico ? ` · <span class="creacion-marca positivo">Crítico</span>` : "");

/* Panel del máster: lo que salió la otra vez con esta receta */
function htmlRecetaPanel(receta) {
    if (!receta) return "";
    return `<h6 class="panel-protagonistas-titulo">Ya creado antes <small>${fechaCorta(receta.fecha)}${receta.actualizada ? " (sobrescrita)" : ""}</small></h6>
        <p class="creacion-dificultad">${htmlDiferencia(receta)}</p>
        <div class="lista-objetos">${receta.objetos.map(o => filaMaterial(o)).join("")}</div>`;
}

let idPintado = null; // petición que se ve (al cambiar, el interruptor de sobrescribir vuelve a apagarse)

function pintarMaster() {
    const peticion = cola[actual];
    if (!peticion) return;
    const receta = historial.recetaDe(peticion.creacion);
    // Misma receta que una del historial: se proponen sus objetos (una vez; si el máster los quita, no vuelven)
    if (receta && !peticion.propuesta && !peticion.objetos.length) {
        peticion.objetos = historial.copiaObjetos(receta);
        peticion.propuesta = true;
        guardarCola();
    }
    const { creacion, de, objetos } = peticion;
    const info = TIPOS_CREACION[creacion.tipo];
    el("contadorCreacionMaster").textContent = cola.length > 1 ? `(${actual + 1} de ${cola.length})` : "";
    el("textoCreacionMaster").textContent = `${de.nombre} quiere crear: ${info.etiqueta}`;
    el("listaObjetosCreacionMaster").innerHTML = objetos.length ? objetos.map((objeto, i) => filaMaterial(objeto, {
        extra: `<div class="objeto-acciones" data-index="${i}">
            <button type="button" class="btn-objeto" data-accion="editar" title="Editar" aria-label="Editar">${iconoSao("editar")}</button>
            <button type="button" class="btn-objeto" data-accion="borrar" title="Quitar" aria-label="Quitar">${iconoSao("descartar")}</button>
        </div>`
    })).join("") : `<p class="lista-vacia">Crea el objeto que recibe (o elige qué pasa con los materiales).</p>`;
    el("btnSiguienteCreacion").hidden = cola.length < 2;
    el("panelCreacionMaster").innerHTML = htmlDetalle(creacion, { master: true }) + htmlRecetaPanel(receta);
    const sobrescribir = el("sobrescribirHistorialCreacion");
    if (idPintado !== peticion.id) sobrescribir.checked = false;
    idPintado = peticion.id;
    el("ranuraSobrescribirCreacion").hidden = !(receta && objetos.length && !historial.mismosObjetos(receta.objetos, objetos));
    const enviar = el("btnEnviarCreacion");
    enviar.disabled = !objetos.length;
    const titulo = objetos.length ? `Enviar a ${de.nombre}` : "Crea al menos un objeto para enviar";
    enviar.title = titulo;
    enviar.setAttribute("aria-label", titulo);
}

/* Abre el formulario de objetos para crear (indice null) o editar un objeto de la petición actual */
function formularioObjeto(indice = null) {
    const peticion = cola[actual];
    if (!peticion) return;
    const pj = pjFalso(peticion);
    const info = TIPOS_CREACION[peticion.creacion.tipo];
    const opciones = {
        pj, origen: ventanaMaster(), libre: true,
        alTerminar: () => {
            peticion.objetos = pj.baul.slice(0, 10);
            guardarCola();
        }
    };
    yendoAHija = true; // se oculta para abrir el formulario: no es cerrarla
    if (indice === null) ctx.abrirCrearObjeto("baul", { ...opciones, tipo: info.objeto, tipoEquipo: info.tipoEquipo });
    else ctx.abrirEditorObjeto("baul", indice, opciones);
}

async function resolver(resultado, { confirmado = false } = {}) {
    const peticion = cola[actual];
    if (!peticion) return;
    const nombre = peticion.de.nombre;
    if (resultado !== "enviado" && !confirmado) {
        const texto = resultado === "perdido"
            ? `${nombre} perderá los materiales sin recibir nada. ¿Seguro?`
            : `Los materiales vuelven a ${nombre} sin crear nada. ¿Seguro?`;
        const ok = await ctx.confirmar({ titulo: resultado === "perdido" ? "Se pierden los materiales" : "Devolver materiales", texto });
        if (!ok || cola[actual] !== peticion) return;
    } else if (!peticion.objetos.length) {
        return ctx.aviso("Creación", ["Crea al menos un objeto para enviar."]);
    }
    const objetos = resultado === "enviado" ? peticion.objetos : [];
    if (peticion.de.local) {
        aplicarResultado(peticion.de.instancia, peticion.id, resultado, cargarObjetosCreados(objetos));
    } else {
        try {
            await emitirPrivado("creacionResultado", { para: PARA_TODOS, id: peticion.id, resultado, objetos });
        } catch (error) {
            return ctx.aviso("Creación", [`No se pudo enviar: ${error.message ?? error}`, "La petición sigue pendiente."]);
        }
        const texto = { enviado: `Enviado a ${nombre}: ${objetos.map(o => `${o.nombre} ×${o.cantidad}`).join(", ")}`,
            perdido: `${nombre} pierde los materiales.`, devuelto: `Materiales devueltos a ${nombre}.` }[resultado];
        ctx.aviso("Creación", [texto]);
    }
    if (resultado === "enviado") apuntarEnHistorial(peticion);
    // Los materiales gastados pasan a los objetos comunes si aún no hay ninguno con su nombre
    if (resultado !== "devuelto") {
        const anadidos = anadirNuevosAlCompendio(peticion.creacion.materiales.map(m => m.objeto));
        if (anadidos.length) ctx.aviso("Objetos comunes", [`Añadidos al compendio: ${anadidos.join(", ")}.`]);
    }
    reproducir("click");
    quitarDeCola(peticion.id);
}

/* Lo enviado pasa al historial: receta nueva siempre; una que ya estaba, solo con el interruptor encendido */
function apuntarEnHistorial(peticion) {
    const ranura = el("ranuraSobrescribirCreacion");
    const hecho = historial.apuntarReceta({
        creacion: peticion.creacion,
        objetos: cargarObjetosCreados(peticion.objetos),
        sobrescribir: !ranura.hidden && el("sobrescribirHistorialCreacion").checked
    });
    if (!hecho) return;
    pintarHistorialSiAbierto();
    subirHistorial();
}

function recibirPeticion(evento) {
    if (!ctx.esMaster || !soyMasterDeSala()) return;
    const creacion = cargarCreacion(evento.datos?.creacion);
    if (!creacion) return;
    const nombre = String(evento.personaje ?? "").trim().slice(0, 60) || "Alguien";
    encolar({ id: creacion.id, creacion, de: { instancia: String(evento.instancia ?? ""), jugador: String(evento.jugador ?? ""), nombre, local: false }, objetos: [] });
    reproducir("notificacion");
    ctx.aviso("Creación", [`${nombre} quiere crear: ${TIPOS_CREACION[creacion.tipo].etiqueta}`]);
    abrirCreacionesMaster();
}

function recibirCancelacion(evento) {
    if (!ctx.esMaster || !soyMasterDeSala()) return;
    const id = String(evento.datos?.id ?? "");
    const peticion = cola.find(p => p.id === id && !p.de.local && p.de.jugador === evento.jugador);
    if (!peticion) return;
    quitarDeCola(id);
    ctx.aviso("Creación", [`${peticion.de.nombre} ha cancelado su creación (${TIPOS_CREACION[peticion.creacion.tipo].etiqueta}).`]);
}

/* Historial de creaciones (máster) __________________________________________________ */

const ventanaHistorial = () => el("modalHistorialCreaciones");
let hijaHistorial = null; // crearVentanaHija: abierta desde la ventana del máster, vuelve a ella al cerrar

/* Nube (como el compendio de objetos): la primera vez con sesión manda la copia más reciente; después cada cambio
   sube solo las páginas cambiadas. Si la copia local es la última que se subió, solo se lee el índice. */
let estadoNube = "local"; // local | cargando | ok | subiendo | error
let errorNube = "";
let sincronizado = null; // uid con el que ya se ha sincronizado en esta sesión

const normalizar = (t) => String(t ?? "").trim().toLocaleLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const textoMateriales = (receta) => receta.materiales
    .map(m => `${m.nombre} ×${m.cantidad}${m.potencia ? ` (pot. ${m.potencia})` : ""}`).join(" · ");

function textoEstadoHistorial() {
    const n = historial.info().entradas;
    const cuantas = `${n} receta${n === 1 ? "" : "s"}`;
    switch (estadoNube) {
        case "cargando": return "Cargando el historial de la nube…";
        case "subiendo": return `Guardando en la nube… (${cuantas})`;
        case "ok": return `Guardado en la nube (${cuantas}).`;
        case "error": return `No se pudo sincronizar con la nube: ${errorNube} Queda guardado en este navegador.`;
        default: return `Sin sesión: solo está en este navegador (${cuantas}).`;
    }
}

function pintarHistorial() {
    const estado = el("estadoHistorialCreaciones");
    estado.textContent = textoEstadoHistorial();
    estado.classList.toggle("error", estadoNube === "error");
    estado.hidden = false;

    const todas = historial.listar();
    const filtro = el("filtroTipoHistorialCreaciones");
    const elegido = filtro.value;
    const tipos = [...new Set(todas.map(r => r.tipo))];
    filtro.innerHTML = `<option value="">Todos</option>` + tipos
        .map(t => `<option value="${t}">${escaparHtml(TIPOS_CREACION[t].etiqueta)}</option>`).join("");
    filtro.value = tipos.includes(elegido) ? elegido : "";

    const buscado = normalizar(el("buscarHistorialCreaciones").value);
    const visibles = todas.filter(r => (!filtro.value || r.tipo === filtro.value)
        && (!buscado || normalizar([...r.objetos.map(o => o.nombre), ...r.materiales.map(m => m.nombre)].join(" ")).includes(buscado)));
    if (!visibles.length) {
        el("listaHistorialCreaciones").innerHTML = `<p class="lista-vacia">${todas.length ? "Ninguna receta coincide."
            : estadoNube === "cargando" ? "Cargando…" : "Aún no hay creaciones. Se apuntan al enviar el resultado de una."}</p>`;
        return;
    }
    let html = "";
    let tipoActual = null;
    visibles.forEach(receta => {
        if (receta.tipo !== tipoActual) {
            tipoActual = receta.tipo;
            html += `<h3 class="titulo-piso">${escaparHtml(TIPOS_CREACION[receta.tipo].etiqueta)}</h3>`;
        }
        const objetos = receta.objetos.map((objeto, i) => filaMaterial(objeto, {
            extra: `<div class="objeto-acciones" data-index="${i}">
                <button type="button" class="btn-objeto" data-accion="editar" title="Editar" aria-label="Editar">${iconoSao("editar")}</button>
                <button type="button" class="btn-objeto" data-accion="quitar" title="Quitar" aria-label="Quitar">${iconoSao("descartar")}</button>
            </div>`
        })).join("");
        html += `<div class="receta-creacion" data-id="${escaparHtml(receta.id)}">
            <div class="receta-cabecera">
                <span class="objeto-icono">${iconoSao(TIPOS_CREACION[receta.tipo].icono)}</span>
                <div class="receta-info">
                    <span class="receta-materiales">${escaparHtml(textoMateriales(receta))}</span>
                    <span class="receta-detalle">${htmlDiferencia(receta)} · ${fechaCorta(receta.fecha)}${receta.actualizada ? " (sobrescrita)" : " (primera vez)"}</span>
                </div>
                <button type="button" class="btn-objeto" data-accion="borrar" title="Borrar receta" aria-label="Borrar receta">${iconoSao("descartar")}</button>
            </div>
            <div class="lista-objetos">${objetos}</div>
            <button type="button" class="btn-anadir-ranura" data-accion="anadir" title="Añadir objeto" aria-label="Añadir objeto">+</button>
        </div>`;
    });
    el("listaHistorialCreaciones").innerHTML = html;
}

function pintarHistorialSiAbierto() {
    if (ventanaHistorial()?.classList.contains("show")) pintarHistorial();
}

/** Abre el historial (desde la ventana del máster como ventana hija, o desde el menú de opciones) */
export function abrirHistorialCreaciones(origen = null) {
    if (!ctx?.esMaster) return;
    hijaHistorial.abrirDesde(origen);
}

/* Crear (indice null) o editar un objeto de una receta con el formulario de objetos */
function formularioReceta(id, indice = null) {
    const receta = historial.porId(id);
    if (!receta) return;
    const pj = { baul: historial.copiaObjetos(receta), inventario: [], calcularCaracteristicas: () => {} };
    const info = TIPOS_CREACION[receta.tipo];
    // Se oculta para abrir el formulario: al cerrarlo vuelve aquí, no a la ventana de origen (seVaAUnaHija)
    ventanaHistorial().dataset.haciaHija = "1";
    const opciones = {
        pj, origen: ventanaHistorial(), libre: true,
        alTerminar: () => {
            if (historial.editarObjetos(id, pj.baul.slice(0, 10))) subirHistorial();
        }
    };
    if (indice === null) ctx.abrirCrearObjeto("baul", { ...opciones, tipo: info.objeto, tipoEquipo: info.tipoEquipo });
    else ctx.abrirEditorObjeto("baul", indice, opciones);
}

async function borrarRecetaConfirmando(id, texto) {
    const ok = await ctx.confirmar({ titulo: "Borrar receta", texto });
    if (!ok || !historial.borrarReceta(id)) return;
    pintarHistorialSiAbierto();
    subirHistorial();
}

function accionHistorial(e) {
    const boton = e.target.closest("button[data-accion]");
    const id = boton?.closest("[data-id]")?.dataset.id;
    const receta = id ? historial.porId(id) : null;
    if (!receta) return;
    reproducir("click");
    const i = Number(boton.closest("[data-index]")?.dataset.index);
    switch (boton.dataset.accion) {
        case "editar": return formularioReceta(id, i);
        case "anadir": return formularioReceta(id, null);
        case "borrar": return borrarRecetaConfirmando(id, "¿Borrar esta receta del historial? Las próximas creaciones con estos materiales no propondrán nada.");
        case "quitar": {
            if (receta.objetos.length <= 1) return borrarRecetaConfirmando(id, "Es el único objeto de la receta: ¿borrar la receta del historial?");
            historial.editarObjetos(id, receta.objetos.filter((_, j) => j !== i));
            pintarHistorial();
            subirHistorial();
        }
    }
}

/** Descarga el historial como fichero JSON */
export function exportarHistorialCreaciones() {
    const blob = new Blob([historial.exportar()], { type: "application/json" });
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(blob);
    enlace.download = `historial-creaciones-${new Date().toISOString().slice(0, 10)}.json`;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}

/** Añade las recetas de un fichero exportado (las repetidas, si se quiere, sustituyen a las tuyas) */
export async function importarHistorialCreaciones(fichero) {
    let lista = [];
    try {
        lista = historial.leerImportacion(JSON.parse(await fichero.text()));
    } catch {
        lista = [];
    }
    if (!lista.length) return ctx.aviso("Importar historial", ["El fichero no tiene recetas: elige un historial de creaciones exportado."]);
    const repetidas = historial.repetidasAlImportar(lista);
    let sustituir = false;
    if (repetidas) {
        sustituir = await ctx.confirmar({
            titulo: "Importar historial",
            texto: `${repetidas} de las ${lista.length} recetas del fichero ya están en tu historial. ¿Sustituir las tuyas por las del fichero? Si cancelas, se conservan las tuyas y solo se añaden las nuevas.`
        });
    } else if (!await ctx.confirmar({ titulo: "Importar historial", texto: `¿Añadir ${lista.length} recetas al historial?` })) {
        return;
    }
    const { nuevas, sustituidas } = historial.importar(lista, sustituir);
    ctx.aviso("Importar historial", [`Recetas añadidas: ${nuevas}${sustituidas ? `, sustituidas: ${sustituidas}` : ""}.`]);
    if (nuevas || sustituidas) {
        pintarHistorialSiAbierto();
        if (masterAbierta) pintarMaster();
        subirHistorial();
    }
}

/* Nube del historial _______________________________________________________________ */

async function sincronizarHistorial() {
    if (!ctx.esMaster) return;
    if (!haySesionOnline()) {
        estadoNube = "local";
        pintarHistorialSiAbierto();
        return;
    }
    const uid = usuarioOnline();
    if (sincronizado !== uid) {
        if (estadoNube === "cargando") return; // ya se está leyendo
        estadoNube = "cargando";
        pintarHistorialSiAbierto();
        try {
            const local = historial.info();
            const localPropio = !local.dueno || local.dueno === uid;
            // Si lo local es lo último que se subió, basta con leer el índice (sinCambios)
            const nube = await leerHistorialCreacionesNube(localPropio && !local.pendiente ? local.actualizado : null);
            if (!nube) {
                if (localPropio && local.entradas) historial.marcarTodoCambiado();
                else if (!localPropio) historial.cargarDeNube({ actualizado: 0, paginas: [] });
            } else if (nube.sinCambios) {
                // ya está al día
            } else if (localPropio && local.pendiente && local.actualizado > nube.actualizado) {
                historial.marcarTodoCambiado();
            } else if (!localPropio || local.pendiente || local.actualizado !== nube.actualizado) {
                if (localPropio && local.pendiente) {
                    ctx.aviso("Historial de creaciones", ["En la nube hay una versión más reciente del historial: se usa esa y se descartan los cambios de este navegador."]);
                }
                historial.cargarDeNube(nube);
            }
            historial.setDueno(uid);
            sincronizado = uid;
        } catch (error) {
            estadoNube = "error";
            errorNube = mensajeErrorOnline(error);
            pintarHistorialSiAbierto();
            return;
        }
        // Puede haber recetas nuevas: la petición abierta puede tener ahora objetos propuestos
        if (masterAbierta) pintarMaster();
    }
    await subirHistorial();
}

/** Sube los cambios (si hay sesión y ya se ha sincronizado; si no, quedan pendientes) */
async function subirHistorial() {
    if (!ctx.esMaster) return;
    if (!haySesionOnline()) {
        estadoNube = "local";
    } else if (sincronizado !== usuarioOnline()) {
        return sincronizarHistorial();
    } else {
        const cambios = historial.cambiosParaSubir();
        if (cambios) {
            estadoNube = "subiendo";
            pintarHistorialSiAbierto();
            try {
                await guardarHistorialCreacionesNube(cambios);
                historial.marcarSubido(cambios.actualizado);
                if (historial.info().pendiente) return subirHistorial(); // ha cambiado mientras subía
            } catch (error) {
                estadoNube = "error";
                errorNube = mensajeErrorOnline(error);
                pintarHistorialSiAbierto();
                return;
            }
        }
        estadoNube = "ok";
    }
    pintarHistorialSiAbierto();
}

/* Inicio ___________________________________________________________________________ */

export function inicializarCreacion(contexto) {
    ctx = contexto;
    prepararFormularioSao(el("formCreacion"));
    el("formCreacion").addEventListener("submit", (e) => e.preventDefault());
    el("tiposCreacion").addEventListener("click", (e) => {
        const ficha = e.target.closest(".ficha-sao");
        if (!ficha || ficha.disabled || ficha.dataset.valor === seleccion.tipo) return;
        reproducir("click");
        seleccion.tipo = ficha.dataset.valor;
        seleccion.cantidades.clear();
        pintar();
    });
    el("listaMaterialesCreacion").addEventListener("input", (e) => {
        const input = e.target.closest(".cantidad-trueque");
        if (!input) return;
        const cantidad = Math.max(0, Math.min(Number(input.max) || 0, entero(input.value)));
        seleccion.cantidades.set(input.dataset.clave, cantidad);
        input.closest(".fila-trueque")?.classList.toggle("elegida", cantidad > 0);
        pintarResumen(leerYo());
    });
    el("btnCrearCreacion").addEventListener("click", crear);
    el("btnCancelarCreacion").addEventListener("click", cancelarCreacion);
    ventana().addEventListener("show.bs.modal", pintar);
    registrarManejador("creacionResultado", recibirResultado);

    if (!ctx.esMaster) return;
    leerCola();
    prepararFormularioSao(el("ranuraSobrescribirCreacion")); // icono e interruptor
    ventanaMaster().addEventListener("show.bs.modal", () => {
        masterAbierta = true;
        pintarMaster();
        sincronizarHistorial();
    });
    el("btnHistorialCreacion").addEventListener("click", () => {
        reproducir("click");
        abrirHistorialCreaciones(ventanaMaster());
    });
    // Historial
    hijaHistorial = ctx.crearVentanaHija(ventanaHistorial());
    ventanaHistorial().addEventListener("show.bs.modal", () => {
        pintarHistorial();
        sincronizarHistorial();
    });
    ventanaHistorial().addEventListener("shown.bs.modal", pintarHistorial); // al volver del formulario de objetos
    el("listaHistorialCreaciones").addEventListener("click", accionHistorial);
    el("filtroTipoHistorialCreaciones").addEventListener("change", pintarHistorial);
    el("buscarHistorialCreaciones").addEventListener("input", pintarHistorial);
    el("fileHistorialCreaciones").addEventListener("change", (e) => {
        const fichero = e.target.files?.[0];
        e.target.value = "";
        if (fichero) importarHistorialCreaciones(fichero);
    });
    // Al iniciar o cerrar sesión se vuelve a sincronizar; si hay cambios pendientes, se suben ya
    alCambiarSesionOnline((estado) => {
        const uid = estado?.usuario?.uid ?? null;
        if (uid === sincronizado) return;
        sincronizado = null;
        if (uid && historial.info().pendiente) sincronizarHistorial();
        else pintarHistorialSiAbierto();
    });
    ventanaMaster().addEventListener("hide.bs.modal", alOcultarMaster);
    ventanaMaster().addEventListener("hidden.bs.modal", alOcultadaMaster);
    ventanaMaster().addEventListener("shown.bs.modal", () => {
        if (cerrandoResuelta) bootstrap.Modal.getInstance(ventanaMaster())?.hide();
    });
    el("listaObjetosCreacionMaster").addEventListener("click", (e) => {
        const boton = e.target.closest("[data-accion]");
        const i = Number(boton?.closest("[data-index]")?.dataset.index);
        const peticion = cola[actual];
        if (!boton || !peticion || !Number.isInteger(i)) return;
        reproducir("click");
        if (boton.dataset.accion === "editar") return formularioObjeto(i);
        peticion.objetos.splice(i, 1);
        guardarCola();
        pintarMaster();
    });
    el("btnNuevoObjetoCreacion").addEventListener("click", () => {
        reproducir("click");
        formularioObjeto(null);
    });
    el("btnPerderCreacion").addEventListener("click", () => resolver("perdido"));
    el("btnDevolverCreacion").addEventListener("click", () => resolver("devuelto"));
    el("btnEnviarCreacion").addEventListener("click", () => resolver("enviado"));
    el("btnSiguienteCreacion").addEventListener("click", () => {
        reproducir("click");
        actual = (actual + 1) % cola.length;
        pintarMaster();
    });
    registrarManejador("creacion", recibirPeticion);
    registrarManejador("creacionCancelada", recibirCancelacion);
}
