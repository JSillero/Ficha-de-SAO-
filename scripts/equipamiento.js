import Modificador from "./modificador.js";
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
        this.defensa = 0; // defensa que aporta un escudo mientras está en uso
        this.enUso = false; // true cuando el escudo se ha activado con el botón Usar
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
            "garrote",
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
            defensa: this.defensa,
            enUso: this.enUso
        });
    }
}