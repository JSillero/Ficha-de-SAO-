// scripts/embriaguez.js
// Embriaguez: el +3 Carisma / −1 al resto (por punto de potencia) lo aplica PJ.getModificadorEstados. Aquí está la probabilidad
// de que una acción salga mal por ir borracho y los mensajes de lo que hace en su lugar.
// No toca el DOM: la interfaz llama a tirarFalloEmbriaguez antes de cada acción y muestra el mensaje.

import { HABILIDADES_EMBRIAGUEZ } from "./PJ.js";

/* Probabilidad de fallar cualquier acción por cada punto que una habilidad esté por debajo de 0 */
export const PROBABILIDAD_FALLO_POR_PUNTO = 0.1;

const ETIQUETAS_HABILIDAD = {
    atletismo: "Atletismo", combate: "Combate", percepcion: "Percepción", subterfugio: "Sigilo",
    cultura: "Cultura", profesion: "Profesión"
};

export function estaEmbriagado(pj) {
    return (Number(pj.estados?.embriaguez?.valor) || 0) > 0;
}

/* Valor de la habilidad con modificadores y armadura, sin el mínimo de 0 que getGenerico aplica al Atletismo */
function valorSinMinimo(pj, habilidad) {
    const armadura = habilidad === "atletismo" ? Number(pj.equipoArmadura?.penalizacionAtletismo) || 0 : 0;
    return (Number(pj[habilidad]) || 0) + (Number(pj.getModificador(habilidad)) || 0) - armadura;
}

/** Habilidades que están por debajo de 0 estando embriagado, con su valor: [{ habilidad, valor }]
 *  (vacío si no está embriagado) */
export function habilidadesBajoCero(pj) {
    if (!estaEmbriagado(pj)) return [];
    return HABILIDADES_EMBRIAGUEZ
        .map(habilidad => ({ habilidad, valor: valorSinMinimo(pj, habilidad) }))
        .filter(({ valor }) => valor < 0);
}

/** Probabilidad (0–1) de que la siguiente acción salga mal: 10 % por cada punto bajo 0
 *  (Atletismo −2 y Cultura −1 → 30 %) */
export function probabilidadFalloEmbriaguez(pj) {
    const puntos = habilidadesBajoCero(pj).reduce((suma, { valor }) => suma - valor, 0);
    return Math.min(1, puntos * PROBABILIDAD_FALLO_POR_PUNTO);
}

/* Cosas absurdas que hace un borracho en Aincrad en lugar de lo que quería hacer, por tipo de acción.
   "general": tiradas de habilidad o característica, reliquias y todo lo que no tenga apartado propio. */
export const MENSAJES_BORRACHO = {
    arte: [
        "Empieza la postura del arte, el arma se ilumina... y se le olvida qué venía después. La luz se apaga sola.",
        "Hace la postura de un arte con muchísima convicción, pero no es ninguna de las que tiene equipadas.",
        "Lanza el arte perfectamente, solo que hacia el lado contrario y contra una pared.",
        "Grita el nombre del arte tan alto y tan mal pronunciado que el sistema no lo reconoce.",
        "Encadena el arte con un giro de más, da una vuelta completa y acaba mirando al grupo.",
        "Carga el arte, se distrae con lo bonito que brilla el arma y deja que se disipe.",
        "Abre el menú de artes para elegirla y se pone a reordenarlas por colores.",
        "Activa el arte, el sistema le arrastra en el movimiento y le deja tumbado boca arriba.",
        "Se pone a explicar a todos cómo funciona el arte en lugar de usarla.",
        "Inicia el arte y se queda congelado en el retraso posterior sin haber golpeado nada."
    ],
    sigilo: [
        "Se agacha para esconderse y le da un ataque de risa porque «nadie le ve».",
        "Se esconde detrás de un arbusto la mitad de grande que él y saluda a los que pasan.",
        "Avanza de puntillas mientras tararea una canción de misión a todo volumen.",
        "Se tapa los ojos con las manos, convencido de que así no le ven.",
        "Intenta moverse en silencio y le da un hipo cada dos pasos.",
        "Se esconde dentro de un barril vacío y lo hace rodar cuesta abajo sin querer.",
        "Se pone a susurrar «shhh» a los enemigos para que no hagan ruido.",
        "Se agacha, pierde el equilibrio y se cae encima de una armadura vieja con un estruendo.",
        "Se pega a la pared como una sombra... y se queda dormido apoyado en ella.",
        "Se esconde detrás de un NPC que se aparta educadamente a los dos segundos."
    ],
    equipo: [
        "Abre el inventario para cambiar de equipo y se pone el casco al revés.",
        "Intenta desenvainar el arma y saca una baguette que no sabía que llevaba.",
        "Se pone la armadura sobre la capa en vez de debajo y no puede mover los brazos.",
        "Arrastra el arma a la ranura de los anillos y se queda mirando por qué no cabe.",
        "Guarda la espada en la funda, falla, y la espada se queda clavada en el suelo.",
        "Se queda atascado en la ventana de confirmación pulsando «No» con mucha seguridad.",
        "Intenta equiparse las botas en las manos y lo defiende con argumentos.",
        "Se quita el equipo para cambiarlo y se queda en ropa interior delante de todos.",
        "Ordena el inventario por nombre, luego por peso, luego por nombre otra vez...",
        "Se pone tres anillos en el mismo dedo y declara que es la nueva moda de la Ciudad del Inicio."
    ],
    objeto: [
        "Intenta beberse la poción sin destaparla y le da mordiscos al cristal.",
        "Abre el menú para usar el objeto y acaba mandándole una solicitud de amistad a un jabalí.",
        "Vuelca el contenido entero sobre sus botas y se queda mirando cómo brillan.",
        "Brinda con la poción, la choca con demasiada fuerza y se le cae al suelo.",
        "Se equivoca de objeto y se come un cristal de teletransporte. No pasa nada, por suerte.",
        "Intenta compartir el objeto con su propio reflejo en un charco.",
        "Se lo guarda de nuevo en el inventario «para luego, que ahora no tengo sed».",
        "Le pregunta al objeto si está seguro de querer ser usado. El objeto no contesta.",
        "Lo lanza al aire para cogerlo con estilo y se queda mirando cómo se aleja.",
        "Huele el contenido, dice que «este no es mi vino» y se pide otro al tabernero."
    ],
    ataque: [
        "Le da tantas vueltas al arma para lucirse que se marea y se sienta en el suelo.",
        "Ataca con muchísima fuerza a un enemigo que en realidad es una farola.",
        "Lanza el golpe, se le resbala el arma de la mano y sale volando hacia el horizonte.",
        "Ataca al aire tres veces gritando «¡crítico!» y no hay nadie delante.",
        "Se le olvida contra quién estaba peleando y le pide disculpas al monstruo.",
        "Levanta el escudo con decisión y se lo pone delante de la cara al revés.",
        "Coge carrerilla para cargar, tropieza con su propia capa y rueda tres casillas con gran dignidad.",
        "Golpea el suelo con el arma para impresionar y se queda temblando del rebote.",
        "Le pone nombre al arma en voz alta y le pide perdón por todas las veces que la ha guardado sucia.",
        "Apunta al enemigo de la izquierda; el golpe va al de la derecha; no había ninguno."
    ],
    movimiento: [
        "Echa a andar con decisión y acaba dando vueltas alrededor de la misma piedra.",
        "Abre el mapa para orientarse, lo pone del revés y se va hacia el lado contrario.",
        "Sale disparado hacia delante y se estampa contra la barrera invisible del borde de la zona.",
        "Se pone a seguir a un NPC que patrulla porque «parecía saber adónde iba».",
        "Arranca a correr, se le enreda la capa en las piernas y se queda tirado en la hierba.",
        "Intenta saltar un riachuelo de un palmo y aterriza de cara justo en medio.",
        "Se para en seco a contemplar el techo del piso de arriba y se pone muy filosófico.",
        "Camina convencido hasta la puerta de la taberna de la que acaba de salir.",
        "Corre en círculos gritando que está haciendo el entrenamiento de Atletismo.",
        "Da dos pasos y se pone a perseguir una mariposa porque «tiene una textura muy bonita»."
    ],
    general: [
        "Le grita a Kayaba al cielo que quiere hablar con el encargado.",
        "Le declara su amor eterno al NPC tabernero, que responde: «¿Desea algo más?».",
        "Empieza a cantar la canción de la intro del juego a pleno pulmón. Nadie se la sabe.",
        "Intenta desconectarse del juego por costumbre. Sigue sin haber botón de logout.",
        "Le pide al Cardinal System un taxi de vuelta a la Ciudad del Inicio.",
        "Se pone a regatear con una slime el precio de su propia gelatina.",
        "Se queda mirando su barra de vida convencido de que se mueve sola. Se mueve sola.",
        "Llama «Kirito» a todo el que lleve ropa negra, incluido un murciélago.",
        "Intenta trepar a la torre del siguiente piso «para ahorrarse el jefe».",
        "Se le escapa un hipo tan fuerte que activa el aviso de acoso del sistema."
    ]
};

/**
 * Tira si la acción falla por la embriaguez.
 * @param {string} categoria apartado de MENSAJES_BORRACHO (si no existe, "general")
 * @returns {null | { mensaje: string, probabilidad: number, habilidades: string[] }} null si no falla
 */
export function tirarFalloEmbriaguez(pj, categoria = "general", azar = Math.random) {
    const probabilidad = probabilidadFalloEmbriaguez(pj);
    if (probabilidad <= 0 || azar() >= probabilidad) return null;
    const mensajes = MENSAJES_BORRACHO[categoria] ?? MENSAJES_BORRACHO.general;
    const mensaje = mensajes[Math.floor(azar() * mensajes.length)] ?? mensajes[0];
    // "Atletismo −2" (el signo menos tipográfico, como en el resto de la ficha)
    const habilidades = habilidadesBajoCero(pj)
        .map(({ habilidad, valor }) => `${ETIQUETAS_HABILIDAD[habilidad] ?? habilidad} −${-valor}`);
    return { mensaje, probabilidad, habilidades };
}
