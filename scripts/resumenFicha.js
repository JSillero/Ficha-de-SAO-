// scripts/resumenFicha.js
// Ficha resumida: lo que ven de ti los compañeros de grupo (y tú en tu perfil). Habilidades, artes
// equipadas, profesión, valores de combate y equipamiento, como datos de texto plano y números.
// Viaja en un evento privado (máx. 20 000 caracteres por evento, ver firestore.rules), así que los
// textos se recortan. No toca el DOM: la interfaz lo pinta (pintarFichaResumen en interfaz.js).

import { HABILIDADES_LISTA } from "./PJ.js";

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
    { clave: "dMagico", etiqueta: "Daño mágico", icono: "magia",
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
/* Margen bajo el límite de 20 000 caracteres de un evento (el resto del evento también cuenta) */
const MAX_CARACTERES_RESUMEN = 15000;

const texto = (valor, max = MAX_TEXTO) => String(valor ?? "").slice(0, max);
const numero = (valor) => (Number.isFinite(Number(valor)) ? Number(valor) : 0);
const lista = (valor, cargar) => (Array.isArray(valor) ? valor.slice(0, MAX_LISTA).map(cargar) : []);

/**
 * Resumen de un personaje. `textos` da los textos que solo sabe hacer la interfaz:
 * { detalleArte(arte), detalleEfecto(efecto), etiquetaTipoEquipo(tipo), valoresEquipo(equipo), textoModificadores(mods) }
 */
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
        habilidades: HABILIDADES_LISTA.map(clave => ({ clave, base: pj[clave], efectivo: pj.getGenerico(clave) })),
        combate: VALORES_COMBATE.map(({ clave }) => ({ clave, valor: pj[clave] })),
        artes: (pj.artes || []).filter(arte => arte.equipada).map(arte => ({
            nombre: arte.nombre, tipo: arte.tipo, descripcion: arte.descripcion, detalle: textos.detalleArte(arte)
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
