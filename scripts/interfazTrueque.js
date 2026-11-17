/* Trueque entre personajes de la sala: ventana #modalTrueque (desde el menú del inventario). Reglas en trueque.js.
 *
 * Negociación por eventos privados "trueque" (eventos.js): { para, id, version, accion, oferta? }
 * - propuesta: A propone (con su oferta). B ve la oferta de A y elige qué da a cambio.
 * - oferta: respuesta o contraoferta (la oferta nueva de quien la envía). Quien la recibe decide: aceptar, rechazar o
 *   contraoferta (cambia solo lo suyo). Así hasta que alguien acepte o rechace.
 * - aceptar (con la versión aceptada), rechazar (también al cerrar la ventana) y ocupado (ya está en otro trueque).
 * Lo ofrecido queda apartado (pj.trueque.mia) desde que se envía hasta que acaba; si no se intercambia, vuelve.
 * Al aceptar: quien acepta envía "aceptar" y, si se ha enviado, los dos pierden lo apartado y reciben la oferta del
 * otro (intercambiar: objetos al botín, Cor y objetos clave directos). En zona no segura cada uno gasta la acción de
 * una mano libre; quien acepta sin ella no puede aceptar (quien recibe la aceptación la gasta si la tiene).
 *
 * Un solo trueque a la vez por pestaña (activo). En modo máster puede ser de uno de sus personajes que no está en
 * la ficha: activo.yo es su instancia ("m-<id>") y los cambios van por ctx.conPersonaje / ctx.leerPersonaje.
 * Si la ficha tiene un trueque que no es el activo (se cerró a medias), comprobarTruequeColgado lo devuelve.
 *
 * ctx (inicializarTrueque, desde interfaz.js): personaje(), enLectura(), actualizarTodo(), aviso(titulo, lineas),
 *   iconoObjeto(objeto), detalleObjeto(objeto), leerPersonaje(instancia), conPersonaje(instancia, fn),
 *   abrirBotin(instancia) (si es el personaje de la ficha). */
import {
    motivoNoTrueque, disponiblesTrueque, apartarOferta, devolverOferta, nuevoIdTrueque, cargarOferta, seleccionDeOferta,
    gastarManoTrueque, recibirOferta, describirOferta
} from "./trueque.js";
import { getPersonajesSala, getEstadoOnline } from "./interfazOnline.js";
import { emitirPrivado, registrarManejador, instanciaEmisora } from "./eventos.js";
import { crearRejilla, prepararFormularioSao } from "./formularioSao.js";
import { iconoSao } from "./iconos.js";
import { escaparHtml } from "./html.js";
import { reproducir } from "./sonidos.js";

let ctx = null;
/* Trueque en curso de esta pestaña: { id, yo (instancia propia), con: { instancia, nombre }, estado, version, mia, suya } */
let activo = null;
let sincronizarDestino = null;
const seleccion = { cantidades: new Map(), cor: 0, destino: "" }; // clave de fila → cantidad
const el = (id) => document.getElementById(id);
const ventana = () => el("modalTrueque");
const entero = (valor) => Math.max(0, Math.min(1e6, Math.floor(Number(valor) || 0)));

/** Personajes a los que se puede proponer un trueque */
const destinatarios = () => (getEstadoOnline().sala ? getPersonajesSala().filter(p => !p.npc || p.trueque) : []);

/* El personaje propio del trueque (o el de la ficha si no hay ninguno) */
const leerYo = () => ctx.leerPersonaje(activo?.yo ?? instanciaEmisora());
const nombreDe = (pj) => String(pj?.nombre ?? "").trim() || "Sin nombre";

/* pj.trueque del personaje propio = el trueque activo (lo apartado se guarda con la ficha) */
function guardar() {
    const { id, con, estado, version, mia, suya } = activo;
    ctx.conPersonaje(activo.yo, pj => { pj.trueque = { id, con, estado, version, mia, suya }; });
}

/* Envía un mensaje del trueque al otro. Devuelve la promesa del envío (true si ha salido) */
function enviarEvento(accion, extra = {}) {
    if (!activo) return Promise.resolve(false);
    return emitirPrivado("trueque", { para: activo.con.instancia, id: activo.id, version: activo.version, accion, ...extra },
        { instancia: activo.yo, personaje: nombreDe(leerYo()) })
        .then(() => true)
        .catch(error => {
            ctx.aviso("Trueque", [`No se pudo enviar: ${error.message ?? error}`]);
            return false;
        });
}

/* Trueque cerrado: lo apartado pasa al otro y se recibe su oferta. Quien acepta ya ha comprobado la mano; quien
   recibe la aceptación la gasta si puede, pero el trueque se cierra igual. */
function intercambiar(titulo, lineas) {
    if (!activo) return;
    const { yo, mia, suya } = activo;
    activo = null;
    const resumen = ctx.conPersonaje(yo, pj => {
        const mano = gastarManoTrueque(pj);
        pj.trueque = null;
        return [
            `Entregas: ${describirOferta(mia)}`,
            ...recibirOferta(pj, suya),
            ...(mano ? [] : ["No tenías una mano libre con su acción: no se ha gastado ninguna."])
        ];
    }) ?? [];
    reproducir("click");
    ctx.aviso(titulo, [...lineas, ...resumen]);
    if (ventana().classList.contains("show")) bootstrap.Modal.getInstance(ventana())?.hide();
    if (suya?.objetos.length) ctx.abrirBotin(yo);
}

/* Acaba el trueque: lo apartado vuelve a su sitio, se avisa y se cierra la ventana */
function terminar(titulo, lineas) {
    if (!activo) return;
    const { yo, mia } = activo;
    activo = null;
    const resumen = ctx.conPersonaje(yo, pj => {
        pj.trueque = null;
        return mia ? devolverOferta(pj, mia) : [];
    }) ?? [];
    ctx.aviso(titulo, [...lineas, ...resumen]);
    const instancia = bootstrap.Modal.getInstance(ventana());
    if (ventana().classList.contains("show")) instancia?.hide();
}

/* Muestra la ventana cuando no hay otra a la vista (si ya está abierta, la repinta) */
function mostrarVentana() {
    if (ventana().classList.contains("show")) {
        pintar();
        return;
    }
    const otra = document.querySelector(".modal.show:not(#modalTrueque)");
    if (otra) {
        otra.addEventListener("hidden.bs.modal", () => setTimeout(() => { if (activo) mostrarVentana(); }, 50), { once: true });
        return;
    }
    bootstrap.Modal.getOrCreateInstance(ventana()).show();
}

/* Pintar _______________________________________________________________________ */

/* Clave de una fila de la lista: "inventario:3", "baul:0", "clave:1" */
const claveFila = (origen, indice) => `${origen}:${indice}`;

/* Fila con las clases del inventario y la cantidad a ofrecer a la derecha */
function filaDisponible({ clave, objeto, maximo, detalle, icono }) {
    const valor = Math.min(maximo, seleccion.cantidades.get(clave) ?? 0);
    return `<div class="fila-objeto fila-trueque${valor > 0 ? " elegida" : ""}" data-clave="${clave}">
        <span class="objeto-icono">${iconoSao(icono)}</span>
        <div class="objeto-info">
            <div class="objeto-cabecera">
                <span class="objeto-nombre">${escaparHtml(objeto.nombre)}</span>
                ${maximo > 1 ? `<span class="objeto-cantidad">×${maximo}</span>` : ""}
            </div>
            <div class="objeto-detalle">${escaparHtml(detalle)}</div>
        </div>
        <div class="objeto-acciones">
            <input type="number" class="cantidad-trueque permitido-lectura" data-clave="${clave}" min="0" max="${maximo}" value="${valor}"
                aria-label="Cantidad de ${escaparHtml(objeto.nombre)} que ofreces">
        </div>
    </div>`;
}

/* Lista de solo lectura de una oferta */
function htmlOferta(oferta) {
    if (!oferta) return "";
    const filas = [
        oferta.cor > 0 ? `<div class="fila-objeto"><span class="objeto-icono">${iconoSao("cor")}</span><div class="objeto-info"><div class="objeto-cabecera"><span class="objeto-nombre">${oferta.cor} Cor</span></div></div></div>` : "",
        ...oferta.objetos.map(({ objeto }) => `<div class="fila-objeto"><span class="objeto-icono">${iconoSao(ctx.iconoObjeto(objeto))}</span><div class="objeto-info">
            <div class="objeto-cabecera"><span class="objeto-nombre">${escaparHtml(objeto.nombre)}</span><span class="objeto-cantidad">×${objeto.cantidad}</span></div>
            <div class="objeto-detalle">${escaparHtml(ctx.detalleObjeto(objeto))}</div>
            ${objeto.descripcion ? `<div class="objeto-descripcion">${escaparHtml(objeto.descripcion)}</div>` : ""}</div></div>`),
        ...oferta.objetosClave.map(objeto => `<div class="fila-objeto"><span class="objeto-icono">${iconoSao("llave")}</span><div class="objeto-info">
            <div class="objeto-cabecera"><span class="objeto-nombre">${escaparHtml(objeto.nombre)}</span></div><div class="objeto-detalle">Objeto clave</div>
            ${objeto.descripcion ? `<div class="objeto-descripcion">${escaparHtml(objeto.descripcion)}</div>` : ""}</div></div>`)
    ].filter(Boolean);
    return filas.length ? filas.join("") : `<p class="lista-vacia">Nada</p>`;
}

/* Tu oferta: con quién (si aún no hay trueque), Cor y objetos */
function pintarElegir() {
    const pj = leerYo();
    const { objetos, objetosClave, cor } = disponiblesTrueque(pj);

    let motivo;
    if (!activo) {
        const lista = destinatarios();
        if (!lista.some(p => p.instancia === seleccion.destino)) seleccion.destino = lista[0]?.instancia ?? "";
        const select = el("selectDestinoTrueque");
        select.innerHTML = lista.length
            ? lista.map(p => `<option value="${escaparHtml(p.instancia)}">${escaparHtml(p.nombre || "Sin nombre")}</option>`).join("")
            : `<option value="">Nadie conectado</option>`;
        select.value = seleccion.destino;
        sincronizarDestino?.();
        motivo = !getEstadoOnline().sala ? "Entra en una sala para hacer trueques."
            : !lista.length ? "No hay nadie en la sala con quien hacer un trueque." : null;
    }
    motivo ??= motivoNoTrueque(pj);

    seleccion.cor = Math.min(seleccion.cor, cor);
    const inputCor = el("inputCorTrueque");
    inputCor.max = String(cor);
    inputCor.value = String(seleccion.cor);
    el("etiquetaCorTrueque").textContent = `Cor (tienes ${cor})`;

    const filas = [
        ...objetos.map(({ origen, indice, objeto }) => filaDisponible({
            clave: claveFila(origen, indice), objeto, maximo: objeto.cantidad, icono: ctx.iconoObjeto(objeto),
            detalle: `${origen === "baul" ? "Baúl" : origen.startsWith("cinturon/") ? "Cinturón" : "Inventario"} · ${ctx.detalleObjeto(objeto)}`
        })),
        ...objetosClave.map(({ indice, objeto }) => filaDisponible({
            clave: claveFila("clave", indice), objeto, maximo: 1, icono: "llave", detalle: "Objeto clave"
        }))
    ];
    el("listaTrueque").innerHTML = filas.length ? filas.join("") : `<p class="lista-vacia">No tienes objetos que ofrecer.</p>`;
    return motivo;
}

function pintar() {
    const estado = activo?.estado ?? "elegir";
    const otro = activo?.con.nombre || "otro personaje";
    const texto = !activo ? ""
        : estado === "esperando" ? `Esperando respuesta de ${otro}…`
        : estado === "decidir" ? `${otro} ha respondido. Acepta, rechaza o haz una contraoferta.`
        : activo.mia === null && activo.version <= 1 && activo.suya ? `${otro} te propone un trueque. Elige qué ofreces a cambio (puede ser nada).`
        : `Contraoferta para ${otro}: cambia lo que ofreces.`;
    const estadoEl = el("textoEstadoTrueque");
    estadoEl.hidden = !texto;
    estadoEl.textContent = texto;

    el("bloqueSuyaTrueque").hidden = !activo?.suya;
    if (activo?.suya) {
        el("tituloSuyaTrueque").textContent = `Lo que ofrece ${otro}`;
        el("ofertaSuyaTrueque").innerHTML = htmlOferta(activo.suya);
    }
    el("vistaElegirTrueque").hidden = estado !== "elegir";
    el("ranuraDestinoTrueque").hidden = Boolean(activo);
    el("bloqueMiaTrueque").hidden = estado === "elegir" || !activo?.mia;
    if (activo?.mia) el("ofertaMiaTrueque").innerHTML = htmlOferta(activo.mia);
    el("botonesDecidirTrueque").hidden = estado !== "decidir";

    // Para aceptar también hace falta la mano libre (en zona no segura)
    const motivo = estado === "elegir" ? pintarElegir() : estado === "decidir" ? motivoNoTrueque(leerYo()) : null;
    const aviso = el("avisoTrueque");
    aviso.hidden = !motivo;
    aviso.textContent = motivo ?? "";

    const aceptar = el("btnEnviarTrueque");
    aceptar.hidden = estado === "esperando";
    aceptar.disabled = Boolean(motivo);
    const tituloAceptar = motivo ?? (estado === "decidir" ? "Aceptar trueque" : "Enviar oferta");
    aceptar.title = tituloAceptar;
    aceptar.setAttribute("aria-label", tituloAceptar);
    const cerrar = ventana().querySelector(".btn-modal-sao.cancelar");
    const tituloCerrar = !activo ? "Cerrar" : activo.suya ? "Rechazar trueque" : "Cancelar trueque";
    cerrar.title = tituloCerrar;
    cerrar.setAttribute("aria-label", tituloCerrar);
}

/* Acciones propias _______________________________________________________________ */

/* Lo elegido en la lista, como lo pide apartarOferta */
function seleccionActual() {
    const filas = [...seleccion.cantidades].filter(([, cantidad]) => cantidad > 0).map(([clave, cantidad]) => {
        const [origen, indice] = clave.split(":");
        return { origen, indice: Number(indice), cantidad };
    });
    return {
        objetos: filas.filter(f => f.origen !== "clave"),
        objetosClave: filas.filter(f => f.origen === "clave").map(f => f.indice),
        cor: seleccion.cor
    };
}

/* Enviar tu oferta: la propuesta (sin trueque aún) o tu respuesta / contraoferta */
function enviarOferta() {
    const yo = activo?.yo ?? instanciaEmisora();
    const destino = activo ? activo.con : destinatarios().find(p => p.instancia === seleccion.destino);
    const motivo = !destino ? "Elige con quién hacer el trueque." : motivoNoTrueque(ctx.leerPersonaje(yo));
    if (motivo) return ctx.aviso("No se puede", [motivo]);
    // La propuesta tiene que ofrecer algo; la respuesta puede ser nada (aceptar un regalo)
    const resultado = ctx.conPersonaje(yo, pj => apartarOferta(pj, seleccionActual(), { permitirVacia: Boolean(activo) }));
    if (!resultado?.ok) return ctx.aviso("No se puede", resultado?.resumen ?? ["No se encuentra el personaje."]);
    reproducir("click");
    seleccion.cantidades.clear();
    seleccion.cor = 0;
    if (!activo) {
        activo = {
            id: nuevoIdTrueque(), yo, con: { instancia: destino.instancia, nombre: destino.nombre || "Sin nombre" },
            estado: "esperando", version: 1, mia: resultado.oferta, suya: null
        };
        guardar();
        enviarEvento("propuesta", { oferta: resultado.oferta });
    } else {
        activo.mia = resultado.oferta;
        activo.version += 1;
        activo.estado = "esperando";
        guardar();
        enviarEvento("oferta", { oferta: resultado.oferta });
    }
    pintar();
}

/* Contraoferta: lo que tenías apartado vuelve (y queda elegido) para cambiarlo */
function contraoferta() {
    if (activo?.estado !== "decidir") return;
    reproducir("click");
    const mia = activo.mia;
    const elegidas = ctx.conPersonaje(activo.yo, pj => {
        devolverOferta(pj, mia);
        return seleccionDeOferta(pj, mia);
    });
    seleccion.cantidades = elegidas ?? new Map();
    seleccion.cor = mia?.cor ?? 0;
    activo.mia = null;
    activo.estado = "elegir";
    guardar();
    pintar();
}

let aceptando = false;
async function aceptar() {
    if (activo?.estado !== "decidir" || aceptando) return;
    const motivo = motivoNoTrueque(leerYo());
    if (motivo) return ctx.aviso("No se puede", [motivo]);
    // Primero se avisa al otro: si no llega, no se cambia nada (si no, uno tendría lo de los dos)
    const id = activo.id;
    aceptando = true;
    const enviado = await enviarEvento("aceptar");
    aceptando = false;
    if (!enviado || activo?.id !== id) return;
    intercambiar("Trueque hecho", [`Has aceptado el trueque con ${activo.con.nombre}.`]);
}

/* Al cerrar la ventana con un trueque en curso: se rechaza (o se cancela si aún no hay respuesta) */
function alCerrar() {
    // Con la aceptación saliendo ya no se puede rechazar: el trueque se cierra al enviarse
    if (!activo || aceptando) return;
    const otro = activo.con.nombre;
    const cancelado = !activo.suya;
    enviarEvento("rechazar");
    terminar(cancelado ? "Trueque cancelado" : "Trueque rechazado", [cancelado ? `Has cancelado el trueque con ${otro}.` : `Has rechazado el trueque de ${otro}.`]);
}

/* Lo que llega del otro _________________________________________________________ */

function recibirPropuesta(evento, d, de) {
    const yo = d.para;
    const responder = (accion) => emitirPrivado("trueque", { para: evento.instancia, id: d.id, version: entero(d.version), accion },
        { instancia: yo, personaje: nombreDe(ctx.leerPersonaje(yo)) }).catch(() => {});
    if (activo) {
        if (activo.id !== d.id) responder("ocupado");
        return;
    }
    const pj = ctx.leerPersonaje(yo);
    if (pj.esNpc && !pj.permitirTrueque) {
        responder("rechazar");
        return;
    }
    // Un trueque de ese personaje que se quedó a medias: primero vuelve lo apartado
    if (pj.trueque) ctx.conPersonaje(yo, p => { if (p.trueque?.mia) devolverOferta(p, p.trueque.mia); p.trueque = null; });
    activo = {
        id: String(d.id).slice(0, 80), yo, con: de,
        estado: "elegir", version: entero(d.version) || 1, mia: null, suya: cargarOferta(d.oferta)
    };
    seleccion.cantidades.clear();
    seleccion.cor = 0;
    guardar();
    reproducir("notificacion");
    const para = nombreDe(ctx.leerPersonaje(yo));
    ctx.aviso("Trueque", [yo === instanciaEmisora() ? `${de.nombre} te propone un trueque.` : `${de.nombre} propone un trueque a ${para}.`]);
    mostrarVentana();
}

function recibirTrueque(evento) {
    const d = evento.datos ?? {};
    const de = { instancia: String(evento.instancia ?? ""), nombre: String(evento.personaje ?? "").trim().slice(0, 60) || "Alguien" };
    if (!d.id) return;
    if (d.accion === "propuesta") return recibirPropuesta(evento, d, de);
    if (!activo || d.id !== activo.id || de.instancia !== activo.con.instancia) return;
    if (d.accion === "oferta") {
        if (activo.estado !== "esperando") return;
        activo.suya = cargarOferta(d.oferta);
        activo.version = entero(d.version);
        activo.estado = "decidir";
        guardar();
        reproducir("notificacion");
        mostrarVentana();
    } else if (d.accion === "aceptar") {
        if (activo.estado !== "esperando" || entero(d.version) !== activo.version) return;
        intercambiar("Trueque hecho", [`${de.nombre} ha aceptado el trueque.`]);
    } else if (d.accion === "rechazar") {
        terminar("Trueque rechazado", [`${de.nombre} ha rechazado el trueque.`]);
    } else if (d.accion === "ocupado") {
        terminar("Trueque", [`${de.nombre} está en otro trueque. Inténtalo más tarde.`]);
    }
}

/** En actualizarTodo: un trueque guardado que esta pestaña no negocia (pestaña cerrada a medias) se deshace */
export function comprobarTruequeColgado() {
    if (!ctx || ctx.enLectura()) return;
    const pj = ctx.personaje();
    if (!pj.trueque || pj.trueque.id === activo?.id) return;
    const { con, mia } = pj.trueque;
    pj.trueque = null;
    const resumen = mia ? devolverOferta(pj, mia) : [];
    ctx.aviso("Trueque sin terminar", [`El trueque con ${con.nombre || "otro personaje"} se quedó a medias: se cancela.`, ...resumen]);
}

export function inicializarTrueque(contexto) {
    ctx = contexto;
    prepararFormularioSao(el("formTrueque"));
    sincronizarDestino = crearRejilla(el("selectDestinoTrueque"));
    el("formTrueque").addEventListener("submit", (e) => e.preventDefault());
    el("selectDestinoTrueque").addEventListener("change", (e) => { seleccion.destino = e.target.value; });
    el("inputCorTrueque").addEventListener("input", (e) => {
        const maximo = Number(leerYo().cor) || 0;
        seleccion.cor = Math.max(0, Math.min(maximo, Math.floor(Number(e.target.value) || 0)));
    });
    el("listaTrueque").addEventListener("input", (e) => {
        const input = e.target.closest(".cantidad-trueque");
        if (!input) return;
        const cantidad = Math.max(0, Math.min(Number(input.max) || 0, Math.floor(Number(input.value) || 0)));
        seleccion.cantidades.set(input.dataset.clave, cantidad);
        input.closest(".fila-trueque")?.classList.toggle("elegida", cantidad > 0);
    });
    el("btnEnviarTrueque").addEventListener("click", () => {
        if (activo?.estado === "decidir") aceptar();
        else enviarOferta();
    });
    el("btnContraofertaTrueque").addEventListener("click", contraoferta);
    ventana().addEventListener("show.bs.modal", () => {
        // Sin trueque en curso se empieza de cero (los índices de la lista apuntan a filas concretas)
        if (!activo) {
            seleccion.cantidades.clear();
            seleccion.cor = 0;
        }
        pintar();
    });
    ventana().addEventListener("hidden.bs.modal", alCerrar);
    registrarManejador("trueque", recibirTrueque);
}
