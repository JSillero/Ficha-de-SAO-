/* Ordenar arrastrando las filas (.fila-objeto) de una lista: inventario, baúl y objetos clave.
   Ratón: el arrastre empieza al mover unos píxeles con el botón pulsado.
   Táctil: pulsación larga y luego arrastrar (un deslizamiento rápido sigue desplazando la lista).
   Mientras se arrastra, la fila se mueve en el DOM; al soltar se llama a alSoltar(desde, hasta)
   y la interfaz cambia el orden en el modelo y repinta. */

const UMBRAL_PX = 6;
const PULSACION_LARGA_MS = 300;
/** Distancia al borde de la ventana en la que se desplaza sola mientras se arrastra */
const MARGEN_SCROLL_PX = 40;
const VELOCIDAD_SCROLL_PX = 8;

/**
 * @param {HTMLElement} contenedor lista cuyas hijas directas son las filas (data-index = posición en el modelo)
 * @param {{ alSoltar: (desde: number, hasta: number) => void, sePuedeArrastrar?: (fila: HTMLElement) => boolean }} opciones
 */
export function hacerOrdenable(contenedor, { alSoltar, sePuedeArrastrar = () => true }) {
    contenedor.classList.add("ordenable");
    /** { fila, pointerId, x, y, tactil, arrastrando, temporizador, siguiente, ultimaY, animacion } */
    let estado = null;

    const filas = () => [...contenedor.children].filter(el => el.classList.contains("fila-objeto"));
    const zonaScroll = () => contenedor.closest(".modal-body") ?? document.scrollingElement;

    function empezar() {
        if (!estado || !contenedor.contains(estado.fila)) return terminar(false);
        estado.arrastrando = true;
        estado.siguiente = estado.fila.nextElementSibling;
        estado.fila.classList.add("arrastrando");
        contenedor.classList.add("ordenando");
        try { estado.fila.setPointerCapture(estado.pointerId); } catch { /* el puntero ya no existe */ }
        navigator.vibrate?.(15);
        estado.animacion = requestAnimationFrame(desplazar);
    }

    /* Coloca la fila arrastrada antes de la primera cuyo centro quede por debajo del puntero */
    function recolocar(y) {
        const { fila } = estado;
        const otras = filas().filter(el => el !== fila);
        const destino = otras.find(el => {
            const rect = el.getBoundingClientRect();
            return y < rect.top + rect.height / 2;
        });
        if (destino) {
            if (fila.nextElementSibling !== destino) contenedor.insertBefore(fila, destino);
        } else if (otras.length && otras[otras.length - 1].nextElementSibling !== fila) {
            otras[otras.length - 1].after(fila);
        }
    }

    /* Cerca del borde de la ventana, la lista se desplaza sola */
    function desplazar() {
        if (!estado?.arrastrando) return;
        const zona = zonaScroll();
        const rect = zona.getBoundingClientRect();
        const arriba = Math.max(rect.top, 0);
        const abajo = Math.min(rect.bottom, window.innerHeight);
        const y = estado.ultimaY;
        let paso = 0;
        if (y < arriba + MARGEN_SCROLL_PX) paso = -VELOCIDAD_SCROLL_PX;
        else if (y > abajo - MARGEN_SCROLL_PX) paso = VELOCIDAD_SCROLL_PX;
        if (paso) {
            zona.scrollTop += paso;
            recolocar(y);
        }
        estado.animacion = requestAnimationFrame(desplazar);
    }

    function mover(e) {
        if (!estado || e.pointerId !== estado.pointerId) return;
        estado.ultimaY = e.clientY;
        if (!estado.arrastrando) {
            const distancia = Math.hypot(e.clientX - estado.x, e.clientY - estado.y);
            if (distancia < UMBRAL_PX) return;
            // En táctil, moverse antes de la pulsación larga es desplazar la lista
            if (estado.tactil) return terminar(false);
            empezar();
            if (!estado) return;
        }
        if (!contenedor.contains(estado.fila)) return terminar(false);
        e.preventDefault();
        recolocar(e.clientY);
    }

    /* Tras arrastrar, el clic que genera soltar no debe pulsar nada */
    function ignorarSiguienteClic() {
        const parar = (e) => { e.stopPropagation(); e.preventDefault(); };
        window.addEventListener("click", parar, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", parar, { capture: true }), 0);
    }

    function terminar(confirmar) {
        if (!estado) return;
        const { fila, arrastrando, temporizador, siguiente, animacion } = estado;
        estado = null;
        clearTimeout(temporizador);
        cancelAnimationFrame(animacion);
        document.removeEventListener("pointermove", mover);
        document.removeEventListener("pointerup", soltar);
        document.removeEventListener("pointercancel", cancelar);
        if (!arrastrando) return;

        fila.classList.remove("arrastrando");
        contenedor.classList.remove("ordenando");
        ignorarSiguienteClic();
        if (!contenedor.contains(fila)) return;

        const desde = Number(fila.dataset.index);
        const hasta = filas().indexOf(fila);
        if (confirmar && hasta >= 0 && hasta !== desde) return alSoltar(desde, hasta);
        // Sin cambios (o cancelado): la fila vuelve a su sitio para que el DOM siga igual que el modelo
        contenedor.insertBefore(fila, siguiente?.parentElement === contenedor ? siguiente : null);
    }

    const soltar = (e) => { if (e.pointerId === estado?.pointerId) terminar(true); };
    const cancelar = (e) => { if (e.pointerId === estado?.pointerId) terminar(false); };

    contenedor.addEventListener("pointerdown", (e) => {
        if (estado || e.button !== 0) return;
        if (e.target.closest("button, input, textarea, select, a, label")) return;
        const fila = e.target.closest(".fila-objeto");
        if (!fila || fila.parentElement !== contenedor || !sePuedeArrastrar(fila)) return;

        estado = {
            fila, pointerId: e.pointerId, x: e.clientX, y: e.clientY, ultimaY: e.clientY,
            tactil: e.pointerType !== "mouse", arrastrando: false
        };
        if (estado.tactil) estado.temporizador = setTimeout(empezar, PULSACION_LARGA_MS);
        document.addEventListener("pointermove", mover);
        document.addEventListener("pointerup", soltar);
        document.addEventListener("pointercancel", cancelar);
    });

    // En táctil, mientras se arrastra el dedo no desplaza la página ni abre el menú de pulsación larga
    contenedor.addEventListener("touchmove", (e) => {
        if (estado?.arrastrando) e.preventDefault();
    }, { passive: false });
    contenedor.addEventListener("contextmenu", (e) => {
        if (estado) e.preventDefault();
    });
    // Escape cancela el arrastre (en captura, para que no cierre la ventana)
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape" || !estado?.arrastrando) return;
        e.preventDefault();
        e.stopPropagation();
        terminar(false);
    }, true);
}
