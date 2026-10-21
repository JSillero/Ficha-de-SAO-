import Equipamiento from "./equipamiento.js";
import Modificador from "./modificador.js";

const HABILIDADES_LISTA = [
    'atletismo', 'combate', 'percepcion', 'subterfugio',
    'comunicacion', 'cultura', 'profesion', 'sacro'
];

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

        /*Estados */
        this.regeneracion = 0;
        this.regeneracionPermanente= false,
        this.regeneracionTurnos = 0;

        this.veneno = 0;
        this.venenoPermanente= false,
        this.venenoTurnos = 0;

        this.quemadura=0;
        this.quemaduraPermanente= false,
        this.quemaduraTurnos = 0;

        this.paralisis=0;   
        this.paralisisPermanente= false,
        this.paralisisTurnos = 0;

        this.congelacion=0;
        this.congelacionPermanente= false,
        this.congelacionTurnos = 0;

        this.oscuridad=0;
        this.oscuridadPermanente= false,
        this.oscuridadTurnos = 0;

        /* Acciones */
        this.numeroAcciones = 3;
        this.izquierda = true; //Boolean
        this.derecha = true; //Boolean
        this.cabeza = true; //Boolean
        this.pies = true; //Boolean

        /* Array de modificaciones */
        this.modificadores;

        /* Equipamiento */
        this.equipoArmadura = new Equipamiento("", "", "");
        this.manoIzquierda = new Equipamiento("", "", "");
        this.manoDerecha = new Equipamiento("", "", "");
        this.accesorios = [];

        this.puntosArteMax = this.puntosArteMax;
        this.puntosArte = this.puntosArte;
        this.espaciosArte = this.espaciosArte;
        this.aguante = this.fortaleza + (this.voluntad / 2);
        this.vidaMax = this.aguante * ((this.nivel / 5) + 1);
        this.vida = this.vidaMax;
        this.defensa = (5);
        this.dFisico = (this.combate + this.fortaleza) / 4;
        this.dDistancia = (this.combate) / 4;
        this.dMagico = (this.sacro + this.inteligencia) / 4;
        this.iniciativa = (this.reflejos + this.inteligencia / 2);
        this.vMovimiento = 3 + this.atletismo / 5;

        /* Bloques de texto */
        this.notas = "vacio"; /* String, como todos  */
        this.listadoArtes = "vacio";
        this.listaDeAmigos = "vacio";
        this.recetasProfesion = "vacio";
        this.baul = "vacio";

        /* Modificadores */
        this.modificadores = [new Modificador()];
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
        this.espaciosArte = 4 + Math.floor(this.cultura / 10) + this.getModificador("espacios");
        this.aguante = this.fortaleza + (this.voluntad / 2) + this.getModificador("aguante");;
        this.vidaMax = this.aguante * (Math.floor((this.nivel - 1) / 5) + 1) + this.getModificador("vidaMax");;
        this.armadura = (Number(this.equipoArmadura?.armadura) || 0) + this.getModificador("armadura");
        this.defensa = (5 + this.reflejos) + this.getGenerico("atletismo") + this.getModificador("defensa") + this.getDefensaEscudos();
        this.dFisico = (this.getGenerico("combate") + this.fortaleza) / 4 + this.getModificador("dFisico");
        this.dDistancia = (this.getGenerico("combate")) / 4 + this.getModificador("dDistancia");;
        this.dMagico = (this.getGenerico("sacro") + this.inteligencia) / 4 + this.getModificador("dMagico");;
        this.iniciativa = (this.reflejos + this.inteligencia / 2) + this.getModificador("iniciativa");;
        this.vMovimiento = 3 + Math.floor(this.getGenerico("atletismo") / 5) + this.getModificador("vMovimiento");;
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

    getGenerico(atributo) {
        let penalizacion = (atributo === 'atletismo') ? (Number(this.equipoArmadura?.penalizacionAtletismo) || 0) : 0;
        return parseInt(this[atributo]) + parseInt(this.getModificador(atributo)) - penalizacion;
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

        return acumulado;

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
        /* Valores principales */
        this.nombre = jsonObject.nombre;
        this.nivel = jsonObject.nivel;
        this.experiencia = jsonObject.experiencia;

        /* Atributos */
        this.fortaleza = jsonObject.fortaleza;
        this.reflejos = jsonObject.reflejos;
        this.voluntad = jsonObject.voluntad;
        this.inteligencia = jsonObject.inteligencia;

        /* Habilidades */
        this.atletismo = jsonObject.atletismo;
        this.combate = jsonObject.combate;
        this.percepcion = jsonObject.percepcion;
        this.subterfugio = jsonObject.subterfugio;
        this.comunicacion = jsonObject.comunicacion;
        this.cultura = jsonObject.cultura;
        this.profesion = jsonObject.profesion;
        this.sacro = jsonObject.sacro;

        /* Estadisticas */
        this.puntosArte = jsonObject.puntosArte;
        this.vida = jsonObject.vida;
        this.aguante = jsonObject.aguante;
        this.armadura = jsonObject.armadura;
        this.defensa = jsonObject.defensa;
        this.dFisico = jsonObject.dFisico;
        this.dDistancia = jsonObject.dDistancia;
        this.dMagico = jsonObject.dMagico;
        this.iniciativa = jsonObject.iniciativa;
        this.vMovimiento = jsonObject.vMovimiento;

        /* Acciones */
        this.izquierda = jsonObject.izquierda;
        this.derecha = jsonObject.derecha;
        this.cabeza = jsonObject.cabeza;
        this.pies = jsonObject.pies;

        /* Equipo */
        this.equipoArmadura = Object.assign(new Equipamiento(), jsonObject.equipoArmadura || {});
        if (!Array.isArray(this.equipoArmadura.modificadores)) this.equipoArmadura.modificadores = [];
        this.manoDerecha = Object.assign(new Equipamiento(), jsonObject.manoDerecha || {});
        if (!Array.isArray(this.manoDerecha.modificadores)) this.manoDerecha.modificadores = [];
        this.manoIzquierda = Object.assign(new Equipamiento(), jsonObject.manoIzquierda || {});
        if (!Array.isArray(this.manoIzquierda.modificadores)) this.manoIzquierda.modificadores = [];
        this.accesorios = Array.isArray(jsonObject.accesorios) ? jsonObject.accesorios : [];

        /* Modifciaciones */
        this.modificadores = jsonObject.modificadores;

        /* Bloques de texto */
        this.notas = jsonObject.notas;
        this.listadoArtes = jsonObject.listadoArtes;
        this.listaDeAmigos = jsonObject.listaDeAmigos;
        this.recetasProfesion = jsonObject.recetasProfesion;
        this.baul = jsonObject.baul;
        this.calcularCaracteristicas();
        console.log("personaje", this)
    }

    toJSONString() {
        this.calcularCaracteristicas();
        let arrayMod = [];
        this.modificadores.forEach((mod) => {
            arrayMod.push(new Modificador(mod.nombre, mod.modificado, mod.numero, mod.turnos))
        })


        return JSON.stringify({
            nombre: this.nombre,
            nivel: this.nivel,
            experiencia: this.experiencia,

            fortaleza: this.fortaleza,
            reflejos: this.reflejos,
            voluntad: this.voluntad,
            inteligencia: this.inteligencia,

            atletismo: this.atletismo,
            combate: this.combate,
            percepcion: this.percepcion,
            subterfugio: this.subterfugio,
            comunicacion: this.comunicacion,
            cultura: this.cultura,
            profesion: this.profesion,
            sacro: this.sacro,

            puntosArteMax: this.puntosArteMax,
            puntosArte: this.puntosArte,
            espaciosArte: this.espaciosArte,
            aguante: this.aguante,
            armadura: this.armadura,
            vidaMax: this.vidaMax,
            vida: this.vida,
            defensa: this.defensa,
            dFisico: this.dFisico,
            dDistancia: this.dDistancia,
            dMagico: this.dMagico,
            iniciativa: this.iniciativa,
            vMovimiento: this.vMovimiento,

            izquierda: this.izquierda,
            derecha: this.derecha,
            cabeza: this.cabeza,
            pies: this.pies,

            /* Equipo */
            equipoArmadura: this.equipoArmadura,
            manoDerecha: this.manoDerecha,
            manoIzquierda: this.manoIzquierda,
            accesorios: this.accesorios,

            /* Bloques de texto */
            notas: this.notas,/* String, como todos  */
            listadoArtes: this.listadoArtes,
            listaDeAmigos: this.listaDeAmigos,
            recetasProfesion: this.recetasProfesion,
            baul: this.baul,

            modificadores: this.modificadores
        });
    }

}
