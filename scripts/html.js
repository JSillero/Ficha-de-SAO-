/* Utilidades de texto para montar HTML */

export function escaparHtml(texto) {
    return String(texto ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* Color CSS seguro para un atributo style: solo #rgb, #rrggbb o #rrggbbaa; si no, el de por defecto.
 * Los eventos pueden venir de otros jugadores, así que no se mete en el HTML nada que no sea un color. */
export function colorSeguro(color, porDefecto) {
    return /^#[0-9a-f]{3,8}$/i.test(String(color ?? "")) ? color : porDefecto;
}
