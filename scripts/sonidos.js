// scripts/sonidos.js
// Sonidos de la ficha. Todo pasa por aquí para que el botón de silencio afecte a todos.

/* Nombre → fichero en sfx/. Los que aún no se usan quedan listos para más adelante. */
const SONIDOS = {
    click: "./sfx/click.mp3",           // subir o bajar habilidades
    menuAbrir: "./sfx/menu_open.mp3",   // abrir una ventana (modal)
    menuCerrar: "./sfx/menu_exit.mp3",  // cerrar una ventana (modal)
    linkStart: "./sfx/link_start.mp3",  // cargar una ficha
    vidaBaja: "./sfx/low_life.wav",     // en bucle con la vida por debajo del 15 %
    cristal: "./sfx/cristal.mp3",
    muerte: "./sfx/dead.mp3",
    mensaje: "./sfx/message.mp3",
    teletransporte: "./sfx/tp.mp3"
};

const CLAVE_SILENCIO = "fichaSAO.silencio";
const audios = {};
const buclesActivos = new Set();

let silenciado = false;
// Recordar el silencio es solo una comodidad: si el navegador no deja guardar, empieza con sonido
try { silenciado = localStorage.getItem(CLAVE_SILENCIO) === "1"; } catch { /* sin almacenamiento */ }

function obtenerAudio(nombre) {
    if (!SONIDOS[nombre]) {
        console.warn("Sonido desconocido:", nombre);
        return null;
    }
    if (!audios[nombre]) {
        audios[nombre] = new Audio(SONIDOS[nombre]);
        audios[nombre].preload = "auto";
    }
    return audios[nombre];
}

/* Precarga los sonidos cortos para que no haya retraso en el primer clic */
export function precargarSonidos() {
    ["click", "menuAbrir", "menuCerrar"].forEach(obtenerAudio);
}

function intentarReproducir(audio) {
    audio.play().catch(e => console.warn("El navegador bloqueó el audio (hace falta interactuar con la página antes).", e));
}

/** Reproduce un sonido una vez. Si ya está sonando (clics rápidos), lanza una copia superpuesta. */
export function reproducir(nombre) {
    if (silenciado) return;
    const base = obtenerAudio(nombre);
    if (!base) return;
    const audio = base.paused ? base : base.cloneNode();
    audio.currentTime = 0;
    intentarReproducir(audio);
}

/** Empieza un sonido en bucle (p. ej. vida baja). Se recuerda aunque esté silenciado. */
export function iniciarBucle(nombre) {
    const audio = obtenerAudio(nombre);
    if (!audio) return;
    audio.loop = true;
    buclesActivos.add(nombre);
    if (!silenciado && audio.paused) intentarReproducir(audio);
}

export function pararBucle(nombre) {
    buclesActivos.delete(nombre);
    const audio = audios[nombre];
    if (audio && !audio.paused) audio.pause();
}

export function estaSilenciado() {
    return silenciado;
}

/** Silencia o reactiva todos los sonidos; los bucles activos se pausan y se reanudan. */
export function setSilenciado(valor) {
    silenciado = Boolean(valor);
    try { localStorage.setItem(CLAVE_SILENCIO, silenciado ? "1" : "0"); } catch { /* sin almacenamiento */ }
    buclesActivos.forEach(nombre => {
        const audio = audios[nombre];
        if (!audio) return;
        if (silenciado) audio.pause();
        else if (audio.paused) intentarReproducir(audio);
    });
}
