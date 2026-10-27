// scripts/estados.js
// Estados alterados y daño recibido (05-combate-y-estados.md §3 y §4).
// No toca el DOM: recibe el personaje, lo modifica y devuelve lo que ha pasado.

import { TURNOS_PERMANENTE } from "./modificador.js";
import { efectoHielo, salirDeSigilo, dannoHemorragia } from "./turno.js";

/* Los estados provocados por daño elemental duran 3 turnos y se reinician con cada daño nuevo */
export const DURACION_ELEMENTAL = 3;

/**
 * Información de cada estado para la interfaz, en el orden en que se muestran.
 * - unidad: qué significa el valor (null = el estado solo está activo o no).
 * - turnos: duración al activarlo a mano (TURNOS_PERMANENTE = hasta que se quite).
 * Las claves deben coincidir con ESTADOS_LISTA de PJ.js.
 */
export const ESTADOS_INFO = {
    quemadura: { etiqueta: "Quemadura", icono: "fuego", color: "#E25B12", unidad: "−Combate", turnos: DURACION_ELEMENTAL,
        descripcion: "Fuego. Resta su valor a Combate; si queda por debajo de 0, el sobrante daña PV cada turno. Se quita rodando por el suelo, curándose o al pasar los turnos." },
    electrocutado: { etiqueta: "Electrocutado", icono: "electricidad", color: "#7C5CFF", unidad: "−Atletismo", turnos: DURACION_ELEMENTAL,
        descripcion: "Electricidad. Resta su valor al Atletismo efectivo (después de modificadores y armadura); si queda a 0, paraliza. Guarda todo el daño eléctrico recibido; la parte que no encuentra Atletismo que restar daña PV una sola vez, al recibirlo." },
    congelacion: { etiqueta: "Escarcha", icono: "hielo", color: "#3A9AD9", unidad: "Escarcha", turnos: DURACION_ELEMENTAL,
        descripcion: "Hielo. Según la escarcha frente al Aguante quita acciones y después PA. Se reduce a la mitad cada turno." },
    deslumbrado: { etiqueta: "Deslumbrado", icono: "luz", color: "#F4C20D", colorGlifo: "#5A4500", unidad: "−Percepción", turnos: DURACION_ELEMENTAL,
        descripcion: "Luz con los PV al máximo. Resta su valor a Percepción; si queda a 0, ciega." },
    oscuridad: { etiqueta: "Oscuridad", icono: "oscuridad", color: "#2B1E3F", colorGlifo: "#C9B6F2", unidad: "−PV máx.", turnos: TURNOS_PERMANENTE,
        descripcion: "Resta PV máximos. Solo se recuperan con un descanso largo en zona segura." },
    paralisis: { etiqueta: "Paralizado", icono: "paralisis", color: "#C0A000", unidad: null, turnos: DURACION_ELEMENTAL,
        descripcion: "No puede actuar mientras dure el estado." },
    veneno: { etiqueta: "Envenenado", icono: "veneno", color: "#5E9E2F", unidad: "PV/turno", turnos: TURNOS_PERMANENTE, valorPorDefecto: 2,
        descripcion: "Pierde PV cada turno. Se cura con antídoto del nivel del veneno." },
    hemorragia: { etiqueta: "Hemorragia", icono: "hemorragia", color: "#B0172B", unidad: "Acumulado", turnos: TURNOS_PERMANENTE,
        descripcion: "Se acumula. Cada turno quita el Aguante en PV por cada vez que el acumulado lo contiene (Aguante 8: 15 → 8 PV, 20 → 16 PV) hasta que se cura." },
    regeneracion: { etiqueta: "Regeneración", icono: "regeneracion", color: "#E05583", unidad: "PV/turno", turnos: TURNOS_PERMANENTE,
        descripcion: "Recupera PV cada turno (comida, artes, cristales)." },
    aturdido: { etiqueta: "Aturdido", icono: "aturdido", color: "#16A085", unidad: null, turnos: TURNOS_PERMANENTE,
        descripcion: "Tira con desventaja en todas las tiradas (se combina con el panel y el arma)." },
    cegado: { etiqueta: "Cegado", icono: "cegado", color: "#34495E", unidad: null, turnos: TURNOS_PERMANENTE,
        descripcion: "No puede mirar el mapa; el máster le mueve." },
    dormido: { etiqueta: "Dormido", icono: "dormido", color: "#6D8299", unidad: null, turnos: TURNOS_PERMANENTE,
        descripcion: "No actúa hasta que alguien le despierte." },
    wither: { etiqueta: "Wither", icono: "wither", color: "#4E342E", colorGlifo: "#D7CCC8", unidad: null, turnos: TURNOS_PERMANENTE,
        descripcion: "2 de daño por turno hasta dejarlo a 1 PV (no mata)." },
    embriaguez: { etiqueta: "Embriaguez", icono: "embriaguez", color: "#D68910", unidad: null, turnos: TURNOS_PERMANENTE,
        descripcion: "Input lag; desventaja en resistencia a la convicción." }
};

/* Estados que cura el daño de luz: todos los alterados salvo oscuridad y ceguera */
const CURABLES_CON_LUZ = [
    "veneno", "quemadura", "electrocutado", "paralisis", "congelacion", "hemorragia",
    "aturdido", "dormido", "wither", "embriaguez"
];

/* Tipos de daño: etiqueta, icono (iconos.js) y color representativo (el mismo que el estado que provocan).
   "elemental" solo agrupa los cinco elementos en la ventana de daño. */
export const TIPOS_DANNO = {
    fisico: { etiqueta: "Físico", icono: "fisico", color: "#566573" },
    elemental: { etiqueta: "Elemental", icono: "elemental", color: "#9B59B6" },
    hemorragia: { etiqueta: "Hemorragia", icono: "hemorragia", color: "#B0172B" },
    fuego: { etiqueta: "Fuego", icono: "fuego", color: "#E25B12" },
    electricidad: { etiqueta: "Electricidad", icono: "electricidad", color: "#7C5CFF" },
    hielo: { etiqueta: "Hielo", icono: "hielo", color: "#3A9AD9" },
    luz: { etiqueta: "Luz", icono: "luz", color: "#F4C20D", colorGlifo: "#5A4500" },
    oscuridad: { etiqueta: "Oscuridad", icono: "oscuridad", color: "#2B1E3F", colorGlifo: "#C9B6F2" }
};

/* Variables CSS de color para pintar un icono activo (estado o tipo de daño) */
export function estiloColor(info) {
    return `--color:${info.color};--color-glifo:${info.colorGlifo ?? "#FBFBFB"}`;
}

export function estaActivo(pj, estado) {
    return (Number(pj.estados?.[estado]?.valor) || 0) > 0;
}

export function activarEstado(pj, estado, valor = ESTADOS_INFO[estado]?.valorPorDefecto ?? 1, turnos = ESTADOS_INFO[estado]?.turnos ?? TURNOS_PERMANENTE) {
    pj.estados[estado] = { valor, turnos };
    pj.calcularCaracteristicas();
}

export function quitarEstado(pj, estado) {
    pj.estados[estado] = { valor: 0, turnos: 0 };
    pj.calcularCaracteristicas();
}

/* Suma daño elemental a un estado y reinicia su contador a 3 turnos */
function sumarElemental(pj, estado, cantidad) {
    const actual = Number(pj.estados[estado]?.valor) || 0;
    pj.estados[estado] = actual + cantidad > 0
        ? { ...pj.estados[estado], valor: actual + cantidad, turnos: DURACION_ELEMENTAL }
        : { valor: 0, turnos: 0 };
    pj.calcularCaracteristicas();
    return actual + cantidad;
}

/**
 * Aplica daño al personaje.
 * @param {string} tipo clave de TIPOS_DANNO
 * @param {{ ignorarArmadura?: boolean }} opciones
 * @returns {string[]} resumen legible de lo que ha pasado
 */
export function aplicarDanno(pj, cantidad, tipo, opciones = {}) {
    cantidad = Math.max(0, Math.floor(Number(cantidad) || 0));
    if (cantidad === 0) return ["Sin daño"];

    const resumen = [];
    // Daño directo (no de estados) rompe el sigilo. La luz cura, así que no cuenta.
    let rompeSigilo = false;

    switch (tipo) {
        case "fisico": {
            // La armadura resta daño a cada impacto
            const armadura = opciones.ignorarArmadura ? 0 : Math.max(0, Number(pj.armadura) || 0);
            const recibido = Math.max(0, cantidad - armadura);
            const antes = pj.vida;
            pj.vida = Math.max(0, pj.vida - recibido);
            resumen.push(armadura > 0
                ? `Impacto ${cantidad} − armadura ${armadura} = ${recibido} de daño`
                : `${recibido} de daño${opciones.ignorarArmadura ? " (ignora armadura)" : ""}`);
            if (pj.vida !== antes) resumen.push(`PV: ${antes} → ${pj.vida}`);
            rompeSigilo = recibido > 0;
            break;
        }
        case "fuego": {
            const total = sumarElemental(pj, "quemadura", cantidad);
            resumen.push(`Quemadura ${total}: Combate efectivo ${pj.getGenerico("combate")}`);
            const sobrante = Math.max(0, -pj.getGenerico("combate"));
            if (sobrante > 0) resumen.push(`Combate por debajo de 0: −${sobrante} PV cada turno`);
            rompeSigilo = true;
            break;
        }
        case "electricidad": {
            // Atletismo efectivo: base + modificadores (personaje y equipo) − penalización de armadura
            // − electrocutado que ya tuviera. Es lo único que la electricidad puede restar.
            const atletismoDisponible = Math.max(0, pj.getGenerico("atletismo"));
            const sobrante = Math.max(0, cantidad - atletismoDisponible);
            // El estado guarda todo el daño eléctrico, aunque supere el Atletismo que quedaba
            const total = sumarElemental(pj, "electrocutado", cantidad);
            const atletismo = pj.getGenerico("atletismo");
            resumen.push(`Electrocutado ${total}: Atletismo efectivo ${atletismoDisponible} → ${atletismo}`);
            // Lo que no encuentra Atletismo que restar daña PV una sola vez (en este momento)
            if (sobrante > 0) {
                const antes = pj.vida;
                pj.vida = Math.max(0, pj.vida - sobrante);
                resumen.push(`Sin Atletismo que restar: ${sobrante} de daño (PV: ${antes} → ${pj.vida})`);
            }
            if (atletismo <= 0) {
                pj.estados.paralisis = { valor: 1, turnos: DURACION_ELEMENTAL };
                resumen.push(`Atletismo a 0: paralizado ${DURACION_ELEMENTAL} turnos`);
            }
            rompeSigilo = true;
            break;
        }
        case "hielo": {
            const total = sumarElemental(pj, "congelacion", cantidad);
            const { accionesPerdidas, paPerdidos } = efectoHielo(total, pj.aguante);
            resumen.push(`Escarcha ${total} (Aguante ${pj.aguante})`);
            if (accionesPerdidas > 0) resumen.push(`Al iniciar turno: −${accionesPerdidas} acción(es)${paPerdidos ? ` y −${paPerdidos} PA` : ""}`);
            else resumen.push(`Sin efecto hasta ${2 * pj.aguante} de escarcha`);
            rompeSigilo = true;
            break;
        }
        case "luz": {
            const antes = pj.vida;
            const curado = Math.max(0, Math.min(cantidad, pj.vidaMax - pj.vida));
            pj.vida += curado;
            if (curado > 0) resumen.push(`Cura ${curado} PV: ${antes} → ${pj.vida}`);

            const curados = CURABLES_CON_LUZ.filter(estado => estaActivo(pj, estado));
            curados.forEach(estado => { pj.estados[estado] = { valor: 0, turnos: 0 }; });
            if (curados.length) resumen.push(`Cura: ${curados.map(e => ESTADOS_INFO[e].etiqueta).join(", ")}`);
            pj.calcularCaracteristicas();

            // Con los PV al máximo, la luz que sobra resta Percepción
            const exceso = cantidad - curado;
            if (exceso > 0) {
                const total = sumarElemental(pj, "deslumbrado", exceso);
                const percepcion = pj.getGenerico("percepcion");
                resumen.push(`PV al máximo: deslumbrado ${total}, Percepción efectiva ${percepcion}`);
                if (percepcion <= 0) {
                    pj.estados.cegado = { valor: 1, turnos: DURACION_ELEMENTAL };
                    resumen.push(`Percepción a 0: cegado ${DURACION_ELEMENTAL} turnos`);
                }
            }
            break;
        }
        case "oscuridad": {
            const actual = Number(pj.estados.oscuridad?.valor) || 0;
            // No usa el contador de 3 turnos: dura hasta un descanso largo
            pj.estados.oscuridad = { ...pj.estados.oscuridad, valor: actual + cantidad, turnos: TURNOS_PERMANENTE };
            pj.calcularCaracteristicas();
            const antes = pj.vida;
            pj.vida = Math.min(pj.vida, pj.vidaMax);
            resumen.push(`PV máximos −${cantidad}: ahora ${pj.vidaMax}`);
            if (pj.vida !== antes) resumen.push(`PV: ${antes} → ${pj.vida}`);
            rompeSigilo = true;
            break;
        }
        case "hemorragia": {
            const actual = Number(pj.estados.hemorragia?.valor) || 0;
            const total = actual + cantidad;
            pj.estados.hemorragia = { ...pj.estados.hemorragia, valor: total, turnos: TURNOS_PERMANENTE };
            const sangrado = dannoHemorragia(total, pj.aguante);
            resumen.push(sangrado > 0
                ? `Hemorragia ${total} (Aguante ${pj.aguante}): −${sangrado} PV cada turno`
                : `Hemorragia ${total}: sin efecto hasta llegar al Aguante (${pj.aguante})`);
            break;
        }
        default:
            return [`Tipo de daño desconocido: ${tipo}`];
    }

    if (rompeSigilo && pj.enSigilo) {
        salirDeSigilo(pj);
        resumen.push("Pierdes el sigilo");
    }

    pj.calcularCaracteristicas();
    return resumen;
}
