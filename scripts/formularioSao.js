// scripts/formularioSao.js
// Piezas de los formularios SAO (estilo "tarjeta de objeto", .claude/12-estilo.md §5 bis). Solo DOM, sin reglas
// del juego. Los controles de verdad (input number, select, checkbox) se quedan en el formulario, así el resto del
// código los sigue leyendo y escribiendo igual: estas piezas solo los visten y los sincronizan.
// - Números: paso a paso "− valor +" alrededor del input (mejorarNumero; data-incremento cambia de cuánto en cuánto,
//   .sin-paso los deja sin botones).
// - Pocas opciones: fichas con icono que cambian el select oculto (crearFichas).
// - Muchas opciones: la ranura muestra la elegida y despliega una rejilla de iconos por grupos (crearRejilla).
// - Iconos de las ranuras: <span class="ranura-icono" data-icono="clave"> se rellena con pintarIconos.
// Las casillas (interruptor) y el texto (línea inferior) son solo CSS (.form-sao en secciones.css).

import { iconoSao } from "./iconos.js";
import { escaparHtml } from "./html.js";
import { ESTADOS_INFO } from "./estados.js";

const avisar = (control) => {
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
};

/** Rellena los <span data-icono="clave"> de un contenedor con su icono SAO */
export function pintarIconos(contenedor) {
    contenedor.querySelectorAll("[data-icono]").forEach(span => {
        if (span.dataset.iconoPintado === span.dataset.icono) return;
        span.innerHTML = iconoSao(span.dataset.icono);
        span.dataset.iconoPintado = span.dataset.icono;
    });
}

/* Números __________________________________________________________________________ */

/** Pone − y + alrededor de un input number (una sola vez). Respetan min, max, step y disabled. */
export function mejorarNumero(input) {
    if (input.dataset.paso || input.closest(".paso")) return;
    input.dataset.paso = "1";
    const envoltorio = document.createElement("span");
    envoltorio.className = "paso";
    input.replaceWith(envoltorio);
    const boton = (signo, texto) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "paso-boton";
        b.dataset.signo = signo;
        b.textContent = texto;
        b.tabIndex = -1; // con el teclado se usan las flechas del propio campo
        b.setAttribute("aria-hidden", "true");
        return b;
    };
    envoltorio.append(boton("-1", "−"), input, boton("1", "+"));
}

/* Un solo listener para todos los − / + */
document.addEventListener("click", (e) => {
    const boton = e.target.closest(".paso-boton");
    if (!boton) return;
    const input = boton.parentElement.querySelector("input");
    if (!input || input.disabled || input.readOnly) return;
    e.preventDefault();
    // data-incremento: los botones van de tanto en tanto y redondean a ese múltiplo (p. ej. un % de 5 en 5)
    const incremento = Number(input.dataset.incremento) || 0;
    const paso = incremento || Number(input.step) || 1;
    const actual = Number(input.value) || 0;
    let valor = actual + paso * Number(boton.dataset.signo);
    if (incremento) valor = Math.round(valor / incremento) * incremento;
    if (input.min !== "") valor = Math.max(Number(input.min), valor);
    if (input.max !== "") valor = Math.min(Number(input.max), valor);
    valor = Math.round(valor * 100) / 100;
    if (valor === actual && input.value !== "") return;
    input.value = valor;
    avisar(input);
});

/** Mejora todos los input number de un contenedor (salvo los marcados .sin-paso) */
export function mejorarNumeros(contenedor) {
    contenedor.querySelectorAll('input[type="number"]:not(.sin-paso)').forEach(mejorarNumero);
}

/* Fichas (pocas opciones) ____________________________________________________________ */

/**
 * Fichas para elegir una opción de un select (que queda oculto). icono(valor) da la clave del icono o null.
 * Las opciones ocultas o desactivadas del select no salen. Devuelve sincronizar(): llamarla tras cambiar el
 * select desde el código (p. ej. al rellenar el formulario).
 * opciones.grande: iconos grandes con el texto debajo (tipo de objeto); si no, fichas en pastilla.
 */
export function crearFichas(select, { icono = () => null, grande = false } = {}) {
    select.classList.add("select-vestido");
    const contenedor = document.createElement("div");
    contenedor.className = grande ? "fichas-sao grandes" : "fichas-sao";
    contenedor.setAttribute("role", "radiogroup");
    if (select.getAttribute("aria-label")) contenedor.setAttribute("aria-label", select.getAttribute("aria-label"));
    select.after(contenedor);

    const sincronizar = () => {
        const opciones = [...select.options].filter(op => !op.hidden && !op.disabled);
        const firma = opciones.map(op => op.value).join("|");
        if (contenedor.dataset.firma !== firma) {
            contenedor.dataset.firma = firma;
            contenedor.innerHTML = opciones.map(op => {
                const clave = icono(op.value);
                return `<button type="button" class="ficha-sao" role="radio" data-valor="${escaparHtml(op.value)}">
                    ${clave ? `<span class="ficha-icono">${iconoSao(clave)}</span>` : ""}<span>${escaparHtml(op.textContent)}</span></button>`;
            }).join("");
        }
        contenedor.querySelectorAll(".ficha-sao").forEach(b => b.setAttribute("aria-checked", String(b.dataset.valor === select.value)));
    };
    contenedor.addEventListener("click", (e) => {
        const ficha = e.target.closest(".ficha-sao");
        if (!ficha || select.disabled) return;
        if (select.value !== ficha.dataset.valor) {
            select.value = ficha.dataset.valor;
            avisar(select);
        }
        sincronizar();
    });
    select.addEventListener("change", sincronizar);
    sincronizar();
    return sincronizar;
}

/* Rejilla (muchas opciones) _________________________________________________________ */

/**
 * La opción elegida de un select (que queda oculto) en un botón; al pulsarlo se despliega una rejilla con todas,
 * agrupadas por los <optgroup>. icono(valor) da la clave del icono o null (entonces la opción va como ficha de
 * texto). El panel se pone después de `despuesDe` (por defecto, la ranura o fila que contiene el select).
 * opciones.alCambiarIcono(clave): para que la ranura cambie su icono por el de la opción elegida.
 * Devuelve sincronizar().
 */
export function crearRejilla(select, { icono = () => null, despuesDe = null, alCambiarIcono = null } = {}) {
    select.classList.add("select-vestido");
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "rejilla-boton";
    boton.setAttribute("aria-expanded", "false");
    if (select.getAttribute("aria-label")) boton.setAttribute("aria-label", select.getAttribute("aria-label"));
    select.after(boton);
    const panel = document.createElement("div");
    panel.className = "rejilla-panel";
    panel.hidden = true;
    (despuesDe ?? select.closest(".ranura, .mod-equipo, .fila-estado-acertar") ?? boton).after(panel);

    const opcionVisible = (op) => !op.hidden && !op.disabled;
    const htmlOpcion = (op) => {
        const clave = icono(op.value);
        return `<button type="button" class="rejilla-opcion${clave ? "" : " sin-icono"}" data-valor="${escaparHtml(op.value)}" title="${escaparHtml(op.textContent)}">
            ${clave ? `<span class="ficha-icono">${iconoSao(clave)}</span>` : ""}<span>${escaparHtml(op.textContent)}</span></button>`;
    };
    const pintarPanel = () => {
        const grupos = [...select.children].map(hijo => hijo.tagName === "OPTGROUP"
            ? { etiqueta: hijo.label, opciones: [...hijo.children].filter(opcionVisible), oculto: hijo.hidden }
            : { etiqueta: "", opciones: opcionVisible(hijo) ? [hijo] : [] });
        // Las opciones sueltas seguidas van juntas en un mismo grupo sin título
        const unidos = [];
        grupos.forEach(g => {
            const ultimo = unidos[unidos.length - 1];
            if (!g.etiqueta && ultimo && !ultimo.etiqueta) ultimo.opciones.push(...g.opciones);
            else unidos.push({ ...g, opciones: [...g.opciones] });
        });
        panel.innerHTML = unidos.filter(g => g.opciones.length && !g.oculto).map(g => `
            ${g.etiqueta ? `<div class="rejilla-grupo">${escaparHtml(g.etiqueta)}</div>` : ""}
            <div class="rejilla-opciones">${g.opciones.map(htmlOpcion).join("")}</div>`).join("");
        panel.querySelectorAll(".rejilla-opcion").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.valor === select.value)));
    };
    const sincronizar = () => {
        const elegida = select.selectedOptions[0];
        const clave = elegida ? icono(elegida.value) : null;
        boton.innerHTML = `${clave ? `<span class="ficha-icono">${iconoSao(clave)}</span>` : ""}
            <span class="rejilla-texto">${escaparHtml(elegida?.textContent ?? "")}</span><span class="rejilla-flecha" aria-hidden="true"></span>`;
        alCambiarIcono?.(clave);
        if (!panel.hidden) pintarPanel();
    };
    const abrir = (si) => {
        panel.hidden = !si;
        boton.setAttribute("aria-expanded", String(si));
        if (si) pintarPanel();
    };
    boton.addEventListener("click", () => { if (!select.disabled) abrir(panel.hidden); });
    panel.addEventListener("click", (e) => {
        const op = e.target.closest(".rejilla-opcion");
        if (!op) return;
        if (select.value !== op.dataset.valor) {
            select.value = op.dataset.valor;
            avisar(select);
        }
        abrir(false);
        sincronizar();
        boton.focus();
    });
    select.addEventListener("change", sincronizar);
    sincronizar();
    return sincronizar;
}

/* Preparar un formulario entero ___________________________________________________ */

/**
 * Pinta los iconos de las ranuras, pone − / + en los números y rejilla en los selects de las filas (atributo de un
 * modificador, estado de "Efectos al acertar", tipo y cuál de un requisito). Un MutationObserver hace lo mismo con
 * lo que se añada después (filas nuevas).
 */
export function prepararFormularioSao(form) {
    const vestir = (raiz) => {
        pintarIconos(raiz);
        mejorarNumeros(raiz);
        raiz.querySelectorAll("select.listValores:not(.select-vestido), select.req-tipo:not(.select-vestido), select.req-clave:not(.select-vestido)")
            .forEach(select => crearRejilla(select, { despuesDe: select.closest(".mod-equipo, .requisito-arte") }));
        raiz.querySelectorAll('select[data-campo="clave"]:not(.select-vestido)').forEach(select =>
            crearRejilla(select, { icono: (v) => ESTADOS_INFO[v]?.icono ?? null }));
    };
    vestir(form);
    new MutationObserver((cambios) => {
        cambios.forEach(c => c.addedNodes.forEach(nodo => { if (nodo instanceof Element) vestir(nodo); }));
    }).observe(form, { childList: true, subtree: true });
}

/* Resúmenes de las ranuras desplegables ______________________________________________ */

/** Pone el resumen de una ranura desplegable (<details class="ranura-desplegable">) */
export function ponerResumen(details, texto) {
    const span = details?.querySelector(":scope > summary .ranura-resumen");
    if (span && span.textContent !== texto) span.textContent = texto;
}
