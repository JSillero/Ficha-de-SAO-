/* Interfaz de la parte online: ventanas de cuenta, sala, personajes en la nube y social (amigos, grupo,
 * solicitudes y barras del grupo en la cabecera).
 * La lógica de red está en online/servicio.js; aquí solo hay DOM. interfaz.js llama a inicializarOnline
 * con lo que necesita de la ficha (contexto) y añade las opciones al menú de opciones. */
import * as servicio from "./online/servicio.js";
import { configurarOrigen, setPublicador, recibirEvento, emitirPrivado, registrarManejador } from "./eventos.js";
import { escaparHtml } from "./html.js";
import { iconoSao } from "./iconos.js";
import { ESTADOS_INFO, estiloColor } from "./estados.js";
import { reproducir } from "./sonidos.js";
import { getInstancia, instanciaLista } from "./instancia.js";
import { cargarResumenFicha } from "./resumenFicha.js";

/**
 * @typedef {Object} ContextoOnline
 * @property {boolean} [modoMaster]          en master no se recuerda el personaje de la nube abierto
 * @property {() => object} personaje          la instancia de PJ actual
 * @property {(datos: object, opciones?: { idNube?: string }) => (void|Promise)} cargarFicha  carga un JSON ya parseado
 *           (como el de un fichero); en modo máster lo añade a sus personajes
 * @property {(pregunta: { titulo: string, texto: string }) => Promise<boolean>} confirmar  ventana sí / no (confirmarSao)
 * @property {object} [master]  modo máster (interfazMaster.js): pendientesDeNube() y marcarSubido(id, idNube, json)
 * @property {() => void} marcarGuardado
 * @property {() => boolean} hayCambiosSinGuardar
 * @property {(titulo: string, lineas: string[]) => void} aviso  pop-up informativo (texto plano)
 * @property {(estado: object) => void} alCambiarEstado
 * @property {(artes: object[]) => void} alCambiarArtesSala
 * @property {(personajes: object[]) => void} [alCambiarPersonajes]  personajes conectados (para ofrecer objetos)
 * @property {() => void} actualizar            repinta la ficha (actualizarTodo) tras cambiar los amigos
 * @property {(grupo: object|null) => void} [alCambiarGrupo]  tu grupo (para el menú Social)
 * @property {() => object} resumenPropio       tu ficha resumida (resumenFicha.js), para enviarla a un compañero
 * @property {(titulo: string, contenido: object|string) => void} mostrarFichaResumen  ventana de la ficha resumida
 */
/** @type {ContextoOnline} */
let ctx;
/* Personaje de la nube que hay cargado (para guardar encima), o null.
   Se recuerda con la ficha (salvo en modo master): en sessionStorage (propio de cada pestaña, para tener
   varios personajes a la vez) y en localStorage (el último, para una pestaña nueva). */
const CLAVE_ID_NUBE = "fichaSAO.idNube";
let idPersonajeNube = null;

function cambiarIdNube(id) {
    idPersonajeNube = id;
    if (ctx?.modoMaster) return;
    for (const almacen of [sessionStorage, localStorage]) {
        try { id ? almacen.setItem(CLAVE_ID_NUBE, id) : almacen.removeItem(CLAVE_ID_NUBE); } catch { /* sin almacenamiento */ }
    }
}

function leerIdNube() {
    for (const almacen of [sessionStorage, localStorage]) {
        try {
            const id = almacen.getItem(CLAVE_ID_NUBE);
            if (id) return id;
        } catch { /* sin almacenamiento */ }
    }
    return null;
}
let ocupado = false;

/* Inactividad: se comprueba en local (sin peticiones) al volver a la pestaña y cada tanto */
const MINUTOS_COMPROBAR_INACTIVIDAD = 10;
/* Cambio de nombre del personaje: se publica en la sala tras este rato sin cambios (una escritura, no una por tecla) */
const RETARDO_NOMBRE_MS = 3000;
let temporizadorNombre = null;
let ultimoIdAvisado = null;

const el = (id) => document.getElementById(id);
const formatoFecha = new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" });

export const getEstadoOnline = () => servicio.getEstado();
/** Personajes de la sala a los que se puede ofrecer algo: [{ jugador, instancia, nombre }]
 *  (sin el de esta pestaña ni los ocultos) */
export const getPersonajesSala = () => servicio.getPersonajesSala()
    .filter(p => !esDeEstaPestana(p.instancia) && !p.oculto);
/* ¿Es un personaje de esta pestaña? (en modo máster, cualquiera de los suyos) */
const esDeEstaPestana = (instancia) => instancia === getInstancia() || servicio.esInstanciaPropia(instancia);
export const setIdPersonajeNube = (id) => cambiarIdNube(id);

/**
 * ¿Se puede usar este nombre en la sala? Devuelve el motivo si no, o null. Los nombres son únicos en la sala:
 * uno de otro usuario (aunque esté desconectado) no se puede usar; uno tuyo sí (se sobrescribe). Sin sala, libre.
 */
export function motivoNombreNoDisponible(nombre) {
    return servicio.getEstado().sala ? servicio.motivoNombre(nombre) : null;
}

/** La ficha avisa de su personaje (nombre e idPersonaje, en cada actualizarTodo); solo se publica si cambia, con retardo */
export function avisarNombrePersonaje(nombre, id) {
    clearTimeout(temporizadorNombre);
    // Cambiar de personaje (modo máster) se aplica ya: los eventos y el grupo van con el personaje de la ficha
    if (id !== ultimoIdAvisado) {
        ultimoIdAvisado = id;
        servicio.configurarPersonaje({ id });
    }
    temporizadorNombre = setTimeout(() => servicio.configurarPersonaje({ nombre, id }), RETARDO_NOMBRE_MS);
}

/**
 * Modo máster en su sala: lo que necesita la cabecera, o null si no lleva la sala como máster.
 * { uid, registro: { uid: { id: { nombre } } }, estados: { id: {...} }, conectados: Set("uid|id") }
 */
export function getSalaMaster() {
    const { usuario, sala } = servicio.getEstado();
    if (!ctx?.modoMaster || !usuario || !sala || sala.master !== usuario.uid) return null;
    return {
        uid: usuario.uid,
        registro: servicio.getRegistroSala(),
        estados: servicio.getEstadosSala(),
        conectados: new Set(servicio.getPersonajesSala().filter(p => p.id).map(p => `${p.jugador}|${p.id}`)),
        ocultos: new Set(sala.ocultos ?? [])
    };
}
/** Modo máster: oculta o muestra un personaje (como en la ventana de la sala) */
export const ocultarPersonajeSala = (jugador, nombre, ocultar) => servicio.cambiarOculto(jugador, nombre, ocultar);
export const claveOcultoSala = (jugador, nombre) => servicio.claveOculto(jugador, nombre);
/** ¿El máster ha ocultado a este personaje tuyo (por su nombre)? Los ocultos no empiezan turno a la vez ni lo provocan. */
export function estaOcultoEnSala(nombre) {
    const { usuario, sala } = servicio.getEstado();
    return Boolean(usuario && sala) && (sala.ocultos ?? []).includes(servicio.claveOculto(usuario.uid, nombre));
}
export const publicarPersonajesMaster = (lista) => servicio.publicarPersonajesMaster(lista)
    .catch(error => console.warn("No se pudieron poner tus personajes en la sala:", error));
export const echarPersonajeSala = (jugador, id) => servicio.echarPersonaje(jugador, id);
/** Motivo por el que un nombre no puede estar en la sala según un registro (el de la sala si no se pasa) */
export const motivoNombreSala = (nombre, registro) => servicio.motivoNombre(nombre, registro);
export const mensajeErrorOnline = (error) => servicio.mensajeError(error);

export async function inicializarOnline(contexto) {
    ctx = contexto;
    // Modo máster: en su sala entran sus personajes de la sesión, no la pestaña
    if (ctx.modoMaster && ctx.master?.proveedorSala) servicio.configurarMaster(ctx.master.proveedorSala);
    if (!ctx.modoMaster) idPersonajeNube = leerIdNube();
    inicializarCuenta();
    inicializarSala();
    inicializarPersonajesNube();

    servicio.alCambiarEstado(estado => {
        // Los pop-ups que se emitan llevan el nombre del personaje (no el del usuario); con sala, se envían
        configurarOrigen({ jugador: estado.usuario?.uid ?? null, oculto: servicio.personajeLocalOculto,
            esMaster: servicio.soyMasterSala, enMiGrupo: (otra) => servicio.enMiGrupo(otra),
            instancia: servicio.instanciaActual, esPropia: servicio.esInstanciaPropia });
        setPublicador(estado.sala ? servicio.publicarEvento : null);
        if (!estado.usuario && idPersonajeNube) cambiarIdNube(null);
        pintarCuenta();
        pintarSala();
        ctx.alCambiarEstado(estado);
    });
    servicio.alRecibirEvento(recibirEvento);
    servicio.alCambiarArtesSala(artes => ctx.alCambiarArtesSala(artes));
    servicio.alCambiarPersonajes(lista => {
        ctx.alCambiarPersonajes?.(lista);
        if (el("modalSala").classList.contains("show")) pintarJugadores();
        // Conectados / desconectados del grupo y quién se puede invitar o añadir
        actualizarHudGrupo();
        if (el("modalGrupo").classList.contains("show")) pintarGrupo();
        if (el("modalAnadirAmigo").classList.contains("show")) pintarAnadirAmigo();
    });
    servicio.alCambiarEstadosSala(() => ctx.alCambiarEstadosSala?.());
    servicio.alCambiarGrupo(grupo => {
        actualizarHudGrupo();
        if (el("modalGrupo").classList.contains("show")) pintarGrupo();
        ctx.alCambiarGrupo?.(grupo);
    });
    servicio.alSalirGrupo(({ motivo, nombre, propio }) => {
        const quien = propio === false ? nombre || "Tu personaje" : null;
        ctx.aviso("Grupo", [motivo === "echado"
            ? (quien ? `El líder ha sacado a ${quien} del grupo.` : "El líder te ha sacado del grupo.")
            : (quien ? `El grupo de ${quien} se ha disuelto.` : "El grupo se ha disuelto.")]);
    });
    inicializarSocial();
    servicio.alSalirSala(({ motivo, nombre, detalle }) => {
        if (motivo === "expulsado") {
            ctx.aviso("Sala", [`El máster te ha sacado de ${nombre}.`, "Puedes volver a entrar desde Tus salas."]);
        } else if (motivo === "nombre") {
            ctx.aviso("Sala", [`Has salido de ${nombre}: ${detalle}`, "Cambia el nombre de tu personaje para volver a entrar."]);
        } else {
            ctx.aviso("Sala", [`Has salido de ${nombre} por inactividad (${servicio.HORAS_INACTIVIDAD_SALA} h sin hacer nada).`,
                "Puedes volver a entrar desde Tus salas."]);
        }
    });

    // Inactividad (local) y cierre de la pestaña (quita su personaje de la sala)
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") servicio.comprobarInactividad();
    });
    setInterval(() => servicio.comprobarInactividad(), MINUTOS_COMPROBAR_INACTIVIDAD * 60 * 1000);
    window.addEventListener("pagehide", () => servicio.alCerrarPestana());
    // Diagnóstico: con ?debug, fichaProbarDesconexion() en la consola prueba la petición de cerrar la pestaña
    if (new URLSearchParams(location.search).has("debug")) {
        window.fichaProbarDesconexion = () => servicio.probarDesconexion().then(resultado => { console.info(resultado); return resultado; });
    }

    // La instancia de esta pestaña tiene que estar comprobada (pestaña duplicada) antes de entrar en la sala
    servicio.configurarPersonaje({ instancia: await instanciaLista, nombre: ctx.personaje().nombre, id: ctx.personaje().idPersonaje });
    servicio.iniciar();
}

function abrir(id) {
    const ventana = el(id);
    ventana.dataset.sinSonidoAbrir = "1"; // ya ha sonado el clic del menú
    bootstrap.Modal.getOrCreateInstance(ventana).show();
}

function cerrar(id) {
    bootstrap.Modal.getInstance(el(id))?.hide();
}

/* Ejecuta una operación de red con el aviso de la ventana; evita dobles clics */
async function operar(idAviso, operacion) {
    if (ocupado) return;
    ocupado = true;
    el(idAviso).textContent = "";
    document.body.classList.add("online-ocupado");
    try {
        return await operacion();
    } catch (error) {
        console.warn(error);
        el(idAviso).textContent = servicio.mensajeError(error);
    } finally {
        ocupado = false;
        document.body.classList.remove("online-ocupado");
    }
}

/* Cuenta ______________________________________________________________________ */

let modoRegistro = false;

export function abrirCuenta() {
    el("avisoSesion").textContent = "";
    pintarCuenta();
    abrir("modalCuenta");
}

function pintarCuenta() {
    const { usuario } = servicio.getEstado();
    el("formSesion").hidden = Boolean(usuario);
    el("panelCuenta").hidden = !usuario;
    el("btnAceptarSesion").hidden = Boolean(usuario);
    if (usuario) {
        el("modalCuentaLabel").textContent = "Cuenta";
        el("cuentaNombre").textContent = usuario.nombre;
        el("cuentaEmail").textContent = usuario.email ? `(${usuario.email})` : "";
        el("cuentaNuevoNombre").value = usuario.nombre;
        return;
    }
    const titulo = modoRegistro ? "Crear cuenta" : "Iniciar sesión";
    el("modalCuentaLabel").textContent = titulo;
    el("btnAceptarSesion").title = titulo;
    el("btnAceptarSesion").setAttribute("aria-label", titulo);
    el("btnCambiarModoSesion").textContent = modoRegistro ? "Ya tengo cuenta" : "Crear una cuenta";
    el("btnRecuperarContrasena").hidden = modoRegistro;
    document.querySelectorAll("[data-solo-registro]").forEach(campo => { campo.hidden = !modoRegistro; });
    el("sesionContrasena").autocomplete = modoRegistro ? "new-password" : "current-password";
}

function inicializarCuenta() {
    el("btnCambiarModoSesion").addEventListener("click", () => {
        reproducir("click");
        modoRegistro = !modoRegistro;
        el("avisoSesion").textContent = "";
        pintarCuenta();
    });

    el("formSesion").addEventListener("submit", (e) => {
        e.preventDefault();
        reproducir("click");
        const email = el("sesionEmail").value.trim();
        const contrasena = el("sesionContrasena").value;
        const nombre = el("sesionNombre").value.trim();
        if (modoRegistro && !nombre) {
            el("avisoSesion").textContent = "Escribe tu nombre de jugador.";
            return;
        }
        operar("avisoSesion", async () => {
            if (modoRegistro) await servicio.registrarse(email, contrasena, nombre);
            else await servicio.iniciarSesion(email, contrasena);
            el("sesionContrasena").value = "";
            cerrar("modalCuenta");
            ctx.aviso("Sesión iniciada", [`Hola, ${servicio.getEstado().usuario.nombre}. Ya puedes entrar en una sala.`]);
        });
    });

    el("btnRecuperarContrasena").addEventListener("click", () => {
        reproducir("click");
        const email = el("sesionEmail").value.trim();
        if (!email) {
            el("avisoSesion").textContent = "Escribe tu correo y vuelve a pulsar.";
            return;
        }
        operar("avisoSesion", async () => {
            await servicio.recuperarContrasena(email);
            el("avisoSesion").textContent = `Te hemos enviado un correo a ${email} para cambiar la contraseña.`;
        });
    });

    el("btnCambiarNombre").addEventListener("click", () => {
        reproducir("click");
        const nombre = el("cuentaNuevoNombre").value.trim();
        if (!nombre) return;
        operar("avisoSesion", () => servicio.cambiarNombre(nombre));
    });

    el("btnCerrarSesion").addEventListener("click", () => {
        reproducir("click");
        operar("avisoSesion", async () => {
            await servicio.cerrarSesion();
            cerrar("modalCuenta");
        });
    });
}

/* Sala ________________________________________________________________________ */

export function abrirSala() {
    el("avisoSala").textContent = "";
    pintarSala();
    pintarMisSalas();
    abrir("modalSala");
    pintarJugadores();
}

function pintarSala() {
    const { sala } = servicio.getEstado();
    el("salaActual").hidden = !sala;
    if (!sala) return;
    el("salaActualNombre").textContent = sala.nombre;
    el("salaActualCodigo").textContent = sala.codigo;
    if (el("modalSala").classList.contains("show")) pintarJugadores();
}

/* Jugadores conectados y sus personajes. Es el único sitio donde sale el nombre de usuario (se lee de la
 * nube solo aquí, al abrir la ventana, y queda en caché). El máster ve también los ocultos y puede ocultar
 * y mostrar personajes o echar a un jugador; los demás no ven los ocultos. */
let pintandoJugadores = 0;
async function pintarJugadores() {
    const lista = el("listaJugadoresSala");
    const { sala, usuario } = servicio.getEstado();
    if (!sala || !usuario) return;
    const soyMaster = sala.master === usuario.uid;
    const personajes = servicio.getPersonajesSala().filter(p => soyMaster || !p.oculto || p.jugador === usuario.uid);
    const porJugador = new Map();
    personajes.forEach(p => porJugador.set(p.jugador, [...(porJugador.get(p.jugador) ?? []), p]));
    if (!porJugador.size) {
        lista.innerHTML = `<p class="lista-vacia">No hay nadie conectado.</p>`;
        return;
    }
    const turno = ++pintandoJugadores;
    let nombres = {};
    try {
        nombres = await servicio.nombresUsuarios([...porJugador.keys()]);
    } catch (error) {
        console.warn(error);
    }
    if (turno !== pintandoJugadores) return; // ha llegado otro cambio mientras tanto

    const filaPersonaje = (p) => `
        <div class="fila-online personaje-sala${p.oculto ? " oculto" : ""}">
            <span class="nombre-online">${escaparHtml(p.nombre || "Sin nombre")}
                <span class="texto-online-secundario">${p.instancia === getInstancia() ? "esta pestaña" : ""}${p.oculto ? `${p.instancia === getInstancia() ? " · " : ""}oculto` : ""}</span>
            </span>
            ${soyMaster ? `<button type="button" class="btn-cabecera" data-accion="ocultar" data-jugador="${escaparHtml(p.jugador)}"
                data-nombre="${escaparHtml(p.nombre)}" data-oculto="${p.oculto ? "1" : ""}">${p.oculto ? "Mostrar" : "Ocultar"}</button>` : ""}
        </div>`;
    lista.innerHTML = [...porJugador.entries()]
        .sort(([a], [b]) => (a === sala.master ? -1 : b === sala.master ? 1 : (nombres[a] ?? "").localeCompare(nombres[b] ?? "")))
        .map(([jugador, suyos]) => `
            <div class="jugador-sala">
                <div class="fila-online">
                    <span class="nombre-online">${escaparHtml(nombres[jugador] ?? "Jugador")}
                        <span class="texto-online-secundario">${jugador === sala.master ? "máster" : ""}${jugador === usuario.uid ? `${jugador === sala.master ? " · " : ""}tú` : ""}</span>
                    </span>
                    ${soyMaster && jugador !== usuario.uid ? `<button type="button" class="btn-cabecera btn-online-peligro" data-accion="echar"
                        data-jugador="${escaparHtml(jugador)}" data-nombre="${escaparHtml(nombres[jugador] ?? "Jugador")}">Echar</button>` : ""}
                </div>
                ${suyos.map(filaPersonaje).join("")}
            </div>`).join("");
}

async function pintarMisSalas() {
    const lista = el("listaMisSalas");
    lista.innerHTML = `<p class="lista-vacia">Cargando…</p>`;
    try {
        const salas = await servicio.misSalas();
        const actual = servicio.getEstado().sala?.codigo;
        const { uid } = servicio.getEstado().usuario ?? {};
        lista.innerHTML = salas.length ? salas.map(sala => `
            <div class="fila-online" data-codigo="${escaparHtml(sala.codigo)}">
                <span class="nombre-online">${escaparHtml(sala.nombre)}
                    <span class="texto-online-secundario">${escaparHtml(sala.codigo)}${sala.master === uid ? " · eres el máster" : ""}</span>
                </span>
                ${sala.codigo === actual
                    ? `<span class="texto-online-secundario">Estás aquí</span>`
                    : `<button type="button" class="btn-cabecera" data-accion="entrar">Entrar</button>`}
            </div>`).join("")
            : `<p class="lista-vacia">Aún no has entrado en ninguna sala.</p>`;
    } catch (error) {
        lista.innerHTML = `<p class="lista-vacia">${escaparHtml(servicio.mensajeError(error))}</p>`;
    }
}

function entrar(operacion) {
    operar("avisoSala", async () => {
        const { sala } = await operacion();
        el("salaCodigo").value = "";
        el("salaNombreNueva").value = "";
        cerrar("modalSala");
        ctx.aviso("Sala", [`Has entrado en ${sala.nombre} (código ${sala.codigo}).`, "Tus tiradas y artes se verán en la sala."]);
    });
}

function inicializarSala() {
    el("formEntrarSala").addEventListener("submit", (e) => {
        e.preventDefault();
        reproducir("click");
        entrar(() => servicio.entrarSala(el("salaCodigo").value));
    });
    el("formCrearSala").addEventListener("submit", (e) => {
        e.preventDefault();
        reproducir("click");
        const nombre = el("salaNombreNueva").value.trim();
        if (!nombre) {
            el("avisoSala").textContent = "Ponle un nombre a la sala.";
            return;
        }
        entrar(() => servicio.crearSala(nombre));
    });
    el("listaMisSalas").addEventListener("click", (e) => {
        const codigo = e.target.closest('button[data-accion="entrar"]')?.closest("[data-codigo]")?.dataset.codigo;
        if (!codigo) return;
        reproducir("click");
        entrar(() => servicio.entrarSala(codigo));
    });
    el("listaJugadoresSala").addEventListener("click", (e) => {
        const boton = e.target.closest("button[data-accion]");
        if (!boton) return;
        reproducir("click");
        const { jugador, nombre } = boton.dataset;
        if (boton.dataset.accion === "ocultar") {
            operar("avisoSala", () => servicio.cambiarOculto(jugador, nombre, !boton.dataset.oculto));
        } else if (boton.dataset.accion === "echar") {
            if (!confirm(`¿Echar a ${nombre} de la sala? Podrá volver a entrar.`)) return;
            operar("avisoSala", () => servicio.expulsar(jugador));
        }
    });
    el("btnSalirSala").addEventListener("click", () => {
        reproducir("click");
        servicio.salirSala();
        pintarMisSalas();
    });
    el("btnCopiarCodigoSala").addEventListener("click", async () => {
        reproducir("click");
        const codigo = servicio.getEstado().sala?.codigo;
        try {
            await navigator.clipboard.writeText(codigo);
            el("avisoSala").textContent = `Código ${codigo} copiado.`;
        } catch {
            el("avisoSala").textContent = `Código: ${codigo}`;
        }
    });
}

/* Personajes en la nube _______________________________________________________ */

export async function guardarEnNube() {
    if (ctx.modoMaster) return guardarMasterEnNube();
    const pj = ctx.personaje();
    await operar("avisoPersonajesNube", async () => {
        let id = idPersonajeNube;
        // Ficha que no viene de la nube: si ya hay uno con el mismo nombre, se puede guardar encima
        if (!id) {
            const mismo = (await servicio.listarPersonajes()).find(p => p.nombre === pj.nombre);
            if (mismo && confirm(`Ya tienes un personaje llamado "${pj.nombre}" en la nube. ¿Guardar encima?\n\nCancelar lo guarda como uno nuevo.`)) {
                id = mismo.id;
            }
        }
        const json = pj.toJSONString();
        cambiarIdNube(await servicio.guardarPersonaje(json, pj.nombre, id));
        // En una sala, el máster ve esta versión en modo lectura cuando no estás conectado
        if (servicio.getEstado().sala) servicio.guardarFichaSala(json).catch(error => console.warn("No se pudo dejar tu ficha en la sala:", error));
        ctx.marcarGuardado();
        ctx.aviso("Guardado en la nube", [pj.nombre]);
    });
    const error = el("avisoPersonajesNube").textContent;
    if (error) ctx.aviso("No se pudo guardar en la nube", [error]);
}

/* Modo máster: sube todos sus personajes que han cambiado desde la última vez, cada uno como un personaje de
   la nube normal (una escritura por personaje). Si uno no viene de la nube y ya hay otro con su nombre, pregunta. */
async function guardarMasterEnNube() {
    const master = ctx.master;
    const pendientes = master.pendientesDeNube();
    if (!pendientes.length) {
        ctx.aviso("Guardado en la nube", ["No hay cambios que subir."]);
        return;
    }
    const subidos = [];
    await operar("avisoPersonajesNube", async () => {
        const enNube = await servicio.listarPersonajes();
        for (const p of pendientes) {
            const nombre = p.resumen?.nombre || "Sin nombre";
            let id = p.idNube;
            if (!id) {
                const mismo = enNube.find(n => n.nombre === nombre);
                if (mismo && await ctx.confirmar({
                    titulo: "Guardar en la nube",
                    texto: `Ya tienes un personaje llamado "${nombre}" en la nube. ¿Guardar encima? Si no, se guarda como uno nuevo.`
                })) id = mismo.id;
            }
            master.marcarSubido(p.id, await servicio.guardarPersonaje(p.json, nombre, id), p.json);
            subidos.push(nombre);
        }
    });
    const error = el("avisoPersonajesNube").textContent;
    if (subidos.length) ctx.aviso("Guardado en la nube", subidos);
    if (error) ctx.aviso("No se pudo guardar en la nube", [error]);
}

export function abrirPersonajesNube() {
    el("avisoPersonajesNube").textContent = "";
    pintarPersonajesNube();
    abrir("modalPersonajesNube");
}

async function pintarPersonajesNube() {
    const lista = el("listaPersonajesNube");
    lista.innerHTML = `<p class="lista-vacia">Cargando…</p>`;
    try {
        const personajes = await servicio.listarPersonajes();
        lista.innerHTML = personajes.length ? personajes.map(p => `
            <div class="fila-online" data-id="${escaparHtml(p.id)}">
                <span class="nombre-online">${escaparHtml(p.nombre || "Sin nombre")}
                    <span class="texto-online-secundario">${p.actualizado ? formatoFecha.format(p.actualizado) : ""}${p.id === idPersonajeNube ? " · abierto" : ""}</span>
                </span>
                <button type="button" class="btn-cabecera" data-accion="cargar">Cargar</button>
                <button type="button" class="btn-cabecera btn-online-peligro" data-accion="borrar">Borrar</button>
            </div>`).join("")
            : `<p class="lista-vacia">No tienes personajes en la nube. Usa "Guardar en la nube" en el menú de opciones.</p>`;
    } catch (error) {
        lista.innerHTML = `<p class="lista-vacia">${escaparHtml(servicio.mensajeError(error))}</p>`;
    }
}

function inicializarPersonajesNube() {
    el("listaPersonajesNube").addEventListener("click", (e) => {
        const boton = e.target.closest("button[data-accion]");
        const fila = boton?.closest("[data-id]");
        if (!fila) return;
        reproducir("click");
        const { id } = fila.dataset;
        const nombre = fila.querySelector(".nombre-online").firstChild.textContent.trim();

        if (boton.dataset.accion === "cargar") {
            // En modo máster no se pierde nada: el cargado se añade a sus personajes (o sustituye al mismo)
            if (!ctx.modoMaster && ctx.hayCambiosSinGuardar() && !confirm("La ficha actual tiene cambios sin guardar. ¿Cargar otro personaje y perderlos?")) return;
            operar("avisoPersonajesNube", async () => {
                const json = await servicio.cargarPersonaje(id);
                // Cerrada del todo antes de cargar (al cargar puede salir una pregunta)
                const ventana = el("modalPersonajesNube");
                await new Promise(resolver => {
                    ventana.addEventListener("hidden.bs.modal", resolver, { once: true });
                    cerrar("modalPersonajesNube");
                });
                await ctx.cargarFicha(JSON.parse(json), { idNube: id });
                cambiarIdNube(id);
            });
        } else if (boton.dataset.accion === "borrar") {
            if (!confirm(`¿Borrar ${nombre} de la nube? No se puede deshacer.`)) return;
            operar("avisoPersonajesNube", async () => {
                await servicio.borrarPersonaje(id);
                if (id === idPersonajeNube) cambiarIdNube(null);
                await pintarPersonajesNube();
            });
        }
    });
}

/* Catálogo de la sala _________________________________________________________ */

/**
 * Comparte un arte en el catálogo de la sala. Si ya salió de un arte compartida tuya, la actualiza.
 * Devuelve el id del arte en el catálogo, o null si no se pudo (y avisa).
 * @param {object} arte
 * @param {{ id: string, autor: string }[]} artesSala lista actual de la sala
 */
export async function compartirArte(arte, artesSala) {
    const { usuario } = servicio.getEstado();
    const propia = artesSala.find(a => a.id === arte.idCatalogo && a.autor === usuario?.uid);
    try {
        const id = await servicio.guardarArteSala(arte, propia?.id ?? null);
        ctx.aviso("Arte compartida", [`${arte.nombre} está en el catálogo de la sala.`]);
        return id;
    } catch (error) {
        ctx.aviso("No se pudo compartir", [servicio.mensajeError(error)]);
        return null;
    }
}

export async function quitarArteDeSala(id, nombre) {
    try {
        await servicio.borrarArteSala(id);
        ctx.aviso("Arte quitada de la sala", [nombre]);
    } catch (error) {
        ctx.aviso("No se pudo quitar", [servicio.mensajeError(error)]);
    }
}

/* Social: amigos _____________________________________________________________
 * Los amigos son del personaje (personaje.amigos = [{ jugador, nombre }], se guardan con la ficha) y la amistad
 * es mutua. Solicitudes y respuestas son eventos privados (eventos.js): sin escrituras aparte en la nube. */

const enSala = () => Boolean(servicio.getEstado().sala && servicio.getEstado().usuario);
const AVISO_SIN_SALA = "Entra en una sala (menú de opciones → Online) para usar amigos y grupos.";

/* Personaje de esta pestaña al que va algo (instancia "para" de un evento): en modo máster puede ser uno suyo que
   no está en la ficha (ctx.leerPersonaje / ctx.conPersonaje lo cargan del almacén y lo guardan) */
const personajeDe = (para) => ctx.leerPersonaje?.(para) ?? ctx.personaje();
const esAmigo = (jugador, nombre, para) => personajeDe(para).amigos.some(a => a.jugador === jugador && a.nombre === nombre);
/* Texto " (a X)" cuando va a un personaje del máster que no es el de la ficha */
/* Para emitir la respuesta en nombre del personaje al que iba (instancia y nombre), no del de la ficha */
const como = (para) => (esDeEstaPestana(para) ? { instancia: para, personaje: personajeDe(para).nombre || "" } : {});
const paraQuien = (para) => {
    const pj = personajeDe(para);
    return pj !== ctx.personaje() ? ` (a ${pj.nombre || "Sin nombre"})` : "";
};

function anadirAmigo(jugador, nombre, para) {
    nombre = String(nombre ?? "").trim();
    if (!jugador || !nombre || esAmigo(jugador, nombre, para)) return;
    if (ctx.conPersonaje) ctx.conPersonaje(para, pj => pj.amigos.push({ jugador, nombre }));
    else {
        ctx.personaje().amigos.push({ jugador, nombre });
        ctx.actualizar();
    }
    if (el("modalAmigos").classList.contains("show")) pintarAmigos();
}

export function abrirAmigos() {
    el("avisoAmigos").textContent = "";
    pintarAmigos();
    abrir("modalAmigos");
}

function pintarAmigos() {
    const amigos = ctx.personaje().amigos;
    const conectados = new Set(servicio.getPersonajesSala().map(p => servicio.claveOculto(p.jugador, p.nombre)));
    el("listaAmigos").innerHTML = amigos.length ? amigos.map((amigo, i) => `
        <div class="fila-online${conectados.has(servicio.claveOculto(amigo.jugador, amigo.nombre)) ? "" : " desconectado"}" data-index="${i}">
            <span class="nombre-online">${escaparHtml(amigo.nombre)}</span>
            <button type="button" class="btn-cabecera btn-online-peligro" data-accion="quitar">Quitar</button>
        </div>`).join("")
        : `<p class="lista-vacia">Aún no tienes amigos. Usa Social → Amigos → Añadir amigo.</p>`;
}

export function abrirAnadirAmigo() {
    if (!enSala()) {
        ctx.aviso("Añadir amigo", [AVISO_SIN_SALA]);
        return;
    }
    el("avisoAnadirAmigo").textContent = "";
    pintarAnadirAmigo();
    abrir("modalAnadirAmigo");
}

/* Personajes de la sala que se pueden añadir: no ocultos, no esta pestaña y que aún no son amigos */
const enviadas = new Set();
function pintarAnadirAmigo() {
    const candidatos = servicio.getPersonajesSala()
        .filter(p => p.instancia !== servicio.instanciaActual() && p.instancia !== getInstancia()
            && !p.oculto && p.nombre && !esAmigo(p.jugador, p.nombre));
    el("listaAnadirAmigo").innerHTML = candidatos.length ? candidatos.map(p => `
        <div class="fila-online" data-instancia="${escaparHtml(p.instancia)}">
            <span class="nombre-online">${escaparHtml(p.nombre)}</span>
            ${enviadas.has(p.instancia)
                ? `<span class="texto-online-secundario">Solicitud enviada</span>`
                : `<button type="button" class="btn-cabecera" data-accion="solicitar">Enviar solicitud</button>`}
        </div>`).join("")
        : `<p class="lista-vacia">No hay nadie más en la sala a quien añadir.</p>`;
}

/* Solicitudes recibidas (amistad o grupo): una ventana cada vez, las demás esperan en cola */
const colaSolicitudes = [];
let solicitudActual = null;

function mostrarSolicitud(solicitud) {
    colaSolicitudes.push(solicitud);
    if (!solicitudActual) siguienteSolicitud();
}

function siguienteSolicitud() {
    solicitudActual = colaSolicitudes.shift() ?? null;
    if (!solicitudActual) return;
    el("modalSolicitudLabel").textContent = solicitudActual.titulo;
    el("textoSolicitud").textContent = solicitudActual.texto;
    el("avisoSolicitud").textContent = "";
    bootstrap.Modal.getOrCreateInstance(el("modalSolicitud")).show();
}

function responderSolicitud(aceptar) {
    const solicitud = solicitudActual;
    if (!solicitud || ocupado) return;
    reproducir("click");
    operar("avisoSolicitud", async () => {
        await (aceptar ? solicitud.aceptar() : solicitud.rechazar());
        solicitud.respondida = true;
        cerrar("modalSolicitud");
    });
}

function inicializarSocial() {
    el("listaAmigos").addEventListener("click", (e) => {
        const fila = e.target.closest('button[data-accion="quitar"]')?.closest("[data-index]");
        if (!fila) return;
        reproducir("click");
        const amigo = ctx.personaje().amigos[Number(fila.dataset.index)];
        if (!amigo || !confirm(`¿Quitar a ${amigo.nombre} de tus amigos?`)) return;
        ctx.personaje().amigos.splice(Number(fila.dataset.index), 1);
        ctx.actualizar();
        pintarAmigos();
    });

    el("listaAnadirAmigo").addEventListener("click", (e) => {
        const instancia = e.target.closest('button[data-accion="solicitar"]')?.closest("[data-instancia]")?.dataset.instancia;
        if (!instancia) return;
        reproducir("click");
        // Otro personaje del máster: se hacen amigos directamente (un evento propio no le llega a esta pestaña)
        if (esDeEstaPestana(instancia)) {
            const uid = servicio.getEstado().usuario?.uid;
            const yo = ctx.personaje().nombre;
            const otro = personajeDe(instancia).nombre;
            if (!uid || !yo || !otro) return;
            anadirAmigo(uid, otro, servicio.instanciaActual());
            ctx.conPersonaje(instancia, pj => {
                if (!pj.amigos.some(a => a.jugador === uid && a.nombre === yo)) pj.amigos.push({ jugador: uid, nombre: yo });
            });
            ctx.aviso("Amigos", [`${yo} y ${otro} ya son amigos.`]);
            pintarAnadirAmigo();
            return;
        }
        operar("avisoAnadirAmigo", async () => {
            await emitirPrivado("amistad", { para: instancia });
            enviadas.add(instancia);
            pintarAnadirAmigo();
        });
    });

    // Solicitud de amistad recibida: aceptar añade al amigo en los dos lados
    // (en modo máster puede ir a cualquiera de sus personajes: se le aplica a ese, no al de la ficha)
    registrarManejador("amistad", (evento) => {
        const nombre = String(evento.personaje ?? "").trim();
        const para = evento.datos?.para;
        if (!nombre || !evento.jugador) return;
        if (esAmigo(evento.jugador, nombre, para)) {
            // Ya era amigo (p. ej. lo quitó el otro y lo vuelve a pedir): se acepta sin preguntar
            emitirPrivado("amistadRespuesta", { para: evento.instancia, aceptada: true }, como(para)).catch(() => { /* sin conexión */ });
            return;
        }
        const destino = personajeDe(para);
        mostrarSolicitud({
            titulo: "Solicitud de amistad",
            texto: destino !== ctx.personaje()
                ? `${nombre} quiere ser amigo de ${destino.nombre || "tu personaje"}.`
                : `${nombre} quiere ser tu amigo.`,
            aceptar: async () => {
                await emitirPrivado("amistadRespuesta", { para: evento.instancia, aceptada: true }, como(para));
                anadirAmigo(evento.jugador, nombre, para);
            },
            rechazar: () => emitirPrivado("amistadRespuesta", { para: evento.instancia, aceptada: false }, como(para))
        });
    });

    registrarManejador("amistadRespuesta", (evento) => {
        const nombre = String(evento.personaje ?? "").trim() || "Alguien";
        const para = evento.datos?.para;
        enviadas.delete(evento.instancia);
        if (evento.datos.aceptada === true) {
            anadirAmigo(evento.jugador, nombre, para);
            ctx.aviso("Amigos", [`${nombre} ha aceptado la solicitud de amistad${paraQuien(para)}.`]);
        } else {
            ctx.aviso("Amigos", [`${nombre} ha rechazado la solicitud de amistad${paraQuien(para)}.`]);
        }
        if (el("modalAnadirAmigo").classList.contains("show")) pintarAnadirAmigo();
    });

    // Invitación a un grupo recibida
    registrarManejador("invitacionGrupo", (evento) => {
        const nombre = String(evento.personaje ?? "").trim() || "Alguien";
        const id = String(evento.datos.grupo ?? "");
        const para = evento.datos?.para;
        if (!id) return;
        const responder = (aceptada) => emitirPrivado("invitacionRespuesta", { para: evento.instancia, aceptada }, como(para));
        const destino = personajeDe(para);
        const otro = destino !== ctx.personaje();
        mostrarSolicitud({
            titulo: "Invitación a un grupo",
            texto: otro ? `${nombre} invita a ${destino.nombre || "tu personaje"} a su grupo.` : `${nombre} te invita a su grupo.`,
            aceptar: async () => {
                if (servicio.getGrupo(para)) {
                    const ok = await ctx.confirmar({
                        titulo: "Invitación a un grupo",
                        texto: otro ? `${destino.nombre || "Tu personaje"} ya está en un grupo. ¿Sacarlo y unirlo a este?`
                            : "Ya estás en un grupo. ¿Salir de él y unirte a este?"
                    });
                    if (!ok) return;
                    await servicio.salirDeGrupo({ instancia: para });
                }
                await servicio.unirseAGrupo(id, para);
                await responder(true);
            },
            rechazar: () => responder(false)
        });
    });

    registrarManejador("invitacionRespuesta", (evento) => {
        const nombre = String(evento.personaje ?? "").trim() || "Alguien";
        ctx.aviso("Grupo", [evento.datos.aceptada === true ? `${nombre} se ha unido al grupo.` : `${nombre} ha rechazado la invitación.`]);
    });

    el("btnAceptarSolicitud").addEventListener("click", () => responderSolicitud(true));
    el("btnRechazarSolicitud").addEventListener("click", () => responderSolicitud(false));
    // Cerrar la ventana sin responder (atrás, Escape) cuenta como rechazar
    el("modalSolicitud").addEventListener("hidden.bs.modal", () => {
        const solicitud = solicitudActual;
        if (solicitud && !solicitud.respondida) Promise.resolve(solicitud.rechazar()).catch(() => { /* sin conexión */ });
        siguienteSolicitud();
    });

    inicializarGrupo();
    inicializarFichaResumen();
}

/* Social: grupo ______________________________________________________________
 * Hasta 6 personajes (servicio.js). El líder invita y echa; todos pueden salir. En la cabecera, las barras de
 * los compañeros (sin números); quien no está conectado sale en gris con sus últimos valores. */

let integranteSenalado = null;

const instanciasConectadas = () => new Set(servicio.getPersonajesSala().map(p => p.instancia));

export async function crearGrupo() {
    if (!enSala()) {
        ctx.aviso("Grupo", [AVISO_SIN_SALA]);
        return;
    }
    try {
        await servicio.crearGrupo();
        ctx.aviso("Grupo", ["Grupo creado. Invita a otros personajes desde Social → Grupo → Invitar."]);
    } catch (error) {
        ctx.aviso("No se pudo crear el grupo", [servicio.mensajeError(error)]);
    }
}

export async function salirGrupo() {
    if (!confirm("¿Salir del grupo?")) return;
    try {
        await servicio.salirDeGrupo();
        ctx.aviso("Grupo", ["Has salido del grupo."]);
    } catch (error) {
        ctx.aviso("No se pudo salir del grupo", [servicio.mensajeError(error)]);
    }
}

/** Abre la ventana del grupo; instancia: integrante a señalar (al pulsar su barra) */
export function abrirGrupo(instancia = null) {
    if (!enSala()) {
        ctx.aviso("Grupo", [AVISO_SIN_SALA]);
        return;
    }
    integranteSenalado = instancia;
    el("avisoGrupo").textContent = "";
    pintarGrupo();
    abrir("modalGrupo");
}

function pintarGrupo() {
    const grupo = servicio.getGrupo();
    const lista = el("listaGrupo");
    const enLinea = instanciasConectadas();
    if (!grupo) {
        lista.innerHTML = `
            <p class="lista-vacia">No estás en ningún grupo.</p>
            <div class="fila-online"><button type="button" class="btn-cabecera" data-accion="crear">Crear grupo</button></div>`;
        el("tituloInvitarGrupo").hidden = true;
        el("listaInvitarGrupo").innerHTML = "";
        return;
    }
    lista.innerHTML = grupo.miembros.map(m => {
        const propio = m.instancia === servicio.instanciaActual();
        const detalles = [m.lider ? "líder" : "", propio ? "tú" : "", enLinea.has(m.instancia) ? "" : "desconectado"].filter(Boolean).join(" · ");
        return `
            <div class="fila-online${m.instancia === integranteSenalado ? " senalada" : ""}${enLinea.has(m.instancia) ? "" : " desconectado"}"
                data-instancia="${escaparHtml(m.instancia)}">
                <span class="nombre-online">${escaparHtml(m.nombre || "Sin nombre")}
                    <span class="texto-online-secundario">LV ${m.nivel}${detalles ? ` · ${escaparHtml(detalles)}` : ""}</span>
                </span>
                ${propio ? "" : `<button type="button" class="btn-cabecera" data-accion="ficha">Ficha</button>`}
                ${propio ? `<button type="button" class="btn-cabecera btn-online-peligro" data-accion="salir">Salir</button>`
                    : grupo.soyLider ? `<button type="button" class="btn-cabecera btn-online-peligro" data-accion="echar">Echar</button>` : ""}
            </div>`;
    }).join("") + `<p class="texto-online-secundario">${grupo.miembros.length} / 6 integrantes</p>`;

    // Invitar (solo el líder): personajes visibles de la sala que no están en ningún grupo
    el("tituloInvitarGrupo").hidden = !grupo.soyLider;
    if (!grupo.soyLider) {
        el("listaInvitarGrupo").innerHTML = "";
        return;
    }
    const lleno = grupo.miembros.length >= 6;
    const candidatos = servicio.getPersonajesSala()
        .filter(p => p.instancia !== servicio.instanciaActual() && p.instancia !== getInstancia() && !p.oculto && !p.grupo && p.nombre);
    el("listaInvitarGrupo").innerHTML = lleno
        ? `<p class="lista-vacia">El grupo está lleno.</p>`
        : candidatos.length ? candidatos.map(p => `
            <div class="fila-online" data-instancia="${escaparHtml(p.instancia)}">
                <span class="nombre-online">${escaparHtml(p.nombre)}</span>
                ${grupo.invitados.includes(p.instancia)
                    ? `<span class="texto-online-secundario">Invitado</span>`
                    : `<button type="button" class="btn-cabecera" data-accion="invitar">Invitar</button>`}
            </div>`).join("")
        : `<p class="lista-vacia">No hay nadie libre en la sala para invitar.</p>`;
}

/* Ficha resumida de un compañero ___________________________________________ */
// Se le pide con el evento privado "pedirFicha" y responde con "fichaResumen" (su resumen, resumenFicha.js).
// Solo responde a integrantes de su grupo. No se guarda nada: cada vez que se abre se vuelve a pedir.
const ESPERA_FICHA_MS = 8000;
/* Petición en curso: { instancia, titulo, temporizador }, o null */
let fichaPedida = null;

function cancelarFichaPedida() {
    clearTimeout(fichaPedida?.temporizador);
    fichaPedida = null;
}

/** Abre la ficha resumida de un compañero de grupo (la pide y la muestra al llegar) */
export function verFichaCompanero(instancia) {
    const miembro = servicio.getGrupo()?.miembros.find(m => m.instancia === instancia);
    if (!miembro || esDeEstaPestana(instancia)) return;
    const titulo = `Ficha de ${miembro.nombre || "Sin nombre"}`;
    cancelarFichaPedida();
    if (!instanciasConectadas().has(instancia)) {
        ctx.mostrarFichaResumen(titulo, "Está desconectado: no puede enviar su ficha.");
        return;
    }
    fichaPedida = {
        instancia, titulo,
        temporizador: setTimeout(() => {
            if (fichaPedida?.instancia !== instancia) return;
            fichaPedida = null;
            ctx.mostrarFichaResumen(titulo, "No ha respondido. Prueba otra vez en un momento.");
        }, ESPERA_FICHA_MS)
    };
    ctx.mostrarFichaResumen(titulo, "Pidiendo la ficha…");
    emitirPrivado("pedirFicha", { para: instancia }).catch(error => {
        cancelarFichaPedida();
        ctx.mostrarFichaResumen(titulo, `No se pudo pedir la ficha: ${servicio.mensajeError(error)}`);
    });
}

/* Ficha completa para el modo lectura del máster ______________________________
 * Si el personaje está conectado, se le pide (evento privado pedirFichaCompleta): su pestaña escribe la copia en
 * la sala (fichas/{id}) y avisa (fichaCompletaLista). Si no, o si no responde, se lee la última copia. */
const ESPERA_FICHA_COMPLETA_MS = 8000;
/* Petición en curso: { id, instancia, resolver(ok) }, o null */
let fichaCompletaPedida = null;

/**
 * Modo máster: la ficha de un personaje de un jugador. Devuelve { json, actualizado (ms), aviso } o { error }.
 */
export async function pedirFichaJugador(jugador, id) {
    let aviso = null;
    const instancia = servicio.instanciaDePersonaje(jugador, id);
    if (instancia) {
        fichaCompletaPedida?.resolver(false);
        const respondio = await new Promise(resolver => {
            const temporizador = setTimeout(() => terminar(false), ESPERA_FICHA_COMPLETA_MS);
            const terminar = (ok) => {
                clearTimeout(temporizador);
                if (fichaCompletaPedida?.resolver === terminar) fichaCompletaPedida = null;
                resolver(ok);
            };
            fichaCompletaPedida = { id, instancia, resolver: terminar };
            emitirPrivado("pedirFichaCompleta", { para: instancia, id }).catch(() => terminar(false));
        });
        if (!respondio) aviso = "No ha respondido: se muestra la última copia guardada.";
    }
    try {
        const ficha = await servicio.leerFichaSala(id);
        if (!ficha) {
            return { error: instancia
                ? "No ha respondido y no hay ninguna copia de su ficha."
                : "No hay ninguna copia de su ficha: su jugador tiene que guardarla en la nube estando en la sala." };
        }
        return { ...ficha, aviso };
    } catch (error) {
        return { error: servicio.mensajeError(error) };
    }
}

function inicializarFichaCompleta() {
    // Solo responde al máster de la sala y si el personaje pedido es el de esta pestaña
    registrarManejador("pedirFichaCompleta", (evento) => {
        const sala = servicio.getEstado().sala;
        if (!sala || evento.jugador !== sala.master || !servicio.esPersonajeLocal(evento.datos?.id)) return;
        servicio.guardarFichaSala(ctx.personaje().toJSONString())
            .then(() => emitirPrivado("fichaCompletaLista", { para: evento.instancia, id: evento.datos.id }))
            .catch(error => console.warn("No se pudo enviar tu ficha al máster:", error));
    });
    registrarManejador("fichaCompletaLista", (evento) => {
        const pedida = fichaCompletaPedida;
        if (pedida && pedida.instancia === evento.instancia && pedida.id === evento.datos?.id) pedida.resolver(true);
    });
}

function inicializarFichaResumen() {
    inicializarFichaCompleta();
    registrarManejador("pedirFicha", (evento) => {
        const para = evento.datos?.para;
        if (!servicio.enMiGrupo(evento.instancia, para)) return;
        emitirPrivado("fichaResumen", { para: evento.instancia, resumen: ctx.resumenDe ? ctx.resumenDe(para) : ctx.resumenPropio() }, como(para))
            .catch(error => console.warn("No se pudo enviar tu ficha:", error));
    });
    registrarManejador("fichaResumen", (evento) => {
        if (fichaPedida?.instancia !== evento.instancia) return;
        const { titulo } = fichaPedida;
        cancelarFichaPedida();
        ctx.mostrarFichaResumen(titulo, cargarResumenFicha(evento.datos?.resumen) ?? "La ficha recibida no es válida.");
    });
    // Si se cierra la ventana mientras se espera, la respuesta ya no la vuelve a abrir
    el("modalFichaResumen").addEventListener("hidden.bs.modal", cancelarFichaPedida);
}

/** HTML de una fila vacía de la cabecera (grupo o personajes del máster); se rellena con rellenarFilaHud */
export const htmlFilaHud = () => `
            <button type="button" class="hud-grupo-fila">
                <span class="hud-grupo-nombre"></span>
                <span class="hud-grupo-barras">
                    <span class="hud-grupo-vida"><span class="sao-track-fill"></span><span class="sao-track-glass"></span></span>
                    <span class="hud-grupo-pa"><span class="sao-arte-fill"></span></span>
                </span>
                <span class="hud-grupo-nivel"></span>
                <span class="hud-grupo-estados"></span>
            </button>`;

/** Rellena una fila de la cabecera: { nombre, vida, pa (fracciones), nivel, estados } */
export function rellenarFilaHud(fila, m) {
    fila.querySelector(".hud-grupo-nombre").textContent = m.nombre || "Sin nombre";
    const vida = fila.querySelector(".sao-track-fill");
    vida.style.width = `${Math.round(m.vida * 100)}%`;
    // Mismos umbrales de color que tu barra (actualizarInformacion en interfaz.js)
    vida.classList.toggle("hp-orange", m.vida < 0.4 && m.vida >= 0.15);
    vida.classList.toggle("hp-red", m.vida < 0.15);
    fila.querySelector(".sao-arte-fill").style.width = `${Math.round(m.pa * 100)}%`;
    fila.querySelector(".hud-grupo-nivel").textContent = `LV ${m.nivel}`;
    const estados = fila.querySelector(".hud-grupo-estados");
    const activos = (m.estados ?? []).filter(clave => ESTADOS_INFO[clave]);
    if (estados.dataset.claves !== activos.join(",")) {
        estados.dataset.claves = activos.join(",");
        estados.innerHTML = activos.map(clave => `
                <span class="hud-grupo-estado icono-activo" style="${estiloColor(ESTADOS_INFO[clave])}" title="${escaparHtml(ESTADOS_INFO[clave].etiqueta)}">${iconoSao(ESTADOS_INFO[clave].icono)}</span>`).join("");
    }
}

let ultimoTurnoGrupo = 0;

/** Alguien de la sala (de tu grupo o no) ha empezado su turno a esa hora: los turnos anteriores dejan de parpadear */
export function verTurnoSala(hora) {
    ultimoTurnoGrupo = Math.max(ultimoTurnoGrupo, Number(hora) || 0);
    if (ctx) actualizarHudGrupo();
}

/* Barras del grupo en la cabecera (compañeros, sin ti). Las filas solo se regeneran si cambia el número.
   El máster no ve aquí los grupos: ve a todos sus personajes en #hudMaster (interfazMaster.js). */
function actualizarHudGrupo() {
    const hud = el("hudGrupo");
    const grupo = servicio.getGrupo();
    const companeros = ctx.modoMaster ? [] : (grupo?.miembros ?? []).filter(m => m.instancia !== getInstancia());
    hud.hidden = !companeros.length;
    if (!companeros.length) {
        hud.classList.remove("abierto");
        return;
    }
    hud.querySelector(".hud-grupo-numero").textContent = String(companeros.length + 1);
    const lista = el("hudGrupoLista");
    if (lista.children.length !== companeros.length) {
        lista.innerHTML = companeros.map(htmlFilaHud).join("");
    }
    const enLinea = instanciasConectadas();
    // Turno: parpadea quien pulsó Play más tarde (también tú; con la misma iniciativa, varios a la vez)
    // (se recuerda el último visto: si quien lo tenía pasa a zona segura, los anteriores no vuelven a parpadear)
    ultimoTurnoGrupo = Math.max(ultimoTurnoGrupo, Number(ctx.turnoPropio?.()) || 0, ...companeros.map(m => m.turno || 0));
    const ultimoTurno = ultimoTurnoGrupo;
    companeros.forEach((m, i) => {
        const fila = lista.children[i];
        fila.classList.toggle("en-turno", m.turno > 0 && m.turno >= ultimoTurno);
        fila.dataset.instancia = m.instancia;
        fila.classList.toggle("desconectado", !enLinea.has(m.instancia));
        fila.classList.toggle("lider", m.lider);
        fila.title = `${m.nombre || "Sin nombre"}${m.lider ? " (líder)" : ""}${enLinea.has(m.instancia) ? "" : " · desconectado"}`;
        rellenarFilaHud(fila, m);
    });
    comprobarPlegadoHud(hud);
}

/** Si no caben las barras a la derecha del HUD, se pliegan en una pestaña. Con más de 3 filas van en
 *  dos columnas (para no hacer la cabecera más alta), que necesitan el doble de sitio */
const ANCHO_MINIMO_GRUPO = 260;
export function comprobarPlegadoHud(hud) {
    if (hud.hidden) return;
    const cabecera = el("datosPrincipalesDiv");
    const barra = cabecera.querySelector(".sao-bar-wrapper");
    const libre = cabecera.clientWidth - (barra?.offsetWidth ?? 0) - 30;
    const filas = hud.querySelectorAll(".hud-grupo-fila").length;
    const dosColumnas = filas > 3;
    hud.classList.toggle("dos-columnas", dosColumnas);
    // En dos columnas el orden va de arriba abajo (primero toda la izquierda): la rejilla necesita el número de filas
    hud.style.setProperty("--filas-hud", String(Math.ceil(filas / 2)));
    const plegado = libre < ANCHO_MINIMO_GRUPO * (dosColumnas ? 2 : 1);
    hud.classList.toggle("plegado", plegado);
    if (!plegado) hud.classList.remove("abierto");
    hud.querySelector(".hud-grupo-pestana").setAttribute("aria-expanded", String(hud.classList.contains("abierto")));
}
const comprobarPlegadoGrupo = () => comprobarPlegadoHud(el("hudGrupo"));

function inicializarGrupo() {
    el("listaGrupo").addEventListener("click", (e) => {
        const boton = e.target.closest("button[data-accion]");
        if (!boton) return;
        reproducir("click");
        const fila = boton.closest("[data-instancia]");
        const accion = boton.dataset.accion;
        if (accion === "crear") {
            operar("avisoGrupo", () => servicio.crearGrupo());
        } else if (accion === "salir") {
            if (confirm("¿Salir del grupo?")) operar("avisoGrupo", () => servicio.salirDeGrupo());
        } else if (accion === "ficha" && fila) {
            // Se cierra el grupo (Bootstrap no apila ventanas) y se abre la ficha
            const instancia = fila.dataset.instancia;
            const modalGrupo = el("modalGrupo");
            modalGrupo.addEventListener("hidden.bs.modal", () => verFichaCompanero(instancia), { once: true });
            bootstrap.Modal.getOrCreateInstance(modalGrupo).hide();
        } else if (accion === "echar" && fila) {
            const nombre = fila.querySelector(".nombre-online").firstChild.textContent.trim();
            if (confirm(`¿Echar a ${nombre} del grupo?`)) operar("avisoGrupo", () => servicio.echarDeGrupo(fila.dataset.instancia));
        }
    });

    el("listaInvitarGrupo").addEventListener("click", (e) => {
        const instancia = e.target.closest('button[data-accion="invitar"]')?.closest("[data-instancia]")?.dataset.instancia;
        if (!instancia) return;
        reproducir("click");
        operar("avisoGrupo", async () => {
            const id = await servicio.invitarAGrupo(instancia);
            // Otro personaje del máster: entra directamente (un evento propio no le llega a esta pestaña)
            if (esDeEstaPestana(instancia)) {
                await servicio.unirseAGrupo(id, instancia);
                ctx.aviso("Grupo", [`${personajeDe(instancia).nombre || "Tu personaje"} se ha unido al grupo.`]);
                return;
            }
            await emitirPrivado("invitacionGrupo", { para: instancia, grupo: id });
        });
    });

    // Barras de la cabecera: pulsar una abre el grupo con ese integrante señalado; la pestaña pliega y despliega
    const hud = el("hudGrupo");
    hud.addEventListener("click", (e) => {
        if (e.target.closest(".hud-grupo-pestana")) {
            reproducir("click");
            hud.classList.toggle("abierto");
            comprobarPlegadoGrupo();
            return;
        }
        const fila = e.target.closest(".hud-grupo-fila");
        if (!fila) return;
        reproducir("click");
        hud.classList.remove("abierto");
        verFichaCompanero(fila.dataset.instancia);
    });
    document.addEventListener("click", (e) => {
        if (hud.classList.contains("abierto") && !hud.contains(e.target)) {
            hud.classList.remove("abierto");
            comprobarPlegadoGrupo();
        }
    });
    new ResizeObserver(() => comprobarPlegadoGrupo()).observe(el("datosPrincipalesDiv"));
}

/* Tu vida, PA, nivel y estados para el grupo: se publican tras un rato sin cambios y solo si cambian */
const RETARDO_ESTADO_GRUPO_MS = 1500;
let temporizadorEstadoGrupo = null;
let estadoGrupoPendiente = null;

/** Modo máster: estado de uno de sus personajes que no está en la ficha (p. ej. al empezar el turno a la vez) */
export function publicarEstadoDe(id, datos) {
    servicio.publicarEstadoGrupo({ ...datos, id }).catch(error => console.warn("No se pudo publicar el estado en el grupo:", error));
}

/** La ficha avisa de su estado (en cada actualizarTodo): { vida, pa (fracciones), nivel, estados } */
export function avisarEstadoGrupo(datos) {
    clearTimeout(temporizadorEstadoGrupo);
    // Otro personaje en la ficha (modo máster): lo pendiente del anterior se publica ya, en su grupo
    if (estadoGrupoPendiente && estadoGrupoPendiente.id !== datos.id) {
        servicio.publicarEstadoGrupo(estadoGrupoPendiente).catch(() => { /* sin conexión */ });
    }
    estadoGrupoPendiente = datos;
    temporizadorEstadoGrupo = setTimeout(() => {
        estadoGrupoPendiente = null;
        servicio.publicarEstadoGrupo(datos).catch(error => console.warn("No se pudo actualizar tu estado en el grupo:", error));
        // El máster de la sala lo ve en su cabecera (también iniciativa)
        servicio.publicarEstadoSala(datos).catch(error => console.warn("No se pudo publicar tu estado en la sala:", error));
    }, RETARDO_ESTADO_GRUPO_MS);
}

export const getGrupoSala = () => servicio.getGrupo();

/** Tu turno (hora en ms en la que pulsaste Play, o 0): se publica al momento en el grupo y para el máster */
export function avisarTurno(turno, id) {
    servicio.publicarTurno(turno, id).catch(error => console.warn("No se pudo publicar tu turno:", error));
    if (ctx) actualizarHudGrupo();
}
