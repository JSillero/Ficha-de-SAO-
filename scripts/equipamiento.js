import Modificador, { cargarModificador } from "./modificador.js";

/**
 * Armas y escudos que se equipan en las manos (06-equipo-y-objetos.md §2).
 * - caracteristica: la que se suma al ataque; "mejor" = la más alta entre Reflejos y Fortaleza.
 * - dado: 0 bajo (desventaja), 1 medio (normal), 2 alto (ventaja).
 * - manos: 2 ocupa las dos manos y gasta las acciones de ambos brazos.
 */
export const ARMAS = {
    cuchillo: { etiqueta: "Cuchillo", manos: 1, caracteristica: "reflejos", dado: 1 },
    espada: { etiqueta: "Espada", manos: 1, caracteristica: "mejor", dado: 1 },
    estoque: { etiqueta: "Estoque", manos: 1, caracteristica: "reflejos", dado: 2 },
    maza: { etiqueta: "Maza", manos: 1, caracteristica: "fortaleza", dado: 0 },
    lanza: { etiqueta: "Lanza", manos: 2, caracteristica: "reflejos", dado: 1 },
    espadon: { etiqueta: "Espadón", manos: 2, caracteristica: "fortaleza", dado: 1 },
    martillo_guerra: { etiqueta: "Martillo de guerra", manos: 2, caracteristica: "fortaleza", dado: 0 },
    hacha: { etiqueta: "Hacha", manos: 2, caracteristica: "fortaleza", dado: 0 },
    escudo: { etiqueta: "Escudo", manos: 1, escudo: true },
    gran_escudo: { etiqueta: "Gran escudo", manos: 2, escudo: true },
    // Herramientas: el manual no dice qué característica usan; se toma la más alta
    otros: { etiqueta: "Otros", manos: 1, caracteristica: "mejor", dado: 1 }
};

/* Elementos (claves de TIPOS_DANNO en estados.js): resistencias de la armadura y daño elemental de las armas */
export const ELEMENTOS = ["fuego", "electricidad", "hielo", "luz", "oscuridad"];

/** Un valor por elemento, normalizado: { fuego: n, ... } con enteros >= 0 (resistencias y daño elemental) */
export function cargarValoresElementales(datos) {
    return Object.fromEntries(ELEMENTOS.map(elemento =>
        [elemento, Math.max(0, Math.floor(Number(datos?.[elemento]) || 0))]));
}

export const TIPOS_DOS_MANOS =Object.keys(ARMAS).filter(tipo => ARMAS[tipo].manos === 2);
export const TIPOS_ESCUDO = Object.keys(ARMAS).filter(tipo => ARMAS[tipo].escudo);

export default class Equipamiento {

    /**
     * 
     * @param {Stringn} nombre 
     * @param {Stringn} descripcion 
     * @param {Array[Modifcador]} modificadores 
     * @param {Enum} tipo denota si es arma, armadura u accesorio ['Arma','Ligera','Media','Pesada','Escudo','Accesorio']
     */
    constructor(nombre = "", descripcion = "", tipo = "", danno = 0, penalizacionAtletismo = 0, armadura = 0) {
        this.nombre = nombre;
        this.descripcion = descripcion;
        this.modificadores = [];
        this.tipo = this.setTipo(tipo);
        this.danno = Number(danno) || 0;
        this.penalizacionAtletismo = Number(penalizacionAtletismo) || 0;
        this.armadura = Number(armadura) || 0;
        // Armadura elemental: resta el daño de cada elemento como la armadura resta el físico
        this.resistencias = cargarValoresElementales();
        // Daño elemental del arma: se suma a cada ataque, aparte del físico (lo reducen las resistencias del objetivo)
        this.dannoElemental = cargarValoresElementales();
        this.defensa = 0; // defensa que aporta un escudo mientras está en uso
        this.enUso = false; // true cuando el escudo se ha activado con el botón Usar
        this.pocionAplicada = null; // poción untada en el arma: se aplica en el siguiente ataque
        this.reliquia = tipo === TIPO_RELIQUIA ? { habilidades: [] } : null; // { habilidades } si es reliquia (reliquias.js)
    }

    esEscudo() {
        return this.tipo === "escudo" || this.tipo === "gran_escudo";
    }

    setTipo(tipo) {
        const tipoStr = (tipo || "").toString().toLowerCase().trim();
        const arrayTiposValidos = [
            "",
            "ninguno",
            // Armas
            "cuchillo",
            "espada",
            "estoque",
            "maza",
            "lanza",
            "espadon",
            "martillo_guerra",
            "hacha",
            "escudo",
            "gran_escudo",
            "otros",
            // Armaduras
            "pesada",
            "media",
            "ligera",
            "ropa",
            "real",
            // Reliquia que no es arma (ranura propia)
            "reliquia",
            // Legados
            "arma",
            "accesorio"
        ];

        if (tipoStr !== "" && !arrayTiposValidos.includes(tipoStr)) {
            console.warn("Tipo no estándar asignado a equipamiento:", tipo);
        }
        this.tipo = tipoStr;
        return this.tipo;
    }

    toJSONString() {
        let array = [];
        this.modificadores.forEach((mod) => {
            array.push(new Modificador(mod.nombre, mod.modificado, mod.numero, mod.turnos));
        });

        return JSON.stringify({
            nombre: this.nombre,
            descripcion: this.descripcion,
            modificadores: array,
            tipo: this.tipo,
            danno: this.danno,
            penalizacionAtletismo: this.penalizacionAtletismo,
            armadura: this.armadura,
            resistencias: this.resistencias,
            dannoElemental: this.dannoElemental,
            defensa: this.defensa,
            enUso: this.enUso,
            pocionAplicada: this.pocionAplicada,
            reliquia: this.reliquia
        });
    }
}

/* Tipos de armadura y de accesorio (el resto de tipos de equipo son los de ARMAS) */
export const TIPOS_ARMADURA = ["pesada", "media", "ligera", "ropa", "real"];
export const TIPO_ACCESORIO = "accesorio";
/* Reliquia que no es arma: se lleva en una mano (como un arma de una mano, pero sin ataque).
   Un arma también puede ser reliquia (campo reliquia). */
export const TIPO_RELIQUIA = "reliquia";

/** Habilidad de reliquia normalizada */
export function cargarHabilidadReliquia(datos = {}) {
    const enfriamiento = Math.max(0, Math.floor(Number(datos.enfriamiento) || 0));
    return {
        nombre: String(datos.nombre ?? ""),
        descripcion: String(datos.descripcion ?? ""),
        enfriamiento,
        // Turnos que faltan para poder volver a usarla (0 = lista)
        restante: Math.min(enfriamiento, Math.max(0, Math.floor(Number(datos.restante) || 0)))
    };
}

/** Parte "reliquia" de un equipo guardado: null si no es reliquia */
export function cargarReliquia(datos) {
    if (!datos || typeof datos !== "object") return null;
    const habilidades = Array.isArray(datos.habilidades) ? datos.habilidades.map(cargarHabilidadReliquia) : [];
    return { habilidades };
}

/* Reconstruye un equipamiento guardado (modificadores incluidos) */
export function cargarEquipamiento(datos) {
    const equipo = Object.assign(new Equipamiento(), datos || {});
    equipo.modificadores = Array.isArray(equipo.modificadores)
        ? equipo.modificadores.map(cargarModificador)
        : [];
    if (!equipo.pocionAplicada || typeof equipo.pocionAplicada !== "object") equipo.pocionAplicada = null;
    // Fichas antiguas: todo a 0
    equipo.resistencias = cargarValoresElementales(equipo.resistencias);
    equipo.dannoElemental = cargarValoresElementales(equipo.dannoElemental);
    // Una reliquia sin arma siempre tiene su lista de habilidades
    equipo.reliquia = cargarReliquia(equipo.reliquia) ?? (equipo.tipo === TIPO_RELIQUIA ? { habilidades: [] } : null);
    return equipo;
}