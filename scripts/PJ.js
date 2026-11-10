import Equipamiento from "./equipamiento.js";
import Modificador, { TURNOS_PERMANENTE, cargarModificador } from "./modificador.js";
import { TAMANO_INVENTARIO, crearInventarioVacio, ajustarInventario, cargarObjeto, cargarBaul, cargarObjetosClave, cargarArmasLanzadas, cargarEquipo } from "./objetos.js";
import { ZONAS, ZONA_POR_DEFECTO } from "./zonas.js";
import { cargarArtes, modificadorArtes } from "./artes.js";
import { modificadorEfectosEquipo } from "./efectosEquipo.js";
import { cargarDiario } from "./diario.js";

export { TAMANO_INVENTARIO };

export const HABILIDADES_LISTA = [
    'atletismo', 'combate', 'percepcion', 'subterfugio',
    'comunicacion', 'cultura', 'profesion', 'sacro'
];

/* Embriaguez: por cada punto de potencia, +3 Carisma y −1 al resto de habilidades mientras está activa.
   Sacro no cuenta: es especial, casi todos lo tienen a 0 y no se usa en tiradas. */
export const EMBRIAGUEZ_CARISMA = 3;
export const EMBRIAGUEZ_RESTO = -1;
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
    'deslumbrado'    // Percepción restada por luz con los PV al máximo
];

/* Campos que se guardan y se cargan tal cual (sin conversión) */
const CAMPOS_SIMPLES = [
    'idPersonaje', 'nombre', 'nivel', 'experiencia',
    'fortaleza', 'reflejos', 'voluntad', 'inteligencia',
    ...HABILIDADES_LISTA,
    'puntosArte', 'vida',
    'numeroAcciones', 'izquierda', 'derecha', 'cabeza', 'pies', 'reaccionGuardada',
    'enSigilo', 'valorSigilo',
    'comidaActiva', 'tipoProfesion', 'esUnderworld', 'protagonista', 'zona', 'cor',
    'desbloqueosArteExtra', 'desbloqueosArteGastados',
    'notas', 'listadoArtes', 'listaDeAmigos', 'recetasProfesion'
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
        this.protagonista = false; // perfil: tiene diario

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
        this.comidaActiva = ""; // nombre de la comida cuyo efecto está activo (sus modificadores llevan origen "comida")
        this.cor = 0; // monedas: no ocupan hueco, sin límite, nunca negativas

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
        this.listaDeAmigos = ""; // notas antiguas de amigos: ya no se muestran, se conservan
        this.recetasProfesion = ""; // se muestra como "Perfil psicológico" (el nombre del campo se conserva)

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

        while(this.experiencia >= this.experienciaMax && this.nivel <= 150) {
            this.experiencia = this.experiencia - this.experienciaMax;
            this.nivel = this.nivel + 1;
            this.calcularCaracteristicas();
        }

    }

    calcularCaracteristicas() {
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
        this.espaciosArte = (this.nivel >= 16 ? 4 + Math.floor(this.cultura / 10) : 0) + this.getModificador("espacios");
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

    /**
     * Introduce el nombre del atributo a obtener y se unen automaticamente los modificadores asociados al nombre 
     * @param {string} atributo 
     */
    /* Suma la defensa de los escudos que están en uso */
    getDefensaEscudos() {
        return [this.manoIzquierda, this.manoDerecha].reduce((acc, mano) => {
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

    getGenerico(atributo) {
        // Sin Underworld, Sacro es 0 (tampoco cuentan sus modificadores)
        if (!this.puedeUsarHabilidad(atributo)) return 0;
        let penalizacion = (atributo === 'atletismo') ? (Number(this.equipoArmadura?.penalizacionAtletismo) || 0) : 0;
        const valor = parseInt(this[atributo]) + parseInt(this.getModificador(atributo)) - penalizacion;
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
        if (this.getPuntosHabilidadDisponibles() > 0 && this[nombreHab] < this.getMaxHabilidad()) {
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

        this.accesorios.forEach(accesorio => {
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
        // Fichas anteriores a la casilla Underworld: si tenían Sacro, lo eran
        this.esUnderworld = jsonObject.esUnderworld === undefined ? Number(this.sacro) > 0 : Boolean(this.esUnderworld);
        if (!this.esUnderworld) this.sacro = 0;
        this.protagonista = Boolean(this.protagonista);
        this.cor = Math.max(0, Math.floor(Number(this.cor) || 0));
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

        /* Lanzas y cuchillos lanzados sin recoger */
        this.armasLanzadas = cargarArmasLanzadas(jsonObject.armasLanzadas);

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

        // Los valores derivados (vidaMax, defensa, aguante...) no se leen: se recalculan
        this.calcularCaracteristicas();
    }

    toJSONString() {
        this.calcularCaracteristicas();
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

            /* Equipo */
            equipoArmadura: this.equipoArmadura,
            manoDerecha: this.manoDerecha,
            manoIzquierda: this.manoIzquierda,
            accesorios: this.accesorios,

            modificadores: this.modificadores,

            artes: this.artes,

            amigos: this.amigos,

            diario: this.diario
        });
    }

}
