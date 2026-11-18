// scripts/debug.js
// Herramientas para comprobar que la ficha se guarda, se carga y se pinta correctamente.
// Se activan abriendo la página con ?debug en la URL (ver interfaz.js).

import PJ, { ESTADOS_LISTA, HABILIDADES_UNDERWORLD, HABILIDADES_LISTA } from "./PJ.js";
import Equipamiento, { esArmaFuego } from "./equipamiento.js";
import Modificador, { TURNOS_PERMANENTE } from "./modificador.js";
import { cargarObjeto, crearInventarioVacio, capacidadInventario, aplicarEfectoEnObjetivo } from "./objetos.js";
import { cargarEfectos } from "./efectosEquipo.js";
import { cargarArte, artesEquipadas, ranurasUsadas, motivoRequisitos, desbloqueosDisponibles } from "./artes.js";
import { convertirEnJefe, copiarFase, aplicarFase, esJefe, faseActual, numeroFases } from "./jefes.js";
import { limpiarPesadilla } from "./npc.js";
import { aplicarDanno, activarEstado } from "./estados.js";
import { iniciarTurno } from "./turno.js";
import { descansoLargo } from "./zonas.js";
import {
    costeGenerar, motivoNoGenerar, dannoElementos, factorRadio, golpesDeElementos, partesHechizo, motivoNoDedos, golpesDeFilas,
    propuestaObjetos, cristalParaLlenar, motivoDedoNoUsable, motivoNoGuardarEnMano, energiaDe, quitarElementos, devolverElementos, dannoDedo,
    redondearMagia
} from "./sacro.js";
import { cargarMagiaPendiente } from "./elementosSacro.js";

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
    // (npc solo se guarda en los NPC)
    const sinGuardar = Object.keys(personaje).filter(campo => !(campo in original) && !(campo === "npc" && !personaje.esNpc));

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
    pj.zona = "base"; // solo admite claves de ZONAS
    pj.esNpc = false; // el NPC tiene su propia ficha de prueba (crearNpcPrueba)
    // Solo existen en un NPC (cargarJSON los pone a false sin esNpc): tienen sus propias fichas de prueba
    pj.esJefe = false;
    pj.esPesadilla = false;

    ESTADOS_LISTA.forEach((estado, i) => {
        pj.estados[estado] = { valor: i + 1, turnos: i % 2 ? TURNOS_PERMANENTE : i + 2 };
    });
    const crearEquipo = (nombre, tipo) => {
        const equipo = new Equipamiento(nombre, `descripción ${nombre}`, tipo, 4, 1, 2);
        equipo.defensa = 3;
        equipo.enUso = true;
        equipo.modificadores = [new Modificador(`mod ${nombre}`, "combate", 1, TURNOS_PERMANENTE)];
        return equipo;
    };

    // Un objeto de cada tipo, con todo lo anidado (modificadores, estados, elemental, equipo). El café usa el formato
    // antiguo (un solo `estado`) para comprobar que carga como lista
    const pocion = cargarObjeto({ tipo: "pocion", nombre: "poción", descripcion: "cura", cantidad: 2, pv: 4, pa: 1,
        estados: [{ clave: "regeneracion", valor: 1, turnos: 3, quitar: false }, { clave: "veneno", valor: 0, turnos: TURNOS_PERMANENTE, quitar: true }] });
    const objetos = [
        { tipo: "comida", nombre: "café", cantidad: 3, modificadores: [{ nombre: "café", modificado: "percepcion", numero: 2, turnos: TURNOS_PERMANENTE }],
            estado: { clave: "regeneracion", valor: 1, turnos: TURNOS_PERMANENTE, quitar: false } },
        pocion,
        { tipo: "pocion", nombre: "antídoto", cantidad: 1, pv: 0, estados: [{ clave: "veneno", valor: 0, turnos: TURNOS_PERMANENTE, quitar: true }] },
        { tipo: "equipo", nombre: "hacha", descripcion: "pesada", equipo: crearEquipo("hacha", "hacha") },
        { tipo: "cristal", nombre: "cristal", descripcion: "teletransporte", cantidad: 1 },
        { tipo: "material", nombre: "mineral", cantidad: 5 },
        { tipo: "arrojadiza", nombre: "daga", cantidad: 4, danno: 2, estados: [{ clave: "veneno", valor: 2, turnos: 3 }, { clave: "aturdido", valor: 1, turnos: TURNOS_PERMANENTE }],
            elemental: { tipo: "fuego", cantidad: 3 } }
    ].map(cargarObjeto);
    // 10 huecos: los 5 base + el modificador "inventario" +5 de abajo
    pj.inventario = crearInventarioVacio(10);
    objetos.forEach((objeto, i) => { pj.inventario[i] = objeto; });
    pj.baul = objetos.map(objeto => cargarObjeto({ ...objeto, cantidad: 7 }));
    pj.objetosClave = [{ nombre: "llave", descripcion: "abre la puerta" }, { nombre: "mapa", descripcion: "" }];
    pj.armasLanzadas = [{ mano: "manoIzquierda", equipo: crearEquipo("cuchillo lanzado", "cuchillo") }];
    pj.botin = [cargarObjeto({ tipo: "material", nombre: "piel", cantidad: 2 })]; // recompensa de un NPC por recoger

    pj.manoDerecha = crearEquipo("espada", "espada");
    pj.manoDerecha.pocionAplicada = { ...pocion, cantidad: 1 };
    pj.manoDerecha.dannoElemental = { fuego: 1, electricidad: 0, hielo: 2, luz: 0, oscuridad: 3 };
    // Efectos de equipo: una pasiva y una activa en el arma
    pj.manoDerecha.efectos = cargarEfectos([
        { id: "efecto-pasiva", nombre: "filo", tipo: "pasiva", descripcion: "afilada", modificadores: [{ modificado: "dFisico", numero: 1 }] },
        { id: "efecto-activa", nombre: "tajo", tipo: "activa", costePA: 1, danno: 2, golpes: 2, dannoElemental: { fuego: 1 } }
    ]);
    pj.manoIzquierda = crearEquipo("escudo", "escudo");
    pj.equipoArmadura = crearEquipo("cota", "ligera");
    pj.equipoArmadura.resistencias = { fuego: 1, electricidad: 2, hielo: 3, luz: 4, oscuridad: 5 };
    pj.accesorios = [crearEquipo("anillo", "accesorio"), crearEquipo("collar", "accesorio")];
    // Reliquias: el arma de la mano derecha, el primer accesorio y un amuleto (reliquia de mano) en el inventario
    pj.accesorios[0].reliquia = { habilidades: [{ nombre: "eco", descripcion: "repite", enfriamiento: 4, restante: 2 }] };
    // Cinturón con un objeto de cada tipo admitido y un hueco libre (cinturon.js)
    pj.accesorios[1].cinturon = {
        huecos: 4,
        objetos: [objetos.find(o => o.tipo === "pocion"), objetos.find(o => o.tipo === "cristal"), objetos.find(o => o.tipo === "arrojadiza"), null]
            .map(o => (o ? { ...JSON.parse(JSON.stringify(o)), cantidad: 1 } : null))
    };
    pj.manoDerecha.reliquia = { habilidades: [{ nombre: "corte", descripcion: "x2", enfriamiento: 2, restante: 1 }] };
    const amuleto = crearEquipo("amuleto", "reliquia");
    amuleto.reliquia = { habilidades: [
        { nombre: "destello", descripcion: "ciega", enfriamiento: 3, restante: 3 },
        { nombre: "escudo", descripcion: "+3 defensa", enfriamiento: 0, restante: 0 }
    ] };
    pj.inventario[pj.inventario.findIndex(hueco => !hueco)] = cargarObjeto({ tipo: "equipo", nombre: "amuleto", equipo: amuleto });
    pj.estados.veneno.descansoCorto = true; // se quita con el descanso corto
    const deComida = new Modificador("café", "percepcion", 2, TURNOS_PERMANENTE);
    deComida.origen = "comida";
    pj.comidaActiva = "café";
    pj.modificadores = [
        new Modificador("permanente", "percepcion", 2, TURNOS_PERMANENTE),
        new Modificador("temporal", "cultura", -1, 3),
        new Modificador("mochila", "inventario", 5, TURNOS_PERMANENTE),
        Object.assign(new Modificador("hasta descansar", "combate", 1, TURNOS_PERMANENTE), { descansoCorto: true }),
        deComida
    ];
    // Artes: una activa con todos los campos (requisitos de cada tipo) y una pasiva con modificadores
    pj.artes = [
        cargarArte({
            id: "prueba-activa", idCatalogo: "golpe-horizontal", equipada: true, nombre: "activa", tipo: "activa",
            grupo: "espada", etiquetas: ["espada"], descripcion: "golpe", ranuras: 2, notaRequisitos: "nota",
            requisitos: [
                { tipo: "nivel", valor: 16 },
                { tipo: "caracteristica", clave: "aguante", valor: 4.5 },
                { tipo: "habilidad", clave: "combate", valor: 3, alternativo: true },
                { tipo: "armadura", tipos: ["ligera", "media"], alternativo: true },
                { tipo: "arma", tipos: ["espada"], ambasManos: true },
                { tipo: "escudo", tipos: ["escudo"] }
            ],
            costePA: 2, combo: true, uso: { tipo: "arma", armas: ["espada"], ambasManos: false },
            danno: 4, dannoElemental: { fuego: 1, electricidad: 0, hielo: 0, luz: 0, oscuridad: 2 }, golpes: 2, haceDanno: true
        }),
        cargarArte({
            id: "prueba-pasiva", idCatalogo: null, equipada: false, nombre: "pasiva", tipo: "pasiva", grupo: "propia",
            descripcion: "regenera", requisitos: [], modificadores: [{ modificado: "regeneracion", numero: 2 }]
        }),
        // Habilidad onírica (Underworld): equipada, sin memoria ni requisitos (el diario va debajo)
        cargarArte({
            id: "prueba-onirica", onirica: true, nombre: "sueño", tipo: "pasiva", descripcion: "onírica",
            modificadores: [{ modificado: "percepcion", numero: 1 }]
        })
    ];
    // Diario: varias páginas con formato (ya saneadas, para que la ida y vuelta las deje igual)
    pj.diario = ["<b>Día 1</b><div>texto <i>en cursiva</i></div>", "<ul><li>uno</li><li><u>dos</u></li></ul>", ""];
    pj.calcularCaracteristicas();
    return pj;
}

/** NPC con todos sus campos distintos de los valores por defecto (npc.js) */
export function crearNpcPrueba() {
    const crearEquipo = (nombre, tipo) => {
        const equipo = new Equipamiento(nombre, `descripción ${nombre}`, tipo, 4, 0, 0);
        equipo.modificadores = [new Modificador(`mod ${nombre}`, "defensa", 1, TURNOS_PERMANENTE)];
        return equipo;
    };
    const pj = new PJ();
    pj.esNpc = true;
    pj.idPlantilla = "plantilla-prueba";
    pj.nombre = "lobo de prueba";
    pj.nivel = 22;
    Object.assign(pj.npc, {
        vidaMax: 77, puntosArteMax: 3, defensa: 15, iniciativa: 9, vMovimiento: 6, perspicacia: 11,
        percepcionPasiva: 13, aguante: 7, expRecompensa: 250,
        tiradas: [{ nombre: "Olfato", valor: 6 }, { nombre: "Aullido", valor: -1 }],
        recompensa: {
            cor: 40,
            objetos: [cargarObjeto({ tipo: "material", nombre: "piel", cantidad: 3 })],
            objetosClave: [{ nombre: "colmillo", descripcion: "de lobo" }]
        },
        partes: [
            { id: "izquierda", nombre: "Pata izquierda", disponible: true, equipo: null },
            { id: "derecha", nombre: "Pata derecha", disponible: false, equipo: null },
            { id: "cabeza", nombre: "Boca", disponible: true, equipo: null },
            { id: "pies", nombre: "Patas traseras", disponible: true, equipo: null },
            { id: "cola", nombre: "Cola", disponible: false, equipo: null },
            { id: "ala", nombre: "Ala", disponible: true, equipo: null }
        ]
    });
    // Arma a dos manos en la cola que ocupa también el ala, con acierto, dado y daño elemental
    const coletazo = crearEquipo("coletazo", "espadon");
    Object.assign(coletazo, { acierto: 5, dado: 2, parteSecundaria: "ala", dannoElemental: { fuego: 2, electricidad: 0, hielo: 0, luz: 0, oscuridad: 0 } });
    pj.npc.partes[4].equipo = coletazo;
    pj.manoIzquierda = Object.assign(crearEquipo("garra", "cuchillo"), { acierto: 3, dado: 0 });
    pj.equipoArmadura = Object.assign(crearEquipo("piel", "media"), {
        resistencias: { fuego: 0, electricidad: 0, hielo: 2, luz: 0, oscuridad: 0 },
        debilidades: { fuego: 1.5, electricidad: 0, hielo: 0, luz: 2, oscuridad: 0 }
    });
    pj.modificadores.push(new Modificador("frágil", "deb_hielo", 0.75, TURNOS_PERMANENTE));
    pj.modificadores = [new Modificador("furia", "defensa", 2, 3)];
    pj.calcularCaracteristicas();
    pj.vida = 50;
    pj.puntosArte = 2;
    return pj;
}

/**
 * Compara los campos visibles en la página con los del modelo.
 * @returns {string[]} descripción de cada campo que no coincide
 */
export function verificarInterfaz(personaje, documento = document) {
    const errores = [];

    documento.querySelectorAll("input[id], textarea[id], select[id]").forEach(el => {
        const campo = ALIAS_INTERFAZ[el.id] ?? el.id;
        if (!(campo in personaje)) return;
        // Las habilidades se ven con las del Underworld sumadas (getBaseHabilidad); lo invertido está en personaje[hab]
        const valorModelo = HABILIDADES_LISTA.includes(campo) && typeof personaje.getBaseHabilidad === "function"
            ? personaje.getBaseHabilidad(campo) : personaje[campo];
        if (typeof valorModelo === "object") return;

        const coincide = el.type === "number"
            ? Number(el.value) === Number(valorModelo)
            : String(el.value) === String(valorModelo);
        if (!coincide) {
            errores.push(`#${el.id}: pantalla ${JSON.stringify(el.value)} ≠ modelo ${JSON.stringify(valorModelo)}`);
        }
    });

    // Filas del inventario y del baúl: nombre y cantidad ("2/5" en el inventario, "×2" en el baúl)
    const compararLista = (selector, lista, etiqueta) => {
        const filas = documento.querySelectorAll(`${selector} .fila-objeto`);
        if (filas.length !== lista.length) {
            errores.push(`${etiqueta}: ${filas.length} filas en pantalla ≠ ${lista.length} en el modelo`);
        }
        filas.forEach((fila, i) => {
            const item = lista[i] ?? null;
            const nombre = fila.querySelector(".objeto-nombre")?.textContent ?? null;
            const cantidad = parseInt((fila.querySelector(".objeto-cantidad")?.textContent ?? "").replace("×", "")) || null;
            const enPantalla = nombre === null ? null : { nombre, cantidad };
            const enModelo = item && { nombre: item.nombre, cantidad: item.cantidad };
            if (JSON.stringify(enPantalla) !== JSON.stringify(enModelo)) {
                errores.push(`${etiqueta}[${i}]: pantalla ${JSON.stringify(enPantalla)} ≠ modelo ${JSON.stringify(enModelo)}`);
            }
        });
    };
    compararLista("#listaInventario", personaje.inventario, "inventario");
    if (personaje.baul.length) compararLista("#listaBaul", personaje.baul, "baul");

    return errores;
}

/**
 * Reglas de validación de la ficha (09-modelo-de-datos.md §3).
 * Son avisos: el máster puede hacer excepciones.
 * @returns {string[]}
 */
/* Armas de fuego puestas (manos y partes de un NPC): balas dentro del cargador, solo materiales de herrería, y balas
   infinitas solo en los NPC */
function avisosArmasFuego(pj) {
    const avisos = [];
    const equipos = [pj.manoIzquierda, pj.manoDerecha, ...(pj.esNpc ? (pj.npc?.partes ?? []).map(p => p.equipo) : [])];
    equipos.filter(esArmaFuego).forEach(item => {
        const nombre = item.nombre?.trim() || "Arma de fuego";
        if (item.balas.length > item.cargador) avisos.push(`${nombre}: ${item.balas.length} balas en un cargador de ${item.cargador}.`);
        if (item.balas.some(bala => bala.tipo !== "material" || bala.subtipo !== "herreria")) avisos.push(`${nombre}: tiene balas que no son materiales de herrería.`);
        if (item.balasInfinitas && !pj.esNpc) avisos.push(`${nombre}: balas infinitas en un personaje (solo cuentan en los NPC).`);
    });
    return avisos;
}

export function validarFicha(pj) {
    if (pj.esNpc) return [...validarNpc(pj), ...avisosArmasFuego(pj)];
    const avisos = avisosArmasFuego(pj);
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
    // Habilidades del Underworld (perfil): dentro de su máximo y solo con la casilla Underworld
    Object.entries(HABILIDADES_UNDERWORLD).forEach(([hab, { etiqueta, max }]) => {
        const valor = pj.habilidadesUnderworld?.[hab];
        if (!Number.isInteger(valor) || valor < 0 || valor > max) avisos.push(`Habilidad del Underworld ${etiqueta} = ${valor} (debe estar entre 0 y ${max}).`);
        if (pj.getBaseHabilidad(hab) > Math.max(maxHab, pj[hab])) avisos.push(`${hab} con el Underworld (${pj.getBaseHabilidad(hab)}) supera el máximo de su nivel.`);
    });
    if (pj.underworldHabilitado && !pj.esUnderworld) avisos.push("Habilidades del Underworld habilitadas sin la casilla Underworld (no suman).");
    if (!pj.esUnderworld && pj.sacro > 0) avisos.push(`Sacro = ${pj.sacro} sin la casilla Underworld (debería ser 0).`);
    if (!Array.isArray(pj.diario) || pj.diario.length === 0) avisos.push("El diario no tiene ninguna página (debería tener al menos una).");
    if (!pj.esUnderworld && pj.dMagico !== 0) avisos.push(`Daño mágico = ${pj.dMagico} sin la casilla Underworld (debería ser 0).`);

    const penalizacion = Number(pj.equipoArmadura?.penalizacionAtletismo) || 0;
    if (penalizacion > pj.getBaseHabilidad("atletismo")) {
        avisos.push(`La armadura penaliza ${penalizacion} de Atletismo y solo tienes ${pj.getBaseHabilidad("atletismo")}: no se puede llevar.`);
    }

    if (pj.manoIzquierda?.tipo === "estoque" && pj.manoDerecha?.tipo === "estoque") {
        avisos.push("No se pueden llevar dos estoques.");
    }

    // vidaMax ya descuenta la oscuridad (los PV sí pueden ser negativos: a 0 o menos se muere al empezar turno)
    if (pj.vida > pj.vidaMax) avisos.push(`PV actuales (${pj.vida}) por encima del máximo (${pj.vidaMax}).`);

    if (pj.puntosArte > pj.puntosArteMax) {
        avisos.push(`PA actuales (${pj.puntosArte}) por encima del máximo (${pj.puntosArteMax}).`);
    }

    if (pj.nivel < 1 || pj.nivel > 150) avisos.push(`Nivel ${pj.nivel} fuera de rango (1–150).`);

    if (pj.enSigilo && pj.equipoArmadura?.tipo === "pesada") {
        avisos.push("En sigilo con armadura pesada: no debería ser posible.");
    }

    if (pj.cor < 0) avisos.push(`Cor negativo (${pj.cor}).`);
    if (pj.puntosEgo < 0) avisos.push(`Puntos de ego negativos (${pj.puntosEgo}).`);
    if (pj.puntosEgo > 0 && !pj.protagonista) avisos.push(`Tiene ${pj.puntosEgo} puntos de ego sin ser protagonista (se conservan ocultos).`);
    const sobrantes = pj.inventario.length - capacidadInventario(pj);
    if (sobrantes > 0) avisos.push(`El inventario tiene ${sobrantes} objeto(s) de más (capacidad ${capacidadInventario(pj)}).`);
    // Puede pasar si se baja de nivel después de gastar desbloqueos
    if (desbloqueosDisponibles(pj) < 0) avisos.push(`Desbloqueos de arte en negativo (${desbloqueosDisponibles(pj)}).`);

    // Artes: memoria y requisitos (un arte que deja de cumplirlos queda inactiva, no se desequipa)
    if (ranurasUsadas(pj) > pj.espaciosArte) {
        avisos.push(`Artes equipadas ocupan ${ranurasUsadas(pj)} de memoria y solo hay ${pj.espaciosArte}.`);
    }
    artesEquipadas(pj).forEach(arte => {
        const motivo = motivoRequisitos(pj, arte);
        if (motivo) avisos.push(`Arte inactiva "${arte.nombre}": ${motivo}.`);
    });

    return avisos;
}

/* NPC: no tiene características, habilidades ni límites de nivel; solo PV y PA dentro de sus máximos */
/* Jefe de prueba: el NPC de prueba como fase 1 y una fase 2 con otros PV, Defensa, opciones y sin la cola */
export function crearJefePrueba() {
    const pj = crearNpcPrueba();
    pj.nombre = "jefe de prueba";
    convertirEnJefe(pj);
    const segunda = copiarFase(pj);
    aplicarFase(pj, segunda);
    Object.assign(pj.npc, { vidaMax: 50, defensa: 20 });
    pj.npc.partes = pj.npc.partes.filter(parte => parte.id !== "cola");
    Object.assign(pj.npc.fases[segunda], { rellenarPA: true, curarNegativos: false, restablecerAcciones: true });
    pj.calcularCaracteristicas();
    pj.vida = 30;
    return pj;
}

function validarNpc(pj) {
    const avisos = [];
    if (pj.esJefe && !esJefe(pj)) avisos.push("Jefe sin fases (debería tener al menos una).");
    if (esJefe(pj) && (pj.npc.faseActual < 0 || pj.npc.faseActual >= numeroFases(pj))) {
        avisos.push(`Fase actual ${pj.npc.faseActual + 1} fuera de rango (1–${numeroFases(pj)}).`);
    }
    if (esJefe(pj) && pj.npc.fases[faseActual(pj)]?.valores?.vidaMax !== pj.npc.vidaMax) {
        avisos.push("Los PV máximos del jefe no coinciden con los de su fase actual guardada.");
    }
    if (pj.vida > pj.vidaMax) avisos.push(`PV actuales (${pj.vida}) por encima del máximo (${pj.vidaMax}).`);
    if (pj.esPesadilla) {
        if (pj.esJefe) avisos.push("Pesadilla marcada como jefe (las pesadillas no pueden ser jefes).");
        if (pj.puntosArteMax > 0 || pj.puntosArte > 0) avisos.push("Pesadilla con PA (no deberían tener).");
        const r = pj.npc.recompensa;
        if (pj.npc.expRecompensa > 0 || r.cor > 0 || r.objetos.length || r.objetosClave.length) avisos.push("Pesadilla con recompensa (no dan nada).");
        if (pj.neutral) avisos.push("Pesadilla neutral (no pueden serlo).");
    }
    if (pj.puntosArte > pj.puntosArteMax) avisos.push(`PA actuales (${pj.puntosArte}) por encima del máximo (${pj.puntosArteMax}).`);
    if (pj.esUnderworld || pj.protagonista) avisos.push("Un NPC no puede ser Underworld ni protagonista.");
    const huecosLibres = pj.inventario.filter(hueco => !hueco).length;
    if (huecosLibres !== 1) avisos.push(`El inventario del NPC tiene ${huecosLibres} huecos libres (debería tener 1).`);
    return avisos;
}

/* Pesadilla de prueba: un NPC de prueba convertido (sin PA ni recompensa) */
export function crearPesadillaPrueba() {
    const pj = crearNpcPrueba();
    pj.nombre = "pesadilla de prueba";
    pj.esPesadilla = true;
    convertirEnJefe(pj); // no debe hacer nada
    limpiarPesadilla(pj);
    pj.calcularCaracteristicas();
    pj.vida = pj.vidaMax;
    return pj;
}

/* Reglas de la pesadilla sobre una copia: daño elemental directo, luz y oscuridad sin efecto, efectos del golpe a
   mano, sin curación y estados puestos a mano que sí actúan al empezar turno */
export function comprobarPesadilla() {
    const fallos = [];
    const nueva = () => {
        const pj = new PJ();
        pj.cargarJSON(JSON.parse(crearPesadillaPrueba().toJSONString()));
        pj.zona = "noSegura";
        pj.vida = 40;
        return pj;
    };
    let pj = nueva();
    if (esJefe(pj) || pj.puntosArteMax !== 0) fallos.push("Es jefe o tiene PA.");
    // Sin resistencias ni debilidades, para que las cuentas sean exactas
    pj.equipoArmadura.resistencias = {};
    pj.equipoArmadura.debilidades = {};
    aplicarDanno(pj, 5, "fuego");
    if (pj.vida !== 35 || (Number(pj.estados.quemadura?.valor) || 0) > 0) fallos.push(`Fuego 5: PV ${pj.vida} (esperado 35) y sin quemadura.`);
    const vida = pj.vida;
    aplicarDanno(pj, 5, "luz");
    aplicarDanno(pj, 5, "oscuridad");
    if (pj.vida !== vida || (Number(pj.estados.oscuridad?.valor) || 0) > 0) fallos.push("La luz o la oscuridad le afectan.");
    aplicarEfectoEnObjetivo(pj, { pv: 10, estados: [{ clave: "veneno", valor: 3, turnos: 3, probabilidad: 100 }] });
    if (pj.vida !== vida || (Number(pj.estados.veneno?.valor) || 0) > 0) fallos.push("El efecto del golpe se aplica solo.");
    activarEstado(pj, "regeneracion", 5, 3);
    activarEstado(pj, "veneno", 2, 3);
    iniciarTurno(pj);
    if (pj.vida !== vida - 2) fallos.push(`Inicio de turno con veneno 2 y regeneración 5: PV ${pj.vida} (esperado ${vida - 2}).`);
    pj = nueva();
    descansoLargo(pj);
    if (pj.vida !== 40) fallos.push("El descanso largo la cura.");
    return fallos.map(f => `Pesadilla: ${f}`);
}

/* Reglas de Sacro (13-sacro.md) sobre un personaje de prueba: coste de generar, daño por elemento y radio,
   acciones, límites de dedos y Anticuración */
export function comprobarSacro() {
    const fallos = [];
    const pj = new PJ();
    pj.cargarJSON(JSON.parse(crearPersonajePrueba().toJSONString()));
    pj.zona = "noSegura";
    pj.esUnderworld = true;
    pj.underworldHabilitado = true;
    pj.calcularCaracteristicas();
    pj.aguante = 8;
    pj.dMagico = 5;
    pj.vida = 20;
    const dedos = [
        { id: "manoIzquierda-0", elemento: "termika", origen: "generar" },
        { id: "manoIzquierda-1", elemento: "termika", origen: "generar" },
        { id: "manoIzquierda-2", elemento: "hela", origen: "generar" },
        { id: "manoIzquierda-3", elemento: "kristala", origen: "ambiente" }
    ];
    if (costeGenerar(pj, dedos) !== 11) fallos.push(`Coste de 2 Termika + 1 Hela con Aguante 8: ${costeGenerar(pj, dedos)} (esperado 11).`);
    pj.vida = 10;
    if (!motivoNoGenerar(pj, dedos)) fallos.push("Con 10 PV deja generar 11 PV.");
    pj.vida = 11;
    if (motivoNoGenerar(pj, dedos)) fallos.push("Con 11 PV no deja generar 11 PV (se puede quedar a 0).");
    const danno = Object.fromEntries(dannoElementos(pj, dedos).map(e => [e.clave, e.cantidad]));
    if (danno.termika !== 7 || danno.hela !== 5 || danno.kristala !== 5) fallos.push(`Daño por elemento: ${JSON.stringify(danno)} (esperado termika 7, hela 5, kristala 5).`);
    const enRadio = Object.fromEntries(dannoElementos(pj, dedos, { radio: 2 }).map(e => [e.clave, e.cantidad]));
    if (enRadio.termika !== 4 || factorRadio(3) !== 0.25) fallos.push(`Radio 2×2: termika ${enRadio.termika} (esperado 4: 3,75 sube); factor 3×3 ${factorRadio(3)}.`);
    // Redondeo de la magia: sube desde ,51
    if ([1.5, 1.51, 2.5, 2.51].map(redondearMagia).join() !== "1,2,2,3") fallos.push(`Redondeo de la magia: ${[1.5, 1.51, 2.5, 2.51].map(redondearMagia).join()} (esperado 1,2,2,3).`);
    // Daño físico normal en los golpes del máster: va aparte de la magia física al juntar por tipo
    const conFisico = golpesDeFilas([{ elemento: "fisico", cantidad: 2.3 }, { elemento: "fisico", cantidad: 2.3 }, { elemento: "akva", cantidad: 3 }], { juntarPorTipo: true });
    if (conFisico.length !== 2 || conFisico[0].danno[0].elemento !== "fisico" || conFisico[0].danno[0].cantidad !== 5) fallos.push(`Físico normal al juntar: ${JSON.stringify(conFisico)} (esperado 5 de físico y el Akva aparte).`);
    const golpes = golpesDeElementos(dannoElementos(pj, dedos));
    const fichas = golpes[0]?.elemental ?? [];
    const kristala = fichas.find(f => f.sacro === "kristala");
    if (golpes.length !== 1 || !golpes[0].magia || fichas.length !== 3 || kristala?.tipo !== "fisico" || !kristala.ignoraArmadura || !fichas.every(f => f.color && f.etiqueta)) {
        fallos.push("Golpe: una ficha por elemento con color y etiqueta, Kristala física que ignora la armadura, y con magia.");
    }
    const partes = partesHechizo([...dedos, { id: "pies-0", elemento: "akva", origen: "generar" }]);
    if (partes.sort().join() !== "cabeza,izquierda,pies") fallos.push(`Acciones: ${partes.join(", ")} (esperado cabeza, izquierda, pies).`);
    if (!motivoNoDedos(pj, [{ id: "pies-0", elemento: "akva", origen: "generar" }]) && !["ropa", "real"].includes(pj.equipoArmadura?.tipo || "ropa")) {
        fallos.push("Deja usar los pies sin ropa ni armadura real.");
    }
    if (!motivoNoDedos(pj, [{ id: "manoIzquierda-0", elemento: "morna", origen: "generar" }])) fallos.push("Deja generar Morna.");
    // Zona segura: generar no puede dejar por debajo de 1 PV
    pj.zona = "segura";
    pj.vida = 11;
    if (!motivoNoGenerar(pj, dedos)) fallos.push("En zona segura deja generar hasta 0 PV (mínimo 1).");
    pj.vida = 12;
    if (motivoNoGenerar(pj, dedos)) fallos.push("En zona segura no deja generar hasta quedarse en 1 PV.");
    pj.zona = "noSegura";
    // Golpes del máster: uno por fila, juntar por tipo (la Kristala aparte), único y radio
    const filas = [{ elemento: "kriogenia", cantidad: 4, estados: true }, { elemento: "kriogenia", cantidad: 4 }, { elemento: "akva", cantidad: 3 }, { elemento: "kristala", cantidad: 5 }];
    if (golpesDeFilas(filas).length !== 4) fallos.push("Golpes del máster: debería haber uno por fila.");
    const juntos = golpesDeFilas(filas, { juntarPorTipo: true });
    if (juntos.length !== 3 || juntos[0].danno[0].cantidad !== 8 || !juntos[0].estados) fallos.push(`Juntar por tipo: ${JSON.stringify(juntos)} (esperado 3 golpes, hielo 8 con estados, Akva y Kristala aparte).`);
    const unico = golpesDeFilas(filas, { unico: true, radio: 2 });
    if (unico.length !== 1 || unico[0].danno.length !== 3 || unico[0].danno[0].cantidad !== 4) fallos.push(`Un único golpe con radio 2: ${JSON.stringify(unico)} (esperado un golpe con 3 fichas, las dos Kriogenia juntas: 8 × ½ = 4).`);
    const termika = golpesDeFilas([{ elemento: "termika", cantidad: 1.6 }, { elemento: "termika", cantidad: 1.6 }], { unico: true });
    if (termika[0]?.danno.length !== 1 || termika[0].danno[0].cantidad !== 3) fallos.push(`Un único golpe con 1,6 + 1,6 de Termika: ${JSON.stringify(termika)} (esperado una ficha de 3).`);
    // Propuesta de objetos: un cristal por Kristala (capacidad = daño de un dedo, 5) llenado por orden; Metala sola = lingote
    const propuesta = propuestaObjetos(pj, [...dedos, { id: "manoDerecha-0", elemento: "kristala", origen: "generar" }]);
    if (propuesta.length !== 2 || propuesta[0].capacidad !== 5 || propuesta[0].elemento?.clave !== "termika" || propuesta[0].elemento.puntos !== 5 || propuesta[1].elemento?.clave !== "hela") {
        fallos.push(`Propuesta con 2 Kristala + 2 Termika + 1 Hela: ${JSON.stringify(propuesta.map(o => o.elemento))} (esperado Termika 5 y Hela 5).`);
    }
    const lingote = propuestaObjetos(pj, [{ id: "manoIzquierda-0", elemento: "metala" }, { id: "manoIzquierda-1", elemento: "metala" }]);
    if (lingote.length !== 1 || lingote[0].subtipo !== "herreria" || lingote[0].potencia !== 2) fallos.push("Propuesta con 2 Metala: un material de herrería de potencia 2.");
    // Llenar: el cristal vacío donde quepa; si no cabe en ninguno, el que menos pierde
    const cristal = (capacidad, elemento = null) => ({ objeto: { tipo: "arrojadiza", subtipo: "cristalElemental", capacidad, elemento, nombre: `C${capacidad}` } });
    const elegido = cristalParaLlenar(pj, [cristal(4), cristal(20), cristal(8)], "termika", 2); // floor(2 × 3,75) = 7
    if (elegido?.candidato.objeto.capacidad !== 8 || elegido.perdido) fallos.push(`Llenar 7 de Termika: elige ${elegido?.candidato.objeto.nombre} (esperado C8, sin perder).`);
    const menosPierde = cristalParaLlenar(pj, [cristal(2), cristal(4)], "termika", 2);
    if (menosPierde?.candidato.objeto.capacidad !== 4 || menosPierde.perdido !== 3) fallos.push("Llenar 7 sin hueco suficiente: debería ir al que menos pierde (C4, pierde 3).");
    // Arma a dos manos: la derecha vale para la magia pero no para guardar energía; la izquierda no
    const conEspadon = new PJ();
    conEspadon.cargarJSON(JSON.parse(pj.toJSONString()));
    conEspadon.manoIzquierda = new Equipamiento("Espadón", "", "espadon");
    conEspadon.manoDerecha = new Equipamiento();
    if (motivoDedoNoUsable(conEspadon, "manoDerecha-0") || !motivoDedoNoUsable(conEspadon, "manoIzquierda-0") || !motivoNoGuardarEnMano(conEspadon, "manoDerecha")) {
        fallos.push("Arma a dos manos: la mano derecha debe aceptar dedos (sin guardar energía) y la izquierda no.");
    }
    // Lo quitado conserva la potencia de su dueño y se quita todo o nada
    const dueno = new PJ();
    dueno.cargarJSON(JSON.parse(pj.toJSONString()));
    dueno.dMagico = 7;
    dueno.energiaManos = { manoIzquierda: { dedos: [{ elemento: "termika", puntos: null }, { elemento: "metala", puntos: null }], plays: 0 }, manoDerecha: null };
    const vista = Object.fromEntries(energiaDe(dueno).map(e => [e.elemento, e.puntos[0]]));
    if (vista.termika !== 5.25 || vista.metala !== 20) fallos.push(`Potencia al escanear: ${JSON.stringify(vista)} (esperado Termika 5,25 con daño mágico 7, Metala 20).`);
    if (quitarElementos(dueno, ["termika", "termika"]) || energiaDe(dueno).length !== 2) fallos.push("Quitar dos Termika teniendo una: no debería quitar nada.");
    const quitados = quitarElementos(dueno, ["termika"]);
    if (quitados?.[0]?.puntos !== 5.25 || energiaDe(dueno).some(e => e.elemento === "termika")) fallos.push("Quitar una Termika: debería devolver sus 5,25 puntos y quitarla.");
    // Metala: siempre 20 por dedo, tenga la potencia que tenga
    if (dannoDedo(pj, { elemento: "metala" }) !== 20 || dannoDedo(pj, { elemento: "metala", puntos: 3 }) !== 20) fallos.push("Metala debería hacer siempre 20 por dedo.");
    // Decimales: se suman sin redondear y solo se redondea el resultado (1,5 + 1,5 = 3)
    const conDecimales = golpesDeFilas([{ elemento: "kriogenia", cantidad: 1, bruto: 1.5 }, { elemento: "kriogenia", cantidad: 1, bruto: 1.5 }], { juntarPorTipo: true });
    if (conDecimales[0]?.danno[0].cantidad !== 3) fallos.push(`Juntar 1,5 + 1,5 de hielo: ${conDecimales[0]?.danno[0].cantidad} (esperado 3).`);
    // Robar de un cristal del cinturón: se ve al escanear, se quita (queda vacío) y se puede devolver
    const conCinturon = new PJ();
    conCinturon.cargarJSON(JSON.parse(pj.toJSONString()));
    const cinturon = new Equipamiento("Cinturón", "", "accesorio");
    cinturon.cinturon = { huecos: 2, objetos: [{ tipo: "arrojadiza", subtipo: "cristalElemental", nombre: "Cristal", cantidad: 1, capacidad: 10, elemento: { clave: "hela", puntos: 8 } }, null] };
    conCinturon.accesorios = [cinturon];
    const enCinturon = energiaDe(conCinturon).find(e => e.elemento === "hela");
    if (enCinturon?.puntos[0] !== 8 || enCinturon.origenes[0] !== "cinturon") fallos.push("Escanear: debería verse la Hela del cristal del cinturón (8, origen cinturón).");
    const deCristal = quitarElementos(conCinturon, ["hela"]);
    if (deCristal?.[0]?.ranura !== "accesorio-0" || cinturon.cinturon.objetos[0].elemento) fallos.push("Quitar de un cristal del cinturón: debería quedar vacío.");
    devolverElementos(conCinturon, deCristal);
    // Magia pendiente (golpes que se lanzan uno a uno): se guarda con la ficha; sin golpes por lanzar no queda nada
    const pendiente = cargarMagiaPendiente({ id: "x", golpes: [{ danno: [{ elemento: "fisico", cantidad: 4 }], lanzado: true }, { danno: [{ elemento: "hela", cantidad: 3 }] }] });
    if (pendiente?.golpes.length !== 2 || pendiente.golpes[0].danno[0].elemento !== "fisico") fallos.push("Magia pendiente: debería conservar los dos golpes (con el físico).");
    if (cargarMagiaPendiente({ golpes: [{ danno: [], lanzado: true }] }) !== null) fallos.push("Magia pendiente sin golpes por lanzar: debería quedar en null.");
    if (cinturon.cinturon.objetos[0].elemento?.puntos !== 8) fallos.push("Devolver a un cristal del cinturón: debería volver a tener 8 de Hela.");
    // Anticuración: ni regeneración, ni pociones, ni luz (sin otros estados que quiten PV al empezar turno)
    ESTADOS_LISTA.forEach(clave => { pj.estados[clave] = { valor: 0, turnos: 0 }; });
    pj.vida = 5;
    activarEstado(pj, "anticuracion", 1, 3);
    activarEstado(pj, "regeneracion", 5, 3);
    iniciarTurno(pj);
    aplicarDanno(pj, 5, "luz");
    aplicarEfectoEnObjetivo(pj, { pv: 10 });
    if (pj.vida !== 5) fallos.push(`Con Anticuración recupera PV: ${pj.vida} (esperado 5).`);
    pj.zona = "casa";
    descansoLargo(pj);
    if (pj.vida !== pj.vidaMax) fallos.push("El descanso largo no cura la Anticuración ni llena los PV.");
    return fallos.map(f => `Sacro: ${f}`);
}

/**
 * Ejecuta todas las comprobaciones y devuelve el informe.
 */
export function ejecutarDebug(personaje, documento = document) {
    const actual = verificarIdaVuelta(personaje);
    const prueba = verificarIdaVuelta(crearPersonajePrueba());
    const npc = verificarIdaVuelta(crearNpcPrueba());
    const jefe = verificarIdaVuelta(crearJefePrueba());
    const pesadilla = verificarIdaVuelta(crearPesadillaPrueba());
    return {
        idaVueltaActual: actual.diferencias,
        idaVueltaPrueba: [...prueba.diferencias, ...npc.diferencias.map(d => `NPC: ${d}`), ...jefe.diferencias.map(d => `Jefe: ${d}`),
            ...pesadilla.diferencias.map(d => `Pesadilla: ${d}`), ...comprobarPesadilla(), ...comprobarSacro()],
        camposSinGuardar: [...new Set([...actual.sinGuardar, ...prueba.sinGuardar, ...npc.sinGuardar, ...jefe.sinGuardar, ...pesadilla.sinGuardar])],
        interfaz: verificarInterfaz(personaje, documento),
        avisos: validarFicha(personaje)
    };
}
