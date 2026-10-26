// scripts/debug.js
// Herramientas para comprobar que la ficha se guarda, se carga y se pinta correctamente.
// Se activan abriendo la página con ?debug en la URL (ver interfaz.js).

import PJ, { ESTADOS_LISTA } from "./PJ.js";
import Equipamiento from "./equipamiento.js";
import Modificador, { TURNOS_PERMANENTE } from "./modificador.js";

/* Ids de la interfaz que no coinciden con el nombre del campo en PJ */
const ALIAS_INTERFAZ = { arte: "puntosArte" };

/**
 * Guarda el personaje, lo carga en un PJ nuevo y lo vuelve a guardar.
 * Cualquier diferencia entre los dos JSON es un campo que se pierde o cambia al cargar.
 * @returns {{ diferencias: string[], sinGuardar: string[] }}
 */
export function verificarIdaVuelta(personaje) {
    const original = JSON.parse(personaje.toJSONString());
    const copia = new PJ();
    copia.cargarJSON(JSON.parse(JSON.stringify(original)));
    const recargado = JSON.parse(copia.toJSONString());

    const diferencias = [];
    compararProfundo(original, recargado, "", diferencias);

    // Propiedades del modelo que no llegan al JSON
    const sinGuardar = Object.keys(personaje).filter(campo => !(campo in original));

    return { diferencias, sinGuardar };
}

function compararProfundo(a, b, ruta, diferencias) {
    if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
        const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const clave of claves) {
            compararProfundo(a[clave], b[clave], ruta ? `${ruta}.${clave}` : clave, diferencias);
        }
        return;
    }
    if (a !== b) {
        diferencias.push(`${ruta}: guardado ${JSON.stringify(a)} → cargado ${JSON.stringify(b)}`);
    }
}

/**
 * Crea un PJ con todos los campos distintos de los valores por defecto,
 * para que la ida y vuelta detecte campos que se guardan pero no se cargan.
 */
export function crearPersonajePrueba() {
    const pj = new PJ();
    let contador = 2;

    for (const [campo, valor] of Object.entries(pj)) {
        if (typeof valor === "number") pj[campo] = contador++;
        else if (typeof valor === "boolean") pj[campo] = !valor;
        else if (typeof valor === "string") pj[campo] = `prueba ${campo}`;
    }
    pj.nivel = 20;

    ESTADOS_LISTA.forEach((estado, i) => {
        pj.estados[estado] = { valor: i + 1, turnos: i % 2 ? TURNOS_PERMANENTE : i + 2 };
    });
    pj.inventario = pj.inventario.map((_, i) => ({ nombre: `objeto ${i}`, cantidad: i + 1 }));

    const crearEquipo = (nombre, tipo) => {
        const equipo = new Equipamiento(nombre, `descripción ${nombre}`, tipo, 4, 1, 2);
        equipo.defensa = 3;
        equipo.enUso = true;
        equipo.modificadores = [new Modificador(`mod ${nombre}`, "combate", 1, TURNOS_PERMANENTE)];
        return equipo;
    };
    pj.manoDerecha = crearEquipo("espada", "espada");
    pj.manoIzquierda = crearEquipo("escudo", "escudo");
    pj.equipoArmadura = crearEquipo("cota", "ligera");
    pj.accesorios = [crearEquipo("anillo", "accesorio"), crearEquipo("collar", "accesorio")];
    pj.modificadores = [
        new Modificador("permanente", "percepcion", 2, TURNOS_PERMANENTE),
        new Modificador("temporal", "cultura", -1, 3)
    ];
    pj.calcularCaracteristicas();
    return pj;
}

/**
 * Compara los campos visibles en la página con los del modelo.
 * @returns {string[]} descripción de cada campo que no coincide
 */
export function verificarInterfaz(personaje, documento = document) {
    const errores = [];

    documento.querySelectorAll("input[id], textarea[id]").forEach(el => {
        const campo = ALIAS_INTERFAZ[el.id] ?? el.id;
        if (!(campo in personaje)) return;
        const valorModelo = personaje[campo];
        if (typeof valorModelo === "object") return;

        const coincide = el.type === "number"
            ? Number(el.value) === Number(valorModelo)
            : String(el.value) === String(valorModelo);
        if (!coincide) {
            errores.push(`#${el.id}: pantalla ${JSON.stringify(el.value)} ≠ modelo ${JSON.stringify(valorModelo)}`);
        }
    });

    documento.querySelectorAll("#listaInventario .filaInventario").forEach((fila, i) => {
        const item = personaje.inventario[i];
        const nombre = fila.querySelector(".itemInv")?.value ?? "";
        const cantidad = Number(fila.querySelector(".cantidadInv")?.value) || 0;
        if (!item || item.nombre !== nombre || item.cantidad !== cantidad) {
            errores.push(`inventario[${i}]: pantalla ${JSON.stringify({ nombre, cantidad })} ≠ modelo ${JSON.stringify(item)}`);
        }
    });

    return errores;
}

/**
 * Reglas de validación de la ficha (09-modelo-de-datos.md §3).
 * Son avisos: el máster puede hacer excepciones.
 * @returns {string[]}
 */
export function validarFicha(pj) {
    const avisos = [];
    const caracteristicas = ["fortaleza", "reflejos", "voluntad", "inteligencia"];

    const sumaCar = pj.getPuntosCaracteristicasGastados();
    if (sumaCar !== pj.getPuntosCaracteristicasTotales()) {
        avisos.push(`Las características suman ${sumaCar} (deberían sumar ${pj.getPuntosCaracteristicasTotales()}).`);
    }
    caracteristicas.forEach(car => {
        if (pj[car] < 1 || pj[car] > pj.getMaxCaracteristicas()) {
            avisos.push(`${car} = ${pj[car]}: debe estar entre 1 y ${pj.getMaxCaracteristicas()}.`);
        }
    });

    const disponibles = pj.getPuntosHabilidadDisponibles();
    if (disponibles < 0) avisos.push(`Se han gastado ${-disponibles} puntos de habilidad de más.`);
    else if (disponibles > 0) avisos.push(`Quedan ${disponibles} puntos de habilidad sin repartir.`);

    const maxHab = pj.getMaxHabilidad();
    ["atletismo", "combate", "percepcion", "subterfugio", "comunicacion", "cultura", "profesion", "sacro"]
        .forEach(hab => {
            if (pj[hab] > maxHab) avisos.push(`${hab} = ${pj[hab]} supera el máximo de su nivel (${maxHab}).`);
        });

    const penalizacion = Number(pj.equipoArmadura?.penalizacionAtletismo) || 0;
    if (penalizacion > pj.atletismo) {
        avisos.push(`La armadura penaliza ${penalizacion} de Atletismo y solo tienes ${pj.atletismo}: no se puede llevar.`);
    }

    if (pj.manoIzquierda?.tipo === "estoque" && pj.manoDerecha?.tipo === "estoque") {
        avisos.push("No se pueden llevar dos estoques.");
    }

    // vidaMax ya descuenta la oscuridad
    if (pj.vida > pj.vidaMax) avisos.push(`PV actuales (${pj.vida}) por encima del máximo (${pj.vidaMax}).`);
    if (pj.vida < 0) avisos.push(`PV actuales negativos (${pj.vida}).`);

    if (pj.puntosArte > pj.puntosArteMax) {
        avisos.push(`PA actuales (${pj.puntosArte}) por encima del máximo (${pj.puntosArteMax}).`);
    }

    if (pj.nivel < 1 || pj.nivel > 150) avisos.push(`Nivel ${pj.nivel} fuera de rango (1–150).`);

    if (pj.enSigilo && pj.equipoArmadura?.tipo === "pesada") {
        avisos.push("En sigilo con armadura pesada: no debería ser posible.");
    }

    return avisos;
}

/**
 * Ejecuta todas las comprobaciones y devuelve el informe.
 */
export function ejecutarDebug(personaje, documento = document) {
    const actual = verificarIdaVuelta(personaje);
    const prueba = verificarIdaVuelta(crearPersonajePrueba());
    return {
        idaVueltaActual: actual.diferencias,
        idaVueltaPrueba: prueba.diferencias,
        camposSinGuardar: [...new Set([...actual.sinGuardar, ...prueba.sinGuardar])],
        interfaz: verificarInterfaz(personaje, documento),
        avisos: validarFicha(personaje)
    };
}
