import Equipamiento from "./equipamiento.js";
import Modificador from "./modificador.js";
import PJ from "./PJ.js";
import { ejecutarTirada } from "./dados.js";

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
    parseModificadores();
    parseModificadoresEquipo();
    generarAccesorios();
    parseModificadoresAccesorios();
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



/* Modificadores */
let listadoModificadores = document.getElementById("listadoModificadores")
let botonAnnadir = document.getElementById("anadirMod");
console.log("boton añadir", botonAnnadir);

botonAnnadir.addEventListener('click', function () {
    personaje.modificadores.push(new Modificador("nombre", "atletismo", 0, 0))
    parseModificadores();
});

function parseModificadores() {
    listadoModificadores.innerHTML = "";
    personaje.modificadores.forEach((modificador, index) => {
        listadoModificadores.innerHTML += ` 
                <div id="modificador${index}" class="modificador">
                    Modificador: <input type="text" class="" value="${modificador.nombre}"> Atributo: <select class="listValores"> 
                        <option value="atletismo">Atletismo</option>
                        <option value="combate">Combate</option>
                        <option value="percepcion">Percepción</option>
                        <option value="subterfugio">Sigilo</option>
                        <option value="comunicacion">Carisma</option>
                        <option value="cutlura">Cultura</option>
                        <option value="profesion">Profesion</option>
                        <option value="sacro">Sacro</option>
                        <option value="armadura">Armadura</option>
                        <option value="">Regeneracion</option>

                    </select> 
                    Cantidad:
                    <input type="number"  class="cantidadMod" value="${modificador.numero}"/> 
                    Duracion: <input  class="duracionMod" value="${modificador.turnos}"/>
                    <div class="eliminarMod">-</div>
                </div>`;
    });

    /* Se añaden funcionalidad a los elementos TODO : hacer que el evento se lanze en los contenedores de modificadores y que haga bubbling para ver si esta donde debe  */
    añadirFuncionalidadElementoModificador();

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

const TIPOS_DOS_MANOS = ["lanza", "espadon", "martillo_guerra", "hacha", "gran_escudo"];

const TIPOS_ESCUDO = ["escudo", "gran_escudo"];

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
            });
        }

        if (inputDanno) {
            inputDanno.addEventListener("input", (e) => {
                personaje[propEquipo].danno = Number(e.target.value) || 0;
            });
        }

        if (inputDefensa) {
            inputDefensa.addEventListener("input", (e) => {
                personaje[propEquipo].defensa = Number(e.target.value) || 0;
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
            btnUsar.addEventListener("click", () => {
                const item = personaje[propEquipo];
                if (TIPOS_ESCUDO.includes(item?.tipo)) {
                    // Alterna el escudo: en uso suma su defensa, al repetir vuelve al estado original
                    item.enUso = !item.enUso;
                    personaje.calcularCaracteristicas();
                    actualizarTodo();
                    return;
                }
                const nombreArma = item?.nombre?.trim() || "Arma sin nombre";
                const danno = item?.danno || 0;
                const tipo = item?.tipo || "Sin tipo";
                const esDosManos = TIPOS_DOS_MANOS.includes(item?.tipo);
                const etiquetaMano = esDosManos ? 'Dos manos' : (propEquipo === 'manoIzquierda' ? 'Mano izquierda' : 'Mano derecha');
                alert(`Usando equipamiento (${etiquetaMano}):\nNombre: ${nombreArma}\nTipo: ${tipo}\nDaño: ${danno}`);
            });
        }

        if (btnAddMod) {
            btnAddMod.addEventListener("click", () => {
                if (!Array.isArray(personaje[propEquipo].modificadores)) {
                    personaje[propEquipo].modificadores = [];
                }
                personaje[propEquipo].modificadores.push(new Modificador("Nombre", "atletismo", 0, -1));
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
        if (btnUsar && esEscudo) {
            btnUsar.textContent = item.enUso ? "Guardar" : "Usar";
            btnUsar.classList.toggle("en-uso", Boolean(item.enUso));
        } else if (btnUsar) {
            btnUsar.textContent = "Usar";
            btnUsar.classList.remove("en-uso");
        }

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
                  <select class="listValores" > 
                        <option ${modificador.modificado == "atletismo" ? "selected" : ""} value="atletismo">Atletismo</option>
                        <option ${modificador.modificado == "combate" ? "selected" : ""} value="combate">Combate</option>
                        <option ${modificador.modificado == "percepcion" ? "selected" : ""} value="percepcion">Percepción</option>
                        <option ${modificador.modificado == "subterfugio" ? "selected" : ""} value="subterfugio">Sigilo</option>
                        <option ${modificador.modificado == "comunicacion" ? "selected" : ""} value="comunicacion">Carisma</option>
                        <option ${modificador.modificado == "cutlura" ? "selected" : ""} value="cutlura">Cultura</option>
                        <option ${modificador.modificado == "profesion" ? "selected" : ""} value="profesion">Profesion</option>
                        <option ${modificador.modificado == "sacro" ? "selected" : ""} value="sacro">Sacro</option>
                        <option ${modificador.modificado == "armadura" ? "selected" : ""} value="armadura">Armadura</option>
                    </select> 
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
                personaje.accesorios[index].modificadores.push(new Modificador("Nombre", "atletismo", 0, 0));
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
              <select class="listValores" > 
                    <option ${modificador.modificado == "atletismo" ? "selected" : ""} value="atletismo">Atletismo</option>
                    <option ${modificador.modificado == "combate" ? "selected" : ""} value="combate">Combate</option>
                    <option ${modificador.modificado == "percepcion" ? "selected" : ""} value="percepcion">Percepción</option>
                    <option ${modificador.modificado == "subterfugio" ? "selected" : ""} value="subterfugio">Sigilo</option>
                    <option ${modificador.modificado == "comunicacion" ? "selected" : ""} value="comunicacion">Carisma</option>
                    <option ${modificador.modificado == "cutlura" ? "selected" : ""} value="cutlura">Cultura</option>
                    <option ${modificador.modificado == "profesion" ? "selected" : ""} value="profesion">Profesion</option>
                    <option ${modificador.modificado == "sacro" ? "selected" : ""} value="sacro">Sacro</option>
                    <option ${modificador.modificado == "armadura" ? "selected" : ""} value="armadura">Armadura</option>
                </select> 
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



/* Se llama cada vez que se añade un modificador */
function añadirFuncionalidadElementoModificador() {
    for (const modificador of document.getElementsByClassName("modificador")) {
        let index = modificador.id.substring(11);

        modificador.children[0].addEventListener('focusout', (evt) => {
            personaje.modificadores[index].nombre = evt.currentTarget.value;
            console.log(personaje.modificadores);
            actualizarTodo();//cuando se cambia el numero el valor numerico ded algo puede variar.

        })
        modificador.children[1].addEventListener('focusout', (evt) => {
            personaje.modificadores[index].modificado = evt.currentTarget.value;
            console.log(personaje.modificadores);
        })
        modificador.children[2].addEventListener('focusout', (evt) => {
            personaje.modificadores[index].numero = parseInt(evt.currentTarget.value);
            personaje.calcularCaracteristicas();
            console.log(personaje.modificadores);
            actualizarTodo();//cuando se cambia el numero el valor numerico ded algo puede variar.
        })
        modificador.children[3].addEventListener('focusout', (evt) => {
            personaje.modificadores[index].turnos = parseInt(evt.currentTarget.value);
            personaje.calcularCaracteristicas();
            actualizarTodo();//puede que haya desaparecido un modificador por lo que hay que recalcular
        })

        modificador.children[4].addEventListener('click', (evt) => {
            personaje.modificadores.splice(index, 1);
            parseModificadores();
            personaje.calcularCaracteristicas();
            actualizarTodo();//cuando se cambia el numero el valor numerico ded algo puede variar.

        })

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
            const valorHab = Number(personaje[habilidadId]) || 0;
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
}

document.addEventListener("DOMContentLoaded", () => {
    construirManosEquipamiento();
    inicializarEquipamiento();
    parseModificadores();
    parseModificadoresEquipo();
    actualizarTodo();
    inicializarTiradasHabilidades();
});