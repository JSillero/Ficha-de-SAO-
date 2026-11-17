// scripts/interfazSacro.js
// Ventana de magia (#modalSacro, 13-sacro.md §6 y §13): se abre al pulsar la habilidad Sacro. Las dos manos (silueta de
// imgs/mano.svg.svg, siluetasSacro.js) y la fila de los pies; cada punta de dedo es una diana a la que se arrastra un
// elemento (o se toca la ficha y después el dedo). Fuentes: Generar (PV), Cinturón (cristales elementales llenos),
// Ambiente (lo que conceda el máster) y Quitado (tras escanear). Resumen en vivo con el coste, las acciones y el daño.
// Sin el máster: Guardar en una mano y Llenar un cristal del cinturón. Con el máster: Enviar (con lo que quiere hacer escrito),
// que deja la petición esperando en pj.hechizo y emite "hechizo" (para: PARA_TODOS; lo atiende el máster de la sala, ver
// interfazSacroMaster.js). Su respuesta "hechizoResultado" (a esta pestaña) se aplica con aplicarResultadoHechizo: gasta
// las acciones y los PV, los cristales y el ambiente usados, tira si el máster lo pide y saca el pop-up con el daño.
// "Pedir" (ambiente) emite "peticionAmbiente" y la respuesta "ambiente" llena pj.ambienteSacro.
// Reglas en sacro.js; este módulo solo es DOM. inicializarSacro(ctx) desde interfaz.js.

import {
    ELEMENTOS_SACRO, CLAVES_ELEMENTOS_SACRO, parteDeDedo, dedosSacro, motivoDedoNoUsable, motivoNoDedos, costeGenerar,
    motivoNoGenerar, dannoElementos, partesHechizo, entradaDannoSacro, maximoPorDedo, guardarEnMano, motivoNoLlenar,
    llenarCristal, describirEnergia, puedeUsarMagia, cargarDedos, cargarAmbiente, gastarHechizo, esElementoSacro,
    energiaDe, quitarElemento, maxTransfusion, MODOS_TRANSFUSION
} from "./sacro.js";
import { ESTADOS_INFO, noSeCura } from "./estados.js";
import { manoVacia } from "./turno.js";
import { caracteristicaArma } from "./ataque.js";
import { cargarObjeto } from "./objetos.js";
import { emitirPrivado, emitirEvento, registrarManejador, PARA_TODOS } from "./eventos.js";
import { mostrarPopupDanno } from "./dados.js";
import { esDelMasterDeSala } from "./interfazOnline.js";
import { MANO_D, MANO_ANCHO, MANO_ALTO, PUNTAS_MANO } from "./siluetasSacro.js";
import { cinturonesPuestos, objetoCinturon } from "./cinturon.js";
import { iconoSao } from "./iconos.js";
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
/* Quitar un elemento a otra pestaña: id de la petición → { dedo, fuente } (se pone en el dedo cuando contesta) */
const quitando = new Map();
const nuevoId = () => globalThis.crypto?.randomUUID?.() ?? `x-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
let mensaje = "";
let forma = "";

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
    const quitado = [...(escaneo?.resultados.values() ?? [])].flatMap(r => r.elementos.map(a => ({
        origen: "quitado", fuente: `${r.instancia}|${a.elemento}`, elemento: a.elemento, quedan: a.dedos,
        texto: `${r.nombre}${r.npc ? " (NPC)" : ""} ×${a.dedos}`
    })));
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
    const ocupadaPor = p[mano]?.tipo ? (p[mano].nombre?.trim() || "ocupada") : motivo ? "con energía" : "";
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
        cuerpo.innerHTML = `<div class="esperando-sacro">
            <p><b>Esperando al máster…</b></p>
            <p>${escaparHtml(describirEnergia({ dedos: p.hechizo.dedos }))} · Qué quiero hacer: «${escaparHtml(p.hechizo.forma)}»</p>
            <p>Mientras tanto no puedes seguir con tu turno. Las acciones y los PV se gastan cuando lo resuelva.</p>
            <button type="button" class="btn-pastilla-sao" data-accion="cancelarPeticion">Cancelar la petición</button>
        </div>`;
        el("btnEnviarSacro").disabled = true;
        return;
    }

    const f = fuentes();
    const partes = puestos.length ? partesHechizo(puestos) : [];
    const coste = costeGenerar(p, puestos);
    const sinPV = Boolean(motivoNoGenerar(p, puestos));
    const danno = dannoElementos(p, puestos).filter(e => e.cantidad > 0);
    const motivo = puestos.length ? motivoNoDedos(p, puestos) || motivoNoGenerar(p, puestos) : "";
    const manosCon = MANOS.filter(m => puestos.some(d => parteDeDedo(d.id) === m));
    // Llenar: todos los dedos con el mismo elemento y ninguno sacado de un cristal; un botón por cristal con hueco
    const unElemento = puestos.length && new Set(puestos.map(d => d.elemento)).size === 1 && puestos.every(d => d.origen !== "cinturon");
    const llenables = unElemento ? cristalesCinturon(p).filter(({ objeto }) => !motivoNoLlenar(objeto, puestos[0].elemento)) : [];
    const puedePedir = !esperandoAmbiente && (ctx.esMaster || ctx.enSala());
    const puedeEscanear = !(escaneo && !escaneo.terminado) && (ctx.esMaster || ctx.enSala());
    const fichasDanno = danno.map(e => {
        const ficha = entradaDannoSacro(e.elemento, e.cantidad);
        return `<span class="popup-elemento" style="--color:${ficha.color};--color-texto:${ficha.colorTexto}">+${ficha.cantidad} ${escaparHtml(ficha.etiqueta)}</span>`;
    }).join("");

    cuerpo.innerHTML = `
        <div class="sacro-fuentes">
            <div class="sacro-fuente"><h3>${iconoSao("magia")}Generar <small>(con tus PV)</small></h3><div class="sacro-fichas">${f.generar.map(htmlFicha).join("")}</div></div>
            <div class="sacro-fuente"><h3>${iconoSao("cinturon")}Cinturón</h3>${f.cinturon.length ? `<div class="sacro-fichas">${f.cinturon.map(htmlFicha).join("")}</div>` : `<p class="lista-vacia">Sin cristales elementales con elemento.</p>`}</div>
            <div class="sacro-fuente"><h3>${iconoSao("mapa")}Ambiente <button type="button" class="btn-pastilla-sao" data-accion="pedirAmbiente" ${puedePedir ? "" : "disabled"} title="${escaparHtml(puedePedir ? "Pregúntale al máster qué hay en el ambiente (no gasta acción)" : esperandoAmbiente ? "Esperando la respuesta del máster" : "Solo en una sala con máster")}">${esperandoAmbiente ? "Esperando…" : "Pedir"}</button></h3>${f.ambiente.length ? `<div class="sacro-fichas">${f.ambiente.map(htmlFicha).join("")}</div>` : `<p class="lista-vacia">${esperandoAmbiente ? "Esperando al máster…" : "El máster aún no te ha dicho qué hay."}</p>`}</div>
            <div class="sacro-fuente"><h3>${iconoSao("personaje")}Quitado <button type="button" class="btn-pastilla-sao" data-accion="escanear" ${puedeEscanear ? "" : "disabled"} title="${escaparHtml(puedeEscanear ? "Ver quién de la sala tiene energía en las manos (y los NPC cargados)" : escaneo && !escaneo.terminado ? "Escaneando…" : "Solo en una sala")}">${escaneo && !escaneo.terminado ? "Escaneando…" : "Escanear"}</button></h3>${f.quitado.length ? `<div class="sacro-fichas">${f.quitado.map(htmlFicha).join("")}</div><p class="lista-vacia">Ponlo en un dedo para quitárselo (sin tirada).</p>` : `<p class="lista-vacia">${escaneo?.terminado ? "Nadie tiene energía en las manos." : escaneo ? "Escaneando…" : "Escanea para ver quién tiene energía."}</p>`}</div>
        </div>
        <div class="sacro-manos">
            <div class="sacro-manos-fila">${MANOS.map(htmlMano).join("")}</div>
            <div class="pies-sacro">${htmlPies()}<div>Pies: solo con ropa o armadura real</div></div>
        </div>
        <div class="sacro-resumen">
            <div class="dato-sacro"><b>Coste en PV</b><span class="valor${sinPV ? " negativo" : ""}">${coste}</span> de ${p.vida} PV</div>
            <div class="dato-sacro"><b>Acciones</b><span class="valor">${partes.length || "—"}</span> ${escaparHtml(partes.map(x => NOMBRES_PARTES[x]).join(", "))}${partes.length > 3 ? " (solo sin acciones gastadas)" : ""}</div>
            <div class="dato-sacro"><b>Daño sugerido</b><div class="danno-sacro">${fichasDanno || "—"}</div></div>
        </div>
        <p class="aviso-zona aviso-sacro">${escaparHtml(mensaje || motivo || "")}</p>
        <div class="ranura ranura-alta sacro-forma">
            <span class="ranura-icono">${iconoSao("diario")}</span>
            <label class="ranura-etiqueta" for="formaSacro">Qué quiero hacer</label>
            <textarea id="formaSacro" rows="2" maxlength="500"></textarea>
        </div>
        <div class="sacro-botones">
            ${MANOS.map(m => `<button type="button" class="btn-pastilla-sao" data-accion="guardar" data-mano="${m}" ${manosCon.includes(m) && !motivo ? "" : "disabled"}
                title="Guarda los dedos de esa mano: solo gasta la boca y los PV; se pierde al segundo Play o al descansar">Guardar en la ${ETIQUETA_MANO[m].toLowerCase()}</button>`).join("")}
            ${llenables.length && !motivo
                ? llenables.map(({ ranura, indice, objeto }) => `<button type="button" class="btn-pastilla-sao" data-accion="llenar" data-ranura="${ranura}" data-indice="${indice}"
                    title="Gasta la boca y los PV">Llenar ${escaparHtml(objeto.nombre)}</button>`).join("")
                : `<button type="button" class="btn-pastilla-sao" disabled title="Un solo elemento (sin cristales del cinturón) y un cristal elemental del cinturón con hueco">Llenar cristal</button>`}
            <button type="button" class="btn-pastilla-sao" data-accion="vaciar" ${puestos.length ? "" : "disabled"}>Quitar todo</button>
        </div>`;
    el("formaSacro").value = forma;
    const motivoEnviar = !puestos.length ? "Pon algún elemento en los dedos" : motivo || (!ctx.enSala() && !ctx.esMaster ? "Solo en una sala con máster" : "");
    el("btnEnviarSacro").disabled = Boolean(motivoEnviar);
    el("btnEnviarSacro").title = motivoEnviar || "Enviar al máster";
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
    if (f.origen === "quitado") return quitar(id, f);
    dedos.set(id, { id, elemento: f.elemento, origen: f.origen, fuente: f.fuente, ...(f.puntos !== undefined ? { puntos: f.puntos } : {}) });
    elegida = null;
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

function alPulsar(e) {
    const dedo = e.target.closest(".dedo-sacro");
    if (dedo) {
        if (dedo.classList.contains("bloqueado")) { mensaje = motivoDedoNoUsable(pj(), dedo.dataset.dedo) ?? ""; return pintar(); }
        if (elegida) return poner(dedo.dataset.dedo, elegida);
        if (dedos.has(dedo.dataset.dedo)) { dedos.delete(dedo.dataset.dedo); mensaje = ""; ctx.reproducir("click"); return pintar(); }
        mensaje = "Elige primero un elemento: arrástralo o tócalo.";
        return pintar();
    }
    const boton = e.target.closest("button[data-accion]");
    if (!boton || boton.disabled) return;
    ctx.reproducir("click");
    const p = pj();
    const puestos = lista();
    switch (boton.dataset.accion) {
        case "guardar": {
            const mano = boton.dataset.mano;
            const deMano = puestos.filter(d => parteDeDedo(d.id) === mano);
            const { resultado, fallo } = ctx.conEmbriaguez("objeto", () => guardarEnMano(p, mano, cargarDedos(deMano), ctx.gastar));
            if (fallo) { dedos.clear(); break; }
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
            break;
        }
        case "llenar": {
            const cristal = objetoCinturon(p, boton.dataset.ranura, Number(boton.dataset.indice));
            const motivo = motivoNoGenerar(p, puestos);
            if (!cristal || motivo) { mensaje = motivo || "Ese cristal ya no está."; break; }
            const { resultado: gastado, fallo } = ctx.conEmbriaguez("objeto", () => ctx.gastar(["cabeza"], `Llenar ${cristal.nombre}`));
            if (fallo || !gastado) { mensaje = fallo ? "" : "Sin acción de boca."; ctx.actualizarTodo(); break; }
            const coste = costeGenerar(p, puestos);
            const r = llenarCristal(p, cristal, puestos[0].elemento, puestos.length);
            p.vida -= coste;
            mensaje = `${cristal.nombre}: +${r.anadido} de ${ELEMENTOS_SACRO[puestos[0].elemento].etiqueta}${r.perdido ? ` (se pierden ${r.perdido}: no caben)` : ""}${coste ? ` · −${coste} PV` : ""}`;
            dedos.clear();
            ctx.actualizarTodo();
            break;
        }
        case "vaciar": dedos.clear(); mensaje = ""; break;
        case "escanear": escanear(); break;
        case "pedirAmbiente": {
            esperandoAmbiente = true;
            // Un personaje del máster: se cierra esta ventana para que se abra la del ambiente (y vuelve al responder)
            if (ctx.esMaster) {
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

/* Arrastrar una ficha a un dedo (ratón y táctil); un toque sin moverse la deja elegida */
function alApretar(e) {
    const boton = e.target.closest(".ficha-elemento");
    if (!boton || boton.disabled) return;
    const f = fichaDe(boton.dataset.origen, boton.dataset.fuente);
    const inicio = { x: e.clientX, y: e.clientY };
    let fantasma = null;
    const mover = (ev) => {
        if (!fantasma && Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) < 6) return;
        if (!fantasma) {
            fantasma = boton.cloneNode(true);
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
            elegida = elegida && elegida.origen === f.origen && String(elegida.fuente) === String(f.fuente) ? null : f;
            return pintar();
        }
        fantasma.remove();
        const destino = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".dedo-sacro");
        if (destino) poner(destino.dataset.dedo, f);
        else pintar();
    };
    document.addEventListener("pointermove", mover);
    document.addEventListener("pointerup", soltar);
}

/* Enviar al máster: la petición queda en pj.hechizo esperando (sin gastar nada hasta que la resuelva) */
function enviar() {
    const p = pj();
    const puestos = lista();
    if (!forma.trim()) { mensaje = "Escribe qué quieres hacer."; return pintar(); }
    const motivo = motivoNoDedos(p, puestos) || motivoNoGenerar(p, puestos);
    if (motivo) { mensaje = motivo; return pintar(); }
    ctx.reproducir("click");
    p.hechizo = {
        id: globalThis.crypto?.randomUUID?.() ?? `h-${Date.now().toString(36)}`,
        dedos: puestos.map(({ id, elemento, origen, fuente, puntos }) => ({ id, elemento, origen, fuente: String(fuente), ...(puntos !== undefined ? { puntos } : {}) })),
        forma: forma.trim(),
        hora: Date.now()
    };
    // Sugerencia para el máster: el daño mágico × multiplicador de cada elemento (lo puede cambiar)
    const sugerencia = dannoElementos(p, puestos).map(e => ({ elemento: e.elemento, cantidad: e.cantidad }));
    const hechizo = p.hechizo;
    dedos.clear();
    forma = "";
    mensaje = "";
    ctx.actualizarTodo();
    pintar();
    if (ctx.esMaster) {
        // Un personaje del máster: se cierra esta ventana y se abre la de resolver
        bootstrap.Modal.getInstance(ventana())?.hide();
        return ctx.encolarLocal(ctx.instancia(), p.nombre || "Sin nombre", hechizo, sugerencia);
    }
    emitirPrivado("hechizo", { para: PARA_TODOS, hechizo, sugerencia }).catch(error => {
        if (pj().hechizo?.id === hechizo.id) pj().hechizo = null;
        ctx.aviso("Magia", [`No se pudo enviar al máster: ${error.message ?? error}`]);
        ctx.actualizarTodo();
        pintar();
    });
}

/* Escanear y quitar (13-sacro.md §12) ___________________________________________________
 * Escanear emite "escaneo" a toda la sala; cada pestaña con energía en las manos (o NPC cargados, en la del máster)
 * contesta "escaneoRespuesta" solo al que escanea. Los personajes de esta misma pestaña (los del máster) se miran en
 * local. Quitar: "quitarEnergia" a la pestaña dueña, que lo quita y contesta "energiaQuitada"; entonces va al dedo. */
const SEGUNDOS_ESCANEO = 3;

/* Lo que llevan encima los personajes de esta pestaña (salvo el que escanea) */
function energiaPropia(salvo = null) {
    return ctx.personajesPropios().filter(inst => inst !== salvo).map(inst => {
        const x = ctx.leerPersonaje(inst);
        const elementos = x ? energiaDe(x) : [];
        return elementos.length ? { instancia: inst, nombre: x.nombre || "Sin nombre", npc: Boolean(x.esNpc), elementos } : null;
    }).filter(Boolean);
}

function anadirResultados(lista) {
    for (const r of Array.isArray(lista) ? lista : []) {
        const elementos = (Array.isArray(r?.elementos) ? r.elementos : []).filter(a => esElementoSacro(a?.elemento))
            .map(a => ({ elemento: a.elemento, dedos: entero(a.dedos, 40) })).filter(a => a.dedos > 0);
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

/* Pone en el dedo lo quitado (fuente "instancia|elemento") y lo descuenta de lo escaneado */
function ponerQuitado(dedo, fuente, puntos) {
    const [instancia, elemento] = fuente.split("|");
    dedos.set(dedo, { id: dedo, elemento, origen: "quitado", fuente, ...(Number.isFinite(puntos) ? { puntos } : {}) });
    const r = escaneo?.resultados.get(instancia);
    const a = r?.elementos.find(x => x.elemento === elemento);
    if (a) a.dedos--;
    if (r) r.elementos = r.elementos.filter(x => x.dedos > 0);
}

function quitar(dedo, f) {
    const [instancia, elemento] = f.fuente.split("|");
    elegida = null;
    if (ctx.personajesPropios().includes(instancia)) {
        const r = ctx.conPersonaje(instancia, x => quitarElemento(x, elemento));
        if (r) ponerQuitado(dedo, f.fuente, r.puntos);
        else mensaje = "Ya no lo tiene.";
        ctx.actualizarTodo();
        return pintar();
    }
    const id = nuevoId();
    quitando.set(id, { dedo, fuente: f.fuente });
    mensaje = "Quitándoselo…";
    emitirPrivado("quitarEnergia", { para: instancia, id, elemento }).catch(error => {
        quitando.delete(id);
        mensaje = `No se pudo: ${error.message ?? error}`;
        pintar();
    });
    pintar();
}

/* Transfusión de sangre (13-sacro.md §9) _________________________________________________
 * Ventana #modalTransfusion desde el botón de la mano. Quitar PV a otro (a mí o a un tercero): tirada de dado medio +
 * Combate + el mayor entre Reflejos y Fortaleza y un golpe con transfusion = { pv, para } que quien pierde acepta
 * pulsándolo (recibirGolpe le quita lo que tenga y avisa con "transfusion" a quien recibe). Dar mis PV: los pierdo ya y
 * sale un golpe que cura (efecto) para que el otro lo acepte. Boca + una mano (las dos si es de uno a otro). */
const ventanaTransfusion = () => el("modalTransfusion");
let manoTransfusion = "manoIzquierda";

function pintarTransfusion() {
    const p = pj();
    const modo = el("transfusionModo").value;
    const otros = ctx.personajesSala();
    const opciones = otros.map(o => `<option value="${escaparHtml(o.instancia)}">${escaparHtml(o.nombre || "Sin nombre")}${o.npc ? " (NPC)" : ""}</option>`).join("");
    for (const id of ["transfusionDe", "transfusionPara"]) {
        const select = el(id);
        const antes = select.value;
        if (select.dataset.opciones !== opciones) { select.innerHTML = opciones; select.dataset.opciones = opciones; }
        if (antes && otros.some(o => o.instancia === antes)) select.value = antes;
    }
    el("ranuraTransfusionDe").hidden = modo === "dar";
    el("ranuraTransfusionPara").hidden = modo === "aMi";
    const maximo = modo === "aMi" ? Math.min(maxTransfusion(p), Math.max(0, p.vidaMax - p.vida))
        : modo === "dar" ? Math.min(maxTransfusion(p), Math.max(0, p.vida)) : maxTransfusion(p);
    const cantidad = el("transfusionCantidad");
    cantidad.max = String(maximo);
    if (Number(cantidad.value) > maximo) cantidad.value = String(maximo);
    const manos = MODOS_TRANSFUSION[modo].manos;
    const manosLibres = ["manoIzquierda", "manoDerecha"].filter(m => manoVacia(p, m));
    const motivo = !otros.length ? "No hay nadie más en la sala."
        : manos === 2 && manosLibres.length < 2 ? "Hacen falta las dos manos libres (sin nada equipado ni energía)."
        : !manoVacia(p, manoTransfusion) ? "Esa mano no está libre."
        : modo === "otro" && el("transfusionDe").value === el("transfusionPara").value ? "Quien pierde y quien recibe tienen que ser distintos."
        : maximo <= 0 ? (modo === "aMi" ? "Tienes los PV al máximo." : "No tienes PV que dar.") : "";
    el("textoTransfusion").textContent = `Hasta ${maximo} PV (3 × Sacro = ${maxTransfusion(p)}). Gasta la boca y ${manos === 2 ? "las dos manos" : "una mano"}.`
        + (modo === "dar" ? " Sin tirada: pierdes los PV ahora." : " Tirada contra la Defensa de quien pierde los PV.");
    el("avisoTransfusion").textContent = motivo;
    el("btnAceptarTransfusion").disabled = Boolean(motivo);
}

/** Abre la ventana de transfusión desde el botón de una mano */
export function abrirTransfusion(mano) {
    if (!puedeUsarMagia(pj())) return ctx.aviso("Transfusión", ["Solo los personajes del Underworld pueden usar la magia."]);
    if (!ctx.enSala() && !ctx.esMaster) return ctx.aviso("Transfusión", ["Solo en una sala: hace falta alguien a quien quitar o dar PV."]);
    manoTransfusion = mano;
    el("transfusionCantidad").value = String(maxTransfusion(pj()));
    pintarTransfusion();
    bootstrap.Modal.getOrCreateInstance(ventanaTransfusion()).show();
}

function ejecutarTransfusion() {
    const p = pj();
    const modo = el("transfusionModo").value;
    pintarTransfusion();
    if (el("btnAceptarTransfusion").disabled) return;
    const n = Math.min(entero(el("transfusionCantidad").value), Number(el("transfusionCantidad").max) || 0);
    if (n <= 0) return;
    const otros = ctx.personajesSala();
    const de = otros.find(o => o.instancia === el("transfusionDe").value);
    const para = otros.find(o => o.instancia === el("transfusionPara").value);
    const partes = MODOS_TRANSFUSION[modo].manos === 2 ? ["cabeza", "izquierda", "derecha"] : ["cabeza", manoTransfusion === "manoIzquierda" ? "izquierda" : "derecha"];
    const { resultado: gastado, fallo } = ctx.conEmbriaguez("arte", () => ctx.gastar(partes, "Transfusión"));
    bootstrap.Modal.getInstance(ventanaTransfusion())?.hide();
    if (fallo || !gastado) return ctx.actualizarTodo();
    ctx.reproducir("click");
    const nombre = p.nombre || "Sin nombre";
    if (modo === "dar") {
        const dado = Math.min(n, Math.max(0, p.vida));
        p.vida -= dado;
        mostrarPopupDanno({
            titulo: `${nombre}: transfusión`, subtitulo: `Da ${dado} PV a ${para.nombre || "alguien"}`,
            descripcion: `${para.nombre || "Quien la recibe"} la acepta pulsando el bloque.`,
            golpes: [{ etiqueta: `Transfusión para ${para.nombre || "alguien"}`, total: 0, magia: true, efecto: { nombre: "Transfusión", pv: dado }, notas: [],
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

/* Lo que manda el máster (viene de otra pestaña: se valida) */
function cargarResultado(datos) {
    if (!datos?.id) return null;
    const tirada = datos.tirada && CARACTERISTICAS[datos.tirada.caracteristica] && HABILIDADES[datos.tirada.habilidad]
        ? { caracteristica: datos.tirada.caracteristica, habilidad: datos.tirada.habilidad, dado: entero(datos.tirada.dado, 2) } : null;
    return {
        id: String(datos.id),
        rechazado: datos.rechazado === true,
        danno: (Array.isArray(datos.danno) ? datos.danno : []).filter(f => esElementoSacro(f?.elemento))
            .map(f => ({ elemento: f.elemento, cantidad: entero(f.cantidad) })).filter(f => f.cantidad > 0).slice(0, 7),
        radio: Math.max(1, Math.min(5, entero(datos.radio) || 1)),
        tirada,
        estado: datos.estado && ESTADOS_INFO[datos.estado.clave]
            ? { clave: datos.estado.clave, valor: entero(datos.estado.valor, 99) || 1, turnos: entero(datos.estado.turnos, 99) } : null,
        nota: String(datos.nota ?? "").slice(0, 300),
        objetos: (Array.isArray(datos.objetos) ? datos.objetos : []).map(cargarObjeto).filter(Boolean).slice(0, 10)
    };
}

/**
 * Aplica la resolución del máster al personaje de esa instancia (null = el de la ficha): gasta las acciones de los
 * dedos (las 4 solo sin acciones gastadas) y los PV de generar, vacía los cristales usados y el ambiente, tira si lo
 * pide y saca el pop-up con el daño de cada elemento (golpe de magia). Los objetos van al botín.
 */
export function aplicarResultadoHechizo(instancia, datosBrutos) {
    const datos = cargarResultado(datosBrutos);
    const p = ctx.leerPersonaje(instancia);
    if (!datos || !p?.hechizo || p.hechizo.id !== datos.id) return;
    const hechizo = p.hechizo;
    const nombre = p.nombre || "Sin nombre";
    ctx.reproducir("notificacion");
    // Lo ha resuelto (o rechazado) el máster: la ventana de Sacro del jugador se cierra
    if (ventana()?.classList.contains("show")) bootstrap.Modal.getInstance(ventana())?.hide();
    if (datos.rechazado) {
        ctx.conPersonaje(instancia, x => { x.hechizo = null; });
        ctx.aviso("Magia rechazada", [`El máster ha rechazado lo que querías hacer: «${hechizo.forma}».`, ...(datos.nota ? [datos.nota] : [])]);
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

    const elemental = datos.danno.map(f => entradaDannoSacro(f.elemento, f.cantidad));
    const efecto = datos.estado ? { nombre: "Magia", estados: [{ ...datos.estado, probabilidad: 100 }] } : null;
    const notas = [];
    if (datos.radio > 1) notas.push(`En área de ${datos.radio}×${datos.radio}.`);
    if (datos.tirada) notas.push(`Si no llega a la Defensa del objetivo, se desvía (Defensa − total) casillas ${DIRECCIONES[Math.floor(Math.random() * DIRECCIONES.length)]}.`);
    if (datos.nota) notas.push(datos.nota);
    const golpe = elemental.length || efecto ? { etiqueta: "Magia", total: 0, elemental, magia: true, ...(efecto ? { efecto } : {}), notas } : null;
    const subtitulo = hechizo.forma.slice(0, 120);

    if (datos.tirada) {
        const x = ctx.leerPersonaje(instancia);
        ctx.tirar({
            nombreAccion: "Magia",
            subtitulo,
            valorHabilidad: Math.max(0, Number(x.getGenerico(datos.tirada.habilidad)) || 0),
            etiquetaHabilidad: HABILIDADES[datos.tirada.habilidad],
            valorCaracteristica: Number(x[datos.tirada.caracteristica]) || 0,
            etiquetaCaracteristica: CARACTERISTICAS[datos.tirada.caracteristica],
            modoTirada: datos.tirada.dado,
            etiquetaTotal: "ATAQUE",
            ...(golpe ? { calcularDanno: () => golpe } : {})
        });
    } else if (golpe) {
        mostrarPopupDanno({ titulo: `${nombre}: magia`, subtitulo, golpes: [golpe] });
    } else {
        emitirEvento("objeto", { titulo: `${nombre}: magia`, subtitulo: "Magia", lineas: [hechizo.forma, ...notas] });
    }
    if (lineas.length) ctx.aviso("Magia", lineas);
    if (datos.objetos.length) ctx.abrirBotin(instancia ?? ctx.instancia());
    ctx.actualizarTodo();
    pintar();
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
 *        personajesPropios() (instancias de los personajes de esta pestaña), personajesSala() (los demás de la sala) }
 */
export function inicializarSacro(contexto) {
    ctx = contexto;
    const modal = ventana();
    if (!modal) return;
    modal.addEventListener("click", alPulsar);
    modal.addEventListener("pointerdown", alApretar);
    modal.addEventListener("input", (e) => { if (e.target.id === "formaSacro") forma = e.target.value; });
    modal.addEventListener("keydown", (e) => {
        const dedo = e.target.closest?.(".dedo-sacro");
        if (dedo && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); alPulsar({ target: dedo }); }
    });
    el("btnEnviarSacro").addEventListener("click", enviar);
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
    // Te quitan un elemento (a ti o a uno de tus personajes, datos.para): sin tirada
    registrarManejador("quitarEnergia", (evento) => {
        const d = evento.datos ?? {};
        if (!esElementoSacro(d.elemento) || !evento.instancia) return;
        const r = ctx.conPersonaje(d.para, x => quitarElemento(x, d.elemento));
        emitirPrivado("energiaQuitada", { para: evento.instancia, id: String(d.id ?? ""), ok: Boolean(r), puntos: r?.puntos ?? null }).catch(() => {});
        if (r) {
            ctx.reproducir("notificacion");
            ctx.aviso("Te quitan energía", [`${evento.personaje || "Alguien"} te ha quitado ${ELEMENTOS_SACRO[d.elemento].etiqueta}.`]);
            ctx.actualizarTodo();
        }
    });
    registrarManejador("energiaQuitada", (evento) => {
        const d = evento.datos ?? {};
        const pendiente = quitando.get(String(d.id));
        if (!pendiente) return;
        quitando.delete(String(d.id));
        if (d.ok === true && !dedos.has(pendiente.dedo)) { ponerQuitado(pendiente.dedo, pendiente.fuente, Number(d.puntos)); mensaje = ""; }
        else mensaje = d.ok === true ? "Ese dedo ya tiene otro elemento: lo quitado se pierde." : "Ya no lo tiene.";
        pintar();
    });
    registrarManejador("transfusion", (evento) => recibirTransfusion(evento.datos?.para, evento.datos?.pv, String(evento.personaje || evento.datos?.de || "alguien")));
    // Ventana de transfusión
    el("transfusionModo")?.addEventListener("change", pintarTransfusion);
    ["transfusionDe", "transfusionPara", "transfusionCantidad"].forEach(id => el(id)?.addEventListener("input", pintarTransfusion));
    el("btnAceptarTransfusion")?.addEventListener("click", ejecutarTransfusion);
}
