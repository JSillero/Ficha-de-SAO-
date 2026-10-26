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
import { reproducir, iniciarBucle, pararBucle, precargarSonidos, estaSilenciado, setSilenciado } from "./sonidos.js";
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
            reproducir("click");
            actualizarTodo();
        }
    });
});
// Asignar listeners a los botones de restar (-)
document.querySelectorAll('.btn-hab-menos').forEach(boton => {
    boton.addEventListener('click', () => {
        const hab = boton.dataset.hab;
        if (personaje.bajarHabilidad(hab)) {
            reproducir("click");
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

/* Sonido (scripts/sonidos.js) ________________________________________________ */

// Cualquier ventana de Bootstrap suena al abrirse y al cerrarse (sus eventos suben hasta document)
document.addEventListener("show.bs.modal", () => reproducir("menuAbrir"));
document.addEventListener("hide.bs.modal", () => reproducir("menuCerrar"));

function inicializarSonido() {
    precargarSonidos();
    const boton = document.getElementById("btnSonido");
    if (!boton) return;
    const pintar = () => {
        const silencio = estaSilenciado();
        boton.innerHTML = iconoSao(silencio ? "silencio" : "sonido");
        boton.title = silencio ? "Activar sonidos" : "Silenciar sonidos";
        boton.setAttribute("aria-label", boton.title);
        boton.setAttribute("aria-pressed", String(silencio));
        boton.classList.toggle("silenciado", silencio);
    };
    boton.addEventListener("click", () => {
        setSilenciado(!estaSilenciado());
        pintar();
    });
    pintar();
}

function actualizarTodo() {
    actualizarInformacion();
    actualizarAtributos();
    actualizarHabilidades();
    actualizarCaracteristicas();
    actuaizarTextos();
    actualizarEquipamiento();
    actualizarModificadores();
    generarAccesorios();
    parseModificadoresEquipo();
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
            iniciarBucle("vidaBaja");
        } else {
            if (pct < 40) {
                hpFill.classList.add('hp-orange');
            }
            pararBucle("vidaBaja");
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

/* Valores de combate _________________________________________________________ */

/* clave = propiedad de PJ; ayuda = fórmula que se ve al pasar el ratón */
const VALORES_COMBATE = [
    { clave: "defensa", etiqueta: "Defensa", icono: "escudo",
        ayuda: "Reflejos + Atletismo efectivo + 5 (+ escudo en uso). El atacante debe igualarla para hacer daño." },
    { clave: "armadura", etiqueta: "Armadura", icono: "armadura",
        ayuda: "Daño que la armadura resta a cada impacto." },
    { clave: "iniciativa", etiqueta: "Iniciativa", icono: "iniciativa",
        ayuda: "Reflejos + Inteligencia / 2. Orden de actuación en combate." },
    { clave: "vMovimiento", etiqueta: "Movimiento", icono: "movimiento", unidad: "casillas",
        ayuda: "Atletismo efectivo / 5 + 3. Casillas sin correr; correr las duplica." },
    { clave: "dFisico", etiqueta: "Daño CaC", icono: "espada",
        ayuda: "(Fortaleza + Combate) / 4, hacia abajo. En sigilo usa Sigilo en lugar de Combate." },
    { clave: "dDistancia", etiqueta: "Daño a distancia", icono: "distancia",
        ayuda: "Combate / 4, hacia abajo. En sigilo usa Sigilo en lugar de Combate." },
    { clave: "dMagico", etiqueta: "Daño mágico", icono: "magia",
        ayuda: "(Inteligencia + Sacro) / 4, hacia abajo." },
    { clave: "aguante", etiqueta: "Aguante", icono: "aguante",
        ayuda: "Fortaleza + Voluntad / 2. PV que ganas cada 5 niveles y resistencia al frío." },
    { clave: "perspicacia", etiqueta: "Perspicacia", icono: "perspicacia",
        ayuda: "Voluntad + Cultura + 5. Las tiradas para manipular tus emociones deben igualarla." },
    { clave: "percepcionPasiva", etiqueta: "Percepción pasiva", icono: "percepcion",
        ayuda: "Inteligencia + Percepción + 5. Detecta trampas y enemigos en sigilo sin tirar." }
];

const valoresCombateDiv = document.getElementById("valoresCombateDiv");

function construirValoresCombate() {
    valoresCombateDiv.innerHTML = VALORES_COMBATE.map(({ clave, etiqueta, icono, ayuda }) => `
        <div class="valor-combate" data-valor="${clave}" title="${ayuda}">
            <span class="valor-icono">${iconoSao(icono)}</span>
            <span class="valor-texto">
                <span class="valor-etiqueta">${etiqueta}</span>
                <span class="valor-numero"></span>
                <span class="valor-nota"></span>
            </span>
        </div>`).join("");
}

/* Números con coma decimal; los derivados que no se redondean pueden tener ,5 */
function formatearNumero(valor) {
    const numero = Number(valor) || 0;
    return Number.isInteger(numero) ? String(numero) : numero.toFixed(1).replace(".", ",");
}

function actualizarCaracteristicas() {
    if (!valoresCombateDiv.children.length) construirValoresCombate();

    VALORES_COMBATE.forEach(({ clave, unidad }) => {
        const tarjeta = valoresCombateDiv.querySelector(`[data-valor="${clave}"]`);
        if (!tarjeta) return;
        tarjeta.querySelector(".valor-numero").innerHTML =
            formatearNumero(personaje[clave]) + (unidad ? ` <small>${unidad}</small>` : "");

        // Notas de contexto: lo que cambia en sigilo o con escudo
        let nota = "";
        if (clave === "vMovimiento" && personaje.enSigilo) nota = `En sigilo: ${velocidadMovimiento(personaje)}`;
        if ((clave === "dFisico" || clave === "dDistancia") && personaje.enSigilo) nota = "Con Sigilo";
        if (clave === "defensa" && personaje.getDefensaEscudos() > 0) nota = `+${personaje.getDefensaEscudos()} escudo`;
        tarjeta.querySelector(".valor-nota").textContent = nota;
        tarjeta.classList.toggle("con-nota", Boolean(nota));
    });
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
                reproducir("linkStart");

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
        ["aguante", "Aguante"], ["vidaMax", "PV máximos"], ["arte", "PA máximos"], ["espacios", "Memoria de artes"],
        ["perspicacia", "Perspicacia"], ["percepcionPasiva", "Percepción pasiva"]
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
        const listaMods = clon.querySelector(".mods-equipo");
        if (listaMods) listaMods.dataset.mods = cfg.prop;
        grid.appendChild(clon);
    });

    const listaModsArmadura = document.querySelector(".equipoArmadura .mods-equipo");
    if (listaModsArmadura) listaModsArmadura.dataset.mods = "equipoArmadura";
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

    const { modos, criticoFacil } = obtenerConfiguracionTirada();
    const ataque = prepararAtaque(personaje, propEquipo, modos);
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

/* Modificadores de equipo (manos, armadura y accesorios) _____________________ */
// Cada <ul class="mods-equipo" data-mods="..."> apunta a los modificadores de su objeto:
// "manoIzquierda", "manoDerecha", "equipoArmadura" o "accesorio-N".

function listaModsEquipo(clave) {
    if (!clave) return null;
    const objeto = clave.startsWith("accesorio-")
        ? personaje.accesorios[Number(clave.slice("accesorio-".length))]
        : personaje[clave];
    if (!objeto) return null;
    if (!Array.isArray(objeto.modificadores)) objeto.modificadores = [];
    return objeto.modificadores;
}

function pintarModsEquipo(ul) {
    const lista = listaModsEquipo(ul.dataset.mods);
    if (!lista) return;

    // Las filas solo se regeneran si cambia el número de modificadores, para no perder el foco
    if (ul.children.length !== lista.length) {
        ul.innerHTML = lista.map((mod, index) => `
            <li class="mod-equipo" data-index="${index}">
                <select class="listValores" aria-label="Atributo">${opcionesAtributo(mod.modificado)}</select>
                <input type="number" class="cantidadMod" aria-label="Cantidad" title="Cantidad (negativa para restar)">
                <button type="button" class="quitar-mod" title="Eliminar modificador" aria-label="Eliminar modificador">×</button>
            </li>`).join("");
    }

    lista.forEach((mod, index) => {
        const fila = ul.children[index];
        const select = fila.querySelector(".listValores");
        const inputCantidad = fila.querySelector(".cantidadMod");
        const numero = Number(mod.numero) || 0;
        if (document.activeElement !== select && select.querySelector(`option[value="${mod.modificado}"]`)) select.value = mod.modificado;
        if (document.activeElement !== inputCantidad) inputCantidad.value = numero;
        fila.classList.toggle("mod-positivo", numero > 0);
        fila.classList.toggle("mod-negativo", numero < 0);
    });
}

function parseModificadoresEquipo() {
    document.querySelectorAll("#divEquipamiento .mods-equipo[data-mods]").forEach(pintarModsEquipo);
}

/* Un único listener por tipo de evento para toda la sección de equipamiento */
function inicializarModsEquipo() {
    const contenedor = document.getElementById("divEquipamiento");

    contenedor.addEventListener("click", (e) => {
        const botonAnadir = e.target.closest(".btn-anadir-mod-equipo");
        if (botonAnadir) {
            const ul = botonAnadir.closest(".equipamiento, .tarjeta-accesorio")?.querySelector(".mods-equipo[data-mods]");
            const lista = ul && listaModsEquipo(ul.dataset.mods);
            if (!lista) return;
            // Los modificadores de equipo duran mientras se lleve el objeto
            lista.push(new Modificador("", "atletismo", 0, TURNOS_PERMANENTE));
            personaje.calcularCaracteristicas();
            actualizarTodo();
            ul.lastElementChild?.querySelector(".listValores")?.focus();
            return;
        }

        const quitar = e.target.closest(".mods-equipo .quitar-mod");
        if (quitar) {
            const lista = listaModsEquipo(quitar.closest(".mods-equipo").dataset.mods);
            if (!lista) return;
            lista.splice(Number(quitar.closest(".mod-equipo").dataset.index), 1);
            personaje.calcularCaracteristicas();
            actualizarTodo();
        }
    });

    contenedor.addEventListener("change", (e) => {
        const fila = e.target.closest(".mods-equipo .mod-equipo");
        if (!fila) return;
        const mod = listaModsEquipo(fila.closest(".mods-equipo").dataset.mods)?.[Number(fila.dataset.index)];
        if (!mod) return;
        if (e.target.classList.contains("listValores")) mod.modificado = e.target.value;
        if (e.target.classList.contains("cantidadMod")) mod.numero = parseInt(e.target.value) || 0;
        personaje.calcularCaracteristicas();
        actualizarTodo();
    });

    // Nombre de los accesorios
    contenedor.addEventListener("input", (e) => {
        if (!e.target.classList.contains("inputNombreAccesorio")) return;
        const accesorio = personaje.accesorios[Number(e.target.closest(".tarjeta-accesorio").dataset.index)];
        if (accesorio) accesorio.nombre = e.target.value;
    });
}

/* Accesorios _________________________________________________________________ */
const MAX_ACCESORIOS = 3;
const NOMBRES_ARMADURA = { pesada: "pesada", media: "media", ligera: "ligera", ropa: "de ropa", real: "real" };

function motivoBloqueoAccesorio(tipoArmadura, ranuras) {
    if (!tipoArmadura) return "Equipa una armadura para tener ranuras de accesorio.";
    if (ranuras === 0) return `La armadura ${NOMBRES_ARMADURA[tipoArmadura] ?? tipoArmadura} no permite accesorios.`;
    return `La armadura ${NOMBRES_ARMADURA[tipoArmadura] ?? tipoArmadura} solo permite ${ranuras}.`;
}

function generarAccesorios() {
    const contenedor = document.getElementById("listaAccesorios");
    if (!contenedor) return;
    const tipoArmadura = personaje.equipoArmadura?.tipo || "";
    const ranuras = getCantidadAccesoriosPorArmadura(tipoArmadura);

    if (!Array.isArray(personaje.accesorios)) personaje.accesorios = [];
    while (personaje.accesorios.length < ranuras) {
        personaje.accesorios.push(new Equipamiento("", "", "accesorio"));
    }
    // Sin cambios respecto a antes: al bajar de ranuras se pierden los accesorios sobrantes (Fase 0, punto 6)
    if (personaje.accesorios.length > ranuras) {
        personaje.accesorios = personaje.accesorios.slice(0, ranuras);
    }

    const contador = document.getElementById("contadorAccesorios");
    if (contador) contador.textContent = `(${ranuras} / ${MAX_ACCESORIOS})`;

    // Las tarjetas solo se regeneran si cambian las ranuras o la armadura
    const clave = `${ranuras}|${tipoArmadura}`;
    if (contenedor.dataset.clave !== clave) {
        contenedor.dataset.clave = clave;
        contenedor.innerHTML = Array.from({ length: MAX_ACCESORIOS }, (_, i) => i < ranuras ? `
            <div class="tarjeta-accesorio" data-index="${i}">
                <div class="accesorio-cabecera">
                    <span class="accesorio-icono">${iconoSao("accesorio")}</span>
                    <input type="text" class="inputNombreAccesorio" placeholder="Accesorio ${i + 1}" aria-label="Nombre del accesorio ${i + 1}">
                </div>
                <div class="equipamiento-mods-header">
                    <span>Modificadores:</span>
                    <button type="button" class="btn-anadir-mod-equipo" title="Añadir modificador" aria-label="Añadir modificador">+</button>
                </div>
                <ul class="mods-equipo" data-mods="accesorio-${i}"></ul>
            </div>` : `
            <div class="tarjeta-accesorio bloqueada" aria-disabled="true">
                <div class="accesorio-cabecera">
                    <span class="accesorio-icono">${iconoSao("bloqueado")}</span>
                    <span class="accesorio-bloqueo">Ranura bloqueada</span>
                </div>
                <p class="accesorio-motivo">${motivoBloqueoAccesorio(tipoArmadura, ranuras)}</p>
            </div>`).join("");
    }

    personaje.accesorios.forEach((accesorio, i) => {
        const input = contenedor.querySelector(`.tarjeta-accesorio[data-index="${i}"] .inputNombreAccesorio`);
        if (input && document.activeElement !== input) input.value = accesorio.nombre || "";
    });
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

/**
 * Configuración común de las tiradas.
 * - modoTirada: lo elegido en el panel (0 desventaja, 1 normal, 2 ventaja).
 * - modos: todas las fuentes de ventaja/desventaja que afectan al personaje (el panel y, si está
 *   aturdido, una desventaja). Cada tirada las pasa a combinarModos junto con las suyas (armadura, arma...).
 */
function obtenerConfiguracionTirada() {
    const radioSeleccionado = document.querySelector('input[name="modoTiradaRadio"]:checked');
    const modoTirada = radioSeleccionado ? Number(radioSeleccionado.value) : 1;
    const checkCritico = document.getElementById('checkCriticoFacil');
    const criticoFacil = checkCritico ? checkCritico.checked : false;
    const modos = [modoTirada];
    if (estaActivo(personaje, "aturdido")) modos.push(0); // Aturdido: tira con desventaja
    return { modoTirada, modos, criticoFacil };
}

/** Modo y bonificador finales de una tirada ordinaria (habilidad o característica). */
function resolverModoTirada(modos) {
    const { modo, bonificador } = combinarModos(...modos);
    return {
        modoTirada: modo,
        bonificador,
        etiquetaBonificador: bonificador > 0 ? "Ventaja extra" : "Desventaja extra"
    };
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
            const { modos, criticoFacil } = obtenerConfiguracionTirada();
            // Valor efectivo: incluye modificadores y penalización de armadura (sin bajar de 0)
            const valorHab = Math.max(0, Number(personaje.getGenerico(habilidadId)) || 0);
            const valorCaract = caractClave ? (Number(personaje[caractClave]) || 0) : 0;

            ejecutarTirada({
                nombreAccion: nombreAccion,
                valorHabilidad: valorHab,
                valorCaracteristica: valorCaract,
                criticoFacil: criticoFacil,
                ...resolverModoTirada(modos)
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
            const { modos, criticoFacil } = obtenerConfiguracionTirada();
            ejecutarTirada({
                nombreAccion: nombre,
                valorHabilidad: 0,
                etiquetaHabilidad: null,
                valorCaracteristica: Number(personaje[atributo]) || 0,
                etiquetaCaracteristica: nombre,
                criticoFacil: criticoFacil,
                ...resolverModoTirada(modos)
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
        const { modos, criticoFacil } = obtenerConfiguracionTirada();
        const { modo, bonificador } = combinarModos(modoArmadura, ...modos);
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
    // Aviso en el panel de tiradas: los estados que cambian el modo de todas las tiradas
    const aviso = document.getElementById("avisoModoTirada");
    if (aviso) {
        aviso.textContent = estaActivo(personaje, "aturdido") ? "Aturdido: tiras con desventaja" : "";
        aviso.style.display = aviso.textContent ? "" : "none";
    }

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
    inicializarModsEquipo();
    actualizarModificadores();
    parseModificadoresEquipo();
    actualizarTodo();
    inicializarTiradasHabilidades();
    inicializarTurno();
    inicializarEstados();
    inicializarDanno();
    inicializarPestanas();
    inicializarSonido();
    inicializarDebug();
    actualizarTodo();
});