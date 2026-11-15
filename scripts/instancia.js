/* Identidad de esta pestaña ("instancia"): permite tener varios personajes a la vez en pestañas distintas
 * (p. ej. un máster con varios NPC). Va en cada evento de la sala y en la lista de personajes conectados.
 *
 * Se guarda en sessionStorage, que es propio de cada pestaña y sobrevive a recargar: así una recarga reutiliza
 * la misma instancia y no deja entradas huérfanas en la sala. Al duplicar una pestaña el navegador copia el
 * sessionStorage; para detectarlo, la pestaña pregunta por un BroadcastChannel si otra ya usa su instancia y,
 * si alguna responde, genera otra. Todo es local, sin peticiones a ningún servidor. */
const CLAVE = "fichaSAO.instancia";
const CANAL = "fichaSAO.instancias";
const ESPERA_RESPUESTA_MS = 200;

const nuevaInstancia = () => (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^a-z0-9]/gi, "").slice(0, 12);

const leer = () => { try { return sessionStorage.getItem(CLAVE); } catch { return null; } };
const escribir = (valor) => { try { sessionStorage.setItem(CLAVE, valor); } catch { /* sin almacenamiento */ } };

let instancia = leer();
const heredada = Boolean(instancia);
if (!instancia) {
    instancia = nuevaInstancia();
    escribir(instancia);
}

let canal = null;
try { canal = new BroadcastChannel(CANAL); } catch { /* navegador sin BroadcastChannel */ }
// En Node (pruebas sueltas de los módulos) el canal abierto impediría que el proceso termine; los navegadores no tienen unref
canal?.unref?.();

/** Promesa que se resuelve cuando la instancia es definitiva (ya comprobado que no es de otra pestaña) */
export const instanciaLista = new Promise(resolver => {
    if (!canal) return resolver(instancia);
    canal.addEventListener("message", ({ data }) => {
        if (data?.tipo === "quien" && data.id === instancia) canal.postMessage({ tipo: "mia", id: instancia });
    });
    if (!heredada) return resolver(instancia);
    // Instancia heredada: puede ser una recarga (nadie responde) o una pestaña duplicada (responde la original)
    const alResponder = ({ data }) => {
        if (data?.tipo !== "mia" || data.id !== instancia) return;
        instancia = nuevaInstancia();
        escribir(instancia);
    };
    canal.addEventListener("message", alResponder);
    canal.postMessage({ tipo: "quien", id: instancia });
    setTimeout(() => {
        canal.removeEventListener("message", alResponder);
        resolver(instancia);
    }, ESPERA_RESPUESTA_MS);
});

export const getInstancia = () => instancia;

/* Instancia de cada personaje ______________________________________________
 * Un personaje recupera la instancia que usó la última vez (localStorage { idPersonaje: instancia }), así al cerrar
 * la web y volver sigue siendo el mismo para la sala y su grupo (cuyos integrantes van por instancia). Si otra
 * pestaña abierta ya la usa (el mismo personaje en dos pestañas), esta se queda con la suya. Una instancia que es
 * de otro personaje no se reutiliza: al cambiar de personaje en la pestaña se genera otra. */
const CLAVE_PERSONAJES = "fichaSAO.instanciasPersonaje";
const MAX_PERSONAJES_RECORDADOS = 50;

const leerMapa = () => {
    try {
        const mapa = JSON.parse(localStorage.getItem(CLAVE_PERSONAJES));
        return mapa && typeof mapa === "object" ? mapa : {};
    } catch {
        return {};
    }
};
function apuntarEnMapa(id, valor) {
    const mapa = leerMapa();
    delete mapa[id];
    mapa[id] = valor; // al final: los más antiguos se olvidan primero
    const claves = Object.keys(mapa);
    claves.slice(0, Math.max(0, claves.length - MAX_PERSONAJES_RECORDADOS)).forEach(clave => delete mapa[clave]);
    try { localStorage.setItem(CLAVE_PERSONAJES, JSON.stringify(mapa)); } catch { /* sin almacenamiento */ }
}

/* ¿Alguna otra pestaña abierta usa esa instancia? */
function enUso(valor) {
    if (!canal) return Promise.resolve(false);
    return new Promise(resolver => {
        const alResponder = ({ data }) => {
            if (data?.tipo !== "mia" || data.id !== valor) return;
            canal.removeEventListener("message", alResponder);
            resolver(true);
        };
        canal.addEventListener("message", alResponder);
        canal.postMessage({ tipo: "quien", id: valor });
        setTimeout(() => {
            canal.removeEventListener("message", alResponder);
            resolver(false);
        }, ESPERA_RESPUESTA_MS);
    });
}

function fijar(valor) {
    instancia = valor;
    escribir(valor);
}

async function elegirInstancia(id) {
    await instanciaLista;
    if (!id) return instancia;
    const mapa = leerMapa();
    const guardada = mapa[id];
    if (guardada === instancia) return instancia;
    if (guardada && !(await enUso(guardada))) {
        fijar(guardada);
        return instancia;
    }
    if (Object.entries(mapa).some(([otro, valor]) => otro !== id && valor === instancia)) fijar(nuevaInstancia());
    if (!guardada) apuntarEnMapa(id, instancia);
    return instancia;
}

let cola = Promise.resolve();
/** Instancia con la que esta pestaña lleva a ese personaje (idPersonaje): la suya de la última vez si está libre.
 *  Puede cambiar la instancia de la pestaña. Las llamadas van en orden. */
export function instanciaDePersonaje(id) {
    const resultado = cola.then(() => elegirInstancia(id));
    cola = resultado.catch(() => { /* la siguiente sigue */ });
    return resultado;
}

/** Apunta la instancia de un personaje que viene de fuera (la guardada en la nube, que manda sobre la local) */
export function recordarInstanciaPersonaje(id, valor) {
    if (id && valor) apuntarEnMapa(String(id), String(valor));
}
