/* Botón atrás (móvil o navegador) y Escape con las ventanas de Bootstrap y los
 * menús desplegables de la silueta (capas).
 *
 * Mientras haya alguna capa abierta hay una entrada propia en el historial:
 * pulsar atrás la consume y cierra la capa de arriba. Si es una ventana hija de
 * otra (crearVentanaHija, crear objeto), al cerrarse se vuelve a abrir la
 * anterior y se añade otra entrada, así que atrás va retrocediendo capa a capa.
 * Al cerrar la última con sus botones o con Escape, se quita la entrada
 * (history.back) para que el siguiente atrás sí salga de la página.
 *
 * Las ventanas se registran solas (eventos de Bootstrap); los menús llaman a
 * abrirCapa/cerrarCapa (crearMenuSao en interfaz.js).
 *
 * Escape ya lo gestionan Bootstrap y los menús cuando el foco está dentro;
 * aquí se cubre el caso en que el foco se ha quedado fuera. */

/** @type {Array<{ elemento: HTMLElement, cerrar: () => void }>} la última es la de arriba */
const capas = [];
let hayEntrada = false; // hay una entrada nuestra en el historial
let quitando = false;   // history.back() propio en curso: su popstate se ignora

function asegurarEntrada() {
    if (hayEntrada || quitando || !capas.length) return;
    history.pushState({ ventanaSao: true }, "");
    hayEntrada = true;
}

/* Al quedarse sin capas se quita la entrada, pero en diferido: elegir una opción de
   un menú lo cierra y abre una ventana en el mismo clic, y así no se quita y se repone */
function comprobarVacio() {
    queueMicrotask(() => {
        if (capas.length || !hayEntrada) return;
        hayEntrada = false;
        quitando = true;
        history.back();
    });
}

/** Apunta una capa abierta (si ya estaba, no hace nada). cerrar() debe cerrarla. */
export function abrirCapa(elemento, cerrar) {
    if (capas.some(c => c.elemento === elemento)) return;
    capas.push({ elemento, cerrar });
    asegurarEntrada();
}

/** Quita una capa que se ha cerrado (por cualquier vía) */
export function cerrarCapa(elemento) {
    const i = capas.findIndex(c => c.elemento === elemento);
    if (i < 0) return;
    capas.splice(i, 1);
    comprobarVacio();
}

/* Cierra una ventana de Bootstrap. Bootstrap ignora hide() durante la animación de
   abrir: entonces se repone la entrada para que el siguiente atrás lo vuelva a intentar */
function cerrarVentana(ventana) {
    let cerrando = false;
    const marcar = () => { cerrando = true; };
    ventana.addEventListener("hide.bs.modal", marcar, { once: true });
    bootstrap.Modal.getOrCreateInstance(ventana).hide();
    ventana.removeEventListener("hide.bs.modal", marcar);
    if (!cerrando) asegurarEntrada();
}

export function inicializarVentanas() {
    document.addEventListener("show.bs.modal", (e) => {
        if (!e.defaultPrevented) abrirCapa(e.target, () => cerrarVentana(e.target));
    });
    // Al pasar de una ventana a otra, la nueva se abre dentro del hidden de la anterior,
    // así que no se llega a quitar la entrada
    document.addEventListener("hidden.bs.modal", (e) => cerrarCapa(e.target));

    window.addEventListener("popstate", () => {
        if (quitando) {
            quitando = false;
            asegurarEntrada(); // se abrió otra capa mientras se quitaba la entrada
            return;
        }
        if (!hayEntrada) return; // atrás normal, sin capas
        hayEntrada = false;
        capas.at(-1)?.cerrar();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape" || e.defaultPrevented) return;
        const capa = capas.at(-1);
        if (!capa || capa.elemento.contains(e.target)) return; // con el foco dentro ya se cierra sola
        capa.cerrar();
    });
}
