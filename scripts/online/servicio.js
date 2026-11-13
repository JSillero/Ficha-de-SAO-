/* Capa online (Firebase Auth + Firestore). Es lo único que conoce Firebase: si algún día se cambia de
 * backend (p. ej. Spring Boot), solo hay que reescribir este fichero manteniendo las mismas funciones.
 *
 * Firestore (reglas en firestore.rules; explicación completa en .claude/11-online.md):
 * - personajes/{id}: { propietario, nombre, json, actualizado }    json = personaje.toJSONString()
 * - usuarios/{uid}: { nombre }                                     nombre de usuario (solo en la gestión de sala)
 * - salas/{codigo}: { nombre, master, miembros: [uid], creada,
 *       personajes: { uid: { instancia: { nombre, visto } } },     personajes conectados (una entrada por pestaña)
 *       ocultos: ["uid:nombre"],                                   personajes que el máster oculta
 *       expulsados: { uid: true },                                 echados por el máster (pueden volver a entrar)
 *       registro: { uid: { idPersonaje: { nombre } } } }           personajes que han estado en la sala (no se
 *                                                                  borran al desconectarse; los quita el máster)
 *       (cada entrada de personaje lleva también grupo: id del grupo en el que está, o null, e id: su idPersonaje.
 *        En modo máster, cada personaje de su sesión tiene una entrada "m-<idPersonaje>")
 * - salas/{codigo}/estados/{idPersonaje}: { jugador, master, nombre, vida, pa, nivel, iniciativa, estados, turno }
 *       lo escribe cada jugador al cambiar; solo lo escucha el máster (cabecera del modo máster)
 * - salas/{codigo}/fichas/{idPersonaje}: { jugador, master, json, actualizado }
 *       copia de la ficha completa para que el máster la vea en modo lectura. Se escribe al guardar en la nube
 *       estando en la sala y cuando el máster la pide. Nadie la escucha: el máster la lee al abrirla.
 * - salas/{codigo}/grupos/{id}: { lider, liderJugador, invitados: { instancia: true }, ultimo,
 *       miembros: { instancia: { jugador, nombre, vida, pa, nivel, estados, orden } } }
 *       grupo de hasta 6 personajes; solo lo escuchan sus integrantes. vida y pa son fracciones (0-1)
 * - salas/{codigo}/eventos/{auto}: { jugador, evento, creado }     evento = JSON de eventos.js
 * - salas/{codigo}/artes/{id}: { autor, nombreAutor, nombre, arte, actualizado }   arte = JSON del arte
 * - compendios/{uid}: { paginas, actualizado }                     compendio de NPC del máster (compendio.js):
 *   compendios/{uid}/paginas/{n}: { plantillas }                   índice y páginas de < 1 MB (texto JSON)
 * - compendiosObjetos/{uid}: { paginas, actualizado }              objetos comunes del máster (compendioObjetos.js):
 *   compendiosObjetos/{uid}/paginas/{n}: { objetos }               lo escribe su dueño; lo lee cualquiera con sesión
 *
 * Plan gratuito de Firebase: peticiones al mínimo. Personajes, ocultos y expulsados van en el documento de
 * la sala, que ya se escucha (sin listeners ni colecciones extra); nada es periódico; los nombres de usuario
 * solo se leen al abrir la gestión de sala; la inactividad (24 h) se comprueba en local.
 *
 * El SDK solo se descarga al iniciar sesión, o al arrancar si la última vez se dejó la sesión abierta. */
import { firebaseConfig, VERSION_SDK_FIREBASE } from "./config.js";

const URL_SDK = `https://www.gstatic.com/firebasejs/${VERSION_SDK_FIREBASE}/`;
/* localStorage: hay sesión abierta (para cargar el SDK al arrancar) y última sala { codigo, nombre, master, actividad }.
   La sala se guarda también en sessionStorage (propia de cada pestaña), que tiene preferencia al recargar. */
const CLAVE_SESION = "fichaSesionOnline";
const CLAVE_SALA = "fichaSalaOnline";
const LETRAS_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Sin hacer nada en la sala durante este tiempo, se sale sola (salvo el máster). Se puede volver a entrar. */
export const HORAS_INACTIVIDAD_SALA = 24;
/* Una entrada de personaje con "visto" más antiguo se considera de una pestaña cerrada (no se pudo borrar) */
const HORAS_PERSONAJE_CADUCADO = 25;
/* "visto" se refresca como mucho cada tanto, aprovechando un evento (solo importa en pestañas abiertas días) */
const HORAS_REFRESCAR_VISTO = 12;
const HORA_MS = 3600 * 1000;

let promesaSdk = null;
/* Token de la sesión, al día (onIdTokenChanged): al cerrar la pestaña no da tiempo a pedirlo */
let tokenSesion = null;
let sdk = null; // { auth, db, a (módulo auth), f (módulo firestore) }

/** Estado público: usuario { uid, nombre, email } y sala { codigo, nombre, master, ocultos } */
const estado = { usuario: null, sala: null };
let dejarDeEscuchar = [];
const oyentes = {
    estado: new Set(), evento: new Set(), artesSala: new Set(), personajes: new Set(), salida: new Set(),
    grupo: new Set(), salidaGrupo: new Set(), estadosSala: new Set()
};
/* Último documento de sala leído (registro y entradas propias, para escribir solo lo que cambia) */
let datosSala = null;
/* Modo máster: estados de los personajes de los jugadores { idPersonaje: { jugador, nombre, vida, ... } } */
let estadosSala = {};
/* Modo máster (?master): función que da sus personajes de la sesión de una sala
   ({ codigo, registro, uid }) => [{ id, nombre }]. Sin ella, la pestaña es un personaje normal. */
let proveedorMaster = null;
/* Personajes conectados a la sala actual: [{ jugador, instancia, nombre, oculto }] (también los tuyos) */
let personajesSala = [];
const nombresCache = new Map();

/* Personaje de esta pestaña: instancia (instancia.js), nombre e id (idPersonaje), para la lista de conectados */
const personajeLocal = { instancia: null, nombre: "", id: null };
/* Grupos (ver la sección de grupos): el de la pestaña se recuerda en sessionStorage { codigo, id } */
const CLAVE_GRUPO = "fichaSAO.grupo";
const MAX_GRUPO = 6;
let ultimaActividad = 0;   // última acción en la sala desde esta pestaña (ms)
let ultimoVisto = 0;       // última vez que se escribió "visto" de este personaje (ms)

/* Comodidad: si el almacenamiento falla (modo privado...) la ficha sigue igual */
const leerLocal = (clave, almacen = localStorage) => { try { return almacen.getItem(clave); } catch { return null; } };
const escribirLocal = (clave, valor, almacen = localStorage) => {
    try { valor === null ? almacen.removeItem(clave) : almacen.setItem(clave, valor); } catch { /* sin almacenamiento */ }
};

/* Última sala: { codigo, nombre, master, actividad } o null. Acepta el formato antiguo (solo el código). */
function leerSalaLocal() {
    const leer = (almacen) => {
        const texto = leerLocal(CLAVE_SALA, almacen);
        if (!texto) return null;
        try {
            const datos = JSON.parse(texto);
            if (datos && typeof datos.codigo === "string") return datos;
        } catch { /* formato antiguo */ }
        return { codigo: texto, actividad: Date.now() };
    };
    const deSesion = leer(sessionStorage);
    const deLocal = leer(localStorage);
    if (!deSesion) return deLocal;
    // La actividad de otras pestañas en la misma sala también cuenta
    if (deLocal?.codigo === deSesion.codigo) deSesion.actividad = Math.max(deSesion.actividad || 0, deLocal.actividad || 0);
    return deSesion;
}

function escribirSalaLocal(datos) {
    const texto = datos ? JSON.stringify(datos) : null;
    escribirLocal(CLAVE_SALA, texto, sessionStorage);
    escribirLocal(CLAVE_SALA, texto, localStorage);
}

function marcarActividad() {
    ultimaActividad = Date.now();
    if (!estado.sala) return;
    const { codigo, nombre, master } = estado.sala;
    escribirSalaLocal({ codigo, nombre, master, actividad: ultimaActividad });
}

function cargarSdk() {
    promesaSdk ??= Promise.all([
        import(`${URL_SDK}firebase-app.js`),
        import(`${URL_SDK}firebase-auth.js`),
        import(`${URL_SDK}firebase-firestore.js`)
    ]).then(([appMod, a, f]) => {
        const app = appMod.initializeApp(firebaseConfig);
        sdk = { auth: a.getAuth(app), db: f.getFirestore(app), a, f };
        return sdk;
    }).catch(error => {
        promesaSdk = null; // se puede reintentar (p. ej. sin conexión)
        throw error;
    });
    return promesaSdk;
}

function avisar(tipo, valor) {
    oyentes[tipo].forEach(cb => { try { cb(valor); } catch (error) { console.error(error); } });
}

const copiaEstado = () => ({
    usuario: estado.usuario && { ...estado.usuario },
    sala: estado.sala && { ...estado.sala, ocultos: [...(estado.sala.ocultos ?? [])] }
});

/** cb(estado) al iniciar/cerrar sesión o entrar/salir de sala. Devuelve la función para quitarlo. */
export function alCambiarEstado(cb) { oyentes.estado.add(cb); return () => oyentes.estado.delete(cb); }
/** cb(evento) por cada evento de la sala (también los propios; eventos.js descarta los de esta pestaña) */
export function alRecibirEvento(cb) { oyentes.evento.add(cb); return () => oyentes.evento.delete(cb); }
/** cb(lista) con las artes compartidas de la sala: [{ id, autor, nombreAutor, arte }] */
export function alCambiarArtesSala(cb) { oyentes.artesSala.add(cb); return () => oyentes.artesSala.delete(cb); }
/** cb(lista) con los personajes conectados: [{ jugador, instancia, nombre, oculto }] (también los tuyos) */
export function alCambiarPersonajes(cb) { oyentes.personajes.add(cb); return () => oyentes.personajes.delete(cb); }
/** cb({ motivo: "expulsado" | "inactividad", nombre }) cuando la sala te saca sin pulsar "Salir" */
export function alSalirSala(cb) { oyentes.salida.add(cb); return () => oyentes.salida.delete(cb); }
/** cb(grupo | null) cuando cambia tu grupo: { id, lider, soyLider, invitados: [instancia], miembros: [...] } */
export function alCambiarGrupo(cb) { oyentes.grupo.add(cb); return () => oyentes.grupo.delete(cb); }
/** cb({ motivo: "echado" | "disuelto" }) cuando el grupo te saca sin que tú salgas */
export function alSalirGrupo(cb) { oyentes.salidaGrupo.add(cb); return () => oyentes.salidaGrupo.delete(cb); }
/** Modo máster: estados de los personajes de los jugadores de su sala */
export function alCambiarEstadosSala(cb) { oyentes.estadosSala.add(cb); return () => oyentes.estadosSala.delete(cb); }

export function getEstado() { return copiaEstado(); }
export function getPersonajesSala() { return personajesSala.map(p => ({ ...p })); }

/** Clave de un personaje para ocultarlo: "uid:nombre" (si cambia de nombre deja de estar oculto) */
export const claveOculto = (jugador, nombre) => `${jugador}:${String(nombre ?? "").trim()}`;

/**
 * Instancia (pestaña), nombre e id del personaje de esta ficha. Si cambia el nombre o el personaje estando en
 * una sala, se publica; si su nombre es de un personaje de otro usuario de la sala, sale de la sala y avisa.
 */
export function configurarPersonaje({ instancia, nombre, id } = {}) {
    if (instancia !== undefined) personajeLocal.instancia = instancia;
    let cambia = false;
    if (id !== undefined && id !== personajeLocal.id) {
        personajeLocal.id = id;
        cambia = true;
    }
    if (nombre !== undefined) {
        nombre = String(nombre ?? "").trim().slice(0, 60);
        if (nombre !== personajeLocal.nombre) {
            personajeLocal.nombre = nombre;
            cambia = true;
        }
    }
    if (!cambia || !estado.sala || masterEnSala()) return;
    const motivo = motivoNombre(personajeLocal.nombre);
    if (motivo) {
        const nombreSala = estado.sala.nombre;
        salirSala();
        avisar("salida", { motivo: "nombre", nombre: nombreSala, detalle: motivo });
        return;
    }
    publicarPersonaje().catch(error => console.warn("No se pudo actualizar el personaje en la sala:", error));
}

/** Modo máster: función que da los personajes de su sesión en una sala (ver proveedorMaster) */
export function configurarMaster(proveedor) {
    proveedorMaster = proveedor;
}

/* ¿Esta pestaña lleva la sala como máster (modo máster y dueño de la sala)? */
const masterEnSala = () => Boolean(proveedorMaster) && soyMasterSala();

const normalizarNombre = (nombre) => String(nombre ?? "").trim().toLocaleLowerCase();

/**
 * Motivo por el que no se puede usar este nombre en la sala, o null. Los nombres son únicos: no se puede usar
 * el de un personaje de otro usuario (del registro, aunque esté desconectado). Uno tuyo sí: se sobrescribe.
 */
export function motivoNombre(nombre, registro = datosSala?.registro) {
    const uid = estado.usuario?.uid;
    const buscado = normalizarNombre(nombre);
    if (!buscado) return null;
    for (const [jugador, personajes] of Object.entries(registro ?? {})) {
        if (jugador === uid) continue;
        // Los NPC del máster pueden repetir nombre y no ocupan el suyo
        const usado = Object.values(personajes ?? {}).find(p => !p?.npc && normalizarNombre(p?.nombre) === buscado);
        if (usado) return `Ya hay un personaje llamado ${usado.nombre} en la sala.`;
    }
    return null;
}

/* Tus otras entradas del registro con el mismo nombre (se sobrescriben: se borran al publicar este) */
function registroRepetido(uid, nombre, id, registro = datosSala?.registro) {
    const buscado = normalizarNombre(nombre);
    return Object.entries(registro?.[uid] ?? {})
        .filter(([otro, p]) => otro !== id && normalizarNombre(p?.nombre) === buscado)
        .map(([otro]) => otro);
}

/** Registro de la sala ({ uid: { idPersonaje: { nombre } } }) */
export const getRegistroSala = () => structuredClone(datosSala?.registro ?? {});
/** Modo máster: estados de los personajes de los jugadores */
export const getEstadosSala = () => structuredClone(estadosSala);

/** ¿El personaje de esta pestaña está oculto por el máster? */
export function personajeLocalOculto() {
    if (!estado.sala || !estado.usuario) return false;
    return (estado.sala.ocultos ?? []).includes(claveOculto(estado.usuario.uid, personajeLocal.nombre));
}

export const soyMasterSala = () => Boolean(estado.sala && estado.usuario && estado.sala.master === estado.usuario.uid);

/* Nombre público del jugador (usuarios/{uid}): solo se ve en la gestión de sala */
function publicarNombre(uid, nombre) {
    if (!sdk || !uid || !nombre) return;
    const { db, f } = sdk;
    f.setDoc(f.doc(db, "usuarios", uid), { nombre: String(nombre).slice(0, 40) })
        .catch(error => console.warn("No se pudo guardar tu nombre de jugador:", error));
}

/* Sesión ______________________________________________________________________ */

/* Espera al primer onAuthStateChanged (Firebase recuerda la sesión en el navegador) */
async function prepararAuth() {
    const { auth, a } = await cargarSdk();
    if (prepararAuth.listo) return prepararAuth.listo;
    prepararAuth.listo = new Promise(resolver => {
        // El SDK renueva el token antes de que caduque; se guarda para poder usarlo al cerrar la pestaña
        a.onIdTokenChanged(auth, async usuario => {
            try { tokenSesion = usuario ? await usuario.getIdToken() : null; } catch { tokenSesion = null; }
        });
        a.onAuthStateChanged(auth, usuario => {
            const antes = estado.usuario?.uid;
            estado.usuario = usuario ? { uid: usuario.uid, nombre: usuario.displayName || usuario.email, email: usuario.email } : null;
            if (!usuario) {
                escribirLocal(CLAVE_SESION, null);
                if (estado.sala) dejarSala();
            } else if (usuario.displayName) {
                publicarNombre(usuario.uid, usuario.displayName);
            }
            if (antes !== estado.usuario?.uid) avisar("estado", copiaEstado());
            resolver();
        });
    });
    return prepararAuth.listo;
}

/* ¿La última sala lleva más de 24 h sin actividad? El máster no sale nunca por inactividad. */
function salaInactiva(salaLocal) {
    if (!salaLocal || !estado.usuario || salaLocal.master === estado.usuario.uid) return false;
    const actividad = Math.max(Number(salaLocal.actividad) || 0, salaLocal.codigo === estado.sala?.codigo ? ultimaActividad : 0);
    return Date.now() - actividad > HORAS_INACTIVIDAD_SALA * HORA_MS;
}

/** Al arrancar: si la última vez se dejó la sesión abierta, la recupera y vuelve a la última sala
 *  (si no lleva 24 h sin actividad: entonces no reentra y no gasta ninguna petición). */
export async function iniciar() {
    if (!leerLocal(CLAVE_SESION)) return copiaEstado();
    try {
        await prepararAuth();
        const sala = leerSalaLocal();
        if (estado.usuario && sala) {
            if (salaInactiva(sala)) {
                escribirSalaLocal(null);
                avisar("salida", { motivo: "inactividad", nombre: sala.nombre ?? sala.codigo });
            } else {
                await entrarSala(sala.codigo, { actividad: sala.actividad }).catch(error => {
                    escribirSalaLocal(null);
                    if (error?.code === "nombre-usado") avisar("salida", { motivo: "nombre", nombre: sala.nombre ?? sala.codigo, detalle: error.message });
                });
            }
        }
    } catch (error) {
        console.warn("No se pudo conectar con Firebase:", error);
    }
    return copiaEstado();
}

/** Comprobación local (sin peticiones): si llevas 24 h sin hacer nada en la sala, sales. Devuelve true si has salido. */
export function comprobarInactividad() {
    if (!estado.sala) return false;
    const local = leerSalaLocal();
    const sala = local?.codigo === estado.sala.codigo ? local : { ...estado.sala, actividad: ultimaActividad };
    if (!salaInactiva(sala)) return false;
    const nombre = estado.sala.nombre;
    salirSala();
    avisar("salida", { motivo: "inactividad", nombre });
    return true;
}

export async function iniciarSesion(email, contrasena) {
    const { auth, a } = await cargarSdk();
    await prepararAuth();
    await a.signInWithEmailAndPassword(auth, email, contrasena);
    escribirLocal(CLAVE_SESION, "1");
    return copiaEstado();
}

export async function registrarse(email, contrasena, nombre) {
    const { auth, a } = await cargarSdk();
    await prepararAuth();
    const { user } = await a.createUserWithEmailAndPassword(auth, email, contrasena);
    await a.updateProfile(user, { displayName: nombre });
    publicarNombre(user.uid, nombre);
    estado.usuario = { uid: user.uid, nombre, email: user.email };
    escribirLocal(CLAVE_SESION, "1");
    avisar("estado", copiaEstado());
    return copiaEstado();
}

export async function cambiarNombre(nombre) {
    const { auth, a } = await cargarSdk();
    if (!auth.currentUser) throw new Error("Sin sesión");
    await a.updateProfile(auth.currentUser, { displayName: nombre });
    publicarNombre(auth.currentUser.uid, nombre);
    nombresCache.set(auth.currentUser.uid, nombre);
    estado.usuario = { ...estado.usuario, nombre };
    avisar("estado", copiaEstado());
}

export async function recuperarContrasena(email) {
    const { auth, a } = await cargarSdk();
    await a.sendPasswordResetEmail(auth, email);
}

export async function cerrarSesion() {
    if (estado.sala) {
        // Antes de cerrar la sesión, que después ya no hay permiso para escribir (los grupos se conservan)
        await quitarPersonaje().catch(() => { /* sin conexión: se limpia al volver a entrar */ });
        dejarSala();
        escribirSalaLocal(null);
    }
    escribirLocal(CLAVE_SESION, null);
    if (sdk) await sdk.a.signOut(sdk.auth);
}

function exigirUsuario() {
    if (!sdk || !estado.usuario) throw Object.assign(new Error("Inicia sesión primero"), { code: "sin-sesion" });
    return { ...sdk, uid: estado.usuario.uid };
}

/* Salas _______________________________________________________________________ */

function codigoAleatorio(longitud = 6) {
    const valores = crypto.getRandomValues(new Uint32Array(longitud));
    return [...valores].map(v => LETRAS_CODIGO[v % LETRAS_CODIGO.length]).join("");
}

const normalizarCodigo = (codigo) => String(codigo ?? "").trim().toUpperCase();

/* Milisegundos de un Timestamp de Firestore (null mientras el servidor no lo ha puesto: se toma "ahora") */
const msDe = (marca) => marca?.toMillis?.() ?? Date.now();

export async function crearSala(nombre) {
    const { db, f, uid } = exigirUsuario();
    const codigo = codigoAleatorio();
    await f.setDoc(f.doc(db, "salas", codigo), {
        nombre: String(nombre).trim().slice(0, 60) || "Sala",
        master: uid,
        miembros: [uid],
        creada: f.serverTimestamp(),
        personajes: {},
        ocultos: [],
        expulsados: {}
    });
    return entrarSala(codigo);
}

/* Entrada del personaje de esta pestaña en "personajes.<uid>.<instancia>" */
const campoPersonaje = (uid) => `personajes.${uid}.${personajeLocal.instancia}`;
const datosPersonaje = (f) => ({ nombre: personajeLocal.nombre || "", visto: f.serverTimestamp(), grupo: grupos.get(personajeLocal.instancia)?.id ?? null, id: personajeLocal.id });

/* Cambios del registro para el personaje de esta pestaña: su entrada y, si tenías otro con su nombre, borrarlo */
function cambiosRegistroPropio(f, uid, registro) {
    if (!personajeLocal.id) return {};
    const cambios = { [`registro.${uid}.${personajeLocal.id}`]: { nombre: personajeLocal.nombre || "" } };
    registroRepetido(uid, personajeLocal.nombre, personajeLocal.id, registro)
        .forEach(otro => { cambios[`registro.${uid}.${otro}`] = f.deleteField(); });
    return cambios;
}

/* Modo máster: lo que hay que escribir en la sala para que sus personajes de la sesión (lista [{ id, nombre }])
   estén en el registro y conectados ("m-<id>"), y nada más suyo. Solo lo que cambia. */
const HORAS_REFRESCAR_VISTO_MS = () => HORAS_REFRESCAR_VISTO * HORA_MS;
function cambiosMaster(f, uid, lista, datos) {
    const cambios = {};
    const registro = datos?.registro?.[uid] ?? {};
    const presencia = datos?.personajes?.[uid] ?? {};
    const ids = new Set(lista.map(p => p.id));
    for (const p of lista) {
        if (registro[p.id]?.nombre !== p.nombre || Boolean(registro[p.id]?.npc) !== Boolean(p.npc)) {
            cambios[`registro.${uid}.${p.id}`] = p.npc ? { nombre: p.nombre, npc: true } : { nombre: p.nombre };
        }
        const entrada = presencia[`m-${p.id}`];
        const idGrupo = grupos.get(`m-${p.id}`)?.id ?? null;
        if (!entrada || entrada.nombre !== p.nombre || (entrada.grupo ?? null) !== idGrupo
            || Date.now() - msDe(entrada.visto) > HORAS_REFRESCAR_VISTO_MS()) {
            cambios[`personajes.${uid}.m-${p.id}`] = { nombre: p.nombre, visto: f.serverTimestamp(), grupo: idGrupo, id: p.id };
        }
    }
    Object.keys(registro).filter(id => !ids.has(id)).forEach(id => { cambios[`registro.${uid}.${id}`] = f.deleteField(); });
    // Sin la entrada de la pestaña: en modo máster la sala ve a sus personajes, no a la pestaña
    Object.keys(presencia).filter(inst => !inst.startsWith("m-") || !ids.has(inst.slice(2)))
        .forEach(inst => { cambios[`personajes.${uid}.${inst}`] = f.deleteField(); });
    return cambios;
}

/** Modo máster: pone en la sala sus personajes de la sesión ([{ id, nombre }]); solo escribe si algo cambia */
export async function publicarPersonajesMaster(lista) {
    if (!masterEnSala() || !datosSala) return;
    const { db, f, uid } = exigirUsuario();
    // Nombres para sus grupos. Sacar un personaje de la sesión no lo saca de su grupo (solo se deja de escuchar;
    // al volver a añadirlo se reanuda): de un grupo solo se sale con Salir o si lo echa el líder
    const instancias = new Set(lista.map(p => `m-${p.id}`));
    nombresMaster.clear();
    lista.forEach(p => nombresMaster.set(`m-${p.id}`, p.nombre));
    [...grupos.keys()].filter(i => i.startsWith("m-") && !instancias.has(i)).forEach(pararGrupo);
    const recordados = gruposRecordados(estado.sala.codigo, true);
    instancias.forEach(inst => {
        if (grupos.has(inst)) sincronizarEntrada(inst).catch(() => { /* sin conexión */ });
        else if (recordados[inst]) escucharGrupo(inst, recordados[inst], { reanudando: true });
    });
    const cambios = cambiosMaster(f, uid, lista, datosSala);
    if (!Object.keys(cambios).length) return;
    await f.updateDoc(f.doc(db, "salas", estado.sala.codigo), cambios);
}

/**
 * Modo máster: quita un personaje de un jugador de la sala (registro y su estado). Solo si está desconectado.
 * Sus propios personajes se quitan sacándolos de la sesión (publicarPersonajesMaster).
 */
export async function echarPersonaje(jugador, id) {
    const { db, f } = exigirMaster();
    if (personajesSala.some(p => p.jugador === jugador && p.id === id)) {
        throw Object.assign(new Error("Está conectado: no se puede echar"), { code: "conectado" });
    }
    await f.updateDoc(f.doc(db, "salas", estado.sala.codigo), { [`registro.${jugador}.${id}`]: f.deleteField() });
    if (estadosSala[id]) {
        await f.deleteDoc(f.doc(db, "salas", estado.sala.codigo, "estados", id))
            .catch(error => console.warn("No se pudo borrar el estado del personaje:", error));
    }
    await f.deleteDoc(f.doc(db, "salas", estado.sala.codigo, "fichas", id))
        .catch(error => console.warn("No se pudo borrar la copia de la ficha:", error));
}

/** Copia de la ficha del personaje de esta pestaña para el máster de la sala (json = toJSONString) */
export async function guardarFichaSala(json) {
    const { db, f, uid } = exigirUsuario();
    if (!estado.sala || !personajeLocal.id || masterEnSala()) return;
    await f.setDoc(f.doc(db, "salas", estado.sala.codigo, "fichas", personajeLocal.id), {
        jugador: uid, master: estado.sala.master, json, actualizado: f.serverTimestamp()
    });
}

/** Modo máster: la última copia de la ficha de un personaje de la sala ({ json, actualizado (ms) }), o null */
export async function leerFichaSala(id) {
    const { db, f } = exigirMaster();
    const instantanea = await f.getDoc(f.doc(db, "salas", estado.sala.codigo, "fichas", id));
    if (!instantanea.exists()) return null;
    const datos = instantanea.data();
    return { json: datos.json, actualizado: datos.actualizado?.toMillis?.() ?? null };
}

/** Instancia (pestaña) en la que está conectado un personaje de la sala, o null */
export const instanciaDePersonaje = (jugador, id) =>
    personajesSala.find(p => p.jugador === jugador && p.id === id)?.instancia ?? null;

/** ¿Es este personaje (idPersonaje) el de esta pestaña? */
export const esPersonajeLocal = (id) => Boolean(id) && id === personajeLocal.id;

/* Estado del personaje para el máster (salas/{codigo}/estados/{idPersonaje}). Se escribe solo si cambia. */
let ultimoEstadoSala = null; // último estado que ha dado la ficha
let estadoSalaEscrito = null; // id + JSON de lo último escrito

/** La ficha da su vida y PA (fracciones), nivel, iniciativa y estados; en una sala (sin ser el máster) se publican */
export async function publicarEstadoSala(datos) {
    ultimoEstadoSala = datos;
    if (!estado.sala || !estado.usuario || !personajeLocal.id || masterEnSala() || !sdk) return;
    const { db, f } = sdk;
    const redondear = (n) => Math.round(Math.max(0, Math.min(1, Number(n) || 0)) * 100) / 100;
    const documento = {
        jugador: estado.usuario.uid,
        master: estado.sala.master,
        nombre: personajeLocal.nombre || "",
        vida: redondear(datos.vida),
        pa: redondear(datos.pa),
        nivel: Math.trunc(Number(datos.nivel) || 0),
        iniciativa: Math.round((Number(datos.iniciativa) || 0) * 10) / 10,
        estados: (Array.isArray(datos.estados) ? datos.estados : []).map(String).slice(0, 30),
        turno: Math.max(0, Math.trunc(Number(datos.turno) || 0))
    };
    const clave = `${estado.sala.codigo}|${personajeLocal.id}|${JSON.stringify(documento)}`;
    if (clave === estadoSalaEscrito) return;
    estadoSalaEscrito = clave;
    try {
        await f.setDoc(f.doc(db, "salas", estado.sala.codigo, "estados", personajeLocal.id), documento);
    } catch (error) {
        estadoSalaEscrito = null;
        throw error;
    }
}

/**
 * Entra en una sala por su código y empieza a escuchar sus eventos y artes. En una sola escritura: te añade a
 * los miembros (si no lo eras), apunta el personaje de esta pestaña, quita tus entradas caducadas y, si el
 * máster te había echado, la marca (se puede volver a entrar).
 */
export async function entrarSala(codigo, { actividad = Date.now() } = {}) {
    const { db, f, uid } = exigirUsuario();
    codigo = normalizarCodigo(codigo);
    if (!codigo) throw Object.assign(new Error("Escribe el código de la sala"), { code: "sin-codigo" });
    if (!personajeLocal.instancia) throw new Error("La ficha aún no está lista");
    const ref = f.doc(db, "salas", codigo);
    const instantanea = await f.getDoc(ref);
    if (!instantanea.exists()) throw Object.assign(new Error(`No existe ninguna sala con el código ${codigo}`), { code: "sala-no-existe" });
    const datos = instantanea.data();
    // Modo máster en su sala: entran sus personajes de la sesión; si no, el de la pestaña (con su nombre libre)
    const comoMaster = Boolean(proveedorMaster) && datos.master === uid;
    const listaMaster = comoMaster ? proveedorMaster({ codigo, registro: datos.registro ?? {}, uid }) : null;
    if (!comoMaster) {
        const motivo = motivoNombre(personajeLocal.nombre, datos.registro);
        if (motivo) throw Object.assign(new Error(`${motivo} Cambia el nombre de tu personaje para entrar.`), { code: "nombre-usado" });
    }

    if (estado.sala) {
        quitarPersonaje().catch(() => { /* se limpia al volver a entrar */ });
        dejarSala(); // los grupos se conservan: al volver a esa sala se reanudan
    }

    // Al recargar se sigue en el grupo (la instancia es la misma; los personajes del máster tienen la suya). Se
    // comprueba con el propio grupo al escucharlo: la entrada de la sala no sirve, porque al cerrar se borra.
    const gruposGuardados = {};
    if (comoMaster) {
        const suyos = new Set(listaMaster.map(p => `m-${p.id}`));
        Object.entries(gruposRecordados(codigo, true)).filter(([inst]) => suyos.has(inst)).forEach(([inst, id]) => { gruposGuardados[inst] = id; });
        nombresMaster.clear();
        listaMaster.forEach(p => nombresMaster.set(`m-${p.id}`, p.nombre));
    } else {
        const id = gruposRecordados(codigo, false)[personajeLocal.instancia];
        if (id) gruposGuardados[personajeLocal.instancia] = id;
    }
    // Ya cuentan para la entrada de la sala (campo grupo); se escuchan al terminar de entrar
    Object.entries(gruposGuardados).forEach(([inst, id]) => grupos.set(inst, { id, datos: null, parar: null }));

    const cambios = comoMaster
        ? cambiosMaster(f, uid, listaMaster, datos)
        : { [campoPersonaje(uid)]: datosPersonaje(f), ...cambiosRegistroPropio(f, uid, datos.registro) };
    if (!datos.miembros?.includes(uid)) cambios.miembros = f.arrayUnion(uid);
    if (datos.expulsados?.[uid]) cambios[`expulsados.${uid}`] = f.deleteField();
    const limite = Date.now() - HORAS_PERSONAJE_CADUCADO * HORA_MS;
    Object.entries(datos.personajes?.[uid] ?? {}).forEach(([instancia, p]) => {
        if (instancia !== personajeLocal.instancia && !instancia.startsWith("m-") && msDe(p?.visto) < limite) {
            cambios[`personajes.${uid}.${instancia}`] = f.deleteField();
        }
    });
    await f.updateDoc(ref, cambios);
    ultimoVisto = Date.now();
    datosSala = datos;
    estadoSalaEscrito = null;

    estado.sala = { codigo, nombre: datos.nombre, master: datos.master, ocultos: datos.ocultos ?? [] };
    ultimaActividad = Math.max(Number(actividad) || 0, 0);
    escribirSalaLocal({ codigo, nombre: datos.nombre, master: datos.master, actividad: ultimaActividad });
    escucharSala(codigo);
    Object.entries(gruposGuardados).forEach(([inst, id]) => escucharGrupo(inst, id, { reanudando: true }));
    limpiarEventosAntiguos(codigo);
    avisar("estado", copiaEstado());
    // El máster ve tu vida, PA... en su cabecera: se publica ya lo último que dio la ficha
    if (ultimoEstadoSala) publicarEstadoSala(ultimoEstadoSala).catch(error => console.warn("No se pudo publicar tu estado:", error));
    return copiaEstado();
}

/* Vuelve a escribir la entrada del personaje de esta pestaña (nombre nuevo o "visto" antiguo) */
async function publicarPersonaje() {
    const { db, f, uid } = exigirUsuario();
    if (!estado.sala || !personajeLocal.instancia) return;
    ultimoVisto = Date.now();
    if (masterEnSala()) {
        // En modo máster se refrescan sus personajes ("visto")
        if (proveedorMaster && datosSala) await publicarPersonajesMaster(proveedorMaster({ codigo: estado.sala.codigo, registro: datosSala.registro ?? {}, uid }));
        return;
    }
    await f.updateDoc(f.doc(db, "salas", estado.sala.codigo), {
        [campoPersonaje(uid)]: datosPersonaje(f),
        ...cambiosRegistroPropio(f, uid, datosSala?.registro)
    });
}

/* Quita el personaje de esta pestaña de la sala (al salir o cerrar la pestaña) */
async function quitarPersonaje() {
    if (!sdk || !estado.usuario || !estado.sala || !personajeLocal.instancia) return;
    const { db, f } = sdk;
    // En modo máster se desconectan sus personajes (siguen en el registro); si no, la entrada de la pestaña
    const cambios = {};
    camposAlDesconectar(estado.usuario.uid).forEach(partes => { cambios[partes.join(".")] = f.deleteField(); });
    if (Object.keys(cambios).length) await f.updateDoc(f.doc(db, "salas", estado.sala.codigo), cambios);
}

/** Al cerrar o recargar la pestaña: intenta quitar su personaje de la sala (si no llega, la recarga reutiliza
 *  la misma entrada y una pestaña cerrada caduca a las 25 h) */
export function alCerrarPestana() {
    if (!quitarPersonajeAlCerrar()) quitarPersonaje().catch(() => { /* mejor esfuerzo */ });
}

const CLAVE_DIAGNOSTICO_CIERRE = "fichaSAO.diagnosticoCierre";
/* Al cargar: muestra (una vez) lo que pasó al cerrar o recargar la última vez */
(function mostrarDiagnosticoCierre() {
    const linea = leerLocal(CLAVE_DIAGNOSTICO_CIERRE);
    if (!linea) return;
    console.info(linea);
    escribirLocal(CLAVE_DIAGNOSTICO_CIERRE, null);
})();

/* Campos de la sala que hay que borrar para desconectar esta pestaña: su entrada o, en modo máster, las "m-…" */
function camposAlDesconectar(uid) {
    if (masterEnSala()) {
        return Object.keys(datosSala?.personajes?.[uid] ?? {}).filter(inst => inst.startsWith("m-"))
            .map(inst => ["personajes", uid, inst]);
    }
    return personajeLocal.instancia ? [["personajes", uid, personajeLocal.instancia]] : [];
}

/* Al cerrar la pestaña, el SDK no llega a enviar la escritura: el navegador corta las peticiones de la página.
   Se envía por la API REST de Firestore con fetch keepalive, que sí termina aunque la página se cierre (las
   reglas de seguridad se aplican igual). Los campos de updateMask que no van en "fields" se borran.
   Devuelve false si no se puede (sin token o sin keepalive) para intentarlo con el SDK. */
function quitarPersonajeAlCerrar() {
    // Diagnóstico: qué se hace al cerrar o recargar. Se guarda y se muestra en la consola al volver a cargar
    // (mostrarDiagnosticoCierre), porque al recargar la consola se vacía.
    const aviso = (texto) => {
        const linea = `[sala] Al cerrar la pestaña (${new Date().toLocaleTimeString()}): ${texto}`;
        console.info(linea);
        escribirLocal(CLAVE_DIAGNOSTICO_CIERRE, linea);
    };
    if (!estado.usuario || !estado.sala) {
        aviso(`no hay ${!estado.usuario ? "sesión" : "sala"}, no se quita nada`);
        return true;
    }
    if (!tokenSesion) {
        aviso("sin token de sesión; se intenta con el SDK (puede no llegar)");
        return false;
    }
    const campos = camposAlDesconectar(estado.usuario.uid);
    aviso(campos.length ? `se quita ${campos.map(c => c[2]).join(", ")} de la sala ${estado.sala.codigo}` : "no hay nada que quitar");
    if (!campos.length) return true;
    try {
        enviarDesconexion(campos).catch(() => { /* mejor esfuerzo: si no llega, la entrada caduca a las 25 h */ });
        return true;
    } catch {
        return false;
    }
}

/* Borra esos campos del documento de sala con la API REST (fetch keepalive). Devuelve la promesa del fetch. */
function enviarDesconexion(campos) {
    const ruta = `projects/${firebaseConfig.projectId}/databases/(default)/documents`;
    const cuerpo = {
        writes: [{
            update: { name: `${ruta}/salas/${estado.sala.codigo}`, fields: {} },
            updateMask: { fieldPaths: campos.map(partes => partes.map(parte => `\`${parte}\``).join(".")) },
            currentDocument: { exists: true }
        }]
    };
    return fetch(`https://firestore.googleapis.com/v1/${ruta}:commit`, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenSesion}` },
        body: JSON.stringify(cuerpo)
    });
}

/**
 * Diagnóstico (consola, con ?debug: fichaProbarDesconexion()): envía la misma petición que al cerrar la pestaña,
 * sin cerrarla, y devuelve la respuesta de Firestore. El personaje sale de la sala; recarga para volver a entrar.
 */
export async function probarDesconexion() {
    if (!estado.usuario || !estado.sala) return "No hay sesión o sala.";
    if (!tokenSesion) return "No hay token de sesión.";
    const campos = camposAlDesconectar(estado.usuario.uid);
    if (!campos.length) return "No hay nada que quitar.";
    const respuesta = await enviarDesconexion(campos);
    return `${respuesta.status} ${respuesta.ok ? "OK: el personaje ha salido de la sala (recarga para volver)" : await respuesta.text()}`;
}

/* Los pop-ups solo sirven en directo: al entrar en una sala se borran los de más de un día.
 * Las reglas permiten borrar los de más de 24 h; aquí se usan 25 h de margen por si el reloj del
 * ordenador va adelantado (si el lote incluyera uno no permitido, fallaría entero). */
const HORAS_CONSERVAR_EVENTOS = 25;
const MAX_EVENTOS_LIMPIEZA = 400;

async function limpiarEventosAntiguos(codigo) {
    try {
        const { db, f } = sdk;
        const limite = f.Timestamp.fromMillis(Date.now() - HORAS_CONSERVAR_EVENTOS * HORA_MS);
        const viejos = await f.getDocs(f.query(f.collection(db, "salas", codigo, "eventos"),
            f.where("creado", "<", limite), f.limit(MAX_EVENTOS_LIMPIEZA)));
        if (viejos.empty) return;
        const lote = f.writeBatch(db);
        viejos.docs.forEach(d => lote.delete(d.ref));
        await lote.commit();
    } catch (error) {
        console.warn("No se pudieron borrar los pop-ups antiguos de la sala:", error);
    }
}

/** Salas en las que ya has entrado alguna vez */
export async function misSalas() {
    const { db, f, uid } = exigirUsuario();
    const resultado = await f.getDocs(f.query(f.collection(db, "salas"), f.where("miembros", "array-contains", uid)));
    return resultado.docs.map(d => ({ codigo: d.id, nombre: d.data().nombre, master: d.data().master }))
        .sort((x, y) => x.nombre.localeCompare(y.nombre));
}

function dejarSala() {
    pararTodosLosGrupos();
    dejarDeEscuchar.forEach(parar => parar());
    dejarDeEscuchar = [];
    estado.sala = null;
    personajesSala = [];
    datosSala = null;
    estadosSala = {};
    avisar("artesSala", []);
    avisar("personajes", []);
    avisar("estadosSala", {});
}

/** Nombres de usuario (usuarios/{uid}), con caché: solo se leen los que faltan. Para la gestión de sala. */
export async function nombresUsuarios(uids) {
    const { db, f } = exigirUsuario();
    const lista = await Promise.all([...new Set(uids)].map(async uid => {
        if (!nombresCache.has(uid)) {
            try {
                const instantanea = await f.getDoc(f.doc(db, "usuarios", uid));
                nombresCache.set(uid, instantanea.data()?.nombre || "Jugador");
            } catch {
                return [uid, "Jugador"];
            }
        }
        return [uid, nombresCache.get(uid)];
    }));
    return Object.fromEntries(lista);
}

/** Sale de la sala (sigue en "Tus salas" para volver con un clic). Los grupos se conservan: al volver se reanudan. */
export function salirSala() {
    quitarPersonaje().catch(() => { /* sin conexión: se limpia al volver a entrar */ });
    dejarSala();
    escribirSalaLocal(null);
    avisar("estado", copiaEstado());
}

/* Lista de personajes conectados a partir del documento de sala (sin caducados) */
function leerPersonajes(datos) {
    const limite = Date.now() - HORAS_PERSONAJE_CADUCADO * HORA_MS;
    const ocultos = datos.ocultos ?? [];
    return Object.entries(datos.personajes ?? {}).flatMap(([jugador, instancias]) =>
        Object.entries(instancias ?? {})
            .filter(([, p]) => msDe(p?.visto) >= limite)
            .map(([instancia, p]) => {
                const nombre = String(p?.nombre ?? "").trim();
                return { jugador, instancia, nombre, oculto: ocultos.includes(claveOculto(jugador, nombre)), grupo: p?.grupo ?? null, id: p?.id ?? null };
            }))
        .sort((x, y) => x.nombre.localeCompare(y.nombre));
}

function escucharSala(codigo) {
    const { db, f } = sdk;
    // Documento de la sala: personajes conectados, ocultos y expulsados (sin peticiones extra)
    dejarDeEscuchar.push(f.onSnapshot(f.doc(db, "salas", codigo), instantanea => {
        if (estado.sala?.codigo !== codigo) return; // se ha salido mientras tanto
        const datos = instantanea.data() ?? {};
        const uid = estado.usuario?.uid;
        if (uid && datos.expulsados?.[uid] && datos.master !== uid) {
            const nombre = estado.sala.nombre;
            dejarSala();
            escribirSalaLocal(null);
            avisar("estado", copiaEstado());
            avisar("salida", { motivo: "expulsado", nombre });
            return;
        }
        estado.sala = { ...estado.sala, nombre: datos.nombre ?? estado.sala.nombre, ocultos: datos.ocultos ?? [] };
        datosSala = datos;
        personajesSala = leerPersonajes(datos);
        avisar("personajes", getPersonajesSala());
    }, error => console.warn("Error escuchando la sala:", error)));

    // Modo máster en su sala: vida, PA, nivel, iniciativa y estados de los personajes de los jugadores
    if (masterEnSala()) {
        const estados = f.query(f.collection(db, "salas", codigo, "estados"), f.where("master", "==", estado.usuario.uid));
        dejarDeEscuchar.push(f.onSnapshot(estados, instantanea => {
            if (estado.sala?.codigo !== codigo) return;
            estadosSala = Object.fromEntries(instantanea.docs.map(d => [d.id, d.data()]));
            avisar("estadosSala", getEstadosSala());
        }, error => console.warn("Error escuchando los estados de la sala:", error)));
    }

    // Eventos: solo los que lleguen a partir de ahora
    const eventos = f.query(f.collection(db, "salas", codigo, "eventos"),
        f.where("creado", ">", f.Timestamp.now()), f.orderBy("creado"));
    dejarDeEscuchar.push(f.onSnapshot(eventos, instantanea => {
        instantanea.docChanges().forEach(cambio => {
            if (cambio.type !== "added") return;
            try {
                avisar("evento", JSON.parse(cambio.doc.data().evento));
            } catch (error) {
                console.warn("Evento ilegible", error);
            }
        });
    }, error => console.warn("Error escuchando los eventos de la sala:", error)));

    // Catálogo compartido de la sala
    dejarDeEscuchar.push(f.onSnapshot(f.collection(db, "salas", codigo, "artes"), instantanea => {
        const artes = instantanea.docs.flatMap(d => {
            const datos = d.data();
            try {
                return [{ id: d.id, autor: datos.autor, nombreAutor: datos.nombreAutor, arte: JSON.parse(datos.arte) }];
            } catch {
                return [];
            }
        });
        avisar("artesSala", artes);
    }, error => console.warn("Error escuchando las artes de la sala:", error)));
}

/** Envía un evento de eventos.js a la sala actual (sin sala no hace nada). Cuenta como actividad. */
export async function publicarEvento(evento) {
    if (!estado.sala) return;
    const { db, f, uid } = exigirUsuario();
    marcarActividad();
    if (Date.now() - ultimoVisto > HORAS_REFRESCAR_VISTO * HORA_MS) {
        publicarPersonaje().catch(error => console.warn("No se pudo refrescar el personaje en la sala:", error));
    }
    await f.addDoc(f.collection(db, "salas", estado.sala.codigo, "eventos"), {
        jugador: uid,
        evento: JSON.stringify(evento),
        creado: f.serverTimestamp()
    });
}

/* Grupos ______________________________________________________________________
 * salas/{codigo}/grupos/{id}. Solo lo escuchan sus integrantes (≤ 6), así los cambios de vida de un
 * integrante cuestan como mucho 5 lecturas. Cada uno escribe solo su entrada de "miembros"; el líder
 * además invita, echa y pasa el liderazgo. Las escrituras de un integrante que no es el líder llevan
 * "ultimo" = su instancia, para que las reglas sepan qué entrada toca. */

/* Cada personaje de esta pestaña puede estar en un grupo: el de la pestaña (su instancia) o, en modo máster, cada
   uno de sus personajes de la sesión (instancia "m-<idPersonaje>"). grupos: instancia → { id, datos, parar }.
   Solo se sale de un grupo con Salir o si lo echa el líder: ni al salir de la sala, ni por inactividad, ni al
   sacar un personaje del máster de la sesión. Se recuerda por sala para reanudarlo al volver o recargar:
   { <código de sala>: { <instancia>: id } }, el de la pestaña en sessionStorage y los del máster en localStorage
   (sus personajes no dependen de la pestaña). */
const grupos = new Map();
const CLAVE_GRUPOS_MASTER = "fichaSAO.gruposMaster";

/* Grupos recordados de una sala: { instancia: id } (master: los de sus personajes, en localStorage) */
function leerRecordados(master) {
    const almacen = master ? localStorage : sessionStorage;
    try {
        const datos = JSON.parse(almacen.getItem(master ? CLAVE_GRUPOS_MASTER : CLAVE_GRUPO));
        // Formato anterior: { codigo, id } o { codigo, grupos }
        if (datos?.codigo) return { [datos.codigo]: datos.grupos ?? (datos.id ? { [personajeLocal.instancia]: datos.id } : {}) };
        return datos && typeof datos === "object" ? datos : {};
    } catch {
        return {};
    }
}
const gruposRecordados = (codigo, master) => ({ ...(leerRecordados(master)[codigo] ?? {}) });
/* Apunta (id) u olvida (null) el grupo de un personaje en la sala actual */
function recordarGrupo(instancia, id) {
    if (!estado.sala) return;
    const master = instancia.startsWith("m-");
    const todos = leerRecordados(master);
    const sala = { ...(todos[estado.sala.codigo] ?? {}) };
    if (id) sala[instancia] = id;
    else delete sala[instancia];
    todos[estado.sala.codigo] = sala;
    try { (master ? localStorage : sessionStorage).setItem(master ? CLAVE_GRUPOS_MASTER : CLAVE_GRUPO, JSON.stringify(todos)); } catch { /* sin almacenamiento */ }
}

const refGrupo = (f, db, id) => f.doc(db, "salas", estado.sala.codigo, "grupos", id);

/* Personajes del máster en la sala: instancia "m-<id>" → nombre (de la última lista publicada) */
const nombresMaster = new Map();

/** Instancia con la que actúa esta pestaña: la suya o, en modo máster en su sala, la del personaje de la ficha */
export const instanciaActual = () => (masterEnSala() && personajeLocal.id ? `m-${personajeLocal.id}` : personajeLocal.instancia);
/* Instancia de un personaje de esta pestaña por su id (en modo máster, la de ese personaje suyo) */
const instanciaDeId = (id) => (masterEnSala() && id ? `m-${id}` : personajeLocal.instancia);
/** ¿Es una instancia de esta pestaña? (la suya o, en modo máster, la de uno de sus personajes de la sala) */
export const esInstanciaPropia = (instancia) => Boolean(instancia)
    && (instancia === personajeLocal.instancia || (masterEnSala() && nombresMaster.has(instancia)));
const nombreDe = (instancia) => (instancia.startsWith("m-") ? nombresMaster.get(instancia) : personajeLocal.nombre) || "";

/* Estado que cada personaje de esta pestaña publica en su grupo: { vida, pa, nivel, estados, iniciativa, turno }
   (lo da la interfaz). turno = hora (ms) en la que pulsó Play por última vez, o 0: el más reciente parpadea. */
const ESTADO_GRUPO_INICIAL = { vida: 1, pa: 0, nivel: 1, estados: [], iniciativa: 0, turno: 0 };
const estadosGrupo = new Map();

function normalizarEstadoGrupo({ vida, pa, nivel, estados, iniciativa, turno } = {}) {
    const fraccion = (v) => Math.round(Math.min(1, Math.max(0, Number(v) || 0)) * 100) / 100;
    return {
        vida: fraccion(vida),
        pa: fraccion(pa),
        nivel: Math.max(0, Math.trunc(Number(nivel) || 0)),
        estados: (Array.isArray(estados) ? estados : []).map(String).slice(0, 20),
        iniciativa: Math.round((Number(iniciativa) || 0) * 10) / 10,
        turno: Math.max(0, Math.trunc(Number(turno) || 0))
    };
}

const entradaDe = (instancia) => ({
    jugador: estado.usuario.uid, nombre: nombreDe(instancia), ...(estadosGrupo.get(instancia) ?? ESTADO_GRUPO_INICIAL)
});

/* Grupo en formato público: miembros ordenados por llegada. instancia = el personaje de esta pestaña que está en él */
function grupoPublico(id, datos, instancia) {
    const miembros = Object.entries(datos.miembros ?? {}).map(([inst, m]) => ({
        instancia: inst,
        jugador: m?.jugador ?? "",
        nombre: String(m?.nombre ?? ""),
        vida: Number(m?.vida) || 0,
        pa: Number(m?.pa) || 0,
        nivel: Number(m?.nivel) || 0,
        estados: Array.isArray(m?.estados) ? m.estados.map(String) : [],
        iniciativa: Number(m?.iniciativa) || 0,
        turno: Number(m?.turno) || 0,
        orden: Number(m?.orden) || 0,
        lider: inst === datos.lider
    })).sort((x, y) => x.orden - y.orden);
    return {
        id, instancia, lider: datos.lider, soyLider: datos.lider === instancia,
        invitados: Object.keys(datos.invitados ?? {}), miembros
    };
}

/** Grupo de un personaje de esta pestaña (por defecto, el que actúa ahora), o null */
export const getGrupo = (instancia = instanciaActual()) => {
    const g = grupos.get(instancia);
    return g?.datos ? structuredClone(g.datos) : null;
};
/** ¿Esa instancia está en el grupo de un personaje de esta pestaña (por defecto, el que actúa ahora)? */
export const enMiGrupo = (otra, instancia = instanciaActual()) =>
    Boolean(grupos.get(instancia)?.datos?.miembros.some(m => m.instancia === otra));

/* Deja de escuchar el grupo de un personaje (solo local) */
function pararGrupo(instancia) {
    const g = grupos.get(instancia);
    if (!g) return;
    g.parar?.();
    grupos.delete(instancia);
    avisar("grupo", getGrupo());
}
const pararTodosLosGrupos = () => [...grupos.keys()].forEach(pararGrupo);

/* Vuelve a escribir la entrada de la sala de un personaje (su campo grupo) */
async function actualizarPresencia(instancia) {
    if (!estado.sala) return;
    if (!instancia.startsWith("m-")) await publicarPersonaje();
    else if (masterEnSala() && proveedorMaster && datosSala) {
        await publicarPersonajesMaster(proveedorMaster({ codigo: estado.sala.codigo, registro: datosSala.registro ?? {}, uid: estado.usuario.uid }));
    }
}

/* reanudando: al recargar la pestaña; si ya no está en ese grupo, se olvida sin avisar */
function escucharGrupo(instancia, id, { reanudando = false } = {}) {
    const { db, f } = sdk;
    grupos.get(instancia)?.parar?.();
    const g = { id, datos: null, parar: null };
    grupos.set(instancia, g);
    recordarGrupo(instancia, id);
    let primera = true;
    g.parar = f.onSnapshot(refGrupo(f, db, id), instantanea => {
        if (grupos.get(instancia) !== g) return;
        const datos = instantanea.data();
        const silencioso = reanudando && primera;
        primera = false;
        // Grupo borrado o ya no está en él: lo han echado
        if (!datos || !datos.miembros?.[instancia]) {
            pararGrupo(instancia);
            recordarGrupo(instancia, null);
            actualizarPresencia(instancia).catch(() => { /* sin conexión */ });
            if (!silencioso) {
                avisar("salidaGrupo", { motivo: datos ? "echado" : "disuelto", nombre: nombreDe(instancia), propio: instancia === instanciaActual() });
            }
            return;
        }
        g.datos = grupoPublico(id, datos, instancia);
        avisar("grupo", getGrupo());
        // Al volver (recarga) o tras un cambio de nombre, se pone al día su entrada
        sincronizarEntrada(instancia).catch(error => console.warn("No se pudo actualizar el estado en el grupo:", error));
    }, error => console.warn("Error escuchando el grupo:", error));
}

function exigirSala() {
    const contexto = exigirUsuario();
    if (!estado.sala) throw Object.assign(new Error("Entra en una sala primero"), { code: "sin-sala" });
    return contexto;
}

/** Crea un grupo con el personaje que actúa como líder */
export async function crearGrupo() {
    const { db, f } = exigirSala();
    const instancia = instanciaActual();
    if (grupos.has(instancia)) throw new Error("Ya estás en un grupo");
    const ref = f.doc(f.collection(db, "salas", estado.sala.codigo, "grupos"));
    await f.setDoc(ref, {
        lider: instancia,
        liderJugador: estado.usuario.uid,
        invitados: {},
        miembros: { [instancia]: { ...entradaDe(instancia), orden: Date.now() } }
    });
    escucharGrupo(instancia, ref.id);
    await actualizarPresencia(instancia);
    return ref.id;
}

/** El líder (el personaje que actúa) invita a un personaje (instancia). Devuelve el id del grupo (para la invitación). */
export async function invitarAGrupo(otra) {
    const { db, f } = exigirSala();
    const g = grupos.get(instanciaActual());
    if (!g?.datos?.soyLider) throw new Error("Solo el líder del grupo puede invitar");
    if (g.datos.miembros.length >= MAX_GRUPO) throw new Error(`El grupo ya tiene ${MAX_GRUPO} integrantes`);
    await f.updateDoc(refGrupo(f, db, g.id), { [`invitados.${otra}`]: true });
    return g.id;
}

/** Acepta una invitación: el personaje (instancia; por defecto el que actúa) entra en el grupo si sigue invitado y hay sitio */
export async function unirseAGrupo(id, instancia = instanciaActual()) {
    const { db, f } = exigirSala();
    if (grupos.has(instancia)) throw new Error("Ya está en un grupo: tiene que salir primero");
    const ref = refGrupo(f, db, id);
    const instantanea = await f.getDoc(ref);
    const datos = instantanea.data();
    if (!datos) throw new Error("Ese grupo ya no existe");
    if (!datos.invitados?.[instancia]) throw new Error("La invitación ya no es válida");
    if (Object.keys(datos.miembros ?? {}).length >= MAX_GRUPO) throw new Error(`El grupo ya está lleno (${MAX_GRUPO})`);
    await f.updateDoc(ref, {
        [`miembros.${instancia}`]: { ...entradaDe(instancia), orden: Date.now() },
        [`invitados.${instancia}`]: f.deleteField(),
        ultimo: instancia
    });
    escucharGrupo(instancia, id);
    await actualizarPresencia(instancia);
}

/** Sale del grupo (instancia; por defecto el personaje que actúa). Si es el líder, el liderazgo pasa al siguiente;
 *  si queda solo, se borra. actualizarSala: false cuando a continuación se sale de la sala. */
export async function salirDeGrupo({ actualizarSala = true, instancia = instanciaActual() } = {}) {
    const g = grupos.get(instancia);
    if (!g || !sdk || !estado.usuario || !estado.sala) return;
    // Aún sin leer (recién reanudado): no se sabe si es el último ni si es líder; solo se deja de escuchar
    if (!g.datos) {
        pararGrupo(instancia);
        return;
    }
    const { db, f } = sdk;
    const ref = refGrupo(f, db, g.id);
    const resto = (g.datos?.miembros ?? []).filter(m => m.instancia !== instancia);
    const esLider = g.datos?.soyLider;
    pararGrupo(instancia);
    recordarGrupo(instancia, null);
    if (!resto.length) await f.deleteDoc(ref);
    else if (esLider) {
        await f.updateDoc(ref, {
            [`miembros.${instancia}`]: f.deleteField(),
            lider: resto[0].instancia,
            liderJugador: resto[0].jugador
        });
    } else {
        await f.updateDoc(ref, { [`miembros.${instancia}`]: f.deleteField(), ultimo: instancia });
    }
    if (actualizarSala && estado.sala) await actualizarPresencia(instancia);
}


/** El líder (el personaje que actúa) echa a un integrante */
export async function echarDeGrupo(otra) {
    const { db, f } = exigirSala();
    const instancia = instanciaActual();
    const g = grupos.get(instancia);
    if (!g?.datos?.soyLider) throw new Error("Solo el líder del grupo puede echar");
    if (otra === instancia) return;
    await f.updateDoc(refGrupo(f, db, g.id), { [`miembros.${otra}`]: f.deleteField() });
}

/**
 * Turno: pulsar Play (o empezar a la vez por tener la misma iniciativa) lo publica al momento, sin esperar,
 * en el grupo y en el estado para el máster. 0 = sin turno (zona segura o descanso).
 * id: el personaje (en modo máster, el suyo que empieza; sin él, el de la pestaña).
 */
export async function publicarTurno(turno, id = personajeLocal.id) {
    const instancia = instanciaDeId(id);
    const hora = Math.max(0, Math.trunc(Number(turno) || 0));
    estadosGrupo.set(instancia, { ...(estadosGrupo.get(instancia) ?? ESTADO_GRUPO_INICIAL), turno: hora });
    if (ultimoEstadoSala && !masterEnSala()) ultimoEstadoSala = { ...ultimoEstadoSala, turno: hora };
    await Promise.all([
        sincronizarEntrada(instancia),
        ultimoEstadoSala && !masterEnSala() ? publicarEstadoSala(ultimoEstadoSala) : null
    ]);
}

/** Publica la vida, PA (fracciones), nivel, estados, iniciativa y turno de un personaje en su grupo, solo si han
 *  cambiado. datos.id: el personaje (en modo máster, uno suyo). Fuera de un grupo solo los apunta. */
export async function publicarEstadoGrupo(datos) {
    const instancia = instanciaDeId(datos?.id);
    estadosGrupo.set(instancia, normalizarEstadoGrupo(datos));
    await sincronizarEntrada(instancia);
}

/* Escribe la entrada de un personaje en su grupo solo si lo que hay en el grupo es distinto (estado o nombre) */
async function sincronizarEntrada(instancia) {
    const g = grupos.get(instancia);
    if (!g?.datos || !estado.sala || !estado.usuario) return;
    const propio = g.datos.miembros.find(m => m.instancia === instancia);
    if (!propio) return;
    const deseado = entradaDe(instancia);
    const actual = { jugador: propio.jugador, nombre: propio.nombre, vida: propio.vida, pa: propio.pa, nivel: propio.nivel,
        estados: propio.estados, iniciativa: propio.iniciativa, turno: propio.turno };
    if (JSON.stringify(actual) === JSON.stringify(deseado)) return;
    const { db, f } = sdk;
    const cambios = { [`miembros.${instancia}`]: { ...deseado, orden: propio.orden } };
    if (!g.datos.soyLider) cambios.ultimo = instancia;
    await f.updateDoc(refGrupo(f, db, g.id), cambios);
}

/* Máster ______________________________________________________________________ */

function exigirMaster() {
    const contexto = exigirUsuario();
    if (!soyMasterSala()) throw Object.assign(new Error("Solo el máster de la sala puede hacer eso"), { code: "permission-denied" });
    return contexto;
}

/** Oculta o muestra un personaje a los demás (no se le puede ofrecer nada y sus tiradas salen sin el cálculo) */
export async function cambiarOculto(jugador, nombre, ocultar) {
    const { db, f } = exigirMaster();
    const clave = claveOculto(jugador, nombre);
    await f.updateDoc(f.doc(db, "salas", estado.sala.codigo), { ocultos: ocultar ? f.arrayUnion(clave) : f.arrayRemove(clave) });
}

/** Echa a un jugador: sale de la sala, pero la conserva en "Tus salas" y puede volver a entrar */
export async function expulsar(jugador) {
    const { db, f, uid } = exigirMaster();
    if (jugador === uid) return;
    await f.updateDoc(f.doc(db, "salas", estado.sala.codigo), {
        [`expulsados.${jugador}`]: true,
        [`personajes.${jugador}`]: f.deleteField()
    });
}

/* Artes compartidas de la sala ________________________________________________ */

/** id (también id del documento): minúsculas, para que valga como id de arte ("sala-xxxx") */
const nuevoIdArteSala = () => `sala-${codigoAleatorio(10).toLowerCase()}`;

/** Crea (sin id) o actualiza un arte compartida. Devuelve su id. */
export async function guardarArteSala(arte, id = null) {
    const { db, f, uid } = exigirUsuario();
    if (!estado.sala) throw Object.assign(new Error("No estás en ninguna sala"), { code: "sin-sala" });
    id ??= nuevoIdArteSala();
    // En el catálogo no van los datos de la ficha (id propio, de dónde salió, si está equipada)
    const { id: _id, idCatalogo: _origen, equipada: _equipada, ...datosArte } = arte;
    await f.setDoc(f.doc(db, "salas", estado.sala.codigo, "artes", id), {
        autor: uid,
        nombreAutor: estado.usuario.nombre,
        nombre: datosArte.nombre,
        arte: JSON.stringify(datosArte),
        actualizado: f.serverTimestamp()
    });
    return id;
}

export async function borrarArteSala(id) {
    const { db, f } = exigirUsuario();
    if (!estado.sala) return;
    await f.deleteDoc(f.doc(db, "salas", estado.sala.codigo, "artes", id));
}

/* Personajes en la nube _______________________________________________________ */

export async function listarPersonajes() {
    const { db, f, uid } = exigirUsuario();
    const resultado = await f.getDocs(f.query(f.collection(db, "personajes"), f.where("propietario", "==", uid)));
    return resultado.docs.map(d => ({ id: d.id, nombre: d.data().nombre, actualizado: d.data().actualizado?.toDate() ?? null }))
        .sort((x, y) => (y.actualizado ?? 0) - (x.actualizado ?? 0));
}

/** Guarda la ficha (json = personaje.toJSONString()). Sin id crea una nueva. Devuelve el id. */
export async function guardarPersonaje(json, nombre, id = null) {
    const { db, f, uid } = exigirUsuario();
    const ref = id ? f.doc(db, "personajes", id) : f.doc(f.collection(db, "personajes"));
    await f.setDoc(ref, { propietario: uid, nombre: String(nombre ?? ""), json, actualizado: f.serverTimestamp() });
    return ref.id;
}

/** Devuelve el JSON (texto) de la ficha */
export async function cargarPersonaje(id) {
    const { db, f } = exigirUsuario();
    const instantanea = await f.getDoc(f.doc(db, "personajes", id));
    if (!instantanea.exists()) throw Object.assign(new Error("Ese personaje ya no existe"), { code: "no-existe" });
    return instantanea.data().json;
}

export async function borrarPersonaje(id) {
    const { db, f } = exigirUsuario();
    await f.deleteDoc(f.doc(db, "personajes", id));
}

/* Compendio de NPC del máster (compendio.js) ___________________________________
 * compendios/{uid} = { paginas (cuántas), actualizado (ms del último cambio) } y compendios/{uid}/paginas/{n} =
 * { plantillas } (texto JSON). Solo lo lee y escribe su dueño. Leer = 1 + n lecturas; guardar = un lote con
 * las páginas cambiadas y el índice. */

/* Los dos compendios: colección y campo de texto de cada página */
const COMPENDIOS = {
    npc: { coleccion: "compendios", campo: "plantillas" },
    objetos: { coleccion: "compendiosObjetos", campo: "objetos" }
};

/** Solo el índice: { actualizado, total }, o null si no hay compendio en la nube (1 lectura) */
export async function leerIndiceCompendio(tipo = "npc", dueno = null) {
    const { db, f, uid } = exigirUsuario();
    const indice = await f.getDoc(f.doc(db, COMPENDIOS[tipo].coleccion, dueno ?? uid));
    if (!indice.exists()) return null;
    return { actualizado: Number(indice.data().actualizado) || 0, total: Math.max(0, Math.trunc(Number(indice.data().paginas) || 0)) };
}

/** Las páginas de un compendio ya leído su índice (1 lectura por página) */
async function leerPaginasCompendio(tipo, dueno, total) {
    const { db, f } = exigirUsuario();
    const { coleccion, campo } = COMPENDIOS[tipo];
    return Promise.all(Array.from({ length: total }, (_, n) =>
        f.getDoc(f.doc(db, coleccion, dueno, "paginas", String(n)))
            .then(d => (d.exists() ? String(d.data()[campo] ?? "[]") : "[]"))));
}

/**
 * { actualizado, paginas: [texto] }, o null si aún no tiene compendio en la nube. tipo: "npc" u "objetos";
 * dueno: uid del compendio (por defecto el tuyo; los objetos comunes del máster de la sala los leen sus jugadores).
 * siNoEs: si el índice tiene este `actualizado`, no se leen las páginas y se devuelve { actualizado, sinCambios: true }.
 */
export async function leerCompendio(tipo = "npc", dueno = null, siNoEs = null) {
    const { uid } = exigirUsuario();
    const indice = await leerIndiceCompendio(tipo, dueno);
    if (!indice) return null;
    if (siNoEs !== null && indice.actualizado === siNoEs) return { actualizado: indice.actualizado, sinCambios: true };
    return { actualizado: indice.actualizado, paginas: await leerPaginasCompendio(tipo, dueno ?? uid, indice.total) };
}

/** Sube las páginas cambiadas ({ n: texto }), borra las que sobran y actualiza el índice, todo a la vez */
export async function guardarPaginasCompendio({ actualizado, total, paginas, borrar = [] }, tipo = "npc") {
    const { db, f, uid } = exigirUsuario();
    const { coleccion, campo } = COMPENDIOS[tipo];
    const lote = f.writeBatch(db);
    Object.entries(paginas).forEach(([n, texto]) => lote.set(f.doc(db, coleccion, uid, "paginas", String(n)), { [campo]: texto }));
    borrar.forEach(n => lote.delete(f.doc(db, coleccion, uid, "paginas", String(n))));
    lote.set(f.doc(db, coleccion, uid), { paginas: total, actualizado });
    await lote.commit();
}

/* Errores _____________________________________________________________________ */

const MENSAJES_ERROR = {
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/invalid-login-credentials": "Correo o contraseña incorrectos.",
    "auth/wrong-password": "Correo o contraseña incorrectos.",
    "auth/user-not-found": "Correo o contraseña incorrectos.",
    "auth/invalid-email": "El correo no es válido.",
    "auth/missing-password": "Escribe la contraseña.",
    "auth/email-already-in-use": "Ya hay una cuenta con ese correo.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/too-many-requests": "Demasiados intentos. Espera un poco y vuelve a probar.",
    "auth/network-request-failed": "Sin conexión con el servidor.",
    "auth/unauthorized-domain": "Esta web no está autorizada en Firebase (Authentication → Dominios autorizados).",
    "permission-denied": "No tienes permiso para hacer eso.",
    "unavailable": "Sin conexión con el servidor."
};

/** Mensaje en español para mostrar al usuario */
export function mensajeError(error) {
    return MENSAJES_ERROR[error?.code] ?? error?.message ?? String(error);
}
