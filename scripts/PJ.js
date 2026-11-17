import Equipamiento from "./equipamiento.js";
import Modificador, { TURNOS_PERMANENTE, cargarModificador } from "./modificador.js";
import { TAMANO_INVENTARIO, crearInventarioVacio, ajustarInventario, cargarObjeto, cargarBaul, cargarObjetosClave, cargarArmasLanzadas, cargarEquipo } from "./objetos.js";
import { ZONAS, ZONA_POR_DEFECTO } from "./zonas.js";
import { cargarArtes, modificadorArtes } from "./artes.js";
import { modificadorEfectosEquipo } from "./efectosEquipo.js";
import { cargarDiario } from "./diario.js";
import { cargarTrueque } from "./trueque.js";
import { cargarCreacion } from "./creacion.js";
import { crearNpc, cargarNpc, equiposDePartes, DEFENSA_MINIMA_NPC, defensaParalisisNpc, limpiarPesadilla } from "./npc.js";
import { guardarFaseActiva, convertirEnJefe } from "./jefes.js";
import { energiaVacia, cargarEnergiaManos, cargarHechizo, cargarAmbiente } from "./elementosSacro.js";

export { TAMANO_INVENTARIO };

export const HABILIDADES_LISTA = [
    'atletismo', 'combate', 'percepcion', 'subterfugio',
    'comunicacion', 'cultura', 'profesion', 'sacro'
];

/* Embriaguez: por cada punto de potencia, +3 Carisma y −1 al resto de habilidades mientras está activa.
   Sacro no cuenta: es especial, casi todos lo tienen a 0 y no se usa en tiradas. */
export const EMBRIAGUEZ_CARISMA = 3;
export const EMBRIAGUEZ_RESTO = -1;
/* Habilidades del Underworld (perfil, solo las ve el propio personaje): mientras están habilitadas suben el mínimo
   de la habilidad normal sin gastar puntos (en la ficha se ve la suma: Underworld + puntos invertidos). El total no
   pasa del máximo por nivel: los puntos invertidos que sobren quedan sin asignar (ajustarHabilidadesUnderworld).
   Pericia = Sigilo, Sentidos = Percepción. */
export const HABILIDADES_UNDERWORLD = {
    combate: { etiqueta: "Combate", max: 10 },
    atletismo: { etiqueta: "Atletismo", max: 10 },
    subterfugio: { etiqueta: "Pericia", max: 5 },
    sacro: { etiqueta: "Sacro", max: 10 },
    percepcion: { etiqueta: "Sentidos", max: 5 },
    cultura: { etiqueta: "Cultura", max: 5 }
};
const crearHabilidadesUnderworld = () => Object.fromEntries(Object.keys(HABILIDADES_UNDERWORLD).map(hab => [hab, 0]));
/* Valor válido de una habilidad del Underworld (entero entre 0 y su máximo) */
export function valorHabilidadUnderworld(hab, valor) {
    const max = HABILIDADES_UNDERWORLD[hab]?.max ?? 0;
    return Math.min(max, Math.max(0, Math.trunc(Number(valor) || 0)));
}

export const HABILIDADES_EMBRIAGUEZ = HABILIDADES_LISTA.filter(hab => hab !== 'comunicacion' && hab !== 'sacro');

/* Estados alterados. Cada uno es { valor, turnos }; turnos = TURNOS_PERMANENTE (-1) es permanente.
   - Los que controla la ficha usan valor como cantidad: PV por turno (veneno, regeneración),
     Combate restado (quemadura), escarcha acumulada (congelacion), PV máx. reducidos (oscuridad),
     sangrado acumulado (hemorragia).
   - Los manuales (aturdido, cegado, dormido, wither, embriaguez) están activos con valor > 0. */
export const ESTADOS_LISTA = [
    'veneno', 'regeneracion', 'quemadura', 'paralisis', 'congelacion', 'oscuridad', 'hemorragia',
    'aturdido', 'cegado', 'dormido', 'wither', 'embriaguez',
    'electrocutado', // Atletismo restado por electricidad
    'deslumbrado',   // Percepción restada por luz con los PV al máximo
    'anticuracion'   // Humo de Morna (13-sacro.md §8): nada cura mientras dura (noSeCura en estados.js)
];

/* Campos que se guardan y se cargan tal cual (sin conversión) */
const CAMPOS_SIMPLES = [
    'idPersonaje', 'nombre', 'nivel', 'experiencia',
    'fortaleza', 'reflejos', 'voluntad', 'inteligencia',
    ...HABILIDADES_LISTA,
    'puntosArte', 'vida',
    'numeroAcciones', 'izquierda', 'derecha', 'cabeza', 'pies', 'reaccionGuardada',
    'enSigilo', 'valorSigilo',
    'comidaActiva', 'tipoProfesion', 'esUnderworld', 'protagonista', 'zona', 'cor', 'puntosEgo', 'nombreReal',
    'esNpc', 'esJefe', 'esPesadilla', 'permitirTrueque', 'neutral', 'notoriedad', 'alertaSistema', 'idPlantilla', 'underworldHabilitado', 'habilidadesUnderworld', 'alertaSistemaBotin',
    'desbloqueosArteExtra', 'desbloqueosArteGastados',
    'notas', 'listadoArtes', 'notasBaul', 'listaDeAmigos', 'recetasProfesion', 'comportamientoCombate'
];

/* Identificador estable del personaje (no cambia al renombrarlo): lo usan el modo máster y la sala */
export function nuevoIdPersonaje() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `pj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function crearEstadosVacios() {
    return Object.fromEntries(ESTADOS_LISTA.map(estado => [estado, { valor: 0, turnos: 0 }]));
}

export default class PJ {
    constructor() {
        /* caracteristicas base */
        this.idPersonaje = nuevoIdPersonaje(); // las fichas antiguas reciben uno nuevo al cargar
        this.nombre = "nombre"; //String
        this.nivel = 15;
        this.experiencia = 0;
        this.experienciaMax = 1600;

        /* Caracteristicas */
        this.fortaleza = 4;
        this.reflejos = 4;
        this.voluntad = 4;
        this.inteligencia = 4;

        /* Habilidades */
        this.atletismo = 0;
        this.combate = 0;
        this.percepcion = 0;
        this.subterfugio = 0;
        this.comunicacion = 0;
        this.cultura = 0;
        this.profesion = 0;
        this.tipoProfesion = "herrero"; // oficio: herrero, armero, cocinero o alquimista
        this.sacro = 0;
        this.esUnderworld = false; // perfil: habilita Sacro, daño mágico y habilidades oníricas
        this.protagonista = false; // perfil: tiene diario y puntos de ego
        /* Habilidades del Underworld (HABILIDADES_UNDERWORLD): solo con esUnderworld y habilitadas */
        this.underworldHabilitado = false;
        this.habilidadesUnderworld = crearHabilidadesUnderworld();

        /* NPC del máster (npc.js): sin características ni habilidades; valores de combate a mano en npc.
           Se decide al crearlo y no cambia. idPlantilla: plantilla del compendio de la que salió (o null). */
        this.esNpc = false;
        this.esJefe = false; // NPC con fases (jefes.js)
        this.esPesadilla = false; // NPC pesadilla (npc.js, esPesadilla): sin PA, recompensa ni curación
        this.idPlantilla = null;
        this.npc = crearNpc();

        /*Atributos  */
        this.puntosArteMax = 3;
        this.puntosArte = 0;
        this.vidaMax = 1;
        this.vida = 1;
        this.aguante = 1;
        this.armadura = 1;
        this.defensa = 1;
        this.dFisico = 1;
        this.dDistancia = 1;
        this.dMagico = 1;
        this.iniciativa = 1;

        /* Estados (ver ESTADOS_LISTA) */
        this.estados = crearEstadosVacios();

        /* Acciones: true = disponible este turno */
        this.numeroAcciones = 3;
        this.izquierda = true; //Boolean
        this.derecha = true; //Boolean
        this.cabeza = true; //Boolean
        this.pies = true; //Boolean
        this.reaccionGuardada = false; // se ha reservado una acción como reacción

        /* Sigilo */
        this.enSigilo = false;
        this.valorSigilo = 0; // resultado de la tirada al entrar en sigilo

        /* Inventario: huecos fijos con un objeto (ver objetos.js) o null. Baúl: lista sin límite. */
        this.inventario = crearInventarioVacio();
        this.baul = [];
        this.objetosClave = []; // [{ nombre, descripcion }]: no ocupan hueco ni se usan
        this.armasLanzadas = []; // [{ mano, equipo }]: lanzas y cuchillos lanzados sin recoger (objetos.js)
        this.botin = []; // objetos de la recompensa de un NPC por recoger (ventana de botín; sin límite)
        this.trueque = null; // trueque en curso con lo apartado (trueque.js)
        this.creacion = null; // objeto pedido al máster con los materiales apartados (creacion.js)
        this.ambienteSacro = []; // lo que el máster dice que hay en el ambiente para el próximo hechizo (13-sacro.md §3.2)
        this.hechizo = null; // petición de magia enviada al máster, esperando (elementosSacro.js, interfazSacro.js)
        this.energiaManos = energiaVacia(); // energía de Sacro guardada en cada mano (elementosSacro.js, 13-sacro.md §7)
        this.ultimoGolpe = null; // { instancia, jugador, nombre } de quien dio el último golpe (desde un pop-up), o null
        this.permitirTrueque = false; // NPC: puede hacer trueques (los personajes siempre pueden)
        this.neutral = false; // NPC neutral (franja amarilla) hasta que un jugador lo golpea
        this.notoriedad = 0; // puntos por dañar o matar a otros jugadores (franja verde con 0, naranja con más)
        this.alertaSistema = 0; // contador oculto: matar con las habilidades del Underworld activadas (solo lo ve el máster)
        this.alertaSistemaBotin = false; // el botín viene de un NPC matado con las habilidades del Underworld habilitadas
        this.comidaActiva = ""; // nombre de la comida cuyo efecto está activo (sus modificadores llevan origen "comida")
        this.cor = 0; // monedas: no ocupan hueco, sin límite, nunca negativas
        this.puntosEgo = 0; // contador del perfil (solo lo ve el propio personaje), nunca negativo
        this.nombreReal = ""; // del perfil; no va en la ficha resumida (solo lo ve el propio personaje)

        /* Zona actual (claves de ZONAS en zonas.js): "noSegura", "segura" o "base" */
        this.zona = ZONA_POR_DEFECTO;

        /* Array de modificaciones */
        this.modificadores;

        /* Equipamiento */
        this.equipoArmadura = new Equipamiento("", "", "");
        this.manoIzquierda = new Equipamiento("", "", "");
        this.manoDerecha = new Equipamiento("", "", "");
        this.accesorios = [];

        this.espaciosArte = 0;
        this.vMovimiento = 3;

        /* Artes (formato de data/artes.schema.json; lógica en artes.js): equipadas y sin equipar */
        this.artes = [];
        // Desbloqueos de arte (artes.js): disponibles = naturales por nivel + extra − gastados
        this.desbloqueosArteExtra = 0;    // sumados o quitados a mano (otras fuentes)
        this.desbloqueosArteGastados = 0; // gastados en conseguir artes

        /* Bloques de texto */
        this.notas = ""; /* String, como todos */
        this.listadoArtes = "";
        this.notasBaul = ""; // notas libres de la ventana del baúl
        this.listaDeAmigos = ""; // notas antiguas de amigos: ya no se muestran, se conservan
        this.recetasProfesion = ""; // se muestra como "Perfil psicológico" (el nombre del campo se conserva)
        this.comportamientoCombate = ""; // solo NPC: cómo se comporta en combate (debajo de Acciones)

        /* Diario del protagonista (diario.js): una cadena HTML saneada por página, al menos una */
        this.diario = [""];

        /* Amigos (sistema social online): [{ jugador (uid), nombre (del personaje) }], mutuos */
        this.amigos = [];

        /* Modificadores */
        this.modificadores = [new Modificador("nombre", "atletismo", 0, TURNOS_PERMANENTE)];

        // Los derivados salen siempre de calcularCaracteristicas(); se empieza con la vida llena
        this.calcularCaracteristicas();
        this.vida = this.vidaMax;
    }

    /* Setters */
    setExp(experiencia) {
        if (typeof (experiencia) != 'number') {
            throw TypeError("El valor de experiencia tiene que ser numerico.")
        }
        this.experiencia = experiencia;
        if (this.esNpc) return; // los NPC no suben de nivel con EXP: el nivel se escribe a mano

        while(this.experiencia >= this.experienciaMax && this.nivel <= 150) {
            this.experiencia = this.experiencia - this.experienciaMax;
            this.nivel = this.nivel + 1;
            this.calcularCaracteristicas();
        }

    }

    calcularCaracteristicas() {
        if (this.esNpc) return this.calcularNpc();
        this.ajustarHabilidadesUnderworld();
        let nivelSiguiente = this.nivel + 1;
        if (this.nivel >= 150) {
            this.experienciaMax = 99999999999999999;
        } else if (this.nivel >= 60) {
            this.experienciaMax = nivelSiguiente * 1500;
        } else {
            this.experienciaMax = nivelSiguiente * 100;
        }

        this.puntosArteMax = 3 + (this.nivel > 30 ? Math.floor((this.nivel - 16) / 15) : 0) + this.getModificador("arte");
        // Sin memoria de artes hasta el nivel 16
        this.espaciosArte = (this.nivel >= 16 ? 4 + Math.floor(this.getBaseHabilidad("cultura") / 10) : 0) + this.getModificador("espacios");
        this.aguante = this.fortaleza + (this.voluntad / 2) + this.getModificador("aguante");;
        // La oscuridad resta PV máximos hasta un descanso largo. Los PV son enteros aunque el Aguante tenga ,5
        this.vidaMax = Math.floor(this.aguante * (Math.floor((this.nivel - 1) / 5) + 1)) + this.getModificador("vidaMax")
            - (Number(this.estados?.oscuridad?.valor) || 0);
        this.armadura = (Number(this.equipoArmadura?.armadura) || 0) + this.getModificador("armadura");
        this.defensa = (5 + this.reflejos) + this.getGenerico("atletismo") + this.getModificador("defensa") + this.getDefensaEscudos();
        // Los bonificadores de daño son los únicos valores que se redondean hacia abajo
        // En sigilo, los ataques usan Sigilo en lugar de Combate (también para el bonificador)
        const habilidadAtaque = this.getGenerico(this.getHabilidadAtaque());
        this.dFisico = Math.floor((habilidadAtaque + this.fortaleza) / 4) + this.getModificador("dFisico");
        this.dDistancia = Math.floor(habilidadAtaque / 4) + this.getModificador("dDistancia");
        // El daño mágico solo existe para los personajes del Underworld
        this.dMagico = this.esUnderworld
            ? Math.floor((this.getGenerico("sacro") + this.inteligencia) / 4) + this.getModificador("dMagico")
            : 0;
        this.iniciativa = (this.reflejos + this.inteligencia / 2) + this.getModificador("iniciativa");;
        this.vMovimiento = 3 + Math.floor(this.getGenerico("atletismo") / 5) + this.getModificador("vMovimiento");;
        // Las tiradas para manipular tus emociones deben igualar o superar la Perspicacia
        this.perspicacia = this.voluntad + this.getGenerico("cultura") + 5 + this.getModificador("perspicacia");
        // Detectar trampas, objetos y enemigos en sigilo sin tirar
        this.percepcionPasiva = this.inteligencia + this.getGenerico("percepcion") + 5 + this.getModificador("percepcionPasiva");
    }

    /* NPC: cada valor de combate es el escrito a mano más los modificadores (sin características ni
       habilidades). Las artes no tienen memoria: siempre queda un hueco libre más (artes.js no la limita). */
    calcularNpc() {
        const npc = this.npc;
        this.experienciaMax = 0;
        // Los NPC no tienen artes sin equipar: todas están equipadas
        (this.artes || []).forEach(arte => { arte.equipada = true; });
        // Las pesadillas no tienen PA
        this.puntosArteMax = this.esPesadilla ? 0 : Math.max(0, npc.puntosArteMax + this.getModificador("arte"));
        if (this.esPesadilla) this.puntosArte = 0;
        const usadas = (this.artes || []).filter(arte => arte.equipada && !arte.onirica)
            .reduce((suma, arte) => suma + (Number(arte.ranuras) || 0), 0);
        this.espaciosArte = usadas + 1;
        this.aguante = npc.aguante + this.getModificador("aguante");
        this.vidaMax = Math.max(1, npc.vidaMax + this.getModificador("vidaMax") - (Number(this.estados?.oscuridad?.valor) || 0));
        this.armadura = (Number(this.equipoArmadura?.armadura) || 0) + this.getModificador("armadura");
        // Nunca por debajo de DEFENSA_MINIMA_NPC. El electrocutado la baja solo hasta defensaParalisisNpc
        // (mínimo + penalización de Atletismo de la armadura), donde paraliza
        const electrocutado = -this.getModificadorEstados("defensa");
        const sinElectricidad = Math.max(DEFENSA_MINIMA_NPC, npc.defensa + this.getModificador("defensa") + electrocutado + this.getDefensaEscudos());
        this.defensa = electrocutado > 0
            ? Math.max(Math.min(sinElectricidad, defensaParalisisNpc(this)), sinElectricidad - electrocutado)
            : sinElectricidad;
        this.dFisico = this.getModificador("dFisico");
        this.dDistancia = this.getModificador("dDistancia");
        this.dMagico = this.getModificador("dMagico");
        this.iniciativa = npc.iniciativa + this.getModificador("iniciativa");
        this.vMovimiento = Math.max(0, npc.vMovimiento + this.getModificador("vMovimiento"));
        this.perspicacia = npc.perspicacia + this.getModificador("perspicacia");
        this.percepcionPasiva = npc.percepcionPasiva + this.getModificador("percepcionPasiva");
    }

    /**
     * Introduce el nombre del atributo a obtener y se unen automaticamente los modificadores asociados al nombre 
     * @param {string} atributo 
     */
    /* Suma la defensa de los escudos que están en uso */
    getDefensaEscudos() {
        // En un NPC también cuentan los escudos de sus otras partes (npc.js)
        return [this.manoIzquierda, this.manoDerecha, ...equiposDePartes(this)].reduce((acc, mano) => {
            const esEscudo = mano?.tipo === "escudo" || mano?.tipo === "gran_escudo";
            return acc + (esEscudo && mano.enUso ? Number(mano.defensa) || 0 : 0);
        }, 0);
    }

    /* Daño de un elemento que se resta a cada impacto: la resistencia de la armadura
       más los modificadores "res_<elemento>" (equipo, accesorios...). Nunca negativa. */
    getResistencia(elemento) {
        const deArmadura = Number(this.equipoArmadura?.resistencias?.[elemento]) || 0;
        return Math.max(0, deArmadura + (Number(this.getModificador("res_" + elemento)) || 0));
    }

    /* Debilidad de un NPC a un elemento: multiplicador del daño (0 = ninguna). La de la armadura más los
       modificadores "deb_<elemento>". Los personajes no tienen debilidades. */
    getDebilidad(elemento) {
        if (!this.esNpc) return 0;
        const deArmadura = Number(this.equipoArmadura?.debilidades?.[elemento]) || 0;
        return Math.max(0, deArmadura + (Number(this.getModificador("deb_" + elemento)) || 0));
    }

    /* Habilidad con la que se ataca: Sigilo si está en sigilo, Combate si no */
    getHabilidadAtaque() {
        return this.enSigilo ? "subterfugio" : "combate";
    }

    /* Sacro solo existe para los personajes del Underworld */
    puedeUsarHabilidad(nombreHab) {
        return nombreHab !== 'sacro' || Boolean(this.esUnderworld);
    }

    /* Casilla Underworld del perfil. Al quitarla, Sacro vuelve a 0 (sus puntos quedan libres) */
    setUnderworld(valor) {
        this.esUnderworld = Boolean(valor);
        if (!this.esUnderworld) this.sacro = 0;
        this.calcularCaracteristicas();
    }

    /* ¿Suman ahora las habilidades del Underworld? (casilla Underworld y habilitadas en el perfil) */
    tieneUnderworldActivo() {
        return Boolean(this.esUnderworld && this.underworldHabilitado && !this.esNpc);
    }

    /* Lo que suma la habilidad del Underworld a una habilidad (0 si no está activa) */
    getExtraUnderworld(hab) {
        return this.tieneUnderworldActivo() ? Number(this.habilidadesUnderworld?.[hab]) || 0 : 0;
    }

    /* Valor base de una habilidad: habilidad del Underworld (mínimo gratuito) + puntos invertidos, sin pasar del
       máximo por nivel. Sin modificadores: eso es getGenerico. */
    getBaseHabilidad(hab) {
        const invertido = Number(this[hab]) || 0;
        const extra = this.getExtraUnderworld(hab);
        if (!extra) return invertido;
        return Math.min(Math.max(invertido, this.getMaxHabilidad()), invertido + extra);
    }

    /* Con las habilidades del Underworld activas, lo invertido no puede hacer pasar el total del máximo por nivel:
       lo que sobre vuelve a los puntos sin asignar (al deshabilitarlas no se recupera). */
    ajustarHabilidadesUnderworld() {
        if (!this.tieneUnderworldActivo()) return;
        const max = this.getMaxHabilidad();
        for (const hab of Object.keys(HABILIDADES_UNDERWORLD)) {
            const tope = Math.max(0, max - this.getExtraUnderworld(hab));
            if ((Number(this[hab]) || 0) > tope) this[hab] = tope;
        }
    }

    setHabilidadUnderworld(hab, valor) {
        if (!(hab in HABILIDADES_UNDERWORLD)) return;
        this.habilidadesUnderworld[hab] = valorHabilidadUnderworld(hab, valor);
        this.calcularCaracteristicas();
    }

    setUnderworldHabilitado(valor) {
        this.underworldHabilitado = Boolean(valor);
        this.calcularCaracteristicas();
    }

    getGenerico(atributo) {
        // Sin Underworld, Sacro es 0 (tampoco cuentan sus modificadores)
        if (!this.puedeUsarHabilidad(atributo)) return 0;
        let penalizacion = (atributo === 'atletismo') ? (Number(this.equipoArmadura?.penalizacionAtletismo) || 0) : 0;
        const base = HABILIDADES_LISTA.includes(atributo) ? this.getBaseHabilidad(atributo) : parseInt(this[atributo]);
        const valor = base + parseInt(this.getModificador(atributo)) - penalizacion;
        // El Atletismo efectivo no baja de 0. Combate sí puede (la quemadura sobrante daña PV).
        return atributo === 'atletismo' ? Math.max(0, valor) : valor;
    }

    getPuntosHabilidadTotales() {
        return Math.max(0, 25 + this.nivel);
    }

    getPuntosCaracteristicasTotales() {
        return 18;
    }

    getPuntosCaracteristicasLimite() {
        return 22;
    }

    getPuntosCaracteristicasDisponibles() {
        return this.getPuntosCaracteristicasTotales() - this.getPuntosCaracteristicasGastados();
    }

    getPuntosHabilidadGastados() {
        return this.atletismo + this.combate + this.percepcion + this.subterfugio +
            this.comunicacion + this.cultura + this.profesion + this.sacro;
        //return HABILIDADES_LISTA.reduce((total, hab) => total + (Number(this[hab]) || 0), 0);
    }

    getPuntosCaracteristicasGastados() {
        return this.fortaleza + this.reflejos + this.voluntad + this.inteligencia;
    }

    getPuntosHabilidadDisponibles() {
        return this.getPuntosHabilidadTotales() - this.getPuntosHabilidadGastados();
    }

    getMaxHabilidad() {
        let divisionNivel15 = Math.trunc(this.nivel / 15);
        let residuo = this.nivel % 15;
        if (residuo >= 10) {
            return (divisionNivel15 + 1) * 10;
        } else {
            return divisionNivel15 * 10 + residuo;
        }
    }

    getMaxCaracteristicas() {
        return 9;
    }

    subirHabilidad(nombreHab) {
        if (!this.puedeUsarHabilidad(nombreHab)) return false;
        // Con las habilidades del Underworld el total (invertido + extra) tampoco pasa del máximo
        if (this.getPuntosHabilidadDisponibles() > 0 && this[nombreHab] < this.getMaxHabilidad()
            && this.getBaseHabilidad(nombreHab) < this.getMaxHabilidad()) {
            this[nombreHab]++;
            this.calcularCaracteristicas();
            return true;
        }
        return false;
    }

    bajarHabilidad(nombreHab) {
        if (this[nombreHab] > 0) {
            this[nombreHab]--;
            this.calcularCaracteristicas();
            return true;
        }
        return false;
    }

    /**
     * Devuelve la suma de todos los modificadores de el atributo nombrado. 
     * 
     * @param {string} atributo nombre de alguno de los atributos de PJ 
     * @returns Int de la suma
     */
    getModificador(atributo) {
        let acumulado = 0;
        /* Del array de modificadores del personaje, saca la suma de los valores enteros del nombre del atributo  */
        acumulado += Number(this.modificadores.reduce(function (acc, obj) {
            return acc + ((obj['modificado'] == atributo) ? obj.numero : 0);
        }, 0));

        /* Saca los modificadores del equipamiento */
        [this.manoDerecha, this.manoIzquierda].forEach(mano => {
            acumulado += Number(mano.modificadores.reduce(function (acc, obj) {
                return acc + ((obj['modificado'] == atributo) ? obj.numero : 0);
            }, 0));
        });
        acumulado += Number(this.equipoArmadura.modificadores.reduce(function (acc, obj) {
            return acc + ((obj['modificado'] == atributo) ? obj.numero : 0);
        }, 0));

        // Accesorios y, en un NPC, el equipo de sus partes que no son brazos
        [...this.accesorios, ...equiposDePartes(this)].forEach(accesorio => {
            acumulado += Number(accesorio.modificadores.reduce(function (acc, obj) {
                return acc + ((obj['modificado'] == atributo) ? obj.numero : 0);
            }, 0));
        });

        acumulado += this.getModificadorEstados(atributo);

        // Artes pasivas equipadas que cumplen sus requisitos (los requisitos usan valores base: sin recursión)
        acumulado += modificadorArtes(this, atributo);

        // Efectos pasivos del equipo puesto (efectosEquipo.js)
        acumulado += modificadorEfectosEquipo(this, atributo);

        return acumulado;
    }

    /* Lo que restan los estados a un atributo (una sola vez, no cada turno):
       quemadura → Combate (si queda por debajo de 0, el sobrante daña PV al iniciar turno),
       electrocutado → Atletismo, deslumbrado → Percepción.
       Embriaguez: +3 Carisma y −1 al resto de habilidades (salvo Sacro). */
    getModificadorEstados(atributo) {
        // Un NPC no tiene habilidades: quemadura → acierto, electrocutado → Defensa y Movimiento,
        // deslumbrado → Percepción pasiva
        if (this.esNpc) {
            const estado = { acierto: "quemadura", defensa: "electrocutado", vMovimiento: "electrocutado", percepcionPasiva: "deslumbrado" }[atributo];
            return estado ? -(Number(this.estados?.[estado]?.valor) || 0) : 0;
        }
        const estadoQueResta = { combate: "quemadura", atletismo: "electrocutado", percepcion: "deslumbrado" }[atributo];
        let total = estadoQueResta ? -(Number(this.estados?.[estadoQueResta]?.valor) || 0) : 0;
        // La potencia multiplica el efecto (como cervezas acumuladas)
        const potencia = Math.max(0, Math.trunc(Number(this.estados?.embriaguez?.valor) || 0));
        if (potencia > 0) {
            if (atributo === 'comunicacion') total += EMBRIAGUEZ_CARISMA * potencia;
            else if (HABILIDADES_EMBRIAGUEZ.includes(atributo)) total += EMBRIAGUEZ_RESTO * potencia;
        }
        return total;
    }

    guardarJSON() {
        let hoy = new Date();
        const blob = new Blob([this.toJSONString()], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = this.nombre + hoy.toLocaleDateString() + '.json';
        link.click();
    }

    cargarJSON(jsonObject) {
        // Cualquier campo ausente (fichas antiguas) toma el valor por defecto de un PJ nuevo
        const porDefecto = new PJ();
        for (const campo of CAMPOS_SIMPLES) {
            this[campo] = jsonObject[campo] ?? porDefecto[campo];
            // Las fichas antiguas guardaban "vacio" en los bloques de texto sin rellenar
            if (this[campo] === "vacio") this[campo] = "";
        }
        this.idPersonaje = String(this.idPersonaje || porDefecto.idPersonaje).slice(0, 60);
        if (!ZONAS[this.zona]) this.zona = ZONA_POR_DEFECTO;
        this.permitirTrueque = this.permitirTrueque === true;
        this.neutral = this.neutral === true;
        this.notoriedad = Math.max(0, Math.trunc(Number(this.notoriedad) || 0));
        this.alertaSistema = Math.max(0, Math.trunc(Number(this.alertaSistema) || 0));
        // Fichas anteriores a la casilla Underworld: si tenían Sacro, lo eran
        this.esUnderworld = jsonObject.esUnderworld === undefined ? Number(this.sacro) > 0 : Boolean(this.esUnderworld);
        if (!this.esUnderworld) this.sacro = 0;
        this.protagonista = Boolean(this.protagonista);
        this.underworldHabilitado = Boolean(this.underworldHabilitado);
        this.alertaSistemaBotin = Boolean(this.alertaSistemaBotin);
        const uw = this.habilidadesUnderworld && typeof this.habilidadesUnderworld === "object" ? this.habilidadesUnderworld : {};
        this.habilidadesUnderworld = Object.fromEntries(Object.keys(HABILIDADES_UNDERWORLD)
            .map(hab => [hab, valorHabilidadUnderworld(hab, uw[hab])]));
        // NPC: sin características ni habilidades (npc.js guarda sus valores)
        this.esNpc = Boolean(this.esNpc);
        this.idPlantilla = this.esNpc && this.idPlantilla ? String(this.idPlantilla).slice(0, 60) : null;
        this.npc = cargarNpc(jsonObject.npc);
        if (this.esNpc) {
            this.esUnderworld = false;
            this.protagonista = false;
            this.underworldHabilitado = false;
        }
        this.cor = Math.max(0, Math.floor(Number(this.cor) || 0));
        this.puntosEgo = Math.max(0, Math.floor(Number(this.puntosEgo) || 0));
        this.nombreReal = String(this.nombreReal ?? "").slice(0, 60);
        this.desbloqueosArteExtra = Math.trunc(Number(this.desbloqueosArteExtra) || 0);
        this.desbloqueosArteGastados = Math.max(0, Math.trunc(Number(this.desbloqueosArteGastados) || 0));
        // Solo el Aguante y la Iniciativa (derivados, no se guardan) pueden tener decimales
        for (const campo of ["nivel", "vida", "experiencia", "puntosArte"]) {
            if (campo in this) this[campo] = Math.trunc(Number(this[campo]) || 0);
        }

        /* Estados */
        this.estados = crearEstadosVacios();
        for (const estado of ESTADOS_LISTA) {
            const guardado = jsonObject.estados?.[estado];
            if (!guardado) continue;
            this.estados[estado] = {
                valor: Math.trunc(Number(guardado.valor) || 0),
                turnos: Math.trunc(Number(guardado.turnos) || 0)
            };
            // Duración con la que empezó (para dibujar los turnos gastados); las fichas antiguas no la tienen
            const totales = Math.trunc(Number(guardado.turnosTotales) || 0);
            if (totales > 0) this.estados[estado].turnosTotales = totales;
            // Marcado para quitarse con el descanso corto (solo se guarda si es true)
            if (guardado.descansoCorto) this.estados[estado].descansoCorto = true;
            // Provocado por la comida activa: se quita con ella
            if (guardado.origen === "comida") this.estados[estado].origen = "comida";
        }

        /* Inventario: se cargan todos los huecos guardados; al final ajustarInventario los adapta a la capacidad.
           cargarObjeto acepta el formato antiguo { nombre, cantidad } (pasa a material; sin nombre, hueco vacío). */
        const inventarioGuardado = Array.isArray(jsonObject.inventario) ? jsonObject.inventario : [];
        this.inventario = inventarioGuardado.map(cargarObjeto);

        /* Baúl: lista de objetos (o texto de las fichas antiguas: cada línea es un material) */
        this.baul = cargarBaul(jsonObject.baul);

        /* Objetos clave (las fichas antiguas no tienen: lista vacía) */
        this.objetosClave = cargarObjetosClave(jsonObject.objetosClave);

        /* Botín de NPC por recoger (las fichas antiguas no tienen) */
        this.botin = (Array.isArray(jsonObject.botin) ? jsonObject.botin : []).map(cargarObjeto).filter(Boolean);

        /* Trueque en curso, con lo apartado (si se cerró a medias, la interfaz lo devuelve) */
        this.trueque = cargarTrueque(jsonObject.trueque);

        /* Creación de objeto en espera del máster, con los materiales apartados */
        this.creacion = cargarCreacion(jsonObject.creacion);

        /* Quién dio el último golpe (para la muerte del personaje) */
        const golpe = jsonObject.ultimoGolpe;
        this.ultimoGolpe = golpe?.instancia ? {
            instancia: String(golpe.instancia).slice(0, 120),
            jugador: golpe.jugador ? String(golpe.jugador).slice(0, 128) : null,
            nombre: String(golpe.nombre ?? "").slice(0, 60),
            armaFuego: golpe.armaFuego === true, // con arma de fuego: si muere, nadie recibe nada
            magia: golpe.magia === true // con magia (13-sacro.md §10): nadie recibe nada; quien la lanzó, +2 de alerta
        } : null;

        /* Lanzas y cuchillos lanzados sin recoger */
        this.armasLanzadas = cargarArmasLanzadas(jsonObject.armasLanzadas);

        /* Energía de Sacro guardada en las manos */
        this.energiaManos = cargarEnergiaManos(jsonObject.energiaManos);
        this.hechizo = cargarHechizo(jsonObject.hechizo);
        this.ambienteSacro = cargarAmbiente(jsonObject.ambienteSacro);

        /* Equipo (con la poción aplicada, si la hay) */
        this.equipoArmadura = cargarEquipo(jsonObject.equipoArmadura);
        this.manoDerecha = cargarEquipo(jsonObject.manoDerecha);
        this.manoIzquierda = cargarEquipo(jsonObject.manoIzquierda);
        this.accesorios = Array.isArray(jsonObject.accesorios) ? jsonObject.accesorios.map(cargarEquipo) : [];

        /* Modificadores */
        this.modificadores = Array.isArray(jsonObject.modificadores) ? jsonObject.modificadores.map(cargarModificador) : [];

        /* Artes (las fichas antiguas no tienen: lista vacía; su texto sigue en listadoArtes) */
        this.artes = cargarArtes(jsonObject.artes);

        /* Amigos: solo las entradas válidas, sin repetir */
        /* Diario (las fichas antiguas no tienen: una página en blanco) */
        this.diario = cargarDiario(jsonObject.diario);

        this.amigos = [];
        (Array.isArray(jsonObject.amigos) ? jsonObject.amigos : []).forEach(amigo => {
            const jugador = String(amigo?.jugador ?? "");
            const nombre = String(amigo?.nombre ?? "").trim().slice(0, 60);
            if (jugador && nombre && !this.amigos.some(a => a.jugador === jugador && a.nombre === nombre)) {
                this.amigos.push({ jugador, nombre });
            }
        });

        // Huecos del inventario según la capacidad (con equipo, modificadores y artes ya cargados).
        // No se pierde nada: lo que no cabe queda como sobrante.
        ajustarInventario(this);

        // Pesadilla (npc.js): solo los NPC; nunca es jefe ni neutral
        this.esPesadilla = this.esNpc && this.esPesadilla === true;
        limpiarPesadilla(this);

        // Jefe (jefes.js): solo los NPC. Uno sin fases (fichas a medias) pasa a tener una, su estado actual
        this.esJefe = this.esNpc && this.esJefe === true;
        if (this.esJefe && !this.npc.fases.length) convertirEnJefe(this);
        if (!this.esJefe) { this.npc.fases = []; this.npc.faseActual = 0; }

        // Los valores derivados (vidaMax, defensa, aguante...) no se leen: se recalculan
        this.calcularCaracteristicas();
    }

    toJSONString() {
        this.calcularCaracteristicas();
        // El inventario del NPC no tiene huecos fijos: se guarda ya ajustado (un hueco libre)
        if (this.esNpc) ajustarInventario(this);
        // Jefe: la fase activa se copia a npc.fases antes de guardar
        if (this.esJefe) guardarFaseActiva(this);
        const datos = {};
        for (const campo of CAMPOS_SIMPLES) {
            datos[campo] = this[campo];
        }

        return JSON.stringify({
            ...datos,

            /* Derivados: se guardan para poder leer el fichero, pero al cargar se recalculan */
            experienciaMax: this.experienciaMax,
            puntosArteMax: this.puntosArteMax,
            espaciosArte: this.espaciosArte,
            aguante: this.aguante,
            armadura: this.armadura,
            vidaMax: this.vidaMax,
            defensa: this.defensa,
            dFisico: this.dFisico,
            dDistancia: this.dDistancia,
            dMagico: this.dMagico,
            iniciativa: this.iniciativa,
            vMovimiento: this.vMovimiento,
            perspicacia: this.perspicacia,
            percepcionPasiva: this.percepcionPasiva,

            estados: this.estados,
            inventario: this.inventario, // null en los huecos vacíos
            baul: this.baul,
            objetosClave: this.objetosClave,
            armasLanzadas: this.armasLanzadas,
            botin: this.botin,
            trueque: this.trueque,
            creacion: this.creacion,
            ultimoGolpe: this.ultimoGolpe,
            energiaManos: this.energiaManos,
            hechizo: this.hechizo,
            ambienteSacro: this.ambienteSacro,

            /* Equipo */
            equipoArmadura: this.equipoArmadura,
            manoDerecha: this.manoDerecha,
            manoIzquierda: this.manoIzquierda,
            accesorios: this.accesorios,

            modificadores: this.modificadores,

            artes: this.artes,

            amigos: this.amigos,

            diario: this.diario,

            // Solo los NPC (npc.js)
            ...(this.esNpc ? { npc: this.npc } : {})
        });
    }

}
