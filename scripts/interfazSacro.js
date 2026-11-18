// scripts/interfazSacro.js
// Ventana de magia (#modalSacro, 13-sacro.md §6 y §13): se abre al pulsar la habilidad Sacro. Las dos manos (silueta de
// imgs/mano.svg.svg, siluetasSacro.js) y la fila de los pies; cada punta de dedo es una diana a la que se arrastra un
// elemento (o se toca la ficha y después el dedo). Fuentes: Generar (PV), Cinturón (cristales elementales llenos),
// Ambiente (lo que conceda el máster) y Quitado (tras escanear). Resumen en vivo con el coste, las acciones y el daño.
// Lo puesto en un dedo se puede arrastrar a otro (se intercambian) o fuera (vuelve a su fuente).
// "Usar ahora" (sin el máster): Guardar en una mano y Llenar cristal (va solo al cristal del cinturón donde quepa,
// cristalParaLlenar). "Pedir al máster": tipo (Daño, Objeto, Escenario; TIPOS_HECHIZO), texto opcional y Enviar, que deja
// la petición esperando en pj.hechizo y emite "hechizo" (para: PARA_TODOS; lo atiende el máster de la sala, ver
// interfazSacroMaster.js). Sin máster conectado (ctx.masterConectado) el daño se resuelve con la sugerencia, el objeto con
// la propuesta (propuestaObjetos) y el escenario no se puede. La respuesta "hechizoResultado" se aplica con
// aplicarResultadoHechizo: quita lo robado a sus dueños (confirmarRobos, todo o nada; si falta algo no se gasta nada),
// gasta las acciones y los PV, los cristales y el ambiente usados, y saca los golpes (uno por golpe del máster, con su
// tirada), los objetos al botín o la nota. "Pedir" (ambiente) emite "peticionAmbiente" y la respuesta "ambiente" llena
// pj.ambienteSacro.
// Reglas en sacro.js; este módulo solo es DOM. inicializarSacro(ctx) desde interfaz.js.

import {
    ELEMENTOS_SACRO, CLAVES_ELEMENTOS_SACRO, parteDeDedo, dedosSacro, motivoDedoNoUsable, motivoNoDedos, costeGenerar,
    motivoNoGenerar, partesHechizo, entradaDannoSacro, maximoPorDedo, guardarEnMano,
    llenarCristal, describirEnergia, puedeUsarMagia, cargarDedos, cargarAmbiente, gastarHechizo, esElementoSacro,
    energiaDe, quitarElementos, devolverElementos, maxTransfusion, MODOS_TRANSFUSION, minimoTransfusion,
    motivoNoGuardarEnMano, cristalParaLlenar, sugerenciaPorDedo, propuestaObjetos, TIPOS_HECHIZO, DANNO_FISICO, esDannoMagia
} from "./sacro.js";
import { fichaDannoMagia } from "./elementosSacro.js";
import { noSeCura } from "./estados.js";
import { manoVacia } from "./turno.js";
import { caracteristicaArma } from "./ataque.js";
import { cargarObjeto, cargarEstadosObjeto, manoParaUsar } from "./objetos.js";
import { TIPOS_DOS_MANOS } from "./equipamiento.js";
import { emitirPrivado, emitirEvento, registrarManejador, PARA_TODOS } from "./eventos.js";
import { mostrarPopupDanno } from "./dados.js";
import { esDelMasterDeSala } from "./interfazOnline.js";
import { MANO_D, MANO_ANCHO, MANO_ALTO, PUNTAS_MANO } from "./siluetasSacro.js";
import { cinturonesPuestos, objetoCinturon } from "./cinturon.js";
import { iconoSao } from "./iconos.js";
import { prepararFormularioSao, actualizarPaso } from "./formularioSao.js";
import { escaparHtml } from "./html.js";

let ctx = null;
const el = (id) => document.getElementById(id);
const ventana = () => el("modalSacro");
const pj = () => ctx.personaje();

/* Lo puesto en los dedos mientras la ventana está abierta: id → { id, elemento, origen, fuente, puntos? } */
const dedos = new Map();
let elegida = null; // ficha tocada (alternativa a arrastrar)
let esperandoAmbiente = false; // se ha preguntado al máster qué hay en el ambiente
/* Escaneo (13-sacro.md §12): { id, terminado, resultados: Map(instancia → { instancia, nombre, npc, elementos }) } */
let escaneo = null;
/* Quitar elementos a otra pestaña al resolver: id de la petición → resolve({ ok, quitados }) */
const quitando = new Map();
const SEGUNDOS_QUITAR = 8;
const nuevoId = () => globalThis.crypto?.randomUUID?.() ?? `x-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
let mensaje = "";
let forma = "";
let tipoPeticion = ""; // danno | objeto | escenario (TIPOS_HECHIZO): obligatorio para enviar
let ignorarClic = false; // tras arrastrar un dedo, el clic que llega después no lo quita
let conservarAlCerrar = false; // la ventana se cierra para volver (ambiente del máster): no se vacían los dedos

const MANOS = ["manoIzquierda", "manoDerecha"];
const ETIQUETA_MANO = { manoIzquierda: "Mano izquierda", manoDerecha: "Mano derecha" };
const NOMBRES_PARTES = { cabeza: "boca", izquierda: "brazo izq.", derecha: "brazo der.", pies: "piernas" };
const RADIO_DIANA = 68;

const conColor = (clave) => `--color:${ELEMENTOS_SACRO[clave].color};--color-glifo:${ELEMENTOS_SACRO[clave].colorGlifo ?? "#FBFBFB"}`;
const iconoElemento = (clave) => `<span class="icono-activo" style="${conColor(clave)}">${iconoSao(ELEMENTOS_SACRO[clave].icono)}</span>`;
const coma = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
const lista = () => [...dedos.values()];

/* Fuentes ____________________________________________________________________ */
const usados = (origen, fuente) => lista().filter(d => d.origen === origen && d.fuente === fuente).length;

/* Cristales elementales con elemento de los cinturones puestos (fuente = "accesorio-N:i") */
function cristalesCinturon(p) {
    return cinturonesPuestos(p).flatMap(({ ranura, equipo }) => equipo.cinturon.objetos
        .map((objeto, indice) => ({ ranura, indice, objeto }))
        .filter(({ objeto }) => objeto?.subtipo === "cristalElemental"));
}

function fuentes() {
    const p = pj();
    const generar = CLAVES_ELEMENTOS_SACRO.filter(c => ELEMENTOS_SACRO[c].coste !== null)
        .map(c => ({ origen: "generar", fuente: c, elemento: c, texto: `${coma(ELEMENTOS_SACRO[c].coste * (Number(p.aguante) || 0) / 3)} PV` }));
    const cinturon = cristalesCinturon(p)
        .filter(({ objeto, ranura, indice }) => objeto.elemento && !usados("cinturon", `${ranura}:${indice}`))
        .map(({ objeto, ranura, indice }) => ({
            origen: "cinturon", fuente: `${ranura}:${indice}`, elemento: objeto.elemento.clave,
            puntos: Math.min(objeto.elemento.puntos, maximoPorDedo(p, objeto.elemento.clave)),
            texto: `${objeto.nombre} · ${objeto.elemento.puntos}`
        }));
    // El ambiente lo concede el máster; lo quitado sale de escanear (lo que lleva cada uno en las manos)
    const ambiente = (p.ambienteSacro ?? []).map((a, i) => ({ origen: "ambiente", fuente: String(i), elemento: a.elemento, quedan: a.dedos - usados("ambiente", String(i)), texto: `×${a.dedos - usados("ambiente", String(i))}` }));
    // Lo quitado no se le quita hasta resolver: aquí solo se descuenta lo que ya está puesto en un dedo
    const quitado = [...(escaneo?.resultados.values() ?? [])].flatMap(r => r.elementos.map(a => {
        const fuente = `${r.instancia}|${a.elemento}`;
        const quedan = Math.max(0, a.dedos - usados("quitado", fuente));
        return { origen: "quitado", fuente, elemento: a.elemento, quedan, texto: `${r.nombre}${r.npc ? " (NPC)" : ""} ×${quedan}` };
    }));
    return { generar, cinturon, ambiente, quitado };
}
const fichaDe = (origen, fuente) => Object.values(fuentes()).flat().find(f => f.origen === origen && String(f.fuente) === String(fuente));

const htmlFicha = (f) => {
    const info = ELEMENTOS_SACRO[f.elemento];
    const activa = elegida && elegida.origen === f.origen && String(elegida.fuente) === String(f.fuente);
    return `<button type="button" class="ficha-elemento${activa ? " elegida" : ""}" data-origen="${f.origen}" data-fuente="${escaparHtml(String(f.fuente))}"
        ${f.quedan === 0 ? "disabled" : ""} title="${escaparHtml(`${info.etiqueta} (${info.que.toLowerCase()}, daño de ${info.textoDanno})`)}">
        ${iconoElemento(f.elemento)}${escaparHtml(info.etiqueta)} <small>${escaparHtml(f.texto)}</small></button>`;
};

/* Siluetas ____________________________________________________________________ */
function htmlDiana(id, cx, cy, r) {
    const p = pj();
    const motivo = motivoDedoNoUsable(p, id);
    const asignado = dedos.get(id);
    const sinDedos = !asignado && !motivo && dedos.size >= dedosSacro(p);
    const titulo = motivo ?? (asignado ? `${ELEMENTOS_SACRO[asignado.elemento].etiqueta}: toca para quitarlo`
        : sinDedos ? "Tu Sacro no da para más dedos" : "Suelta aquí un elemento");
    const glifo = asignado ? iconoSao(ELEMENTOS_SACRO[asignado.elemento].icono).replace(/^\s*<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "") : "";
    const contenido = asignado
        ? `<g class="icono-activo" style="${conColor(asignado.elemento)}"><g class="icono-sao" transform="translate(${cx - r} ${cy - r}) scale(${(2 * r) / 100})">${glifo}</g></g>`
        : "";
    return `<g class="dedo-sacro${asignado ? " lleno" : ""}${motivo ? " bloqueado" : ""}${sinDedos ? " sin-dedos" : ""}" data-dedo="${id}" role="button"
        tabindex="${motivo ? -1 : 0}" aria-label="${escaparHtml(titulo)}"><title>${escaparHtml(titulo)}</title><circle class="anillo" cx="${cx}" cy="${cy}" r="${r}"/>${contenido}</g>`;
}

/* La derecha tal cual (palma de frente, pulgar a la izquierda) y la izquierda reflejada: los pulgares hacia el centro */
function htmlMano(mano) {
    const p = pj();
    const reflejo = mano === "manoIzquierda";
    const X = (x) => (reflejo ? MANO_ANCHO - x : x);
    const motivo = motivoDedoNoUsable(p, `${mano}-1`);
    const silueta = `<g class="silueta" transform="${reflejo ? `translate(${MANO_ANCHO} 0) scale(-1 1) ` : ""}translate(0 ${MANO_ALTO}) scale(0.1 -0.1)"><path d="${MANO_D}"/></g>`;
    const dosManos = MANOS.some(m => TIPOS_DOS_MANOS.includes(p[m]?.tipo));
    const ocupadaPor = !motivo ? (dosManos ? "arma a dos manos: sin guardar energía" : "")
        : p.energiaManos?.[mano] ? "con energía" : dosManos ? "arma a dos manos" : (p[mano]?.nombre?.trim() || "ocupada");
    return `<div class="mano-sacro${motivo ? " ocupada" : ""}">
        <div class="titulo-mano">${ETIQUETA_MANO[mano]}${ocupadaPor ? ` · ${escaparHtml(ocupadaPor)}` : ""}</div>
        <svg viewBox="-20 -80 ${MANO_ANCHO + 40} ${MANO_ALTO + 100}" aria-label="${ETIQUETA_MANO[mano]}">${silueta}${PUNTAS_MANO.map(([x, y], i) => htmlDiana(`${mano}-${i}`, X(x), y, RADIO_DIANA)).join("")}</svg>
    </div>`;
}

function htmlPies() {
    const posiciones = Array.from({ length: 10 }, (_, i) => [28 + i * 40 + (i >= 5 ? 40 : 0), 26]);
    return `<svg viewBox="0 0 460 52" aria-label="Pies"><g class="silueta"><rect x="8" y="14" width="200" height="30" rx="15"/><rect x="252" y="14" width="200" height="30" rx="15"/></g>
        ${posiciones.map(([x, y], i) => htmlDiana(`pies-${i}`, x, y, 12)).join("")}</svg>`;
}

/* Pintar ______________________________________________________________________ */
function pintar() {
    const p = pj();
    if (!p || !ventana()) return;
    // Lo que ya no existe (un cristal gastado, una mano que se ha ocupado) sale de los dedos
    for (const dedo of lista()) {
        if (motivoDedoNoUsable(p, dedo.id) || (dedo.origen !== "generar" && !fichaDe(dedo.origen, dedo.fuente) && !esUsado(dedo))) dedos.delete(dedo.id);
    }
    const puestos = lista();
    el("contadorSacro").textContent = `(${puestos.length} / ${dedosSacro(p)} dedos)`;
    const cuerpo = el("cuerpoSacro");

    // Petición enviada al máster: solo se ve y se puede cancelar
    if (p.hechizo) {
        const tipo = TIPOS_HECHIZO[p.hechizo.tipo] ?? TIPOS_HECHIZO.danno;
        cuerpo.innerHTML = `<div class="esperando-sacro">
            <p><b>Esperando al máster…</b></p>
            <p>${escaparHtml(tipo.etiqueta)}: ${escaparHtml(describirEnergia({ dedos: p.hechizo.dedos }))}${p.hechizo.forma ? ` · «${escaparHtml(p.hechizo.forma)}»` : ""}</p>
            <p>Mientras tanto no puedes seguir con tu turno. Las acciones, los PV y los elementos se gastan cuando lo resuelva.</p>
            <button type="button" class="btn-pastilla-sao" data-accion="cancelarPeticion">Cancelar la petición</button>
        </div>`;
        return;
    }

    const f = fuentes();
    const partes = puestos.length ? partesHechizo(puestos) : [];
    const coste = costeGenerar(p, puestos);
    const sinPV = Boolean(motivoNoGenerar(p, puestos));
    const danno = sugerenciaPorDedo(p, puestos).filter(e => e.cantidad > 0);
    const motivo = puestos.length ? motivoNoDedos(p, puestos) || motivoNoGenerar(p, puestos) : "";
    const manosCon = MANOS.filter(m => puestos.some(d => parteDeDedo(d.id) === m));
    const llenar = destinoLlenar(p, puestos);
    const puedePedir = !esperandoAmbiente && (ctx.esMaster || ctx.enSala());
    const puedeEscanear = !(escaneo && !escaneo.terminado) && (ctx.esMaster || ctx.enSala());
    const fichasDanno = danno.map(e => {
        const ficha = entradaDannoSacro(e.elemento, e.cantidad);
        return `<span class="popup-elemento" style="--color:${ficha.color};--color-texto:${ficha.colorTexto}" title="${escaparHtml(ficha.etiqueta)}">${ficha.cantidad} ${escaparHtml(ELEMENTOS_SACRO[e.elemento].etiqueta)}</span>`;
    }).join("");
    // Guardar en una mano: con dedos en esa mano, que la mano lo permita (arma a dos manos) y sin otro motivo
    const motivoGuardar = (m) => motivoNoGuardarEnMano(p, m) || (!manosCon.includes(m) ? "Pon elementos en los dedos de esa mano" : motivo);
    const motivoEnviar = !puestos.length ? "Pon algún elemento en los dedos" : !tipoPeticion ? "Elige si es daño, objeto o escenario" : motivo;

    cuerpo.innerHTML = `
        <div class="sacro-fuentes">
            <div class="sacro-fuente"><h3>${iconoSao("magia")}Generar <small>(con tus PV)</small></h3><div class="sacro-fichas">${f.generar.map(htmlFicha).join("")}</div></div>
            <div class="sacro-fuente"><h3>${iconoSao("cinturon")}Cinturón</h3>${f.cinturon.length ? `<div class="sacro-fichas">${f.cinturon.map(htmlFicha).join("")}</div>` : `<p class="lista-vacia">Sin cristales elementales con elemento.</p>`}</div>
            <div class="sacro-fuente"><h3>${iconoSao("mapa")}Ambiente <button type="button" class="btn-pastilla-sao" data-accion="pedirAmbiente" ${puedePedir ? "" : "disabled"} title="${escaparHtml(puedePedir ? "Pregúntale al máster qué hay en el ambiente (no gasta acción)" : esperandoAmbiente ? "Esperando la respuesta del máster" : "Solo en una sala con máster")}">${esperandoAmbiente ? "Esperando…" : "Pedir"}</button></h3>${f.ambiente.length ? `<div class="sacro-fichas">${f.ambiente.map(htmlFicha).join("")}</div>` : `<p class="lista-vacia">${esperandoAmbiente ? "Esperando al máster…" : "El máster aún no te ha dicho qué hay."}</p>`}</div>
            <div class="sacro-fuente"><h3>${iconoSao("personaje")}Quitado <button type="button" class="btn-pastilla-sao" data-accion="escanear" ${puedeEscanear ? "" : "disabled"} title="${escaparHtml(puedeEscanear ? "Ver quién de la sala tiene energía en las manos (y los NPC cargados)" : escaneo && !escaneo.terminado ? "Escaneando…" : "Solo en una sala")}">${escaneo && !escaneo.terminado ? "Escaneando…" : "Escanear"}</button></h3>${f.quitado.length ? `<div class="sacro-fichas">${f.quitado.map(htmlFicha).join("")}</div><p class="lista-vacia">Ponlo en un dedo: se le quita (sin tirada) cuando se resuelva.</p>` : `<p class="lista-vacia">${escaneo?.terminado ? "Nadie tiene energía en las manos." : escaneo ? "Escaneando…" : "Escanea para ver quién tiene energía."}</p>`}</div>
        </div>
        <div class="sacro-manos">
            <div class="sacro-manos-fila">${MANOS.map(htmlMano).join("")}</div>
            <div class="pies-sacro">${htmlPies()}<div>Pies: solo con ropa o armadura real</div></div>
        </div>
        <div class="sacro-resumen">
            <span class="dato-sacro"><b>Coste</b><span class="valor${sinPV ? " negativo" : ""}">${coste}</span> de ${p.vida} PV</span>
            <span class="dato-sacro"><b>Acciones</b><span class="valor">${partes.length || "—"}</span> ${escaparHtml(partes.map(x => NOMBRES_PARTES[x]).join(", "))}${partes.length > 3 ? " (solo sin acciones gastadas)" : ""}</span>
            <span class="dato-sacro"><b>Daño</b><span class="danno-sacro">${fichasDanno || "—"}</span></span>
            <button type="button" class="btn-pastilla-sao" data-accion="vaciar" ${puestos.length ? "" : "disabled"}>Quitar todo</button>
        </div>
        <p class="aviso-zona aviso-sacro">${escaparHtml(mensaje || motivo || "")}</p>
        <div class="sacro-acciones">
            <div class="tarjeta-accion-sacro">
                <h3>${iconoSao("usar")}Usar ahora <small>sin el máster</small></h3>
                <div class="botones-usar">
                    ${MANOS.map(m => `<button type="button" class="btn-pastilla-sao" data-accion="guardar" data-mano="${m}" ${motivoGuardar(m) ? "disabled" : ""}
                        title="${escaparHtml(motivoGuardar(m) || "Guarda los dedos de esa mano: solo gasta la boca y los PV; se pierde al segundo Play o al descansar")}">Guardar en la ${ETIQUETA_MANO[m].toLowerCase()}</button>`).join("")}
                    <button type="button" class="btn-pastilla-sao" data-accion="llenar" ${llenar.motivo || motivo ? "disabled" : ""}
                        title="${escaparHtml(llenar.motivo || motivo || llenar.texto)}">Llenar cristal</button>
                </div>
            </div>
            <div class="tarjeta-accion-sacro">
                <h3>${iconoSao("personaje")}Pedir al máster</h3>
                <div class="cabecera-pedir">
                    <label for="formaSacro">Qué quiero hacer <small>(opcional)</small></label>
                    <div class="tipos-sacro" role="radiogroup" aria-label="Tipo de magia">
                        ${Object.entries(TIPOS_HECHIZO).map(([clave, t]) => `<button type="button" class="tipo-sacro" role="radio" data-tipo="${clave}"
                            aria-checked="${tipoPeticion === clave}" title="${escaparHtml(t.ayuda)}">${iconoSao(t.icono)}${escaparHtml(t.etiqueta)}</button>`).join("")}
                    </div>
                </div>
                <textarea id="formaSacro" rows="2" maxlength="500"></textarea>
                <div class="pie-pedir">
                    <span class="pista">${escaparHtml(motivoEnviar || "No gasta nada hasta que el máster lo resuelva")}</span>
                    <button type="button" class="btn-eleccion" data-accion="enviar" ${motivoEnviar ? "disabled" : ""} title="${escaparHtml(motivoEnviar || "Enviar al máster")}">Enviar al máster</button>
                </div>
            </div>
        </div>`;
    el("formaSacro").value = forma;
}

/* Llenar cristal: todos los dedos con el mismo elemento (ninguno sacado de un cristal) y el cristal del cinturón donde
   quepa (cristalParaLlenar). @returns { motivo } o { cristal: { ranura, indice, objeto }, anadido, perdido, texto } */
function destinoLlenar(p, puestos) {
    if (!puestos.length) return { motivo: "Pon algún elemento en los dedos" };
    if (new Set(puestos.map(d => d.elemento)).size !== 1) return { motivo: "Para llenar un cristal, todos los dedos con el mismo elemento" };
    if (puestos.some(d => d.origen === "cinturon")) return { motivo: "No se puede llenar un cristal con otro cristal" };
    const elemento = puestos[0].elemento;
    const r = cristalParaLlenar(p, cristalesCinturon(p), elemento, puestos.length);
    if (!r) return { motivo: `Ningún cristal elemental del cinturón admite ${ELEMENTOS_SACRO[elemento].etiqueta}` };
    const nombre = r.candidato.objeto.nombre;
    return {
        cristal: r.candidato, anadido: r.anadido, perdido: r.perdido,
        texto: `Llena ${nombre} (+${r.anadido}${r.perdido ? `, se pierden ${r.perdido}` : ""}). Gasta la boca y los PV`
    };
}
/* Un cristal del cinturón ya puesto en un dedo no está en fuentes() (no se puede usar dos veces), pero sigue valiendo */
function esUsado(dedo) {
    if (dedo.origen !== "cinturon") return true;
    const [ranura, indice] = String(dedo.fuente).split(":");
    return Boolean(objetoCinturon(pj(), ranura, Number(indice))?.elemento);
}

/* Poner y quitar ______________________________________________________________ */
function poner(id, f) {
    const p = pj();
    mensaje = "";
    if (!f || f.quedan === 0) return pintar();
    const motivo = motivoDedoNoUsable(p, id);
    if (motivo) { mensaje = motivo; return pintar(); }
    if (!dedos.has(id) && dedos.size >= dedosSacro(p)) { mensaje = `Tu Sacro solo da para ${dedosSacro(p)} dedos.`; return pintar(); }
    // Lo quitado lleva la potencia que tenía en la mano de su dueño (del escaneo); no se le quita hasta resolver
    const puntos = f.origen === "quitado" ? puntosQuitado(f.fuente) : f.puntos;
    dedos.set(id, { id, elemento: f.elemento, origen: f.origen, fuente: f.fuente, ...(Number.isFinite(puntos) ? { puntos } : {}) });
    elegida = null;
    pintar();
}

/* Mueve lo puesto en un dedo a otro (si el otro está lleno, se intercambian) */
function moverDedo(desde, hasta) {
    const p = pj();
    const origen = dedos.get(desde);
    if (!origen || desde === hasta) return pintar();
    const motivo = motivoDedoNoUsable(p, hasta);
    if (motivo) { mensaje = motivo; return pintar(); }
    const destino = dedos.get(hasta);
    dedos.delete(desde);
    dedos.set(hasta, { ...origen, id: hasta });
    if (destino) dedos.set(desde, { ...destino, id: desde });
    mensaje = "";
    ctx.reproducir("click");
    pintar();
}

/* Gasta los cristales del cinturón de los que salen estos dedos (al guardar en la mano) */
function gastarCristales(puestos) {
    for (const dedo of puestos.filter(d => d.origen === "cinturon")) {
        const [ranura, indice] = String(dedo.fuente).split(":");
        const cristal = objetoCinturon(pj(), ranura, Number(indice));
        if (cristal) cristal.elemento = null;
    }
}

/* Guardar en una mano: primero se quita lo robado (si alguien ya no lo tiene, no se hace nada) */
async function guardar(mano) {
    const p = pj();
    const deMano = lista().filter(d => parteDeDedo(d.id) === mano);
    const robos = await confirmarRobos(deMano);
    if (!robos.ok) return fallarRobo(robos, deMano);
    const { resultado, fallo } = ctx.conEmbriaguez("objeto", () => guardarEnMano(p, mano, cargarDedos(deMano), ctx.gastar));
    if (fallo || !resultado.ok) robos.deshacer();
    if (fallo) { dedos.clear(); ctx.actualizarTodo(); return pintar(); }
    mensaje = resultado.resumen.join(" · ");
    if (resultado.ok) {
        gastarCristales(deMano);
        deMano.forEach(d => dedos.delete(d.id));
    }
    ctx.actualizarTodo();
    // Guardado y sin más elementos puestos: la ventana se cierra (el resumen sale como aviso)
    if (resultado.ok && !dedos.size) {
        ctx.aviso("Energía guardada", resultado.resumen);
        mensaje = "";
        bootstrap.Modal.getInstance(ventana())?.hide();
        return;
    }
    pintar();
}

/* Llenar el cristal que elige destinoLlenar (donde quepa o el que menos pierde) */
async function llenar() {
    const p = pj();
    const puestos = lista();
    const destino = destinoLlenar(p, puestos);
    const motivo = destino.motivo || motivoNoGenerar(p, puestos);
    if (motivo) { mensaje = motivo; return pintar(); }
    const cristal = destino.cristal.objeto;
    const robos = await confirmarRobos(puestos);
    if (!robos.ok) return fallarRobo(robos, puestos);
    const { resultado: gastado, fallo } = ctx.conEmbriaguez("objeto", () => ctx.gastar(["cabeza"], `Llenar ${cristal.nombre}`));
    if (fallo || !gastado) {
        robos.deshacer();
        mensaje = fallo ? "" : "Sin acción de boca.";
        ctx.actualizarTodo();
        return pintar();
    }
    const coste = costeGenerar(p, puestos);
    const r = llenarCristal(p, cristal, puestos[0].elemento, puestos.length);
    p.vida -= coste;
    mensaje = `${cristal.nombre}: +${r.anadido} de ${ELEMENTOS_SACRO[puestos[0].elemento].etiqueta}${r.perdido ? ` (se pierden ${r.perdido}: no caben)` : ""}${coste ? ` · −${coste} PV` : ""}`;
    dedos.clear();
    ctx.actualizarTodo();
    pintar();
}

function alPulsar(e) {
    const dedo = e.target.closest(".dedo-sacro");
    if (dedo) {
        if (ignorarClic) return;
        if (dedo.classList.contains("bloqueado")) { mensaje = motivoDedoNoUsable(pj(), dedo.dataset.dedo) ?? ""; return pintar(); }
        if (elegida) return poner(dedo.dataset.dedo, elegida);
        if (dedos.has(dedo.dataset.dedo)) { dedos.delete(dedo.dataset.dedo); mensaje = ""; ctx.reproducir("click"); return pintar(); }
        mensaje = "Elige primero un elemento: arrástralo o tócalo.";
        return pintar();
    }
    const tipo = e.target.closest(".tipo-sacro");
    if (tipo) {
        ctx.reproducir("click");
        tipoPeticion = tipo.dataset.tipo;
        return pintar();
    }
    const boton = e.target.closest("button[data-accion]");
    if (!boton || boton.disabled) return;
    ctx.reproducir("click");
    const p = pj();
    switch (boton.dataset.accion) {
        case "guardar": return guardar(boton.dataset.mano);
        case "llenar": return llenar();
        case "enviar": return enviar();
        case "vaciar": dedos.clear(); mensaje = ""; break;
        case "escanear": escanear(); break;
        case "pedirAmbiente": {
            esperandoAmbiente = true;
            // Un personaje del máster: se cierra esta ventana para que se abra la del ambiente (y vuelve al responder)
            if (ctx.esMaster) {
                conservarAlCerrar = true; // vuelve a abrirse con el ambiente: los dedos puestos se quedan
                bootstrap.Modal.getInstance(ventana())?.hide();
                ctx.pedirAmbienteLocal(ctx.instancia(), p.nombre || "Sin nombre");
            }
            else emitirPrivado("peticionAmbiente", { para: PARA_TODOS }).catch(error => {
                esperandoAmbiente = false;
                ctx.aviso("Ambiente", [`No se pudo preguntar al máster: ${error.message ?? error}`]);
                pintar();
            });
            break;
        }
        case "cancelarPeticion": {
            const id = p.hechizo?.id;
            p.hechizo = null;
            if (ctx.esMaster) ctx.cancelarLocal(id);
            else emitirPrivado("hechizoCancelado", { para: PARA_TODOS, id }).catch(() => {});
            mensaje = "Petición cancelada: no se ha gastado nada.";
            ctx.actualizarTodo();
            break;
        }
    }
    pintar();
}

/* Arrastrar (ratón y táctil): una ficha a un dedo (un toque sin moverse la deja elegida), o lo puesto en un dedo a
   otro dedo (se mueve o se intercambia) o fuera de los dedos (vuelve a su fuente) */
function alApretar(e) {
    const boton = e.target.closest(".ficha-elemento");
    const dedoLleno = boton ? null : e.target.closest(".dedo-sacro.lleno");
    if ((!boton || boton.disabled) && !dedoLleno) return;
    const f = boton ? fichaDe(boton.dataset.origen, boton.dataset.fuente) : null;
    const desde = dedoLleno?.dataset.dedo;
    const inicio = { x: e.clientX, y: e.clientY };
    let fantasma = null;
    const crearFantasma = () => {
        if (boton) return boton.cloneNode(true);
        const puesto = dedos.get(desde);
        const ficha = document.createElement("span");
        ficha.className = "ficha-elemento";
        ficha.innerHTML = `${iconoElemento(puesto.elemento)}${escaparHtml(ELEMENTOS_SACRO[puesto.elemento].etiqueta)}`;
        return ficha;
    };
    const mover = (ev) => {
        if (!fantasma && Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) < 6) return;
        if (!fantasma) {
            fantasma = crearFantasma();
            fantasma.classList.add("ficha-fantasma");
            document.body.appendChild(fantasma);
        }
        fantasma.style.left = `${ev.clientX}px`;
        fantasma.style.top = `${ev.clientY}px`;
        ventana().querySelectorAll(".dedo-sacro.diana").forEach(d => d.classList.remove("diana"));
        document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".dedo-sacro:not(.bloqueado)")?.classList.add("diana");
    };
    const soltar = (ev) => {
        document.removeEventListener("pointermove", mover);
        document.removeEventListener("pointerup", soltar);
        if (!fantasma) {
            // Un toque en un dedo lleno lo quita (lo hace el clic); en una ficha, la deja elegida
            if (boton) {
                elegida = elegida && elegida.origen === f.origen && String(elegida.fuente) === String(f.fuente) ? null : f;
                pintar();
            }
            return;
        }
        fantasma.remove();
        const destino = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".dedo-sacro");
        if (boton) return destino ? poner(destino.dataset.dedo, f) : pintar();
        // Tras arrastrar un dedo no cuenta el clic que llega a continuación
        ignorarClic = true;
        setTimeout(() => { ignorarClic = false; }, 0);
        if (destino) return moverDedo(desde, destino.dataset.dedo);
        dedos.delete(desde);
        mensaje = "";
        ctx.reproducir("click");
        pintar();
    };
    document.addEventListener("pointermove", mover);
    document.addEventListener("pointerup", soltar);
}

/* Enviar al máster _______________________________________________________________
 * La petición queda en pj.hechizo esperando (sin gastar nada hasta que la resuelva). Sin máster (fuera de una sala o
 * sin personajes del máster conectados): el daño se resuelve con la sugerencia, el objeto con la propuesta y el
 * escenario no se puede. */
async function enviar() {
    const p = pj();
    const puestos = lista();
    if (!tipoPeticion) { mensaje = "Elige si es daño, objeto o escenario."; return pintar(); }
    const motivo = motivoNoDedos(p, puestos) || motivoNoGenerar(p, puestos);
    if (motivo) { mensaje = motivo; return pintar(); }
    const hechizo = {
        id: nuevoId(),
        tipo: tipoPeticion,
        dedos: puestos.map(({ id, elemento, origen, fuente, puntos }) => ({ id, elemento, origen, fuente: String(fuente), ...(Number.isFinite(puntos) ? { puntos } : {}) })),
        forma: forma.trim(),
        hora: Date.now()
    };
    // Para el máster: el daño de cada dedo por separado (cada uno un golpe) y, en Objeto, lo que sale por defecto
    const sugerencia = sugerenciaPorDedo(p, puestos);
    const objetos = hechizo.tipo === "objeto" ? propuestaObjetos(p, puestos).map(cargarObjeto).filter(Boolean) : [];
    const nombre = p.nombre || "Sin nombre";
    const conMaster = ctx.esMaster || ctx.masterConectado();
    if (!conMaster && hechizo.tipo === "escenario") {
        mensaje = "El máster no está conectado: para cambiar el escenario hace falta el máster.";
        ctx.aviso("Magia", [mensaje]);
        return pintar();
    }
    if (!conMaster && hechizo.tipo === "objeto" && !objetos.length) {
        mensaje = "Sin el máster, solo la Kristala (cristales) y la Metala (metal) crean objetos.";
        ctx.aviso("Magia", [mensaje]);
        return pintar();
    }
    p.hechizo = hechizo;
    dedos.clear();
    forma = "";
    mensaje = "";
    ctx.actualizarTodo();
    if (ctx.esMaster) {
        // Un personaje del máster: se cierra esta ventana y se abre la de resolver
        bootstrap.Modal.getInstance(ventana())?.hide();
        return ctx.encolarLocal(ctx.instancia(), nombre, hechizo, sugerencia, objetos);
    }
    if (!conMaster) {
        // Sin máster: lo que saldría por defecto
        const resultado = hechizo.tipo === "danno" ? resultadoPorDefecto(hechizo.id, sugerencia) : { id: hechizo.id, objetos };
        return aplicarResultadoHechizo(null, { ...resultado, nota: "Sin máster: se aplica lo que sale por defecto." });
    }
    pintar();
    emitirPrivado("hechizo", { para: PARA_TODOS, hechizo, sugerencia, objetos }).catch(error => {
        if (pj().hechizo?.id === hechizo.id) pj().hechizo = null;
        ctx.aviso("Magia", [`No se pudo enviar al máster: ${error.message ?? error}`]);
        ctx.actualizarTodo();
        pintar();
    });
}

/* Daño sin máster: un golpe por dedo con su tirada de Inteligencia + Percepción y dado medio */
function resultadoPorDefecto(id, sugerencia) {
    return {
        id, radio: 1,
        golpes: sugerencia.filter(s => s.cantidad > 0).map(s => ({ danno: [{ elemento: s.elemento, cantidad: s.cantidad }], estados: false })),
        tirada: { caracteristica: "inteligencia", habilidad: "percepcion", dado: 1 }
    };
}

/* Escanear y quitar (13-sacro.md §12) ___________________________________________________
 * Escanear emite "escaneo" a toda la sala; cada pestaña con energía en las manos (o NPC cargados, en la del máster)
 * contesta "escaneoRespuesta" solo al que escanea, con la potencia de cada dedo. Los personajes de esta misma pestaña
 * (los del máster) se miran en local. Lo quitado se pone en un dedo sin quitárselo a nadie: se le quita al resolver
 * (confirmarRobos: en local o con "quitarEnergia" a la pestaña dueña, que contesta "energiaQuitada"). */
const SEGUNDOS_ESCANEO = 3;

/* Lo que llevan encima los personajes de esta pestaña (salvo el que escanea) */
function energiaPropia(salvo = null) {
    return ctx.personajesPropios().filter(inst => inst !== salvo).map(inst => {
        const x = ctx.leerPersonaje(inst);
        const elementos = x ? energiaDe(x) : [];
        return elementos.length ? { instancia: inst, nombre: x.nombre || "Sin nombre", npc: Boolean(x.esNpc), elementos } : null;
    }).filter(Boolean);
}

// Potencia de un dedo (con decimales; solo se redondea el resultado de la magia)
const puntoValido = (n) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? null : Math.max(0, Math.min(999, Math.round(Number(n) * 100) / 100)));
/* Lo quitado a alguien (viene de otra pestaña: se valida): { elemento, puntos, mano? } o, de un cristal, { ranura, indice } */
const cargarQuitado = (q) => ({
    elemento: q.elemento, puntos: puntoValido(q.puntos),
    ...(MANOS.includes(q.mano) ? { mano: q.mano } : {}),
    ...(/^accesorio-\d+$/.test(String(q.ranura)) && Number.isInteger(q.indice) ? { ranura: q.ranura, indice: q.indice } : {})
});

function anadirResultados(lista) {
    for (const r of Array.isArray(lista) ? lista : []) {
        const elementos = (Array.isArray(r?.elementos) ? r.elementos : []).filter(a => esElementoSacro(a?.elemento))
            .map(a => {
                const dedosA = entero(a.dedos, 40);
                const puntos = (Array.isArray(a.puntos) ? a.puntos : []).slice(0, dedosA).map(puntoValido);
                const origenes = (Array.isArray(a.origenes) ? a.origenes : []).slice(0, dedosA).map(o => (["mano", "cinturon", "npc"].includes(o) ? o : "mano"));
                return { elemento: a.elemento, dedos: dedosA, puntos, origenes };
            }).filter(a => a.dedos > 0);
        if (!r?.instancia || !elementos.length) continue;
        escaneo.resultados.set(String(r.instancia), { instancia: String(r.instancia), nombre: String(r.nombre ?? "").slice(0, 60) || "Alguien", npc: r.npc === true, elementos });
    }
}

function escanear() {
    escaneo = { id: nuevoId(), terminado: false, resultados: new Map() };
    anadirResultados(energiaPropia(ctx.instancia()));
    if (ctx.enSala()) emitirPrivado("escaneo", { para: PARA_TODOS, id: escaneo.id }).catch(() => {});
    const id = escaneo.id;
    setTimeout(() => { if (escaneo?.id === id) { escaneo.terminado = true; pintar(); } }, SEGUNDOS_ESCANEO * 1000);
}

/* Potencia del siguiente dedo sin poner de esa fuente ("instancia|elemento"), la que tenía en la mano de su dueño
   (null: un NPC, se calcula con tu daño mágico) */
function puntosQuitado(fuente) {
    const [instancia, elemento] = String(fuente).split("|");
    const a = escaneo?.resultados.get(instancia)?.elementos.find(x => x.elemento === elemento);
    const i = usados("quitado", fuente);
    const n = a?.puntos[i];
    if (!Number.isFinite(n)) return null;
    // Lo de un cristal del cinturón, como al absorber uno propio: como mucho el daño de un dedo de quien lo quita
    return a.origenes?.[i] === "cinturon" ? Math.min(n, maximoPorDedo(pj(), elemento)) : n;
}

const nombreDueno = (instancia) => escaneo?.resultados.get(instancia)?.nombre ?? "Alguien";

/* Pide a otra pestaña que quite estos elementos a su personaje (todo o nada); { ok, quitados } o ok false si no contesta */
function pedirQuitar(instancia, elementos) {
    const id = nuevoId();
    return new Promise(resolve => {
        const temporizador = setTimeout(() => { quitando.delete(id); resolve({ ok: false, sinRespuesta: true }); }, SEGUNDOS_QUITAR * 1000);
        quitando.set(id, (r) => { clearTimeout(temporizador); resolve(r); });
        emitirPrivado("quitarEnergia", { para: instancia, id, elementos }).catch(() => {
            clearTimeout(temporizador);
            quitando.delete(id);
            resolve({ ok: false, sinRespuesta: true });
        });
    });
}

/**
 * Quita a sus dueños lo robado de estos dedos (al resolver). Todo o nada: si a alguno le falta, se devuelve lo ya
 * quitado a los demás. @returns { ok: true, deshacer() } o { ok: false, nombre, sinRespuesta }
 */
async function confirmarRobos(dedosHechizo) {
    const porDueno = new Map();
    for (const d of dedosHechizo.filter(x => x.origen === "quitado")) {
        const [instancia, elemento] = String(d.fuente).split("|");
        if (!instancia || !esElementoSacro(elemento)) continue;
        porDueno.set(instancia, [...(porDueno.get(instancia) ?? []), elemento]);
    }
    const hechos = []; // { instancia, local, quitados }
    const deshacer = () => {
        for (const h of hechos) {
            if (h.local) ctx.conPersonaje(h.instancia, x => devolverElementos(x, h.quitados));
            else emitirPrivado("devolverEnergia", { para: h.instancia, quitados: h.quitados }).catch(() => {});
        }
        hechos.length = 0;
    };
    for (const [instancia, elementos] of porDueno) {
        let r;
        if (ctx.personajesPropios().includes(instancia)) {
            const quitados = ctx.conPersonaje(instancia, x => quitarElementos(x, elementos));
            r = quitados ? { ok: true, quitados, local: true } : { ok: false };
        } else r = await pedirQuitar(instancia, elementos);
        if (!r.ok) {
            deshacer();
            return { ok: false, nombre: nombreDueno(instancia), sinRespuesta: Boolean(r.sinRespuesta) };
        }
        hechos.push({ instancia, local: Boolean(r.local), quitados: r.quitados ?? [] });
    }
    return { ok: true, deshacer };
}

/* Lo robado ya no estaba: no se hace nada (se quitan esos dedos y se avisa) */
function fallarRobo(robos, puestos) {
    puestos.filter(d => d.origen === "quitado").forEach(d => dedos.delete(d.id));
    mensaje = robos.sinRespuesta ? `${robos.nombre} no contesta: no se le puede quitar nada. No se ha gastado nada.`
        : `${robos.nombre} ya no tiene lo que le querías quitar. No se ha gastado nada.`;
    ctx.aviso("Magia", [mensaje]);
    ctx.actualizarTodo();
    pintar();
}

/* Transfusión de sangre (13-sacro.md §9) _________________________________________________
 * Ventana #modalTransfusion desde el botón de la mano. Quitar PV a otro (a mí o a un tercero): tirada de dado medio +
 * Combate + el mayor entre Reflejos y Fortaleza y un golpe con transfusion = { pv, para } que quien pierde acepta
 * pulsándolo (recibirGolpe le quita lo que tenga y avisa con "transfusion" a quien recibe). Dar mis PV: los pierdo ya y
 * sale un golpe que cura (efecto) para que el otro lo acepte. Boca + una mano (las dos si es de uno a otro). */
const ventanaTransfusion = () => el("modalTransfusion");
let manoTransfusion = "manoIzquierda";
/* Lo elegido en la ventana (fichas): modalidad e instancias de quien pierde y quien recibe */
const eleccionTransfusion = { modo: "aMi", de: null, para: null };

/* Ficha de una opción; si no se puede elegir sale desactivada con el motivo al pasar el ratón (aria-disabled y no
   disabled, para que el navegador enseñe el title) */
function fichaTransfusion({ valor, texto, icono, elegida, motivo }) {
    return `<button type="button" class="ficha-sao" role="radio" data-valor="${escaparHtml(valor)}" aria-checked="${Boolean(elegida && !motivo)}"
        ${motivo ? `aria-disabled="true" title="${escaparHtml(motivo)}"` : ""}>
        <span class="ficha-icono">${iconoSao(icono)}</span><span>${escaparHtml(texto)}</span></button>`;
}

/* Mano con la que se hace la transfusión de una mano: la del botón si está vacía; con un arma a dos manos cuenta como
   libre una de las dos, la que tenga la acción disponible (manoParaUsar, como el inventario). null si no hay */
function manoParaTransfusion(p) {
    if (manoVacia(p, manoTransfusion)) return manoTransfusion;
    return MANOS.some(m => TIPOS_DOS_MANOS.includes(p[m]?.tipo)) ? manoParaUsar(p) : null;
}

/* PV que le caben a alguien (null si no se sabe: solo se conocen los personajes que se pueden leer) */
const leCaben = (o) => (o.noSeCura ? 0 : Number.isFinite(o.vida) && Number.isFinite(o.vidaMax) ? Math.max(0, Math.floor(o.vidaMax - o.vida)) : null);

/* Por qué no puede perder (rol "de") o recibir ("para") PV, o "" (las pesadillas ni salen). Su zona no se sabe: se
   supone la tuya (en zona segura o base nadie baja de 1 PV) */
function motivoObjetivo(o, rol) {
    if (rol === "de" && Number.isFinite(o.vida) && o.vida <= minimoTransfusion(pj())) return "No le quedan PV que quitar";
    if (rol === "para" && o.noSeCura) return "No puede recuperar PV";
    if (rol === "para" && leCaben(o) === 0) return "Tiene los PV al máximo";
    return "";
}

/* Todo lo que enseña la ventana: motivos de cada opción, lo elegido (corregido si ya no vale) y el máximo de PV */
function estadoTransfusion() {
    const p = pj();
    const otros = ctx.personajesSala().filter(o => !o.pesadilla); // no se hacen transfusiones con pesadillas
    const tope = maxTransfusion(p);
    const manosLibres = MANOS.filter(m => manoVacia(p, m));
    const validos = (rol, sin = null) => otros.filter(o => o.instancia !== sin && !motivoObjetivo(o, rol));
    const libre = manoParaTransfusion(p);
    const motivosModo = {
        aMi: !libre ? "Esa mano no está libre"
            : noSeCura(p) ? "No puedes recuperar PV"
            : p.vida >= p.vidaMax ? "Tienes los PV al máximo"
            : !validos("de").length ? "No hay nadie a quien quitar PV" : "",
        dar: !libre ? "Esa mano no está libre"
            : p.vida <= minimoTransfusion(p) ? "No tienes PV que dar"
            : !validos("para").length ? "No hay nadie que pueda recibirlos" : "",
        otro: manosLibres.length < 2 ? "Hacen falta las dos manos libres"
            : !validos("de").some(d => validos("para", d.instancia).length) ? "Hacen falta otros dos personajes en la sala" : ""
    };
    // Si lo elegido ya no se puede, pasa a lo primero que se pueda
    const e = eleccionTransfusion;
    if (motivosModo[e.modo]) e.modo = Object.keys(MODOS_TRANSFUSION).find(m => !motivosModo[m]) ?? e.modo;
    const usaDe = e.modo !== "dar";
    const usaPara = e.modo !== "aMi";
    const motivosDe = new Map(otros.map(o => [o.instancia, motivoObjetivo(o, "de")]));
    if (usaDe && (!e.de || motivosDe.get(e.de) !== "")) {
        e.de = validos("de").find(d => e.modo !== "otro" || validos("para", d.instancia).length)?.instancia ?? null;
    }
    const motivosPara = new Map(otros.map(o => [o.instancia,
        motivoObjetivo(o, "para") || (e.modo === "otro" && o.instancia === e.de ? "Ya es quien pierde los PV" : "")]));
    if (usaPara && (!e.para || motivosPara.get(e.para) !== "")) e.para = otros.find(o => !motivosPara.get(o.instancia))?.instancia ?? null;
    const de = usaDe ? otros.find(o => o.instancia === e.de) ?? null : null;
    const para = usaPara ? otros.find(o => o.instancia === e.para) ?? null : null;
    // Máximo (13-sacro.md §9): 3 × Sacro, lo que le falta a quien recibe y lo que tiene quien da (cuando se sabe)
    const limites = [tope];
    if (e.modo === "aMi") limites.push(Math.max(0, p.vidaMax - p.vida));
    if (e.modo === "dar") limites.push(Math.max(0, p.vida - minimoTransfusion(p)));
    if (para && leCaben(para) !== null) limites.push(leCaben(para));
    if (de && Number.isFinite(de.vida)) limites.push(Math.max(0, de.vida - minimoTransfusion(p)));
    const maximo = Math.max(0, Math.floor(Math.min(...limites)));
    const motivo = !tope ? "Sin Sacro no se puede hacer una transfusión."
        : motivosModo[e.modo] ? `${motivosModo[e.modo]}.`
        : usaDe && !de ? "Elige quién pierde los PV."
        : usaPara && !para ? "Elige quién los recibe."
        : maximo <= 0 ? "No se puede transferir ningún PV." : "";
    return { otros, tope, motivosModo, motivosDe, motivosPara, de, para, maximo, motivo, usaDe, usaPara };
}

/* alMaximo: pone los PV al máximo (al abrir y al cambiar de opción) */
function pintarTransfusion({ alMaximo = false } = {}) {
    const s = estadoTransfusion();
    const e = eleccionTransfusion;
    el("transfusionModo").innerHTML = Object.entries(MODOS_TRANSFUSION).map(([valor, m]) => fichaTransfusion({
        valor, texto: m.etiqueta, icono: m.icono, elegida: e.modo === valor, motivo: s.motivosModo[valor]
    })).join("");
    const objetivos = (motivos, elegida) => s.otros.length
        ? s.otros.map(o => fichaTransfusion({
            valor: o.instancia, texto: `${o.nombre || "Sin nombre"}${o.npc ? " (NPC)" : ""}`, icono: "personaje",
            elegida: elegida === o.instancia, motivo: motivos.get(o.instancia)
        })).join("")
        : `<span class="lista-vacia">No hay nadie más en la sala</span>`;
    el("transfusionDe").innerHTML = objetivos(s.motivosDe, e.de);
    el("transfusionPara").innerHTML = objetivos(s.motivosPara, e.para);
    el("ranuraTransfusionDe").hidden = !s.usaDe;
    el("ranuraTransfusionPara").hidden = !s.usaPara;
    // PV de 1 en 1, entre 1 y el máximo
    const cantidad = el("transfusionCantidad");
    cantidad.max = String(Math.max(1, s.maximo));
    cantidad.disabled = s.maximo <= 0;
    cantidad.value = String(s.maximo <= 0 ? 0 : alMaximo ? s.maximo : Math.max(1, Math.min(s.maximo, entero(cantidad.value))));
    actualizarPaso(cantidad); // − / + desactivados en los límites
    const manos = MODOS_TRANSFUSION[e.modo].manos;
    el("textoTransfusion").textContent = `Hasta ${s.maximo} PV (3 × Sacro = ${s.tope}). Gasta la boca y ${manos === 2 ? "las dos manos" : "una mano"}.`
        + (e.modo === "dar" ? " Sin tirada: pierdes los PV ahora." : " Tirada contra la Defensa de quien pierde los PV.");
    el("avisoTransfusion").textContent = s.motivo;
    const boton = el("btnAceptarTransfusion");
    boton.disabled = Boolean(s.motivo);
    boton.title = s.motivo || "Hacer la transfusión";
    return s;
}

/** Abre la ventana de transfusión desde el botón de una mano */
export function abrirTransfusion(mano) {
    if (!puedeUsarMagia(pj())) return ctx.aviso("Transfusión", ["Solo los personajes del Underworld pueden usar la magia."]);
    if (!ctx.enSala() && !ctx.esMaster) return ctx.aviso("Transfusión", ["Solo en una sala: hace falta alguien a quien quitar o dar PV."]);
    manoTransfusion = mano;
    pintarTransfusion({ alMaximo: true });
    bootstrap.Modal.getOrCreateInstance(ventanaTransfusion()).show();
}

function ejecutarTransfusion() {
    const p = pj();
    const s = pintarTransfusion();
    if (s.motivo) return;
    const modo = eleccionTransfusion.modo;
    const n = Math.min(entero(el("transfusionCantidad").value), s.maximo);
    if (n <= 0) return;
    const { de, para } = s;
    // Una mano: la del botón o, con un arma a dos manos, la de las dos que tenga la acción (manoParaTransfusion)
    const partes = MODOS_TRANSFUSION[modo].manos === 2 ? ["cabeza", "izquierda", "derecha"]
        : ["cabeza", manoParaTransfusion(p) === "manoIzquierda" ? "izquierda" : "derecha"];
    const { resultado: gastado, fallo } = ctx.conEmbriaguez("arte", () => ctx.gastar(partes, "Transfusión"));
    bootstrap.Modal.getInstance(ventanaTransfusion())?.hide();
    if (fallo || !gastado) return ctx.actualizarTodo();
    ctx.reproducir("click");
    const nombre = p.nombre || "Sin nombre";
    if (modo === "dar") {
        const dado = Math.min(n, Math.max(0, p.vida - minimoTransfusion(p)));
        p.vida -= dado;
        mostrarPopupDanno({
            titulo: `${nombre}: transfusión`, subtitulo: `Da ${dado} PV a ${para.nombre || "alguien"}`,
            descripcion: `${para.nombre || "Quien la recibe"} la acepta pulsando el bloque.`,
            soloPara: [para.instancia], // solo le sale a quien la recibe, y solo él la puede aceptar (objetivo)
            golpes: [{ etiqueta: `Transfusión para ${para.nombre || "alguien"}`, total: 0, magia: true, efecto: { nombre: "Transfusión", pv: dado }, notas: [],
                objetivo: para.instancia, nombreObjetivo: para.nombre || "Sin nombre", esTransfusion: true,
                // Solo se ve (recibirGolpe no aplica este tipo): la cura va en el efecto
                elemental: [{ tipo: "transfusion", cantidad: dado, etiqueta: "PV · cura", color: "#E05583", colorTexto: "#FBFBFB" }] }]
        });
        ctx.actualizarTodo();
        return;
    }
    const recibe = modo === "aMi" ? { instancia: ctx.instancia(), nombre } : para;
    const golpe = {
        etiqueta: `Transfusión: ${de.nombre || "alguien"} pierde hasta ${n} PV`, total: 0, magia: true,
        // Solo se ve (recibirGolpe no aplica este tipo): lo que se quita va en transfusion
        elemental: [{ tipo: "transfusion", cantidad: n, etiqueta: "PV · transfusión", color: "#B0172B", colorTexto: "#FBFBFB" }],
        transfusion: { pv: n, para: recibe.instancia, nombre: recibe.nombre || "alguien" },
        objetivo: de.instancia, nombreObjetivo: de.nombre || "Sin nombre", // solo lo acepta quien pierde los PV
        esTransfusion: true, // se puede recibir en zona segura (sin bajar de 1 PV)
        notas: [`Los recibe ${recibe.nombre || "alguien"} (lo que quepa). Quien los pierde lo acepta pulsando el bloque.`]
    };
    const caracteristica = caracteristicaArma(p, "otros"); // la más alta entre Reflejos y Fortaleza
    ctx.tirar({
        nombreAccion: "Transfusión",
        subtitulo: `Quitar ${n} PV a ${de.nombre || "alguien"}`,
        valorHabilidad: Math.max(0, Number(p.getGenerico("combate")) || 0),
        etiquetaHabilidad: "Combate",
        valorCaracteristica: caracteristica.valor,
        etiquetaCaracteristica: caracteristica.etiqueta,
        modoTirada: 1,
        etiquetaTotal: "ATAQUE",
        // Solo les sale a los implicados: quien pierde y, de uno a otro, quien recibe
        soloPara: modo === "otro" ? [de.instancia, para.instancia] : [de.instancia],
        calcularDanno: () => golpe
    });
    ctx.actualizarTodo();
}

/** Llega lo que ha perdido alguien por una transfusión que me (o a uno de mis personajes) da sus PV */
export function recibirTransfusion(instancia, pv, de) {
    const cantidad = entero(pv);
    if (!cantidad) return;
    const curado = ctx.conPersonaje(instancia, x => {
        if (noSeCura(x)) return 0;
        const antes = x.vida;
        x.vida = Math.min(x.vidaMax, x.vida + cantidad);
        return x.vida - antes;
    }) ?? 0;
    ctx.reproducir("notificacion");
    ctx.aviso("Transfusión", [curado > 0 ? `Recibes ${curado} PV de ${de}.` : `${de} pierde ${cantidad} PV, pero no puedes recuperarlos (PV al máximo o Anticuración).`]);
    ctx.actualizarTodo();
}

/* Resultado del máster ___________________________________________________________ */
const DIRECCIONES = ["arriba", "abajo", "a la izquierda", "a la derecha", "arriba a la izquierda", "arriba a la derecha", "abajo a la izquierda", "abajo a la derecha"];
const CARACTERISTICAS = { fortaleza: "Fortaleza", reflejos: "Reflejos", voluntad: "Voluntad", inteligencia: "Inteligencia" };
const HABILIDADES = { atletismo: "Atletismo", combate: "Combate", percepcion: "Percepción", subterfugio: "Sigilo", comunicacion: "Carisma", cultura: "Cultura" };
const entero = (v, max = 999) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
const MAX_GOLPES = 20;

/* Lo que manda el máster (viene de otra pestaña: se valida). Formato:
   { id, rechazado, golpes: [{ danno: [{ elemento, cantidad }], estados }], radio, tirada, estados, nota, objetos } */
function cargarResultado(datos) {
    if (!datos?.id) return null;
    const tirada = datos.tirada && CARACTERISTICAS[datos.tirada.caracteristica] && HABILIDADES[datos.tirada.habilidad]
        ? { caracteristica: datos.tirada.caracteristica, habilidad: datos.tirada.habilidad, dado: entero(datos.tirada.dado, 2) } : null;
    const golpes = (Array.isArray(datos.golpes) ? datos.golpes : []).slice(0, MAX_GOLPES).map(g => ({
        danno: (Array.isArray(g?.danno) ? g.danno : []).filter(f => esDannoMagia(f?.elemento))
            .map(f => ({ elemento: f.elemento, cantidad: entero(f.cantidad) })).filter(f => f.cantidad > 0).slice(0, MAX_GOLPES),
        estados: g?.estados === true
    }));
    // Estados como los de una poción (provoca o cura); la magia no deja nada permanente: sin turnos pasa a 3
    const estados = cargarEstadosObjeto({ estados: datos.estados }, "pocion")
        .map(e => (e.quitar || e.turnos > 0 ? e : { ...e, turnos: 3 }));
    return {
        id: String(datos.id),
        rechazado: datos.rechazado === true,
        golpes: golpes.filter(g => g.danno.length || (g.estados && estados.length)),
        radio: Math.max(1, Math.min(5, entero(datos.radio) || 1)),
        tirada,
        estados,
        nota: String(datos.nota ?? "").slice(0, 300),
        objetos: (Array.isArray(datos.objetos) ? datos.objetos : []).map(cargarObjeto).filter(Boolean).slice(0, 10)
    };
}

/**
 * Aplica la resolución del máster (o la de por defecto, sin máster) al personaje de esa instancia (null = el de la
 * ficha). Primero quita lo robado a sus dueños (si a alguno le falta, se cancela todo sin gastar nada); después gasta
 * las acciones de los dedos (las 4 solo sin acciones gastadas) y los PV de generar, vacía los cristales usados y el
 * ambiente, y según el tipo: daño (un golpe por cada uno del máster, cada uno con su tirada si la pide), objetos al
 * botín o escenario (la nota, con tirada si la pide).
 */
export async function aplicarResultadoHechizo(instancia, datosBrutos) {
    const datos = cargarResultado(datosBrutos);
    const p = ctx.leerPersonaje(instancia);
    if (!datos || !p?.hechizo || p.hechizo.id !== datos.id) return;
    const hechizo = p.hechizo;
    const nombre = p.nombre || "Sin nombre";
    const tipo = TIPOS_HECHIZO[hechizo.tipo] ? hechizo.tipo : "danno";
    ctx.reproducir("notificacion");
    // Lo ha resuelto (o rechazado) el máster: la ventana de Sacro del jugador se cierra
    if (ventana()?.classList.contains("show")) bootstrap.Modal.getInstance(ventana())?.hide();
    if (datos.rechazado) {
        ctx.conPersonaje(instancia, x => { x.hechizo = null; });
        ctx.aviso("Magia cancelada", [`El máster ha cancelado lo que querías hacer${hechizo.forma ? `: «${hechizo.forma}»` : ""}. No se ha gastado nada.`, ...(datos.nota ? [datos.nota] : [])]);
        return pintar();
    }
    // Lo robado se quita ahora; si alguien ya no lo tiene, no pasa nada (ni se gasta nada)
    const robos = await confirmarRobos(hechizo.dedos);
    if (!robos.ok) {
        ctx.conPersonaje(instancia, x => { x.hechizo = null; });
        const linea = robos.sinRespuesta ? `${robos.nombre} no contesta: no se le puede quitar la energía.` : `${robos.nombre} ya no tiene la energía que le querías quitar.`;
        ctx.aviso("La magia falla", [linea, "No se ha gastado nada."]);
        emitirEvento("objeto", { titulo: `${nombre}: magia`, subtitulo: "La magia falla", lineas: [linea] });
        ctx.actualizarTodo();
        return pintar();
    }
    // Acciones: en el personaje de la ficha, con la confirmación de siempre si no le quedan
    const partes = partesHechizo(hechizo.dedos);
    if (!instancia) ctx.gastar(partes.length > 3 ? "todas" : partes, "Lanzar la magia");
    else ctx.conPersonaje(instancia, x => gastarHechizo(x, partes));
    const lineas = [];
    ctx.conPersonaje(instancia, x => {
        const coste = costeGenerar(x, hechizo.dedos);
        if (coste > 0) { lineas.push(`Generar: −${coste} PV (${x.vida} → ${x.vida - coste})`); x.vida -= coste; }
        for (const dedo of hechizo.dedos.filter(d => d.origen === "cinturon")) {
            const [ranura, indice] = String(dedo.fuente).split(":");
            const cristal = objetoCinturon(x, ranura, Number(indice));
            if (cristal) cristal.elemento = null;
        }
        x.ambienteSacro = [];
        x.hechizo = null;
        if (datos.objetos.length) x.botin.push(...datos.objetos);
    });

    const subtitulo = hechizo.forma.slice(0, 120) || TIPOS_HECHIZO[tipo].etiqueta;
    const notasComunes = [];
    if (datos.radio > 1) notasComunes.push(`En área de ${datos.radio}×${datos.radio}.`);
    if (datos.nota) notasComunes.push(datos.nota);
    const tirar = (golpe) => tirarMagia(instancia, datos.tirada, subtitulo, golpe);

    if (tipo === "danno" && datos.golpes.length) {
        // Un golpe: se lanza ya. Varios: la ventana para lanzarlos uno a uno (así da tiempo a leer cada uno)
        const magia = {
            id: datos.id, forma: hechizo.forma, radio: datos.radio, tirada: datos.tirada, nota: datos.nota, estados: datos.estados,
            golpes: datos.golpes.map(g => ({ ...g, lanzado: false }))
        };
        if (magia.golpes.length === 1) lanzarGolpe(instancia, magia, 0);
        else {
            ctx.conPersonaje(instancia, x => { x.magiaPendiente = magia; });
            abrirGolpes(instancia);
        }
    } else if (datos.tirada) {
        tirar(null);
        if (notasComunes.length || hechizo.forma) emitirEvento("objeto", { titulo: `${nombre}: magia`, subtitulo: TIPOS_HECHIZO[tipo].etiqueta, lineas: [hechizo.forma, ...notasComunes].filter(Boolean) });
    } else {
        const objetos = datos.objetos.map(o => `Crea: ${o.nombre}${o.cantidad > 1 ? ` ×${o.cantidad}` : ""}`);
        emitirEvento("objeto", { titulo: `${nombre}: magia`, subtitulo: TIPOS_HECHIZO[tipo].etiqueta, lineas: [hechizo.forma, ...objetos, ...notasComunes].filter(Boolean) });
    }
    if (lineas.length) ctx.aviso("Magia", lineas);
    if (datos.objetos.length) ctx.abrirBotin(instancia ?? ctx.instancia());
    ctx.actualizarTodo();
    pintar();
}

/* Tirada de la magia (la que pide el máster) con el golpe que hace si da (null: sin daño, p. ej. un escenario) */
function tirarMagia(instancia, tirada, subtitulo, golpe) {
    const x = ctx.leerPersonaje(instancia);
    ctx.tirar({
        nombreAccion: "Magia",
        subtitulo,
        valorHabilidad: Math.max(0, Number(x.getGenerico(tirada.habilidad)) || 0),
        etiquetaHabilidad: HABILIDADES[tirada.habilidad],
        valorCaracteristica: Number(x[tirada.caracteristica]) || 0,
        etiquetaCaracteristica: CARACTERISTICAS[tirada.caracteristica],
        modoTirada: tirada.dado,
        etiquetaTotal: "ATAQUE",
        ...(golpe ? { calcularDanno: () => golpe } : {})
    });
}

/* Golpe para el pop-up a partir de uno del máster (magia = pj.magiaPendiente o lo resuelto): el daño físico normal va
   en total (lo reduce la armadura), cada elemento es una ficha de su color (la Kristala atraviesa la armadura:
   entradaDannoSacro) y, si el golpe los lleva, los estados como los de una poción */
function construirGolpe(magia, i) {
    const g = magia.golpes[i];
    const n = magia.golpes.length;
    const estados = cargarEstadosObjeto({ estados: magia.estados }, "pocion").map(e => (e.quitar || e.turnos > 0 ? e : { ...e, turnos: 3 }));
    const notas = [];
    if (magia.tirada) notas.push(`Si no llega a la Defensa del objetivo, se desvía (Defensa − total) casillas ${DIRECCIONES[Math.floor(Math.random() * DIRECCIONES.length)]}.`);
    if (magia.radio > 1) notas.push(`En área de ${magia.radio}×${magia.radio}.`);
    if (magia.nota) notas.push(magia.nota);
    return {
        etiqueta: n > 1 ? `Magia ${i + 1} de ${n}` : "Magia", magia: true,
        total: g.danno.filter(f => f.elemento === DANNO_FISICO).reduce((suma, f) => suma + f.cantidad, 0),
        elemental: g.danno.filter(f => f.elemento !== DANNO_FISICO).map(f => entradaDannoSacro(f.elemento, f.cantidad)),
        ...(g.estados && estados.length ? { efecto: { nombre: "Magia", estadosObjeto: estados } } : {}),
        notas
    };
}

/* Lanza un golpe: con la tirada que pide el máster o, sin tirada, el pop-up de daño */
function lanzarGolpe(instancia, magia, i) {
    const nombre = ctx.leerPersonaje(instancia)?.nombre || "Sin nombre";
    const n = magia.golpes.length;
    const subtitulo = `${magia.forma.slice(0, 120) || "Daño"}${n > 1 ? ` (${i + 1} de ${n})` : ""}`;
    const golpe = construirGolpe(magia, i);
    const tirada = magia.tirada && CARACTERISTICAS[magia.tirada.caracteristica] && HABILIDADES[magia.tirada.habilidad] ? magia.tirada : null;
    if (tirada) tirarMagia(instancia, tirada, subtitulo, golpe);
    else mostrarPopupDanno({ titulo: `${nombre}: magia`, subtitulo, golpes: [golpe] });
}

/* Lanzar la magia golpe a golpe (#modalGolpesMagia) _______________________________________
 * Con varios golpes, el jugador los lanza uno a uno (cada uno con su tirada) para que los demás puedan leer cada
 * pop-up y haya emoción en cada tirada. Lo que queda se guarda en pj.magiaPendiente: si se cierra la ventana, se
 * sigue desde la habilidad Sacro. */
const ventanaGolpes = () => el("modalGolpesMagia");
let instanciaGolpes = null; // de quién es la magia que se está lanzando (null = el de la ficha)

const htmlFichasGolpe = (g) => g.danno.map(f => {
    const ficha = fichaDannoMagia(f.elemento, f.cantidad);
    return `<span class="popup-elemento" style="--color:${ficha.color};--color-texto:${ficha.colorTexto}" title="${escaparHtml(ficha.etiqueta)}">${f.cantidad} ${escaparHtml(f.elemento === DANNO_FISICO ? "Físico" : ELEMENTOS_SACRO[f.elemento].etiqueta)}</span>`;
}).join("");

function pintarGolpes() {
    const magia = ctx.leerPersonaje(instanciaGolpes)?.magiaPendiente;
    if (!magia) return;
    const lanzados = magia.golpes.filter(g => g.lanzado).length;
    const siguiente = magia.golpes.findIndex(g => !g.lanzado);
    el("contadorGolpesMagia").textContent = `(${lanzados} / ${magia.golpes.length})`;
    el("textoGolpesMagia").textContent = `${magia.forma ? `«${magia.forma}». ` : ""}${magia.tirada ? "Cada golpe tiene su tirada." : "Sin tirada."} Lánzalos uno a uno; si cierras la ventana, sigues después desde la habilidad Sacro.`;
    el("listaGolpesMagia").innerHTML = magia.golpes.map((g, i) => `
        <div class="fila-objeto fila-golpe${g.lanzado ? " lanzado" : ""}${i === siguiente ? " siguiente" : ""}" data-index="${i}">
            <span class="num-golpe">${i + 1}</span>
            <span class="fichas-golpe">${htmlFichasGolpe(g) || "Sin daño"}${g.estados && magia.estados.length ? ` <span class="marca-estados" title="Lleva los estados">${iconoSao("veneno")}</span>` : ""}</span>
            ${g.lanzado ? `<span class="estado-golpe">Lanzado</span>`
                : `<button type="button" class="btn-eleccion" data-accion="lanzar" title="${magia.tirada ? "Tirar los dados de este golpe" : "Lanzar este golpe"}">${magia.tirada ? "Tirar" : "Lanzar"}</button>`}
        </div>`).join("");
}

/** Abre la ventana para lanzar los golpes que quedan (de la magia de esa instancia; null = el de la ficha) */
export function abrirGolpes(instancia = null) {
    instanciaGolpes = instancia;
    if (!ctx.leerPersonaje(instancia)?.magiaPendiente) return;
    mostrarCuandoSePueda(() => {
        pintarGolpes();
        bootstrap.Modal.getOrCreateInstance(ventanaGolpes()).show();
    });
}

function alPulsarGolpes(e) {
    const boton = e.target.closest('[data-accion="lanzar"]');
    const i = Number(boton?.closest("[data-index]")?.dataset.index);
    if (!boton || !Number.isInteger(i)) return;
    const magia = ctx.leerPersonaje(instanciaGolpes)?.magiaPendiente;
    if (!magia?.golpes[i] || magia.golpes[i].lanzado) return;
    ctx.reproducir("click");
    lanzarGolpe(instanciaGolpes, magia, i);
    let terminada = false;
    ctx.conPersonaje(instanciaGolpes, x => {
        if (!x.magiaPendiente?.golpes[i]) return;
        x.magiaPendiente.golpes[i].lanzado = true;
        if (x.magiaPendiente.golpes.every(g => g.lanzado)) { x.magiaPendiente = null; terminada = true; }
    });
    if (terminada) bootstrap.Modal.getInstance(ventanaGolpes())?.hide();
    else pintarGolpes();
}

/** El máster dice qué hay en el ambiente para el personaje de esa instancia (null = el de la ficha) */
export function aplicarAmbienteSacro(instancia, elementos) {
    const lista = cargarAmbiente(elementos);
    ctx.conPersonaje(instancia, x => { x.ambienteSacro = lista; });
    esperandoAmbiente = false;
    ctx.reproducir("notificacion");
    ctx.aviso("Ambiente", [lista.length
        ? `El máster dice que puedes absorber: ${lista.map(a => `${ELEMENTOS_SACRO[a.elemento].etiqueta} ×${a.dedos}`).join(", ")}.`
        : "El máster dice que no hay nada que absorber aquí."]);
    ctx.actualizarTodo();
    pintar();
    // En modo máster la ventana se cerró al preguntar: vuelve a abrirse con el ambiente ya puesto
    if (ctx.esMaster) mostrarCuandoSePueda(abrirSacro);
}

/* Espera a que no haya otra ventana abierta para hacer algo */
function mostrarCuandoSePueda(hacer) {
    const otra = document.querySelector(".modal.show");
    if (otra) {
        otra.addEventListener("hidden.bs.modal", () => setTimeout(() => mostrarCuandoSePueda(hacer), 60), { once: true });
        return;
    }
    hacer();
}

/** Abre la ventana (desde la habilidad Sacro) */
export function abrirSacro() {
    const p = pj();
    if (!puedeUsarMagia(p)) {
        ctx.aviso("Sacro", ["Solo los personajes del Underworld (casilla Underworld del perfil) pueden usar la magia."]);
        return;
    }
    // Quedan golpes por lanzar de la última magia: primero eso
    if (p.magiaPendiente) return abrirGolpes(null);
    elegida = null;
    mensaje = "";
    pintar();
    bootstrap.Modal.getOrCreateInstance(ventana()).show();
}

/** Repinta la ventana si está abierta (desde actualizarTodo) */
export function actualizarSacro() {
    if (ventana()?.classList.contains("show")) pintar();
}

/**
 * ctx: { personaje(), actualizarTodo(), aviso(titulo, lineas), gastar(partes, descripcion) (gastarAccionesOConfirmar),
 *        conEmbriaguez(categoria, fn), reproducir(nombre), enSala(), esMaster, instancia(), leerPersonaje(instancia),
 *        conPersonaje(instancia, fn), tirar(opciones de ejecutarTirada), abrirBotin(instancia),
 *        encolarLocal / cancelarLocal / pedirAmbienteLocal (modo máster, interfazSacroMaster.js),
 *        masterConectado() (en una sala con algún personaje del máster conectado),
 *        personajesPropios() (instancias de los personajes de esta pestaña), personajesSala() (los demás de la sala) }
 */
export function inicializarSacro(contexto) {
    ctx = contexto;
    const modal = ventana();
    if (!modal) return;
    modal.addEventListener("click", alPulsar);
    modal.addEventListener("pointerdown", alApretar);
    el("listaGolpesMagia")?.addEventListener("click", alPulsarGolpes);
    // Cerrar la ventana es como "Quitar todo": al volver a abrirla no hay nada en los dedos
    modal.addEventListener("hidden.bs.modal", () => {
        if (conservarAlCerrar) { conservarAlCerrar = false; return; }
        dedos.clear();
        elegida = null;
        mensaje = "";
    });
    modal.addEventListener("input", (e) => { if (e.target.id === "formaSacro") forma = e.target.value; });
    modal.addEventListener("keydown", (e) => {
        const dedo = e.target.closest?.(".dedo-sacro");
        if (dedo && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); alPulsar({ target: dedo }); }
    });
    // Respuestas del máster de la sala (en modo máster sus propios personajes se resuelven en local)
    registrarManejador("hechizoResultado", (evento) => {
        if (ctx.esMaster || !esDelMasterDeSala(evento)) return;
        aplicarResultadoHechizo(null, evento.datos);
    });
    registrarManejador("ambiente", (evento) => {
        if (ctx.esMaster || !esDelMasterDeSala(evento)) return;
        aplicarAmbienteSacro(null, evento.datos?.elementos);
    });
    // Escanear: contesta solo quien lleva algo
    registrarManejador("escaneo", (evento) => {
        const quien = energiaPropia();
        if (!quien.length || !evento.instancia) return;
        emitirPrivado("escaneoRespuesta", { para: evento.instancia, id: String(evento.datos?.id ?? ""), quien }).catch(() => {});
    });
    registrarManejador("escaneoRespuesta", (evento) => {
        if (!escaneo || evento.datos?.id !== escaneo.id) return;
        anadirResultados(evento.datos.quien);
        pintar();
    });
    // Te quitan elementos (a ti o a uno de tus personajes, datos.para) al resolver una magia: sin tirada, todo o nada
    registrarManejador("quitarEnergia", (evento) => {
        const d = evento.datos ?? {};
        const elementos = (Array.isArray(d.elementos) ? d.elementos : [d.elemento]).filter(esElementoSacro).slice(0, 20);
        if (!elementos.length || !evento.instancia) return;
        const quitados = ctx.conPersonaje(d.para, x => quitarElementos(x, elementos));
        emitirPrivado("energiaQuitada", { para: evento.instancia, id: String(d.id ?? ""), ok: Boolean(quitados), quitados: quitados ?? [] }).catch(() => {});
        if (quitados) {
            ctx.reproducir("notificacion");
            ctx.aviso("Te quitan energía", [`${evento.personaje || "Alguien"} te ha quitado ${describirEnergia({ dedos: quitados })}.`]);
            ctx.actualizarTodo();
        }
    });
    registrarManejador("energiaQuitada", (evento) => {
        const d = evento.datos ?? {};
        const resolver = quitando.get(String(d.id));
        if (!resolver) return;
        quitando.delete(String(d.id));
        const quitados = (Array.isArray(d.quitados) ? d.quitados : []).filter(q => esElementoSacro(q?.elemento))
            .map(cargarQuitado);
        resolver({ ok: d.ok === true, quitados });
    });
    // Otro dueño no tenía lo suyo: te devuelven lo que te habían quitado para esa magia
    registrarManejador("devolverEnergia", (evento) => {
        const d = evento.datos ?? {};
        const quitados = (Array.isArray(d.quitados) ? d.quitados : []).slice(0, 20).filter(q => esElementoSacro(q?.elemento))
            .map(cargarQuitado);
        if (!quitados.length) return;
        ctx.conPersonaje(d.para, x => devolverElementos(x, quitados));
        ctx.aviso("Energía devuelta", [`La magia de ${evento.personaje || "alguien"} ha fallado: recuperas ${describirEnergia({ dedos: quitados })}.`]);
        ctx.actualizarTodo();
    });
    registrarManejador("transfusion", (evento) => recibirTransfusion(evento.datos?.para, evento.datos?.pv, String(evento.personaje || evento.datos?.de || "alguien")));
    // Ventana de transfusión
    // Fichas de la transfusión: modalidad, quien pierde y quien recibe (las desactivadas no responden)
    [["transfusionModo", "modo"], ["transfusionDe", "de"], ["transfusionPara", "para"]].forEach(([id, campo]) => el(id)?.addEventListener("click", (e) => {
        const ficha = e.target.closest(".ficha-sao");
        if (!ficha || ficha.getAttribute("aria-disabled") === "true") return;
        eleccionTransfusion[campo] = ficha.dataset.valor;
        pintarTransfusion({ alMaximo: true });
    }));
    el("transfusionCantidad")?.addEventListener("change", pintarTransfusion);
    if (el("formTransfusion")) prepararFormularioSao(el("formTransfusion")); // iconos de las ranuras y − / + de los PV
    el("btnAceptarTransfusion")?.addEventListener("click", ejecutarTransfusion);
}
