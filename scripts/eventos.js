/* Eventos de pop-up: los pop-ups que se comparten en la sala (tiradas, daño de artes, artes) son datos JSON
 * y se pintan con la misma función tanto si son propios como si llegan de otro jugador.
 *
 * Evento: { version, tipo, jugador, instancia, personaje, oculto, hora, datos }
 * - tipo: "tirada" | "danno" (dados.js), "arte" | "pasiva" | "objeto" | "reliquia" | "recibido" | "consumido"
 *   (aquí: título + líneas de texto) y "oferta" (comida o poción ofrecida a un personaje).
 * - jugador: id del usuario; instancia: la pestaña que lo emite (instancia.js). Un usuario puede tener varios
 *   personajes en pestañas distintas: se descartan solo los de la misma pestaña.
 * - personaje: nombre del personaje; es lo único que se muestra (el nombre de usuario solo sale en la gestión de sala).
 * - oculto: el máster ha ocultado este personaje (no se le puede ofrecer nada).
 * - Detalle de tiradas y daño: solo lo ven completo el máster y los integrantes del grupo de quien lo emite;
 *   el resto ve el resultado sin el cálculo (resumirEvento).
 * - Eventos privados (solicitudes de amistad, invitaciones de grupo y sus respuestas): emitirPrivado los envía
 *   sin pintarlos y solo los atiende el destinatario (datos.para = su instancia) con su manejador.
 * - datos: solo texto plano y números; el pintor lo escapa todo, porque puede venir de otro jugador.
 *
 * Sin conexión no hay publicador: emitirEvento solo pinta. La capa online llama a configurarOrigen y
 * setPublicador al entrar en una sala y pasa los eventos que llegan a recibirEvento. */
import { mostrarPopup } from "./popups.js";
import { escaparHtml } from "./html.js";
import { getInstancia } from "./instancia.js";
import { reproducir } from "./sonidos.js";

export const VERSION_EVENTO = 2;

/* Sonidos que un evento puede pedir con datos.sonido al pintarse en las fichas de los demás (p. ej. el cristal
   al romperse). Solo los de esta lista, porque el dato viene de otro jugador; si no pide ninguno, "notificacion". */
const SONIDOS_EVENTO = ["cristal", "muerte"];
const SONIDO_EVENTO_AJENO = "notificacion";

/* tipo → pintar(datos) que devuelve { popup: HTMLElement, titulo: string, tipoPopup: "tirada" | "info" } */
const pintores = {};

/* tipo → manejar(evento) de los eventos privados (solo se llama en el destinatario) */
const manejadores = {};

/* tipo → alRecibir(evento) de los eventos con pop-up que además hacen algo al llegar (p. ej. "derrota": la EXP) */
const alRecibirPublico = {};
export function registrarAlRecibir(tipo, alRecibir) {
    alRecibirPublico[tipo] = alRecibir;
}

/* Quién emite: jugador (id de usuario) y nombre del personaje. personaje, oculto y esMaster pueden ser
   funciones (cambian con el tiempo). esMaster: si esta ficha es la del máster de la sala (lo ve todo completo).
   enMiGrupo(instancia): si ese personaje está en tu grupo (ves completas sus tiradas).
   instancia(): con la que se emite (la de la pestaña; en modo máster, la del personaje de la ficha, "m-<id>").
   esPropia(instancia): si es de esta pestaña (no se pinta lo propio y se atienden los privados dirigidos a ella;
   en modo máster, cualquiera de sus personajes). */
const origen = {
    jugador: null, personaje: "", oculto: false, esMaster: false, enMiGrupo: () => false,
    instancia: () => getInstancia(), esPropia: (instancia) => instancia === getInstancia(),
    idPersonaje: () => null
};

/* Modo máster: sus propios pop-ups también se pueden recibir (en el personaje que tenga en pantalla) */
let golpesPropiosAplicables = () => false;
export function setGolpesPropiosAplicables(fn) {
    golpesPropiosAplicables = fn;
}
const instanciaPropia = () => origen.instancia() || getInstancia();
const esInstanciaPropia = (instancia) => Boolean(instancia) && (instancia === getInstancia() || origen.esPropia(instancia));
/** ¿Esa instancia es de esta pestaña? (en modo máster, cualquiera de sus personajes) */
export const esDeEstaPestana = esInstanciaPropia;
let publicador = null;

const valor = (v) => typeof v === "function" ? v() : v;

export function registrarPintor(tipo, pintar) {
    pintores[tipo] = pintar;
}

/** Destinatario de un evento sin pop-up para todas las pestañas de la sala (salvo la que lo emite) */
export const PARA_TODOS = "*";

/** Evento privado: manejar(evento) solo se llama en la pestaña destinataria (evento.datos.para), o en todas si
 *  para es PARA_TODOS */
export function registrarManejador(tipo, manejar) {
    manejadores[tipo] = manejar;
}

export function configurarOrigen({ jugador, personaje, oculto, esMaster, enMiGrupo, instancia, esPropia, idPersonaje } = {}) {
    if (idPersonaje !== undefined) origen.idPersonaje = idPersonaje;
    if (instancia !== undefined) origen.instancia = instancia;
    if (esPropia !== undefined) origen.esPropia = esPropia;
    if (jugador !== undefined) origen.jugador = jugador;
    if (personaje !== undefined) origen.personaje = personaje;
    if (oculto !== undefined) origen.oculto = oculto;
    if (esMaster !== undefined) origen.esMaster = esMaster;
    if (enMiGrupo !== undefined) origen.enMiGrupo = enMiGrupo;
}

/* como: { instancia, personaje } para emitir en nombre de otro personaje de esta pestaña (modo máster: el que
   recibió una solicitud responde como él, aunque no esté en la ficha) */
const crearEvento = (tipo, datos, como = {}) => ({
    version: VERSION_EVENTO,
    tipo,
    jugador: origen.jugador,
    instancia: como.instancia || instanciaPropia(),
    personaje: String(como.personaje ?? valor(origen.personaje) ?? ""),
    oculto: Boolean(valor(origen.oculto)),
    hora: new Date().toISOString(),
    datos
});

/** Envía un evento privado (sin pintarlo aquí). Devuelve la promesa del envío (falla sin conexión). */
export async function emitirPrivado(tipo, datos, como = {}) {
    if (!publicador) throw new Error("Entra en una sala primero");
    await publicador(crearEvento(tipo, datos, como));
}

/* publicar(evento): lo manda a la sala. null = sin conexión */
export function setPublicador(publicar) {
    publicador = publicar;
}

/** Crea el evento, lo pinta aquí y lo manda a la sala si hay conexión. */
/* Modo lectura (el máster mira la ficha de un jugador): no se emite nada en su nombre */
let emisionBloqueada = () => false;
/** fn() => true mientras no se deban emitir pop-ups */
export function setBloqueoEmision(fn) {
    emisionBloqueada = fn;
}

export function emitirEvento(tipo, datos) {
    if (emisionBloqueada()) return null;
    const evento = crearEvento(tipo, datos);
    // Quién lo ha emitido de esta pestaña (solo aquí, no viaja): para no recibir tu propio golpe en modo máster
    pintarEvento(evento, true, origen.idPersonaje());
    if (publicador) {
        try {
            Promise.resolve(publicador(evento)).catch(error => console.warn("No se pudo enviar el evento", error));
        } catch (error) {
            console.warn("No se pudo enviar el evento", error);
        }
    }
    return evento;
}

/** Evento que llega de la sala. Los de esta misma pestaña ya se pintaron al emitirlos;
 *  los de otras pestañas del mismo usuario (otro personaje) sí se pintan. */
export function recibirEvento(evento) {
    if (!evento || typeof evento !== "object" || evento.version !== VERSION_EVENTO) return;
    if (esInstanciaPropia(evento.instancia)) return;
    // Privados: solo los atiende su destinatario y no se pintan como pop-up
    if (manejadores[evento.tipo]) {
        if (esInstanciaPropia(evento.datos?.para) || evento.datos?.para === PARA_TODOS) {
            try { manejadores[evento.tipo](evento); } catch (error) { console.warn("Evento privado mal formado", evento, error); }
        }
        return;
    }
    // Fuera de tu grupo ves el resultado, pero no cómo se ha calculado (el máster lo ve todo)
    const completo = valor(origen.esMaster) || Boolean(origen.enMiGrupo?.(evento.instancia));
    if (!completo) evento = resumirEvento(evento);
    pintarEvento(evento, false);
    if (alRecibirPublico[evento.tipo]) {
        try { alRecibirPublico[evento.tipo](evento); } catch (error) { console.warn("Evento mal formado", evento, error); }
    }
}

/* Copia del evento sin el cálculo: sin dados ni sumandos en las tiradas y sin desglose en el daño.
   Se conservan los totales, el daño elemental y el efecto, que hacen falta para recibir el golpe. */
export function resumirEvento(evento) {
    const datos = structuredClone(evento.datos ?? {});
    const sinDesglose = (danno) => danno && typeof danno === "object" ? { ...danno, desglose: [] } : danno;
    if (evento.tipo === "tirada") {
        delete datos.dados;
        delete datos.resultadoDados;
        delete datos.valorHabilidad;
        delete datos.valorCaracteristica;
        delete datos.bonificador;
        datos.danno = sinDesglose(datos.danno) ?? null;
        datos.resumido = true;
    } else if (evento.tipo === "danno" && Array.isArray(datos.golpes)) {
        datos.golpes = datos.golpes.map(sinDesglose);
    }
    return { ...evento, datos };
}

function pintarEvento(evento, propio, idAutorPropio = null) {
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
        // Quién lo ha lanzado, encima del título (solo el personaje, no el usuario)
        const autor = String(evento.personaje ?? "").trim() || "Otro personaje";
        popup.insertAdjacentHTML("afterbegin", `<div class="popup-jugador">${escaparHtml(autor)}</div>`);
        popup.classList.add("popup-ajeno");
        hacerGolpesAplicables(popup, evento, autor);
        if (esOfertaParaMi(evento)) hacerOfertaConsumible(popup, evento, autor);
    } else if (golpesPropiosAplicables()) {
        // Modo máster: el golpe de uno de sus personajes se puede recibir en otro (el que tenga en pantalla)
        const autor = String(evento.personaje ?? "").trim() || "Tu personaje";
        hacerGolpesAplicables(popup, evento, autor, idAutorPropio);
    }
    mostrarPopup(popup, { titulo, tipo: tipoPopup, evento });
    // Los propios ya han sonado al hacer la acción; los de los demás suenan aquí
    if (!propio) {
        const sonido = evento.datos?.sonido;
        reproducir(SONIDOS_EVENTO.includes(sonido) ? sonido : SONIDO_EVENTO_AJENO);
    }
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

function hacerGolpesAplicables(popup, evento, autor, idAutorPropio = null) {
    if (!aplicadorDanno) return;
    const golpes = golpesDeEvento(evento);
    popup.querySelectorAll?.(".popup-danno[data-golpe]").forEach(bloque => {
        const golpe = golpes[Number(bloque.dataset.golpe)];
        if (!golpe) return;
        bloque.classList.add("aplicable");
        bloque.tabIndex = 0;
        bloque.setAttribute("role", "button");
        bloque.title = idAutorPropio ? "Recibir este golpe en el personaje que tienes en pantalla" : "Recibir este golpe en tu personaje";
        bloque.insertAdjacentHTML("beforeend", `<div class="popup-aplicar">Clic para recibir este golpe</div>`);
        const aplicar = (e) => {
            e.stopPropagation(); // no cierra el pop-up
            if (bloque.classList.contains("aplicado")) return;
            // tirada: total de la tirada de ataque (para compararlo con la Defensa); null si no hubo tirada (artes)
            const tirada = evento.tipo === "tirada" && Number.isFinite(Number(evento.datos?.total)) ? Number(evento.datos.total) : null;
            // origen: quién ha dado el golpe (para saber quién mata a un NPC del máster)
            // idPersonaje: en un pop-up propio del máster, su personaje que lo emitió
            const origen = { jugador: evento.jugador ?? null, instancia: evento.instancia ?? null, nombre: autor, idPersonaje: idAutorPropio };
            if (!aplicadorDanno(golpe, { autor, titulo: evento.datos?.titulo ?? "", tirada, origen })) return;
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
   "consumido": un jugador ha consumido la comida o poción que le ofrecieron.
   "borracho": una acción ha fallado por la embriaguez y el personaje ha hecho algo absurdo. */
/* "derrota": un NPC del máster ha muerto (suena datos.sonido = "muerte" en toda la sala; quien recibe EXP o
   recompensa lo aplica con registrarAlRecibir) */
["arte", "pasiva", "objeto", "reliquia", "recibido", "consumido", "borracho", "derrota"].forEach(tipo => registrarPintor(tipo, pintarLista));

/* Ofrecer comida o pociones ___________________________________________________
 * "oferta": { titulo, subtitulo, lineas, para (instancia del personaje destinatario), objeto }. Todos ven quién
 * ofrece qué a quién; solo el destinatario tiene el botón para consumirlo (gasta su boca). Si el pop-up se cierra
 * sin consumir, se pierde, así que al destinatario le sale como tirada (no se cierra solo mientras haya 2 o menos). */

/* consumir(objeto, { autor }) → true si se ha consumido */
let consumidorOferta = null;

export function setConsumidorOferta(consumir) {
    consumidorOferta = consumir;
}

const esParaMi = (datos) => esInstanciaPropia(datos?.para);
const esOfertaParaMi = (evento) => evento.tipo === "oferta" && esParaMi(evento.datos);

registrarPintor("oferta", (datos) => {
    const pintado = pintarLista(datos);
    if (esParaMi(datos)) pintado.tipoPopup = "tirada";
    return pintado;
});

function hacerOfertaConsumible(popup, evento, autor) {
    if (!consumidorOferta || !evento.datos?.objeto) return;
    // coger: botín que te ofrece un compañero (va al inventario; si no cabe, se pierde)
    const coger = Boolean(evento.datos.coger);
    const verbo = coger ? "Coger" : evento.datos.objeto.tipo === "comida" ? "Comer" : "Beber";
    popup.insertAdjacentHTML("beforeend", coger
        ? `<button type="button" class="btn-consumir-oferta" title="Va a tu inventario (lo que no cabe se pierde)">Coger</button>`
        : `<button type="button" class="btn-consumir-oferta" title="Gasta la acción de la boca">${verbo} (acción de boca)</button>`);
    const boton = popup.querySelector(".btn-consumir-oferta");
    boton.addEventListener("click", (e) => {
        e.stopPropagation(); // no cierra el pop-up
        if (boton.disabled) return;
        if (!consumidorOferta(evento.datos.objeto, { autor, para: evento.datos.para, coger })) return;
        boton.disabled = true;
        boton.textContent = coger ? "✓ Cogido" : "✓ Consumida";
    });
}
