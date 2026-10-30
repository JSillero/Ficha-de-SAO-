/* Capa online (Firebase Auth + Firestore). Es lo único que conoce Firebase: si algún día se cambia de
 * backend (p. ej. Spring Boot), solo hay que reescribir este fichero manteniendo las mismas funciones.
 *
 * Firestore (reglas en firestore.rules):
 * - personajes/{id}: { propietario, nombre, json, actualizado }    json = personaje.toJSONString()
 * - salas/{codigo}: { nombre, master, miembros: [uid], creada }    se entra con el código
 * - salas/{codigo}/eventos/{auto}: { jugador, evento, creado }     evento = JSON de eventos.js
 * - salas/{codigo}/artes/{id}: { autor, nombreAutor, nombre, arte, actualizado }   arte = JSON del arte
 *
 * El SDK solo se descarga al iniciar sesión, o al arrancar si la última vez se dejó la sesión abierta. */
import { firebaseConfig, VERSION_SDK_FIREBASE } from "./config.js";

const URL_SDK = `https://www.gstatic.com/firebasejs/${VERSION_SDK_FIREBASE}/`;
/* localStorage: hay sesión abierta (para cargar el SDK al arrancar) y última sala */
const CLAVE_SESION = "fichaSesionOnline";
const CLAVE_SALA = "fichaSalaOnline";
const LETRAS_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

let promesaSdk = null;
let sdk = null; // { auth, db, a (módulo auth), f (módulo firestore) }

/** Estado público: usuario { uid, nombre, email } y sala { codigo, nombre, master } */
const estado = { usuario: null, sala: null };
let dejarDeEscuchar = [];
const oyentes = { estado: new Set(), evento: new Set(), artesSala: new Set(), miembros: new Set() };
/* Jugadores de la sala actual: [{ uid, nombre }] (nombres de usuarios/{uid}) */
let miembros = [];
const nombresCache = new Map();

/* Comodidad: si localStorage falla (modo privado...) la ficha sigue igual */
const leerLocal = (clave) => { try { return localStorage.getItem(clave); } catch { return null; } };
const escribirLocal = (clave, valor) => {
    try { valor === null ? localStorage.removeItem(clave) : localStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ }
};

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

const copiaEstado = () => ({ usuario: estado.usuario && { ...estado.usuario }, sala: estado.sala && { ...estado.sala } });

/** cb(estado) al iniciar/cerrar sesión o entrar/salir de sala. Devuelve la función para quitarlo. */
export function alCambiarEstado(cb) { oyentes.estado.add(cb); return () => oyentes.estado.delete(cb); }
/** cb(evento) por cada evento de la sala (también los propios; eventos.js los descarta) */
export function alRecibirEvento(cb) { oyentes.evento.add(cb); return () => oyentes.evento.delete(cb); }
/** cb(lista) con las artes compartidas de la sala: [{ id, autor, nombreAutor, arte }] */
export function alCambiarArtesSala(cb) { oyentes.artesSala.add(cb); return () => oyentes.artesSala.delete(cb); }

/** cb(lista) con los jugadores de la sala: [{ uid, nombre }] (también tú) */
export function alCambiarMiembros(cb) { oyentes.miembros.add(cb); return () => oyentes.miembros.delete(cb); }

export function getEstado() { return copiaEstado(); }
export function getMiembros() { return miembros.map(m => ({ ...m })); }

/* Nombre público del jugador (usuarios/{uid}): lo ven los demás al elegir a quién ofrecer algo */
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

/** Al arrancar: si la última vez se dejó la sesión abierta, la recupera y vuelve a la última sala. */
export async function iniciar() {
    if (!leerLocal(CLAVE_SESION)) return copiaEstado();
    try {
        await prepararAuth();
        const sala = leerLocal(CLAVE_SALA);
        if (estado.usuario && sala) await entrarSala(sala).catch(() => escribirLocal(CLAVE_SALA, null));
    } catch (error) {
        console.warn("No se pudo conectar con Firebase:", error);
    }
    return copiaEstado();
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
    if (estado.sala) dejarSala();
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

export async function crearSala(nombre) {
    const { db, f, uid } = exigirUsuario();
    const codigo = codigoAleatorio();
    await f.setDoc(f.doc(db, "salas", codigo), {
        nombre: String(nombre).trim().slice(0, 60) || "Sala",
        master: uid,
        miembros: [uid],
        creada: f.serverTimestamp()
    });
    return entrarSala(codigo);
}

/** Entra en una sala por su código (si no eras miembro, te añade) y empieza a escuchar sus eventos y artes */
export async function entrarSala(codigo) {
    const { db, f, uid } = exigirUsuario();
    codigo = normalizarCodigo(codigo);
    if (!codigo) throw Object.assign(new Error("Escribe el código de la sala"), { code: "sin-codigo" });
    const ref = f.doc(db, "salas", codigo);
    const instantanea = await f.getDoc(ref);
    if (!instantanea.exists()) throw Object.assign(new Error(`No existe ninguna sala con el código ${codigo}`), { code: "sala-no-existe" });
    const datos = instantanea.data();
    if (!datos.miembros?.includes(uid)) await f.updateDoc(ref, { miembros: f.arrayUnion(uid) });

    if (estado.sala) dejarSala();
    estado.sala = { codigo, nombre: datos.nombre, master: datos.master };
    escribirLocal(CLAVE_SALA, codigo);
    escucharSala(codigo);
    limpiarEventosAntiguos(codigo);
    avisar("estado", copiaEstado());
    return copiaEstado();
}

/* Los pop-ups solo sirven en directo: al entrar en una sala se borran los de más de un día.
 * Las reglas permiten borrar los de más de 24 h; aquí se usan 25 h de margen por si el reloj del
 * ordenador va adelantado (si el lote incluyera uno no permitido, fallaría entero). */
const HORAS_CONSERVAR_EVENTOS = 25;
const MAX_EVENTOS_LIMPIEZA = 400;

async function limpiarEventosAntiguos(codigo) {
    try {
        const { db, f } = sdk;
        const limite = f.Timestamp.fromMillis(Date.now() - HORAS_CONSERVAR_EVENTOS * 3600 * 1000);
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
    dejarDeEscuchar.forEach(parar => parar());
    dejarDeEscuchar = [];
    estado.sala = null;
    miembros = [];
    avisar("artesSala", []);
    avisar("miembros", []);
}

/* Nombres de los miembros (con caché; si alguien no tiene nombre público, sale "Jugador") */
async function nombresDe(uids) {
    const { db, f } = sdk;
    return Promise.all(uids.map(async uid => {
        if (!nombresCache.has(uid)) {
            try {
                const instantanea = await f.getDoc(f.doc(db, "usuarios", uid));
                nombresCache.set(uid, instantanea.data()?.nombre || "Jugador");
            } catch {
                return { uid, nombre: "Jugador" };
            }
        }
        return { uid, nombre: nombresCache.get(uid) };
    }));
}

export function salirSala() {
    dejarSala();
    escribirLocal(CLAVE_SALA, null);
    avisar("estado", copiaEstado());
}

function escucharSala(codigo) {
    const { db, f } = sdk;
    // Miembros de la sala: cambian cuando alguien entra por primera vez
    dejarDeEscuchar.push(f.onSnapshot(f.doc(db, "salas", codigo), async instantanea => {
        const uids = instantanea.data()?.miembros ?? [];
        const lista = await nombresDe(uids);
        if (estado.sala?.codigo !== codigo) return; // se ha salido mientras tanto
        miembros = lista.sort((x, y) => x.nombre.localeCompare(y.nombre));
        avisar("miembros", getMiembros());
    }, error => console.warn("Error escuchando los miembros de la sala:", error)));

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

/** Envía un evento de eventos.js a la sala actual (sin sala no hace nada) */
export async function publicarEvento(evento) {
    if (!estado.sala) return;
    const { db, f, uid } = exigirUsuario();
    await f.addDoc(f.collection(db, "salas", estado.sala.codigo, "eventos"), {
        jugador: uid,
        evento: JSON.stringify(evento),
        creado: f.serverTimestamp()
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
