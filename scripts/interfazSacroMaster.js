// scripts/interfazSacroMaster.js
// Máster: resolver la magia de los jugadores (13-sacro.md §6.4) y decir qué hay en el ambiente (§3.2). Solo DOM y
// eventos; las reglas están en sacro.js. inicializarSacroMaster(ctx) desde interfaz.js (solo en modo máster).
// - Peticiones de hechizo: evento privado "hechizo" (para: PARA_TODOS; solo lo atiende el máster de la sala) o, de un
//   personaje del propio máster, encolarHechizoLocal. Cola en localStorage (fichaSAO.hechizosMaster) y #modalSacroMaster,
//   que cambia según el tipo (TIPOS_HECHIZO):
//   · Daño: un golpe por fila (la sugerencia del jugador, un dedo por fila; se añaden y quitan), "Juntar por tipo" y "Un
//     único golpe" (interruptores, golpesDeFilas), radio, tirada y dado, y estados (el editor de los objetos, sin
//     permanente) con un interruptor por golpe que dice si los lleva.
//   · Crear objeto: objetos (la propuesta, editable) que van al botín.
//   · Escenario: nota y tirada opcional.
//   Resolver → "hechizoResultado" a su pestaña (o en local). Cerrar la ventana = cancelar (con confirmación): lo mismo
//   con rechazado. "hechizoCancelado" lo quita de la cola.
// - Ambiente: "peticionAmbiente" → #modalAmbienteMaster con los dedos de cada elemento (por defecto lo último que se
//   envió menos lo usado, fichaSAO.ambienteMaster) → "ambiente" a su pestaña.

import {
    ELEMENTOS_SACRO, CLAVES_ELEMENTOS_SACRO, factorRadio, cargarHechizo, cargarAmbiente, entradaDannoSacro, describirEnergia,
    DANNO_FISICO, infoDannoMagia,
    golpesDeFilas, partesHechizo, TIPOS_HECHIZO
} from "./sacro.js";
import { cargarObjeto } from "./objetos.js";
import { soyMasterDeSala } from "./interfazOnline.js";
import { emitirPrivado, registrarManejador } from "./eventos.js";
import { iconoSao } from "./iconos.js";
import { escaparHtml } from "./html.js";
import { prepararFormularioSao, crearFichas, ponerResumen } from "./formularioSao.js";
import { hacerOrdenable } from "./ordenar.js";
import { fichaDannoMagia } from "./elementosSacro.js";

let ctx = null;
const el = (id) => document.getElementById(id);
const ventana = () => el("modalSacroMaster");
const ventanaAmbiente = () => el("modalAmbienteMaster");
const entero = (v, max = 999) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
const nombreDe = (texto) => String(texto ?? "").trim().slice(0, 60) || "Alguien";
const conColor = (c) => `--color:${infoDannoMagia(c).color};--color-glifo:${infoDannoMagia(c).colorGlifo ?? "#FBFBFB"}`;
const iconoElemento = (c) => `<span class="icono-activo" style="${conColor(c)}">${iconoSao(infoDannoMagia(c).icono)}</span>`;
/* Lo que se puede poner en un golpe: los siete elementos y el daño físico normal */
const TIPOS_GOLPE = [...CLAVES_ELEMENTOS_SACRO, DANNO_FISICO];
/* Cantidad de una fila: con decimales (se redondea el resultado, redondearMagia) */
const decimal = (v) => Math.max(0, Math.min(999, Math.round((Number(String(v).replace(",", ".")) || 0) * 100) / 100));

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
const NOMBRES_PARTES = { cabeza: "boca", izquierda: "brazo izq.", derecha: "brazo der.", pies: "piernas" };
const MAX_FILAS = 20;

/* Cola de peticiones _________________________________________________________ */
const CLAVE_COLA = "fichaSAO.hechizosMaster";
/* [{ id, hechizo, sugerencia: [{ elemento, cantidad }], de: { instancia, jugador, nombre, local }, objetos, propuesta,
     decision }] (objetos: los que se van a dar; propuesta: los que salían por defecto, para restablecerlos) */
let cola = [];
let actual = 0;

const cargarObjetos = (lista) => (Array.isArray(lista) ? lista : []).map(cargarObjeto).filter(Boolean).slice(0, 10);

function cargarPeticion(p) {
    const hechizo = cargarHechizo(p?.hechizo);
    if (!hechizo) return null;
    const propuesta = cargarObjetos(p.propuesta ?? p.objetos);
    return {
        id: hechizo.id, hechizo,
        // bruto: el daño con decimales (el daño mágico los tiene); solo se redondea el resultado
        sugerencia: (Array.isArray(p.sugerencia) ? p.sugerencia : []).filter(s => ELEMENTOS_SACRO[s?.elemento])
            .map(s => ({
                elemento: s.elemento, cantidad: entero(s.cantidad),
                ...(Number.isFinite(Number(s.bruto)) && s.bruto !== null ? { bruto: Math.max(0, Math.min(999, Number(s.bruto))) } : {})
            })).slice(0, MAX_FILAS),
        de: { instancia: String(p.de?.instancia ?? ""), jugador: String(p.de?.jugador ?? ""), nombre: nombreDe(p.de?.nombre), local: Boolean(p.de?.local) },
        objetos: cargarObjetos(p.objetos),
        propuesta,
        decision: p.decision && typeof p.decision === "object" && Array.isArray(p.decision.filas) ? p.decision : null
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
    if (cola.length) pintar();
    else if (ventana().classList.contains("show")) cerrar();
    // Si está oculta para una confirmación, al volver no se abre (show.bs.modal) sin peticiones
}

/** Peticiones de magia sin resolver (para el menú del inventario) */
export const hechizosPendientes = () => cola.length;

/** Abre la ventana con la primera petición pendiente */
export function abrirHechizosMaster() {
    if (!cola.length) return ctx.aviso("Magia", ["No hay peticiones de magia pendientes."]);
    if (actual >= cola.length) actual = 0;
    if (ventana().classList.contains("show")) return pintar(); // ya abierta: solo cambia el contador
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

/* Cerrar la ventana. Cerrarla a mano cancela la petición (con confirmación). cerrandoPorCodigo: tras resolver; yendoAHija:
   se oculta para el formulario de objetos (las confirmaciones marcan data-hacia-hija). */
let cerrandoPorCodigo = false;
let yendoAHija = false;
function cerrar() {
    cerrandoPorCodigo = true;
    bootstrap.Modal.getInstance(ventana())?.hide();
}
function alOcultar(e) {
    if (cerrandoPorCodigo || yendoAHija || ventana().dataset.haciaHija || !cola[actual]) return;
    e.preventDefault();
    const peticion = cola[actual];
    setTimeout(async () => {
        const ok = await ctx.confirmar({ titulo: "Cancelar la magia", texto: `¿Cancelar lo que quiere hacer ${peticion.de.nombre}? No gasta nada.` });
        if (ok && cola.includes(peticion)) {
            actual = cola.indexOf(peticion);
            resolver(true);
        }
    }, 0);
}
function alOcultada() {
    cerrandoPorCodigo = false;
    yendoAHija = false;
}

/* Decisión del máster sobre la petición (se guarda en la cola mientras la edita). Las filas de daño: una por dedo de la
   sugerencia; la primera lleva los estados */
function decisionDe(peticion) {
    if (!peticion.decision) {
        peticion.decision = {
            // La cantidad con los decimales del daño mágico (bruto); el resultado se redondea al resolver
            filas: peticion.sugerencia.map((s, i) => ({ elemento: s.elemento, cantidad: s.bruto ?? s.cantidad, estados: i === 0 })),
            juntar: false, unico: false, radio: 1,
            tirada: peticion.hechizo.tipo === "danno" ? "intPer" : "", caracteristica: "inteligencia", habilidad: "percepcion", dado: 1,
            estados: [], nota: ""
        };
    }
    return peticion.decision;
}

/* Pintar ________________________________________________________________________ */
let editorEstados = null; // crearEditorEstadosAlAcertar de interfaz.js
let filaAbierta = null; // fila con la rejilla de elementos abierta
let peticionPintada = null; // al cambiar de petición se rellena el editor de estados

function pintar() {
    const peticion = cola[actual];
    if (!peticion) return;
    const d = decisionDe(peticion);
    const { hechizo, de } = peticion;
    const tipo = TIPOS_HECHIZO[hechizo.tipo] ? hechizo.tipo : "danno";
    el("modalSacroMasterLabel").textContent = `Magia · ${tipo === "objeto" ? "Crear objeto" : TIPOS_HECHIZO[tipo].etiqueta}`;
    el("navegarSacroMaster").hidden = cola.length < 2;
    el("contadorSacroMaster").textContent = `${actual + 1} de ${cola.length}`;
    el("formSacroMaster").dataset.tipo = tipo;
    el("formSacroMaster").querySelectorAll("[data-para]").forEach(n => { n.hidden = !n.dataset.para.split(" ").includes(tipo); });

    // Lo que ha pedido: una tarjeta con quién, el texto, los elementos por origen y las acciones
    const porOrigen = { generar: "generado", ambiente: "del ambiente", cinturon: "de un cristal", quitado: "quitado" };
    const chips = CLAVES_ELEMENTOS_SACRO.map(clave => {
        const suyos = hechizo.dedos.filter(dd => dd.elemento === clave);
        if (!suyos.length) return "";
        const origenes = [...new Set(suyos.map(dd => porOrigen[dd.origen]))].join(", ");
        return `<span class="energia-elemento">${iconoElemento(clave)}${escaparHtml(ELEMENTOS_SACRO[clave].etiqueta)} ×${suyos.length} <small>${escaparHtml(origenes)}</small></span>`;
    }).join("");
    const partes = partesHechizo(hechizo.dedos).map(x => NOMBRES_PARTES[x]).join(", ");
    el("pedidoSacroMaster").innerHTML = `<div class="pedido-sacro">
        <p class="pedido-sacro-quien">${escaparHtml(de.nombre)} quiere hacer:</p>
        <p class="pedido-sacro-forma${hechizo.forma ? "" : " vacia"}">${escaparHtml(hechizo.forma || "Sin descripción")}</p>
        <div class="pedido-sacro-dedos">${chips}</div>
        <p class="pedido-sacro-coste">Gasta ${escaparHtml(partes)}${hechizo.dedos.some(dd => dd.origen === "generar") ? " y los PV de generar" : ""}. Lo quitado se le quita a su dueño al resolver.</p>
    </div>`;

    if (peticionPintada !== peticion) {
        peticionPintada = peticion;
        filaAbierta = null;
        editorEstados?.rellenar(d.estados);
    }
    pintarFilas();
    el("juntarSacroMaster").checked = d.juntar;
    el("unicoSacroMaster").checked = d.unico;
    el("radioSacroMaster").value = String(d.radio);
    el("tiradaSacroMaster").value = d.tirada;
    el("caracteristicaSacroMaster").value = d.caracteristica;
    el("habilidadSacroMaster").value = d.habilidad;
    el("ranuraOtraTiradaSacro").hidden = d.tirada !== "otra";
    el("dadoSacroMaster").value = String(d.dado);
    el("dadoSacroMaster").disabled = !d.tirada;
    if (document.activeElement !== el("notaSacroMaster")) el("notaSacroMaster").value = d.nota;
    sincronizar.forEach(f => f());
    pintarResumen();

    el("objetosSacroMaster").innerHTML = peticion.objetos.length ? peticion.objetos.map((objeto, i) => `
        <div class="fila-objeto" data-index="${i}">
            <span class="objeto-icono">${iconoSao(ctx.iconoObjeto(objeto))}</span>
            <div class="objeto-info"><div class="objeto-cabecera"><span class="objeto-nombre">${escaparHtml(objeto.nombre)}</span><span class="objeto-cantidad">×${objeto.cantidad}</span></div>
                <div class="objeto-detalle">${escaparHtml(ctx.detalleObjeto(objeto))}</div></div>
            <div class="objeto-acciones">
                <button type="button" class="btn-objeto" data-accion="editar" title="Editar" aria-label="Editar">${iconoSao("editar")}</button>
                <button type="button" class="btn-objeto" data-accion="borrar" title="Quitar" aria-label="Quitar">${iconoSao("descartar")}</button>
            </div>
        </div>`).join("") : `<p class="lista-vacia">No crea nada todavía.</p>`;
    el("btnPropuestaSacroMaster").disabled = !peticion.propuesta.length;
}
let sincronizar = [];

/* Filas de daño (una .fila-objeto por golpe, ordenables arrastrando): número, elemento (al pulsarlo, la rejilla de los
   siete dentro de la fila), − / +, estados sí / no y quitar */
function pintarFilas() {
    const d = decisionDe(cola[actual]);
    const hayEstados = d.estados.length > 0;
    el("dannoSacroMaster").innerHTML = d.filas.length ? d.filas.map((fila, i) => {
        const info = infoDannoMagia(fila.elemento);
        const conEstados = hayEstados && fila.estados;
        const rejilla = filaAbierta === i ? `<div class="rejilla-elementos fichas-sao" role="radiogroup" aria-label="Elemento">${TIPOS_GOLPE.map(c => `
            <button type="button" class="ficha-sao" role="radio" data-elemento="${c}" aria-checked="${c === fila.elemento}"><span class="ficha-icono">${iconoElemento(c)}</span><span>${escaparHtml(infoDannoMagia(c).etiqueta)}</span></button>`).join("")}</div>` : "";
        return `<div class="fila-objeto fila-golpe" data-index="${i}" title="Arrastra para cambiar el orden">
            <span class="num-golpe">${i + 1}</span>
            <button type="button" class="elegir-elemento" aria-expanded="${filaAbierta === i}" title="Cambiar el elemento">${iconoElemento(fila.elemento)}<span>${escaparHtml(info.etiqueta)} <small>${escaparHtml(info.textoDanno)}</small></span></button>
            <input type="number" class="cantidad-danno-sacro" data-decimal step="any" min="0" max="999" value="${Number.isFinite(fila.bruto) ? fila.bruto : fila.cantidad}"
                title="Admite decimales: el resultado se redondea (sube desde ,51)" aria-label="Daño de ${escaparHtml(info.etiqueta)}">
            <span class="acciones-golpe">
                <button type="button" class="btn-objeto btn-estados-golpe${conEstados ? " activo" : ""}" data-accion="estados" aria-pressed="${conEstados}"
                    ${hayEstados ? "" : "disabled"} title="${hayEstados ? (conEstados ? "Lleva los estados: pulsa para quitarlos de este golpe" : "Sin estados: pulsa para que este golpe los lleve") : "Elige antes algún estado (abajo)"}"
                    aria-label="Estados en este golpe">${iconoSao("veneno")}</button>
                <button type="button" class="btn-objeto" data-accion="quitar" title="Quitar" aria-label="Quitar">${iconoSao("descartar")}</button>
            </span>
            ${rejilla}
        </div>`;
    }).join("") : `<p class="lista-vacia">Sin golpes.</p>`;
    el("btnAnadirGolpeSacro").hidden = d.filas.length >= MAX_FILAS;
    prepararFormularioSao(el("dannoSacroMaster"));
}

/* Lo que saldrá al resolver: los golpes (ya juntados y con el radio) y si llevan estados */
function pintarResumen() {
    const d = decisionDe(cola[actual]);
    const golpes = golpesDeFilas(d.filas.map(f => ({ ...f, estados: f.estados && d.estados.length > 0 })), { juntarPorTipo: d.juntar, unico: d.unico, radio: d.radio });
    const ficha = (f) => {
        const e = fichaDannoMagia(f.elemento, f.cantidad);
        return `<span class="popup-elemento" style="--color:${e.color};--color-texto:${e.colorTexto}" title="${escaparHtml(e.etiqueta)}">${e.cantidad} ${escaparHtml(infoDannoMagia(f.elemento).etiqueta)}</span>`;
    };
    const tiradas = d.tirada ? ` con ${golpes.length === 1 ? "su tirada" : "una tirada cada uno"}` : " sin tirada";
    el("resumenGolpesSacro").innerHTML = golpes.length
        ? `<span>Al resolver: ${golpes.length} golpe${golpes.length === 1 ? "" : "s"}${tiradas}</span>`
            + golpes.map((g, i) => `<span class="golpe-resumen">${i + 1}. ${g.danno.map(ficha).join("")}${g.estados ? ` <span class="marca-estados">${iconoSao("veneno")}</span>` : ""}</span>`).join("")
        : "<span>Al resolver: sin daño</span>";
    const factor = factorRadio(d.radio);
    el("textoRadioSacroMaster").textContent = d.radio > 1 ? `Área ${d.radio}×${d.radio}: daño ×${factor === 0.5 ? "½" : factor === 0.25 ? "¼" : String(factor).replace(".", ",")}` : "Un objetivo";
    const conEstados = d.filas.filter(f => f.estados).length;
    ponerResumen(el("detallesEstadosSacro"), d.estados.length
        ? `${d.estados.length} estado${d.estados.length === 1 ? "" : "s"} · en ${conEstados} golpe${conEstados === 1 ? "" : "s"}` : "Ninguno");
}

/* Resolver o cancelar ____________________________________________________________ */
function tiradaDe(d) {
    if (!d.tirada) return null;
    return d.tirada === "otra"
        ? { caracteristica: d.caracteristica, habilidad: d.habilidad, dado: d.dado }
        : { caracteristica: TIRADAS_MAGIA[d.tirada].caracteristica, habilidad: TIRADAS_MAGIA[d.tirada].habilidad, dado: d.dado };
}

function resultadoDe(peticion, rechazado) {
    const d = decisionDe(peticion);
    const nota = d.nota.trim().slice(0, 300);
    if (rechazado) return { id: peticion.id, rechazado: true, nota };
    const tipo = peticion.hechizo.tipo;
    if (tipo === "objeto") return { id: peticion.id, objetos: peticion.objetos, nota };
    if (tipo === "escenario") return { id: peticion.id, tirada: tiradaDe(d), nota };
    return {
        id: peticion.id,
        golpes: golpesDeFilas(d.filas.map(f => ({ ...f, estados: f.estados && d.estados.length > 0 })), { juntarPorTipo: d.juntar, unico: d.unico, radio: d.radio }),
        radio: d.radio,
        tirada: tiradaDe(d),
        estados: d.estados,
        nota
    };
}

async function resolver(rechazado) {
    const peticion = cola[actual];
    if (!peticion) return;
    const resultado = resultadoDe(peticion, rechazado);
    if (peticion.de.local) {
        ctx.aplicarResultadoLocal(peticion.de.instancia, resultado);
    } else {
        try {
            await emitirPrivado("hechizoResultado", { para: peticion.de.instancia, ...resultado });
        } catch (error) {
            return ctx.aviso("Magia", [`No se pudo enviar: ${error.message ?? error}`, "La petición sigue pendiente."]);
        }
        ctx.aviso("Magia", [rechazado ? `Cancelado lo de ${peticion.de.nombre}.` : `Resuelto lo de ${peticion.de.nombre}.`]);
    }
    // Lo que ha usado del ambiente ya no está la próxima vez
    if (!rechazado) descontarAmbiente(peticion.hechizo.dedos.filter(dd => dd.origen === "ambiente"));
    ctx.reproducir("click");
    quitarDeCola(peticion.id);
}

function recibirPeticion(evento) {
    if (!soyMasterDeSala()) return;
    const peticion = cargarPeticion({
        hechizo: evento.datos?.hechizo, sugerencia: evento.datos?.sugerencia, objetos: evento.datos?.objetos,
        de: { instancia: evento.instancia, jugador: evento.jugador, nombre: evento.personaje, local: false }
    });
    if (!peticion) return;
    encolar(peticion);
    ctx.reproducir("notificacion");
    ctx.aviso("Magia", [`${peticion.de.nombre} quiere hacer magia (${TIPOS_HECHIZO[peticion.hechizo.tipo].etiqueta.toLowerCase()}): ${describirEnergia({ dedos: peticion.hechizo.dedos })}`]);
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
export function encolarHechizoLocal(instancia, nombre, hechizo, sugerencia, objetos = []) {
    const peticion = cargarPeticion({ hechizo, sugerencia, objetos, de: { instancia, jugador: "", nombre, local: true } });
    if (!peticion) return;
    encolar(peticion);
    abrirHechizosMaster();
}
export const cancelarHechizoLocal = (id) => quitarDeCola(id);

/* Objetos que crea: el formulario de objetos sobre un pj falso (van al botín de quien lo lanza) */
function formularioObjeto(indice = null) {
    const peticion = cola[actual];
    if (!peticion) return;
    const pj = { baul: peticion.objetos, inventario: [], calcularCaracteristicas: () => {} };
    const opciones = { pj, origen: ventana(), libre: true, alTerminar: () => { peticion.objetos = pj.baul.slice(0, 10); guardarCola(); pintar(); } };
    yendoAHija = true; // se oculta para abrir el formulario: no es cancelar
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
 *        crearEditorEstados(acordeon, opciones) (el de los objetos, interfaz.js),
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
    el("navegarSacroMaster").querySelector('[data-ir="-1"]').innerHTML = iconoSao("anterior");
    el("navegarSacroMaster").querySelector('[data-ir="1"]').innerHTML = iconoSao("siguiente");
    prepararFormularioSao(el("formSacroMaster"));
    sincronizar = [
        crearFichas(el("tiradaSacroMaster")),
        crearFichas(el("dadoSacroMaster"))
    ];
    // Estados: como los de una poción (provoca o cura), sin probabilidad y sin permanente ni descanso corto
    const acordeon = el("detallesEstadosSacro");
    editorEstados = ctx.crearEditorEstados(acordeon, { probabilidad: false, cura: true, turnos: true, permanente: false });
    const alCambiarEstados = () => setTimeout(() => {
        const d = decision();
        if (!d) return;
        const antes = d.estados.length;
        d.estados = editorEstados.leer();
        // Al poner el primer estado, el primer golpe lo lleva
        if (!antes && d.estados.length && !d.filas.some(f => f.estados) && d.filas[0]) d.filas[0].estados = true;
        guardarCola();
        pintarFilas();
        pintarResumen();
    }, 0);
    acordeon.querySelector(".editor-estados-acertar").addEventListener("click", alCambiarEstados);
    acordeon.querySelector(".editor-estados-acertar").addEventListener("change", alCambiarEstados);

    const decision = () => (cola[actual] ? decisionDe(cola[actual]) : null);
    const alCambiar = (e) => {
        const d = decision();
        if (!d) return;
        const t = e.target;
        if (t.closest(".editor-estados-acertar")) return;
        if (t.classList.contains("cantidad-danno-sacro")) {
            const fila = d.filas[Number(t.closest("[data-index]").dataset.index)];
            fila.cantidad = decimal(t.value);
            delete fila.bruto; // de colas guardadas con la versión anterior
            guardarCola();
            return pintarResumen(); // sin repintar las filas, para no perder el foco
        }
        const campos = {
            juntarSacroMaster: () => { d.juntar = t.checked; },
            unicoSacroMaster: () => { d.unico = t.checked; },
            radioSacroMaster: () => { d.radio = Math.max(1, Math.min(5, entero(t.value))); },
            tiradaSacroMaster: () => { d.tirada = t.value; },
            caracteristicaSacroMaster: () => { d.caracteristica = t.value; },
            habilidadSacroMaster: () => { d.habilidad = t.value; },
            dadoSacroMaster: () => { d.dado = entero(t.value, 2); },
            notaSacroMaster: () => { d.nota = t.value; }
        };
        if (!campos[t.id]) return;
        campos[t.id]();
        guardarCola();
        if (t.id === "notaSacroMaster") return;
        if (t.id === "radioSacroMaster" && e.type === "input") return pintarResumen();
        if (e.type === "change") pintar();
    };
    el("formSacroMaster").addEventListener("change", alCambiar);
    el("formSacroMaster").addEventListener("input", alCambiar);
    // Filas de daño: elegir elemento, estados sí / no y quitar
    el("dannoSacroMaster").addEventListener("click", (e) => {
        const d = decision();
        if (!d) return;
        const i = Number(e.target.closest("[data-index]")?.dataset.index);
        if (!Number.isInteger(i) || !d.filas[i]) return;
        const opcion = e.target.closest("[data-elemento]");
        if (opcion) {
            if (d.filas[i].elemento !== opcion.dataset.elemento) {
                delete d.filas[i].bruto;
                // Metala hace siempre su daño fijo por dedo (20)
                const fijo = infoDannoMagia(opcion.dataset.elemento)?.fijo;
                if (fijo) d.filas[i].cantidad = fijo;
            }
            d.filas[i].elemento = opcion.dataset.elemento;
            filaAbierta = null;
        } else {
            const accion = e.target.closest("[data-accion]")?.dataset.accion;
            if (e.target.closest(".elegir-elemento")) filaAbierta = filaAbierta === i ? null : i;
            else if (accion === "estados") d.filas[i].estados = !d.filas[i].estados;
            else if (accion === "quitar") { d.filas.splice(i, 1); filaAbierta = null; }
            else return;
        }
        ctx.reproducir("click");
        guardarCola();
        pintarFilas();
        pintarResumen();
    });
    // Ordenar los golpes arrastrando (cambia el orden de las tiradas y de "Juntar por tipo")
    hacerOrdenable(el("dannoSacroMaster"), {
        alSoltar: (desde, hasta) => {
            const d = decision();
            if (!d) return;
            const [fila] = d.filas.splice(desde, 1);
            d.filas.splice(hasta, 0, fila);
            filaAbierta = null;
            guardarCola();
            pintarFilas();
            pintarResumen();
        }
    });
    el("btnAnadirGolpeSacro").addEventListener("click", () => {
        const d = decision();
        if (!d || d.filas.length >= MAX_FILAS) return;
        ctx.reproducir("click");
        const elemento = d.filas.at(-1)?.elemento ?? "hela";
        d.filas.push({ elemento, cantidad: infoDannoMagia(elemento)?.fijo ?? 0, estados: false });
        filaAbierta = d.filas.length - 1;
        guardarCola();
        pintarFilas();
        pintarResumen();
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
    el("btnPropuestaSacroMaster").addEventListener("click", () => {
        const peticion = cola[actual];
        if (!peticion) return;
        ctx.reproducir("click");
        peticion.objetos = structuredClone(peticion.propuesta);
        guardarCola();
        pintar();
    });
    el("btnResolverSacroMaster").addEventListener("click", () => resolver(false));
    el("navegarSacroMaster").addEventListener("click", (e) => {
        const ir = Number(e.target.closest("[data-ir]")?.dataset.ir);
        if (!ir || cola.length < 2) return;
        ctx.reproducir("click");
        actual = (actual + ir + cola.length) % cola.length;
        pintar();
    });
    // Sin peticiones no se abre (p. ej. al volver de la confirmación de cancelar la última)
    ventana().addEventListener("show.bs.modal", (e) => { if (!cola.length) e.preventDefault(); else pintar(); });
    ventana().addEventListener("shown.bs.modal", () => {
        yendoAHija = false; // vuelve del formulario de objetos
        if (!cola.length || cerrandoPorCodigo) return cerrar(); // Bootstrap ignora hide() mientras se abre
        pintar();
    });
    ventana().addEventListener("hide.bs.modal", alOcultar);
    ventana().addEventListener("hidden.bs.modal", alOcultada);

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
