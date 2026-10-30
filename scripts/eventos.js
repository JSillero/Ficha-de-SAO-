/* Eventos de pop-up: los pop-ups que se comparten en la sala (tiradas, daño de artes, artes) son datos JSON
 * y se pintan con la misma función tanto si son propios como si llegan de otro jugador.
 *
 * Evento: { version, tipo, jugador, nombreJugador, personaje, hora, datos }
 * - tipo: "tirada" | "danno" (dados.js), "arte" | "pasiva" | "objeto" | "reliquia" | "recibido" | "consumido"
 *   (aquí: título + líneas de texto) y "oferta" (comida o poción ofrecida a un jugador).
 * - datos: solo texto plano y números; el pintor lo escapa todo, porque puede venir de otro jugador.
 *
 * Sin conexión no hay publicador: emitirEvento solo pinta. La capa online llama a configurarOrigen y
 * setPublicador al entrar en una sala y pasa los eventos que llegan a recibirEvento. */
import { mostrarPopup } from "./popups.js";
import { escaparHtml } from "./html.js";

export const VERSION_EVENTO = 1;

/* tipo → pintar(datos) que devuelve { popup: HTMLElement, titulo: string, tipoPopup: "tirada" | "info" } */
const pintores = {};

/* Quién emite: jugador (id de usuario) y nombres. personaje puede ser una función (el nombre cambia) */
const origen = { jugador: null, nombreJugador: "", personaje: "" };
let publicador = null;

export function registrarPintor(tipo, pintar) {
    pintores[tipo] = pintar;
}

export function configurarOrigen({ jugador, nombreJugador, personaje } = {}) {
    if (jugador !== undefined) origen.jugador = jugador;
    if (nombreJugador !== undefined) origen.nombreJugador = nombreJugador;
    if (personaje !== undefined) origen.personaje = personaje;
}

/* publicar(evento): lo manda a la sala. null = sin conexión */
export function setPublicador(publicar) {
    publicador = publicar;
}

/** Crea el evento, lo pinta aquí y lo manda a la sala si hay conexión. */
export function emitirEvento(tipo, datos) {
    const evento = {
        version: VERSION_EVENTO,
        tipo,
        jugador: origen.jugador,
        nombreJugador: origen.nombreJugador,
        personaje: typeof origen.personaje === "function" ? origen.personaje() : origen.personaje,
        hora: new Date().toISOString(),
        datos
    };
    pintarEvento(evento, true);
    if (publicador) {
        try {
            Promise.resolve(publicador(evento)).catch(error => console.warn("No se pudo enviar el evento", error));
        } catch (error) {
            console.warn("No se pudo enviar el evento", error);
        }
    }
    return evento;
}

/** Evento que llega de la sala. Los propios (mismo jugador) ya se pintaron al emitirlos. */
export function recibirEvento(evento) {
    if (!evento || typeof evento !== "object" || evento.version !== VERSION_EVENTO) return;
    if (origen.jugador && evento.jugador === origen.jugador) return;
    pintarEvento(evento, false);
}

function pintarEvento(evento, propio) {
    const pintar = pintores[evento.tipo];
    if (!pintar) {
        console.warn(`Evento de tipo desconocido: ${evento.tipo}`);
        return;
    }
    let pintado;
    try {
        pintado = pintar(evento.datos ?? {});
    } catch (error) {
        console.warn("Evento mal formado", evento, error);
        return;
    }
    const { popup, titulo, tipoPopup } = pintado;
    if (!propio) {
        // Quién lo ha lanzado, encima del título
        const autor = [evento.nombreJugador, evento.personaje].filter(Boolean).join(" · ") || "Otro jugador";
        popup.insertAdjacentHTML("afterbegin", `<div class="popup-jugador">${escaparHtml(autor)}</div>`);
        popup.classList.add("popup-ajeno");
        hacerGolpesAplicables(popup, evento, autor);
        if (esOfertaParaMi(evento)) hacerOfertaConsumible(popup, evento, autor);
    }
    mostrarPopup(popup, { titulo, tipo: tipoPopup, evento });
}

/* Recibir daño desde el pop-up de otro jugador ______________________________
 * Cada bloque de daño (.popup-danno[data-golpe]) es un golpe: al pulsarlo se aplica a tu personaje por
 * separado (la armadura y las resistencias se restan en cada golpe). El clic no cierra el pop-up y cada
 * golpe solo se puede recibir una vez. Quién aplica el daño lo decide la interfaz (setAplicadorDanno). */

/* aplicar(golpe, { autor, titulo, tirada }) → true si se ha aplicado (false: p. ej. en zona segura) */
let aplicadorDanno = null;

export function setAplicadorDanno(aplicar) {
    aplicadorDanno = aplicar;
}

/* Golpes de un evento: el daño de una tirada de ataque o los golpes de un arte */
export function golpesDeEvento(evento) {
    const datos = evento?.datos ?? {};
    if (evento?.tipo === "tirada") return datos.danno ? [datos.danno] : [];
    if (evento?.tipo === "danno") return Array.isArray(datos.golpes) ? datos.golpes : [];
    return [];
}

function hacerGolpesAplicables(popup, evento, autor) {
    if (!aplicadorDanno) return;
    const golpes = golpesDeEvento(evento);
    popup.querySelectorAll?.(".popup-danno[data-golpe]").forEach(bloque => {
        const golpe = golpes[Number(bloque.dataset.golpe)];
        if (!golpe) return;
        bloque.classList.add("aplicable");
        bloque.tabIndex = 0;
        bloque.setAttribute("role", "button");
        bloque.title = "Recibir este golpe en tu personaje";
        bloque.insertAdjacentHTML("beforeend", `<div class="popup-aplicar">Clic para recibir este golpe</div>`);
        const aplicar = (e) => {
            e.stopPropagation(); // no cierra el pop-up
            if (bloque.classList.contains("aplicado")) return;
            // tirada: total de la tirada de ataque (para compararlo con la Defensa); null si no hubo tirada (artes)
            const tirada = evento.tipo === "tirada" && Number.isFinite(Number(evento.datos?.total)) ? Number(evento.datos.total) : null;
            if (!aplicadorDanno(golpe, { autor, titulo: evento.datos?.titulo ?? "", tirada })) return;
            bloque.classList.replace("aplicable", "aplicado");
            bloque.removeAttribute("role");
            bloque.title = "Ya has recibido este golpe";
            bloque.querySelector(".popup-aplicar").textContent = "✓ Recibido";
        };
        bloque.addEventListener("click", aplicar);
        bloque.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); aplicar(e); }
        });
    });
}

/* "arte", "pasiva", "objeto" (comida, poción, cristal) y "reliquia": título, subtítulo opcional y líneas de
 * texto (como los avisos de la ficha, pero sin HTML; los saltos de línea se respetan) */
function pintarLista({ titulo = "", subtitulo = "", lineas = [] }) {
    const popup = document.createElement("div");
    popup.className = "popup-dado";
    popup.innerHTML = `
        <div class="popup-header"><strong class="popup-titulo">${escaparHtml(titulo)}</strong></div>
        ${subtitulo ? `<div class="popup-subtitulo">${escaparHtml(subtitulo)}</div>` : ""}
        <ul class="popup-lista">${[].concat(lineas).map(l => `<li>${escaparHtml(l).replace(/\n/g, "<br>")}</li>`).join("")}</ul>`;
    return { popup, titulo: String(titulo), tipoPopup: "info" };
}
/* "recibido": un jugador ha recibido daño (de un pop-up ajeno o del botón Daño).
   "consumido": un jugador ha consumido la comida o poción que le ofrecieron. */
["arte", "pasiva", "objeto", "reliquia", "recibido", "consumido"].forEach(tipo => registrarPintor(tipo, pintarLista));

/* Ofrecer comida o pociones ___________________________________________________
 * "oferta": { titulo, subtitulo, lineas, para (uid), objeto }. Todos ven quién ofrece qué a quién; solo el
 * destinatario tiene el botón para consumirlo (gasta su boca). Si el pop-up se cierra sin consumir, se pierde,
 * así que al destinatario le sale como tirada (no se cierra solo mientras haya 2 o menos). */

/* consumir(objeto, { autor }) → true si se ha consumido */
let consumidorOferta = null;

export function setConsumidorOferta(consumir) {
    consumidorOferta = consumir;
}

const esOfertaParaMi = (evento) => evento.tipo === "oferta" && Boolean(origen.jugador) && evento.datos?.para === origen.jugador;

registrarPintor("oferta", (datos) => {
    const pintado = pintarLista(datos);
    if (origen.jugador && datos.para === origen.jugador) pintado.tipoPopup = "tirada";
    return pintado;
});

function hacerOfertaConsumible(popup, evento, autor) {
    if (!consumidorOferta || !evento.datos?.objeto) return;
    const verbo = evento.datos.objeto.tipo === "comida" ? "Comer" : "Beber";
    popup.insertAdjacentHTML("beforeend",
        `<button type="button" class="btn-consumir-oferta" title="Gasta la acción de la boca">${verbo} (acción de boca)</button>`);
    const boton = popup.querySelector(".btn-consumir-oferta");
    boton.addEventListener("click", (e) => {
        e.stopPropagation(); // no cierra el pop-up
        if (boton.disabled) return;
        if (!consumidorOferta(evento.datos.objeto, { autor })) return;
        boton.disabled = true;
        boton.textContent = "✓ Consumida";
    });
}
