// scripts/interfazSacroMaster.js
// Máster: resolver la magia de los jugadores (13-sacro.md §6.4) y decir qué hay en el ambiente (§3.2). Solo DOM y
// eventos; las reglas están en sacro.js. inicializarSacroMaster(ctx) desde interfaz.js (solo en modo máster).
// - Peticiones de hechizo: evento privado "hechizo" (para: PARA_TODOS; solo lo atiende el máster de la sala) o, de un
//   personaje del propio máster, encolarHechizoLocal. Cola en localStorage (fichaSAO.hechizosMaster) y #modalSacroMaster:
//   daño por elemento (la sugerencia del jugador, editable; "Juntar por tipo"), radio, tirada y dado, un estado,
//   objetos que se crean (al botín) y una nota. Resolver → "hechizoResultado" a su pestaña (o en local); Rechazar →
//   lo mismo con rechazado. "hechizoCancelado" lo quita de la cola.
// - Ambiente: "peticionAmbiente" → #modalAmbienteMaster con los dedos de cada elemento (por defecto lo último que se
//   envió menos lo usado, fichaSAO.ambienteMaster) → "ambiente" a su pestaña.

import {
    ELEMENTOS_SACRO, CLAVES_ELEMENTOS_SACRO, factorRadio, cargarHechizo, cargarAmbiente, entradaDannoSacro, describirEnergia
} from "./sacro.js";
import { ESTADOS_INFO } from "./estados.js";
import { cargarObjeto } from "./objetos.js";
import { soyMasterDeSala } from "./interfazOnline.js";
import { emitirPrivado, registrarManejador } from "./eventos.js";
import { iconoSao } from "./iconos.js";
import { escaparHtml } from "./html.js";
import { prepararFormularioSao, crearFichas } from "./formularioSao.js";

let ctx = null;
const el = (id) => document.getElementById(id);
const ventana = () => el("modalSacroMaster");
const ventanaAmbiente = () => el("modalAmbienteMaster");
const entero = (v, max = 999) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
const nombreDe = (texto) => String(texto ?? "").trim().slice(0, 60) || "Alguien";

/* Tiradas que puede pedir el máster (característica + habilidad); "" = sin tirada */
export const TIRADAS_MAGIA = {
    "": { etiqueta: "Sin tirada" },
    intPer: { etiqueta: "Inteligencia + Percepción", caracteristica: "inteligencia", habilidad: "percepcion" },
    refCom: { etiqueta: "Reflejos + Combate", caracteristica: "reflejos", habilidad: "combate" },
    otra: { etiqueta: "Otra" }
};
export const CARACTERISTICAS_MAGIA = { fortaleza: "Fortaleza", reflejos: "Reflejos", voluntad: "Voluntad", inteligencia: "Inteligencia" };
export const HABILIDADES_MAGIA = { atletismo: "Atletismo", combate: "Combate", percepcion: "Percepción", subterfugio: "Sigilo", comunicacion: "Carisma", cultura: "Cultura" };
const DADOS = { 0: "Bajo", 1: "Medio", 2: "Alto" };

/* Cola de peticiones _________________________________________________________ */
const CLAVE_COLA = "fichaSAO.hechizosMaster";
/* [{ id, hechizo, sugerencia: [{ elemento, cantidad }], de: { instancia, jugador, nombre, local }, objetos, decision }] */
let cola = [];
let actual = 0;

function cargarPeticion(p) {
    const hechizo = cargarHechizo(p?.hechizo);
    if (!hechizo) return null;
    return {
        id: hechizo.id, hechizo,
        sugerencia: (Array.isArray(p.sugerencia) ? p.sugerencia : []).filter(s => ELEMENTOS_SACRO[s?.elemento])
            .map(s => ({ elemento: s.elemento, cantidad: entero(s.cantidad) })),
        de: { instancia: String(p.de?.instancia ?? ""), jugador: String(p.de?.jugador ?? ""), nombre: nombreDe(p.de?.nombre), local: Boolean(p.de?.local) },
        objetos: (Array.isArray(p.objetos) ? p.objetos : []).map(cargarObjeto).filter(Boolean).slice(0, 10),
        decision: p.decision && typeof p.decision === "object" ? p.decision : null
    };
}
function leerCola() {
    try {
        const datos = JSON.parse(localStorage.getItem(CLAVE_COLA) ?? "[]");
        cola = (Array.isArray(datos) ? datos : []).map(cargarPeticion).filter(Boolean);
    } catch { cola = []; }
}
function guardarCola() {
    try { localStorage.setItem(CLAVE_COLA, JSON.stringify(cola)); } catch { /* solo en memoria */ }
}
function encolar(peticion) {
    if (!peticion || cola.some(p => p.id === peticion.id)) return;
    cola.push(peticion);
    guardarCola();
}
function quitarDeCola(id) {
    const i = cola.findIndex(p => p.id === id);
    if (i < 0) return;
    cola.splice(i, 1);
    if (actual >= cola.length) actual = 0;
    guardarCola();
    if (!ventana().classList.contains("show")) return;
    if (cola.length) pintar();
    else bootstrap.Modal.getInstance(ventana())?.hide();
}

/** Peticiones de magia sin resolver (para el menú del inventario) */
export const hechizosPendientes = () => cola.length;

/** Abre la ventana con la primera petición pendiente */
export function abrirHechizosMaster() {
    if (!cola.length) return ctx.aviso("Magia", ["No hay peticiones de magia pendientes."]);
    if (actual >= cola.length) actual = 0;
    mostrarCuandoSePueda(ventana());
}
/* Espera a que no haya otra ventana abierta */
function mostrarCuandoSePueda(modalEl) {
    const otra = document.querySelector(`.modal.show:not(#${modalEl.id})`);
    if (otra) {
        otra.addEventListener("hidden.bs.modal", () => setTimeout(() => mostrarCuandoSePueda(modalEl), 50), { once: true });
        return;
    }
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

/* Decisión del máster sobre la petición (se guarda en la cola mientras la edita) */
function decisionDe(peticion) {
    if (!peticion.decision) {
        peticion.decision = {
            danno: peticion.sugerencia.map(s => ({ elemento: s.elemento, cantidad: s.cantidad })),
            radio: 1, tirada: "intPer", caracteristica: "inteligencia", habilidad: "percepcion", dado: 1,
            estado: "", valorEstado: 1, turnosEstado: 3, nota: ""
        };
    }
    return peticion.decision;
}

/* Pintar ________________________________________________________________________ */
function pintar() {
    const peticion = cola[actual];
    if (!peticion) return;
    const d = decisionDe(peticion);
    const { hechizo, de } = peticion;
    el("contadorSacroMaster").textContent = cola.length > 1 ? `(${actual + 1} de ${cola.length})` : "";
    el("btnSiguienteSacroMaster").hidden = cola.length < 2;
    // Lo que ha pedido: dedos por elemento y de dónde salen
    const porOrigen = { generar: "generado", ambiente: "del ambiente", cinturon: "de un cristal", quitado: "quitado" };
    const filasPedido = CLAVES_ELEMENTOS_SACRO.map(clave => {
        const suyos = hechizo.dedos.filter(dd => dd.elemento === clave);
        if (!suyos.length) return "";
        const origenes = [...new Set(suyos.map(dd => porOrigen[dd.origen]))].join(", ");
        return `<span class="energia-elemento icono-activo" style="--color:${ELEMENTOS_SACRO[clave].color};--color-glifo:${ELEMENTOS_SACRO[clave].colorGlifo ?? "#FBFBFB"}">${iconoSao(ELEMENTOS_SACRO[clave].icono)}${escaparHtml(ELEMENTOS_SACRO[clave].etiqueta)} ×${suyos.length} <small>(${escaparHtml(origenes)})</small></span>`;
    }).join("");
    el("pedidoSacroMaster").innerHTML = `<p class="texto-esperando-trueque">${escaparHtml(de.nombre)} quiere hacer:</p>
        <p class="pedido-sacro-forma">«${escaparHtml(hechizo.forma)}»</p>
        <div class="energia-mano pedido-sacro-dedos">${filasPedido}</div>`;

    // Daño por elemento (editable); el radio lo reduce al final
    const factor = factorRadio(d.radio);
    el("dannoSacroMaster").innerHTML = d.danno.length ? d.danno.map((fila, i) => {
        const info = ELEMENTOS_SACRO[fila.elemento];
        const final = Math.floor(fila.cantidad * factor);
        return `<div class="ranura fila-danno-sacro" data-index="${i}">
            <span class="ranura-icono icono-activo" style="--color:${info.color};--color-glifo:${info.colorGlifo ?? "#FBFBFB"}">${iconoSao(info.icono)}</span>
            <label class="ranura-etiqueta" for="dannoSacro${i}">${escaparHtml(info.etiqueta)} <small>(${escaparHtml(info.textoDanno)})</small></label>
            <input type="number" id="dannoSacro${i}" class="cantidad-danno-sacro" min="0" max="999" value="${fila.cantidad}">
            <span class="final-danno-sacro">${d.radio > 1 ? `→ ${final}` : ""}</span>
        </div>`;
    }).join("") : `<p class="lista-vacia">Sin elementos.</p>`;
    prepararFormularioSao(el("dannoSacroMaster"));

    el("radioSacroMaster").value = String(d.radio);
    el("textoRadioSacroMaster").textContent = d.radio > 1 ? `Área ${d.radio}×${d.radio}: daño ×${factor === 0.5 ? "½" : factor === 0.25 ? "¼" : String(factor).replace(".", ",")}` : "Un objetivo: daño completo";
    el("tiradaSacroMaster").value = d.tirada;
    el("caracteristicaSacroMaster").value = d.caracteristica;
    el("habilidadSacroMaster").value = d.habilidad;
    el("ranuraOtraTiradaSacro").hidden = d.tirada !== "otra";
    el("dadoSacroMaster").value = String(d.dado);
    el("dadoSacroMaster").disabled = !d.tirada;
    el("estadoSacroMaster").value = d.estado;
    el("valorEstadoSacroMaster").value = d.valorEstado;
    el("turnosEstadoSacroMaster").value = d.turnosEstado;
    el("valorEstadoSacroMaster").disabled = el("turnosEstadoSacroMaster").disabled = !d.estado;
    if (document.activeElement !== el("notaSacroMaster")) el("notaSacroMaster").value = d.nota;
    sincronizar.forEach(f => f());

    el("objetosSacroMaster").innerHTML = peticion.objetos.length ? peticion.objetos.map((objeto, i) => `
        <div class="fila-objeto" data-index="${i}">
            <span class="objeto-icono">${iconoSao(ctx.iconoObjeto(objeto))}</span>
            <div class="objeto-info"><div class="objeto-cabecera"><span class="objeto-nombre">${escaparHtml(objeto.nombre)}</span><span class="objeto-cantidad">×${objeto.cantidad}</span></div>
                <div class="objeto-detalle">${escaparHtml(ctx.detalleObjeto(objeto))}</div></div>
            <div class="objeto-acciones">
                <button type="button" class="btn-objeto" data-accion="editar" title="Editar" aria-label="Editar">${iconoSao("editar")}</button>
                <button type="button" class="btn-objeto" data-accion="borrar" title="Quitar" aria-label="Quitar">${iconoSao("descartar")}</button>
            </div>
        </div>`).join("") : `<p class="lista-vacia">No genera objetos.</p>`;
}
let sincronizar = [];

/* Juntar por tipo: los elementos que hacen el mismo daño se suman en una fila (la del primero) */
function juntarPorTipo(d) {
    const grupos = new Map();
    for (const fila of d.danno) {
        const info = ELEMENTOS_SACRO[fila.elemento];
        const clave = `${info.tipoDanno}${info.ignoraArmadura ? "-ignora" : ""}`;
        if (grupos.has(clave)) grupos.get(clave).cantidad += fila.cantidad;
        else grupos.set(clave, { ...fila });
    }
    d.danno = [...grupos.values()];
}

/* Resolver o rechazar ____________________________________________________________ */
function resultadoDe(peticion, rechazado) {
    const d = decisionDe(peticion);
    if (rechazado) return { id: peticion.id, rechazado: true, nota: d.nota.trim().slice(0, 300) };
    const factor = factorRadio(d.radio);
    const tirada = !d.tirada ? null : d.tirada === "otra"
        ? { caracteristica: d.caracteristica, habilidad: d.habilidad, dado: d.dado }
        : { caracteristica: TIRADAS_MAGIA[d.tirada].caracteristica, habilidad: TIRADAS_MAGIA[d.tirada].habilidad, dado: d.dado };
    return {
        id: peticion.id,
        rechazado: false,
        danno: d.danno.map(f => ({ elemento: f.elemento, cantidad: Math.floor(f.cantidad * factor) })).filter(f => f.cantidad > 0),
        radio: d.radio,
        tirada,
        estado: d.estado ? { clave: d.estado, valor: entero(d.valorEstado, 99) || 1, turnos: entero(d.turnosEstado, 99) } : null,
        nota: d.nota.trim().slice(0, 300),
        objetos: peticion.objetos
    };
}

async function resolver(rechazado) {
    const peticion = cola[actual];
    if (!peticion) return;
    if (rechazado && !(await ctx.confirmar({ titulo: "Rechazar", texto: `¿Rechazar lo que quiere hacer ${peticion.de.nombre}? No gasta nada.` }))) return;
    const resultado = resultadoDe(peticion, rechazado);
    if (peticion.de.local) {
        ctx.aplicarResultadoLocal(peticion.de.instancia, resultado);
    } else {
        try {
            await emitirPrivado("hechizoResultado", { para: peticion.de.instancia, ...resultado });
        } catch (error) {
            return ctx.aviso("Magia", [`No se pudo enviar: ${error.message ?? error}`, "La petición sigue pendiente."]);
        }
        ctx.aviso("Magia", [rechazado ? `Rechazado lo de ${peticion.de.nombre}.` : `Resuelto lo de ${peticion.de.nombre}.`]);
    }
    // Lo que ha usado del ambiente ya no está la próxima vez
    if (!rechazado) descontarAmbiente(peticion.hechizo.dedos.filter(dd => dd.origen === "ambiente"));
    ctx.reproducir("click");
    quitarDeCola(peticion.id);
}

function recibirPeticion(evento) {
    if (!soyMasterDeSala()) return;
    const peticion = cargarPeticion({
        hechizo: evento.datos?.hechizo, sugerencia: evento.datos?.sugerencia,
        de: { instancia: evento.instancia, jugador: evento.jugador, nombre: evento.personaje, local: false }
    });
    if (!peticion) return;
    encolar(peticion);
    ctx.reproducir("notificacion");
    ctx.aviso("Magia", [`${peticion.de.nombre} quiere hacer magia: ${describirEnergia({ dedos: peticion.hechizo.dedos })}`]);
    abrirHechizosMaster();
}

function recibirCancelacion(evento) {
    if (!soyMasterDeSala()) return;
    const id = String(evento.datos?.id ?? "");
    const peticion = cola.find(p => p.id === id && !p.de.local && p.de.jugador === evento.jugador);
    if (!peticion) return;
    quitarDeCola(id);
    ctx.aviso("Magia", [`${peticion.de.nombre} ha cancelado su petición de magia.`]);
}

/** Un personaje del propio máster pide magia: entra directamente en la cola */
export function encolarHechizoLocal(instancia, nombre, hechizo, sugerencia) {
    const peticion = cargarPeticion({ hechizo, sugerencia, de: { instancia, jugador: "", nombre, local: true } });
    if (!peticion) return;
    encolar(peticion);
    abrirHechizosMaster();
}
export const cancelarHechizoLocal = (id) => quitarDeCola(id);

/* Objetos que genera el hechizo: el formulario de objetos sobre un pj falso (van al botín de quien lo lanza) */
function formularioObjeto(indice = null) {
    const peticion = cola[actual];
    if (!peticion) return;
    const pj = { baul: peticion.objetos, inventario: [], calcularCaracteristicas: () => {} };
    const opciones = { pj, origen: ventana(), libre: true, alTerminar: () => { peticion.objetos = pj.baul.slice(0, 10); guardarCola(); pintar(); } };
    if (indice === null) ctx.abrirCrearObjeto("baul", opciones);
    else ctx.abrirEditorObjeto("baul", indice, opciones);
}

/* Ambiente _____________________________________________________________________ */
const CLAVE_AMBIENTE = "fichaSAO.ambienteMaster";
let peticionesAmbiente = []; // [{ instancia, nombre, local }]
let cerrandoAmbiente = false; // la cierra el código tras enviar (no es descartar una pregunta)
let borradorAmbiente = {};

function ultimoAmbiente() {
    try { return Object.fromEntries(cargarAmbiente(JSON.parse(localStorage.getItem(CLAVE_AMBIENTE) ?? "[]")).map(a => [a.elemento, a.dedos])); } catch { return {}; }
}
function guardarAmbiente(mapa) {
    try { localStorage.setItem(CLAVE_AMBIENTE, JSON.stringify(Object.entries(mapa).map(([elemento, dedos]) => ({ elemento, dedos })))); } catch { /* */ }
}
function descontarAmbiente(dedos) {
    if (!dedos.length) return;
    const mapa = ultimoAmbiente();
    dedos.forEach(dd => { mapa[dd.elemento] = Math.max(0, (mapa[dd.elemento] ?? 0) - 1); });
    guardarAmbiente(mapa);
}

function pintarAmbiente() {
    const peticion = peticionesAmbiente[0];
    if (!peticion) return;
    el("textoAmbienteMaster").textContent = `${peticion.nombre} pregunta qué hay en el ambiente. Pon cuántos dedos puede absorber de cada elemento (incluida la Hela o la Morna de alguien que muera).`
        + (peticionesAmbiente.length > 1 ? ` Quedan ${peticionesAmbiente.length - 1} más.` : "");
    el("listaAmbienteMaster").innerHTML = CLAVES_ELEMENTOS_SACRO.map(clave => {
        const info = ELEMENTOS_SACRO[clave];
        return `<div class="ranura campo-ambiente-sacro">
            <span class="ranura-icono icono-activo" style="--color:${info.color};--color-glifo:${info.colorGlifo ?? "#FBFBFB"}">${iconoSao(info.icono)}</span>
            <label class="ranura-etiqueta" for="ambiente-${clave}">${escaparHtml(info.etiqueta)} <small>${escaparHtml(info.que.toLowerCase())}</small></label>
            <input type="number" id="ambiente-${clave}" min="0" max="20" data-elemento="${clave}" value="${borradorAmbiente[clave] ?? 0}">
        </div>`;
    }).join("");
    prepararFormularioSao(el("listaAmbienteMaster"));
}

function pedirAmbiente(peticion) {
    peticionesAmbiente.push(peticion);
    if (peticionesAmbiente.length === 1) {
        borradorAmbiente = ultimoAmbiente();
        mostrarCuandoSePueda(ventanaAmbiente());
    }
}

async function enviarAmbiente() {
    const peticion = peticionesAmbiente[0];
    if (!peticion) return;
    const elementos = cargarAmbiente(Object.entries(borradorAmbiente).map(([elemento, dedos]) => ({ elemento, dedos })));
    if (peticion.local) ctx.aplicarAmbienteLocal(peticion.instancia, elementos);
    else {
        try {
            await emitirPrivado("ambiente", { para: peticion.instancia, elementos });
        } catch (error) {
            return ctx.aviso("Ambiente", [`No se pudo enviar: ${error.message ?? error}`]);
        }
    }
    guardarAmbiente(borradorAmbiente);
    ctx.reproducir("click");
    peticionesAmbiente.shift();
    borradorAmbiente = ultimoAmbiente();
    if (peticionesAmbiente.length) return pintarAmbiente();
    cerrandoAmbiente = true;
    bootstrap.Modal.getInstance(ventanaAmbiente())?.hide();
}

/** Un personaje del propio máster pregunta por el ambiente */
export const pedirAmbienteLocal = (instancia, nombre) => pedirAmbiente({ instancia, nombre, local: true });

/**
 * ctx: { aviso, confirmar, reproducir, iconoObjeto, detalleObjeto, abrirCrearObjeto, abrirEditorObjeto,
 *        aplicarResultadoLocal(instancia, resultado), aplicarAmbienteLocal(instancia, elementos) }
 */
export function inicializarSacroMaster(contexto) {
    ctx = contexto;
    leerCola();
    // Opciones de los desplegables
    el("tiradaSacroMaster").innerHTML = Object.entries(TIRADAS_MAGIA).map(([v, t]) => `<option value="${v}">${t.etiqueta}</option>`).join("");
    el("caracteristicaSacroMaster").innerHTML = Object.entries(CARACTERISTICAS_MAGIA).map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
    el("habilidadSacroMaster").innerHTML = Object.entries(HABILIDADES_MAGIA).map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
    el("dadoSacroMaster").innerHTML = Object.entries(DADOS).map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
    el("estadoSacroMaster").innerHTML = `<option value="">Ninguno</option>` + Object.entries(ESTADOS_INFO).map(([v, info]) => `<option value="${v}">${info.etiqueta}</option>`).join("");
    prepararFormularioSao(el("formSacroMaster"));
    sincronizar = [
        crearFichas(el("tiradaSacroMaster")),
        crearFichas(el("dadoSacroMaster"))
    ];

    const decision = () => (cola[actual] ? decisionDe(cola[actual]) : null);
    const alCambiar = (e) => {
        const d = decision();
        if (!d) return;
        const t = e.target;
        if (t.classList.contains("cantidad-danno-sacro")) {
            d.danno[Number(t.closest("[data-index]").dataset.index)].cantidad = entero(t.value);
            guardarCola();
            // Solo el valor final del radio: no se repinta para no perder el foco
            const fila = t.closest(".fila-danno-sacro");
            const final = Math.floor(entero(t.value) * factorRadio(d.radio));
            fila.querySelector(".final-danno-sacro").textContent = d.radio > 1 ? `→ ${final}` : "";
            return;
        }
        const campos = {
            radioSacroMaster: () => { d.radio = Math.max(1, Math.min(5, entero(t.value))); },
            tiradaSacroMaster: () => { d.tirada = t.value; },
            caracteristicaSacroMaster: () => { d.caracteristica = t.value; },
            habilidadSacroMaster: () => { d.habilidad = t.value; },
            dadoSacroMaster: () => { d.dado = entero(t.value, 2); },
            estadoSacroMaster: () => { d.estado = t.value; },
            valorEstadoSacroMaster: () => { d.valorEstado = entero(t.value, 99); },
            turnosEstadoSacroMaster: () => { d.turnosEstado = entero(t.value, 99); },
            notaSacroMaster: () => { d.nota = t.value; }
        };
        if (!campos[t.id]) return;
        campos[t.id]();
        guardarCola();
        if (t.id !== "notaSacroMaster" && e.type === "change") pintar();
    };
    el("formSacroMaster").addEventListener("change", alCambiar);
    el("formSacroMaster").addEventListener("input", alCambiar);
    el("btnJuntarSacroMaster").addEventListener("click", () => {
        const d = decision();
        if (!d) return;
        ctx.reproducir("click");
        juntarPorTipo(d);
        guardarCola();
        pintar();
    });
    el("objetosSacroMaster").addEventListener("click", (e) => {
        const boton = e.target.closest("[data-accion]");
        const i = Number(boton?.closest("[data-index]")?.dataset.index);
        const peticion = cola[actual];
        if (!boton || !peticion || !Number.isInteger(i)) return;
        ctx.reproducir("click");
        if (boton.dataset.accion === "editar") return formularioObjeto(i);
        peticion.objetos.splice(i, 1);
        guardarCola();
        pintar();
    });
    el("btnObjetoSacroMaster").addEventListener("click", () => { ctx.reproducir("click"); formularioObjeto(null); });
    el("btnRechazarSacroMaster").addEventListener("click", () => resolver(true));
    el("btnResolverSacroMaster").addEventListener("click", () => resolver(false));
    el("btnSiguienteSacroMaster").addEventListener("click", () => {
        ctx.reproducir("click");
        actual = (actual + 1) % cola.length;
        pintar();
    });
    ventana().addEventListener("show.bs.modal", pintar);
    ventana().addEventListener("shown.bs.modal", pintar); // al volver del formulario de objetos

    // Ambiente
    el("listaAmbienteMaster").addEventListener("input", (e) => {
        const input = e.target.closest("input[data-elemento]");
        if (input) borradorAmbiente[input.dataset.elemento] = entero(input.value, 20);
    });
    el("btnEnviarAmbienteMaster").addEventListener("click", enviarAmbiente);
    ventanaAmbiente().addEventListener("show.bs.modal", pintarAmbiente);
    ventanaAmbiente().addEventListener("hidden.bs.modal", () => {
        // Cerrar sin enviar: esa pregunta se descarta (el jugador puede volver a preguntar)
        if (cerrandoAmbiente) { cerrandoAmbiente = false; return; }
        if (peticionesAmbiente.length) peticionesAmbiente.shift();
        if (peticionesAmbiente.length) setTimeout(() => mostrarCuandoSePueda(ventanaAmbiente()), 50);
    });

    registrarManejador("hechizo", recibirPeticion);
    registrarManejador("hechizoCancelado", recibirCancelacion);
    registrarManejador("peticionAmbiente", (evento) => {
        if (!soyMasterDeSala()) return;
        pedirAmbiente({ instancia: String(evento.instancia ?? ""), nombre: nombreDe(evento.personaje), local: false });
        ctx.reproducir("notificacion");
    });
}

/* Para los pop-ups del jugador: la ficha de color de cada elemento resuelto */
export const fichasResultado = (danno) => danno.map(f => entradaDannoSacro(f.elemento, f.cantidad));
