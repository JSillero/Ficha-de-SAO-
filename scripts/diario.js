// scripts/diario.js
// Diario del protagonista: páginas de texto con formato básico (títulos, negrita, cursiva, subrayado y listas).
// personaje.diario = [html, ...], una cadena por página y siempre al menos una. No toca el DOM: la ventana
// (#modalDiario) la pinta interfaz.js (inicializarDiario). No va en la ficha resumida: es privado.
//
// El HTML se sanea con una lista blanca de etiquetas sin atributos, así una ficha cargada de un fichero
// o de la nube no puede meter scripts ni estilos. Se hace con una expresión regular (sin DOMParser) para
// que funcione igual en el navegador y en Node.

/* Límites: el personaje se guarda en un documento de Firestore de 1 MiB como máximo (ver .claude/11-online.md) */
export const MAX_CARACTERES_PAGINA = 10000;
export const MAX_PAGINAS_DIARIO = 50;

/* Etiqueta de las líneas de título (letra más grande) */
export const ETIQUETA_TITULO_DIARIO = "h3";

/* Etiquetas permitidas (sin atributos) */
const ETIQUETAS_PERMITIDAS = new Set(["b", "strong", "i", "em", "u", "ul", "ol", "li", "p", "br", "div", ETIQUETA_TITULO_DIARIO]);

/**
 * HTML del diario saneado: solo las etiquetas permitidas y sin atributos. Cualquier otra etiqueta se quita
 * (su texto se queda) y los "<" o ">" sueltos se escapan, así que el resultado no puede crear otras etiquetas.
 */
export function sanearHtmlDiario(html) {
    return String(html ?? "").replace(/<(\/?)([a-z][a-z0-9]*)\b[^>]*>|[<>]/gi, (coincidencia, cierre, etiqueta) => {
        if (!etiqueta) return coincidencia === "<" ? "&lt;" : "&gt;";
        const nombre = etiqueta.toLowerCase();
        return ETIQUETAS_PERMITIDAS.has(nombre) ? `<${cierre}${nombre}>` : "";
    });
}

/** Diario guardado (o ausente en las fichas antiguas) → lista de páginas saneadas, al menos una */
export function cargarDiario(lista) {
    const paginas = (Array.isArray(lista) ? lista : [])
        .slice(0, MAX_PAGINAS_DIARIO)
        .map(pagina => (typeof pagina === "string" ? sanearHtmlDiario(pagina) : ""));
    return paginas.length ? paginas : [""];
}

/** Página llena: no se puede escribir más en ella */
export function paginaLlena(html) {
    return String(html ?? "").length >= MAX_CARACTERES_PAGINA;
}

export function motivoNoAnadirPagina(pj) {
    return pj.diario.length >= MAX_PAGINAS_DIARIO ? `El diario tiene el máximo de ${MAX_PAGINAS_DIARIO} páginas.` : null;
}

/**
 * Añade una página en blanco detrás de la indicada.
 * @returns {{ ok: boolean, indice?: number, resumen: string[] }} indice = la página nueva
 */
export function anadirPagina(pj, despuesDe = pj.diario.length - 1) {
    const motivo = motivoNoAnadirPagina(pj);
    if (motivo) return { ok: false, resumen: [motivo] };
    const indice = Math.min(Math.max(0, despuesDe + 1), pj.diario.length);
    pj.diario.splice(indice, 0, "");
    return { ok: true, indice, resumen: [`Página ${indice + 1} añadida`] };
}

/**
 * Borra una página. Si es la única, solo la vacía (el diario siempre tiene al menos una).
 * @returns {number} la página que queda a la vista
 */
export function borrarPagina(pj, indice) {
    if (pj.diario.length <= 1) {
        pj.diario = [""];
        return 0;
    }
    pj.diario.splice(indice, 1);
    return Math.min(indice, pj.diario.length - 1);
}
