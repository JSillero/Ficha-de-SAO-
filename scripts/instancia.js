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
