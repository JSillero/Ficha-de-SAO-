// scripts/resumenFicha.js
// Ficha resumida: lo que ven de ti los compañeros de grupo (y tú en tu perfil). Habilidades, artes
// equipadas, profesión, valores de combate y equipamiento, como datos de texto plano y números.
// Viaja en un evento privado (máx. 20 000 caracteres por evento, ver firestore.rules), así que los
// textos se recortan. No toca el DOM: la interfaz lo pinta (pintarFichaResumen en interfaz.js).

import { HABILIDADES_LISTA } from "./PJ.js";
import { prepararAtaque, prepararAtaqueNpc } from "./ataque.js";
import { equiposDePartes } from "./npc.js";
import { mediaDado } from "./dados.js";
import { modoSigiloPorArmadura } from "./turno.js";

export const VERSION_RESUMEN = 1;

/* Profesiones (claves de tipoProfesion) */
export const PROFESIONES = { herrero: "Herrero", armero: "Armero", cocinero: "Cocinero", alquimista: "Alquimista" };

/* Valores de combate de la ficha (tarjetas de la columna derecha y ficha resumida) */
export const VALORES_COMBATE = [
    { clave: "defensa", etiqueta: "Defensa", icono: "escudo",
        ayuda: "Reflejos + Atletismo efectivo + 5 (+ escudo en uso). El atacante debe igualarla para hacer daño." },
    { clave: "armadura", etiqueta: "Armadura", icono: "armadura",
        ayuda: "Daño que la armadura resta a cada impacto." },
    { clave: "iniciativa", etiqueta: "Iniciativa", icono: "iniciativa",
        ayuda: "Reflejos + Inteligencia / 2. Orden de actuación en combate." },
    { clave: "vMovimiento", etiqueta: "Movimiento", icono: "movimiento", unidad: "casillas",
        ayuda: "Atletismo efectivo / 5 + 3. Casillas sin correr; correr las duplica." },
    { clave: "dFisico", etiqueta: "Daño CaC", icono: "espada",
        ayuda: "(Fortaleza + Combate) / 4, hacia abajo. En sigilo usa Sigilo en lugar de Combate." },
    { clave: "dDistancia", etiqueta: "Daño a distancia", icono: "distancia",
        ayuda: "Combate / 4, hacia abajo. En sigilo usa Sigilo en lugar de Combate." },
    { clave: "dMagico", etiqueta: "Daño mágico", icono: "magia", soloUnderworld: true,
        ayuda: "(Inteligencia + Sacro) / 4, hacia abajo." },
    { clave: "aguante", etiqueta: "Aguante", icono: "aguante",
        ayuda: "Fortaleza + Voluntad / 2. PV que ganas cada 5 niveles y resistencia al frío." },
    { clave: "perspicacia", etiqueta: "Perspicacia", icono: "perspicacia",
        ayuda: "Voluntad + Cultura + 5. Las tiradas para manipular tus emociones deben igualarla." },
    { clave: "percepcionPasiva", etiqueta: "Percepción pasiva", icono: "percepcion",
        ayuda: "Inteligencia + Percepción + 5. Detecta trampas y enemigos en sigilo sin tirar." }
];

/* Ranuras de equipo, en el orden en que se muestran */
const RANURAS_EQUIPO = [
    ["manoDerecha", "Mano derecha"], ["manoIzquierda", "Mano izquierda"], ["equipoArmadura", "Armadura"]
];

const MAX_TEXTO = 80;
const MAX_DESCRIPCION = 300;
const MAX_LISTA = 20;
const MAX_COMPORTAMIENTO = 2000;
/* Margen bajo el límite de 20 000 caracteres de un evento (el resto del evento también cuenta) */
const MAX_CARACTERES_RESUMEN = 15000;

const texto = (valor, max = MAX_TEXTO) => String(valor ?? "").slice(0, max);
const numero = (valor) => (Number.isFinite(Number(valor)) ? Number(valor) : 0);
const lista = (valor, cargar) => (Array.isArray(valor) ? valor.slice(0, MAX_LISTA).map(cargar) : []);

/**
 * Resumen de un personaje. `textos` da los textos que solo sabe hacer la interfaz:
 * { detalleArte(arte), detalleEfecto(efecto), etiquetaTipoEquipo(tipo), valoresEquipo(equipo), textoModificadores(mods) }
 */
/* Estadísticas de combate de un protagonista para el máster (panel de protagonistas al crear NPC; van en el estado
   de la sala). Acierto = característica del arma + Combate (sin sigilo); tirada media = media del dado del arma
   + bonificador del dado + acierto; daño = arma + bonificador CaC. Con dos armas, la de mejor tirada media; sin
   arma, null. La defensa no cuenta los escudos en uso (para que no dependa del momento); defensaEscudo = defensa
   usando el mejor escudo que lleve (null sin escudo). Además, el resto de valores de combate (dMagico solo con
   Underworld). También sirve para un NPC (panel de protagonistas, columna de la ficha que se edita): acierto del
   arma, daño = arma + modificadores de daño CaC, y cuentan las armas y escudos de todas sus partes. */
/* Tirada media para entrar en sigilo: dado medio según la armadura + Reflejos + Sigilo (como el botón de sigilo).
   null con armadura pesada (no se puede) o en un NPC (no tiene Sigilo). */
function tiradaMediaSigilo(pj) {
    const modo = pj.esNpc ? null : modoSigiloPorArmadura(pj.equipoArmadura?.tipo);
    if (modo === null) return null;
    const valor = mediaDado(modo) + (Number(pj.reflejos) || 0) + Math.max(0, Number(pj.getGenerico("subterfugio")) || 0);
    return Math.round(valor * 10) / 10;
}

export function estadisticasProtagonista(pj) {
    pj.calcularCaracteristicas();
    const redondear = (n) => Math.round((Number(n) || 0) * 10) / 10;
    const equipos = [pj.manoDerecha, pj.manoIzquierda, ...(pj.esNpc ? equiposDePartes(pj) : [])].filter(Boolean);
    let mejor = null;
    for (const item of equipos) {
        const ataque = pj.esNpc ? prepararAtaqueNpc(pj, item, [1])
            : prepararAtaque(pj, item === pj.manoDerecha ? "manoDerecha" : "manoIzquierda", [1]);
        if (!ataque) continue;
        const acierto = pj.esNpc ? Number(ataque.valorHabilidad) || 0
            : (Number(ataque.valorCaracteristica) || 0) + pj.getGenerico("combate");
        const tiradaMedia = mediaDado(ataque.modo) + (Number(ataque.bonificador) || 0) + acierto;
        const dannoArma = Math.max(0, Number(item.danno) || 0);
        const danno = pj.esNpc ? Math.max(0, dannoArma + (Number(pj.dFisico) || 0)) : dannoArma + Math.max(0, Number(pj.dFisico) || 0);
        if (!mejor || tiradaMedia > mejor.tiradaMedia) mejor = { acierto, tiradaMedia, danno };
    }
    const defensa = (Number(pj.defensa) || 0) - pj.getDefensaEscudos();
    const escudos = equipos
        .filter(item => item?.tipo === "escudo" || item?.tipo === "gran_escudo").map(item => Number(item.defensa) || 0);
    return {
        vidaMax: Math.trunc(Number(pj.vidaMax) || 0),
        nivel: Math.trunc(Number(pj.nivel) || 0),
        defensa: redondear(defensa),
        defensaEscudo: escudos.length ? redondear(defensa + Math.max(...escudos)) : null,
        armadura: redondear(pj.armadura),
        acierto: mejor ? redondear(mejor.acierto) : null,
        tiradaMedia: mejor ? redondear(mejor.tiradaMedia) : null,
        iniciativa: redondear(pj.iniciativa),
        danno: mejor ? redondear(mejor.danno) : null,
        tiradaSigilo: tiradaMediaSigilo(pj),
        // Tirada de Carisma (como la de la ficha): dado medio + Inteligencia + Carisma; un NPC no tiene Carisma
        tiradaCarisma: pj.esNpc ? null
            : redondear(mediaDado(1) + (Number(pj.inteligencia) || 0) + (Number(pj.getGenerico("comunicacion")) || 0)),
        vMovimiento: redondear(pj.vMovimiento),
        dFisico: redondear(pj.dFisico),
        dDistancia: redondear(pj.dDistancia),
        dMagico: pj.esUnderworld || pj.esNpc ? redondear(pj.dMagico) : null,
        aguante: redondear(pj.aguante),
        perspicacia: redondear(pj.perspicacia),
        percepcionPasiva: redondear(pj.percepcionPasiva)
    };
}

export function crearResumenFicha(pj, textos) {
    const efectos = (equipo) => (equipo.efectos ?? []).map(efecto => ({
        nombre: efecto.nombre, tipo: efecto.tipo, descripcion: efecto.descripcion, detalle: textos.detalleEfecto(efecto)
    }));
    const ranuras = [...RANURAS_EQUIPO, ...(pj.accesorios || []).map((_, i) => [`accesorio-${i}`, `Accesorio ${i + 1}`])];
    const equipo = ranuras
        .map(([ranura, etiqueta]) => [etiqueta, ranura.startsWith("accesorio-") ? pj.accesorios[Number(ranura.split("-")[1])] : pj[ranura]])
        .filter(([, item]) => item?.tipo)
        .map(([ranura, item]) => ({
            ranura,
            nombre: item.nombre?.trim() || textos.etiquetaTipoEquipo(item.tipo),
            tipo: textos.etiquetaTipoEquipo(item.tipo),
            valores: textos.valoresEquipo(item),
            modificadores: textos.textoModificadores(item.modificadores),
            descripcion: item.descripcion ?? "",
            efectos: efectos(item)
        }));

    const resumen = cargarResumenFicha({
        version: VERSION_RESUMEN,
        nombre: pj.nombre,
        nivel: pj.nivel,
        profesion: pj.tipoProfesion,
        // Solo los NPC (campo de texto bajo Acciones)
        comportamiento: pj.esNpc ? pj.comportamientoCombate : "",
        // Sin Underworld no se envían Sacro ni el daño mágico
        habilidades: HABILIDADES_LISTA.filter(clave => pj.puedeUsarHabilidad(clave))
            .map(clave => ({ clave, base: pj.getBaseHabilidad(clave), efectivo: pj.getGenerico(clave) })),
        combate: VALORES_COMBATE.filter(({ soloUnderworld }) => !soloUnderworld || pj.esUnderworld)
            .map(({ clave }) => ({ clave, valor: pj[clave] })),
        // Las habilidades oníricas solo con Underworld
        artes: (pj.artes || []).filter(arte => arte.equipada && (!arte.onirica || pj.esUnderworld)).map(arte => ({
            nombre: arte.nombre, tipo: arte.tipo, descripcion: arte.descripcion,
            detalle: (arte.onirica ? "Onírica · " : "") + textos.detalleArte(arte)
        })),
        equipo
    });
    // Si no cabe en un evento, se quitan las descripciones (se quedan nombres y datos)
    if (JSON.stringify(resumen).length > MAX_CARACTERES_RESUMEN) {
        const sinDescripcion = (x) => { x.descripcion = ""; (x.efectos ?? []).forEach(sinDescripcion); };
        resumen.artes.forEach(sinDescripcion);
        resumen.equipo.forEach(sinDescripcion);
    }
    return resumen;
}

/** Normaliza un resumen recibido de otro jugador: solo texto y números, recortados. null si no vale. */
export function cargarResumenFicha(datos) {
    if (!datos || typeof datos !== "object" || datos.version !== VERSION_RESUMEN) return null;
    const cargarEfecto = (e) => ({
        nombre: texto(e?.nombre), tipo: e?.tipo === "pasiva" ? "pasiva" : "activa",
        descripcion: texto(e?.descripcion, MAX_DESCRIPCION), detalle: texto(e?.detalle, 160)
    });
    return {
        version: VERSION_RESUMEN,
        nombre: texto(datos.nombre),
        nivel: numero(datos.nivel),
        profesion: PROFESIONES[datos.profesion] ? datos.profesion : "",
        comportamiento: texto(datos.comportamiento, MAX_COMPORTAMIENTO),
        habilidades: lista(datos.habilidades, h => ({ clave: texto(h?.clave), base: numero(h?.base), efectivo: numero(h?.efectivo) }))
            .filter(h => HABILIDADES_LISTA.includes(h.clave)),
        combate: lista(datos.combate, c => ({ clave: texto(c?.clave), valor: numero(c?.valor) }))
            .filter(c => VALORES_COMBATE.some(v => v.clave === c.clave)),
        artes: lista(datos.artes, cargarEfecto),
        equipo: lista(datos.equipo, e => ({
            ranura: texto(e?.ranura), nombre: texto(e?.nombre), tipo: texto(e?.tipo), valores: texto(e?.valores, 160),
            modificadores: texto(e?.modificadores, 200), descripcion: texto(e?.descripcion, MAX_DESCRIPCION),
            efectos: lista(e?.efectos, cargarEfecto)
        }))
    };
}
