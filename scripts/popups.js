/* Pop-ups flotantes (#contenedor-popups-dados): cierre automático e historial de la sesión.
 * - "info": se cierra a los 8 s; con el ratón encima no cuenta, y al salir vuelve a empezar.
 * - "tirada": se queda mientras haya 2 o menos; las que sobran (las más antiguas) se cierran a los 8 s.
 * El historial solo vive en memoria: no se guarda en el JSON del personaje. */

export const DURACION_POPUP_MS = 8000;
/* Tiradas que se quedan en pantalla sin cerrarse solas */
const TIRADAS_FIJAS = 2;
const MAX_HISTORIAL = 200;

const historial = [];
const temporizadores = new WeakMap();
/* Pop-ups que deben cerrarse solos (y reanudan la cuenta al quitar el ratón) */
const conCuenta = new WeakSet();

/**
 * Muestra un pop-up ya montado y lo apunta en el historial.
 * @param {HTMLElement} popup
 * @param {{ titulo?: string, tipo?: "tirada" | "info", evento?: object }} opciones
 *   evento: el JSON del pop-up si es compartible (eventos.js); se guarda en el historial
 */
export function mostrarPopup(popup, { titulo = "", tipo = "info", evento = null } = {}) {
    const contenedor = document.getElementById("contenedor-popups-dados");
    if (!contenedor) return;
    popup.dataset.tipo = tipo;
    popup.addEventListener("click", () => cerrarPopup(popup));
    popup.addEventListener("mouseenter", () => pararCuenta(popup));
    popup.addEventListener("mouseleave", () => { if (conCuenta.has(popup)) iniciarCuenta(popup); });
    contenedor.appendChild(popup);

    historial.push({ hora: new Date(), tipo, titulo, html: popup.innerHTML, clases: popup.className, evento });
    if (historial.length > MAX_HISTORIAL) historial.splice(0, historial.length - MAX_HISTORIAL);
    document.dispatchEvent(new CustomEvent("historialpopups"));

    if (tipo === "tirada") revisarTiradas();
    else programarCierre(popup);
}

function programarCierre(popup) {
    conCuenta.add(popup);
    if (!popup.matches(":hover")) iniciarCuenta(popup);
}

function iniciarCuenta(popup) {
    pararCuenta(popup);
    temporizadores.set(popup, setTimeout(() => cerrarPopup(popup), DURACION_POPUP_MS));
}

function pararCuenta(popup) {
    clearTimeout(temporizadores.get(popup));
    temporizadores.delete(popup);
}

/* Todas las tiradas menos las más nuevas llevan cuenta atrás; las que vuelven a ser de las
 * más nuevas (porque se ha cerrado otra) dejan de contar */
function revisarTiradas() {
    const tiradas = [...document.querySelectorAll('#contenedor-popups-dados .popup-dado[data-tipo="tirada"]:not(.fade-out)')];
    const sobran = Math.max(0, tiradas.length - TIRADAS_FIJAS);
    tiradas.forEach((popup, i) => {
        if (i < sobran) {
            if (!conCuenta.has(popup)) programarCierre(popup);
        } else {
            conCuenta.delete(popup);
            pararCuenta(popup);
        }
    });
}

export function cerrarPopup(popup) {
    if (popup.classList.contains("fade-out")) return;
    pararCuenta(popup);
    conCuenta.delete(popup);
    popup.classList.add("fade-out");
    if (popup.dataset.tipo === "tirada") revisarTiradas();
    // fade-out es una transición; el setTimeout cubre el caso en que no salte transitionend
    const quitar = () => { if (popup.isConnected) popup.remove(); };
    popup.addEventListener("transitionend", quitar, { once: true });
    setTimeout(quitar, 400);
}

/* Entradas del historial, de más antigua a más nueva */
export function getHistorialPopups() {
    return historial.slice();
}

export function vaciarHistorialPopups() {
    historial.length = 0;
    document.dispatchEvent(new CustomEvent("historialpopups"));
}
