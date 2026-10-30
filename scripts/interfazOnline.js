/* Interfaz de la parte online: ventanas de cuenta, sala y personajes en la nube.
 * La lógica de red está en online/servicio.js; aquí solo hay DOM. interfaz.js llama a inicializarOnline
 * con lo que necesita de la ficha (contexto) y añade las opciones al menú de opciones. */
import * as servicio from "./online/servicio.js";
import { configurarOrigen, setPublicador, recibirEvento } from "./eventos.js";
import { escaparHtml } from "./html.js";
import { reproducir } from "./sonidos.js";

/**
 * @typedef {Object} ContextoOnline
 * @property {() => object} personaje           la instancia de PJ actual
 * @property {(datos: object) => void} cargarFicha  carga un JSON ya parseado (como el de un fichero)
 * @property {() => void} marcarGuardado
 * @property {() => boolean} hayCambiosSinGuardar
 * @property {(titulo: string, lineas: string[]) => void} aviso  pop-up informativo (texto plano)
 * @property {(estado: object) => void} alCambiarEstado
 * @property {(artes: object[]) => void} alCambiarArtesSala
 * @property {(miembros: object[]) => void} [alCambiarMiembros]  jugadores de la sala (para ofrecer objetos)
 */
/** @type {ContextoOnline} */
let ctx;
/* Personaje de la nube que hay cargado (para guardar encima), o null */
let idPersonajeNube = null;
let ocupado = false;

const el = (id) => document.getElementById(id);
const formatoFecha = new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" });

export const getEstadoOnline = () => servicio.getEstado();
/** Jugadores de la sala actual: [{ uid, nombre }] (también tú) */
export const getMiembrosSala = () => servicio.getMiembros();
export const setIdPersonajeNube = (id) => { idPersonajeNube = id; };

export function inicializarOnline(contexto) {
    ctx = contexto;
    inicializarCuenta();
    inicializarSala();
    inicializarPersonajesNube();

    servicio.alCambiarEstado(estado => {
        // Los pop-ups que se emitan llevan tu nombre; con sala, se envían
        configurarOrigen({ jugador: estado.usuario?.uid ?? null, nombreJugador: estado.usuario?.nombre ?? "" });
        setPublicador(estado.sala ? servicio.publicarEvento : null);
        if (!estado.usuario) idPersonajeNube = null;
        pintarCuenta();
        pintarSala();
        ctx.alCambiarEstado(estado);
    });
    servicio.alRecibirEvento(recibirEvento);
    servicio.alCambiarArtesSala(artes => ctx.alCambiarArtesSala(artes));
    servicio.alCambiarMiembros(lista => ctx.alCambiarMiembros?.(lista));
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
}

function pintarSala() {
    const { sala } = servicio.getEstado();
    el("salaActual").hidden = !sala;
    if (!sala) return;
    el("salaActualNombre").textContent = sala.nombre;
    el("salaActualCodigo").textContent = sala.codigo;
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
        idPersonajeNube = await servicio.guardarPersonaje(pj.toJSONString(), pj.nombre, id);
        ctx.marcarGuardado();
        ctx.aviso("Guardado en la nube", [pj.nombre]);
    });
    const error = el("avisoPersonajesNube").textContent;
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
            if (ctx.hayCambiosSinGuardar() && !confirm("La ficha actual tiene cambios sin guardar. ¿Cargar otro personaje y perderlos?")) return;
            operar("avisoPersonajesNube", async () => {
                const json = await servicio.cargarPersonaje(id);
                ctx.cargarFicha(JSON.parse(json));
                idPersonajeNube = id;
                cerrar("modalPersonajesNube");
            });
        } else if (boton.dataset.accion === "borrar") {
            if (!confirm(`¿Borrar ${nombre} de la nube? No se puede deshacer.`)) return;
            operar("avisoPersonajesNube", async () => {
                await servicio.borrarPersonaje(id);
                if (id === idPersonajeNube) idPersonajeNube = null;
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
