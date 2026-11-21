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
    ocultarPersonajeSala, claveOcultoSala, leerCompendioNube, guardarCompendioNube, haySesionOnline, alCambiarSesionOnline,
    salirPorMuerte, getTodosPersonajesSala
} from "./interfazOnline.js";
import { emitirPrivado, registrarManejador } from "./eventos.js";
import { PROFESIONES, VALORES_COMBATE, estadisticasProtagonista, estadisticasSinUnderworld } from "./resumenFicha.js";
import { ETIQUETAS_CARACTERISTICA, ETIQUETAS_HABILIDAD, ranurasUsadas, ranurasLibres, motivoInactiva, puedeTenerOniricas } from "./artes.js";
import { iconoSao } from "./iconos.js";
import { escaparHtml } from "./html.js";
import { reproducir } from "./sonidos.js";
import { crearFichas, prepararFormularioSao } from "./formularioSao.js";
import { iniciarTurno } from "./turno.js";
import {
    capacidadInventario, ajustarInventario, cabenEnInventario, transferirABaul, transferirAInventario,
    categoriaEquipo, cargarObjeto, cargarEquipo, accesorioVacio, MAX_ACCESORIOS_NPC, cargarObjetosClave
} from "./objetos.js";
import Equipamiento, { ARMAS, TIPOS_DOS_MANOS, TIPOS_ARMADURA, TIPO_ACCESORIO, TIPO_RELIQUIA } from "./equipamiento.js";
import {
    VALORES_NPC, MAX_TIRADAS_NPC, crearNpc, cargarPiso, PARTES_MANO, MAX_PARTES_NPC, parteNpc, tieneParte,
    anadirParte, anadirBrazo, quitarParte, motivoNoQuitarParte, parteQueOcupa, esPesadilla, limpiarPesadilla
} from "./npc.js";
import * as compendio from "./compendio.js";
import {
    esJefe, faseActual, numeroFases, aplicarFase, copiarFase, borrarFase, convertirEnJefe, reiniciarJefe, pasarFaseSiToca,
    OPCIONES_FASE, MAX_FASES_JEFE
} from "./jefes.js";
import { ELEMENTOS_SACRO, CLAVES_ELEMENTOS_SACRO, cargarAmbiente } from "./elementosSacro.js";

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
 * @property {(id: string) => void} alMorirNpc  un NPC suyo que no está en la ficha ha llegado a 0 PV
 * @property {(pj: PJ, pasadas: number[]) => void} alCambiarFase  un jefe suyo fuera de la ficha ha pasado de fase
 * @property {(id: string) => void} alMorir  un personaje suyo (no NPC) fuera de la ficha empieza turno a 0 PV o menos
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

/* Sus personajes de la sesión que van a la sala: [{ id, nombre, npc, trueque, jefe, cabecera, pesadilla }], sin los de nombre ocupado por otro
   jugador. Los NPC pueden repetir nombre: no se comprueban (y en el registro van marcados para no ocupar el suyo). */
function listaSala(registro) {
    const pj = ctx.personaje();
    const indice = Object.fromEntries(master.todos().map(p => [p.id, p]));
    return master.idsEnSesion()
        .map(id => id === pj.idPersonaje
            ? { id, nombre: String(pj.nombre ?? "").trim(), npc: Boolean(pj.esNpc), trueque: Boolean(pj.esNpc && pj.permitirTrueque),
                ...(({ jefe, cabecera }) => ({ jefe, cabecera }))(master.resumenDe(pj)), pesadilla: esPesadilla(pj) }
            : { id, nombre: indice[id]?.resumen?.nombre ?? "", npc: Boolean(indice[id]?.resumen?.npc), trueque: Boolean(indice[id]?.resumen?.trueque),
                jefe: indice[id]?.resumen?.jefe ?? null, cabecera: indice[id]?.resumen?.cabecera ?? null,
                pesadilla: Boolean(indice[id]?.resumen?.pesadilla) })
        // Jefe y NPC: con la hora de su turno (t), para que parpadeen en la cabecera de los jugadores
        .map(p => (p.jefe ? { ...p, jefe: { ...p.jefe, t: ctx.turnoDe(p.id) || 0 } } : p))
        .map(p => (p.cabecera ? { ...p, cabecera: { ...p.cabecera, t: ctx.turnoDe(p.id) || 0 } } : p))
        .filter(p => {
            if (p.npc) return true;
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
                notoriedad: estado?.notoriedad ?? 0, alerta: estado?.alerta ?? 0,
                // Mascota de un jugador (con la franja de su dueño) o cristales de mascota de un personaje
                mascota: Boolean(registro?.mascota), pendientes: estado?.pendientes ?? 0, mascotas: estado?.mascotas ?? [],
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
    if (panelProtagonistasVisible()) pintarProtagonistas(); // han cambiado los estados de la sala o la ficha
    const hud = el("hudMaster");
    const filas = filasCabecera();
    const idActivo = ctx.personaje().idPersonaje;
    const lectura = ctx.lectura();
    hud.hidden = false;
    hud.querySelector(".hud-grupo-numero").textContent = String(filas.length);
    const lista = el("hudMasterLista");
    const sala = getSalaMaster();
    const firma = filas.map(f => `${f.clave}:${(f.mascotas ?? []).length > 0}`).join(",") + "|" + idActivo + "|" + Boolean(sala);
    if (firma !== firmaHud) {
        firmaHud = firma;
        // El + va a la derecha del último; los demás dejan su hueco para que las barras queden alineadas
        lista.innerHTML = filas.map((f, i) => `
            <div class="hud-master-item" data-id="${escaparHtml(f.id)}" data-jugador="${escaparHtml(f.jugador ?? "")}">
                ${htmlFilaHud()}
                ${(f.mascotas ?? []).length ? `<button type="button" class="btn-hud-echar" data-accion="mascotas">${iconoSao("cristalMascota")}</button>` : ""}
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
        item.classList.toggle("activo", esActivo); // la flecha a la izquierda, fuera de la fila (hud.css)
        fila.classList.toggle("desconectado", !f.conectado);
        fila.setAttribute("aria-current", esActivo ? "true" : "false");
        fila.title = esActivo ? `${nombre} (en la ficha${f.jugador ? ", solo lectura: pulsa para actualizarla" : ""})`
            : f.jugador ? `Ver la ficha de ${nombre} (solo lectura${f.conectado ? "" : "; desconectado: la última copia guardada"})`
            : `Ver ${nombre} en la ficha`;
        // Mascota: los niveles que ha subido y no se han revisado, junto al nombre
        rellenarFilaHud(fila, f.mascota && f.pendientes ? { ...f, nombre: `${nombre} +${f.pendientes}` } : f);
        if (f.mascota) fila.title = `Mascota ${nombre}${f.pendientes ? ` (+${f.pendientes} niveles por revisar)` : ""}: editar`;
        const botonMascotas = item.querySelector('.btn-hud-echar[data-accion="mascotas"]');
        if (botonMascotas) {
            const pendientes = f.mascotas.reduce((suma, m) => suma + m.pendientes, 0);
            botonMascotas.title = `Mascotas (${f.mascotas.length})${pendientes ? `: +${pendientes} niveles por revisar` : ""}`;
            botonMascotas.setAttribute("aria-label", botonMascotas.title);
            botonMascotas.classList.toggle("activo", pendientes > 0);
        }
        // Ocultar: ojo abierto si se ve, tachado si está oculto (no recibe objetos, amistad ni grupo, ni turno a la vez)
        fila.classList.toggle("oculta", Boolean(f.oculto));
        if (f.oculto) fila.title += " · oculto";
        const ocultar = item.querySelector(".btn-hud-ocultar");
        // Un jefe entra oculto: al mostrarlo, los jugadores lo ven en su cabecera con el aviso WARNING
        const firmaOcultar = `${Boolean(f.oculto)}|${Boolean(f.jefe)}`;
        if (ocultar && ocultar.dataset.oculto !== firmaOcultar) {
            ocultar.dataset.oculto = firmaOcultar;
            ocultar.innerHTML = iconoSao(f.oculto ? "cegado" : "percepcion");
            ocultar.classList.toggle("activo", Boolean(f.oculto));
            ocultar.title = f.jefe
                ? (f.oculto ? "Mostrar el jefe (los jugadores lo ven en su cabecera con un aviso)" : "Ocultar el jefe a los jugadores")
                : f.oculto ? "Mostrar (vuelve a contar para objetos, amistad, grupo y turnos)"
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
        // A 0 PV o menos un personaje (no un NPC) no empieza el turno: muere
        if (!otro.esNpc && otro.vida <= 0) {
            ctx.alMorir?.(id);
            continue;
        }
        const resumen = iniciarTurno(otro);
        master.guardar(id, { json: otro.toJSONString(), resumen: master.resumenDe(otro) });
        ctx.fijarTurno(id, hora);
        ctx.publicarEstadoDe(id, { ...master.resumenDe(otro), turno: hora, pv: otro.vida, pvMax: otro.vidaMax });
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
    const vidaAntes = pj.vida;
    const resultado = fn(pj);
    // Un jefe pasa de fase con lo que sobra (jefes.js); solo muere en la última
    const pasadas = pasarFaseSiToca(pj);
    if (pasadas.length) ctx.alCambiarFase?.(pj, pasadas);
    // Un NPC que muere fuera de la ficha (p. ej. veneno al empezar turno a la vez): se pregunta al máster
    if (pj.esNpc && vidaAntes > 0 && pj.vida <= 0) setTimeout(() => ctx.alMorirNpc?.(id), 0);
    pj.calcularCaracteristicas();
    master.guardar(id, { json: pj.toJSONString(), resumen: master.resumenDe(pj) });
    ctx.publicarEstadoDe(id, { ...master.resumenDe(pj), turno: ctx.turnoDe(id), pv: pj.vida, pvMax: pj.vidaMax });
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

/**
 * NPC derrotado: su copia sale de la sesión (y de la sala) y se borra; la plantilla sigue en el compendio.
 * Si está en la ficha, antes se pasa a otro personaje de la sesión. Devuelve el motivo si no se puede, o null.
 */
export function retirarNpcMuerto(id) {
    const motivo = master.motivoNoQuitar(id);
    if (motivo) return motivo;
    if (id === master.getActivo() || id === ctx.personaje().idPersonaje) {
        const siguiente = filasCabecera().find(f => !f.jugador && f.id !== id);
        if (!siguiente) return "Es el único personaje de la sesión";
        cambiarA(siguiente.id);
    }
    master.quitarDeSesion(id);
    master.borrar(id);
    actualizarHudMaster();
    return null;
}

/**
 * Uno de sus personajes ha muerto: sale de su grupo y de la sesión (y por tanto de la sala), pero sigue guardado.
 * Si está en la ficha, antes se pasa a otro. Devuelve el motivo si no puede salir de la sesión, o null.
 */
export async function retirarPersonajeMuerto(id) {
    await salirPorMuerte(`m-${id}`, { salirDeSala: false });
    const motivo = master.motivoNoQuitar(id);
    if (motivo) return motivo;
    if (id === master.getActivo() || id === ctx.personaje().idPersonaje) {
        const siguiente = filasCabecera().find(f => !f.jugador && f.id !== id);
        if (!siguiente) return "Es el único personaje de la sesión";
        cambiarA(siguiente.id);
    }
    master.quitarDeSesion(id);
    actualizarHudMaster();
    return null;
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
        // Si no ha respondido, ya cuenta como desconectado (gris en la cabecera)
        if (resultado.sinRespuesta) actualizarHudMaster();
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
            else if (boton.dataset.accion === "mascotas") abrirMascotasMaster(item.dataset.jugador, item.dataset.id);
            else echar(item.dataset.id, item.dataset.jugador || null);
            return;
        }
        if (e.target.closest(".hud-grupo-fila")) {
            hud.classList.remove("abierto");
            if (item.dataset.jugador) {
                // Una mascota se edita en el perfil (se le pide a su dueño); un personaje, su ficha en modo lectura
                const filaHud = filasCabecera().find(f => f.jugador === item.dataset.jugador && f.id === item.dataset.id);
                if (filaHud?.mascota) pedirMascota(item.dataset.jugador, item.dataset.id);
                else verFichaJugador(item.dataset.jugador, item.dataset.id);
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
                <div class="objeto-detalle">${r.pesadilla ? "" : `LV ${escaparHtml(r.nivel ?? "?")} · `}Iniciativa ${escaparHtml(Math.round((r.iniciativa ?? 0) * 10) / 10)}</div>
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
    el("btnAbrirCompendio").addEventListener("click", () => {
        reproducir("click");
        const ventana = el("modalPersonajesMaster");
        ventana.addEventListener("hidden.bs.modal", () => abrirCompendio(), { once: true });
        ventana.dataset.sinSonidoCerrar = "1";
        bootstrap.Modal.getOrCreateInstance(ventana).hide();
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
let plantillaEditada = null; // id de la plantilla del compendio que se edita (modo plantilla), o null
let volverAlCompendio = false; // al cerrar el perfil se vuelve a abrir el compendio
let tipoFijo = false; // al crear desde el compendio es un NPC: no se puede cambiar a personaje
let faseEnJuego = 0; // jefe: fase en la que está en la ficha (las pestañas solo cambian la que se edita)
/* Mascota (mascotas.js): { id (null al crear), dueno: { instancia, jugador, nombre } | null, original (instancia del
   dueño al abrir), cristal: { nombre, descripcion, agrietado } }. No se guarda en el máster: se envía al dueño */
let mascotaEditada = null;

/**
 * Abre el perfil: { crear: true } para un personaje nuevo (npc: true lo empieza como NPC; jefe: true, como jefe;
 * jefeDe: id de una plantilla de NPC, jefe nuevo con ese NPC como fase 1);
 * pesadilla: true, como pesadilla; { plantilla: id } para editar una plantilla del compendio; si no, el de la ficha.
 */
export function abrirPerfilMaster({ crear = false, npc = false, jefe = false, pesadilla = false, jefeDe = null, plantilla = null, mascota = false, mascotaDe = null } = {}) {
    creando = crear;
    plantillaEditada = !crear && plantilla && compendio.existe(plantilla) ? plantilla : null;
    mascotaEditada = null;
    borrador = new PJ();
    if (mascotaDe) {
        // Mascota de un jugador (la ha enviado su dueño): se edita y se le devuelve al aceptar
        creando = false;
        borrador.cargarJSON(JSON.parse(mascotaDe.json));
        borrador.esMascota = true;
        mascotaEditada = { id: borrador.idPersonaje, dueno: mascotaDe.dueno, original: mascotaDe.dueno?.instancia ?? null, cristal: { ...mascotaDe.cristal } };
    } else if (plantillaEditada) borrador.cargarJSON(JSON.parse(compendio.jsonDe(plantillaEditada)));
    else if (!crear) borrador.cargarJSON(JSON.parse(ctx.personaje().toJSONString()));
    else if (jefeDe && compendio.existe(jefeDe)) {
        // Jefe a partir de un NPC del compendio: personaje nuevo (otro id, sin plantilla) con el NPC como fase 1
        const id = borrador.idPersonaje;
        borrador.cargarJSON(JSON.parse(compendio.jsonDe(jefeDe)));
        borrador.idPersonaje = id;
        borrador.idPlantilla = null;
        convertirEnJefe(borrador);
    } else borrador.nombre = "";
    tipoFijo = false;
    if (crear && (jefe || npc || pesadilla || mascota) && !borrador.esJefe) cambiarTipoBorrador(jefe ? "jefe" : pesadilla ? "pesadilla" : mascota ? "mascota" : "npc");
    tipoFijo = crear && (npc || jefe || pesadilla || mascota || Boolean(jefeDe));
    faseEnJuego = faseActual(borrador);
    // Personaje o NPC solo se elige al crear (y no desde el compendio, que siempre crea NPC)
    el("perfilMasterTipo").hidden = !crear || tipoFijo;
    ponerTituloPerfil();
    el("avisoPerfilMaster").textContent = "";
    pintarPerfil();
    // Panel de protagonistas: se abre solo al crear; al editar, como se dejó la última vez
    abrirPanelProtagonistas(crear || leerPanelGuardado());
    const ventana = el("modalPerfilMaster");
    ventana.dataset.sinSonidoAbrir = "1";
    bootstrap.Modal.getOrCreateInstance(ventana).show();
}

function ponerTituloPerfil() {
    el("modalPerfilMasterLabel").textContent = creando
        ? (borrador.esJefe ? "Nuevo jefe" : esPesadilla(borrador) ? "Nueva pesadilla" : borrador.esMascota ? "Nueva mascota"
            : borrador.esNpc ? "Nuevo NPC" : "Nuevo personaje")
        : mascotaEditada ? `Mascota: ${borrador.nombre || "Sin nombre"}`
        : plantillaEditada ? `Plantilla: ${borrador.nombre || "Sin nombre"}`
        : `Perfil de ${ctx.personaje().nombre || "Sin nombre"}`;
}

/* Tipo del borrador: personaje, npc, jefe o pesadilla */
const tipoDe = (pj) => (pj.esJefe ? "jefe" : esPesadilla(pj) ? "pesadilla" : pj.esMascota ? "mascota" : pj.esNpc ? "npc" : "personaje");

/* Al crear: personaje, NPC, jefe o pesadilla. El NPC empieza con sus valores por defecto y la vida y los PA llenos;
   entre NPC, jefe y pesadilla se conserva lo que haya (el NPC pasa a ser la fase 1, o el jefe se queda con la fase
   que se ve; la pesadilla pierde la recompensa y los PA, limpiarPesadilla) */
function cambiarTipoBorrador(tipo) {
    if (!creando || tipoFijo || tipoDe(borrador) === tipo) return;
    borrador.esPesadilla = false;
    // Mascota: un NPC normal de un jugador (se elige el dueño y el cristal en su bloque)
    borrador.esMascota = tipo === "mascota";
    borrador.nivelesPendientes = 0;
    mascotaEditada = tipo === "mascota"
        ? (mascotaEditada ?? { id: null, dueno: null, original: null, cristal: { nombre: "", descripcion: "", agrietado: false } })
        : null;
    if (borrador.esNpc && tipo !== "personaje") {
        if (tipo === "jefe") convertirEnJefe(borrador);
        else if (tipo === "pesadilla") {
            borrador.esPesadilla = true;
            limpiarPesadilla(borrador);
            borrador.calcularCaracteristicas();
        }
        else {
            borrador.esJefe = false;
            borrador.npc.fases = [];
            borrador.npc.faseActual = 0;
        }
        faseEnJuego = 0;
        ponerTituloPerfil();
        return;
    }
    const npc = tipo !== "personaje";
    borrador.esNpc = npc;
    borrador.esJefe = false;
    borrador.npc = crearNpc();
    if (npc) {
        borrador.setUnderworld(false);
        borrador.protagonista = false;
        borrador.modificadores = []; // el de ejemplo de un personaje nuevo es de Atletismo, que un NPC no tiene
    }
    if (tipo === "pesadilla") {
        borrador.esPesadilla = true;
        limpiarPesadilla(borrador);
    }
    borrador.calcularCaracteristicas();
    borrador.vida = borrador.vidaMax;
    borrador.puntosArte = borrador.puntosArteMax;
    ajustarInventario(borrador);
    if (tipo === "jefe") convertirEnJefe(borrador);
    faseEnJuego = 0;
    ponerTituloPerfil();
}

/* Jefe: PV máximos de la fase en juego (la vida del perfil es la de esa fase, aunque se edite otra pestaña) */
function vidaMaxEnJuego() {
    const pj = borrador;
    if (!esJefe(pj) || faseActual(pj) === faseEnJuego) return pj.vidaMax;
    return Math.max(1, Number(pj.npc.fases[faseEnJuego]?.valores?.vidaMax) || 1);
}

/* Jefe: pestañas de las fases (+ copia la que se ve; la papelera quita la que se ve) y sus opciones */
function pintarFasesPerfil() {
    const pj = borrador;
    const cont = el("perfilMasterFases");
    if (!esJefe(pj)) {
        cont.innerHTML = "";
        cont.dataset.html = "";
        return;
    }
    const actual = faseActual(pj);
    const total = numeroFases(pj);
    const enJuego = (i) => i === faseEnJuego && !creando && !plantillaEditada;
    const pestanas = pj.npc.fases.map((fase, i) => `
        <button type="button" class="btn-eleccion" data-fase="${i}" role="tab" aria-selected="${i === actual}" aria-pressed="${i === actual}"
            title="${escaparHtml(fase.valores.vidaMax)} PV${enJuego(i) ? " (fase en juego)" : ""}">Fase ${i + 1}${enJuego(i) ? " *" : ""}</button>`).join("");
    const html = `
        <div class="pestanas-fases-fila" role="tablist" aria-label="Fases">
            ${pestanas}
            <button type="button" class="btn-anadir-ranura" data-crear="fase" title="Añadir fase (copia de la fase ${actual + 1})"
                aria-label="Añadir fase"${total >= MAX_FASES_JEFE ? " disabled" : ""}>+</button>
            ${botonObjeto("borrarFase", "descartar", `Quitar la fase ${actual + 1}`, total <= 1 ? "Un jefe necesita al menos una fase" : "")}
        </div>
        <p class="nota-fases">El nombre, el nivel, los PA, la EXP y la recompensa son comunes. Lo demás es de la fase ${actual + 1}.${creando || plantillaEditada ? "" : " * = fase en juego."}</p>
        <div class="opciones-fase">
            ${OPCIONES_FASE.map(({ clave, etiqueta }) => `
                <label class="casilla-tipo"${actual === 0 ? ` title="La fase 1 no empieza en combate"` : ""}>
                    <input type="checkbox" data-opcion-fase="${clave}"${pj.npc.fases[actual][clave] ? " checked" : ""}${actual === 0 ? " disabled" : ""}>
                    <span>${escaparHtml(etiqueta)}</span>
                </label>`).join("")}
        </div>`;
    if (cont.dataset.html !== html) {
        cont.innerHTML = html;
        cont.dataset.html = html;
    }
}

/* Panel de protagonistas (#panelProtagonistas, a la derecha del perfil del máster) ______________________
   Estadísticas de combate de los protagonistas para crear criaturas: los jugadores de la sala (lo último que
   publicaron en su estado, también desconectados) y los personajes protagonistas guardados por el máster.
   Una columna por protagonista y una fila por valor; el más alto de cada fila, marcado; la media (salvo la
   iniciativa) y, al final, la ficha que se está creando o editando (el borrador), para comparar. */
const CLAVE_PANEL_PROTAGONISTAS = "fichaSAO.panelProtagonistas";
const FILAS_PROTAGONISTAS = [
    { clave: "vidaMax", etiqueta: "PV" },
    { clave: "nivel", etiqueta: "LV" },
    { clave: "defensa", etiqueta: "Defensa" },
    { clave: "defensaEscudo", etiqueta: "Defensa con escudo" },
    { clave: "armadura", etiqueta: "Armadura" },
    { clave: "acierto", etiqueta: "Acierto" },
    { clave: "tiradaMedia", etiqueta: "Tirada media" },
    { clave: "iniciativa", etiqueta: "Iniciativa", sinMedia: true },
    { clave: "danno", etiqueta: "Daño (arma + CaC)" },
    { clave: "tiradaSigilo", etiqueta: "Tirada media de sigilo" },
    { clave: "tiradaCarisma", etiqueta: "Tirada media de carisma" },
    { clave: "vMovimiento", etiqueta: "Movimiento" },
    { clave: "dFisico", etiqueta: "Daño CaC" },
    { clave: "dDistancia", etiqueta: "Daño a distancia" },
    { clave: "dMagico", etiqueta: "Daño mágico" },
    { clave: "aguante", etiqueta: "Aguante" },
    { clave: "perspicacia", etiqueta: "Perspicacia" },
    { clave: "percepcionPasiva", etiqueta: "Percepción pasiva" }
];

/* Ver las columnas de los protagonistas con las habilidades del Underworld habilitadas sin ellas (para balancear) */
const CLAVE_SIN_UW_PROTAGONISTAS = "fichaSAO.protagonistasSinUw";
let verSinUw = (() => { try { return localStorage.getItem(CLAVE_SIN_UW_PROTAGONISTAS) === "1"; } catch { return false; } })();

function leerPanelGuardado() {
    try { return localStorage.getItem(CLAVE_PANEL_PROTAGONISTAS) === "1"; } catch { return false; }
}

const panelProtagonistasVisible = () =>
    Boolean(el("modalPerfilMaster")?.classList.contains("show")) && !el("panelProtagonistas").hidden;

function abrirPanelProtagonistas(abrir, recordar = false) {
    el("panelProtagonistas").hidden = !abrir;
    el("modalPerfilMaster").classList.toggle("con-protagonistas", abrir);
    const boton = el("btnProtagonistasPerfil");
    boton.setAttribute("aria-expanded", String(abrir));
    boton.textContent = abrir ? "Ocultar protagonistas" : "Protagonistas";
    if (recordar) {
        try { localStorage.setItem(CLAVE_PANEL_PROTAGONISTAS, abrir ? "1" : "0"); } catch { /* sin almacenamiento */ }
    }
    if (abrir) pintarProtagonistas();
}

/* Protagonistas: [{ nombre, origen, conectado, stats, uw, statsSinUw }] */
function protagonistas() {
    const lista = [];
    const sala = getSalaMaster();
    if (sala) {
        for (const [jugador, personajes] of Object.entries(sala.registro)) {
            if (jugador === sala.uid) continue;
            for (const [id, registro] of Object.entries(personajes ?? {})) {
                const estado = sala.estados[id];
                if (!estado?.stats) continue;
                lista.push({ id, nombre: estado.nombre || registro?.nombre || "Sin nombre", origen: "Sala",
                    conectado: sala.conectados.has(`${jugador}|${id}`), stats: estado.stats,
                    uw: estado.uw === true, statsSinUw: estado.statsSinUw ?? null });
            }
        }
    }
    // Los del máster: el de la ficha con sus valores de ahora; el resto, de su copia guardada
    const enFicha = ctx.personaje();
    for (const { id } of master.todos()) {
        let pj = id === enFicha.idPersonaje ? enFicha : null;
        if (!pj) {
            const json = master.datosPersonaje(id)?.json;
            if (!json) continue;
            try {
                pj = new PJ();
                pj.cargarJSON(JSON.parse(json));
            } catch {
                continue;
            }
        }
        if (!pj.protagonista || pj.esNpc) continue;
        lista.push({ id, nombre: pj.nombre || "Sin nombre", origen: "Máster", conectado: true, stats: estadisticasProtagonista(pj),
            uw: pj.tieneUnderworldActivo(), statsSinUw: estadisticasSinUnderworld(pj) });
    }
    return lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

const cifra = (n) => n === null || n === undefined ? "—" : formatearNumero(Math.round(n * 10) / 10);

/* Lista de protagonistas calculada la última vez (al editar el borrador solo cambia su columna) */
let cacheProtagonistas = [];

/* refrescar: volver a leer la sala y los personajes guardados (al abrir el panel o cambiar la sala) */
function pintarProtagonistas(refrescar = true) {
    const panel = el("panelProtagonistas");
    if (refrescar) cacheProtagonistas = protagonistas();
    // La que se edita: con los valores del borrador (si es la de la ficha, no se repite como protagonista)
    const lista = cacheProtagonistas.filter(p => !borrador || p.id !== borrador.idPersonaje);
    // Con el Underworld habilitado (algún protagonista o el borrador): botón para verlas con y sin sus habilidades
    const borradorUw = Boolean(borrador?.tieneUnderworldActivo?.());
    const hayUw = borradorUw || lista.some(p => p.uw);
    const sinUw = hayUw && verSinUw;
    const actual = !borrador ? null : sinUw && borradorUw ? estadisticasSinUnderworld(borrador) : estadisticasProtagonista(borrador);
    // Valores que se muestran de cada protagonista (un cliente antiguo con uw puede no publicar statsSinUw)
    const mostrados = (p) => sinUw && p.uw && p.statsSinUw ? p.statsSinUw : p.stats;
    if (!lista.length) {
        panel.innerHTML = `<h3 class="panel-protagonistas-titulo">Protagonistas</h3>
            <p class="lista-vacia">No hay protagonistas. Salen los personajes marcados como protagonista de los jugadores de tu sala y los tuyos.</p>`;
        return;
    }
    const nombreActual = borrador?.nombre || (borrador?.esNpc ? "Este NPC" : "Este personaje");
    const notaUw = (p) => !p.uw ? "" : !sinUw ? ", con las habilidades del Underworld"
        : p.statsSinUw ? ", sin las habilidades del Underworld" : ", con las habilidades del Underworld: su ficha no publica los valores sin ellas";
    const cabecera = lista.map(p => `<th scope="col" class="${p.conectado ? "" : "desconectado"}${p.uw ? " con-uw" : ""}"
        title="${escaparHtml(`${p.nombre} (${p.origen}${p.conectado ? "" : ", desconectado: últimos valores publicados"}${notaUw(p)})`)}">${escaparHtml(p.nombre)}${p.uw ? `<small class="marca-uw">${sinUw && p.statsSinUw ? "sin UW" : "UW"}</small>` : ""}</th>`).join("");
    const filas = FILAS_PROTAGONISTAS.map(({ clave, etiqueta, sinMedia }) => {
        const valores = lista.map(p => mostrados(p)[clave]);
        const numeros = valores.filter(v => typeof v === "number");
        if (!numeros.length && typeof actual?.[clave] !== "number") return "";
        const maximo = numeros.length ? Math.max(...numeros) : null;
        const media = sinMedia ? null : numeros.reduce((a, b) => a + b, 0) / numeros.length;
        const celdas = valores.map(v => `<td class="${typeof v === "number" && v === maximo && lista.length > 1 ? "maximo" : ""}">${cifra(v)}</td>`).join("");
        return `<tr><th scope="row">${etiqueta}</th>${celdas}<td class="media">${cifra(media)}</td><td class="actual">${cifra(actual?.[clave])}</td></tr>`;
    }).join("");
    const botonUw = !hayUw ? "" : `<div class="form-sao fichas-uw-protagonistas"><div class="fichas-sao" role="radiogroup" aria-label="Habilidades del Underworld">
            <button type="button" class="ficha-sao" role="radio" data-sin-uw="0" aria-checked="${!sinUw}">Con Underworld</button>
            <button type="button" class="ficha-sao" role="radio" data-sin-uw="1" aria-checked="${sinUw}">Sin Underworld</button>
        </div></div>`;
    panel.innerHTML = `<h3 class="panel-protagonistas-titulo">Protagonistas <small>${lista.length}</small></h3>
        ${botonUw}
        <div class="tabla-protagonistas-marco">
            <table class="tabla-protagonistas">
                <thead><tr><th scope="col"></th>${cabecera}<th scope="col" class="media">Media</th><th scope="col" class="actual${borradorUw ? " con-uw" : ""}" title="${escaparHtml(nombreActual)} (la ficha que estás editando)">${escaparHtml(nombreActual)}${borradorUw ? `<small class="marca-uw">${sinUw ? "sin UW" : "UW"}</small>` : ""}</th></tr></thead>
                <tbody>${filas}</tbody>
            </table>
        </div>
        <p class="panel-protagonistas-nota">El valor más alto de cada fila entre los protagonistas, en dorado; la última columna es la ficha que estás editando. Los de la sala son lo último que publicaron sus jugadores.${hayUw ? " UW: con las habilidades del Underworld habilitadas; \"Sin Underworld\" muestra sus valores sin ellas." : ""}</p>`;
}

/* Fichas de la profesión en el perfil (crearFichas en inicializarPerfilMaster): se sincronizan en pintarPerfil */
let sincronizarProfesion = null;

const campoNumero = (clave, etiqueta, min, max) =>
    `<label>${escaparHtml(etiqueta)} <input type="number" data-clave="${clave}" min="${min}" max="${max}"></label>`;

function pintarPerfil() {
    const pj = borrador;
    pj.calcularCaracteristicas();
    el("formPerfilMaster").classList.toggle("modo-npc", pj.esNpc);
    el("formPerfilMaster").classList.toggle("modo-jefe", esJefe(pj));
    el("formPerfilMaster").classList.toggle("modo-pesadilla", esPesadilla(pj));
    el("formPerfilMaster").classList.toggle("modo-mascota", Boolean(mascotaEditada));
    pintarMascotaPerfil();
    el("perfilMasterTipo").querySelectorAll("[data-tipo]").forEach(boton => {
        boton.setAttribute("aria-pressed", String(boton.dataset.tipo === tipoDe(pj)));
    });
    pintarFasesPerfil();
    el("perfilMasterNombre").value = pj.nombre;
    el("perfilMasterNombreReal").value = pj.nombreReal;
    // Pasar los cambios de una copia en juego a su plantilla (no al crear ni al editar una plantilla)
    el("perfilMasterCompendio").hidden = creando || Boolean(plantillaEditada) || Boolean(mascotaEditada);
    const tienePlantilla = compendio.existe(pj.idPlantilla);
    el("perfilMasterPlantilla").textContent = tienePlantilla ? "(es una copia de una plantilla)" : "(sin plantilla en el compendio)";
    const sobrescribir = el("perfilMasterCompendio").querySelector('[data-compendio="sobrescribir"]');
    sobrescribir.disabled = !tienePlantilla;
    sobrescribir.title = tienePlantilla ? "" : "Su plantilla ya no está en el compendio";
    el("perfilMasterNivel").value = pj.nivel;
    el("perfilMasterProfesion").value = pj.tipoProfesion;
    sincronizarProfesion?.(); // las fichas que visten el select (formularioSao.js)
    el("perfilMasterUnderworld").checked = pj.esUnderworld;
    el("perfilMasterTrueque").checked = Boolean(pj.permitirTrueque);
    el("perfilMasterProtagonista").checked = pj.protagonista;
    // Habilidades del Underworld: se conserva si la ranura estaba abierta
    const habUw = el("perfilMasterHabUnderworld");
    const uwAbierto = Boolean(habUw.querySelector("details")?.open);
    habUw.innerHTML = pj.esUnderworld && !pj.esNpc ? ctx.htmlHabilidadesUnderworld(pj, uwAbierto) : "";
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
        input.value = pj.getBaseHabilidad(hab); // con el Underworld se ve la suma
        input.min = Math.min(pj.getExtraUnderworld(hab), maxHab);
        input.max = maxHab;
        input.closest("label").hidden = !pj.puedeUsarHabilidad(hab);
    });
    el("perfilMasterPuntosHab").textContent =
        `(Puntos: ${pj.getPuntosHabilidadDisponibles()} / ${pj.getPuntosHabilidadTotales()}; máximo ${maxHab} cada una)`;
    el("perfilMasterVida").value = pj.vida;
    el("perfilMasterVida").max = vidaMaxEnJuego();
    el("perfilMasterVidaMax").textContent = vidaMaxEnJuego();
    el("perfilMasterVidaFase").textContent = esJefe(pj) && !creando && !plantillaEditada ? ` (fase ${faseEnJuego + 1})` : "";
    el("perfilMasterPA").value = pj.puntosArte;
    el("perfilMasterPA").max = pj.puntosArteMax;
    el("perfilMasterPAMax").textContent = pj.puntosArteMax;
    el("perfilMasterCor").value = pj.cor;
    el("perfilMasterEgo").value = pj.puntosEgo;
    el("perfilMasterNotoriedad").value = pj.notoriedad;
    el("perfilMasterAlerta").value = pj.alertaSistema;
    el("perfilMasterNeutral").checked = Boolean(pj.neutral);
    el("ranuraPerfilMasterEgo").hidden = !pj.protagonista; // solo los protagonistas tienen ego (el valor se conserva)
    if (pj.esNpc) pintarNpcPerfil();
    pintarCombatePerfil();
    pintarObjetosPerfil();
    pintarArtesPerfil();
    if (!el("panelProtagonistas").hidden) pintarProtagonistas(false); // la columna de esta ficha
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
    // Los NPC llevan todas sus artes equipadas (PJ.calcularNpc): sin equipar ni desequipar
    const equipar = arte.onirica || borrador.esNpc ? ""
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
        .filter(({ arte }) => !arte.onirica || puedeTenerOniricas(pj))
        .sort((a, b) => orden(a.arte) - orden(b.arte));
    el("perfilMasterArtes").innerHTML = visibles.length
        ? visibles.map(({ arte, i }) => filaArtePerfil(arte, i)).join("")
        : `<p class="lista-vacia">Sin artes.</p>`;
    // Los NPC no tienen memoria de artes
    el("perfilMasterMemoria").textContent = pj.esNpc ? "" : `(memoria ${ranurasUsadas(pj)} / ${pj.espaciosArte})`;
    el("perfilMasterCrearOnirica").hidden = !puedeTenerOniricas(pj);
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
    const esClave = lista === "objetosClave" || lista === "recompensaClave";
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
    if (lista === "recompensa" || lista === "recompensaClave") return accionRecompensa(lista, indice, accion);
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

/* NPC: valores de combate a mano, tiradas libres y recompensa ____________________ */

/* NPC: elementos de Sacro que lleva encima (npc.energia, 13-sacro.md §12); una ranura por elemento con − / + */
function pintarEnergiaNpcPerfil() {
    const lista = el("perfilMasterEnergiaNpc");
    if (!lista || !borrador?.npc) return;
    const energia = borrador.npc.energia ?? [];
    if (!lista.children.length) {
        lista.innerHTML = CLAVES_ELEMENTOS_SACRO.map(clave => {
            const info = ELEMENTOS_SACRO[clave];
            return `<div class="ranura campo-ambiente-sacro">
                <span class="ranura-icono icono-activo" style="--color:${info.color};--color-glifo:${info.colorGlifo ?? "#FBFBFB"}">${iconoSao(info.icono)}</span>
                <label class="ranura-etiqueta" for="energiaNpc-${clave}">${escaparHtml(info.etiqueta)}</label>
                <input type="number" id="energiaNpc-${clave}" min="0" max="20" data-energia="${clave}">
            </div>`;
        }).join("");
        lista.addEventListener("input", (e) => {
            const input = e.target.closest("input[data-energia]");
            if (!input || !borrador?.npc) return;
            const resto = (borrador.npc.energia ?? []).filter(a => a.elemento !== input.dataset.energia);
            borrador.npc.energia = cargarAmbiente([...resto, { elemento: input.dataset.energia, dedos: input.value }]);
            el("perfilMasterResumenEnergia").textContent = resumenEnergia(borrador.npc.energia);
        });
    }
    lista.querySelectorAll("input[data-energia]").forEach(input => {
        if (document.activeElement !== input) input.value = energia.find(a => a.elemento === input.dataset.energia)?.dedos ?? 0;
    });
    el("perfilMasterResumenEnergia").textContent = resumenEnergia(energia);
}
const resumenEnergia = (energia) => energia.length ? energia.map(a => `${ELEMENTOS_SACRO[a.elemento].etiqueta} ×${a.dedos}`).join(", ") : "Ninguno";

function pintarNpcPerfil() {
    const npc = borrador.npc;
    pintarEnergiaNpcPerfil();
    el("formPerfilMaster").querySelectorAll("input[data-npc]").forEach(input => {
        const clave = input.dataset.npc;
        input.value = clave === "recompensaCor" ? npc.recompensa.cor : (npc[clave] ?? "");
    });
    // Jefe: los PV máximos son de la fase que se edita (los PA son comunes)
    const etiquetaVida = el("perfilMasterValoresNpc").querySelector('[data-npc="vidaMax"]')?.closest("label")?.firstChild;
    if (etiquetaVida) etiquetaVida.textContent = esJefe(borrador) ? `PV máximos de la fase ${faseActual(borrador) + 1} ` : "PV máximos ";
    const comportamiento = el("perfilMasterComportamiento");
    if (document.activeElement !== comportamiento) comportamiento.value = borrador.comportamientoCombate;
    // Las filas solo se rehacen si cambia el número de tiradas (así no se pierde el campo con el foco)
    const lista = el("perfilMasterTiradas");
    if (!npc.tiradas.length) lista.innerHTML = `<p class="lista-vacia">Sin tiradas. Se tiran con 3d10 + su valor.</p>`;
    else if (lista.querySelectorAll(".fila-tirada-npc").length !== npc.tiradas.length) {
        lista.innerHTML = npc.tiradas.map((_, i) => `
        <div class="fila-tirada-npc" data-index="${i}">
            <input type="text" data-tirada="nombre" maxlength="60" aria-label="Nombre de la tirada">
            <input type="number" data-tirada="valor" min="-99" max="99" aria-label="Valor">
            ${botonObjeto("quitarTirada", "descartar", "Quitar tirada")}
        </div>`).join("");
    }
    npc.tiradas.forEach((tirada, i) => {
        const fila = lista.children[i];
        const nombre = fila?.querySelector('[data-tirada="nombre"]');
        const valor = fila?.querySelector('[data-tirada="valor"]');
        if (nombre && document.activeElement !== nombre) nombre.value = tirada.nombre;
        if (valor && document.activeElement !== valor) valor.value = tirada.valor;
    });
    el("perfilMasterContadorTiradas").textContent = `(${npc.tiradas.length})`;
    const { objetos, objetosClave } = npc.recompensa;
    el("perfilMasterRecompensa").innerHTML = objetos.map((objeto, i) => filaObjetoPerfil("recompensa", objeto, i)).join("");
    el("perfilMasterRecompensaClave").innerHTML = objetosClave.map((objeto, i) => filaObjetoPerfil("recompensaClave", objeto, i)).join("");
    el("perfilMasterContadorRecompensa").textContent = objetos.length || objetosClave.length
        ? `(${objetos.length} objeto${objetos.length === 1 ? "" : "s"}, ${objetosClave.length} clave)` : "";
    pintarPartesPerfil();
    pintarEquipoPerfil();
}

/* NPC: acciones (partes del cuerpo) y equipamiento ______________________________
 * Ranuras: id de una parte (los brazos llevan el equipo en manoIzquierda / manoDerecha), "armadura" o
 * "accesorio-N". El equipo se crea y edita con la ventana de objetos sobre un "pj" falso con un único objeto
 * en el baúl; al terminar se comprueba que su tipo vaya en esa ranura y se pone en ella. */
const NOMBRES_BRAZO = { izquierda: "Brazo izquierdo", derecha: "Brazo derecho" };

function equipoRanuraPerfil(ranura) {
    const pj = borrador;
    if (ranura === "armadura") return pj.equipoArmadura;
    if (ranura.startsWith("accesorio-")) return pj.accesorios[Number(ranura.slice("accesorio-".length))] ?? null;
    if (PARTES_MANO[ranura]) return pj[PARTES_MANO[ranura]];
    return parteNpc(pj, ranura)?.equipo ?? null;
}

function tieneEquipoRanura(ranura) {
    const equipo = equipoRanuraPerfil(ranura);
    return ranura.startsWith("accesorio-") ? !accesorioVacio(equipo) : Boolean(equipo?.tipo);
}

/* Pone (o quita, con null) el equipo de una ranura del borrador */
function ponerEquipoPerfil(ranura, equipo) {
    const pj = borrador;
    if (ranura === "armadura") pj.equipoArmadura = equipo ?? new Equipamiento("", "", "");
    else if (ranura.startsWith("accesorio-")) {
        const indice = Number(ranura.slice("accesorio-".length));
        for (let i = pj.accesorios.length; i < indice; i++) pj.accesorios[i] = new Equipamiento("", "", TIPO_ACCESORIO);
        pj.accesorios[indice] = equipo ?? new Equipamiento("", "", TIPO_ACCESORIO);
    } else if (PARTES_MANO[ranura]) pj[PARTES_MANO[ranura]] = equipo ?? new Equipamiento("", "", "");
    else {
        const parte = parteNpc(pj, ranura);
        if (parte) parte.equipo = equipo;
    }
    pj.calcularCaracteristicas();
}

/* Por qué ese tipo de equipo no va en esa ranura, o null */
function motivoTipoRanura(ranura, tipo) {
    if (ranura === "armadura") return TIPOS_ARMADURA.includes(tipo) ? null : "En la armadura solo va una armadura.";
    if (ranura.startsWith("accesorio-")) return tipo === TIPO_ACCESORIO ? null : "Tiene que ser un accesorio.";
    if (PARTES_MANO[ranura]) {
        if (categoriaEquipo(tipo) !== "mano") return "En un brazo solo van armas, escudos o reliquias.";
        const otro = PARTES_MANO[ranura === "izquierda" ? "derecha" : "izquierda"];
        if (TIPOS_DOS_MANOS.includes(tipo) && borrador[otro]?.tipo) return "Un arma a dos manos necesita el otro brazo vacío.";
        return null;
    }
    return ARMAS[tipo] ? null : "En esta parte solo van armas o escudos.";
}

/* Tipos de equipo que admite una ranura (los únicos que deja elegir la ventana de objetos) */
function tiposEquipoRanura(ranura) {
    if (ranura === "armadura") return [...TIPOS_ARMADURA];
    if (ranura.startsWith("accesorio-")) return [TIPO_ACCESORIO];
    const armas = Object.keys(ARMAS);
    if (!PARTES_MANO[ranura]) return armas;
    return [...armas, TIPO_RELIQUIA].filter(tipo => !motivoTipoRanura(ranura, tipo));
}

/* Equipo → objeto de la ventana de objetos (y al revés al terminar) */
const objetoDeEquipo = (equipo) => cargarObjeto({
    tipo: "equipo", nombre: equipo.nombre?.trim() || ARMAS[equipo.tipo]?.etiqueta || "Equipo",
    descripcion: equipo.descripcion ?? "", cantidad: 1, equipo: JSON.parse(JSON.stringify(equipo))
});

function abrirEquipoPerfil(ranura, tipoEquipo) {
    const actual = tieneEquipoRanura(ranura) ? equipoRanuraPerfil(ranura) : null;
    const pjEquipo = { baul: actual ? [objetoDeEquipo(actual)] : [], calcularCaracteristicas: () => {} };
    const opciones = {
        pj: pjEquipo, origen: el("modalPerfilMaster"), libre: true, tipo: "equipo", tipoEquipo,
        tiposEquipo: tiposEquipoRanura(ranura),
        alTerminar: () => terminarEquipoPerfil(ranura, pjEquipo.baul[0])
    };
    if (actual) ctx.abrirEditorObjeto("baul", 0, opciones);
    else ctx.abrirCrearObjeto("baul", opciones);
}

function terminarEquipoPerfil(ranura, objeto) {
    if (!borrador || !objeto) return;
    const motivo = objeto.tipo !== "equipo" ? "Solo se puede equipar equipamiento."
        : motivoTipoRanura(ranura, objeto.equipo.tipo);
    el("avisoPerfilMaster").textContent = motivo ?? "";
    if (!motivo) {
        const equipo = cargarEquipo(JSON.parse(JSON.stringify(objeto.equipo)));
        equipo.nombre = objeto.nombre;
        equipo.descripcion = objeto.descripcion;
        equipo.enUso = false;
        if (!TIPOS_DOS_MANOS.includes(equipo.tipo)) equipo.parteSecundaria = null;
        ponerEquipoPerfil(ranura, equipo);
    }
    pintarPerfil();
}

/* Fila de una ranura con su equipo (el nombre de las partes se edita en la propia fila) */
function filaRanuraPerfil({ ranura, titulo, nombreEditable = false, iconoVacio, vacio, motivoEquipar = "", quitar = "" }) {
    const equipo = tieneEquipoRanura(ranura) ? equipoRanuraPerfil(ranura) : null;
    const objeto = equipo ? objetoDeEquipo(equipo) : null;
    const detalle = objeto ? `${objeto.nombre} · ${ctx.detalleObjeto(objeto)}` : vacio;
    const botones = (equipo
        ? botonObjeto("editarEquipo", "editar", "Editar equipo") + botonObjeto("quitarEquipo", "cancelar", "Quitar equipo")
        : botonObjeto("equipar", iconoVacio, "Equipar", motivoEquipar)) + quitar;
    return `<div class="fila-objeto fila-ranura-npc" data-ranura="${escaparHtml(ranura)}">
        <span class="objeto-icono">${iconoSao(objeto ? ctx.iconoObjeto(objeto) : iconoVacio)}</span>
        <div class="objeto-info">
            <div class="objeto-cabecera">${nombreEditable
                ? `<input type="text" class="nombre-parte-perfil" data-parte-nombre="${escaparHtml(ranura)}" maxlength="60" aria-label="Nombre de la acción">`
                : `<span class="objeto-nombre">${escaparHtml(titulo)}</span>`}</div>
            <div class="objeto-detalle">${escaparHtml(detalle)}</div>
        </div>
        <div class="objeto-acciones">${botones}</div>
    </div>`;
}

/* Rehace el HTML solo si cambia (así no se pierde el campo con el foco) */
function pintarSiCambia(contenedor, html) {
    if (contenedor.dataset.html === html) return;
    contenedor.dataset.html = html;
    contenedor.innerHTML = html;
}

function pintarPartesPerfil() {
    const pj = borrador;
    const partes = pj.npc.partes;
    const html = partes.map(parte => {
        const ocupa = parteQueOcupa(pj, parte.id);
        const motivoQuitar = motivoNoQuitarParte(pj, parte.id);
        return filaRanuraPerfil({
            ranura: parte.id, nombreEditable: true, iconoVacio: "espada",
            vacio: ocupa ? `Ocupada por el arma a dos manos de ${parteNpc(pj, ocupa)?.nombre ?? "otra parte"}` : "Sin equipo",
            motivoEquipar: ocupa ? "La ocupa un arma a dos manos" : "",
            quitar: botonObjeto("quitarParte", "descartar", `Quitar ${parte.nombre}`, motivoQuitar ?? "")
        });
    }).join("");
    pintarSiCambia(el("perfilMasterPartes"), html);
    partes.forEach(parte => {
        const input = el("perfilMasterPartes").querySelector(`[data-parte-nombre="${CSS.escape(parte.id)}"]`);
        if (input && document.activeElement !== input) input.value = parte.nombre;
    });
    // Cada parte es una acción y por turno hay partes − 1
    el("perfilMasterContadorPartes").textContent = `(${partes.length} partes, ${Math.max(0, partes.length - 1)} acciones por turno)`;
    const lleno = partes.length >= MAX_PARTES_NPC;
    const botones = `<button type="button" class="btn-crear-objeto" data-crear="parteNpc" ${lleno ? `disabled title="Máximo ${MAX_PARTES_NPC} partes"` : ""}>+ Crear acción</button>`
        + Object.keys(NOMBRES_BRAZO).filter(id => !tieneParte(pj, id))
            .map(id => `<button type="button" class="btn-crear-objeto" data-crear="brazo-${id}" ${lleno ? "disabled" : ""}>+ ${NOMBRES_BRAZO[id]}</button>`).join("");
    pintarSiCambia(el("perfilMasterBotonesPartes"), botones);
}

function pintarEquipoPerfil() {
    const pj = borrador;
    const accesorios = pj.accesorios.map((acc, i) => ({ acc, i })).filter(({ acc }) => !accesorioVacio(acc));
    const html = filaRanuraPerfil({ ranura: "armadura", titulo: "Armadura", iconoVacio: "armadura", vacio: "Sin armadura" })
        + accesorios.map(({ i }) => filaRanuraPerfil({ ranura: `accesorio-${i}`, titulo: `Accesorio ${i + 1}`, iconoVacio: "accesorio", vacio: "" })).join("");
    pintarSiCambia(el("perfilMasterEquipoNpc"), html);
    const boton = el("formPerfilMaster").querySelector('[data-crear="accesorioNpc"]');
    boton.disabled = accesorios.length >= MAX_ACCESORIOS_NPC;
}

/* Sube o baja las acciones del turno al añadir o quitar partes (como en la ficha) */
const ajustarAccionesBorrador = (cambio) => {
    const pj = borrador;
    pj.numeroAcciones = Math.max(0, Math.min(pj.numeroAcciones + cambio, pj.npc.partes.length - 1));
};

async function accionRanuraPerfil(ranura, accion) {
    const pj = borrador;
    if (accion === "equipar") {
        const tipoEquipo = ranura === "armadura" ? "ligera" : ranura.startsWith("accesorio-") ? TIPO_ACCESORIO : "espada";
        return abrirEquipoPerfil(ranura, tipoEquipo);
    }
    if (accion === "editarEquipo") return abrirEquipoPerfil(ranura);
    if (accion === "quitarEquipo") {
        const equipo = equipoRanuraPerfil(ranura);
        const ok = await ctx.confirmar({ titulo: "Quitar equipo", texto: `¿Quitar ${equipo?.nombre?.trim() || "este equipo"}?` });
        if (!ok || pj !== borrador) return;
        ponerEquipoPerfil(ranura, null);
    }
    if (accion === "quitarParte") {
        const parte = parteNpc(pj, ranura);
        const ok = parte && await ctx.confirmar({ titulo: "Quitar acción", texto: `¿Quitar ${parte.nombre}?` });
        if (!ok || pj !== borrador) return;
        quitarParte(pj, ranura);
    }
    pintarPerfil();
}

/* Los editores de objetos trabajan sobre pj[lista]: para la recompensa se les pasa un "pj" que solo tiene esa
   lista (baul = objetos de la recompensa, objetosClave = sus objetos clave), sin restricciones (libre) */
const pjRecompensa = () => ({
    baul: borrador.npc.recompensa.objetos,
    objetosClave: borrador.npc.recompensa.objetosClave,
    calcularCaracteristicas: () => {}
});
const opcionesRecompensa = () => ({ pj: pjRecompensa(), origen: el("modalPerfilMaster"), alTerminar: pintarPerfil, libre: true });

async function accionRecompensa(lista, indice, accion) {
    const { recompensa } = borrador.npc;
    const objetos = lista === "recompensa" ? recompensa.objetos : recompensa.objetosClave;
    const objeto = objetos[indice];
    if (!objeto) return;
    if (accion === "editar") {
        if (lista === "recompensaClave") ctx.abrirEditorObjetoClave(indice, opcionesRecompensa());
        else ctx.abrirEditorObjeto("baul", indice, opcionesRecompensa());
        return;
    }
    if (accion === "descartar") {
        const ok = await ctx.confirmar({ titulo: "Quitar de la recompensa", texto: `¿Quitar ${objeto.nombre} de la recompensa?` });
        const actual = lista === "recompensa" ? borrador?.npc.recompensa.objetos : borrador?.npc.recompensa.objetosClave;
        if (!ok || objetos !== actual) return;
        objetos.splice(indice, 1);
    }
    pintarPerfil();
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
    const vidaLlena = pj.vida >= vidaMaxEnJuego();
    const paLleno = pj.puntosArte >= pj.puntosArteMax;
    cambio();
    pj.calcularCaracteristicas();
    pj.vida = vidaLlena ? vidaMaxEnJuego() : Math.min(pj.vida, vidaMaxEnJuego());
    pj.puntosArte = paLleno ? pj.puntosArteMax : Math.min(pj.puntosArte, pj.puntosArteMax);
}

/* Aplica un campo del formulario al borrador, con los límites de la ficha (validarYActualizar en interfaz.js) */
function aplicarCampo(input) {
    const pj = borrador;
    const clave = input.dataset.clave;
    if (mascotaEditada && aplicarCampoMascota(input)) return;
    if (input.dataset.habUw) {
        pj.setHabilidadUnderworld(input.dataset.habUw, input.value);
    } else if (input.classList.contains("check-underworld")) {
        pj.setUnderworldHabilitado(input.checked);
    } else if (input.id === "perfilMasterNombre") {
        pj.nombre = input.value.trim().slice(0, 60);
    } else if (input.id === "perfilMasterNombreReal") {
        pj.nombreReal = input.value.trim().slice(0, 60);
    } else if (input.id === "perfilMasterNivel") {
        recalcularConservandoMaximos(() => { pj.nivel = limitar(entero(input.value, pj.nivel), 1, 150); });
    } else if (input.id === "perfilMasterProfesion") {
        if (PROFESIONES[input.value]) pj.tipoProfesion = input.value;
    } else if (input.id === "perfilMasterUnderworld") {
        pj.setUnderworld(input.checked);
    } else if (input.id === "perfilMasterProtagonista") {
        pj.protagonista = input.checked;
    } else if (input.id === "perfilMasterTrueque") {
        if (pj.esNpc) pj.permitirTrueque = input.checked;
    } else if (CARACTERISTICAS.includes(clave)) {
        const anterior = Number(pj[clave]) || 0;
        const otros = pj.getPuntosCaracteristicasGastados() - anterior;
        const maximo = Math.min(pj.getMaxCaracteristicas(), pj.getPuntosCaracteristicasLimite() - otros);
        recalcularConservandoMaximos(() => { pj[clave] = limitar(entero(input.value, anterior), 1, Math.max(1, maximo)); });
    } else if (HABILIDADES_LISTA.includes(clave)) {
        if (!pj.puedeUsarHabilidad(clave)) return;
        // Se escribe la suma (Underworld + invertido) y se guarda lo invertido
        const extra = pj.getExtraUnderworld(clave);
        const anterior = Number(pj[clave]) || 0;
        const maximo = Math.min(Math.max(anterior, pj.getMaxHabilidad() - extra), anterior + pj.getPuntosHabilidadDisponibles());
        recalcularConservandoMaximos(() => { pj[clave] = limitar(entero(input.value, anterior + extra) - extra, 0, Math.max(0, maximo)); });
    } else if (input.id === "perfilMasterVida") {
        pj.vida = Math.min(entero(input.value, pj.vida), vidaMaxEnJuego()); // puede ser negativa
    } else if (input.id === "perfilMasterPA") {
        pj.puntosArte = limitar(entero(input.value, pj.puntosArte), 0, pj.puntosArteMax);
    } else if (input.id === "perfilMasterCor") {
        pj.cor = Math.max(0, entero(input.value, pj.cor));
    } else if (input.id === "perfilMasterNotoriedad") {
        if (!pj.esNpc) pj.notoriedad = Math.max(0, entero(input.value, pj.notoriedad));
    } else if (input.id === "perfilMasterAlerta") {
        if (!pj.esNpc) pj.alertaSistema = Math.max(0, entero(input.value, pj.alertaSistema));
    } else if (input.id === "perfilMasterNeutral") {
        if (pj.esNpc && !esPesadilla(pj)) pj.neutral = input.checked; // una pesadilla no puede ser neutral
    } else if (input.id === "perfilMasterEgo") {
        pj.puntosEgo = Math.max(0, entero(input.value, pj.puntosEgo));
    } else if (input.dataset.parteNombre && pj.esNpc) {
        const parte = parteNpc(pj, input.dataset.parteNombre);
        if (parte) parte.nombre = input.value.trim().slice(0, 60) || parte.nombre;
    } else if (input.id === "perfilMasterComportamiento") {
        if (pj.esNpc) pj.comportamientoCombate = input.value;
    } else if (input.dataset.npc && pj.esNpc) {
        const clave = input.dataset.npc;
        if (clave === "recompensaCor") pj.npc.recompensa.cor = Math.max(0, entero(input.value, pj.npc.recompensa.cor));
        else if (clave === "expRecompensa") pj.npc.expRecompensa = Math.max(0, entero(input.value, pj.npc.expRecompensa));
        else if (clave === "piso") pj.npc.piso = cargarPiso(input.value);
        else {
            const valor = VALORES_NPC.find(v => v.clave === clave);
            if (valor) recalcularConservandoMaximos(() => { pj.npc[clave] = Math.max(valor.min, entero(input.value, pj.npc[clave])); });
        }
    } else if (input.dataset.opcionFase && esJefe(pj)) {
        const fase = pj.npc.fases[faseActual(pj)];
        if (fase && faseActual(pj) > 0) fase[input.dataset.opcionFase] = input.checked;
    } else if (input.dataset.tirada && pj.esNpc) {
        const tirada = pj.npc.tiradas[Number(input.closest("[data-index]")?.dataset.index)];
        if (!tirada) return;
        if (input.dataset.tirada === "nombre") tirada.nombre = input.value.trim().slice(0, 60) || "Tirada";
        else tirada.valor = limitar(entero(input.value, tirada.valor), -99, 99);
    }
}

function aceptarPerfil() {
    if (!borrador) return;
    const form = el("formPerfilMaster");
    form.querySelectorAll("input, select, textarea").forEach(aplicarCampo);
    const pj = borrador;
    const aviso = el("avisoPerfilMaster");
    // Los NPC pueden repetir nombre (en el máster y en la sala)
    const motivo = !pj.nombre ? "Escribe un nombre."
        : pj.esNpc ? null
        : master.nombreUsado(pj.nombre, pj.idPersonaje) ? `Ya tienes un personaje llamado "${pj.nombre}".`
        : motivoNombreNoDisponible(pj.nombre);
    if (motivo) {
        aviso.textContent = motivo;
        aviso.scrollIntoView({ block: "nearest" });
        return;
    }
    if (mascotaEditada) {
        enviarMascota();
        return;
    }
    reproducir("click");
    // Pesadilla: sin recompensa, EXP que dar, PA ni neutralidad
    limpiarPesadilla(pj);
    // Jefe: al crear (o en una plantilla) empieza en la fase 1 con la vida llena; al editar vuelve a la fase en juego
    if (esJefe(pj)) {
        if (creando || plantillaEditada) reiniciarJefe(pj);
        else {
            aplicarFase(pj, faseEnJuego);
            pj.vida = Math.min(pj.vida, pj.vidaMax);
        }
    }
    if (plantillaEditada) {
        // Plantilla del compendio: no toca la ficha; se vuelve al compendio
        compendio.guardarPlantilla(plantillaEditada, pj);
        subirCompendio();
        volverAlCompendio = true;
        bootstrap.Modal.getOrCreateInstance(el("modalPerfilMaster")).hide();
        return;
    }
    // Un NPC nuevo se guarda también como plantilla en el compendio; en la sesión entra una copia
    if (creando && pj.esNpc) {
        pj.idPlantilla = compendio.anadirPlantilla(pj);
        subirCompendio();
    }
    volverAlCompendio = false;
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
    el("perfilMasterValoresNpc").innerHTML = VALORES_NPC.map(({ clave, etiqueta, min, ayuda }) =>
        `<label${ayuda ? ` title="${escaparHtml(ayuda)}"` : ""}>${escaparHtml(etiqueta)} <input type="number" data-npc="${clave}" min="${min}"></label>`).join("");
    // Estilo SAO (formularioSao.js): fichas para la profesión; − / + en los números e iconos de las ranuras
    const ICONOS_PROFESION = { herrero: "martillo_guerra", armero: "armadura", cocinero: "comida", alquimista: "pocion" };
    sincronizarProfesion = crearFichas(el("perfilMasterProfesion"), { icono: (v) => ICONOS_PROFESION[v] ?? null });
    prepararFormularioSao(el("formPerfilMaster"));
    inicializarMascotasMaster();
    el("perfilMasterTipo").addEventListener("click", (e) => {
        const boton = e.target.closest("[data-tipo]");
        if (!boton || !borrador) return;
        reproducir("click");
        cambiarTipoBorrador(boton.dataset.tipo);
        pintarPerfil();
    });
    const form = el("formPerfilMaster");
    form.addEventListener("change", (e) => {
        if (!borrador || !e.target.matches("input, select, textarea")) return;
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
            if (tipo === "fase") {
                if (copiarFase(borrador) < 0) return;
                aplicarFase(borrador, numeroFases(borrador) - 1);
                pintarPerfil();
                return;
            }
            if (tipo === "tirada") {
                if (borrador.npc.tiradas.length >= MAX_TIRADAS_NPC) return;
                borrador.npc.tiradas.push({ nombre: "Tirada", valor: 0 });
                pintarPerfil();
                el("perfilMasterTiradas").lastElementChild?.querySelector("input")?.select();
                return;
            }
            if (tipo === "parteNpc" || tipo.startsWith("brazo-")) {
                const nueva = tipo === "parteNpc" ? anadirParte(borrador, "Acción nueva") : anadirBrazo(borrador, tipo.slice("brazo-".length));
                if (!nueva) return;
                ajustarAccionesBorrador(1);
                pintarPerfil();
                if (tipo === "parteNpc") el("perfilMasterPartes").querySelector(`[data-parte-nombre="${CSS.escape(nueva.id)}"]`)?.select();
                return;
            }
            if (tipo === "accesorioNpc") {
                const libre = borrador.accesorios.findIndex(accesorioVacio);
                return abrirEquipoPerfil(`accesorio-${libre < 0 ? borrador.accesorios.length : libre}`, TIPO_ACCESORIO);
            }
            if (tipo === "recompensa") ctx.abrirCrearObjeto("baul", opcionesRecompensa());
            else if (tipo === "recompensaClave") ctx.abrirEditorObjetoClave(null, opcionesRecompensa());
            else if (tipo === "objetosClave") ctx.abrirEditorObjetoClave(null, opcionesObjeto());
            else if (tipo === "catalogo") ctx.abrirCatalogo(opcionesArte());
            else if (tipo === "arte") ctx.abrirEditorArte(null, origen, opcionesArte());
            else if (tipo === "onirica") ctx.abrirEditorOnirica(null, origen, opcionesArte());
            else ctx.abrirCrearObjeto(tipo, opcionesObjeto());
            return;
        }
        const botonCompendio = e.target.closest("button[data-compendio]");
        if (botonCompendio && !botonCompendio.disabled) {
            reproducir("click");
            guardarBorradorEnCompendio(botonCompendio.dataset.compendio === "sobrescribir");
            return;
        }
        const pestana = e.target.closest("button[data-fase]");
        if (pestana && esJefe(borrador)) {
            // Antes, lo escrito en el campo con el foco (se aplica al salir de él)
            el("formPerfilMaster").querySelectorAll("input, select, textarea").forEach(aplicarCampo);
            reproducir("click");
            aplicarFase(borrador, Number(pestana.dataset.fase));
            pintarPerfil();
            return;
        }
        const quitarFase = e.target.closest("button[data-accion='borrarFase']");
        if (quitarFase && !quitarFase.disabled && esJefe(borrador)) {
            reproducir("click");
            const i = faseActual(borrador);
            const pj = borrador;
            ctx.confirmar({ titulo: "Quitar fase", texto: `¿Quitar la fase ${i + 1} con su equipo, artes y valores?` }).then(ok => {
                if (!ok || pj !== borrador) return;
                borrarFase(pj, i);
                if (faseEnJuego > i || faseEnJuego >= numeroFases(pj)) faseEnJuego = Math.max(0, faseEnJuego - 1);
                pintarPerfil();
            });
            return;
        }
        const quitar = e.target.closest("button[data-accion='quitarTirada']");
        if (quitar) {
            reproducir("click");
            borrador.npc.tiradas.splice(Number(quitar.closest("[data-index]").dataset.index), 1);
            pintarPerfil();
            return;
        }
        const boton = e.target.closest(".lista-objetos button[data-accion]");
        const fila = boton?.closest(".fila-objeto");
        if (!fila || boton.disabled) return;
        reproducir("click");
        const lista = boton.closest(".lista-objetos").dataset.lista;
        if (lista === "partesNpc" || lista === "equipoNpc") accionRanuraPerfil(fila.dataset.ranura, boton.dataset.accion);
        else if (lista === "artes") accionArtePerfil(Number(fila.dataset.index), boton.dataset.accion);
        else accionObjetoPerfil(lista, Number(fila.dataset.index), boton.dataset.accion);
    });
    el("btnAceptarPerfilMaster").addEventListener("click", aceptarPerfil);
    // Abierto desde el compendio: al cerrarse (y no por abrir una ventana hija, que lo oculta un momento) vuelve a él
    // Con / sin las habilidades del Underworld en el panel de protagonistas (se recuerda)
    el("panelProtagonistas").addEventListener("click", (e) => {
        const ficha = e.target.closest("[data-sin-uw]");
        if (!ficha) return;
        reproducir("click");
        verSinUw = ficha.dataset.sinUw === "1";
        try { localStorage.setItem(CLAVE_SIN_UW_PROTAGONISTAS, verSinUw ? "1" : "0"); } catch { /* sin almacenamiento */ }
        pintarProtagonistas(false);
    });
    el("btnProtagonistasPerfil").addEventListener("click", () => {
        reproducir("click");
        abrirPanelProtagonistas(el("panelProtagonistas").hidden, true);
    });
    el("modalPerfilMaster").addEventListener("hidden.bs.modal", () => {
        setTimeout(() => {
            if (!volverAlCompendio || document.querySelector(".modal.show")) return;
            volverAlCompendio = false;
            abrirCompendio();
        }, 400);
    });
    // El borrador se conserva al ocultar la ventana (al abrir la de crear objeto vuelve a ella); se cambia al abrirla
}

/* Pasa el borrador (una copia en juego) a su plantilla o a una nueva; la ficha cambia al aceptar el perfil */
async function guardarBorradorEnCompendio(sobrescribir) {
    el("formPerfilMaster").querySelectorAll("input, select, textarea").forEach(aplicarCampo);
    const pj = borrador;
    if (sobrescribir) {
        const ok = await ctx.confirmar({
            titulo: "Sobrescribir plantilla",
            texto: `¿Guardar ${pj.nombre || "este NPC"} encima de su plantilla del compendio? Las copias que ya están en juego no cambian.`
        });
        if (!ok || pj !== borrador) return;
        compendio.guardarPlantilla(pj.idPlantilla, pj);
    } else {
        pj.idPlantilla = compendio.anadirPlantilla(pj);
    }
    subirCompendio();
    pintarPerfil();
    ctx.aviso("Compendio", [`${pj.nombre || "Sin nombre"} guardado en el compendio${sobrescribir ? "" : " como plantilla nueva"}.`]);
}

/* Compendio de NPC (#modalCompendio; datos en compendio.js) _______________________
 * Plantillas agrupadas por piso, con filtro y buscador. Con sesión se sincroniza con la nube la primera vez que
 * se abre (manda la copia más reciente) y cada cambio sube solo las páginas cambiadas. */

let estadoNube = "local"; // local | cargando | ok | subiendo | error
let errorNube = "";
let sincronizado = null;  // uid con el que ya se ha sincronizado en esta sesión, o null

function textoEstadoCompendio() {
    const { total, plantillas } = compendio.info();
    const paginas = `${plantillas} NPC en ${total} página${total === 1 ? "" : "s"}`;
    switch (estadoNube) {
        case "cargando": return "Cargando el compendio de la nube…";
        case "subiendo": return `Guardando en la nube… (${paginas})`;
        case "ok": return `Guardado en la nube (${paginas}).`;
        case "error": return `No se pudo sincronizar con la nube: ${errorNube} Queda guardado en este navegador.`;
        default: return `Sin sesión: el compendio solo está en este navegador (${paginas}). Inicia sesión para guardarlo en la nube.`;
    }
}

const normalizarBusqueda = (texto) => String(texto ?? "").trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const etiquetaPiso = (piso) => piso === null ? "Sin piso" : `Piso ${piso}`;

function pintarCompendio() {
    el("estadoCompendio").textContent = textoEstadoCompendio();
    el("estadoCompendio").classList.toggle("error", estadoNube === "error");
    const todas = compendio.listar();
    // Filtro de piso: los pisos que hay (y "Sin piso" si alguna no tiene)
    const filtro = el("filtroPisoCompendio");
    const elegido = filtro.value;
    const pisos = [...new Set(todas.map(p => p.piso))];
    filtro.innerHTML = `<option value="">Todos</option>` + pisos
        .map(piso => `<option value="${piso ?? "sin"}">${etiquetaPiso(piso)}</option>`).join("");
    filtro.value = [...filtro.options].some(o => o.value === elegido) ? elegido : "";
    const buscado = normalizarBusqueda(el("buscarCompendio").value);
    const tipo = el("filtroTipoCompendio").value; // "", "npc", "jefe" o "pesadilla"
    const tipoDeFila = (r) => (r.jefe ? "jefe" : r.pesadilla ? "pesadilla" : "npc");
    const visibles = todas.filter(p => (!filtro.value || String(p.piso ?? "sin") === filtro.value)
        && (!tipo || tipoDeFila(p.resumen) === tipo)
        && (!buscado || normalizarBusqueda(p.nombre).includes(buscado)));
    if (!visibles.length) {
        el("listaCompendio").innerHTML = `<p class="lista-vacia">${todas.length ? "Ningún NPC coincide." : "El compendio está vacío. Crea uno con \"+ Crear NPC\"."}</p>`;
        return;
    }
    let html = "";
    let pisoActual;
    visibles.forEach(p => {
        if (p.piso !== pisoActual) {
            if (pisoActual !== undefined) html += "</div>";
            pisoActual = p.piso;
            html += `<h3 class="titulo-piso">${etiquetaPiso(p.piso)}</h3><div class="lista-objetos">`;
        }
        const r = p.resumen;
        html += `
            <div class="fila-objeto" data-id="${escaparHtml(p.id)}">
                <span class="objeto-icono">${iconoSao("personaje")}</span>
                <div class="objeto-info">
                    <div class="objeto-cabecera"><span class="objeto-nombre">${escaparHtml(p.nombre || "Sin nombre")}</span>${r.jefe ? `<span class="marca-jefe">Jefe</span>` : ""}${r.pesadilla ? `<span class="marca-jefe marca-pesadilla">Pesadilla</span>` : ""}</div>
                    <div class="objeto-detalle">${r.pesadilla ? "" : `LV ${escaparHtml(r.nivel ?? "?")} · `}${r.jefe ? `${escaparHtml(r.fases)} fase${r.fases === 1 ? "" : "s"} · ` : ""}${escaparHtml(r.vidaMax ?? "?")} PV${r.pesadilla ? "" : ` · ${escaparHtml(r.exp ?? 0)} EXP`}</div>
                </div>
                <div class="objeto-acciones">
                    ${botonObjeto("usar", "anadirAmigo", "Añadir una copia a la sesión")}
                    ${r.jefe || r.pesadilla ? "" : botonObjeto("crearJefe", "jefe", "Crear un jefe a partir de este NPC")}
                    ${botonObjeto("editar", "editar", "Editar plantilla")}
                    ${botonObjeto("duplicar", "duplicar", "Duplicar plantilla")}
                    ${botonObjeto("descartar", "descartar", "Borrar del compendio")}
                </div>
            </div>`;
    });
    el("listaCompendio").innerHTML = html + "</div>";
}

export function abrirCompendio() {
    pintarCompendio();
    const ventana = el("modalCompendio");
    ventana.dataset.sinSonidoAbrir = "1";
    bootstrap.Modal.getOrCreateInstance(ventana).show();
    sincronizarCompendio();
}

/* Primera vez con sesión: manda la copia más reciente. Si la del navegador es de otro usuario, manda la nube. */
async function sincronizarCompendio() {
    if (!haySesionOnline()) {
        estadoNube = "local";
        pintarCompendio();
        return;
    }
    const uid = getEstadoOnline().usuario?.uid;
    if (sincronizado !== uid) {
        estadoNube = "cargando";
        pintarCompendio();
        try {
            const nube = await leerCompendioNube();
            const local = compendio.info();
            const localPropio = !local.dueno || local.dueno === uid;
            if (!nube) {
                if (localPropio && local.plantillas) compendio.marcarTodoCambiado();
                else if (!localPropio) compendio.cargarDeNube({ actualizado: 0, paginas: [] });
            } else if (localPropio && local.pendiente && local.actualizado > nube.actualizado) {
                compendio.marcarTodoCambiado();
            } else if (!localPropio || local.pendiente || local.actualizado !== nube.actualizado) {
                if (localPropio && local.pendiente) {
                    ctx.aviso("Compendio", ["En la nube hay una versión más reciente del compendio: se usa esa y se descartan los cambios de este navegador."]);
                }
                compendio.cargarDeNube(nube);
            }
            compendio.setDueno(uid);
            sincronizado = uid;
        } catch (error) {
            estadoNube = "error";
            errorNube = mensajeErrorOnline(error);
            pintarCompendio();
            return;
        }
    }
    await subirCompendio();
}

/** Sube los cambios del compendio (si hay sesión y ya se ha sincronizado; si no, quedan pendientes) */
export async function subirCompendio() {
    if (!haySesionOnline()) {
        estadoNube = "local";
    } else if (sincronizado !== getEstadoOnline().usuario?.uid) {
        return sincronizarCompendio();
    } else {
        const cambios = compendio.cambiosParaSubir();
        if (cambios) {
            estadoNube = "subiendo";
            pintarCompendioSiAbierto();
            try {
                await guardarCompendioNube(cambios);
                compendio.marcarSubido(cambios.actualizado);
                if (compendio.info().pendiente) return subirCompendio(); // ha cambiado mientras subía
            } catch (error) {
                estadoNube = "error";
                errorNube = mensajeErrorOnline(error);
                pintarCompendioSiAbierto();
                return;
            }
        }
        estadoNube = "ok";
    }
    pintarCompendioSiAbierto();
}

const pintarCompendioSiAbierto = () => { if (el("modalCompendio").classList.contains("show")) pintarCompendio(); };

/** Solo para el debug: páginas más pequeñas para ver cómo se reparten (y se suben) */
export function tamanoPaginaCompendio(tamano) {
    const info = compendio.setTamanoMaxPagina(tamano);
    subirCompendio();
    return info;
}

/* Cambia de ventana: oculta el compendio y luego hace lo que toque */
function dejarCompendio(despues) {
    const ventana = el("modalCompendio");
    ventana.addEventListener("hidden.bs.modal", despues, { once: true });
    ventana.dataset.sinSonidoCerrar = "1";
    bootstrap.Modal.getOrCreateInstance(ventana).hide();
}

async function accionCompendio(id, accion) {
    const nombre = compendio.listar().find(p => p.id === id)?.nombre || "Sin nombre";
    if (accion === "usar") {
        const json = compendio.copiaDePlantilla(id);
        if (!json) return;
        const copia = JSON.parse(json);
        master.guardar(copia.idPersonaje, { json, guardada: "" });
        master.anadirASesion(copia.idPersonaje);
        actualizarHudMaster();
        ctx.aviso("Compendio", [`${nombre} añadido a la sesión.`]);
        return;
    }
    if (accion === "editar") {
        volverAlCompendio = true;
        dejarCompendio(() => abrirPerfilMaster({ plantilla: id }));
        return;
    }
    if (accion === "crearJefe") {
        volverAlCompendio = true; // si se cancela, se vuelve aquí; al aceptar se guarda como plantilla nueva
        dejarCompendio(() => abrirPerfilMaster({ crear: true, jefeDe: id }));
        return;
    }
    if (accion === "duplicar") compendio.duplicarPlantilla(id);
    if (accion === "descartar") {
        const ok = await ctx.confirmar({
            titulo: "Borrar del compendio",
            texto: `¿Borrar la plantilla de ${nombre}? Las copias que ya están en juego se conservan.`
        });
        if (!ok) return;
        compendio.borrarPlantilla(id);
    }
    pintarCompendio();
    subirCompendio();
}

function exportarCompendio() {
    const blob = new Blob([compendio.exportar()], { type: "application/json" });
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(blob);
    enlace.download = `compendio-npc-${new Date().toISOString().slice(0, 10)}.json`;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}

async function importarCompendio(fichero) {
    let lista = [];
    try {
        lista = compendio.leerImportacion(JSON.parse(await fichero.text()));
    } catch {
        lista = [];
    }
    if (!lista.length) {
        ctx.aviso("Importar", ["El fichero no tiene NPC: elige un compendio exportado o la ficha de un NPC."]);
        return;
    }
    const ok = await ctx.confirmar({
        titulo: "Importar NPC",
        texto: `¿Añadir ${lista.length} NPC al compendio? Los que ya tienes se conservan.`
    });
    if (!ok) return;
    compendio.importar(lista);
    pintarCompendio();
    subirCompendio();
}

function inicializarCompendio() {
    el("listaCompendio").addEventListener("click", (e) => {
        const boton = e.target.closest("button[data-accion]");
        const id = boton?.closest("[data-id]")?.dataset.id;
        if (!id || boton.disabled) return;
        reproducir("click");
        accionCompendio(id, boton.dataset.accion);
    });
    el("filtroPisoCompendio").addEventListener("change", pintarCompendio);
    el("filtroTipoCompendio").addEventListener("change", pintarCompendio);
    el("btnCrearJefeCompendio").addEventListener("click", () => {
        reproducir("click");
        volverAlCompendio = true;
        dejarCompendio(() => abrirPerfilMaster({ crear: true, jefe: true }));
    });
    el("btnCrearPesadillaCompendio").addEventListener("click", () => {
        reproducir("click");
        volverAlCompendio = true;
        dejarCompendio(() => abrirPerfilMaster({ crear: true, pesadilla: true }));
    });
    el("buscarCompendio").addEventListener("input", pintarCompendio);
    el("btnCrearNpcCompendio").addEventListener("click", () => {
        reproducir("click");
        volverAlCompendio = true; // si se cancela, se vuelve aquí; al aceptar se abre el NPC en la ficha
        dejarCompendio(() => abrirPerfilMaster({ crear: true, npc: true }));
    });
    el("btnExportarCompendio").addEventListener("click", () => {
        reproducir("click");
        exportarCompendio();
    });
    el("btnImportarCompendio").addEventListener("click", () => {
        reproducir("click");
        el("fileCompendio").click();
    });
    el("fileCompendio").addEventListener("change", (e) => {
        const fichero = e.target.files?.[0];
        e.target.value = "";
        if (fichero) importarCompendio(fichero);
    });
    // Al iniciar o cerrar sesión: se vuelve a sincronizar; si hay cambios pendientes, se suben ya
    alCambiarSesionOnline((estado) => {
        const uid = estado?.usuario?.uid ?? null;
        if (uid === sincronizado) return;
        sincronizado = null;
        if (uid && compendio.info().pendiente) sincronizarCompendio();
        else pintarCompendioSiAbierto();
    });
}

/* Inicio _________________________________________________________________________ */

/** Solo en modo máster. Después, interfaz.js llama a restaurarMaster para poner el último personaje. */
export function inicializarMaster(contexto) {
    ctx = contexto;
    master.setClaveSesion(master.SESION_LOCAL);
    master.refrescarResumenesAntiguos(); // NPC guardados sin los datos de la lista de NPC de los jugadores
    inicializarHud();
    inicializarPersonajesMaster();
    inicializarPerfilMaster();
    inicializarCompendio();
}

/* Mascotas de los jugadores (mascotas.js) _________________________________________
 * El máster crea una mascota en su perfil (tipo Mascota) eligiendo a qué personaje conectado pertenece: no se guarda
 * aquí, se le envía al dueño en un cristal (evento privado mascotaNueva). Para editarla (subir sus valores, quitar los
 * niveles por revisar, revivirla) se le pide al dueño (pedirMascota → mascotaDatos), se abre en el perfil y al aceptar
 * se le devuelve (mascotaActualizada; con otro dueño, mascotaQuitada al anterior y mascotaNueva al nuevo). */

/* Los eventos de la sala tienen un límite de tamaño (reglas): una mascota muy grande no se puede enviar */
const MAX_CARACTERES_MASCOTA = 18000;

/* Personajes de jugadores conectados a la sala (posibles dueños): [{ instancia, jugador, nombre }] */
function posiblesDuenos() {
    const sala = getEstadoOnline().sala;
    const uid = getEstadoOnline().usuario?.uid;
    if (!sala) return [];
    return getTodosPersonajesSala().filter(p => p.jugador !== uid && !p.npc && !p.mascota && p.nombre)
        .map(p => ({ instancia: p.instancia, jugador: p.jugador, nombre: p.nombre }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

function pintarMascotaPerfil() {
    if (!mascotaEditada) return;
    const m = mascotaEditada;
    const duenos = posiblesDuenos();
    // El dueño actual aunque ya no esté conectado (para que se vea a quién pertenece)
    if (m.dueno && !duenos.some(d => d.instancia === m.dueno.instancia)) duenos.unshift({ ...m.dueno, desconectado: true });
    const html = duenos.length ? duenos.map(d => `
        <button type="button" class="btn-eleccion" data-dueno="${escaparHtml(d.instancia)}" aria-pressed="${m.dueno?.instancia === d.instancia}"
            ${d.desconectado ? `disabled title="No está conectado"` : ""}>${escaparHtml(d.nombre)}</button>`).join("")
        : `<p class="lista-vacia">No hay personajes de jugadores conectados a la sala.</p>`;
    const cont = el("perfilMasterDueno");
    if (cont.dataset.html !== html) {
        cont.dataset.html = html;
        cont.innerHTML = html;
    }
    const nombreCristal = el("perfilMasterCristalNombre");
    if (document.activeElement !== nombreCristal) nombreCristal.value = m.cristal.nombre;
    nombreCristal.placeholder = `Cristal de ${borrador.nombre || "…"}`;
    const descripcion = el("perfilMasterCristalDescripcion");
    if (document.activeElement !== descripcion) descripcion.value = m.cristal.descripcion;
    el("perfilMasterPendientes").value = borrador.nivelesPendientes;
    el("perfilMasterAgrietado").checked = m.cristal.agrietado;
    el("perfilMasterQuitarMascota").hidden = !m.id;
}

/* Campos propios de la mascota; devuelve true si era uno de ellos */
function aplicarCampoMascota(input) {
    const m = mascotaEditada;
    if (input.id === "perfilMasterCristalNombre") m.cristal.nombre = input.value.trim().slice(0, 60);
    else if (input.id === "perfilMasterCristalDescripcion") m.cristal.descripcion = input.value.trim().slice(0, 500);
    else if (input.id === "perfilMasterPendientes") borrador.nivelesPendientes = Math.max(0, Math.min(150, Math.trunc(Number(input.value) || 0)));
    else if (input.id === "perfilMasterAgrietado") m.cristal.agrietado = input.checked;
    else return false;
    return true;
}

/* El cristal que se envía al dueño (con la ficha de la mascota) */
function cristalDelBorrador() {
    const pj = borrador;
    const m = mascotaEditada;
    return {
        nombre: m.cristal.nombre || `Cristal de ${pj.nombre}`,
        descripcion: m.cristal.descripcion,
        mascota: { json: pj.toJSONString(), agrietado: m.cristal.agrietado }
    };
}

/* Aceptar el perfil de una mascota: se envía a su dueño (nueva, cambiada o con otro dueño) */
async function enviarMascota() {
    const pj = borrador;
    const m = mascotaEditada;
    const aviso = el("avisoPerfilMaster");
    pj.esNpc = true;
    pj.esMascota = true;
    pj.esJefe = false;
    pj.esPesadilla = false;
    const motivo = !m.dueno ? "Elige a qué personaje pertenece."
        : !posiblesDuenos().some(d => d.instancia === m.dueno.instancia) ? `${m.dueno.nombre} no está conectado: no se le puede enviar.`
        : !m.cristal.agrietado && pj.vida <= 0 ? "Sin vida volvería al cristal agrietado: dale vida para revivirla (o deja el cristal agrietado)."
        : null;
    const objetoClave = motivo ? null : cristalDelBorrador();
    const demasiado = objetoClave && JSON.stringify(objetoClave).length > MAX_CARACTERES_MASCOTA
        ? "La mascota es demasiado grande para enviarla (quita artes, objetos o texto)." : null;
    if (motivo || demasiado) {
        aviso.textContent = motivo || demasiado;
        aviso.scrollIntoView({ block: "nearest" });
        return;
    }
    reproducir("click");
    try {
        if (m.id && m.original && m.original !== m.dueno.instancia) {
            await emitirPrivado("mascotaQuitada", { para: m.original, id: m.id });
            await emitirPrivado("mascotaNueva", { para: m.dueno.instancia, objetoClave });
        } else if (m.id) {
            await emitirPrivado("mascotaActualizada", { para: m.dueno.instancia, id: m.id, objetoClave });
        } else {
            await emitirPrivado("mascotaNueva", { para: m.dueno.instancia, objetoClave });
        }
    } catch (error) {
        aviso.textContent = mensajeErrorOnline(error);
        return;
    }
    ctx.aviso("Mascota", [`${pj.nombre || "La mascota"} se ha enviado a ${m.dueno.nombre}.`]);
    mascotaEditada = null;
    bootstrap.Modal.getOrCreateInstance(el("modalPerfilMaster")).hide();
}

/* Pide al dueño una mascota para editarla; la respuesta (mascotaDatos) la abre en el perfil */
let mascotaPedida = null; // { id, temporizador }
const MS_ESPERA_MASCOTA = 8000;
function instanciaDuenoDe(jugador, idMascota) {
    const conectados = getTodosPersonajesSala();
    // Invocada: su propia instancia "p-<id>" la atiende la pestaña del dueño
    const propia = conectados.find(p => p.jugador === jugador && p.instancia === `p-${idMascota}`);
    if (propia) return propia.instancia;
    const dueno = filasCabecera().find(f => f.jugador === jugador && (f.mascotas ?? []).some(m => m.id === idMascota));
    return dueno ? conectados.find(p => p.jugador === jugador && p.id === dueno.id && !p.mascota)?.instancia ?? null : null;
}
async function pedirMascota(jugador, idMascota) {
    reproducir("click");
    const instancia = instanciaDuenoDe(jugador, idMascota);
    if (!instancia) {
        ctx.aviso("Mascota", ["Su dueño no está conectado: solo se puede editar con él en la sala."]);
        return;
    }
    clearTimeout(mascotaPedida?.temporizador);
    mascotaPedida = {
        id: idMascota,
        temporizador: setTimeout(() => {
            mascotaPedida = null;
            ctx.aviso("Mascota", ["Su dueño no responde. Vuelve a intentarlo más tarde."]);
        }, MS_ESPERA_MASCOTA)
    };
    try {
        await emitirPrivado("pedirMascota", { para: instancia, id: idMascota });
    } catch (error) {
        clearTimeout(mascotaPedida?.temporizador);
        mascotaPedida = null;
        ctx.aviso("Mascota", [mensajeErrorOnline(error)]);
    }
}

/* Cristales de un personaje de un jugador (botón de su fila en la cabecera) */
function abrirMascotasMaster(jugador, id) {
    const fila = filasCabecera().find(f => f.jugador === jugador && f.id === id);
    const mascotas = fila?.mascotas ?? [];
    if (mascotas.length === 1) {
        pedirMascota(jugador, mascotas[0].id);
        return;
    }
    reproducir("click");
    el("modalMascotasMasterLabel").textContent = `Mascotas de ${fila?.nombre || "Sin nombre"}`;
    el("listaMascotasMaster").dataset.jugador = jugador;
    el("listaMascotasMaster").innerHTML = mascotas.length ? mascotas.map(m => `
        <div class="fila-objeto" data-id="${escaparHtml(m.id)}">
            <span class="objeto-icono">${iconoSao("cristalMascota")}</span>
            <div class="objeto-info">
                <div class="objeto-cabecera"><span class="objeto-nombre">${escaparHtml(m.nombre || "Sin nombre")}</span></div>
                <div class="objeto-detalle">${[m.invocada ? "Invocada" : "En el cristal", m.agrietado ? "Agrietado" : "",
                    m.pendientes ? `+${m.pendientes} niveles por revisar` : ""].filter(Boolean).map(escaparHtml).join(" · ")}</div>
            </div>
            <div class="objeto-acciones">
                <button type="button" class="btn-objeto" data-accion="editar" title="Editar" aria-label="Editar">${iconoSao("editar")}</button>
            </div>
        </div>`).join("") : `<p class="lista-vacia">Sin mascotas.</p>`;
    bootstrap.Modal.getOrCreateInstance(el("modalMascotasMaster")).show();
}

function inicializarMascotasMaster() {
    el("perfilMasterDueno").addEventListener("click", (e) => {
        const boton = e.target.closest("[data-dueno]");
        if (!boton || boton.disabled || !mascotaEditada) return;
        reproducir("click");
        const dueno = posiblesDuenos().find(d => d.instancia === boton.dataset.dueno);
        if (dueno) mascotaEditada.dueno = dueno;
        el("avisoPerfilMaster").textContent = "";
        pintarPerfil();
    });
    el("btnQuitarMascotaPerfil").addEventListener("click", async () => {
        const m = mascotaEditada;
        if (!m?.id || !m.original) return;
        reproducir("click");
        const ok = await ctx.confirmar({ titulo: "Quitar la mascota", texto: `${borrador.nombre || "La mascota"} desaparecerá de los objetos clave de ${m.dueno?.nombre || "su dueño"}. ¿Seguir?` });
        if (!ok) return;
        try {
            await emitirPrivado("mascotaQuitada", { para: m.original, id: m.id });
        } catch (error) {
            el("avisoPerfilMaster").textContent = mensajeErrorOnline(error);
            return;
        }
        mascotaEditada = null;
        bootstrap.Modal.getOrCreateInstance(el("modalPerfilMaster")).hide();
    });
    el("listaMascotasMaster").addEventListener("click", (e) => {
        const id = e.target.closest('button[data-accion="editar"]')?.closest("[data-id]")?.dataset.id;
        if (!id) return;
        const jugador = el("listaMascotasMaster").dataset.jugador;
        const ventana = el("modalMascotasMaster");
        ventana.addEventListener("hidden.bs.modal", () => pedirMascota(jugador, id), { once: true });
        bootstrap.Modal.getOrCreateInstance(ventana).hide();
    });
    // El dueño responde con el cristal (al día): se abre en el perfil
    registrarManejador("mascotaDatos", (evento) => {
        const d = evento.datos ?? {};
        if (!mascotaPedida || String(d.id ?? "") !== mascotaPedida.id) return;
        clearTimeout(mascotaPedida.temporizador);
        mascotaPedida = null;
        if (d.error) {
            ctx.aviso("Mascota", [String(d.error).slice(0, 200)]);
            return;
        }
        const [cristal] = cargarObjetosClave([d.objetoClave]);
        if (!cristal?.mascota) {
            ctx.aviso("Mascota", ["La mascota recibida no es válida."]);
            return;
        }
        abrirPerfilMaster({
            mascotaDe: {
                json: cristal.mascota.json,
                cristal: { nombre: cristal.nombre, descripcion: cristal.descripcion, agrietado: cristal.mascota.agrietado },
                dueno: { instancia: String(d.dueno?.instancia ?? evento.instancia), jugador: evento.jugador, nombre: String(d.dueno?.nombre ?? evento.personaje ?? "") }
            }
        });
    });
}
