/* Modo máster (?master): DOM de sus personajes. Los datos están en personajesMaster.js.
 * - Cabecera (#hudMaster): una fila por personaje de la sesión, el de la ficha incluido (.activo), ordenados por
 *   iniciativa. Pulsar una fila cambia el personaje de la ficha; el icono de salir lo saca de la sesión (sigue
 *   guardado); el + abre #modalPersonajesMaster para volver a añadir uno guardado o crear uno nuevo.
 * - Perfil (#modalPerfilMaster): crear un personaje o editar el de la ficha, con los mismos límites que la ficha.
 * interfaz.js llama a inicializarMaster con lo que necesita de la ficha (contexto). */
import PJ, { HABILIDADES_LISTA } from "./PJ.js";
import * as master from "./personajesMaster.js";
import {
    htmlFilaHud, rellenarFilaHud, comprobarPlegadoHud, motivoNombreNoDisponible, motivoNombreSala, getEstadoOnline,
    getSalaMaster, publicarPersonajesMaster, echarPersonajeSala, mensajeErrorOnline, pedirFichaJugador,
    ocultarPersonajeSala, claveOcultoSala
} from "./interfazOnline.js";
import { PROFESIONES, VALORES_COMBATE } from "./resumenFicha.js";
import { ETIQUETAS_CARACTERISTICA, ETIQUETAS_HABILIDAD, ranurasUsadas, ranurasLibres, motivoInactiva } from "./artes.js";
import { iconoSao } from "./iconos.js";
import { escaparHtml } from "./html.js";
import { reproducir } from "./sonidos.js";
import { iniciarTurno } from "./turno.js";
import { capacidadInventario, ajustarInventario, cabenEnInventario, transferirABaul, transferirAInventario } from "./objetos.js";

/**
 * @typedef {Object} ContextoMaster
 * @property {() => PJ} personaje                 el personaje de la ficha
 * @property {(json: string, guardada: string) => void} abrirFicha  pone en la ficha otro personaje
 * @property {() => void} comprobarCambios        guarda el personaje de la ficha en el almacén (vía la caché)
 * @property {() => void} marcarGuardado
 * @property {() => void} actualizar              actualizarTodo
 * @property {(pregunta: { titulo: string, texto: string }) => Promise<boolean>} confirmar
 * @property {(titulo: string, lineas: string[]) => void} aviso  pop-up informativo (texto plano)
 * @property {(objeto: object) => string} detalleObjeto  tipo y resumen de un objeto (texto plano)
 * @property {(objeto: object) => string} iconoObjeto    clave del icono de un objeto
 * @property {(lista: string, indice: number, opciones: object) => void} abrirEditorObjeto  #modalCrearObjeto, editar
 * @property {(lista: string, opciones: object) => void} abrirCrearObjeto  #modalCrearObjeto, crear
 * @property {(indice: number|null, opciones: object) => void} abrirEditorObjetoClave  #modalObjetoClave
 * @property {(arte: object) => string} detalleArte   resumen de un arte (texto plano)
 * @property {(arte: object|null, origen: HTMLElement, opciones: object) => void} abrirEditorArte  #modalCrearArte
 * @property {(arte: object|null, origen: HTMLElement, opciones: object) => void} abrirEditorOnirica  #modalCrearArte (onírica)
 * @property {(opciones: object) => void} abrirCatalogo  #modalCatalogoArtes
 * @property {(json: string, info: object) => void} abrirLectura  pone en la ficha la de un jugador, en modo lectura
 * @property {() => object|null} lectura  { jugador, id, ... } de la ficha en modo lectura, o null
 * @property {(id: string) => number} turnoDe  hora (ms) en la que empezó el turno de un personaje suyo, o 0
 * @property {(id: string, turno: number) => void} fijarTurno
 * @property {(id: string, datos: object) => void} publicarEstadoDe  estado de uno suyo en su grupo (vida, PA, turno...)
 */
/** @type {ContextoMaster} */
let ctx = null;

const el = (id) => document.getElementById(id);
const CARACTERISTICAS = ["fortaleza", "reflejos", "voluntad", "inteligencia"];

export const activo = () => Boolean(ctx);

/* Caché ________________________________________________________________________ */

let ultimoGuardado = null; // id + json + guardada de la última escritura, para no repetir
let avisoSinSitio = false;

/** La ficha avisa de cada cambio (escribirCache en interfaz.js): guarda el personaje de la ficha */
export function guardarActivo(ficha, guardada) {
    if (!ctx) return;
    const pj = ctx.personaje();
    const id = pj.idPersonaje;
    const firma = `${id}\n${guardada}\n${ficha}`;
    if (firma === ultimoGuardado) return;
    ultimoGuardado = firma;
    const ok = master.guardar(id, { json: ficha, guardada, resumen: master.resumenDe(pj) });
    if (master.getActivo() !== id) master.setActivo(id);
    if (!ok && !avisoSinSitio) {
        avisoSinSitio = true;
        ctx.aviso("Sin espacio", ["El navegador no tiene sitio para guardar más personajes. Guarda en la nube o en un fichero y borra alguno."]);
    }
}

/** Al arrancar: pone en la ficha el último personaje usado. Devuelve false si no hay ninguno guardado. */
export function restaurarMaster() {
    const id = master.getActivo() ?? master.idsEnSesion()[0] ?? master.todos()[0]?.id;
    const datos = id && master.datosPersonaje(id);
    if (!datos?.json) return false;
    try {
        master.setActivo(id);
        ctx.abrirFicha(datos.json, datos.guardada ?? "");
        return true;
    } catch (error) {
        console.warn("No se pudo recuperar el personaje del máster:", error);
        return false;
    }
}

/* Cambiar de personaje __________________________________________________________ */

/** Pone en la ficha otro personaje del máster (el actual ya está guardado en local) */
function cambiarA(id) {
    if (!master.existe(id)) return;
    ctx.comprobarCambios(); // por si queda algo sin escribir del actual
    if (!ctx.lectura() && id === ctx.personaje().idPersonaje) return;
    const datos = master.datosPersonaje(id);
    if (!datos?.json) return;
    master.setActivo(id);
    ctx.abrirFicha(datos.json, datos.guardada ?? "");
    reproducir("click");
}

/**
 * Añade una ficha cargada (fichero o nube) a los personajes del máster y la pone en la ficha. Si es el mismo
 * personaje (mismo id o mismo id de la nube) lo sustituye. Si otro tiene su nombre, pregunta si sustituirlo.
 * Devuelve false si se cancela.
 */
export async function anadirFichaCargada(jsonData, { idNube } = {}) {
    ctx.comprobarCambios();
    const pj = new PJ();
    pj.cargarJSON(jsonData);
    const delMismoIdNube = master.porIdNube(idNube);
    if (delMismoIdNube) pj.idPersonaje = delMismoIdNube.id;
    const otro = master.nombreUsado(pj.nombre, pj.idPersonaje);
    if (otro) {
        const ok = await ctx.confirmar({
            titulo: "Cargar personaje",
            texto: `Ya tienes un personaje llamado "${pj.nombre}". ¿Sustituirlo por el cargado?`
        });
        if (!ok) return false;
        pj.idPersonaje = otro.id;
    }
    const json = pj.toJSONString();
    master.guardar(pj.idPersonaje, {
        json, guardada: json,
        ...(idNube ? { idNube, nube: json } : {})
    });
    master.setActivo(pj.idPersonaje);
    ctx.abrirFicha(json, json);
    reproducir("linkStart");
    return true;
}

/** Guardar en la nube: lo que hay que subir (el de la ficha, con lo último) */
export function pendientesDeNube() {
    ctx.comprobarCambios();
    return master.pendientesDeNube();
}

/** Un personaje se ha subido a la nube con este id */
export function marcarSubido(id, idNube, json) {
    master.guardar(id, { idNube, nube: json, guardada: json });
    if (id === ctx.personaje().idPersonaje) ctx.marcarGuardado();
    actualizarHudMaster();
}

/* Sala ___________________________________________________________________________
 * En su sala (modo máster y dueño), la sesión es la de esa sala y sus personajes están en el registro y conectados
 * ("m-<id>"); la cabecera muestra además los personajes de los jugadores (registro + estados). */

/* Nombres de sus personajes que no pueden estar en la sala (los tiene otro jugador): se avisa una vez */
const avisadosNombre = new Set();

/* Sus personajes de la sesión que van a la sala: [{ id, nombre }], sin los de nombre ocupado por otro jugador */
function listaSala(registro) {
    const pj = ctx.personaje();
    const indice = Object.fromEntries(master.todos().map(p => [p.id, p]));
    return master.idsEnSesion()
        .map(id => ({ id, nombre: id === pj.idPersonaje ? String(pj.nombre ?? "").trim() : (indice[id]?.resumen?.nombre ?? "") }))
        .filter(p => {
            const motivo = motivoNombreSala(p.nombre, registro);
            if (motivo && !avisadosNombre.has(p.nombre)) {
                avisadosNombre.add(p.nombre);
                ctx.aviso("Sala", [`${p.nombre || "Sin nombre"} no está en la sala: ${motivo}`, "Cámbiale el nombre en su perfil."]);
            }
            return !motivo;
        });
}

/** servicio.js lo llama al entrar en su sala: pasa a la sesión de esa sala (con los que ya tenía en su
 *  registro y guardados aquí) y devuelve los personajes que entran */
export function proveedorSala({ codigo, registro, uid }) {
    master.setClaveSesion(codigo);
    Object.keys(registro?.[uid] ?? {}).forEach(id => master.anadirASesion(id));
    queueMicrotask(actualizarHudMaster);
    return listaSala(registro);
}

/** Al entrar o salir de una sala: la sesión es la de su sala, o la local */
export function alCambiarSala() {
    if (!ctx) return;
    const sala = getSalaMaster();
    const clave = sala ? getEstadoSalaCodigo() : master.SESION_LOCAL;
    if (clave && clave !== master.getClaveSesion()) master.setClaveSesion(clave);
    firmaHud = null;
    actualizarHudMaster();
}
const getEstadoSalaCodigo = () => getEstadoOnline().sala?.codigo ?? null;

/* Publica sus personajes en la sala poco después del último cambio (el servicio solo escribe si algo cambia) */
const RETARDO_SALA_MS = 1000;
let temporizadorSala = null;
function sincronizarSala() {
    clearTimeout(temporizadorSala);
    temporizadorSala = setTimeout(() => {
        const sala = getSalaMaster();
        if (sala) publicarPersonajesMaster(listaSala(sala.registro));
    }, RETARDO_SALA_MS);
}

/* Cabecera _______________________________________________________________________ */

let firmaHud = null; // orden de las filas y personaje activo: si no cambia, solo se repintan los valores

/**
 * Filas de la cabecera, por iniciativa y nombre: sus personajes de la sesión (el de la ficha, al día) y, en su
 * sala, los de los jugadores con sus últimos valores. { clave, id, jugador (null si es suyo), conectado, ... }
 */
function filasCabecera() {
    const pj = ctx.personaje();
    const indice = Object.fromEntries(master.todos().map(p => [p.id, p]));
    const sala = getSalaMaster();
    const propias = master.idsEnSesion().map(id => ({
        clave: `m:${id}`, id, jugador: null, conectado: true, turno: ctx.turnoDe(id),
        ...(id === pj.idPersonaje ? master.resumenDe(pj) : (indice[id]?.resumen ?? {}))
    }));
    // Ocultos (solo en su sala): clave "uid:nombre", como en la ventana de la sala
    if (sala) [...propias].forEach(f => { f.oculto = sala.ocultos.has(claveOcultoSala(sala.uid, f.nombre)); });
    const ajenas = !sala ? [] : Object.entries(sala.registro)
        .filter(([jugador]) => jugador !== sala.uid)
        .flatMap(([jugador, personajes]) => Object.entries(personajes ?? {}).map(([id, registro]) => {
            const estado = sala.estados[id];
            return {
                clave: `${jugador}:${id}`, id, jugador,
                conectado: sala.conectados.has(`${jugador}|${id}`),
                nombre: estado?.nombre || registro?.nombre || "",
                vida: estado?.vida ?? 1, pa: estado?.pa ?? 0, nivel: estado?.nivel ?? "?",
                iniciativa: estado?.iniciativa ?? 0, estados: estado?.estados ?? [], turno: estado?.turno ?? 0,
                oculto: sala.ocultos.has(claveOcultoSala(jugador, estado?.nombre || registro?.nombre || ""))
            };
        }));
    return [...propias, ...ajenas]
        .sort((a, b) => (b.iniciativa ?? 0) - (a.iniciativa ?? 0) || (a.nombre ?? "").localeCompare(b.nombre ?? ""));
}

/* Motivo por el que no se puede echar una fila, o null */
function motivoNoEchar(f) {
    if (!f.jugador) return master.motivoNoQuitar(f.id);
    return f.conectado ? "Está conectado: no se puede echar" : null;
}

/** Repinta la cabecera del máster (en cada actualizarTodo y cuando cambia la sala) */
export function actualizarHudMaster() {
    if (!ctx) return;
    const hud = el("hudMaster");
    const filas = filasCabecera();
    const idActivo = ctx.personaje().idPersonaje;
    const lectura = ctx.lectura();
    hud.hidden = false;
    hud.querySelector(".hud-grupo-numero").textContent = String(filas.length);
    const lista = el("hudMasterLista");
    const sala = getSalaMaster();
    const firma = filas.map(f => f.clave).join(",") + "|" + idActivo + "|" + Boolean(sala);
    if (firma !== firmaHud) {
        firmaHud = firma;
        // El + va a la derecha del último; los demás dejan su hueco para que las barras queden alineadas
        lista.innerHTML = filas.map((f, i) => `
            <div class="hud-master-item" data-id="${escaparHtml(f.id)}" data-jugador="${escaparHtml(f.jugador ?? "")}">
                ${htmlFilaHud()}
                ${sala ? `<button type="button" class="btn-hud-echar btn-hud-ocultar" data-accion="ocultar"></button>` : ""}
                <button type="button" class="btn-hud-echar" data-accion="echar">${iconoSao("salir")}</button>
                ${i === filas.length - 1
                    ? `<button type="button" class="btn-h2 hud-master-anadir" title="Añadir o crear personaje" aria-label="Añadir o crear personaje">+</button>`
                    : `<span class="hud-master-hueco" aria-hidden="true"></span>`}
            </div>`).join("");
    }
    // Turno: parpadea quien pulsó Play más tarde (con la misma iniciativa, varios a la vez)
    const ultimoTurno = ultimoTurnoDe(filas);
    filas.forEach((f, i) => {
        const item = lista.children[i];
        const fila = item.querySelector(".hud-grupo-fila");
        fila.classList.toggle("en-turno", f.turno > 0 && f.turno >= ultimoTurno);
        // En pantalla: el suyo de la ficha o, en modo lectura, el del jugador que se está mirando
        const esActivo = f.jugador ? Boolean(lectura) && lectura.jugador === f.jugador && lectura.id === f.id
            : !lectura && f.id === idActivo;
        const nombre = f.nombre || "Sin nombre";
        fila.classList.toggle("activo", esActivo);
        fila.classList.toggle("desconectado", !f.conectado);
        fila.setAttribute("aria-current", esActivo ? "true" : "false");
        fila.title = esActivo ? `${nombre} (en la ficha${f.jugador ? ", solo lectura: pulsa para actualizarla" : ""})`
            : f.jugador ? `Ver la ficha de ${nombre} (solo lectura${f.conectado ? "" : "; desconectado: la última copia guardada"})`
            : `Ver ${nombre} en la ficha`;
        rellenarFilaHud(fila, f);
        // Ocultar: ojo abierto si se ve, tachado si está oculto (no recibe objetos, amistad ni grupo, ni turno a la vez)
        fila.classList.toggle("oculta", Boolean(f.oculto));
        if (f.oculto) fila.title += " · oculto";
        const ocultar = item.querySelector(".btn-hud-ocultar");
        if (ocultar && ocultar.dataset.oculto !== String(Boolean(f.oculto))) {
            ocultar.dataset.oculto = String(Boolean(f.oculto));
            ocultar.innerHTML = iconoSao(f.oculto ? "cegado" : "percepcion");
            ocultar.classList.toggle("activo", Boolean(f.oculto));
            ocultar.title = f.oculto ? "Mostrar (vuelve a contar para objetos, amistad, grupo y turnos)"
                : "Ocultar (no sale para dar objetos, amistad ni grupo, ni empieza turno a la vez)";
            ocultar.setAttribute("aria-label", ocultar.title);
        }
        const echar = item.querySelector('.btn-hud-echar[data-accion="echar"]');
        const motivo = motivoNoEchar(f);
        echar.disabled = Boolean(motivo);
        echar.title = motivo || (f.jugador ? "Echar de la sala" : "Sacar de la sesión (sigue guardado)");
        echar.setAttribute("aria-label", echar.title);
    });
    comprobarPlegadoHud(hud);
    sincronizarSala();
}

/* Hora del último turno visto. Se recuerda: si quien lo tenía pasa a zona segura (turno 0), los anteriores
   no vuelven a parpadear */
let ultimoTurnoVisto = 0;
const ultimoTurnoDe = (filas) => (ultimoTurnoVisto = Math.max(ultimoTurnoVisto, ...filas.map(f => f.turno || 0)));
/** Hora del último turno visto en la sala (para que un Play nuevo siempre sea posterior) */
export const getUltimoTurno = () => ultimoTurnoVisto;

/** ¿El personaje que está en la ficha (suyo o, en modo lectura, el del jugador) tiene el turno? (HUD) */
export function estaEnTurno() {
    if (!ctx) return false;
    const filas = filasCabecera();
    const ultimoTurno = ultimoTurnoDe(filas);
    const lectura = ctx.lectura();
    const enFicha = lectura ? filas.find(f => f.jugador === lectura.jugador && f.id === lectura.id)
        : filas.find(f => !f.jugador && f.id === ctx.personaje().idPersonaje);
    return Boolean(enFicha) && enFicha.turno > 0 && enFicha.turno >= ultimoTurno;
}

const mismaIniciativa = (a, b) => Math.round((Number(a) || 0) * 10) === Math.round((Number(b) || 0) * 10);

/**
 * Alguien (el personaje de la ficha u otro de la sala) ha empezado su turno a esa hora con esa iniciativa: sus
 * personajes de la sesión que no están en la ficha, con la misma iniciativa y en zona no segura, empiezan a la vez
 * (se aplica su inicio de turno y se guardan en local). El de la ficha lo hace interfaz.js.
 */
export function alIniciarTurno(hora, iniciativa, quien) {
    if (!ctx) return;
    // Cualquier turno nuevo de la sala apaga los anteriores
    ultimoTurnoVisto = Math.max(ultimoTurnoVisto, Number(hora) || 0);
    // En modo lectura la ficha es la de un jugador: todos los suyos están en el almacén
    const idFicha = ctx.lectura() ? null : ctx.personaje().idPersonaje;
    for (const id of master.idsEnSesion()) {
        if (id === idFicha || ctx.turnoDe(id) === hora) continue;
        const datos = master.datosPersonaje(id);
        const sala = getSalaMaster();
        if (sala?.ocultos.has(claveOcultoSala(sala.uid, datos?.resumen?.nombre ?? ""))) continue; // oculto
        if (!datos?.json || !mismaIniciativa(datos.resumen?.iniciativa, iniciativa)) continue;
        const otro = new PJ();
        otro.cargarJSON(JSON.parse(datos.json));
        if (otro.zona !== "noSegura" || !mismaIniciativa(otro.iniciativa, iniciativa)) continue;
        const resumen = iniciarTurno(otro);
        master.guardar(id, { json: otro.toJSONString(), resumen: master.resumenDe(otro) });
        ctx.fijarTurno(id, hora);
        ctx.publicarEstadoDe(id, { ...master.resumenDe(otro), turno: hora });
        ctx.aviso(`Inicio de turno: ${otro.nombre || "Sin nombre"}`, [`Empieza a la vez que ${quien || "otro personaje"} (misma iniciativa).`, ...resumen]);
    }
    actualizarHudMaster();
}

/** Uno de sus personajes (de la sesión o guardado) como PJ, para leerlo (sin guardarlo), o null */
export function leerPersonaje(id) {
    const datos = master.datosPersonaje(id);
    if (!datos?.json) return null;
    const pj = new PJ();
    pj.cargarJSON(JSON.parse(datos.json));
    return pj;
}

/**
 * Aplica un cambio (fn(pj)) a uno de sus personajes que no está en la ficha (p. ej. lo que se le ofrece o una
 * amistad), lo guarda en local y publica su estado en su grupo. Devuelve lo que devuelva fn, o null si no existe.
 */
export function conPersonaje(id, fn) {
    const pj = leerPersonaje(id);
    if (!pj) return null;
    const resultado = fn(pj);
    pj.calcularCaracteristicas();
    master.guardar(id, { json: pj.toJSONString(), resumen: master.resumenDe(pj) });
    ctx.publicarEstadoDe(id, { ...master.resumenDe(pj), turno: ctx.turnoDe(id) });
    actualizarHudMaster();
    return resultado;
}

/* Oculta o muestra un personaje de la sala (suyo o de un jugador), como en la ventana de la sala */
async function cambiarOculto(id, jugador) {
    const sala = getSalaMaster();
    const fila = filasCabecera().find(f => f.id === id && (f.jugador ?? "") === (jugador ?? ""));
    if (!sala || !fila?.nombre) return;
    try {
        await ocultarPersonajeSala(jugador ?? sala.uid, fila.nombre, !fila.oculto);
    } catch (error) {
        ctx.aviso("No se pudo cambiar", [mensajeErrorOnline(error)]);
    }
}

async function echar(id, jugador) {
    const fila = filasCabecera().find(f => f.id === id && (f.jugador ?? "") === (jugador ?? ""));
    if (!fila || motivoNoEchar(fila)) return;
    const nombre = fila.nombre || "Sin nombre";
    if (fila.jugador) {
        // Personaje de un jugador desconectado: sale de la sala (si vuelve a entrar con él, reaparece)
        const ok = await ctx.confirmar({
            titulo: "Echar de la sala",
            texto: `¿Echar a ${nombre} de la sala? Si su jugador vuelve a entrar con él, volverá a aparecer.`
        });
        if (!ok) return;
        try {
            await echarPersonajeSala(fila.jugador, id);
        } catch (error) {
            ctx.aviso("No se pudo echar", [mensajeErrorOnline(error)]);
        }
        return;
    }
    const ok = await ctx.confirmar({
        titulo: "Sacar de la sesión",
        texto: `¿Sacar a ${nombre} de la sesión? Sigue guardado y puedes volver a añadirlo con +.`
    });
    if (!ok) return;
    // Si es el de la ficha (o el último suyo que tenía, en modo lectura), primero se pasa al siguiente de los suyos
    if (id === master.getActivo() || id === ctx.personaje().idPersonaje) {
        const siguiente = filasCabecera().find(f => !f.jugador && f.id !== id);
        if (!siguiente) return;
        cambiarA(siguiente.id);
    }
    master.quitarDeSesion(id);
    actualizarHudMaster();
}

/* Ficha de un jugador en modo lectura: si está conectado se le pide la actual; si no, la última copia */
let pidiendoFicha = false;
async function verFichaJugador(jugador, id) {
    if (pidiendoFicha) return;
    const fila = filasCabecera().find(f => f.jugador === jugador && f.id === id);
    if (!fila) return;
    const nombre = fila.nombre || "Sin nombre";
    reproducir("click");
    pidiendoFicha = true;
    try {
        if (fila.conectado) ctx.aviso(`Ficha de ${nombre}`, ["Pidiendo su ficha…"]);
        const resultado = await pedirFichaJugador(jugador, id);
        if (resultado.error) {
            ctx.aviso(`Ficha de ${nombre}`, [resultado.error]);
            return;
        }
        ctx.abrirLectura(resultado.json, { jugador, id, nombre, actualizado: resultado.actualizado, aviso: resultado.aviso });
    } finally {
        pidiendoFicha = false;
    }
}

function inicializarHud() {
    const hud = el("hudMaster");
    hud.addEventListener("click", (e) => {
        if (e.target.closest(".hud-grupo-pestana")) {
            reproducir("click");
            hud.classList.toggle("abierto");
            comprobarPlegadoHud(hud);
            return;
        }
        if (e.target.closest(".hud-master-anadir")) {
            reproducir("click");
            hud.classList.remove("abierto");
            abrirPersonajesMaster();
            return;
        }
        const item = e.target.closest(".hud-master-item");
        if (!item) return;
        const boton = e.target.closest(".btn-hud-echar");
        if (boton) {
            if (boton.disabled) return;
            reproducir("click");
            if (boton.dataset.accion === "ocultar") cambiarOculto(item.dataset.id, item.dataset.jugador || null);
            else echar(item.dataset.id, item.dataset.jugador || null);
            return;
        }
        if (e.target.closest(".hud-grupo-fila")) {
            hud.classList.remove("abierto");
            if (item.dataset.jugador) {
                verFichaJugador(item.dataset.jugador, item.dataset.id);
                return;
            }
            if (!ctx.lectura() && item.dataset.id === ctx.personaje().idPersonaje) return;
            cambiarA(item.dataset.id);
        }
    });
    document.addEventListener("click", (e) => {
        if (hud.classList.contains("abierto") && !hud.contains(e.target)) {
            hud.classList.remove("abierto");
            comprobarPlegadoHud(hud);
        }
    });
    new ResizeObserver(() => comprobarPlegadoHud(hud)).observe(el("datosPrincipalesDiv"));
}

/* Añadir personaje (#modalPersonajesMaster) _____________________________________ */

function abrirPersonajesMaster() {
    pintarPersonajesMaster();
    const ventana = el("modalPersonajesMaster");
    ventana.dataset.sinSonidoAbrir = "1"; // ya ha sonado el clic
    bootstrap.Modal.getOrCreateInstance(ventana).show();
}

function pintarPersonajesMaster() {
    const fuera = master.fueraDeSesion();
    el("listaPersonajesMaster").innerHTML = fuera.length ? fuera.map(p => {
        const r = p.resumen ?? {};
        return `
        <div class="fila-objeto" data-id="${escaparHtml(p.id)}">
            <span class="objeto-icono">${iconoSao("personaje")}</span>
            <div class="objeto-info">
                <div class="objeto-cabecera"><span class="objeto-nombre">${escaparHtml(r.nombre || "Sin nombre")}</span></div>
                <div class="objeto-detalle">LV ${escaparHtml(r.nivel ?? "?")} · Iniciativa ${escaparHtml(Math.round((r.iniciativa ?? 0) * 10) / 10)}</div>
            </div>
            <div class="objeto-acciones">
                <button type="button" class="btn-objeto" data-accion="usar" title="Añadir a la sesión" aria-label="Añadir a la sesión">${iconoSao("anadirAmigo")}</button>
                <button type="button" class="btn-objeto" data-accion="descartar" title="Borrar del navegador" aria-label="Borrar del navegador">${iconoSao("descartar")}</button>
            </div>
        </div>`;
    }).join("") : `<p class="lista-vacia">Todos tus personajes guardados están en la sesión. Crea uno nuevo con "+ Crear personaje".</p>`;
}

function inicializarPersonajesMaster() {
    el("listaPersonajesMaster").addEventListener("click", async (e) => {
        const boton = e.target.closest("button[data-accion]");
        const id = boton?.closest("[data-id]")?.dataset.id;
        if (!id) return;
        reproducir("click");
        if (boton.dataset.accion === "usar") {
            master.anadirASesion(id);
            actualizarHudMaster();
            pintarPersonajesMaster();
        } else if (boton.dataset.accion === "descartar") {
            const nombre = master.datosPersonaje(id)?.resumen?.nombre || "Sin nombre";
            const ok = await ctx.confirmar({
                titulo: "Borrar personaje",
                texto: `¿Borrar a ${nombre} del navegador? No se puede deshacer (lo que tengas en la nube o en un fichero se conserva).`
            });
            if (ok) master.borrar(id);
            pintarPersonajesMaster();
        }
    });
    el("btnCrearPersonajeMaster").addEventListener("click", () => {
        reproducir("click");
        const ventana = el("modalPersonajesMaster");
        ventana.addEventListener("hidden.bs.modal", () => abrirPerfilMaster({ crear: true }), { once: true });
        ventana.dataset.sinSonidoCerrar = "1";
        bootstrap.Modal.getOrCreateInstance(ventana).hide();
    });
}

/* Perfil del máster (#modalPerfilMaster) _________________________________________
 * Se edita un borrador (un PJ aparte) con los mismos límites que la ficha; al aceptar se crea el personaje o
 * se copia al de la ficha. Cada campo se aplica al salir de él (change), así se puede escribir "12". */

let borrador = null;
let creando = false;

/** Abre el perfil: { crear: true } para un personaje nuevo; si no, el de la ficha */
export function abrirPerfilMaster({ crear = false } = {}) {
    creando = crear;
    borrador = new PJ();
    if (!crear) borrador.cargarJSON(JSON.parse(ctx.personaje().toJSONString()));
    else borrador.nombre = "";
    el("modalPerfilMasterLabel").textContent = crear ? "Nuevo personaje" : `Perfil de ${ctx.personaje().nombre || "Sin nombre"}`;
    el("avisoPerfilMaster").textContent = "";
    pintarPerfil();
    const ventana = el("modalPerfilMaster");
    ventana.dataset.sinSonidoAbrir = "1";
    bootstrap.Modal.getOrCreateInstance(ventana).show();
}

const campoNumero = (clave, etiqueta, min, max) =>
    `<label>${escaparHtml(etiqueta)} <input type="number" data-clave="${clave}" min="${min}" max="${max}"></label>`;

function pintarPerfil() {
    const pj = borrador;
    pj.calcularCaracteristicas();
    el("perfilMasterNombre").value = pj.nombre;
    el("perfilMasterNivel").value = pj.nivel;
    el("perfilMasterProfesion").value = pj.tipoProfesion;
    el("perfilMasterUnderworld").checked = pj.esUnderworld;
    el("perfilMasterProtagonista").checked = pj.protagonista;
    const maxCar = pj.getMaxCaracteristicas();
    el("perfilMasterCaracteristicas").querySelectorAll("input[data-clave]").forEach(input => {
        input.value = pj[input.dataset.clave];
        input.max = maxCar;
    });
    el("perfilMasterPuntosCar").textContent =
        `(Puntos: ${pj.getPuntosCaracteristicasDisponibles()} / ${pj.getPuntosCaracteristicasTotales()}; máximo ${maxCar} cada una)`;
    const maxHab = pj.getMaxHabilidad();
    el("perfilMasterHabilidades").querySelectorAll("input[data-clave]").forEach(input => {
        const hab = input.dataset.clave;
        input.value = pj[hab];
        input.max = maxHab;
        input.closest("label").hidden = !pj.puedeUsarHabilidad(hab);
    });
    el("perfilMasterPuntosHab").textContent =
        `(Puntos: ${pj.getPuntosHabilidadDisponibles()} / ${pj.getPuntosHabilidadTotales()}; máximo ${maxHab} cada una)`;
    el("perfilMasterVida").value = pj.vida;
    el("perfilMasterVida").max = pj.vidaMax;
    el("perfilMasterVidaMax").textContent = pj.vidaMax;
    el("perfilMasterPA").value = pj.puntosArte;
    el("perfilMasterPA").max = pj.puntosArteMax;
    el("perfilMasterPAMax").textContent = pj.puntosArteMax;
    el("perfilMasterCor").value = pj.cor;
    pintarCombatePerfil();
    pintarObjetosPerfil();
    pintarArtesPerfil();
}

/* Artes del borrador: equipadas, sin equipar y oníricas (solo con Underworld). Se añaden del catálogo o se
   crean sin gastar desbloqueos, y se equipan sin mirar la zona ni los requisitos (si no los cumple, en la
   ficha sale inactiva); la memoria sí cuenta, porque la ficha desequipa lo que no cabe. */
function filaArtePerfil(arte, indice) {
    const activa = arte.tipo === "activa";
    const estado = arte.onirica ? "Onírica" : arte.equipada ? "Equipada" : "Sin equipar";
    const coste = [activa ? `${arte.costePA} PA` : "Pasiva", arte.onirica ? "" : `${arte.ranuras} ranura${arte.ranuras === 1 ? "" : "s"}`]
        .filter(Boolean).join(" · ");
    const inactiva = arte.equipada && motivoInactiva(borrador, arte);
    const equipar = arte.onirica ? ""
        : arte.equipada ? botonObjeto("desequipar", "cancelar", "Desequipar")
        : botonObjeto("equipar", "artes", "Equipar", arte.ranuras > ranurasLibres(borrador) ? "No queda memoria de artes" : "");
    return `<div class="fila-objeto fila-arte${inactiva ? " inactiva" : ""}" data-index="${indice}">
        <span class="objeto-icono">${iconoSao(arte.onirica ? "onirica" : activa ? "arteActiva" : "artePasiva")}</span>
        <div class="objeto-info">
            <div class="objeto-cabecera">
                <span class="objeto-nombre">${escaparHtml(arte.nombre)}</span>
                <span class="objeto-cantidad">${escaparHtml(coste)}</span>
            </div>
            <div class="objeto-detalle">${escaparHtml(estado)} · ${escaparHtml(ctx.detalleArte(arte))}</div>
            ${inactiva ? `<div class="arte-inactiva">Inactiva: ${escaparHtml(inactiva.replace(/^Requisitos no cumplidos: /, "falta "))}</div>` : ""}
        </div>
        <div class="objeto-acciones">${botonObjeto("editar", "editar", "Editar")}${equipar}${botonObjeto("descartar", "descartar", "Borrar")}</div>
    </div>`;
}

function pintarArtesPerfil() {
    const pj = borrador;
    if (!pj) return;
    pj.calcularCaracteristicas();
    // Primero las oníricas, luego las equipadas y luego las demás; sin Underworld las oníricas no se ven
    const orden = (arte) => arte.onirica ? 0 : arte.equipada ? 1 : 2;
    const visibles = pj.artes.map((arte, i) => ({ arte, i }))
        .filter(({ arte }) => !arte.onirica || pj.esUnderworld)
        .sort((a, b) => orden(a.arte) - orden(b.arte));
    el("perfilMasterArtes").innerHTML = visibles.length
        ? visibles.map(({ arte, i }) => filaArtePerfil(arte, i)).join("")
        : `<p class="lista-vacia">Sin artes.</p>`;
    el("perfilMasterMemoria").textContent = `(memoria ${ranurasUsadas(pj)} / ${pj.espaciosArte})`;
    el("perfilMasterCrearOnirica").hidden = !pj.esUnderworld;
}

const opcionesArte = () => ({ pj: borrador, origen: el("modalPerfilMaster"), alTerminar: pintarArtesPerfil, libre: true });

async function accionArtePerfil(indice, accion) {
    const pj = borrador;
    const arte = pj.artes[indice];
    if (!arte) return;
    if (accion === "editar") {
        const origen = el("modalPerfilMaster");
        if (arte.onirica) ctx.abrirEditorOnirica(arte, origen, opcionesArte());
        else ctx.abrirEditorArte(arte, origen, opcionesArte());
        return;
    }
    if (accion === "equipar") {
        if (arte.ranuras > ranurasLibres(pj)) return;
        arte.equipada = true;
        pj.artes.push(...pj.artes.splice(indice, 1)); // al final, como equiparArte
    }
    if (accion === "desequipar") arte.equipada = false;
    if (accion === "descartar") {
        const ok = await ctx.confirmar({ titulo: "Borrar arte", texto: `¿Borrar ${arte.nombre}? No devuelve el desbloqueo.` });
        if (!ok || pj !== borrador) return;
        pj.artes.splice(pj.artes.indexOf(arte), 1);
    }
    pj.calcularCaracteristicas();
    pintarArtesPerfil();
}

/* Valores de combate del borrador, como las tarjetas de la ficha (sin editar). Sin Underworld no hay daño mágico. */
const formatearNumero = (valor) => {
    const numero = Number(valor) || 0;
    return Number.isInteger(numero) ? String(numero) : numero.toFixed(1).replace(".", ",");
};

function pintarCombatePerfil() {
    const pj = borrador;
    el("perfilMasterCombate").innerHTML = VALORES_COMBATE
        .filter(v => !v.soloUnderworld || pj.esUnderworld)
        .map(v => `<div class="resumen-valor" title="${escaparHtml(v.ayuda)}"><span>${escaparHtml(v.etiqueta)}</span>
            <b>${formatearNumero(pj[v.clave])}</b>${v.unidad ? ` <small>${escaparHtml(v.unidad)}</small>` : ""}</div>`).join("");
}

/* Inventario, baúl y objetos clave del borrador: se crean y editan con las mismas ventanas que la ficha
   (vuelven a esta), sin gastar acciones ni restricciones de zona */
const LISTAS_PERFIL = { inventario: "perfilMasterInventario", baul: "perfilMasterBaul", objetosClave: "perfilMasterObjetosClave" };

const botonObjeto = (accion, icono, titulo, motivo = "") =>
    `<button type="button" class="btn-objeto" data-accion="${accion}" title="${escaparHtml(motivo || titulo)}"
        aria-label="${escaparHtml(motivo || titulo)}" ${motivo ? "disabled" : ""}>${iconoSao(icono)}</button>`;

function filaObjetoPerfil(lista, objeto, indice) {
    if (!objeto) return `<div class="fila-objeto vacia" data-index="${indice}"><span class="objeto-hueco">Hueco libre</span></div>`;
    const esClave = lista === "objetosClave";
    const mover = lista === "inventario" ? botonObjeto("baul", "baul", "Pasar al baúl")
        : lista === "baul" ? botonObjeto("inventario", "inventario", "Pasar al inventario",
            cabenEnInventario(borrador, objeto) > 0 ? "" : "No queda espacio en el inventario")
        : "";
    const sobrante = lista === "inventario" && indice >= capacidadInventario(borrador);
    return `<div class="fila-objeto${sobrante ? " sobrante" : ""}" data-index="${indice}" ${sobrante ? `title="Sin espacio: libera un hueco"` : ""}>
        <span class="objeto-icono">${iconoSao(esClave ? "llave" : ctx.iconoObjeto(objeto))}</span>
        <div class="objeto-info">
            <div class="objeto-cabecera">
                <span class="objeto-nombre">${escaparHtml(objeto.nombre)}</span>
                ${esClave ? "" : `<span class="objeto-cantidad">×${objeto.cantidad}</span>`}
            </div>
            ${esClave ? "" : `<div class="objeto-detalle">${escaparHtml(ctx.detalleObjeto(objeto))}</div>`}
            ${objeto.descripcion ? `<div class="objeto-descripcion">${escaparHtml(objeto.descripcion)}</div>` : ""}
        </div>
        <div class="objeto-acciones">${botonObjeto("editar", "editar", "Editar")}${mover}${botonObjeto("descartar", "descartar", "Quitar")}</div>
    </div>`;
}

function pintarObjetosPerfil() {
    const pj = borrador;
    if (!pj) return;
    ajustarInventario(pj); // la capacidad cambia con lo que se edite
    for (const [lista, id] of Object.entries(LISTAS_PERFIL)) {
        const objetos = pj[lista];
        el(id).innerHTML = objetos.length
            ? objetos.map((objeto, i) => filaObjetoPerfil(lista, objeto, i)).join("")
            : `<p class="lista-vacia">${lista === "objetosClave" ? "Sin objetos clave." : "Vacío."}</p>`;
    }
    el("perfilMasterContadorInventario").textContent = `(${pj.inventario.filter(Boolean).length} / ${capacidadInventario(pj)})`;
    el("perfilMasterContadorBaul").textContent = `(${pj.baul.length})`;
    el("perfilMasterContadorClave").textContent = `(${pj.objetosClave.length})`;
}

/* Lo que necesitan las ventanas de objetos para trabajar sobre el borrador y volver aquí */
const opcionesObjeto = () => ({ pj: borrador, origen: el("modalPerfilMaster"), alTerminar: pintarObjetosPerfil, libre: true });

async function accionObjetoPerfil(lista, indice, accion) {
    const pj = borrador;
    const objeto = pj[lista][indice];
    if (!objeto) return;
    if (accion === "editar") {
        if (lista === "objetosClave") ctx.abrirEditorObjetoClave(indice, opcionesObjeto());
        else ctx.abrirEditorObjeto(lista, indice, opcionesObjeto());
        return;
    }
    if (accion === "baul") transferirABaul(pj, indice);
    if (accion === "inventario") {
        const resultado = transferirAInventario(pj, indice);
        if (!resultado.ok) el("avisoPerfilMaster").textContent = resultado.resumen.join(" ");
    }
    if (accion === "descartar") {
        const ok = await ctx.confirmar({ titulo: "Quitar objeto", texto: `¿Quitar ${objeto.nombre}${objeto.cantidad > 1 ? ` (×${objeto.cantidad})` : ""}?` });
        if (!ok || pj !== borrador) return;
        if (lista === "inventario") pj.inventario[indice] = null;
        else pj[lista].splice(indice, 1);
    }
    pintarObjetosPerfil();
}

const entero = (valor, porDefecto = 0) => {
    const n = Math.trunc(Number(valor));
    return Number.isFinite(n) ? n : porDefecto;
};
const limitar = (valor, min, max) => Math.max(min, Math.min(max, valor));

/* Recalcula y, si la vida o los PA estaban al máximo, los mantiene al máximo (subir de nivel a un personaje
   nuevo no lo deja herido) */
function recalcularConservandoMaximos(cambio) {
    const pj = borrador;
    pj.calcularCaracteristicas();
    const vidaLlena = pj.vida >= pj.vidaMax;
    const paLleno = pj.puntosArte >= pj.puntosArteMax;
    cambio();
    pj.calcularCaracteristicas();
    pj.vida = vidaLlena ? pj.vidaMax : Math.min(pj.vida, pj.vidaMax);
    pj.puntosArte = paLleno ? pj.puntosArteMax : Math.min(pj.puntosArte, pj.puntosArteMax);
}

/* Aplica un campo del formulario al borrador, con los límites de la ficha (validarYActualizar en interfaz.js) */
function aplicarCampo(input) {
    const pj = borrador;
    const clave = input.dataset.clave;
    if (input.id === "perfilMasterNombre") {
        pj.nombre = input.value.trim().slice(0, 60);
    } else if (input.id === "perfilMasterNivel") {
        recalcularConservandoMaximos(() => { pj.nivel = limitar(entero(input.value, pj.nivel), 1, 150); });
    } else if (input.id === "perfilMasterProfesion") {
        if (PROFESIONES[input.value]) pj.tipoProfesion = input.value;
    } else if (input.id === "perfilMasterUnderworld") {
        pj.setUnderworld(input.checked);
    } else if (input.id === "perfilMasterProtagonista") {
        pj.protagonista = input.checked;
    } else if (CARACTERISTICAS.includes(clave)) {
        const anterior = Number(pj[clave]) || 0;
        const otros = pj.getPuntosCaracteristicasGastados() - anterior;
        const maximo = Math.min(pj.getMaxCaracteristicas(), pj.getPuntosCaracteristicasLimite() - otros);
        recalcularConservandoMaximos(() => { pj[clave] = limitar(entero(input.value, anterior), 1, Math.max(1, maximo)); });
    } else if (HABILIDADES_LISTA.includes(clave)) {
        if (!pj.puedeUsarHabilidad(clave)) return;
        const anterior = Number(pj[clave]) || 0;
        const maximo = Math.min(pj.getMaxHabilidad(), anterior + pj.getPuntosHabilidadDisponibles());
        recalcularConservandoMaximos(() => { pj[clave] = limitar(entero(input.value, anterior), 0, Math.max(0, maximo)); });
    } else if (input.id === "perfilMasterVida") {
        pj.vida = limitar(entero(input.value, pj.vida), 0, pj.vidaMax);
    } else if (input.id === "perfilMasterPA") {
        pj.puntosArte = limitar(entero(input.value, pj.puntosArte), 0, pj.puntosArteMax);
    } else if (input.id === "perfilMasterCor") {
        pj.cor = Math.max(0, entero(input.value, pj.cor));
    }
}

function aceptarPerfil() {
    if (!borrador) return;
    const form = el("formPerfilMaster");
    form.querySelectorAll("input, select").forEach(aplicarCampo);
    const pj = borrador;
    const aviso = el("avisoPerfilMaster");
    const motivo = !pj.nombre ? "Escribe un nombre."
        : master.nombreUsado(pj.nombre, pj.idPersonaje) ? `Ya tienes un personaje llamado "${pj.nombre}".`
        : motivoNombreNoDisponible(pj.nombre);
    if (motivo) {
        aviso.textContent = motivo;
        aviso.scrollIntoView({ block: "nearest" });
        return;
    }
    reproducir("click");
    const json = pj.toJSONString();
    if (creando) {
        ctx.comprobarCambios();
        master.guardar(pj.idPersonaje, { json, guardada: "" }); // nuevo: aún no se ha guardado en ningún sitio
        master.setActivo(pj.idPersonaje);
        ctx.abrirFicha(json, "");
    } else {
        ctx.personaje().cargarJSON(JSON.parse(json));
        ctx.actualizar();
    }
    bootstrap.Modal.getOrCreateInstance(el("modalPerfilMaster")).hide();
}

function inicializarPerfilMaster() {
    el("perfilMasterProfesion").innerHTML = Object.entries(PROFESIONES)
        .map(([valor, etiqueta]) => `<option value="${valor}">${escaparHtml(etiqueta)}</option>`).join("");
    el("perfilMasterCaracteristicas").innerHTML = CARACTERISTICAS
        .map(clave => campoNumero(clave, ETIQUETAS_CARACTERISTICA[clave], 1, 9)).join("");
    el("perfilMasterHabilidades").innerHTML = HABILIDADES_LISTA
        .map(clave => campoNumero(clave, ETIQUETAS_HABILIDAD[clave], 0, 10)).join("");
    const form = el("formPerfilMaster");
    form.addEventListener("change", (e) => {
        if (!borrador || !e.target.matches("input, select")) return;
        aplicarCampo(e.target);
        el("avisoPerfilMaster").textContent = "";
        pintarPerfil();
    });
    form.addEventListener("submit", (e) => e.preventDefault());
    form.addEventListener("click", (e) => {
        if (!borrador) return;
        const crear = e.target.closest("button[data-crear]");
        if (crear) {
            reproducir("click");
            const origen = el("modalPerfilMaster");
            const tipo = crear.dataset.crear;
            if (tipo === "objetosClave") ctx.abrirEditorObjetoClave(null, opcionesObjeto());
            else if (tipo === "catalogo") ctx.abrirCatalogo(opcionesArte());
            else if (tipo === "arte") ctx.abrirEditorArte(null, origen, opcionesArte());
            else if (tipo === "onirica") ctx.abrirEditorOnirica(null, origen, opcionesArte());
            else ctx.abrirCrearObjeto(tipo, opcionesObjeto());
            return;
        }
        const boton = e.target.closest(".lista-objetos button[data-accion]");
        const fila = boton?.closest(".fila-objeto");
        if (!fila || boton.disabled) return;
        reproducir("click");
        const lista = boton.closest(".lista-objetos").dataset.lista;
        if (lista === "artes") accionArtePerfil(Number(fila.dataset.index), boton.dataset.accion);
        else accionObjetoPerfil(lista, Number(fila.dataset.index), boton.dataset.accion);
    });
    el("btnAceptarPerfilMaster").addEventListener("click", aceptarPerfil);
    // El borrador se conserva al ocultar la ventana (al abrir la de crear objeto vuelve a ella); se cambia al abrirla
}

/* Inicio _________________________________________________________________________ */

/** Solo en modo máster. Después, interfaz.js llama a restaurarMaster para poner el último personaje. */
export function inicializarMaster(contexto) {
    ctx = contexto;
    master.setClaveSesion(master.SESION_LOCAL);
    inicializarHud();
    inicializarPersonajesMaster();
    inicializarPerfilMaster();
}
