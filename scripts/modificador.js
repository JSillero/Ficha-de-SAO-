/* Valor de turnos que marca algo como permanente: no se descuenta al pasar turno,
   solo desaparece si el usuario lo edita o lo elimina. Se usa también en los estados de PJ. */
export const TURNOS_PERMANENTE = -1;

export default class Modificador {
    /**
     *
     * @param {String} nombre
     * @param {String} modificado nombre del atributo modificado de la clase Personaje,
     * @param {Int} numero numero a sumar o restar
     * @param {Int} turnos turnos durante los que se aplica; TURNOS_PERMANENTE (-1) es permanente
     */
    constructor(nombre = 'nombre', modificado = 'atletismo', numero = 0, turnos = TURNOS_PERMANENTE) {
        this.nombre = nombre;
        this.modificado = modificado;
        this.numero = numero;
        this.turnos = turnos;
    }

    static esPermanente(modificador) {
        return Number(modificador?.turnos) === TURNOS_PERMANENTE;
    }


    toJSONString() {
        return JSON.stringify({
            nombre: this.nombre,
            modificado: this.modificado,
            numero: this.numero,
            turnos: this.turnos,
        })
    }


}

/* Reconstruye un modificador guardado. Conserva campos extra (p. ej. origen: "comida"). */
export function cargarModificador(datos) {
    const mod = Object.assign(new Modificador(), datos || {});
    // Las fichas antiguas guardaban turnos = 0 en modificadores que en la práctica eran permanentes
    const turnos = Number(mod.turnos);
    mod.turnos = (!Number.isFinite(turnos) || turnos <= 0) ? TURNOS_PERMANENTE : turnos;
    return mod;
}
