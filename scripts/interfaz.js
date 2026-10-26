import Equipamiento, { ARMAS, TIPOS_DOS_MANOS, TIPOS_ESCUDO } from "./equipamiento.js";
import Modificador, { TURNOS_PERMANENTE } from "./modificador.js";
import PJ from "./PJ.js";
import { ejecutarTirada, combinarModos, esCritico } from "./dados.js";
import { prepararAtaque, calcularDannoAtaque } from "./ataque.js";
import {
    puedeGastarVarias, gastarVarias, partesDeMano, estaIncapacitado,
    iniciarTurno, gastarAccion, devolverAccion, puedeGastar, accionesRestantes,
    correr, puedeCorrer, puedeMoverse, velocidadMovimiento, velocidadCorrer,
    modoSigiloPorArmadura, puedeEntrarEnSigilo, entrarEnSigilo, salirDeSigilo
} from "./turno.js";
import { ESTADOS_INFO, TIPOS_DANNO, aplicarDanno, activarEstado, quitarEstado, estaActivo, estiloColor } from "./estados.js";
import { iconoSao } from "./iconos.js";
import { ejecutarDebug, crearPersonajePrueba, validarFicha } from "./debug.js";

let personaje = new PJ(); //objeto que almaacena y define el comportamiento y limites de toda la informacion relevante
/* Informacion */
let inputNombre = document.getElementById("nombre");
let inputNivel = document.getElementById("nivel");
let inputExperiencia = document.getElementById("experiencia");
let inputVida = document.getElementById("vida");
let vidaMaxSpan = document.getElementById("vidaMax");
let arteInp = document.getElementById("arte");
let arteSpan = document.getElementById("arteMax");

/* Elementos Atributos */
let spanFortaleza = document.getElementById("fortaleza");
let spanReflejos = document.getElementById("reflejos");
let spanVoluntad = document.getElementById("voluntad");
let spanMente = document.getElementById("inteligencia");

/* Elementos habilidades */
let atletismoInp = document.getElementById("atletismo")
let combateInp = document.getElementById("combate")
let percepcionInp = document.getElementById("percepcion")
let sigiloInp = document.getElementById("subterfugio")
let carismaInp = document.getElementById("comunicacion")
let culturaInp = document.getElementById("cultura")
let profesionInp = document.getElementById("profesion")
let sacroInp = document.getElementById("sacro")

/* Caracteristicas */
let cantAguante = document.getElementById("aguante");
let cantDefensa = document.getElementById("defensa");
let cantIniciativa = document.getElementById("iniciativa");
let cantMovimiento = document.getElementById("vMovimiento");
let cantDannoCac = document.getElementById("dFisico");
let cantDannoDist = document.getElementById("dDistancia");
let cantDannoMagic = document.getElementById("dMagico");
let cantArmadura = document.getElementById("armadura");

let inputs = document.querySelectorAll('#habilidadesDiv input, #atributosDiv input');

/* Evento generico que introduce nuevos valores en el atributo del objeto personaje dependiendo del id del input que lo contiene */
for (const element of inputs) {
    const validarYActualizar = () => {
        let val = Number(element.value);

        // Si es un input de habilidad, aplicar restricciones de límite máximo y puntos disponibles
        if (element.closest('#habilidadesDiv')) {
            const maxPermitido = personaje.getMaxHabilidad();
            const valorAnterior = Number(personaje[element.id]) || 0;
            const disponibles = personaje.getPuntosHabilidadDisponibles();
            const maximoPosible = Math.min(maxPermitido, valorAnterior + disponibles);

            if (val > maximoPosible) {
                val = maximoPosible;
            } else if (val < 0 || isNaN(val)) {
                val = 0;
            }
            element.value = val;
        }

        // Si es un input de atributo/característica, aplicar restricciones de límite máximo (9) y límite total de puntos (22)
        if (element.closest('#atributosDiv')) {
            // Si se introdujo más de un dígito (por ejemplo, al escribir detrás del número existente), conservar el último dígito
            if (element.value.length > 1) {
                element.value = element.value.slice(-1);
            }
            val = Number(element.value);

            const maxPermitido = personaje.getMaxCaracteristicas();
            const valorAnterior = Number(personaje[element.id]) || 0;
            const gastadosOtros = personaje.getPuntosCaracteristicasGastados() - valorAnterior;
            const limiteTotal = personaje.getPuntosCaracteristicasLimite();
            const maximoPosible = Math.min(maxPermitido, limiteTotal - gastadosOtros);

            if (val > maximoPosible) {
                val = maximoPosible;
            } else if (val < 1 || isNaN(val)) {
                val = 1;
            }
            element.value = val;
        }

        personaje[element.id] = val;
        personaje.calcularCaracteristicas();
        actualizarTodo();
    };

    if (element.closest('#atributosDiv')) {
        element.addEventListener('keydown', (e) => {
            if (e.key >= '0' && e.key <= '9' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                element.value = e.key;
                validarYActualizar();
            }
        });
    }

    element.addEventListener('focusout', validarYActualizar);
    element.addEventListener('change', validarYActualizar);
    element.addEventListener('input', validarYActualizar);
}

/* Introduccion de datos en textareas y manejo general */
let textareas = document.getElementsByTagName("textarea");
for (const textarea of textareas) {
    textarea.addEventListener('focusout', function (event) {
        personaje[textarea.id] = event.target.value
        console.log(personaje[textarea.id])
    }
    )
}

/* Eventos para la barra de vida SAO y datos principales */
inputNombre.addEventListener('change', (e) => {
    personaje.nombre = e.target.value;
    actualizarTodo();
});

inputNivel.addEventListener('change', (e) => {
    personaje.nivel = Number(e.target.value);
    personaje.calcularCaracteristicas();
    actualizarTodo();
});

inputVida.addEventListener('change', (e) => {
    personaje.vida = Number(e.target.value);
    actualizarTodo();
});

inputExperiencia.addEventListener('change', (e) => {
    personaje.setExp(Number(e.target.value));
    actualizarTodo();
});

arteInp.addEventListener('change', (e) => {
    let val = Number(e.target.value);
    if (val < 0) val = 0;
    if (val > personaje.puntosArteMax) val = personaje.puntosArteMax;
    personaje.puntosArte = val;
    actualizarTodo();
});

document.getElementById('btn-arte-menos').addEventListener('click', () => {
    personaje.puntosArte = Math.max(0, personaje.puntosArte - 1);
    actualizarTodo();
});

document.getElementById('btn-arte-mas').addEventListener('click', () => {
    personaje.puntosArte = Math.min(personaje.puntosArteMax, personaje.puntosArte + 1);
    actualizarTodo();
});

// Asignar listeners a los botones de subir (+)
document.querySelectorAll('.btn-hab-mas').forEach(boton => {
    boton.addEventListener('click', () => {
        const hab = boton.dataset.hab;
        if (personaje.subirHabilidad(hab)) {
            actualizarTodo();
        }
    });
});
// Asignar listeners a los botones de restar (-)
document.querySelectorAll('.btn-hab-menos').forEach(boton => {
    boton.addEventListener('click', () => {
        const hab = boton.dataset.hab;
        if (personaje.bajarHabilidad(hab)) {
            actualizarTodo();
        }
    });
});

const track = document.getElementById('sao-hp-track');
let isDraggingHealth = false;

function updateHealthFromMouse(e) {
    const rect = track.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let percentage = x / rect.width;
    
    if (percentage < 0) percentage = 0;
    if (percentage > 1) percentage = 1;

    personaje.vida = Math.round(percentage * personaje.vidaMax);
    actualizarTodo();
}

track.addEventListener('mousedown', (e) => {
    isDraggingHealth = true;
    updateHealthFromMouse(e);
});

document.addEventListener('mousemove', (e) => {
    if (isDraggingHealth) {
        updateHealthFromMouse(e);
        e.preventDefault(); // Evita la selección de texto no deseada al arrastrar
    }
});

document.addEventListener('mouseup', () => {
    isDraggingHealth = false;
});

/* Lógica de click en la barra de Experiencia para abrir el modal */
const expTrack = document.getElementById('sao-exp-track');

expTrack.addEventListener('click', () => {
    const modalEl = document.getElementById('modalExperiencia');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    document.getElementById('inputModExp').value = 0;
    modal.show();
});


//fixme: aixo es el que s'ha de modificar per a que no nomes puji el nivell
document.getElementById('btnAplicarExp').addEventListener('click', () => {
    let expToModify = Number(document.getElementById('inputModExp').value);
    let newExp = Math.max(0, personaje.experiencia + expToModify); // Evita que la experiencia total sea menor a 0
    personaje.setExp(newExp);
    actualizarTodo();
    
    const modalEl = document.getElementById('modalExperiencia');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
});

/* Sistema de Sonido */
const lowLifeSfx = new Audio('./sfx/low_life.wav');
lowLifeSfx.loop = true;
const linkStartSfx = new Audio('./sfx/link_start.mp3');

let isGlobalMute = false;

export function setGlobalMute(muteStatus) {
    isGlobalMute = muteStatus;
    lowLifeSfx.muted = isGlobalMute;
    linkStartSfx.muted = isGlobalMute;
    // Añadir aquí otros sonidos en el futuro si es necesario
}

function actualizarTodo() {
    actualizarInformacion();
    actualizarAtributos();
    actualizarHabilidades();
    actualizarCaracteristicas();
    actuaizarTextos();
    actualizarEquipamiento();
    actualizarModificadores();
    parseModificadoresEquipo();
    generarAccesorios();
    parseModificadoresAccesorios();
    actualizarInventario();
    actualizarAcciones();
    actualizarEstados();
}

/* Inventario ________________________________________________________________ */
const listaInventario = document.getElementById("listaInventario");

/* Un único listener para todas las filas: sigue funcionando aunque se regeneren */
listaInventario.addEventListener("input", (e) => {
    const fila = e.target.closest(".filaInventario");
    if (!fila) return;
    const item = personaje.inventario[Number(fila.dataset.index)];
    if (!item) return;
    if (e.target.classList.contains("itemInv")) item.nombre = e.target.value;
    if (e.target.classList.contains("cantidadInv")) item.cantidad = Math.max(0, Number(e.target.value) || 0);
});

function actualizarInventario() {
    // Las filas solo se regeneran si cambia el número de huecos (p. ej. al cargar una ficha)
    if (listaInventario.children.length !== personaje.inventario.length) {
        listaInventario.innerHTML = personaje.inventario.map((_, index) => `
            <p class="filaInventario" data-index="${index}">
                <input type="text" class="itemInv" placeholder="Objeto">
                <input type="number" class="cantidadInv" min="0" placeholder="0">
            </p>`).join("");
    }

    personaje.inventario.forEach((item, index) => {
        const fila = listaInventario.children[index];
        const inputNombre = fila.querySelector(".itemInv");
        const inputCantidad = fila.querySelector(".cantidadInv");
        // No se pisa el campo que el usuario está editando
        if (document.activeElement !== inputNombre) inputNombre.value = item.nombre;
        if (document.activeElement !== inputCantidad) inputCantidad.value = item.cantidad || "";
    });
}

function actualizarInformacion() {
    inputNombre.value = personaje.nombre;
    inputNivel.value = personaje.nivel;
    inputExperiencia.value = personaje.experiencia;
    inputVida.value = personaje.vida;
    vidaMaxSpan.innerHTML = personaje.vidaMax;
    arteInp.value = personaje.puntosArte;
    arteSpan.innerHTML = personaje.puntosArteMax;

    /* Actualizar la barra de EXP visual */
    let expSpan = document.getElementById("experienciaMax");
    if (expSpan) expSpan.innerHTML = personaje.experienciaMax;

    let expFill = document.getElementById('exp-bar-fill');
    if (expFill) {
        let expPct = personaje.experienciaMax > 0 ? (personaje.experiencia / personaje.experienciaMax) * 100 : 0;
        expPct = Math.max(0, Math.min(100, expPct));
        expFill.style.width = expPct + '%';
    }

    /* Actualizar la barra de Arte visual */
    let arteFill = document.getElementById('arte-bar-fill');
    if (arteFill) {
        let artePct = personaje.puntosArteMax > 0 ? (personaje.puntosArte / personaje.puntosArteMax) * 100 : 0;
        artePct = Math.max(0, Math.min(100, artePct));
        arteFill.style.width = artePct + '%';
    }

    /* Actualizar la barra de vida visual */
    let hpFill = document.getElementById('hp-bar-fill');
    if (hpFill) {
        let pct = personaje.vidaMax > 0 ? (personaje.vida / personaje.vidaMax) * 100 : 0;
        pct = Math.max(0, Math.min(100, pct));
        hpFill.style.width = pct + '%';

        hpFill.classList.remove('hp-orange', 'hp-red');
        if (pct < 15) {
            hpFill.classList.add('hp-red');
            if (!isGlobalMute && lowLifeSfx.paused) {
                lowLifeSfx.play().catch(e => console.warn("El navegador bloqueó el autoplay del audio.", e));
            }
        } else {
            if (pct < 40) {
                hpFill.classList.add('hp-orange');
            }
            if (!lowLifeSfx.paused) {
                lowLifeSfx.pause();
            }
        }
    }
}

function actualizarAtributos() {

    const disponibles = personaje.getPuntosCaracteristicasDisponibles();
    const totales = personaje.getPuntosCaracteristicasTotales();
    const gastados = personaje.getPuntosCaracteristicasGastados();
    const dispSpanCar = document.getElementById("puntosCarDisponibles");
    const totSpanCar = document.getElementById("puntosCarTotal");
    const contadorCar = document.getElementById("contadorPuntosCar");
    const maxPorCar = personaje.getMaxCaracteristicas();
    const limiteTotal = personaje.getPuntosCaracteristicasLimite();

    if (dispSpanCar) {
        dispSpanCar.innerText = disponibles;
        if (gastados === 19 || gastados === 20) {
            dispSpanCar.style.color = '#ff4d4d'; // Rojo cuando se usan 19 o 20 puntos
        } else if (gastados === 21 || gastados === 22) {
            dispSpanCar.style.color = '#c040fb'; // Morado cuando se usan 21 o 22 puntos
        } else {
            dispSpanCar.style.color = ''; // Color por defecto
        }
    }

    if (totSpanCar) totSpanCar.innerText = totales;
    if (contadorCar) {
        contadorCar.style.display = disponibles === 0 ? 'none' : '';
    }
    
    spanFortaleza.value = personaje.fortaleza;
    spanReflejos.value = personaje.reflejos;
    spanVoluntad.value = personaje.voluntad;
    spanMente.value = personaje.inteligencia;
    


    
    const contenedores = document.querySelectorAll('#atributosDiv > div');
    contenedores.forEach(contenedor => {
        const input = contenedor.querySelector('input');
        if (!input) return;

        // Establecer atributos HTML5 min y max dinámicos según el nivel y el límite total de 22 puntos
        input.min = 1;
        const valorActual = Number(personaje[input.id]) || 0;
        const gastadosOtros = gastados - valorActual;
        const maximoPorPuntos = limiteTotal - gastadosOtros;
        const maxPermitido = Math.min(maxPorCar, maximoPorPuntos);
        input.max = maxPermitido;

        // Si por cambio de nivel o límite el valor actual del personaje supera el nuevo máximo, ajustarlo
        if (personaje[input.id] > maxPermitido) {
            personaje[input.id] = maxPermitido;
            input.value = maxPermitido;
        }

    });
}

function actualizarHabilidades() {
    atletismoInp.value = personaje.atletismo;
    combateInp.value = personaje.combate;
    percepcionInp.value = personaje.percepcion;
    sigiloInp.value = personaje.subterfugio;
    carismaInp.value = personaje.comunicacion;
    culturaInp.value = personaje.cultura;
    profesionInp.value = personaje.profesion;
    sacroInp.value = personaje.sacro;

    // 2. Actualizar el contador superior
    const disponibles = personaje.getPuntosHabilidadDisponibles();
    const totales = personaje.getPuntosHabilidadTotales();
    const maxPorHab = personaje.getMaxHabilidad();
    const dispSpan = document.getElementById("puntosHabDisponibles");
    const totSpan = document.getElementById("puntosHabTotal");
    if (dispSpan) dispSpan.innerText = disponibles;
    if (totSpan) totSpan.innerText = totales;
    // 3. Controlar la visibilidad de los botones en cada habilidad
    const contenedores = document.querySelectorAll('#habilidadesDiv > div');
    contenedores.forEach(contenedor => {
        const input = contenedor.querySelector('input');
        const btnMenos = contenedor.querySelector('.btn-hab-menos');
        const btnMas = contenedor.querySelector('.btn-hab-mas');
        if (!input) return;

        // Establecer atributos HTML5 min y max dinámicos según el nivel
        input.min = 0;
        input.max = maxPorHab;

        // Si por cambio de nivel el valor actual del personaje supera el nuevo máximo, ajustarlo
        if (personaje[input.id] > maxPorHab) {
            personaje[input.id] = maxPorHab;
            input.value = maxPorHab;
        }

        const valorActual = Number(input.value) || 0;
        // Botón '+': solo visible si hay puntos disponibles y no se ha llegado al tope
        if (btnMas) {
            if (disponibles > 0 && valorActual < maxPorHab) {
                btnMas.classList.remove('oculto');
            } else {
                btnMas.classList.add('oculto');
            }
        }
        // Botón '-': visible si la habilidad tiene puntos (> 0)
        if (btnMenos) {
            if (valorActual > 0) {
                btnMenos.classList.remove('oculto');
            } else {
                btnMenos.classList.add('oculto');
            }
        }
    });
}

function actuaizarTextos() {
    for (const textarea of textareas) {
        textarea.value = personaje[textarea.id];
    }
}

function actualizarCaracteristicas() {
    cantAguante.innerHTML = personaje.aguante;
    cantDefensa.innerHTML = personaje.defensa;
    cantIniciativa.innerHTML = personaje.iniciativa;
    cantMovimiento.innerHTML = personaje.vMovimiento;
    cantDannoCac.innerHTML = personaje.dFisico;
    cantDannoDist.innerHTML = personaje.dDistancia;
    cantDannoMagic.innerHTML = personaje.dMagico;
    cantArmadura.innerHTML = personaje.armadura;
}

/* Funcion de carga */
document.getElementById('fileInput').addEventListener('change', function (event) {
    const file = event.target.files[0]; // Get the selected file
    if (file && file.type === 'application/json') {  // Check if the file is a JSON file
        const reader = new FileReader();

        reader.onload = function (e) {
            try {
                const jsonData = JSON.parse(e.target.result);  // Parse the JSON string into an object
                personaje.cargarJSON(jsonData);
                actualizarTodo();
                if (!isGlobalMute) {
                    linkStartSfx.play().catch(e => console.warn("El navegador bloqueó el autoplay del audio.", e));
                }

            } catch (error) {
                console.error('Error parsing JSON:', error);
            }
        };

        reader.onerror = function () {
            console.error('Error reading file');
        };

        reader.readAsText(file);  // Read the file as a text string
    } else {
        alert('Elije un archivo adecuado');
    }
});

/* Boton de guardado */
document.getElementById('botonGuardar').addEventListener('click', function (event) {
    personaje.guardarJSON();
});



/* Modificadores ___________________________________________________________ */
const listadoModificadores = document.getElementById("listadoModificadores");

document.getElementById("anadirMod").addEventListener("click", () => {
    // Por defecto es permanente: dura hasta que el usuario lo edite o lo elimine
    personaje.modificadores.push(new Modificador("", "atletismo", 0, TURNOS_PERMANENTE));
    personaje.calcularCaracteristicas();
    actualizarTodo();
    listadoModificadores.lastElementChild?.querySelector(".nombreMod")?.focus();
});

/* Atributos que se pueden modificar (valor = nombre que usa PJ.getModificador) */
const GRUPOS_ATRIBUTOS = [
    ["Habilidades", [
        ["atletismo", "Atletismo"], ["combate", "Combate"], ["percepcion", "Percepción"],
        ["subterfugio", "Sigilo"], ["comunicacion", "Carisma"], ["cultura", "Cultura"],
        ["profesion", "Profesión"], ["sacro", "Sacro"]
    ]],
    ["Combate", [
        ["defensa", "Defensa"], ["armadura", "Armadura"], ["iniciativa", "Iniciativa"],
        ["vMovimiento", "Movimiento"], ["dFisico", "Daño CaC"], ["dDistancia", "Daño a distancia"],
        ["dMagico", "Daño mágico"]
    ]],
    ["Otros", [
        ["aguante", "Aguante"], ["vidaMax", "PV máximos"], ["arte", "PA máximos"], ["espacios", "Memoria de artes"]
    ]]
];

function opcionesAtributo(seleccionado) {
    const conocido = GRUPOS_ATRIBUTOS.some(([, atributos]) => atributos.some(([valor]) => valor === seleccionado));
    // Un atributo que ya no está en la lista (fichas antiguas) se conserva para no perderlo
    const desconocido = !conocido ? `<option selected value="${seleccionado ?? ""}">(${seleccionado || "sin atributo"})</option>` : "";
    return desconocido + GRUPOS_ATRIBUTOS.map(([grupo, atributos]) =>
        `<optgroup label="${grupo}">${atributos.map(([valor, etiqueta]) =>
            `<option ${valor === seleccionado ? "selected" : ""} value="${valor}">${etiqueta}</option>`).join("")}</optgroup>`
    ).join("");
}

/* Un único listener por tipo de evento para toda la lista: sigue funcionando aunque se regenere */
function modificadorDeEvento(e) {
    const fila = e.target.closest(".fila-modificador");
    return fila ? personaje.modificadores[Number(fila.dataset.index)] : null;
}

listadoModificadores.addEventListener("input", (e) => {
    const mod = modificadorDeEvento(e);
    if (mod && e.target.classList.contains("nombreMod")) mod.nombre = e.target.value;
});

listadoModificadores.addEventListener("change", (e) => {
    const mod = modificadorDeEvento(e);
    if (!mod) return;
    const fila = e.target.closest(".fila-modificador");
    if (e.target.classList.contains("listValores")) mod.modificado = e.target.value;
    if (e.target.classList.contains("cantidadMod")) mod.numero = parseInt(e.target.value) || 0;
    if (e.target.classList.contains("duracionMod")) {
        // Un modificador temporal dura al menos 1 turno
        mod.turnos = Math.max(1, parseInt(e.target.value) || 1);
    }
    if (e.target.classList.contains("checkPermanenteMod")) {
        mod.turnos = e.target.checked
            ? TURNOS_PERMANENTE
            : Math.max(1, parseInt(fila.querySelector(".duracionMod").value) || 1);
    }
    if (e.target.classList.contains("nombreMod")) return; // el nombre no cambia ningún cálculo
    personaje.calcularCaracteristicas();
    actualizarTodo();
});

listadoModificadores.addEventListener("click", (e) => {
    if (!e.target.closest(".quitar-mod")) return;
    const fila = e.target.closest(".fila-modificador");
    personaje.modificadores.splice(Number(fila.dataset.index), 1);
    personaje.calcularCaracteristicas();
    actualizarTodo();
});

function actualizarModificadores() {
    // Las filas solo se regeneran si cambia el número de modificadores, para no perder el foco
    if (listadoModificadores.children.length !== personaje.modificadores.length) {
        listadoModificadores.innerHTML = personaje.modificadores.map((mod, index) => `
            <div class="fila-modificador" data-index="${index}">
                <div class="fila-mod-cabecera">
                    <input type="text" class="nombreMod" placeholder="Nombre del modificador" aria-label="Nombre del modificador">
                    <button type="button" class="quitar-mod" title="Eliminar modificador" aria-label="Eliminar modificador">×</button>
                </div>
                <div class="fila-mod-campos">
                    <select class="listValores" aria-label="Atributo">${opcionesAtributo(mod.modificado)}</select>
                    <input type="number" class="cantidadMod" aria-label="Cantidad" title="Cantidad (negativa para restar)">
                    <label>Turnos <input type="number" min="1" class="duracionMod"></label>
                    <label><input type="checkbox" class="checkPermanenteMod"> Permanente</label>
                </div>
                <span class="pista-mod"></span>
            </div>`).join("");
    }

    personaje.modificadores.forEach((mod, index) => {
        const fila = listadoModificadores.children[index];
        const permanente = Modificador.esPermanente(mod);
        const numero = Number(mod.numero) || 0;
        const inputNombre = fila.querySelector(".nombreMod");
        const select = fila.querySelector(".listValores");
        const inputCantidad = fila.querySelector(".cantidadMod");
        const inputTurnos = fila.querySelector(".duracionMod");

        // No se pisa el campo que el usuario está editando
        if (document.activeElement !== inputNombre) inputNombre.value = mod.nombre === "nombre" ? "" : (mod.nombre ?? "");
        if (document.activeElement !== select && select.querySelector(`option[value="${mod.modificado}"]`)) select.value = mod.modificado;
        if (document.activeElement !== inputCantidad) inputCantidad.value = numero;
        if (document.activeElement !== inputTurnos) inputTurnos.value = permanente ? "" : mod.turnos;
        inputTurnos.disabled = permanente;
        fila.querySelector(".checkPermanenteMod").checked = permanente;

        fila.classList.toggle("mod-positivo", numero > 0);
        fila.classList.toggle("mod-negativo", numero < 0);
        fila.querySelector(".pista-mod").textContent = permanente
            ? "Permanente: dura hasta que lo edites o lo borres"
            : `Quedan ${mod.turnos} turno${mod.turnos === 1 ? "" : "s"}`;
    });
}

/* Equipo ___________________________________________________________________________________ */
function getPropiedadEquipo(elemento) {
    if (!elemento) return null;
    if (elemento.classList.contains("manoIzquierda")) return "manoIzquierda";
    if (elemento.classList.contains("manoDerecha")) return "manoDerecha";
    if (elemento.classList.contains("equipoArmadura")) return "equipoArmadura";
    return null;
}

function getCantidadAccesoriosPorArmadura(tipoArmadura) {
    const tipo = (tipoArmadura || "").toLowerCase().trim();
    switch (tipo) {
        case "pesada": return 0;
        case "media": return 1;
        case "ligera": return 2;
        case "ropa":
        case "real": return 3;
        default: return 0;
    }
}

function equipamientoTieneContenido(propEquipo) {
    const item = personaje[propEquipo];
    if (!item) return false;
    const tieneNombre = Boolean(item.nombre && item.nombre.trim().length > 0);
    const tieneDanno = Boolean(item.danno && Number(item.danno) !== 0);
    const tienePen = Boolean(item.penalizacionAtletismo && Number(item.penalizacionAtletismo) !== 0);
    const tieneArm = Boolean(item.armadura && Number(item.armadura) !== 0) || Boolean(item.defensa && Number(item.defensa) !== 0);
    const tieneMods = Boolean(Array.isArray(item.modificadores) && item.modificadores.length > 0);
    return tieneNombre || tieneDanno || tienePen || tieneArm || tieneMods;
}

function limpiarContenidoEquipamiento(propEquipo) {
    const item = personaje[propEquipo];
    if (!item) return;
    item.nombre = "";
    item.danno = 0;
    item.penalizacionAtletismo = 0;
    item.armadura = 0;
    item.defensa = 0;
    item.enUso = false;
    item.modificadores = [];
}


const CONFIG_MANOS = [
    { prop: "manoIzquierda", titulo: "Mano izquierda:" },
    { prop: "manoDerecha", titulo: "Mano derecha:" }
];

function construirManosEquipamiento() {
    const grid = document.querySelector(".equipamiento-manos-grid");
    const template = document.getElementById("templateManoEquipamiento");
    if (!grid || !template) return;

    grid.innerHTML = "";
    CONFIG_MANOS.forEach(cfg => {
        const clon = template.content.cloneNode(true);
        const card = clon.querySelector(".equipamiento");
        card.classList.add(cfg.prop);
        const titulo = clon.querySelector(".tituloMano");
        if (titulo) titulo.innerText = cfg.titulo;
        grid.appendChild(clon);
    });
}

let cambioEquipoPendiente = null;

function inicializarEquipamiento() {
    const modalEl = document.getElementById("modalConfirmarCambioEquipo");
    const modalInstance = modalEl && window.bootstrap ? bootstrap.Modal.getOrCreateInstance(modalEl) : null;

    const cancelarCambio = () => {
        if (cambioEquipoPendiente) {
            cambioEquipoPendiente.selectElement.value = cambioEquipoPendiente.valorAnterior;
            cambioEquipoPendiente = null;
        }
        if (modalInstance) modalInstance.hide();
    };

    const btnCancelar = document.getElementById("btnCancelarCambioEquipo");
    const btnCancelarX = document.getElementById("btnCancelarCambioEquipoX");
    const btnConfirmar = document.getElementById("btnConfirmarCambioEquipo");

    if (btnCancelar) btnCancelar.addEventListener("click", cancelarCambio);
    if (btnCancelarX) btnCancelarX.addEventListener("click", cancelarCambio);
    if (modalEl) {
        modalEl.addEventListener("hidden.bs.modal", () => {
            if (cambioEquipoPendiente) {
                cambioEquipoPendiente.selectElement.value = cambioEquipoPendiente.valorAnterior;
                cambioEquipoPendiente = null;
            }
        });
    }

    if (btnConfirmar) {
        btnConfirmar.addEventListener("click", () => {
            if (cambioEquipoPendiente) {
                const { selectElement, propEquipo, nuevoTipo } = cambioEquipoPendiente;
                limpiarContenidoEquipamiento(propEquipo);
                selectElement.dataset.valorActual = nuevoTipo;
                personaje[propEquipo].tipo = nuevoTipo;
                cambioEquipoPendiente = null;
                if (modalInstance) modalInstance.hide();
                personaje.calcularCaracteristicas();
                actualizarTodo();
            }
        });
    }

    document.querySelectorAll(".equipamiento").forEach(elemento => {
        const propEquipo = getPropiedadEquipo(elemento);
        if (!propEquipo) return;

        const select = elemento.querySelector(".tipoEquipo");
        const inputNombre = elemento.querySelector(".inputNombreEquipo");
        const inputDanno = elemento.querySelector(".inputDannoEquipo");
        const inputDefensa = elemento.querySelector(".inputDefensaEquipo");
        const inputPen = elemento.querySelector(".inputPenalizacionAtletismo");
        const inputArm = elemento.querySelector(".inputValorArmadura");
        const btnUsar = elemento.querySelector(".btn-usar-equipo");
        const btnAddMod = elemento.querySelector(".btn-anadir-mod-equipo");

        if (select) {
            select.dataset.valorActual = select.value;
            select.addEventListener("change", (e) => {
                const nuevoTipo = e.target.value;
                const valorAnterior = e.target.dataset.valorActual || "";

                if (propEquipo === "manoIzquierda" || propEquipo === "manoDerecha") {
                    const otraMano = (propEquipo === "manoIzquierda") ? "manoDerecha" : "manoIzquierda";
                    const otroItem = personaje[otraMano];
                    const otroTipo = otroItem?.tipo || "";
                    const otraManoOcupada = Boolean(otroTipo !== "") || equipamientoTieneContenido(otraMano);

                    // Validación de armas a dos manos: solo permitir si no hay nada en la otra mano
                    if (TIPOS_DOS_MANOS.includes(nuevoTipo)) {
                        if (otraManoOcupada) {
                            alert("Solo puedes equipar un equipamiento a dos manos si no hay nada en la otra mano.");
                            e.target.value = valorAnterior;
                            return;
                        }
                    }

                    // Validación de estoque: solo se puede equipar si la otra mano está vacía o tiene un escudo
                    if (nuevoTipo === "estoque") {
                        if (otraManoOcupada && otroTipo !== "escudo") {
                            alert("El estoque solo se puede equipar si la otra mano está vacía o tiene un escudo.");
                            e.target.value = valorAnterior;
                            return;
                        }
                    }

                    // Validación si la otra mano ya tiene un estoque: la mano actual solo puede ser vacía o escudo
                    if (otroTipo === "estoque" && nuevoTipo !== "" && nuevoTipo !== "escudo") {
                        alert("Con un estoque equipado en la otra mano, solo puedes equipar un escudo o dejar la mano vacía.");
                        e.target.value = valorAnterior;
                        return;
                    }
                }

                if (equipamientoTieneContenido(propEquipo)) {
                    cambioEquipoPendiente = {
                        selectElement: e.target,
                        propEquipo: propEquipo,
                        nuevoTipo: nuevoTipo,
                        valorAnterior: valorAnterior
                    };
                    if (modalInstance) {
                        modalInstance.show();
                    } else if (confirm("Al cambiar el tipo de equipamiento se borrará el contenido actual asignado a este espacio. ¿Deseas continuar?")) {
                        limpiarContenidoEquipamiento(propEquipo);
                        e.target.dataset.valorActual = nuevoTipo;
                        personaje[propEquipo].tipo = nuevoTipo;
                        cambioEquipoPendiente = null;
                        personaje.calcularCaracteristicas();
                        actualizarTodo();
                    } else {
                        e.target.value = valorAnterior;
                        cambioEquipoPendiente = null;
                    }
                } else {
                    e.target.dataset.valorActual = nuevoTipo;
                    personaje[propEquipo].tipo = nuevoTipo;
                    personaje[propEquipo].enUso = false;
                    personaje.calcularCaracteristicas();
                    actualizarTodo();
                }
            });
        }

        if (inputNombre) {
            inputNombre.addEventListener("input", (e) => {
                personaje[propEquipo].nombre = e.target.value;
                if (btnUsar) actualizarBotonUsar(btnUsar, propEquipo);
            });
        }

        if (inputDanno) {
            inputDanno.addEventListener("input", (e) => {
                personaje[propEquipo].danno = Number(e.target.value) || 0;
                if (btnUsar) actualizarBotonUsar(btnUsar, propEquipo);
            });
        }

        if (inputDefensa) {
            inputDefensa.addEventListener("input", (e) => {
                personaje[propEquipo].defensa = Number(e.target.value) || 0;
                if (btnUsar) actualizarBotonUsar(btnUsar, propEquipo);
                personaje.calcularCaracteristicas();
                actualizarCaracteristicas();
            });
        }

        if (inputPen) {
            inputPen.addEventListener("input", (e) => {
                personaje[propEquipo].penalizacionAtletismo = Number(e.target.value) || 0;
                personaje.calcularCaracteristicas();
                actualizarCaracteristicas();
            });
        }

        if (inputArm) {
            inputArm.addEventListener("input", (e) => {
                personaje[propEquipo].armadura = Number(e.target.value) || 0;
                personaje.calcularCaracteristicas();
                actualizarCaracteristicas();
            });
        }

        if (btnUsar) {
            btnUsar.addEventListener("click", () => usarEquipo(propEquipo));
        }

        if (btnAddMod) {
            btnAddMod.addEventListener("click", () => {
                if (!Array.isArray(personaje[propEquipo].modificadores)) {
                    personaje[propEquipo].modificadores = [];
                }
                personaje[propEquipo].modificadores.push(new Modificador("Nombre", "atletismo", 0, TURNOS_PERMANENTE));
                parseModificadoresEquipo();
                personaje.calcularCaracteristicas();
                actualizarTodo();
            });
        }
    });
}

function actualizarEquipamiento() {
    const manosGrid = document.querySelector(".equipamiento-manos-grid");
    const elIzq = document.querySelector(".manoIzquierda.equipamiento");
    const elDer = document.querySelector(".manoDerecha.equipamiento");

    const esDosManosIzq = TIPOS_DOS_MANOS.includes(personaje.manoIzquierda?.tipo);
    const esDosManosDer = TIPOS_DOS_MANOS.includes(personaje.manoDerecha?.tipo);

    if (esDosManosIzq) {
        if (manosGrid) manosGrid.classList.add("dos-manos");
        if (elIzq) {
            elIzq.style.display = "flex";
            const titulo = elIzq.querySelector(".tituloMano");
            if (titulo) titulo.innerText = "Dos manos:";
        }
        if (elDer) elDer.style.display = "none";
    } else if (esDosManosDer) {
        if (manosGrid) manosGrid.classList.add("dos-manos");
        if (elDer) {
            elDer.style.display = "flex";
            const titulo = elDer.querySelector(".tituloMano");
            if (titulo) titulo.innerText = "Dos manos:";
        }
        if (elIzq) elIzq.style.display = "none";
    } else {
        if (manosGrid) manosGrid.classList.remove("dos-manos");
        if (elIzq) {
            elIzq.style.display = "flex";
            const titulo = elIzq.querySelector(".tituloMano");
            if (titulo) titulo.innerText = "Mano izquierda:";
        }
        if (elDer) {
            elDer.style.display = "flex";
            const titulo = elDer.querySelector(".tituloMano");
            if (titulo) titulo.innerText = "Mano derecha:";
        }
    }

    // Deshabilitar opciones no permitidas según el equipamiento de la otra mano
    const tipoIzq = personaje.manoIzquierda?.tipo || "";
    const tipoDer = personaje.manoDerecha?.tipo || "";
    const izqTieneAlgo = Boolean(tipoIzq !== "") || equipamientoTieneContenido("manoIzquierda");
    const derTieneAlgo = Boolean(tipoDer !== "") || equipamientoTieneContenido("manoDerecha");
    const izqEsEstoque = (tipoIzq === "estoque");
    const derEsEstoque = (tipoDer === "estoque");

    // Opciones para Mano Derecha según Mano Izquierda
    if (elDer) {
        const selectDer = elDer.querySelector(".tipoEquipo");
        if (selectDer) {
            Array.from(selectDer.options).forEach(opt => {
                if (izqEsEstoque) {
                    // Si en la mano izquierda hay un estoque, en la derecha solo puede haber vacío o escudo
                    opt.disabled = (opt.value !== "" && opt.value !== "escudo");
                } else {
                    if (TIPOS_DOS_MANOS.includes(opt.value)) {
                        opt.disabled = izqTieneAlgo;
                    } else if (opt.value === "estoque") {
                        // El estoque solo se permite si la otra mano está vacía o tiene un escudo
                        opt.disabled = izqTieneAlgo && (tipoIzq !== "escudo");
                    } else {
                        opt.disabled = false;
                    }
                }
            });
        }
    }

    // Opciones para Mano Izquierda según Mano Derecha
    if (elIzq) {
        const selectIzq = elIzq.querySelector(".tipoEquipo");
        if (selectIzq) {
            Array.from(selectIzq.options).forEach(opt => {
                if (derEsEstoque) {
                    // Si en la mano derecha hay un estoque, en la izquierda solo puede haber vacío o escudo
                    opt.disabled = (opt.value !== "" && opt.value !== "escudo");
                } else {
                    if (TIPOS_DOS_MANOS.includes(opt.value)) {
                        opt.disabled = derTieneAlgo;
                    } else if (opt.value === "estoque") {
                        // El estoque solo se permite si la otra mano está vacía o tiene un escudo
                        opt.disabled = derTieneAlgo && (tipoDer !== "escudo");
                    } else {
                        opt.disabled = false;
                    }
                }
            });
        }
    }

    document.querySelectorAll(".equipamiento").forEach(elemento => {
        const propEquipo = getPropiedadEquipo(elemento);
        if (!propEquipo || !personaje[propEquipo]) return;

        const item = personaje[propEquipo];
        const select = elemento.querySelector(".tipoEquipo");
        const detalles = elemento.querySelector(".equipamiento-detalles");
        const inputNombre = elemento.querySelector(".inputNombreEquipo");
        const inputDanno = elemento.querySelector(".inputDannoEquipo");
        const inputPen = elemento.querySelector(".inputPenalizacionAtletismo");
        const inputArm = elemento.querySelector(".inputValorArmadura");
        const inputDefensa = elemento.querySelector(".inputDefensaEquipo");
        const campoDanno = inputDanno?.closest(".campo-numero");
        const campoDefensa = inputDefensa?.closest(".campo-numero");
        const btnUsar = elemento.querySelector(".btn-usar-equipo");
        const esEscudo = TIPOS_ESCUDO.includes(item.tipo);

        // Un escudo no tiene daño, solo defensa
        if (campoDanno) campoDanno.style.display = esEscudo ? "none" : "";
        if (campoDefensa) campoDefensa.style.display = esEscudo ? "" : "none";
        if (inputDefensa && document.activeElement !== inputDefensa) {
            inputDefensa.value = item.defensa ?? 0;
        }
        if (btnUsar) actualizarBotonUsar(btnUsar, propEquipo);

        if (select) {
            select.value = item.tipo || "";
            select.dataset.valorActual = select.value;
        }

        const tieneTipo = Boolean(item.tipo && item.tipo !== "");
        if (detalles) {
            detalles.style.display = tieneTipo ? "flex" : "none";
        }

        if (inputNombre && document.activeElement !== inputNombre) {
            inputNombre.value = item.nombre || "";
        }
        if (inputDanno && document.activeElement !== inputDanno) {
            inputDanno.value = item.danno ?? 0;
        }
        if (inputPen && document.activeElement !== inputPen) {
            inputPen.value = item.penalizacionAtletismo ?? 0;
        }
        if (inputArm && document.activeElement !== inputArm) {
            inputArm.value = item.armadura ?? 0;
        }
    });
}

/* Botón Usar: atacar con el arma o activar el escudo ____________________________ */

const ETIQUETAS_MANO = { manoIzquierda: "Mano izquierda", manoDerecha: "Mano derecha" };

/* Gasta las acciones necesarias; si no quedan, pregunta si hacerlo igualmente (p. ej. una reacción) */
function gastarAccionesOConfirmar(partes, descripcion) {
    if (gastarVarias(personaje, partes)) return true;
    const motivo = estaIncapacitado(personaje)
        ? "No puedes actuar (paralizado o dormido)."
        : "No te quedan acciones para hacerlo.";
    return confirm(`${motivo}\n¿${descripcion} igualmente?`);
}

function usarEquipo(propEquipo) {
    const item = personaje[propEquipo];
    const arma = ARMAS[item?.tipo];
    if (!arma) return;
    const partes = partesDeMano(propEquipo, arma.manos === 2);
    const nombre = item.nombre?.trim() || arma.etiqueta;

    // Escudo: al usarlo suma su defensa hasta tu siguiente turno; volver a pulsar lo guarda
    if (arma.escudo) {
        if (item.enUso) {
            item.enUso = false;
        } else {
            if (!gastarAccionesOConfirmar(partes, `Usar ${nombre}`)) return;
            item.enUso = true;
        }
        personaje.calcularCaracteristicas();
        actualizarTodo();
        return;
    }

    const { modoTirada, criticoFacil } = obtenerConfiguracionTirada();
    const ataque = prepararAtaque(personaje, propEquipo, modoTirada);
    if (!ataque) return;
    if (!gastarAccionesOConfirmar(partes, `Atacar con ${nombre}`)) return;

    ejecutarTirada({
        nombreAccion: ataque.nombre,
        subtitulo: `Ataque con ${arma.etiqueta.toLowerCase()} · ${arma.manos === 2 ? "Dos manos" : ETIQUETAS_MANO[propEquipo]}`,
        valorHabilidad: ataque.valorHabilidad,
        etiquetaHabilidad: ataque.etiquetaHabilidad,
        valorCaracteristica: ataque.valorCaracteristica,
        etiquetaCaracteristica: ataque.etiquetaCaracteristica,
        modoTirada: ataque.modo,
        criticoFacil: criticoFacil,
        bonificador: ataque.bonificador,
        etiquetaBonificador: ataque.bonificador > 0 ? "Ventaja extra" : "Desventaja extra",
        etiquetaTotal: "ATAQUE",
        calcularDanno: (resultado) => calcularDannoAtaque(personaje, item, esCritico(resultado))
    });
    actualizarTodo();
}

function actualizarBotonUsar(boton, propEquipo) {
    const item = personaje[propEquipo];
    const arma = ARMAS[item?.tipo];
    if (!arma) return;

    // El icono solo se regenera si cambia el tipo
    if (boton.dataset.icono !== item.tipo) {
        boton.dataset.icono = item.tipo;
        boton.innerHTML = iconoSao(item.tipo);
    }

    const nombre = item.nombre?.trim() || arma.etiqueta;
    const partes = partesDeMano(propEquipo, arma.manos === 2);
    let titulo;
    if (arma.escudo) {
        titulo = item.enUso
            ? `${nombre} en uso: +${item.defensa || 0} de defensa hasta tu siguiente turno. Clic para guardarlo.`
            : `Usar ${nombre}: suma ${item.defensa || 0} a tu defensa hasta tu siguiente turno.`;
    } else {
        titulo = `Atacar con ${nombre} (daño ${Number(item.danno) || 0} + ${Math.max(0, personaje.dFisico)} de bonificador)`;
    }
    if (!(arma.escudo && item.enUso) && !puedeGastarVarias(personaje, partes)) {
        titulo += " · Sin acciones disponibles";
    }
    boton.title = titulo;
    boton.setAttribute("aria-label", titulo);
    boton.classList.toggle("en-uso", Boolean(arma.escudo && item.enUso));
    boton.classList.toggle("sin-accion", !(arma.escudo && item.enUso) && !puedeGastarVarias(personaje, partes));
}

function parseModificadoresEquipo() {
    for (const elemento of document.getElementsByClassName("equipamiento")) {
        const propEquipo = getPropiedadEquipo(elemento);
        if (!propEquipo || !personaje[propEquipo]) continue;

        let listaModsEquipo = elemento.getElementsByClassName("modificadoresEquipo")[0];
        if (!listaModsEquipo) continue;
        listaModsEquipo.innerHTML = "";

        if (Array.isArray(personaje[propEquipo].modificadores)) {
            personaje[propEquipo].modificadores.forEach((modificador, index) => {
                listaModsEquipo.innerHTML += ` 
                <li id="modificadorE${index}" class="modificadorE">
                  <input type="text" class="" style="display:none" value="${modificador.nombre}"> Atributo:
                  <select class="listValores">${opcionesAtributo(modificador.modificado)}</select>
                    Cantidad:<input type="number" class="cantidadMod" value="${modificador.numero}"/> 
                    <input style="display:none" class="duracionMod" value="${modificador.turnos}"/>
                    <div class="eliminarMod">-</div>
                </li>`;
            });
        }
    }

    añadirFuncionalidadEquipoModificador();
}

function generarAccesorios() {
    const listaAccesorios = document.querySelector("#divEquipamiento .listaAccesorios ul");
    if (!listaAccesorios) return;
    listaAccesorios.innerHTML = "";

    const cantAccesorios = getCantidadAccesoriosPorArmadura(personaje.equipoArmadura?.tipo);

    if (!Array.isArray(personaje.accesorios)) {
        personaje.accesorios = [];
    }

    while (personaje.accesorios.length < cantAccesorios) {
        personaje.accesorios.push(new Equipamiento("Accesorio", "", "accesorio"));
    }
    if (personaje.accesorios.length > cantAccesorios) {
        personaje.accesorios = personaje.accesorios.slice(0, cantAccesorios);
    }

    if (cantAccesorios === 0) {
        listaAccesorios.innerHTML = `<li style="color: #888; font-style: italic; font-size: 13px; padding: 4px 0;">No hay ranuras de accesorios disponibles para esta armadura.</li>`;
        return;
    }

    for (let index = 0; index < cantAccesorios; index++) {
        const acc = personaje.accesorios[index] || {};
        listaAccesorios.innerHTML += `<li class="accesorio" id="accesorio${index}">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                <b>Accesorio ${index + 1}:</b>
                <input type="text" class="inputNombreAccesorio" placeholder="Nombre" value="${acc.nombre || ''}">
                <button type="button" class="btn-anadir-mod-equipo btn-anadir-mod-acc">+</button>
            </div>
            <ul class="modificadoresAccesorio"></ul>
        </li>`;
    }

    for (let index = 0; index < cantAccesorios; index++) {
        const itemAcc = document.getElementById(`accesorio${index}`);
        if (!itemAcc) continue;

        const inputNombre = itemAcc.querySelector(".inputNombreAccesorio");
        if (inputNombre) {
            inputNombre.addEventListener("input", (e) => {
                if (personaje.accesorios[index]) {
                    personaje.accesorios[index].nombre = e.target.value;
                }
            });
        }

        const btnAdd = itemAcc.querySelector(".btn-anadir-mod-acc");
        if (btnAdd) {
            btnAdd.addEventListener("click", () => {
                if (!Array.isArray(personaje.accesorios[index].modificadores)) {
                    personaje.accesorios[index].modificadores = [];
                }
                personaje.accesorios[index].modificadores.push(new Modificador("Nombre", "atletismo", 0, TURNOS_PERMANENTE));
                parseModificadoresAccesorios();
                personaje.calcularCaracteristicas();
                actualizarTodo();
            });
        }
    }
}

function parseModificadoresAccesorios() {
    for (const [indexAccesorio, modificadoresAccesorio] of Array.from(document.getElementsByClassName("modificadoresAccesorio")).entries()) {
        if (!personaje.accesorios[indexAccesorio] || !Array.isArray(personaje.accesorios[indexAccesorio].modificadores)) continue;
        modificadoresAccesorio.innerHTML = "";
        personaje.accesorios[indexAccesorio].modificadores.forEach((modificador, index) => {
            modificadoresAccesorio.innerHTML += ` 
            <li class="modificadorA">
              <input type="text" class="" style="display:none" value="${modificador.nombre}"> Atributo:
              <select class="listValores">${opcionesAtributo(modificador.modificado)}</select>
                Cantidad:<input type="number" class="cantidadMod" value="${modificador.numero}"/> 
                <input style="display:none" class="duracionMod" value="${modificador.turnos}"/>
                <button type="button" class="eliminarMod">-</button>
            </li>`;
        });
    }

    añadirFuncionalidadAccesorioModificador();
}

function añadirFuncionalidadAccesorioModificador() {
    for (const [indexAccesorio, modificadoresAccesorio] of Array.from(document.getElementsByClassName("modificadoresAccesorio")).entries()) {
        const lis = modificadoresAccesorio.getElementsByClassName("modificadorA");
        Array.from(lis).forEach((modificador, index) => {
            const select = modificador.querySelector(".listValores");
            const inputCantidad = modificador.querySelector(".cantidadMod");
            const btnEliminar = modificador.querySelector(".eliminarMod");

            if (select) {
                select.addEventListener("change", (e) => {
                    if (personaje.accesorios[indexAccesorio]?.modificadores[index]) {
                        personaje.accesorios[indexAccesorio].modificadores[index].modificado = e.target.value;
                        personaje.calcularCaracteristicas();
                        actualizarTodo();
                    }
                });
            }
            if (inputCantidad) {
                inputCantidad.addEventListener("input", (e) => {
                    if (personaje.accesorios[indexAccesorio]?.modificadores[index]) {
                        personaje.accesorios[indexAccesorio].modificadores[index].numero = parseInt(e.target.value) || 0;
                        personaje.calcularCaracteristicas();
                        actualizarTodo();
                    }
                });
            }
            if (btnEliminar) {
                btnEliminar.addEventListener("click", () => {
                    if (personaje.accesorios[indexAccesorio]?.modificadores) {
                        personaje.accesorios[indexAccesorio].modificadores.splice(index, 1);
                        parseModificadoresAccesorios();
                        personaje.calcularCaracteristicas();
                        actualizarTodo();
                    }
                });
            }
        });
    }
}



function añadirFuncionalidadEquipoModificador() {
    for (const modificador of document.getElementsByClassName("modificadorE")) {
        let index = Number(modificador.id.substring(12));
        let contenedor = modificador.closest(".equipamiento");
        let tipoEquipo = getPropiedadEquipo(contenedor);
        if (!tipoEquipo || !personaje[tipoEquipo]) continue;

        modificador.children[0].addEventListener('focusout', (evt) => {
            if (personaje[tipoEquipo]?.modificadores[index]) {
                personaje[tipoEquipo].modificadores[index].nombre = evt.currentTarget.value;
            }
        });
        modificador.children[1].addEventListener('change', (evt) => {
            if (personaje[tipoEquipo]?.modificadores[index]) {
                personaje[tipoEquipo].modificadores[index].modificado = evt.currentTarget.value;
                personaje.calcularCaracteristicas();
                actualizarTodo();
            }
        });
        modificador.children[2].addEventListener('input', (evt) => {
            if (personaje[tipoEquipo]?.modificadores[index]) {
                personaje[tipoEquipo].modificadores[index].numero = parseInt(evt.currentTarget.value) || 0;
                personaje.calcularCaracteristicas();
                actualizarTodo();
            }
        });
        modificador.children[3].addEventListener('input', (evt) => {
            if (personaje[tipoEquipo]?.modificadores[index]) {
                personaje[tipoEquipo].modificadores[index].turnos = parseInt(evt.currentTarget.value) || 0;
                personaje.calcularCaracteristicas();
                actualizarTodo();
            }
        });

        modificador.children[4].addEventListener('click', (evt) => {
            if (personaje[tipoEquipo]?.modificadores) {
                personaje[tipoEquipo].modificadores.splice(index, 1);
                parseModificadoresEquipo();
                personaje.calcularCaracteristicas();
                actualizarTodo();
            }
        });
    }
}

/* Sistema de Tiradas de Habilidades _________________________________________ */
const MAPEO_HABILIDADES_CARACTERISTICAS = {
    atletismo: 'fortaleza',
    combate: 'reflejos',
    percepcion: 'inteligencia',
    subterfugio: 'reflejos',
    comunicacion: 'inteligencia',
    cultura: 'voluntad',
    profesion: 'voluntad',
    sacro: 'voluntad'
};

function obtenerConfiguracionTirada() {
    const radioSeleccionado = document.querySelector('input[name="modoTiradaRadio"]:checked');
    const modoTirada = radioSeleccionado ? Number(radioSeleccionado.value) : 1;
    const checkCritico = document.getElementById('checkCriticoFacil');
    const criticoFacil = checkCritico ? checkCritico.checked : false;
    return { modoTirada, criticoFacil };
}

function inicializarTiradasHabilidades() {
    const contenedores = document.querySelectorAll('#habilidadesDiv > div');
    contenedores.forEach(habDiv => {
        const input = habDiv.querySelector('input');
        const img = habDiv.querySelector('img');
        const titulo = habDiv.querySelector('h3');

        if (!input) return;

        const habilidadId = input.id;
        const caractClave = MAPEO_HABILIDADES_CARACTERISTICAS[habilidadId];
        const nombreAccion = titulo ? titulo.innerText.trim() : habilidadId;

        const dispararTirada = () => {
            const { modoTirada, criticoFacil } = obtenerConfiguracionTirada();
            // Valor efectivo: incluye modificadores y penalización de armadura (sin bajar de 0)
            const valorHab = Math.max(0, Number(personaje.getGenerico(habilidadId)) || 0);
            const valorCaract = caractClave ? (Number(personaje[caractClave]) || 0) : 0;

            ejecutarTirada({
                nombreAccion: nombreAccion,
                valorHabilidad: valorHab,
                valorCaracteristica: valorCaract,
                modoTirada: modoTirada,
                criticoFacil: criticoFacil
            });
        };

        if (img) img.addEventListener('click', dispararTirada);
        if (titulo) titulo.addEventListener('click', dispararTirada);
    });

    // Tiradas de característica: dado + característica (sin habilidad)
    document.querySelectorAll('.atributo-icono[data-atributo]').forEach(icono => {
        const atributo = icono.dataset.atributo;
        const nombre = icono.alt || atributo;
        icono.title = `Tirada de ${nombre}`;
        icono.addEventListener('click', () => {
            const { modoTirada, criticoFacil } = obtenerConfiguracionTirada();
            ejecutarTirada({
                nombreAccion: nombre,
                valorHabilidad: 0,
                etiquetaHabilidad: null,
                valorCaracteristica: Number(personaje[atributo]) || 0,
                etiquetaCaracteristica: nombre,
                modoTirada: modoTirada,
                criticoFacil: criticoFacil
            });
        });
    });
}

/* Turno y acciones __________________________________________________________ */

/* Partes de la silueta → tipo de acción en PJ (el torso no gasta acción) */
const PARTES_SILUETA = {
    "cabeza": "cabeza",
    "brazo-der": "derecha",
    "brazo-izq": "izquierda",
    "pierna-izq": "pies",
    "pierna-der": "pies"
};

/* Popup informativo con el mismo estilo que los de dados */
function mostrarPopupInfo(titulo, lineas) {
    const contenedor = document.getElementById("contenedor-popups-dados");
    if (!contenedor) return;
    const popup = document.createElement("div");
    popup.className = "popup-dado";
    popup.innerHTML = `
        <div class="popup-header"><strong class="popup-titulo">${titulo}</strong></div>
        <ul class="popup-lista">${lineas.map(l => `<li>${l}</li>`).join("")}</ul>`;
    popup.addEventListener("click", () => popup.remove());
    contenedor.appendChild(popup);
}

function inicializarTurno() {
    document.getElementById("btnIniciarTurno").addEventListener("click", () => {
        const resumen = iniciarTurno(personaje);
        actualizarTodo();
        mostrarPopupInfo("Inicio de turno", resumen);
    });

    Object.entries(PARTES_SILUETA).forEach(([idSvg, parte]) => {
        const elemento = document.getElementById(idSvg);
        if (!elemento) return;
        elemento.addEventListener("click", () => {
            // Clic en una acción gastada la devuelve (para corregir errores)
            if (personaje[parte]) gastarAccion(personaje, parte);
            else devolverAccion(personaje, parte);
            actualizarTodo();
        });
    });

    document.getElementById("btnMover").addEventListener("click", () => {
        if (gastarAccion(personaje, "pies")) actualizarTodo();
    });

    document.getElementById("btnCorrer").addEventListener("click", () => {
        if (correr(personaje)) actualizarTodo();
    });

    document.getElementById("btnSigilo").addEventListener("click", () => {
        if (personaje.enSigilo) {
            salirDeSigilo(personaje);
            actualizarTodo();
            return;
        }
        const modoArmadura = modoSigiloPorArmadura(personaje.equipoArmadura?.tipo);
        if (modoArmadura === null) {
            alert("Con armadura pesada no se puede entrar en sigilo.");
            return;
        }
        if (!puedeEntrarEnSigilo(personaje)) return;

        // El dado depende de la armadura; el modo elegido en el panel cuenta como otra fuente
        const { modoTirada, criticoFacil } = obtenerConfiguracionTirada();
        const { modo, bonificador } = combinarModos(modoArmadura, modoTirada);
        const resultado = ejecutarTirada({
            nombreAccion: "Entrar en sigilo",
            valorHabilidad: Math.max(0, Number(personaje.getGenerico("subterfugio")) || 0),
            valorCaracteristica: Number(personaje.reflejos) || 0,
            modoTirada: modo,
            criticoFacil: criticoFacil,
            bonificador: bonificador,
            etiquetaBonificador: bonificador > 0 ? "Ventaja extra" : "Desventaja extra"
        });
        entrarEnSigilo(personaje, resultado.total);
        actualizarTodo();
    });
}

function actualizarAcciones() {
    const restantes = accionesRestantes(personaje);

    Object.entries(PARTES_SILUETA).forEach(([idSvg, parte]) => {
        const elemento = document.getElementById(idSvg);
        if (!elemento) return;
        const disponible = Boolean(personaje[parte]);
        elemento.classList.toggle("gris", !disponible);
        elemento.classList.toggle("bloqueada", disponible && !puedeGastar(personaje, parte));
    });

    const contador = document.getElementById("contadorAcciones");
    if (contador) contador.textContent = `(${restantes} / ${personaje.numeroAcciones})`;

    const btnMover = document.getElementById("btnMover");
    const btnCorrer = document.getElementById("btnCorrer");
    const btnSigilo = document.getElementById("btnSigilo");
    document.getElementById("casillasMover").textContent = `(${velocidadMovimiento(personaje)})`;
    document.getElementById("casillasCorrer").textContent = `(${velocidadCorrer(personaje)})`;
    btnMover.disabled = !puedeMoverse(personaje);
    btnCorrer.disabled = !puedeCorrer(personaje);
    btnCorrer.title = personaje.enSigilo ? "No se puede correr en sigilo" : "Gasta las tres acciones del turno";

    btnSigilo.classList.toggle("activo", personaje.enSigilo);
    btnSigilo.textContent = personaje.enSigilo ? "Salir de sigilo" : "Sigilo";
    btnSigilo.disabled = !personaje.enSigilo && !puedeEntrarEnSigilo(personaje);
    btnSigilo.title = modoSigiloPorArmadura(personaje.equipoArmadura?.tipo) === null
        ? "Con armadura pesada no se puede entrar en sigilo"
        : "Entrar en sigilo gasta la acción de piernas";

    const avisos = [];
    if (personaje.enSigilo) avisos.push(`En sigilo: ${personaje.valorSigilo}`);
    if (estaActivo(personaje, "paralisis")) avisos.push("Paralizado: no puede actuar");
    else if (estaActivo(personaje, "dormido")) avisos.push("Dormido: no puede actuar");
    else if (personaje.numeroAcciones === 0) avisos.push("Sin acciones este turno");
    document.getElementById("estadoTurno").textContent = avisos.join(" · ");
}

/* Estados ___________________________________________________________________ */
const chipsEstados = document.getElementById("chipsEstados");
const listaEstadosActivos = document.getElementById("listaEstadosActivos");

function inicializarEstados() {
    chipsEstados.innerHTML = Object.entries(ESTADOS_INFO).map(([clave, info]) => `
        <button type="button" class="chip-estado" data-estado="${clave}" style="${estiloColor(info)}"
            title="${info.etiqueta}: ${info.descripcion}" aria-pressed="false">
            <span class="chip-icono">${iconoSao(info.icono)}</span>
            <span class="chip-nombre">${info.etiqueta}</span>
        </button>`
    ).join("");

    // Clic en un chip: activa el estado con sus valores por defecto o lo quita
    chipsEstados.addEventListener("click", (e) => {
        const chip = e.target.closest(".chip-estado");
        if (!chip) return;
        const estado = chip.dataset.estado;
        if (estaActivo(personaje, estado)) quitarEstado(personaje, estado);
        else activarEstado(personaje, estado);
        actualizarTodo();
    });

    listaEstadosActivos.addEventListener("change", (e) => {
        const fila = e.target.closest(".fila-estado");
        if (!fila) return;
        const clave = fila.dataset.estado;
        const estado = personaje.estados[clave];
        const inputTurnos = fila.querySelector(".turnosEstado");
        const turnosPorDefecto = Math.max(1, ESTADOS_INFO[clave].turnos);

        if (e.target.classList.contains("valorEstado")) {
            estado.valor = Math.max(0, parseInt(e.target.value) || 0);
        }
        if (e.target.classList.contains("turnosEstado")) {
            // 0 = último turno (termina al iniciar el siguiente)
            const turnos = parseInt(e.target.value);
            estado.turnos = Number.isFinite(turnos) ? Math.max(0, turnos) : 1;
        }
        if (e.target.classList.contains("checkPermanenteEstado")) {
            estado.turnos = e.target.checked
                ? TURNOS_PERMANENTE
                : Math.max(1, parseInt(inputTurnos.value) || turnosPorDefecto);
        }

        // Un valor de 0 equivale a quitar el estado
        if (estado.valor === 0) quitarEstado(personaje, clave);
        personaje.calcularCaracteristicas();
        actualizarTodo();
    });

    listaEstadosActivos.addEventListener("click", (e) => {
        const boton = e.target.closest(".quitar-estado");
        if (!boton) return;
        quitarEstado(personaje, boton.closest(".fila-estado").dataset.estado);
        actualizarTodo();
    });
}

/* Texto de ayuda bajo cada estado activo con su efecto actual */
function pistaEstado(clave) {
    const valor = Number(personaje.estados[clave]?.valor) || 0;
    const aguante = personaje.aguante;
    switch (clave) {
        case "quemadura": {
            const combate = personaje.getGenerico("combate");
            return `Combate efectivo: ${combate}` + (combate < 0 ? ` → −${-combate} PV por turno` : "");
        }
        case "electrocutado": return `Atletismo efectivo: ${personaje.getGenerico("atletismo")}`;
        case "deslumbrado": return `Percepción efectiva: ${personaje.getGenerico("percepcion")}`;
        case "congelacion": return `Aguante ${aguante}: −1 acción desde ${2 * aguante}, −2 desde ${3 * aguante}, PA desde ${4 * aguante}`;
        case "hemorragia": return valor > aguante
            ? `Supera el Aguante (${aguante}): −${valor} PV por turno`
            : `Sin efecto hasta superar el Aguante (${aguante})`;
        case "oscuridad": return `PV máximos: ${personaje.vidaMax}`;
        default: return "";
    }
}

function actualizarEstados() {
    chipsEstados.querySelectorAll(".chip-estado").forEach(chip => {
        const activo = estaActivo(personaje, chip.dataset.estado);
        chip.classList.toggle("activo", activo);
        chip.setAttribute("aria-pressed", String(activo));
    });

    // Las filas solo se regeneran si cambia qué estados están activos, para no perder el foco
    const activos = Object.keys(ESTADOS_INFO).filter(clave => estaActivo(personaje, clave));
    const claves = activos.join(",");
    if (listaEstadosActivos.dataset.claves !== claves) {
        listaEstadosActivos.dataset.claves = claves;
        listaEstadosActivos.innerHTML = activos.map(clave => {
            const info = ESTADOS_INFO[clave];
            return `
            <div class="fila-estado icono-activo" data-estado="${clave}" style="${estiloColor(info)}" title="${info.descripcion}">
                <span class="fila-icono">${iconoSao(info.icono)}</span>
                <span class="nombre-estado">${info.etiqueta}</span>
                ${info.unidad ? `<label>${info.unidad} <input type="number" min="0" class="valorEstado"></label>` : ""}
                <label>Turnos <input type="number" min="0" class="turnosEstado"></label>
                <label><input type="checkbox" class="checkPermanenteEstado"> Permanente</label>
                <button type="button" class="quitar-estado" title="Quitar" aria-label="Quitar ${info.etiqueta}">×</button>
                <span class="pista-estado"></span>
            </div>`;
        }).join("");
    }

    listaEstadosActivos.querySelectorAll(".fila-estado").forEach(fila => {
        const estado = personaje.estados[fila.dataset.estado];
        // -1 = permanente; 0 = último turno (termina al iniciar el siguiente)
        const permanente = estado.turnos < 0;
        const inputValor = fila.querySelector(".valorEstado");
        const inputTurnos = fila.querySelector(".turnosEstado");
        if (inputValor && document.activeElement !== inputValor) inputValor.value = estado.valor;
        if (document.activeElement !== inputTurnos) inputTurnos.value = permanente ? "" : estado.turnos;
        inputTurnos.disabled = permanente;
        fila.querySelector(".checkPermanenteEstado").checked = permanente;
        const pista = [pistaEstado(fila.dataset.estado)];
        if (estado.turnos === 0) pista.push("Último turno: termina al iniciar el siguiente");
        fila.querySelector(".pista-estado").textContent = pista.filter(Boolean).join(" · ");
    });
}

/* Ventana de daño ___________________________________________________________ */
function inicializarDanno() {
    const modalEl = document.getElementById("modalDanno");
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    const inputCantidad = document.getElementById("inputCantidadDanno");
    const checkIgnorar = document.getElementById("checkIgnorarArmadura");
    const subElemental = document.getElementById("dannoSubElemental");
    const labelIgnorar = document.getElementById("labelIgnorarArmadura");
    const preview = document.getElementById("previewDanno");

    // Icono y color de cada opción de tipo de daño
    modalEl.querySelectorAll(".opcion-danno").forEach(opcion => {
        const info = TIPOS_DANNO[opcion.querySelector("input").value];
        if (!info) return;
        opcion.setAttribute("style", estiloColor(info));
        opcion.insertAdjacentHTML("afterbegin", `<span class="opcion-icono">${iconoSao(info.icono)}</span>`);
    });

    const leerTipo = () => {
        const tipo = modalEl.querySelector('input[name="tipoDanno"]:checked')?.value || "fisico";
        if (tipo !== "elemental") return tipo;
        return modalEl.querySelector('input[name="elementoDanno"]:checked')?.value || "fuego";
    };

    // La vista previa aplica el daño sobre una copia del personaje
    const actualizarPreview = () => {
        const esElemental = modalEl.querySelector('input[name="tipoDanno"]:checked')?.value === "elemental";
        subElemental.style.display = esElemental ? "" : "none";
        labelIgnorar.style.display = leerTipo() === "fisico" ? "" : "none";

        const copia = new PJ();
        copia.cargarJSON(JSON.parse(personaje.toJSONString()));
        const resumen = aplicarDanno(copia, inputCantidad.value, leerTipo(), { ignorarArmadura: checkIgnorar.checked });
        preview.innerHTML = resumen.map(linea => `<li>${linea}</li>`).join("");
    };

    const aplicar = () => {
        const tipo = leerTipo();
        const resumen = aplicarDanno(personaje, inputCantidad.value, tipo, { ignorarArmadura: checkIgnorar.checked });
        modal.hide();
        actualizarTodo();
        mostrarPopupInfo(`Daño: ${TIPOS_DANNO[tipo].etiqueta}`, resumen);
    };

    modalEl.addEventListener("input", actualizarPreview);
    modalEl.addEventListener("change", actualizarPreview);
    modalEl.addEventListener("shown.bs.modal", () => {
        inputCantidad.focus();
        inputCantidad.select();
    });
    inputCantidad.addEventListener("keydown", (e) => {
        if (e.key === "Enter") aplicar();
    });
    document.getElementById("btnAplicarDanno").addEventListener("click", aplicar);

    document.getElementById("btnRecibirDanno").addEventListener("click", () => {
        inputCantidad.value = "";
        checkIgnorar.checked = false;
        actualizarPreview();
        modal.show();
    });
}

/* Pestañas (inventario, baúl, amigos, artes) _______________________________ */
const CLAVE_PESTANA = "fichaSAO.pestana";

function inicializarPestanas() {
    const pestanas = Array.from(document.querySelectorAll(".pestanas .pestana"));
    if (!pestanas.length) return;

    const activar = (pestana, enfocar = false) => {
        pestanas.forEach(p => {
            const activa = p === pestana;
            p.classList.toggle("activa", activa);
            p.setAttribute("aria-selected", String(activa));
            p.tabIndex = activa ? 0 : -1;
            document.getElementById(p.getAttribute("aria-controls")).hidden = !activa;
        });
        if (enfocar) pestana.focus();
        // Recordar la pestaña es solo una comodidad: si el navegador no deja guardar, no pasa nada
        try { localStorage.setItem(CLAVE_PESTANA, pestana.id); } catch { /* sin almacenamiento */ }
    };

    pestanas.forEach((pestana, i) => {
        pestana.addEventListener("click", () => activar(pestana));
        // Flechas para moverse entre pestañas (patrón de accesibilidad de tabs)
        pestana.addEventListener("keydown", (e) => {
            const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: pestanas.length - 1 }[e.key];
            if (destino === undefined) return;
            e.preventDefault();
            activar(pestanas[(destino + pestanas.length) % pestanas.length], true);
        });
    });

    try {
        const guardada = document.getElementById(localStorage.getItem(CLAVE_PESTANA));
        if (pestanas.includes(guardada)) activar(guardada);
    } catch { /* sin almacenamiento: se queda en Inventario */ }
}

/* Debug: abrir la página con ?debug para ver el botón ______________________ */
function inicializarDebug() {
    if (!new URLSearchParams(window.location.search).has("debug")) return;

    // Acceso desde la consola del navegador: fichaDebug.personaje, fichaDebug.ejecutar()...
    window.fichaDebug = { personaje, ejecutar: () => ejecutarDebug(personaje), crearPersonajePrueba, validarFicha };

    const boton = document.createElement("button");
    boton.type = "button";
    boton.textContent = "Debug";
    boton.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2000;padding:6px 14px;" +
        "border:2px solid #d1ab52;border-radius:8px;background:#fbfbfb;font-weight:bold;";
    boton.addEventListener("click", mostrarInformeDebug);
    document.body.appendChild(boton);
}

function mostrarInformeDebug() {
    const informe = ejecutarDebug(personaje);
    console.group("Debug de la ficha");
    Object.entries(informe).forEach(([seccion, lineas]) => console.log(seccion, lineas));
    console.groupEnd();

    const secciones = [
        ["Ida y vuelta (tu ficha)", informe.idaVueltaActual],
        ["Ida y vuelta (ficha de prueba con todos los campos)", informe.idaVueltaPrueba],
        ["Campos del modelo que no se guardan", informe.camposSinGuardar],
        ["Pantalla distinta del modelo", informe.interfaz],
        ["Avisos de reglas", informe.avisos]
    ];
    const escapar = (texto) => String(texto).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

    document.getElementById("panelDebug")?.remove();
    const panel = document.createElement("div");
    panel.id = "panelDebug";
    panel.style.cssText = "position:fixed;right:16px;bottom:60px;z-index:2000;width:min(480px,calc(100vw - 32px));" +
        "max-height:70vh;overflow:auto;padding:12px 16px;border:3px solid #d1ab52;border-radius:10px;" +
        "background:#fbfbfb;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.2);";
    panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;">
            <b>Debug de la ficha</b><button type="button" class="btn-close" aria-label="Cerrar"></button>
        </div>` + secciones.map(([titulo, lineas]) => `
        <div style="margin-top:10px;">
            <b style="color:${lineas.length ? "#c0392b" : "#2e7d32"};">${lineas.length ? "✗" : "✓"} ${titulo}</b>
            ${lineas.length ? `<ul style="margin:4px 0 0;padding-left:18px;">${lineas.map(l => `<li>${escapar(l)}</li>`).join("")}</ul>` : ""}
        </div>`).join("");
    panel.querySelector(".btn-close").addEventListener("click", () => panel.remove());
    document.body.appendChild(panel);
}

document.addEventListener("DOMContentLoaded", () => {
    construirManosEquipamiento();
    inicializarEquipamiento();
    actualizarModificadores();
    parseModificadoresEquipo();
    actualizarTodo();
    inicializarTiradasHabilidades();
    inicializarTurno();
    inicializarEstados();
    inicializarDanno();
    inicializarPestanas();
    inicializarDebug();
    actualizarTodo();
});