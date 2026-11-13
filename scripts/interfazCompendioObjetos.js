/* Compendio de objetos comunes: ventana #modalCompendioObjetos (datos en compendioObjetos.js). Como el catálogo de
 * artes: se abre desde el inventario ("+ Añadir objeto común") como ventana hija y al cerrarla vuelve a él.
 * - Vista "compendio": por categoría (CATEGORIAS_OBJETO), con filtro de tipo, de piso y buscador por nombre.
 *   Cualquiera añade un objeto a su inventario (darObjeto). El máster además crea, edita (con #modalCrearObjeto
 *   sobre un pj falso), cambia el piso en la fila, duplica, borra y exporta o importa.
 * - Vista "ficha" (solo máster): los objetos del personaje en pantalla (inventario, baúl, equipo; también en modo
 *   lectura, la ficha de un jugador) para añadirlos al compendio. Si ya hay uno con ese nombre, pregunta si sustituirlo.
 * En modo lectura no se puede crear, editar ni añadir al inventario (cambiarían la ficha o necesitan el formulario).
 * ctx (inicializarCompendioObjetos, desde interfaz.js): esMaster, personaje(), enLectura(), detalleObjeto, iconoObjeto,
 *   abrirEditorObjeto, abrirCrearObjeto, confirmar, aviso, darObjeto(objeto) → { ok, texto }, objetosFicha() →
 *   [{ grupo, objeto }], pisoPersonaje(), crearVentanaHija(modal). */
import * as compendio from "./compendioObjetos.js";
import { iconoSao } from "./iconos.js";
import { escaparHtml } from "./html.js";
import { reproducir } from "./sonidos.js";
import { leerObjetosComunesNube, guardarObjetosComunesNube, masterDeLaSala, usuarioOnline, haySesionOnline,
    alCambiarSesionOnline, mensajeErrorOnline } from "./interfazOnline.js";

let ctx = null;
let vista = "compendio";
let hija = null; // crearVentanaHija: vuelve al inventario al cerrar

/* Nube (ver .claude/11-online.md). Máster: como el compendio de NPC, la primera vez que se abre con sesión manda
   la copia más reciente y después cada cambio sube solo las páginas cambiadas. Jugador: al abrir lee el índice
   del compendio del máster de su sala y solo baja las páginas si ha cambiado (y como mucho una vez cada
   ESPERA_RELEER_MS). */
let estadoNube = "local"; // local | cargando | ok | subiendo | error | sinSala
let errorNube = "";
let sincronizado = null; // máster: uid con el que ya se ha sincronizado en esta sesión
const ESPERA_RELEER_MS = 2 * 60 * 1000;
const ultimaLecturaSala = new Map(); // jugador: uid del máster → hora de la última lectura

/** De dónde salen los objetos: el compendio propio (máster) o la copia del de la sala (jugadores) */
const fuente = () => (ctx.esMaster ? "propio" : "sala");
const el = (id) => document.getElementById(id);
const ventana = () => el("modalCompendioObjetos");

const normalizar = (texto) => String(texto ?? "").trim().toLocaleLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const etiquetaPiso = (piso) => piso === null ? "Sin piso" : `Piso ${piso}`;
// permitido-lectura: se ve también en modo lectura (la CSS oculta allí el resto de acciones)
const boton = (accion, icono, titulo, motivo = "") =>
    `<button type="button" class="btn-objeto permitido-lectura" data-accion="${accion}" title="${escaparHtml(motivo || titulo)}"
        aria-label="${escaparHtml(motivo || titulo)}" ${motivo ? "disabled" : ""}>${iconoSao(icono)}</button>`;

function filaObjeto(objeto, { info = "", acciones = "", datos = "" } = {}) {
    return `<div class="fila-objeto fila-compendio-objeto" ${datos}>
        <span class="objeto-icono">${iconoSao(ctx.iconoObjeto(objeto))}</span>
        <div class="objeto-info">
            <div class="objeto-cabecera"><span class="objeto-nombre">${escaparHtml(objeto.nombre || "Sin nombre")}</span>${info}</div>
            <div class="objeto-detalle">${escaparHtml(ctx.detalleObjeto(objeto))}</div>
            ${objeto.descripcion ? `<div class="objeto-descripcion">${escaparHtml(objeto.descripcion)}</div>` : ""}
        </div>
        <div class="objeto-acciones">${acciones}</div>
    </div>`;
}

/* Vista compendio _______________________________________________________________ */

function pintarCompendio() {
    const lectura = ctx.enLectura();
    const editor = ctx.esMaster;
    const todas = compendio.listar(fuente());
    const estado = el("estadoCompendioObjetos");
    estado.textContent = textoEstado();
    estado.classList.toggle("error", estadoNube === "error");
    estado.hidden = !estado.textContent;

    // Filtros: las categorías y los pisos que hay
    const filtroCat = el("filtroCategoriaCompendioObjetos");
    const catElegida = filtroCat.value;
    const categorias = [...new Set(todas.map(e => e.categoria))];
    filtroCat.innerHTML = `<option value="">Todos</option>` + categorias
        .map(c => `<option value="${c}">${escaparHtml(compendio.CATEGORIAS_OBJETO[c])}</option>`).join("");
    filtroCat.value = categorias.includes(catElegida) ? catElegida : "";
    const filtroPiso = el("filtroPisoCompendioObjetos");
    const pisoElegido = filtroPiso.value;
    const pisos = [...new Set(todas.map(e => e.piso))].sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
    filtroPiso.innerHTML = `<option value="">Todos</option>` + pisos
        .map(piso => `<option value="${piso ?? "sin"}">${etiquetaPiso(piso)}</option>`).join("");
    filtroPiso.value = [...filtroPiso.options].some(o => o.value === pisoElegido) ? pisoElegido : "";

    const buscado = normalizar(el("buscarCompendioObjetos").value);
    const visibles = todas.filter(e => (!filtroCat.value || e.categoria === filtroCat.value)
        && (!filtroPiso.value || String(e.piso ?? "sin") === filtroPiso.value)
        && (!buscado || normalizar(e.nombre).includes(buscado)));
    if (!visibles.length) {
        el("listaCompendioObjetos").innerHTML = `<p class="lista-vacia">${todas.length ? "Ningún objeto coincide."
            : editor ? "El compendio está vacío. Crea uno con \"+ Crear objeto\" o añade los de una ficha con \"Desde la ficha\"."
            : estadoNube === "cargando" ? "Cargando…"
            : estadoNube === "sinSala" ? "Los objetos comunes son los del máster de tu sala."
            : "El máster de la sala aún no tiene objetos comunes."}</p>`;
        return;
    }
    const sinFicha = lectura ? "En la ficha de un jugador no se puede" : "";
    const pj = ctx.personaje();
    let html = "";
    let categoriaActual;
    visibles.forEach(e => {
        if (e.categoria !== categoriaActual) {
            if (categoriaActual !== undefined) html += "</div>";
            categoriaActual = e.categoria;
            html += `<h3 class="titulo-piso">${escaparHtml(compendio.CATEGORIAS_OBJETO[e.categoria])}</h3><div class="lista-objetos">`;
        }
        // El máster cambia el piso en la propia fila; los jugadores solo lo ven
        const piso = editor
            ? `<label class="piso-compendio" title="Piso (vacío = sin piso)">Piso
                <input type="number" min="1" max="${compendio.PISO_MAXIMO}" value="${e.piso ?? ""}" data-piso aria-label="Piso"></label>`
            : `<span class="piso-compendio">${etiquetaPiso(e.piso)}</span>`;
        const anadir = boton("anadir", "inventario", editor ? `Añadir al inventario de ${pj.nombre || "el personaje de la ficha"}` : "Añadir al inventario", sinFicha);
        html += filaObjeto(e.objeto, {
            datos: `data-id="${escaparHtml(e.id)}"`,
            info: piso,
            acciones: anadir + (editor
                ? boton("editar", "editar", "Editar", sinFicha)
                    + boton("duplicar", "duplicar", "Duplicar")
                    + boton("descartar", "descartar", "Borrar del compendio")
                : "")
        });
    });
    el("listaCompendioObjetos").innerHTML = html + "</div>";
}

function textoEstado() {
    if (!ctx.esMaster) {
        switch (estadoNube) {
            case "sinSala": return "Entra en una sala para ver los objetos comunes de su máster.";
            case "cargando": return "Cargando los objetos comunes de la sala…";
            case "error": return `No se pudieron cargar los objetos comunes de la sala: ${errorNube}${compendio.infoSala().entradas ? " Se muestra la última copia." : ""}`;
            default: return "";
        }
    }
    const { entradas, total } = compendio.info();
    const cuantos = `${entradas} objeto${entradas === 1 ? "" : "s"} en ${total} página${total === 1 ? "" : "s"}`;
    switch (estadoNube) {
        case "cargando": return "Cargando los objetos comunes de la nube…";
        case "subiendo": return `Guardando en la nube… (${cuantos})`;
        case "ok": return `Guardado en la nube (${cuantos}). Los jugadores de tus salas los ven al pulsar "+ Añadir objeto común".`;
        case "error": return `No se pudo sincronizar con la nube: ${errorNube} Queda guardado en este navegador.`;
        default: return `Sin sesión: solo están en este navegador (${cuantos}). Inicia sesión para que los vean tus jugadores.`;
    }
}

/* Nube: máster ____________________________________________________________________ */

/* Primera vez con sesión: manda la copia más reciente. Si la del navegador es de otro usuario, manda la nube. */
async function sincronizarMaster() {
    if (!haySesionOnline()) {
        estadoNube = "local";
        pintarSiAbierto();
        return;
    }
    const uid = usuarioOnline();
    if (sincronizado !== uid) {
        estadoNube = "cargando";
        pintarSiAbierto();
        try {
            const nube = await leerObjetosComunesNube();
            const local = compendio.info();
            const localPropio = !local.dueno || local.dueno === uid;
            if (!nube) {
                if (localPropio && local.entradas) compendio.marcarTodoCambiado();
                else if (!localPropio) compendio.cargarDeNube({ actualizado: 0, paginas: [] });
            } else if (localPropio && local.pendiente && local.actualizado > nube.actualizado) {
                compendio.marcarTodoCambiado();
            } else if (!localPropio || local.pendiente || local.actualizado !== nube.actualizado) {
                if (localPropio && local.pendiente) {
                    ctx.aviso("Objetos comunes", ["En la nube hay una versión más reciente de los objetos comunes: se usa esa y se descartan los cambios de este navegador."]);
                }
                compendio.cargarDeNube(nube);
            }
            compendio.setDueno(uid);
            sincronizado = uid;
        } catch (error) {
            estadoNube = "error";
            errorNube = mensajeErrorOnline(error);
            pintarSiAbierto();
            return;
        }
    }
    await subirCambios();
}

/** Sube los cambios (si hay sesión y ya se ha sincronizado; si no, quedan pendientes) */
async function subirCambios() {
    if (!ctx.esMaster) return;
    if (!haySesionOnline()) {
        estadoNube = "local";
    } else if (sincronizado !== usuarioOnline()) {
        return sincronizarMaster();
    } else {
        const cambios = compendio.cambiosParaSubir();
        if (cambios) {
            estadoNube = "subiendo";
            pintarSiAbierto();
            try {
                await guardarObjetosComunesNube(cambios);
                compendio.marcarSubido(cambios.actualizado);
                if (compendio.info().pendiente) return subirCambios(); // ha cambiado mientras subía
            } catch (error) {
                estadoNube = "error";
                errorNube = mensajeErrorOnline(error);
                pintarSiAbierto();
                return;
            }
        }
        estadoNube = "ok";
    }
    pintarSiAbierto();
}

/* Nube: jugador ___________________________________________________________________ */

/** Lee el compendio del máster de la sala si ha cambiado (1 lectura del índice; las páginas solo si cambia) */
async function cargarDeLaSala() {
    const dueno = masterDeLaSala();
    if (!haySesionOnline() || !dueno) {
        estadoNube = "sinSala";
        pintarSiAbierto();
        return;
    }
    const copia = compendio.infoSala();
    const mismaSala = copia.dueno === dueno;
    if (mismaSala && Date.now() - (ultimaLecturaSala.get(dueno) ?? 0) < ESPERA_RELEER_MS) {
        estadoNube = "ok";
        pintarSiAbierto();
        return;
    }
    estadoNube = "cargando";
    pintarSiAbierto();
    try {
        const nube = await leerObjetosComunesNube(dueno, mismaSala ? copia.actualizado : null);
        if (!nube?.sinCambios) compendio.guardarCopiaSala(dueno, nube);
        ultimaLecturaSala.set(dueno, Date.now());
        estadoNube = "ok";
    } catch (error) {
        estadoNube = "error";
        errorNube = mensajeErrorOnline(error);
        if (!mismaSala) compendio.guardarCopiaSala(dueno, null); // no enseñar los de otra sala
    }
    pintarSiAbierto();
}

/* Vista ficha: objetos del personaje en pantalla _________________________________ */

function pintarFicha() {
    const pj = ctx.personaje();
    el("estadoCompendioObjetos").textContent = `Objetos de ${pj.nombre || "la ficha"}: pulsa el libro para añadir uno al compendio (piso ${ctx.pisoPersonaje()} por defecto; se cambia luego en la fila).`;
    const objetos = ctx.objetosFicha();
    if (!objetos.length) {
        el("listaCompendioObjetos").innerHTML = `<p class="lista-vacia">Este personaje no tiene objetos.</p>`;
        return;
    }
    let html = "";
    let grupoActual;
    objetos.forEach(({ grupo, objeto }, i) => {
        if (grupo !== grupoActual) {
            if (grupoActual !== undefined) html += "</div>";
            grupoActual = grupo;
            html += `<h3 class="titulo-piso">${escaparHtml(grupo)}</h3><div class="lista-objetos">`;
        }
        const yaEsta = compendio.idPorNombre(objeto.nombre);
        html += filaObjeto(objeto, {
            datos: `data-indice="${i}"`,
            info: yaEsta ? `<span class="objeto-cantidad">Ya en el compendio</span>` : "",
            acciones: boton("alCompendio", "compendio", yaEsta ? "Sustituir el del compendio" : "Añadir al compendio")
        });
    });
    el("listaCompendioObjetos").innerHTML = html + "</div>";
}

function pintar() {
    if (!ctx.esMaster) vista = "compendio";
    el("botonesCompendioObjetos").hidden = !ctx.esMaster;
    const enFicha = vista === "ficha";
    el("filtrosCompendioObjetos").hidden = enFicha;
    el("btnDesdeFichaCompendioObjetos").textContent = enFicha ? "Volver al compendio" : "Desde la ficha";
    el("modalCompendioObjetosLabel").textContent = enFicha ? "Añadir desde la ficha" : "Objetos comunes";
    const lectura = ctx.enLectura();
    const crear = el("btnCrearCompendioObjetos");
    crear.hidden = enFicha;
    crear.disabled = lectura;
    crear.title = lectura ? "En la ficha de un jugador no se puede" : "";
    ["btnImportarCompendioObjetos", "btnExportarCompendioObjetos"].forEach(id => { el(id).hidden = enFicha; });
    if (enFicha) pintarFicha();
    else pintarCompendio();
}

const pintarSiAbierto = () => { if (ventana().classList.contains("show")) pintar(); };

/** Abre el compendio como ventana hija de origen (el inventario): al cerrarlo se vuelve a ella */
export function abrirCompendioObjetos(origen = el("modalInventario")) {
    vista = "compendio";
    pintar();
    hija.abrirDesde(origen);
    if (ctx.esMaster) sincronizarMaster();
    else cargarDeLaSala();
}

/** Añade al compendio un objeto de una ficha (pregunta si ya hay uno con su nombre). Devuelve true si lo añade. */
export async function anadirAlCompendio(objeto) {
    const id = compendio.idPorNombre(objeto.nombre);
    if (id) {
        const ok = await ctx.confirmar({ titulo: "Objetos comunes", texto: `Ya hay ${objeto.nombre} en el compendio. ¿Sustituirlo por este?` });
        if (!ok) return false;
        compendio.guardarObjeto(id, objeto);
        ctx.aviso("Objetos comunes", [`${objeto.nombre} sustituido en el compendio.`]);
    } else {
        if (!compendio.anadirObjeto(objeto, ctx.pisoPersonaje())) return false;
        ctx.aviso("Objetos comunes", [`${objeto.nombre} añadido al compendio (piso ${ctx.pisoPersonaje()}).`]);
    }
    pintarSiAbierto();
    subirCambios();
    return true;
}

/* Editar o crear con el formulario de objetos: un pj falso con el objeto en el baúl; al terminar se guarda */
function abrirFormulario(id = null) {
    const objeto = id ? compendio.objetoDe(id) : null;
    const pjFalso = { baul: objeto ? [objeto] : [], inventario: [], calcularCaracteristicas: () => {} };
    const opciones = {
        pj: pjFalso, origen: ventana(), libre: true,
        alTerminar: () => {
            const resultado = pjFalso.baul[0];
            if (!resultado) return;
            if (id) compendio.guardarObjeto(id, resultado);
            else compendio.anadirObjeto(resultado, el("filtroPisoCompendioObjetos").value && el("filtroPisoCompendioObjetos").value !== "sin"
                ? el("filtroPisoCompendioObjetos").value : null);
            subirCambios();
        }
    };
    // Se oculta para abrir el formulario: no debe volver al inventario (crearVentanaHija, seVaAUnaHija)
    ventana().dataset.haciaHija = "1";
    if (objeto) ctx.abrirEditorObjeto("baul", 0, opciones);
    else ctx.abrirCrearObjeto("baul", opciones);
}

async function accion(id, nombreAccion) {
    const entrada = compendio.listar(fuente()).find(e => e.id === id);
    if (!entrada) return;
    switch (nombreAccion) {
        case "anadir": {
            const { texto } = ctx.darObjeto(compendio.objetoDe(id, fuente()));
            ctx.aviso("Objetos comunes", [texto]);
            pintarSiAbierto();
            return;
        }
        case "editar": return abrirFormulario(id);
        case "duplicar": compendio.duplicarObjeto(id); break;
        case "descartar": {
            const ok = await ctx.confirmar({ titulo: "Borrar del compendio", texto: `¿Borrar ${entrada.nombre} del compendio? Los que ya tienen los personajes se conservan.` });
            if (!ok) return;
            compendio.borrarObjeto(id);
            break;
        }
    }
    pintarSiAbierto();
    subirCambios();
}

function exportar() {
    const blob = new Blob([compendio.exportar()], { type: "application/json" });
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(blob);
    enlace.download = `objetos-comunes-${new Date().toISOString().slice(0, 10)}.json`;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}

async function importar(fichero) {
    let lista = [];
    try {
        lista = compendio.leerImportacion(JSON.parse(await fichero.text()));
    } catch {
        lista = [];
    }
    if (!lista.length) {
        ctx.aviso("Importar", ["El fichero no tiene objetos: elige un compendio de objetos exportado."]);
        return;
    }
    const ok = await ctx.confirmar({ titulo: "Importar objetos", texto: `¿Añadir ${lista.length} objetos al compendio? Los que ya tienes se conservan.` });
    if (!ok) return;
    compendio.importar(lista);
    pintarSiAbierto();
    subirCambios();
}

export function inicializarCompendioObjetos(contexto) {
    ctx = contexto;
    hija = ctx.crearVentanaHija(ventana());
    el("btnAbrirCompendioObjetos").addEventListener("click", () => {
        reproducir("click");
        abrirCompendioObjetos(el("modalInventario"));
    });
    el("listaCompendioObjetos").addEventListener("click", (e) => {
        const botonPulsado = e.target.closest("button[data-accion]");
        if (!botonPulsado || botonPulsado.disabled) return;
        reproducir("click");
        if (botonPulsado.dataset.accion === "alCompendio") {
            const item = ctx.objetosFicha()[Number(botonPulsado.closest("[data-indice]")?.dataset.indice)];
            if (item) anadirAlCompendio(item.objeto);
            return;
        }
        const id = botonPulsado.closest("[data-id]")?.dataset.id;
        if (id) accion(id, botonPulsado.dataset.accion);
    });
    // Piso en la propia fila
    el("listaCompendioObjetos").addEventListener("change", (e) => {
        if (!e.target.matches("[data-piso]")) return;
        const id = e.target.closest("[data-id]")?.dataset.id;
        if (id) compendio.cambiarPiso(id, e.target.value);
        pintarSiAbierto();
        subirCambios();
    });
    el("filtroCategoriaCompendioObjetos").addEventListener("change", pintarSiAbierto);
    el("filtroPisoCompendioObjetos").addEventListener("change", pintarSiAbierto);
    el("buscarCompendioObjetos").addEventListener("input", pintarSiAbierto);
    el("btnCrearCompendioObjetos").addEventListener("click", () => {
        reproducir("click");
        abrirFormulario();
    });
    el("btnDesdeFichaCompendioObjetos").addEventListener("click", () => {
        reproducir("click");
        vista = vista === "ficha" ? "compendio" : "ficha";
        pintar();
    });
    el("btnExportarCompendioObjetos").addEventListener("click", () => {
        reproducir("click");
        exportar();
    });
    el("btnImportarCompendioObjetos").addEventListener("click", () => {
        reproducir("click");
        el("fileCompendioObjetos").click();
    });
    el("fileCompendioObjetos").addEventListener("change", (e) => {
        const fichero = e.target.files?.[0];
        e.target.value = "";
        if (fichero) importar(fichero);
    });
    // Al volver del formulario de objetos se repinta (puede haber creado o editado uno)
    ventana().addEventListener("shown.bs.modal", pintarSiAbierto);
    // Máster: al iniciar o cerrar sesión se vuelve a sincronizar; si hay cambios pendientes, se suben ya
    alCambiarSesionOnline((estado) => {
        if (!ctx.esMaster) return;
        const uid = estado?.usuario?.uid ?? null;
        if (uid === sincronizado) return;
        sincronizado = null;
        if (uid && compendio.info().pendiente) sincronizarMaster();
        else pintarSiAbierto();
    });
}
