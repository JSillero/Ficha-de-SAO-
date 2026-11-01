/* Capa online (Firebase Auth + Firestore). Es lo único que conoce Firebase: si algún día se cambia de
 * backend (p. ej. Spring Boot), solo hay que reescribir este fichero manteniendo las mismas funciones.
 *
 * Firestore (reglas en firestore.rules; explicación completa en .claude/11-online.md):
 * - personajes/{id}: { propietario, nombre, json, actualizado }    json = personaje.toJSONString()
 * - usuarios/{uid}: { nombre }                                     nombre de usuario (solo en la gestión de sala)
 * - salas/{codigo}: { nombre, master, miembros: [uid], creada,
 *       personajes: { uid: { instancia: { nombre, visto } } },     personajes conectados (una entrada por pestaña)
 *       ocultos: ["uid:nombre"],                                   personajes que el máster oculta
 *       expulsados: { uid: true } }                                echados por el máster (pueden volver a entrar)
 *       (cada entrada de personaje lleva también grupo: id del grupo en el que está, o null)
 * - salas/{codigo}/grupos/{id}: { lider, liderJugador, invitados: { instancia: true }, ultimo,
 *       miembros: { instancia: { jugador, nombre, vida, pa, nivel, estados, orden } } }
 *       grupo de hasta 6 personajes; solo lo escuchan sus integrantes. vida y pa son fracciones (0-1)
 * - salas/{codigo}/eventos/{auto}: { jugador, evento, creado }     evento = JSON de eventos.js
 * - salas/{codigo}/artes/{id}: { autor, nombreAutor, nombre, arte, actualizado }   arte = JSON del arte
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
let sdk = null; // { auth, db, a (módulo auth), f (módulo firestore) }

/** Estado público: usuario { uid, nombre, email } y sala { codigo, nombre, master, ocultos } */
const estado = { usuario: null, sala: null };
let dejarDeEscuchar = [];
const oyentes = {
    estado: new Set(), evento: new Set(), artesSala: new Set(), personajes: new Set(), salida: new Set(),
    grupo: new Set(), salidaGrupo: new Set()
};
/* Personajes conectados a la sala actual: [{ jugador, instancia, nombre, oculto }] (también los tuyos) */
let personajesSala = [];
const nombresCache = new Map();

/* Personaje de esta pestaña: instancia (instancia.js) y nombre, para la lista de conectados */
const personajeLocal = { instancia: null, nombre: "" };
/* Grupo de este personaje: id, último estado leído (grupoPublico) y función para dejar de escucharlo.
   Se recuerda en sessionStorage { codigo, id } para seguir en él al recargar la pestaña. */
const CLAVE_GRUPO = "fichaSAO.grupo";
const MAX_GRUPO = 6;
const grupo = { id: null, datos: null, parar: null };
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

export function getEstado() { return copiaEstado(); }
export function getPersonajesSala() { return personajesSala.map(p => ({ ...p })); }

/** Clave de un personaje para ocultarlo: "uid:nombre" (si cambia de nombre deja de estar oculto) */
export const claveOculto = (jugador, nombre) => `${jugador}:${String(nombre ?? "").trim()}`;

/** Instancia (pestaña) y nombre del personaje de esta ficha. Si cambia el nombre estando en una sala, se publica. */
export function configurarPersonaje({ instancia, nombre } = {}) {
    if (instancia !== undefined) personajeLocal.instancia = instancia;
    if (nombre === undefined) return;
    nombre = String(nombre ?? "").trim().slice(0, 60);
    if (nombre === personajeLocal.nombre) return;
    personajeLocal.nombre = nombre;
    if (estado.sala) publicarPersonaje().catch(error => console.warn("No se pudo actualizar el personaje en la sala:", error));
}

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
                await entrarSala(sala.codigo, { actividad: sala.actividad }).catch(() => escribirSalaLocal(null));
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
        // Antes de cerrar la sesión, que después ya no hay permiso para escribir
        await salirDeGrupo({ actualizarSala: false }).catch(() => { /* sin conexión */ });
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
const datosPersonaje = (f) => ({ nombre: personajeLocal.nombre || "", visto: f.serverTimestamp(), grupo: grupo.id });

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

    if (estado.sala) {
        salirDeGrupo({ actualizarSala: false }).catch(() => { /* sin conexión */ });
        quitarPersonaje().catch(() => { /* se limpia al volver a entrar */ });
        dejarSala();
    }

    // Al recargar la pestaña se sigue en el grupo (la instancia es la misma). Se comprueba con el propio grupo
    // al escucharlo: la entrada de la sala no sirve, porque al cerrar la pestaña se borra.
    const grupoGuardado = leerGrupoLocal();
    grupo.id = grupoGuardado?.codigo === codigo ? grupoGuardado.id : null;

    const cambios = { [campoPersonaje(uid)]: datosPersonaje(f) };
    if (!datos.miembros?.includes(uid)) cambios.miembros = f.arrayUnion(uid);
    if (datos.expulsados?.[uid]) cambios[`expulsados.${uid}`] = f.deleteField();
    const limite = Date.now() - HORAS_PERSONAJE_CADUCADO * HORA_MS;
    Object.entries(datos.personajes?.[uid] ?? {}).forEach(([instancia, p]) => {
        if (instancia !== personajeLocal.instancia && msDe(p?.visto) < limite) cambios[`personajes.${uid}.${instancia}`] = f.deleteField();
    });
    await f.updateDoc(ref, cambios);
    ultimoVisto = Date.now();

    estado.sala = { codigo, nombre: datos.nombre, master: datos.master, ocultos: datos.ocultos ?? [] };
    ultimaActividad = Math.max(Number(actividad) || 0, 0);
    escribirSalaLocal({ codigo, nombre: datos.nombre, master: datos.master, actividad: ultimaActividad });
    escucharSala(codigo);
    if (grupo.id) escucharGrupo(grupo.id, { reanudando: true });
    else escribirGrupoLocal(null);
    limpiarEventosAntiguos(codigo);
    avisar("estado", copiaEstado());
    return copiaEstado();
}

/* Vuelve a escribir la entrada del personaje de esta pestaña (nombre nuevo o "visto" antiguo) */
async function publicarPersonaje() {
    const { db, f, uid } = exigirUsuario();
    if (!estado.sala || !personajeLocal.instancia) return;
    ultimoVisto = Date.now();
    await f.updateDoc(f.doc(db, "salas", estado.sala.codigo), { [campoPersonaje(uid)]: datosPersonaje(f) });
}

/* Quita el personaje de esta pestaña de la sala (al salir o cerrar la pestaña) */
async function quitarPersonaje() {
    if (!sdk || !estado.usuario || !estado.sala || !personajeLocal.instancia) return;
    const { db, f } = sdk;
    await f.updateDoc(f.doc(db, "salas", estado.sala.codigo), { [campoPersonaje(estado.usuario.uid)]: f.deleteField() });
}

/** Al cerrar o recargar la pestaña: intenta quitar su personaje de la sala (si no llega, la recarga reutiliza
 *  la misma entrada y una pestaña cerrada caduca a las 25 h) */
export function alCerrarPestana() {
    quitarPersonaje().catch(() => { /* mejor esfuerzo */ });
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
    pararGrupo();
    dejarDeEscuchar.forEach(parar => parar());
    dejarDeEscuchar = [];
    estado.sala = null;
    personajesSala = [];
    avisar("artesSala", []);
    avisar("personajes", []);
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

/** Sale de la sala (sigue en "Tus salas" para volver con un clic). También deja el grupo. */
export function salirSala() {
    salirDeGrupo({ actualizarSala: false }).catch(() => { /* sin conexión */ });
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
                return { jugador, instancia, nombre, oculto: ocultos.includes(claveOculto(jugador, nombre)), grupo: p?.grupo ?? null };
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
        personajesSala = leerPersonajes(datos);
        avisar("personajes", getPersonajesSala());
    }, error => console.warn("Error escuchando la sala:", error)));

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

const leerGrupoLocal = () => {
    try { return JSON.parse(sessionStorage.getItem(CLAVE_GRUPO)); } catch { return null; }
};
const escribirGrupoLocal = (datos) => {
    try { datos ? sessionStorage.setItem(CLAVE_GRUPO, JSON.stringify(datos)) : sessionStorage.removeItem(CLAVE_GRUPO); } catch { /* sin almacenamiento */ }
};

const refGrupo = (f, db, id) => f.doc(db, "salas", estado.sala.codigo, "grupos", id);

/* Estado propio que se publica en el grupo: { vida, pa, nivel, estados } (lo da la interfaz) */
let estadoGrupoLocal = { vida: 1, pa: 0, nivel: 1, estados: [] };

function normalizarEstadoGrupo({ vida, pa, nivel, estados } = {}) {
    const fraccion = (v) => Math.round(Math.min(1, Math.max(0, Number(v) || 0)) * 100) / 100;
    return {
        vida: fraccion(vida),
        pa: fraccion(pa),
        nivel: Math.max(0, Math.trunc(Number(nivel) || 0)),
        estados: (Array.isArray(estados) ? estados : []).map(String).slice(0, 20)
    };
}

const entradaPropia = () => ({ jugador: estado.usuario.uid, nombre: personajeLocal.nombre || "", ...estadoGrupoLocal });

/* Grupo en formato público: miembros ordenados por llegada */
function grupoPublico(id, datos) {
    const miembros = Object.entries(datos.miembros ?? {}).map(([instancia, m]) => ({
        instancia,
        jugador: m?.jugador ?? "",
        nombre: String(m?.nombre ?? ""),
        vida: Number(m?.vida) || 0,
        pa: Number(m?.pa) || 0,
        nivel: Number(m?.nivel) || 0,
        estados: Array.isArray(m?.estados) ? m.estados.map(String) : [],
        orden: Number(m?.orden) || 0,
        lider: instancia === datos.lider
    })).sort((x, y) => x.orden - y.orden);
    return {
        id, lider: datos.lider, soyLider: datos.lider === personajeLocal.instancia,
        invitados: Object.keys(datos.invitados ?? {}), miembros
    };
}

export const getGrupo = () => grupo.datos && structuredClone(grupo.datos);
/** ¿Esa instancia (pestaña de un personaje) está en tu grupo? */
export const enMiGrupo = (instancia) => Boolean(grupo.datos?.miembros.some(m => m.instancia === instancia));

/* Deja de escuchar el grupo (solo local) */
function pararGrupo() {
    grupo.parar?.();
    const habia = grupo.id !== null;
    grupo.id = null;
    grupo.datos = null;
    grupo.parar = null;
    if (habia) avisar("grupo", null);
}

/* reanudando: al recargar la pestaña; si ya no estás en ese grupo, se olvida sin avisar */
function escucharGrupo(id, { reanudando = false } = {}) {
    const { db, f } = sdk;
    grupo.parar?.();
    grupo.id = id;
    escribirGrupoLocal({ codigo: estado.sala.codigo, id });
    let primera = true;
    grupo.parar = f.onSnapshot(refGrupo(f, db, id), instantanea => {
        if (grupo.id !== id) return;
        const datos = instantanea.data();
        const silencioso = reanudando && primera;
        primera = false;
        // Grupo borrado o ya no estás en él: te han echado
        if (!datos || !datos.miembros?.[personajeLocal.instancia]) {
            pararGrupo();
            escribirGrupoLocal(null);
            publicarPersonaje().catch(() => { /* sin conexión */ });
            if (!silencioso) avisar("salidaGrupo", { motivo: datos ? "echado" : "disuelto" });
            return;
        }
        grupo.datos = grupoPublico(id, datos);
        avisar("grupo", getGrupo());
        // Al volver a una pestaña (recarga) o tras un cambio de nombre, se pone al día tu entrada
        sincronizarEntradaPropia().catch(error => console.warn("No se pudo actualizar tu estado en el grupo:", error));
    }, error => console.warn("Error escuchando el grupo:", error));
}

function exigirSala() {
    const contexto = exigirUsuario();
    if (!estado.sala) throw Object.assign(new Error("Entra en una sala primero"), { code: "sin-sala" });
    return contexto;
}

/** Crea un grupo contigo como líder */
export async function crearGrupo() {
    const { db, f } = exigirSala();
    if (grupo.id) throw new Error("Ya estás en un grupo");
    const ref = f.doc(f.collection(db, "salas", estado.sala.codigo, "grupos"));
    await f.setDoc(ref, {
        lider: personajeLocal.instancia,
        liderJugador: estado.usuario.uid,
        invitados: {},
        miembros: { [personajeLocal.instancia]: { ...entradaPropia(), orden: Date.now() } }
    });
    escucharGrupo(ref.id);
    await publicarPersonaje();
    return ref.id;
}

/** El líder invita a un personaje (instancia). Devuelve el id del grupo (para la invitación). */
export async function invitarAGrupo(instancia) {
    const { db, f } = exigirSala();
    if (!grupo.datos?.soyLider) throw new Error("Solo el líder del grupo puede invitar");
    if (grupo.datos.miembros.length >= MAX_GRUPO) throw new Error(`El grupo ya tiene ${MAX_GRUPO} integrantes`);
    await f.updateDoc(refGrupo(f, db, grupo.id), { [`invitados.${instancia}`]: true });
    return grupo.id;
}

/** Acepta una invitación: entra en el grupo (si sigue invitado y hay sitio) */
export async function unirseAGrupo(id) {
    const { db, f } = exigirSala();
    if (grupo.id) throw new Error("Ya estás en un grupo: sal primero");
    const ref = refGrupo(f, db, id);
    const instantanea = await f.getDoc(ref);
    const datos = instantanea.data();
    if (!datos) throw new Error("Ese grupo ya no existe");
    if (!datos.invitados?.[personajeLocal.instancia]) throw new Error("La invitación ya no es válida");
    if (Object.keys(datos.miembros ?? {}).length >= MAX_GRUPO) throw new Error(`El grupo ya está lleno (${MAX_GRUPO})`);
    await f.updateDoc(ref, {
        [`miembros.${personajeLocal.instancia}`]: { ...entradaPropia(), orden: Date.now() },
        [`invitados.${personajeLocal.instancia}`]: f.deleteField(),
        ultimo: personajeLocal.instancia
    });
    escucharGrupo(id);
    await publicarPersonaje();
}

/** Sale del grupo. Si eres el líder, el liderazgo pasa al siguiente; si quedas solo, se borra.
 *  actualizarSala: false cuando a continuación se sale de la sala (su entrada se va a borrar). */
export async function salirDeGrupo({ actualizarSala = true } = {}) {
    if (!grupo.id || !sdk || !estado.usuario || !estado.sala) return;
    const { db, f } = sdk;
    const ref = refGrupo(f, db, grupo.id);
    const instancia = personajeLocal.instancia;
    const resto = (grupo.datos?.miembros ?? []).filter(m => m.instancia !== instancia);
    const soyLider = grupo.datos?.soyLider;
    pararGrupo();
    escribirGrupoLocal(null);
    if (!resto.length) await f.deleteDoc(ref);
    else if (soyLider) {
        await f.updateDoc(ref, {
            [`miembros.${instancia}`]: f.deleteField(),
            lider: resto[0].instancia,
            liderJugador: resto[0].jugador
        });
    } else {
        await f.updateDoc(ref, { [`miembros.${instancia}`]: f.deleteField(), ultimo: instancia });
    }
    if (actualizarSala && estado.sala) await publicarPersonaje();
}

/** El líder echa a un integrante */
export async function echarDeGrupo(instancia) {
    const { db, f } = exigirSala();
    if (!grupo.datos?.soyLider) throw new Error("Solo el líder del grupo puede echar");
    if (instancia === personajeLocal.instancia) return;
    await f.updateDoc(refGrupo(f, db, grupo.id), { [`miembros.${instancia}`]: f.deleteField() });
}

/** Publica tu vida, PA (fracciones), nivel y estados en el grupo, solo si han cambiado.
 *  Fuera de un grupo solo los apunta (se usan al crear o entrar en uno). */
export async function publicarEstadoGrupo(datos) {
    estadoGrupoLocal = normalizarEstadoGrupo(datos);
    await sincronizarEntradaPropia();
}

/* Escribe tu entrada del grupo solo si lo que hay en el grupo es distinto (estado o nombre) */
async function sincronizarEntradaPropia() {
    if (!grupo.id || !grupo.datos || !estado.sala || !estado.usuario) return;
    const propio = grupo.datos.miembros.find(m => m.instancia === personajeLocal.instancia);
    if (!propio) return;
    const deseado = entradaPropia();
    const actual = { jugador: propio.jugador, nombre: propio.nombre, vida: propio.vida, pa: propio.pa, nivel: propio.nivel, estados: propio.estados };
    if (JSON.stringify(actual) === JSON.stringify(deseado)) return;
    const { db, f } = sdk;
    const cambios = { [`miembros.${personajeLocal.instancia}`]: { ...deseado, orden: propio.orden } };
    if (!grupo.datos.soyLider) cambios.ultimo = personajeLocal.instancia;
    await f.updateDoc(refGrupo(f, db, grupo.id), cambios);
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
