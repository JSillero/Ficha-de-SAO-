import Equipamiento from "./equipamiento.js";
import Modificador, { TURNOS_PERMANENTE, cargarModificador } from "./modificador.js";
import { TAMANO_INVENTARIO, crearInventarioVacio, cargarObjeto, cargarBaul, cargarEquipo } from "./objetos.js";
import { ZONAS, ZONA_POR_DEFECTO } from "./zonas.js";

export { TAMANO_INVENTARIO };

const HABILIDADES_LISTA = [
    'atletismo', 'combate', 'percepcion', 'subterfugio',
    'comunicacion', 'cultura', 'profesion', 'sacro'
];

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
    'nombre', 'nivel', 'experiencia',
    'fortaleza', 'reflejos', 'voluntad', 'inteligencia',
    ...HABILIDADES_LISTA,
    'puntosArte', 'vida',
    'numeroAcciones', 'izquierda', 'derecha', 'cabeza', 'pies', 'reaccionGuardada',
    'enSigilo', 'valorSigilo',
    'comidaActiva', 'tipoProfesion', 'zona',
    'notas', 'listadoArtes', 'listaDeAmigos', 'recetasProfesion'
];

function crearEstadosVacios() {
    return Object.fromEntries(ESTADOS_LISTA.map(estado => [estado, { valor: 0, turnos: 0 }]));
}

export default class PJ {
    constructor() {
        /* caracteristicas base */
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
        this.comidaActiva = ""; // nombre de la comida cuyo efecto está activo (sus modificadores llevan origen "comida")

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

        /* Bloques de texto */
        this.notas = ""; /* String, como todos */
        this.listadoArtes = "";
        this.listaDeAmigos = "";
        this.recetasProfesion = "";

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
        // La oscuridad resta PV máximos hasta un descanso largo
        this.vidaMax = this.aguante * (Math.floor((this.nivel - 1) / 5) + 1) + this.getModificador("vidaMax")
            - (Number(this.estados?.oscuridad?.valor) || 0);
        this.armadura = (Number(this.equipoArmadura?.armadura) || 0) + this.getModificador("armadura");
        this.defensa = (5 + this.reflejos) + this.getGenerico("atletismo") + this.getModificador("defensa") + this.getDefensaEscudos();
        // Los bonificadores de daño son los únicos valores que se redondean hacia abajo
        // En sigilo, los ataques usan Sigilo en lugar de Combate (también para el bonificador)
        const habilidadAtaque = this.getGenerico(this.getHabilidadAtaque());
        this.dFisico = Math.floor((habilidadAtaque + this.fortaleza) / 4) + this.getModificador("dFisico");
        this.dDistancia = Math.floor(habilidadAtaque / 4) + this.getModificador("dDistancia");
        this.dMagico = Math.floor((this.getGenerico("sacro") + this.inteligencia) / 4) + this.getModificador("dMagico");
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

    /* Habilidad con la que se ataca: Sigilo si está en sigilo, Combate si no */
    getHabilidadAtaque() {
        return this.enSigilo ? "subterfugio" : "combate";
    }

    getGenerico(atributo) {
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
        acumulado += Number(this.manoDerecha.modificadores.reduce(function (acc, obj) {
            return acc + ((obj['modificado'] == atributo) ? obj.numero : 0);
        }, 0));
        acumulado += Number(this.manoIzquierda.modificadores.reduce(function (acc, obj) {
            return acc + ((obj['modificado'] == atributo) ? obj.numero : 0);
        }, 0));
        acumulado += Number(this.equipoArmadura.modificadores.reduce(function (acc, obj) {
            return acc + ((obj['modificado'] == atributo) ? obj.numero : 0);
        }, 0));

        this.accesorios.forEach(accesorio => {
            acumulado += Number(accesorio.modificadores.reduce(function (acc, obj) {
                return acc + ((obj['modificado'] == atributo) ? obj.numero : 0);
            }, 0));
        });

        acumulado += this.getModificadorEstados(atributo);

        return acumulado;
    }

    /* Lo que restan los estados a un atributo (una sola vez, no cada turno):
       quemadura → Combate (si queda por debajo de 0, el sobrante daña PV al iniciar turno),
       electrocutado → Atletismo, deslumbrado → Percepción. */
    getModificadorEstados(atributo) {
        const estadoQueResta = { combate: "quemadura", atletismo: "electrocutado", percepcion: "deslumbrado" }[atributo];
        return estadoQueResta ? -(Number(this.estados?.[estadoQueResta]?.valor) || 0) : 0;

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
        if (!ZONAS[this.zona]) this.zona = ZONA_POR_DEFECTO;

        /* Estados */
        this.estados = crearEstadosVacios();
        for (const estado of ESTADOS_LISTA) {
            const guardado = jsonObject.estados?.[estado];
            if (!guardado) continue;
            this.estados[estado] = {
                valor: Number(guardado.valor) || 0,
                turnos: Number(guardado.turnos) || 0
            };
            // Marcado para quitarse con el descanso corto (solo se guarda si es true)
            if (guardado.descansoCorto) this.estados[estado].descansoCorto = true;
            // Provocado por la comida activa: se quita con ella
            if (guardado.origen === "comida") this.estados[estado].origen = "comida";
        }

        /* Inventario: se conservan los huecos guardados aunque superen el tamaño base.
           cargarObjeto acepta el formato antiguo { nombre, cantidad } (pasa a material; sin nombre, hueco vacío). */
        const inventarioGuardado = Array.isArray(jsonObject.inventario) ? jsonObject.inventario : [];
        this.inventario = crearInventarioVacio(Math.max(TAMANO_INVENTARIO, inventarioGuardado.length));
        inventarioGuardado.forEach((item, i) => {
            this.inventario[i] = cargarObjeto(item);
        });

        /* Baúl: lista de objetos (o texto de las fichas antiguas: cada línea es un material) */
        this.baul = cargarBaul(jsonObject.baul);

        /* Equipo (con la poción aplicada, si la hay) */
        this.equipoArmadura = cargarEquipo(jsonObject.equipoArmadura);
        this.manoDerecha = cargarEquipo(jsonObject.manoDerecha);
        this.manoIzquierda = cargarEquipo(jsonObject.manoIzquierda);
        this.accesorios = Array.isArray(jsonObject.accesorios) ? jsonObject.accesorios.map(cargarEquipo) : [];

        /* Modificadores */
        this.modificadores = Array.isArray(jsonObject.modificadores) ? jsonObject.modificadores.map(cargarModificador) : [];

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

            /* Equipo */
            equipoArmadura: this.equipoArmadura,
            manoDerecha: this.manoDerecha,
            manoIzquierda: this.manoIzquierda,
            accesorios: this.accesorios,

            modificadores: this.modificadores
        });
    }

}
