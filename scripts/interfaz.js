import Equipamiento, { ARMAS, TIPOS_DOS_MANOS, TIPOS_ESCUDO, TIPOS_ARMADURA, TIPO_ACCESORIO, TIPO_RELIQUIA, ELEMENTOS, cargarValoresElementales } from "./equipamiento.js";
import { esReliquia, usarHabilidadReliquia, motivoNoUsarHabilidad, cargarHabilidadReliquia, equipoDeRanura } from "./reliquias.js";
import Modificador, { TURNOS_PERMANENTE } from "./modificador.js";
import PJ from "./PJ.js";
import { ejecutarTirada, combinarModos, esCritico, mostrarPopupDanno } from "./dados.js";
import { prepararAtaque, calcularDannoAtaque, prepararLanzamiento, calcularDannoLanzamiento, describirEfecto } from "./ataque.js";
import {
    TIPOS_OBJETO, MAX_PILA_INVENTARIO, ELEMENTOS_ARROJADIZA, cargarObjeto, anadirAInventario, anadirABaul,
    transferirABaul, transferirAInventario, descartar, comer, beberPocion, aplicarPocionAArma, manosConArma,
    usarCristal, lanzarArrojadiza, manoParaUsar, categoriaEquipo, manosParaEquipar, motivoNoEquipar, equipar,
    motivoNoGuardar, motivoNoBeber, guardarEquipado, ranuraTieneEquipo, getCantidadAccesoriosPorArmadura, cabenEnInventario,
    anadirCor, gastarCor, aplicarEfectoEnObjetivo, ofrecerObjeto, consumirOfrecido
} from "./objetos.js";
import {
    puedeGastarVarias, gastarVarias, gastarTodas, partesDeMano, estaIncapacitado,
    iniciarTurno, gastarAccion, devolverAccion, puedeGastar, accionesRestantes,
    correr, puedeCorrer, puedeMoverse, velocidadMovimiento, velocidadCorrer,
    modoSigiloPorArmadura, puedeEntrarEnSigilo, entrarEnSigilo, salirDeSigilo, dannoHemorragia
} from "./turno.js";
import { ESTADOS_INFO, TIPOS_DANNO, aplicarDanno, activarEstado, quitarEstado, estaActivo, estiloColor } from "./estados.js";
import { iconoSao, tieneIconoSao } from "./iconos.js";
import { mostrarPopup, getHistorialPopups, vaciarHistorialPopups } from "./popups.js";
import { emitirEvento, configurarOrigen, setAplicadorDanno, setConsumidorOferta } from "./eventos.js";
import { escaparHtml } from "./html.js";
import {
    inicializarOnline, getEstadoOnline, getMiembrosSala, setIdPersonajeNube, abrirCuenta, abrirSala, abrirPersonajesNube,
    guardarEnNube, compartirArte, quitarArteDeSala
} from "./interfazOnline.js";
import {
    ZONAS, MOTIVOS_ZONA, cambiarZona, esZonaSegura, baulAccesible, puedeRepartirHabilidades, puedeRecibirDanno,
    descansoCorto, descansoLargo
} from "./zonas.js";
import { reproducir, iniciarBucle, pararBucle, precargarSonidos, estaSilenciado, setSilenciado } from "./sonidos.js";
import { ejecutarDebug, crearPersonajePrueba, validarFicha } from "./debug.js";
import {
    descargarCatalogo, copiarDelCatalogo, estadoRequisitos, motivoRequisitos, ranurasUsadas, PARTES_USO_ARTE,
    equiparArte, desequiparArte, motivoNoEquiparArte, motivoNoDesequiparArte, usarArte, motivoNoUsarArte,
    cargarArte, cargarRequisito, cumpleRequisitos, ajustarMemoriaArtes, GRUPOS_ARTE, TIPOS_REQUISITO,
    desbloqueosDisponibles, desbloqueosNaturales, anadirDesbloqueos, quitarDesbloqueos, motivoNoConseguirArte, conseguirArte,
    ETIQUETAS_CARACTERISTICA, ETIQUETAS_HABILIDAD, ETIQUETAS_ARMADURA as ETIQUETAS_TIPO_ARMADURA
} from "./artes.js";

let personaje = new PJ(); //objeto que almaacena y define el comportamiento y limites de toda la informacion relevante
// Los pop-ups compartidos llevan el nombre del personaje (eventos.js)
configurarOrigen({ personaje: () => personaje.nombre });

/* Modo master (?master en la URL): las tarjetas de equipo se editan libremente, como antes.
   Sin él, el equipo solo se cambia desde el inventario. */
const MODO_MASTER = new URLSearchParams(window.location.search).has("master");
document.body.classList.toggle("modo-master", MODO_MASTER);
/* Informacion */
let inputNombre = document.getElementById("nombre");
const selectProfesion = document.getElementById("tipoProfesion");
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
            if (!puedeRepartirHabilidades(personaje)) {
                element.value = personaje[element.id];
                return;
            }
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

/* Introduccion de datos en textareas y manejo general (solo los que son un campo de texto de PJ) */
const textareas = Array.from(document.getElementsByTagName("textarea")).filter(t => typeof personaje[t.id] === "string");
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

selectProfesion.addEventListener('change', (e) => {
    personaje.tipoProfesion = e.target.value;
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
        if (!puedeRepartirHabilidades(personaje)) return;
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
        if (!puedeRepartirHabilidades(personaje)) return;
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

// Cualquier ventana de Bootstrap suena al abrirse y al cerrarse (sus eventos suben hasta document).
// Al pasar de una ventana a otra (p. ej. inventario → crear objeto → inventario) no suenan:
// quien hace el cambio marca la ventana con data-sin-sonido-abrir / data-sin-sonido-cerrar.
document.addEventListener("show.bs.modal", (e) => {
    if (e.target.dataset.sinSonidoAbrir) delete e.target.dataset.sinSonidoAbrir;
    else reproducir("menuAbrir");
});
document.addEventListener("hide.bs.modal", (e) => {
    if (e.target.dataset.sinSonidoCerrar) delete e.target.dataset.sinSonidoCerrar;
    else reproducir("menuCerrar");
});


/* Botones redondos del pie de las ventanas: aceptar (azul) y cancelar (rosa) */
function inicializarBotonesModales() {
    document.querySelectorAll(".btn-modal-sao").forEach(boton => {
        boton.innerHTML = iconoSao(boton.classList.contains("aceptar") ? "aceptar" : "cancelar");
    });
}

function actualizarTodo() {
    comprobarMemoriaArtes();
    comprobarDesbloqueosNaturales();
    actualizarInformacion();
    actualizarAtributos();
    actualizarHabilidades();
    actualizarCaracteristicas();
    actuaizarTextos();
    actualizarEquipamiento();
    actualizarModificadores();
    generarAccesorios();
    parseModificadoresEquipo();
    pintarHabilidadesReliquia();
    actualizarObjetos();
    actualizarArtes();
    actualizarArtesPasivas();
    actualizarCatalogoArtes();
    actualizarAcciones();
    actualizarEstados();
    actualizarZona();
    comprobarCambios();
}

/* Cambios sin guardar ______________________________________________________
   hayCambiosSinGuardar pasa a true en cuanto la ficha difiere de la última
   guardada o cargada (se compara el JSON, así sirve para cualquier campo, también
   los nuevos). Vuelve a false al guardar o cargar. Si está a true, el navegador
   pide confirmación antes de recargar o cerrar la página. */
let hayCambiosSinGuardar = false;
let fichaGuardada = null; // JSON de la ficha tal y como se guardó o cargó por última vez

function marcarGuardado() {
    fichaGuardada = personaje.toJSONString();
    hayCambiosSinGuardar = false;
}

function comprobarCambios() {
    if (fichaGuardada === null) return; // aún arrancando
    hayCambiosSinGuardar = personaje.toJSONString() !== fichaGuardada;
}

// Los campos de texto actualizan el personaje sin pasar siempre por actualizarTodo
document.addEventListener("input", comprobarCambios);
document.addEventListener("change", comprobarCambios);

window.addEventListener("beforeunload", (e) => {
    comprobarCambios();
    if (!hayCambiosSinGuardar) return;
    // El navegador muestra su propio aviso ("¿Salir del sitio? Es posible que no se guarden los cambios")
    e.preventDefault();
    e.returnValue = "";
});

function actualizarInformacion() {
    inputNombre.value = personaje.nombre;
    selectProfesion.value = personaje.tipoProfesion;
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
    // Fuera de zona segura no se reparten puntos: sin botones y con los campos bloqueados
    const puedeRepartir = puedeRepartirHabilidades(personaje);
    const avisoZona = document.getElementById("avisoZonaHab");
    if (avisoZona) avisoZona.hidden = puedeRepartir || disponibles === 0;
    document.getElementById("habilidadesDiv").classList.toggle("sin-reparto", !puedeRepartir);
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
        input.readOnly = !puedeRepartir;
        input.title = puedeRepartir ? "" : MOTIVOS_ZONA.habilidades;

        // Si por cambio de nivel el valor actual del personaje supera el nuevo máximo, ajustarlo
        if (personaje[input.id] > maxPorHab) {
            personaje[input.id] = maxPorHab;
            input.value = maxPorHab;
        }

        const valorActual = Number(input.value) || 0;
        // Botón '+': solo visible si hay puntos disponibles y no se ha llegado al tope
        if (btnMas) {
            if (puedeRepartir && disponibles > 0 && valorActual < maxPorHab) {
                btnMas.classList.remove('oculto');
            } else {
                btnMas.classList.add('oculto');
            }
        }
        // Botón '-': visible si la habilidad tiene puntos (> 0)
        if (btnMenos) {
            if (puedeRepartir && valorActual > 0) {
                btnMenos.classList.remove('oculto');
            } else {
                btnMenos.classList.add('oculto');
            }
        }
    });
    actualizarHabilidadesEfectivas();
}

/* Valor con modificadores, estados y armadura bajo cada habilidad (solo si difiere del base) */
function actualizarHabilidadesEfectivas() {
    document.querySelectorAll('#habilidadesDiv .hab-efectivo').forEach(span => {
        const hab = span.dataset.hab;
        const base = Number(personaje[hab]) || 0;
        const efectivo = personaje.getGenerico(hab);
        const diferencia = efectivo - base;
        span.classList.toggle('sube', diferencia > 0);
        span.classList.toggle('baja', diferencia < 0);
        if (diferencia === 0) {
            span.textContent = '';
            span.removeAttribute('title');
            return;
        }
        span.textContent = efectivo;

        // Desglose al pasar el ratón
        const estados = personaje.getModificadorEstados(hab);
        const modificadores = personaje.getModificador(hab) - estados;
        const armadura = hab === 'atletismo' ? Number(personaje.equipoArmadura?.penalizacionAtletismo) || 0 : 0;
        const partes = [`Base ${base}`];
        if (modificadores) partes.push(`modificadores ${conSigno(modificadores)}`);
        if (estados) partes.push(`estados ${conSigno(estados)}`);
        if (armadura) partes.push(`armadura −${armadura}`);
        if (hab === 'atletismo' && base + modificadores + estados - armadura < 0) partes.push('mínimo 0');
        span.title = `${partes.join(', ')} = ${efectivo}`;
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

/* Carga una ficha ya parseada (de un fichero o de la nube) */
function cargarFicha(jsonData) {
    personaje.cargarJSON(jsonData);
    desbloqueosNaturalesVistos = null; // ficha nueva: no avisar de los desbloqueos que ya tenía
    actualizarTodo();
    marcarGuardado(); // recién cargada: no hay cambios que perder
    reproducir("linkStart");
}

/* Funcion de carga */
document.getElementById('fileInput').addEventListener('change', function (event) {
    const file = event.target.files[0]; // Get the selected file
    if (file && file.type === 'application/json') {  // Check if the file is a JSON file
        const reader = new FileReader();

        reader.onload = function (e) {
            try {
                cargarFicha(JSON.parse(e.target.result));
                setIdPersonajeNube(null); // viene de un fichero, no de la nube
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
        ["perspicacia", "Perspicacia"], ["percepcionPasiva", "Percepción pasiva"],
        ["regeneracion", "Regeneración (PV/turno)"]
    ]],
    // Se suman a la armadura elemental (PJ.getResistencia)
    ["Resistencias", ELEMENTOS.map(elemento => [`res_${elemento}`, `Resistencia a ${TIPOS_DANNO[elemento].etiqueta.toLowerCase()}`])]
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
    if (e.target.classList.contains("checkDescansoMod")) {
        // Se quita al hacer un descanso corto (la comida siempre lo hace)
        if (e.target.checked) mod.descansoCorto = true;
        else delete mod.descansoCorto;
        actualizarModificadores();
        return;
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
                    <label title="Se quita al hacer un descanso corto"><input type="checkbox" class="checkDescansoMod"> Descanso corto</label>
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
        // La comida siempre termina con el descanso corto: casilla marcada y fija
        const deComida = mod.origen === "comida";
        const checkDescanso = fila.querySelector(".checkDescansoMod");
        checkDescanso.checked = deComida || Boolean(mod.descansoCorto);
        checkDescanso.disabled = deComida;

        fila.classList.toggle("mod-positivo", numero > 0);
        fila.classList.toggle("mod-negativo", numero < 0);
        const pista = [permanente
            ? "Permanente: dura hasta que lo edites o lo borres"
            : `Quedan ${mod.turnos} turno${mod.turnos === 1 ? "" : "s"}`];
        if (deComida || mod.descansoCorto) pista.push("se quita con el descanso corto");
        fila.querySelector(".pista-mod").textContent = pista.join(" · ");
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

function equipamientoTieneContenido(propEquipo) {
    const item = personaje[propEquipo];
    if (!item) return false;
    const tieneNombre = Boolean(item.nombre && item.nombre.trim().length > 0);
    const tieneDanno = Boolean(item.danno && Number(item.danno) !== 0);
    const tienePen = Boolean(item.penalizacionAtletismo && Number(item.penalizacionAtletismo) !== 0);
    const tieneArm = Boolean(item.armadura && Number(item.armadura) !== 0) || Boolean(item.defensa && Number(item.defensa) !== 0)
        || [item.resistencias, item.dannoElemental].some(valores => Object.values(valores || {}).some(valor => Number(valor) > 0));
    const tieneMods = Boolean(Array.isArray(item.modificadores) && item.modificadores.length > 0);
    const tieneHabilidades = Boolean(item.reliquia?.habilidades?.length);
    return tieneNombre || tieneDanno || tienePen || tieneArm || tieneMods || tieneHabilidades;
}

function limpiarContenidoEquipamiento(propEquipo) {
    const item = personaje[propEquipo];
    if (!item) return;
    item.nombre = "";
    item.danno = 0;
    item.penalizacionAtletismo = 0;
    item.armadura = 0;
    item.resistencias = cargarValoresElementales();
    item.dannoElemental = cargarValoresElementales();
    item.defensa = 0;
    item.enUso = false;
    item.modificadores = [];
    item.reliquia = null;
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
    const btnConfirmar = document.getElementById("btnConfirmarCambioEquipo");

    if (btnCancelar) btnCancelar.addEventListener("click", cancelarCambio);
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

        // Sin modo master el equipo no se edita aquí: se equipa y se guarda desde el inventario
        if (!MODO_MASTER) {
            elemento.querySelectorAll(".equipamiento-main-inputs input").forEach(input => { input.readOnly = true; });
        }
        const btnGuardar = elemento.querySelector(".btn-guardar-equipo");
        if (btnGuardar) {
            btnGuardar.innerHTML = iconoSao("inventario");
            btnGuardar.addEventListener("click", () => guardarEnInventario(propEquipo));
        }

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

/* Aviso en la tarjeta del arma cuando tiene una poción aplicada (se gasta en el siguiente golpe) */
function actualizarPocionesArmas() {
    CONFIG_MANOS.forEach(({ prop }) => {
        const aviso = document.querySelector(`.${prop}.equipamiento .equipamiento-pocion`);
        if (!aviso) return;
        const pocion = personaje[prop]?.pocionAplicada;
        aviso.hidden = !pocion;
        if (!pocion) return;
        const texto = `Poción activa: ${describirEfecto(pocion)}`;
        if (aviso.textContent !== texto) aviso.textContent = texto;
        aviso.title = "Se aplica al objetivo en el siguiente golpe con esta arma";
    });
}

function actualizarEquipamiento() {
    actualizarPocionesArmas();
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
        const esReliquiaSinArma = item.tipo === TIPO_RELIQUIA;
        // Elegida en el desplegable (modo master): siempre tiene su lista de habilidades
        if (esReliquiaSinArma && !item.reliquia) item.reliquia = { habilidades: [] };

        // Un escudo no tiene daño, solo defensa; una reliquia sin arma no tiene ninguno de los dos ni ataque
        if (campoDanno) campoDanno.style.display = esEscudo || esReliquiaSinArma ? "none" : "";
        if (btnUsar) btnUsar.style.display = esReliquiaSinArma ? "none" : "";
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

        // Sin modo master: el tipo se ve como texto y la tarjeta vacía invita a equipar desde el inventario
        const textoTipo = elemento.querySelector(".tipoEquipoTexto");
        if (textoTipo) {
            const tipoTexto = select?.selectedOptions[0]?.textContent ?? item.tipo;
            // Un arma reliquia lleva " · Reliquia"; una reliquia sin arma ya se llama así
            const marca = esReliquia(item) && item.tipo !== TIPO_RELIQUIA ? "Reliquia" : "";
            textoTipo.textContent = !tieneTipo ? "" : [tipoTexto, marca].filter(Boolean).join(" · ");
        }
        const vacio = elemento.querySelector(".equipamiento-vacio");
        if (vacio) vacio.style.display = (!tieneTipo && !MODO_MASTER) ? "" : "none";
        actualizarBotonGuardar(elemento.querySelector(".btn-guardar-equipo"), propEquipo);

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
        pintarDescripcionEquipo(elemento.querySelector(".equipamiento-descripcion"), item);
    });
    actualizarBloquesElementales();
}

/* Valores elementales del equipo ______________________________________________
   Un campo con el icono de cada elemento. Dos campos de Equipamiento los usan:
   - resistencias (armaduras): restan el daño de ese elemento a cada impacto;
   - dannoElemental (armas): se suma a cada ataque, aparte del físico.
   En las tarjetas (.bloque-elemental[data-elemental]) solo se ven los elementos con valor y el bloque
   entero se oculta si no hay ninguno; en modo master se ven todos para poder editarlos.
   En el formulario de objetos van plegados en un acordeón. */

const TEXTO_ELEMENTAL = {
    resistencias: (etiqueta) => `Resistencia a ${etiqueta}`,
    dannoElemental: (etiqueta) => `Daño de ${etiqueta}`
};

/* Campos del formulario de objetos: id del contenedor, del acordeón y prefijo de los inputs */
const FORMULARIO_ELEMENTAL = {
    resistencias: { contenedor: "objetoResistencias", acordeon: "detallesResistenciasObjeto", prefijo: "objetoRes_" },
    dannoElemental: { contenedor: "objetoDannoElemental", acordeon: "detallesDannoElementalObjeto", prefijo: "objetoElem_" }
};

function campoElemental(campo, elemento, atributosInput = "") {
    const info = TIPOS_DANNO[elemento];
    const nombre = TEXTO_ELEMENTAL[campo](info.etiqueta.toLowerCase());
    return `<label class="campo-elemental" title="${nombre}" style="${estiloColor(info)}">
        <span class="icono-elemental">${iconoSao(info.icono)}</span>
        <input type="number" min="0" value="0" data-elemento="${elemento}" aria-label="${nombre}" ${atributosInput}>
    </label>`;
}

/* El icono se colorea en cuanto el valor pasa de 0 */
function marcarElementalesActivos(contenedor) {
    contenedor.querySelectorAll("input[data-elemento]").forEach(input => {
        input.closest(".campo-elemental").classList.toggle("activa", (Number(input.value) || 0) > 0);
    });
}

/* ¿La tarjeta muestra ese campo? Resistencias, la armadura; daño elemental, un arma de ataque */
function tarjetaUsaElemental(item, campo) {
    if (campo === "resistencias") return TIPOS_ARMADURA.includes(item?.tipo);
    return Boolean(ARMAS[item?.tipo]) && !ARMAS[item.tipo].escudo;
}

function inicializarBloquesElementales() {
    document.querySelectorAll(".equipamiento .bloque-elemental").forEach(bloque => {
        const propEquipo = getPropiedadEquipo(bloque.closest(".equipamiento"));
        const campo = bloque.dataset.elemental;
        const valores = bloque.querySelector(".valores-elementales");
        valores.innerHTML = ELEMENTOS.map(elemento => campoElemental(campo, elemento, MODO_MASTER ? "" : "readonly")).join("");
        valores.addEventListener("input", (e) => {
            const elemento = e.target.dataset.elemento;
            const item = personaje[propEquipo];
            if (!elemento || !item) return;
            item[campo] = cargarValoresElementales({ ...item[campo], [elemento]: e.target.value });
            marcarElementalesActivos(valores);
        });
    });

    for (const [campo, { contenedor, prefijo }] of Object.entries(FORMULARIO_ELEMENTAL)) {
        const elemento = document.getElementById(contenedor);
        elemento.innerHTML = ELEMENTOS.map(e => campoElemental(campo, e, `id="${prefijo}${e}"`)).join("");
        elemento.addEventListener("input", () => marcarElementalesActivos(elemento));
    }
}

function actualizarBloquesElementales() {
    document.querySelectorAll(".equipamiento .bloque-elemental").forEach(bloque => {
        const item = personaje[getPropiedadEquipo(bloque.closest(".equipamiento"))];
        const campo = bloque.dataset.elemental;
        let visibles = 0;
        bloque.querySelectorAll("input[data-elemento]").forEach(input => {
            const valor = Number(item?.[campo]?.[input.dataset.elemento]) || 0;
            if (document.activeElement !== input) input.value = valor;
            const campoEl = input.closest(".campo-elemental");
            campoEl.classList.toggle("activa", valor > 0);
            campoEl.hidden = !(MODO_MASTER || valor > 0);
            if (!campoEl.hidden) visibles++;
        });
        bloque.hidden = !tarjetaUsaElemental(item, campo) || visibles === 0;
    });
}

/* Formulario de objetos: rellenar, leer y reiniciar los valores elementales */
function rellenarElementalesFormulario(campo, valores) {
    const { contenedor, acordeon, prefijo } = FORMULARIO_ELEMENTAL[campo];
    ELEMENTOS.forEach(elemento => { document.getElementById(prefijo + elemento).value = valores?.[elemento] || 0; });
    // El acordeón se abre solo si el objeto ya tiene alguno
    document.getElementById(acordeon).open = ELEMENTOS.some(elemento => valores?.[elemento] > 0);
    marcarElementalesActivos(document.getElementById(contenedor));
}

function leerElementalesFormulario(campo) {
    const { prefijo } = FORMULARIO_ELEMENTAL[campo];
    return cargarValoresElementales(Object.fromEntries(
        ELEMENTOS.map(elemento => [elemento, document.getElementById(prefijo + elemento).value])));
}

/* Descripción del objeto equipado (la que se le puso al crearlo en el inventario) */
function pintarDescripcionEquipo(parrafo, item) {
    if (!parrafo) return;
    const texto = item?.descripcion?.trim() ?? "";
    parrafo.textContent = texto;
    parrafo.style.display = texto ? "" : "none";
}

/* Botón Usar: atacar con el arma o activar el escudo ____________________________ */

const ETIQUETAS_MANO = { manoIzquierda: "Mano izquierda", manoDerecha: "Mano derecha" };

/* Gasta las acciones necesarias ("todas" = el turno entero); si no se puede, pregunta si hacerlo
   igualmente (p. ej. una reacción o una excepción del máster) */
function gastarAccionesOConfirmar(partes, descripcion) {
    if (partes === "todas" ? gastarTodas(personaje) : gastarVarias(personaje, partes)) return true;
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
    // La poción aplicada al arma se gasta en este ataque
    item.pocionAplicada = null;
    actualizarTodo();
}

/* Botón Guardar de cada tarjeta: lleva lo equipado al inventario */
function actualizarBotonGuardar(boton, ranura) {
    if (!boton) return;
    const tiene = ranuraTieneEquipo(personaje, ranura);
    boton.style.display = tiene ? "" : "none";
    if (!tiene) return;
    const motivo = motivoNoGuardar(personaje, ranura);
    const coste = ranura === "equipoArmadura" ? "gasta todas las acciones del turno"
        : ranura.startsWith("accesorio-") ? "gasta la acción de una mano libre" : "gasta la acción de esa mano";
    boton.title = motivo ? `No se puede guardar: ${motivo}` : `Guardar en el inventario (${coste})`;
    boton.setAttribute("aria-label", boton.title);
    boton.classList.toggle("sin-accion", Boolean(motivo));
}

function guardarEnInventario(ranura) {
    reproducir("click");
    const resultado = guardarEquipado(personaje, ranura, gastarAccionesOConfirmar);
    actualizarTodo();
    mostrarPopupInfo(resultado.ok ? "Guardado en el inventario" : "No se puede guardar", resultado.resumen.map(escaparHtml));
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
                <select class="listValores" aria-label="Atributo" ${MODO_MASTER ? "" : "disabled"}>${opcionesAtributo(mod.modificado)}</select>
                <input type="number" class="cantidadMod" aria-label="Cantidad" title="Cantidad (negativa para restar)" ${MODO_MASTER ? "" : "readonly"}>
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
        // Guardar un accesorio (las manos y la armadura tienen su propio listener)
        const guardarAccesorio = e.target.closest(".btn-guardar-equipo[data-ranura]");
        if (guardarAccesorio) {
            guardarEnInventario(guardarAccesorio.dataset.ranura);
            return;
        }

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

/* Habilidades de reliquia (reglas en reliquias.js) _________________________ */
// Cada .reliquia-habilidades está dentro de la tarjeta de su ranura (mano o reliquia).
// Solo se editan aquí en modo master; si no, solo se usan (se crean en el formulario de objetos).
// Las filas solo se regeneran si cambia cuántas hay.

function filaHabilidadReliquia(indice, conUsar = true, editable = true) {
    const soloLectura = editable ? "" : "readonly";
    return `<li class="habilidad-reliquia" data-index="${indice}">
        <div class="habilidad-fila">
            <input type="text" class="nombreHabilidad" placeholder="Nombre de la habilidad" aria-label="Nombre de la habilidad" ${soloLectura}>
            <label class="habilidad-enfriamiento" title="Turnos de enfriamiento tras usarla">Enfr.
                <input type="number" min="0" class="enfriamientoHabilidad" aria-label="Enfriamiento en turnos" ${soloLectura}></label>
            ${conUsar ? `<button type="button" class="btn-usar-habilidad"></button>` : ""}
            ${editable ? `<button type="button" class="quitar-habilidad" title="Eliminar habilidad" aria-label="Eliminar habilidad">×</button>` : ""}
        </div>
        <textarea class="descripcionHabilidad" rows="2" placeholder="Qué hace (sale como notificación al usarla)" aria-label="Descripción de la habilidad" ${soloLectura}></textarea>
    </li>`;
}

/* Pinta nombre, enfriamiento y descripción de cada fila sin pisar el campo con el foco */
function rellenarFilasHabilidades(ul, habilidades) {
    habilidades.forEach((habilidad, i) => {
        const fila = ul.children[i];
        const campos = [
            [".nombreHabilidad", habilidad.nombre],
            [".enfriamientoHabilidad", habilidad.enfriamiento],
            [".descripcionHabilidad", habilidad.descripcion]
        ];
        for (const [selector, valor] of campos) {
            const campo = fila.querySelector(selector);
            if (document.activeElement !== campo) campo.value = valor;
        }
    });
}

/* Ranura de la tarjeta que contiene el elemento: "manoIzquierda", "manoDerecha" o "accesorio-N" */
function ranuraDeTarjeta(elemento) {
    const accesorio = elemento.closest(".tarjeta-accesorio");
    if (accesorio) return `accesorio-${accesorio.dataset.index}`;
    return getPropiedadEquipo(elemento.closest(".equipamiento"));
}

function pintarHabilidadesReliquia() {
    document.querySelectorAll("#divEquipamiento .reliquia-habilidades").forEach(caja => {
        const ranura = ranuraDeTarjeta(caja);
        const equipo = equipoDeRanura(personaje, ranura);
        const visible = Boolean(equipo?.tipo) && esReliquia(equipo);
        caja.hidden = !visible;
        if (!visible) return;

        if (!caja.firstElementChild) {
            caja.innerHTML = `
                <div class="equipamiento-mods-header">
                    <span>Habilidades de reliquia:</span>
                    ${MODO_MASTER ? `<button type="button" class="btn-anadir-habilidad" title="Añadir habilidad" aria-label="Añadir habilidad">+</button>` : ""}
                </div>
                <ul class="lista-habilidades-reliquia" data-vacia="${MODO_MASTER ? "Sin habilidades: añade una con +" : "Sin habilidades"}"></ul>`;
        }
        const ul = caja.querySelector(".lista-habilidades-reliquia");
        const habilidades = equipo.reliquia.habilidades;
        if (ul.children.length !== habilidades.length) {
            ul.innerHTML = habilidades.map((_, i) => filaHabilidadReliquia(i, true, MODO_MASTER)).join("");
        }
        rellenarFilasHabilidades(ul, habilidades);

        const coste = ranura.startsWith("accesorio-") ? "la acción de un brazo"
            : TIPOS_DOS_MANOS.includes(equipo.tipo) ? "las acciones de las dos manos" : "la acción de esa mano";
        habilidades.forEach((habilidad, i) => {
            const fila = ul.children[i];
            const boton = fila.querySelector(".btn-usar-habilidad");
            const enEnfriamiento = habilidad.restante > 0;
            boton.disabled = enEnfriamiento;
            boton.textContent = enEnfriamiento ? `${habilidad.restante} t` : "Usar";
            boton.title = motivoNoUsarHabilidad(personaje, ranura, i)
                ?? `Usar ${habilidad.nombre.trim() || "la habilidad"}: muestra su descripción y gasta ${coste}`;
            boton.setAttribute("aria-label", boton.title);
            fila.classList.toggle("en-enfriamiento", enEnfriamiento);
            // Barra de enfriamiento: lo que falta respecto al total
            fila.style.setProperty("--enfriamiento", habilidad.enfriamiento > 0 ? habilidad.restante / habilidad.enfriamiento : 0);
        });
    });
}

function usarHabilidad(ranura, indice) {
    const equipo = equipoDeRanura(personaje, ranura);
    const habilidad = equipo?.reliquia?.habilidades?.[indice];
    if (!habilidad) return;
    const resultado = usarHabilidadReliquia(personaje, ranura, indice, gastarAccionesOConfirmar);
    actualizarTodo();
    const nombre = habilidad.nombre.trim() || "Habilidad";
    reproducir(resultado.ok ? "mensaje" : "click");
    const titulo = resultado.ok ? `${nombre} · ${equipo.nombre?.trim() || "Reliquia"}` : `No se puede: ${nombre}`;
    // Usada: se comparte en la sala (texto plano; el pintor respeta los saltos de línea). Si falla, solo aquí
    if (resultado.ok) {
        emitirEvento("reliquia", { titulo, subtitulo: "Reliquia", lineas: resultado.resumen });
        return;
    }
    mostrarPopupInfo(escaparHtml(titulo), resultado.resumen.map(linea => escaparHtml(linea).replace(/\n/g, "<br>")));
}

function inicializarHabilidadesReliquia() {
    const contenedor = document.getElementById("divEquipamiento");
    const datosFila = (elemento) => {
        const ranura = ranuraDeTarjeta(elemento);
        const indice = Number(elemento.closest(".habilidad-reliquia")?.dataset.index);
        return { ranura, indice, habilidad: equipoDeRanura(personaje, ranura)?.reliquia?.habilidades?.[indice] };
    };

    contenedor.addEventListener("click", (e) => {
        const anadir = MODO_MASTER && e.target.closest(".btn-anadir-habilidad");
        if (anadir) {
            const habilidades = equipoDeRanura(personaje, ranuraDeTarjeta(anadir))?.reliquia?.habilidades;
            if (!habilidades) return;
            reproducir("click");
            habilidades.push(cargarHabilidadReliquia({ enfriamiento: 1 }));
            actualizarTodo();
            anadir.closest(".reliquia-habilidades").querySelector(".habilidad-reliquia:last-child .nombreHabilidad")?.focus();
            return;
        }
        const quitar = MODO_MASTER && e.target.closest(".reliquia-habilidades .quitar-habilidad");
        if (quitar) {
            const { ranura, indice, habilidad } = datosFila(quitar);
            if (!habilidad) return;
            const conContenido = habilidad.nombre.trim() || habilidad.descripcion.trim();
            if (conContenido && !confirm(`¿Eliminar la habilidad ${habilidad.nombre.trim() || "sin nombre"}?`)) return;
            equipoDeRanura(personaje, ranura).reliquia.habilidades.splice(indice, 1);
            actualizarTodo();
            return;
        }
        const usar = e.target.closest(".btn-usar-habilidad");
        if (usar) {
            const { ranura, indice } = datosFila(usar);
            usarHabilidad(ranura, indice);
        }
    });

    // Edición (solo en modo master). Texto: se guarda al escribir, sin repintar (no se pierde el foco)
    if (!MODO_MASTER) return;
    contenedor.addEventListener("input", (e) => {
        if (!e.target.closest(".reliquia-habilidades")) return;
        const { habilidad } = datosFila(e.target);
        if (!habilidad) return;
        if (e.target.classList.contains("nombreHabilidad")) habilidad.nombre = e.target.value;
        if (e.target.classList.contains("descripcionHabilidad")) habilidad.descripcion = e.target.value;
    });

    contenedor.addEventListener("change", (e) => {
        if (!e.target.classList.contains("enfriamientoHabilidad") || !e.target.closest(".reliquia-habilidades")) return;
        const { habilidad } = datosFila(e.target);
        if (!habilidad) return;
        habilidad.enfriamiento = Math.max(0, parseInt(e.target.value) || 0);
        habilidad.restante = Math.min(habilidad.restante, habilidad.enfriamiento);
        actualizarTodo();
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
                    <input type="text" class="inputNombreAccesorio" placeholder="${MODO_MASTER ? `Accesorio ${i + 1}` : "Vacío: equipa desde el inventario"}"
                        aria-label="Nombre del accesorio ${i + 1}" ${MODO_MASTER ? "" : "readonly"}>
                    <span class="accesorio-marca-reliquia" hidden>Reliquia</span>
                    <button type="button" class="btn-guardar-equipo" data-ranura="accesorio-${i}">${iconoSao("inventario")}</button>
                </div>
                <p class="equipamiento-descripcion"></p>
                <div class="equipamiento-mods-header">
                    <span>Modificadores:</span>
                    <button type="button" class="btn-anadir-mod-equipo" title="Añadir modificador" aria-label="Añadir modificador">+</button>
                </div>
                <ul class="mods-equipo" data-mods="accesorio-${i}"></ul>
                <div class="reliquia-habilidades" hidden></div>
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
        const tarjeta = contenedor.querySelector(`.tarjeta-accesorio[data-index="${i}"]`);
        const input = tarjeta?.querySelector(".inputNombreAccesorio");
        if (input && document.activeElement !== input) input.value = accesorio.nombre || "";
        pintarDescripcionEquipo(tarjeta?.querySelector(".equipamiento-descripcion"), accesorio);
        const marca = tarjeta?.querySelector(".accesorio-marca-reliquia");
        if (marca) marca.hidden = !esReliquia(accesorio);
        actualizarBotonGuardar(tarjeta?.querySelector(".btn-guardar-equipo"), `accesorio-${i}`);
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
    const popup = document.createElement("div");
    popup.className = "popup-dado";
    popup.innerHTML = `
        <div class="popup-header"><strong class="popup-titulo">${titulo}</strong></div>
        <ul class="popup-lista">${lineas.map(l => `<li>${l}</li>`).join("")}</ul>`;
    // Se cierra solo a los 8 s (popups.js)
    mostrarPopup(popup, { titulo, tipo: "info" });
}

/* Botón de turno en cada zona: icono (imgs/), texto y lo que hace */
const BOTON_TURNO_POR_ZONA = {
    noSegura: { icono: "turno", titulo: "Inicio de turno", ayuda: "Iniciar turno: aplica estados y resetea las acciones", accion: iniciarTurno },
    segura: { icono: "descanso", titulo: "Descanso corto", ayuda: "Descanso corto: termina la comida y los estados y modificadores por turnos (no recarga PA)", accion: descansoCorto },
    base: { icono: "cama", titulo: "Descanso largo", ayuda: "Descanso largo: descanso corto, cura los estados negativos (también oscuridad) y recarga PA y PV", accion: descansoLargo }
};

/* Cambia los dos iconos (normal y _on) de un botón .btn-icono-sao */
function ponerIconoBoton(boton, icono) {
    const [imgOff, imgOn] = boton.querySelectorAll("img");
    if (imgOff.src.endsWith(`/${icono}.svg`)) return;
    imgOff.src = `./imgs/${icono}.svg`;
    imgOn.src = `./imgs/${icono}_on.svg`;
}

function inicializarTurno() {
    // El botón de turno cambia según la zona: Play, descanso corto o descanso largo
    document.getElementById("btnIniciarTurno").addEventListener("click", () => {
        reproducir("click");
        const boton = BOTON_TURNO_POR_ZONA[personaje.zona] ?? BOTON_TURNO_POR_ZONA.noSegura;
        const resumen = boton.accion(personaje);
        actualizarTodo();
        mostrarPopupInfo(boton.titulo, resumen.map(escaparHtml));
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
    if (esZonaSegura(personaje)) avisos.push(`${ZONAS[personaje.zona].etiqueta}: las acciones no se gastan`);
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
        if (e.target.classList.contains("checkDescansoEstado")) {
            // Se quita al hacer un descanso corto
            if (e.target.checked) estado.descansoCorto = true;
            else delete estado.descansoCorto;
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
        case "hemorragia": {
            const sangrado = dannoHemorragia(valor, aguante);
            return sangrado > 0
                ? `Aguante ${aguante}: −${sangrado} PV por turno`
                : `Sin efecto hasta llegar al Aguante (${aguante})`;
        }
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
                <label title="Se quita al hacer un descanso corto"><input type="checkbox" class="checkDescansoEstado"> Descanso corto</label>
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
        // El estado de la comida termina con ella (descanso corto): casilla marcada y fija
        const deComida = estado.origen === "comida";
        const checkDescanso = fila.querySelector(".checkDescansoEstado");
        checkDescanso.checked = deComida || Boolean(estado.descansoCorto);
        checkDescanso.disabled = deComida;
        const pista = [pistaEstado(fila.dataset.estado)];
        if (estado.turnos === 0) pista.push("Último turno: termina al iniciar el siguiente");
        if (deComida) pista.push(`De la comida (${personaje.comidaActiva || "comida"}): se quita con el descanso corto`);
        else if (estado.descansoCorto) pista.push("Se quita con el descanso corto");
        fila.querySelector(".pista-estado").textContent = pista.filter(Boolean).join(" · ");
    });
}

/* Ventana de daño ___________________________________________________________ */
/* Orden en que se aplican los daños marcados a la vez */
const ORDEN_DANNO = ["fisico", "fuego", "electricidad", "hielo", "luz", "oscuridad", "hemorragia"];
const ELEMENTOS_DANNO = ["fuego", "electricidad", "hielo", "luz", "oscuridad"];

/* Golpe de otro jugador recibido al pulsar su pop-up (eventos.js). Cada golpe va por separado: el físico
   resta la armadura y cada elemento su resistencia, igual que con el botón Daño. Devuelve si se aplicó. */
function recibirGolpe(golpe, { autor, titulo, tirada = null }) {
    if (!puedeRecibirDanno(personaje)) {
        mostrarPopupInfo("No puedes recibir daño", [escaparHtml(MOTIVOS_ZONA.danno)]);
        return false;
    }
    // Para dar, el ataque tiene que igualar o superar la Defensa (con escudos en uso)
    const defensa = Number(personaje.defensa) || 0;
    if (tirada !== null && tirada < defensa
        && !confirm(`La tirada de ${autor} (${tirada}) no llega a tu Defensa (${defensa}): este golpe no debería darte.\n\n¿Recibirlo igualmente?`)) {
        return false;
    }
    const cantidad = (valor) => Math.max(0, Math.floor(Number(valor) || 0));
    const dannos = [];
    if (cantidad(golpe.total) > 0) dannos.push({ tipo: "fisico", cantidad: cantidad(golpe.total) });
    (Array.isArray(golpe.elemental) ? golpe.elemental : []).forEach(({ tipo, cantidad: valor }) => {
        if (ELEMENTOS_DANNO.includes(tipo) && cantidad(valor) > 0) dannos.push({ tipo, cantidad: cantidad(valor) });
    });
    // Poción aplicada al arma o efecto de la arrojadiza: veneno, daño elemental, PV...
    const efecto = golpe.efecto && typeof golpe.efecto === "object" ? golpe.efecto : null;
    if (!dannos.length && !efecto) {
        mostrarPopupInfo("Sin daño", ["Este golpe no hace daño."]);
        return false;
    }
    const vidaAntes = personaje.vida;
    const conCabeceras = dannos.length + (efecto ? 1 : 0) > 1;
    const lineas = dannos.flatMap(({ tipo, cantidad: valor }) => {
        const resumen = aplicarDanno(personaje, valor, tipo);
        return conCabeceras ? [`${TIPOS_DANNO[tipo].etiqueta} ${valor}:`, ...resumen] : resumen;
    });
    if (efecto) {
        const resumen = aplicarEfectoEnObjetivo(personaje, efecto);
        lineas.push(...(conCabeceras ? [`${String(efecto.nombre || "Poción")}:`, ...resumen] : resumen));
    }
    actualizarTodo();
    const golpeTexto = golpe.etiqueta ? ` (${golpe.etiqueta})` : "";
    emitirDannoRecibido(vidaAntes, `${titulo}${golpeTexto} · de ${autor}`, lineas);
    return true;
}
setAplicadorDanno(recibirGolpe);

/* Comida o poción que te ofrece otro jugador (pop-up "oferta"): gasta la boca y avisa a toda la sala */
function consumirOferta(datosObjeto, { autor }) {
    const resultado = consumirOfrecido(personaje, datosObjeto, gastarAccionesOConfirmar);
    actualizarTodo();
    if (!resultado.ok) {
        mostrarPopupInfo("No puedes consumirlo", resultado.resumen.map(escaparHtml));
        return false;
    }
    reproducir("click");
    const nombre = String(personaje.nombre ?? "").trim() || "Alguien";
    emitirEvento("consumido", {
        titulo: `${nombre} consume ${resultado.objeto.nombre}`,
        subtitulo: `Ofrecida por ${autor}`,
        lineas: resultado.resumen
    });
    return true;
}
setConsumidorOferta(consumirOferta);

/* Aviso de daño recibido, compartido en la sala: "Kirito recibe 4 de daño" (PV perdidos) */
function emitirDannoRecibido(vidaAntes, subtitulo, lineas) {
    const nombre = String(personaje.nombre ?? "").trim() || "Tu personaje";
    const perdidos = vidaAntes - personaje.vida;
    emitirEvento("recibido", {
        titulo: perdidos > 0 ? `${nombre} recibe ${perdidos} de daño` : `${nombre} recibe el golpe`,
        subtitulo,
        lineas
    });
}

function inicializarDanno() {
    const modalEl = document.getElementById("modalDanno");
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    const subElemental = document.getElementById("dannoSubElemental");
    const cantidadesEl = document.getElementById("dannoCantidades");
    const preview = document.getElementById("previewDanno");

    // Icono y color de cada opción de tipo de daño
    modalEl.querySelectorAll(".opcion-danno").forEach(opcion => {
        const info = TIPOS_DANNO[opcion.querySelector("input").value];
        if (!info) return;
        opcion.setAttribute("style", estiloColor(info));
        opcion.insertAdjacentHTML("afterbegin", `<span class="opcion-icono">${iconoSao(info.icono)}</span>`);
    });

    // Una fila de cantidad por tipo final; solo se ven las de los tipos marcados
    cantidadesEl.innerHTML = ORDEN_DANNO.map(tipo => {
        const info = TIPOS_DANNO[tipo];
        return `
        <div class="fila-cantidad-danno" data-tipo="${tipo}" style="${estiloColor(info)}" hidden>
            <span class="opcion-icono">${iconoSao(info.icono)}</span>
            <label class="nombre-danno" for="cantidadDanno-${tipo}">${info.etiqueta}</label>
            <input type="number" class="form-control cantidad-danno" id="cantidadDanno-${tipo}" min="0" placeholder="0">
            ${tipo === "fisico" ? `<label class="danno-check"><input type="checkbox" id="checkIgnorarArmadura"> Ignorar armadura</label>` : ""}
        </div>`;
    }).join("");
    const checkIgnorar = document.getElementById("checkIgnorarArmadura");
    const fila = (tipo) => cantidadesEl.querySelector(`.fila-cantidad-danno[data-tipo="${tipo}"]`);
    const marcado = (nombre, valor) => Boolean(modalEl.querySelector(`input[name="${nombre}"][value="${valor}"]`)?.checked);

    /* Tipos finales marcados (los elementos solo si Elemental está marcado) */
    const tiposMarcados = () => ORDEN_DANNO.filter(tipo => ELEMENTOS_DANNO.includes(tipo)
        ? marcado("tipoDanno", "elemental") && marcado("elementoDanno", tipo)
        : marcado("tipoDanno", tipo));

    /* [{ tipo, cantidad }] de los tipos marcados con cantidad > 0, en ORDEN_DANNO */
    const leerDannos = () => tiposMarcados()
        .map(tipo => ({ tipo, cantidad: Math.max(0, parseInt(fila(tipo).querySelector(".cantidad-danno").value) || 0) }))
        .filter(danno => danno.cantidad > 0);

    /* Aplica todos los daños y devuelve las líneas agrupadas por tipo */
    const aplicarTodos = (pj, dannos) => dannos.flatMap(({ tipo, cantidad }) => {
        const resumen = aplicarDanno(pj, cantidad, tipo, { ignorarArmadura: tipo === "fisico" && checkIgnorar.checked });
        return dannos.length > 1 ? [`<b>${TIPOS_DANNO[tipo].etiqueta} ${cantidad}</b>`, ...resumen] : resumen;
    });

    const pintarFilas = () => {
        subElemental.style.display = marcado("tipoDanno", "elemental") ? "" : "none";
        const marcados = tiposMarcados();
        ORDEN_DANNO.forEach(tipo => { fila(tipo).hidden = !marcados.includes(tipo); });
    };

    // La vista previa aplica los daños sobre una copia del personaje
    const actualizarPreview = () => {
        pintarFilas();
        const dannos = leerDannos();
        if (!dannos.length) {
            preview.innerHTML = `<li>${tiposMarcados().length ? "Sin daño" : "Marca al menos un tipo de daño"}</li>`;
            return;
        }
        const copia = new PJ();
        copia.cargarJSON(JSON.parse(personaje.toJSONString()));
        preview.innerHTML = aplicarTodos(copia, dannos)
            .map(linea => linea.startsWith("<b>") ? `<li class="preview-tipo">${linea}</li>` : `<li>${linea}</li>`).join("");
    };

    const enfocarPrimeraCantidad = () => {
        const input = cantidadesEl.querySelector(".fila-cantidad-danno:not([hidden]) .cantidad-danno");
        input?.focus();
        input?.select();
    };

    const aplicar = () => {
        const dannos = leerDannos();
        if (!dannos.length || !puedeRecibirDanno(personaje)) return;
        const vidaAntes = personaje.vida;
        // Se comparte en la sala: texto plano (las cabeceras <b>Tipo n</b> pasan a "Tipo n:")
        const resumen = aplicarTodos(personaje, dannos).map(linea => linea.replace(/^<b>(.*)<\/b>$/, "$1:"));
        modal.hide();
        actualizarTodo();
        const subtitulo = dannos.map(({ tipo, cantidad }) => `${TIPOS_DANNO[tipo].etiqueta} ${cantidad}`).join(" · ");
        emitirDannoRecibido(vidaAntes, subtitulo, resumen);
    };

    modalEl.addEventListener("change", (e) => {
        // Al marcar Elemental sin ningún elemento, se marca Fuego para no dejarlo vacío
        if (e.target.name === "tipoDanno" && e.target.value === "elemental" && e.target.checked
            && !modalEl.querySelector('input[name="elementoDanno"]:checked')) {
            modalEl.querySelector('input[name="elementoDanno"][value="fuego"]').checked = true;
        }
        actualizarPreview();
        // Al marcar un tipo, el foco va a su cantidad
        const tipo = e.target.name === "elementoDanno" ? e.target.value
            : e.target.name === "tipoDanno" && e.target.value === "elemental" ? tiposMarcados().find(t => ELEMENTOS_DANNO.includes(t))
            : e.target.name === "tipoDanno" ? e.target.value : null;
        if (tipo && e.target.checked) fila(tipo)?.querySelector(".cantidad-danno").focus();
    });
    modalEl.addEventListener("input", actualizarPreview);
    modalEl.addEventListener("shown.bs.modal", enfocarPrimeraCantidad);
    cantidadesEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.target.classList.contains("cantidad-danno")) aplicar();
    });
    document.getElementById("btnAplicarDanno").addEventListener("click", aplicar);

    // Al abrir: solo Físico marcado y todas las cantidades vacías
    document.getElementById("btnRecibirDanno").addEventListener("click", () => {
        if (!puedeRecibirDanno(personaje)) return;
        modalEl.querySelectorAll('input[name="tipoDanno"], input[name="elementoDanno"]').forEach(input => {
            input.checked = input.value === "fisico";
        });
        cantidadesEl.querySelectorAll(".cantidad-danno").forEach(input => { input.value = ""; });
        checkIgnorar.checked = false;
        actualizarPreview();
        modal.show();
    });
}

/* Menús desplegables SAO ____________________________________________________ */
// Filas con icono y texto que salen junto a un botón de la silueta, con la flecha apuntándole.
// Los usan la zona, el inventario y las opciones. Estilos: .menu-sao en secciones.css.

/* Duración de la animación de cierre: filas (0,1 s escalonadas + 0,14 s) y después la flecha */
const DURACION_CIERRE_MENU = 270;
const sinAnimacion = window.matchMedia("(prefers-reduced-motion: reduce)");

/**
 * Convierte un contenedor vacío en un menú desplegable del botón.
 * @param {object} config
 * @param {HTMLElement} config.boton  botón que lo abre y lo cierra
 * @param {HTMLElement} config.menu   contenedor (.menu-sao, hidden)
 * @param {() => Array<{clave, etiqueta, icono, activa?}>} config.opciones  filas (se vuelven a leer al abrir y en actualizar)
 * @param {(clave: string, menu) => void} config.alElegir  qué hacer al elegir una fila (el menú no se cierra solo)
 * @param {"menuitem"|"menuitemradio"} [config.rol]  menuitemradio si una fila es la activa (p. ej. la zona)
 * @returns {{ abrir, cerrar, actualizar }}
 */
function crearMenuSao({ boton, menu, opciones, alElegir, rol = "menuitem" }) {
    let temporizadorCierre = null;
    const cerrando = () => temporizadorCierre !== null;
    const filas = () => [...menu.querySelectorAll(".opcion-menu-sao")];

    // Las filas solo se regeneran si cambia cuántas hay; si no, se actualizan en su sitio
    // (así una actualización a mitad de la animación no la reinicia)
    const actualizar = () => {
        const lista = opciones();
        if (filas().length !== lista.length) {
            menu.innerHTML = lista.map(() => `
                <button type="button" class="opcion-menu-sao" role="${rol}">
                    <span class="opcion-menu-sao-icono"></span>
                    <span class="opcion-menu-sao-nombre"></span>
                </button>`).join("");
        }
        lista.forEach((opcion, i) => {
            const fila = filas()[i];
            fila.dataset.clave = opcion.clave;
            const icono = fila.querySelector(".opcion-menu-sao-icono");
            if (icono.dataset.icono !== opcion.icono) {
                icono.dataset.icono = opcion.icono;
                icono.innerHTML = iconoSao(opcion.icono);
            }
            fila.querySelector(".opcion-menu-sao-nombre").textContent = opcion.etiqueta;
            fila.classList.toggle("activa", Boolean(opcion.activa));
            if (rol === "menuitemradio") fila.setAttribute("aria-checked", String(Boolean(opcion.activa)));
        });
    };

    // Sale a la derecha del botón; si no cabe, a la izquierda
    const colocar = () => {
        const wrapper = boton.parentElement.getBoundingClientRect();
        const rect = boton.getBoundingClientRect();
        const separacion = 20; // deja sitio a la flecha
        menu.classList.remove("a-la-izquierda");
        menu.style.top = `${rect.top + rect.height / 2 - wrapper.top}px`;
        menu.style.left = `${rect.right + separacion - wrapper.left}px`;
        if (menu.getBoundingClientRect().right > document.documentElement.clientWidth - 8) {
            menu.classList.add("a-la-izquierda");
            menu.style.left = `${rect.left - separacion - wrapper.left - menu.offsetWidth}px`;
        }
    };

    /* Fila señalada con el teclado (dorada): la marca .teclado solo la pone el teclado,
       así el foco que se da al abrir con el ratón no la pinta */
    const senalar = (fila, conTeclado) => {
        filas().forEach(otra => otra.classList.toggle("teclado", conTeclado && otra === fila));
        fila?.focus();
    };

    const abrir = (conTeclado = false) => {
        // Si se estaba cerrando, se interrumpe y vuelve a entrar
        clearTimeout(temporizadorCierre);
        temporizadorCierre = null;
        menu.classList.remove("cerrando");
        filas().forEach(fila => fila.classList.remove("elegida"));
        actualizar();
        menu.hidden = false;
        boton.setAttribute("aria-expanded", "true");
        colocar();
        senalar(filas().find(fila => fila.classList.contains("activa")) ?? filas()[0], conTeclado);
        reproducir("menuAbrir");
    };

    /* Las filas desaparecen una a una (.cerrando) y el menú se oculta al terminar.
       sonido: false cuando lo que se elige ya suena (p. ej. abre una ventana). */
    const cerrar = ({ devolverFoco = false, sonido = true } = {}) => {
        if (menu.hidden || cerrando()) return;
        boton.setAttribute("aria-expanded", "false");
        if (devolverFoco) boton.focus();
        if (sonido) reproducir("menuCerrar");
        const ocultar = () => {
            temporizadorCierre = null;
            menu.classList.remove("cerrando");
            menu.hidden = true;
        };
        if (sinAnimacion.matches) return ocultar();
        menu.classList.add("cerrando");
        temporizadorCierre = setTimeout(ocultar, DURACION_CIERRE_MENU);
    };

    const control = { abrir, cerrar, actualizar };

    boton.setAttribute("aria-haspopup", "menu");
    boton.setAttribute("aria-expanded", "false");
    boton.addEventListener("click", (e) => (menu.hidden || cerrando() ? abrir(e.detail === 0) : cerrar()));

    // La fila elegida se queda dorada mientras el menú se cierra; si el menú sigue abierto
    // (p. ej. silenciar), solo destella un momento
    menu.addEventListener("click", (e) => {
        const fila = e.target.closest(".opcion-menu-sao");
        if (!fila) return;
        filas().forEach(otra => otra.classList.remove("elegida"));
        fila.classList.add("elegida");
        alElegir(fila.dataset.clave, control);
        if (!menu.hidden && !cerrando()) setTimeout(() => fila.classList.remove("elegida"), 180);
    });

    // Teclado: flechas para moverse, Escape o Tab para cerrar
    menu.addEventListener("keydown", (e) => {
        const lista = filas();
        const actual = lista.indexOf(document.activeElement);
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const paso = e.key === "ArrowDown" ? 1 : -1;
            senalar(lista[(actual + paso + lista.length) % lista.length], true);
        } else if (e.key === "Escape") {
            e.preventDefault();
            cerrar({ devolverFoco: true });
        } else if (e.key === "Tab") {
            cerrar();
        }
    });

    // Clic fuera del menú lo cierra
    document.addEventListener("click", (e) => {
        if (!menu.hidden && !menu.contains(e.target) && !boton.contains(e.target)) cerrar();
    });
    window.addEventListener("resize", () => { if (!menu.hidden) colocar(); });

    actualizar();
    return control;
}

/* Zona (reglas en zonas.js) _________________________________________________ */
const btnZona = document.getElementById("btnZona");
let menuZona = null;

function inicializarZona() {
    menuZona = crearMenuSao({
        boton: btnZona,
        menu: document.getElementById("menuZona"),
        rol: "menuitemradio",
        opciones: () => Object.entries(ZONAS).map(([clave, zona]) => ({
            clave, etiqueta: zona.etiqueta, icono: zona.icono, activa: clave === personaje.zona
        })),
        alElegir: (clave, menu) => {
            if (cambiarZona(personaje, clave)) reproducir("click");
            menu.cerrar({ devolverFoco: true });
            actualizarTodo();
        }
    });
    actualizarZona();
}

/* Icono del botón, zona marcada en el menú y botones que dependen de la zona */
function actualizarZona() {
    const zona = ZONAS[personaje.zona] ?? ZONAS.noSegura;
    ponerIconoBoton(btnZona, zona.icono);
    btnZona.title = `${zona.etiqueta} (cambiar de zona)`;
    menuZona?.actualizar();

    const btnTurno = document.getElementById("btnIniciarTurno");
    const turno = BOTON_TURNO_POR_ZONA[personaje.zona] ?? BOTON_TURNO_POR_ZONA.noSegura;
    ponerIconoBoton(btnTurno, turno.icono);
    btnTurno.title = turno.ayuda;
    btnTurno.setAttribute("aria-label", turno.titulo);

    const btnDanno = document.getElementById("btnRecibirDanno");
    btnDanno.disabled = !puedeRecibirDanno(personaje);
    btnDanno.title = btnDanno.disabled ? MOTIVOS_ZONA.danno : "Recibir daño";
}

/* Menú del inventario: inventario o baúl de la base ________________________ */
function inicializarMenuInventario() {
    const ventanas = { inventario: "modalInventario", baul: "modalBaul" };
    crearMenuSao({
        boton: document.getElementById("btnInventario"),
        menu: document.getElementById("menuInventario"),
        opciones: () => [
            { clave: "inventario", etiqueta: "Inventario", icono: "inventario" },
            { clave: "baul", etiqueta: "Baúl de la base", icono: "baul" }
        ],
        alElegir: (clave, menu) => {
            // Al elegir solo suena el click: ni el cierre del menú ni la apertura de la ventana
            reproducir("click");
            menu.cerrar({ sonido: false });
            const ventana = document.getElementById(ventanas[clave]);
            ventana.dataset.sinSonidoAbrir = "1";
            bootstrap.Modal.getOrCreateInstance(ventana).show();
        }
    });
}

/* Artes (reglas en artes.js) ________________________________________________
   El botón Artes abre un menú: artes equipadas (#modalArtesEquipadas, un hueco por ranura de memoria)
   o sin equipar (#modalArtesSinEquipar), como el inventario y el baúl.
   Las filas se regeneran solo si cambia su HTML (pintarLista); un listener delegado en cada lista. */

const listaArtesEquipadasEl = document.getElementById("listaArtesEquipadas");
const listaArtesSinEquiparEl = document.getElementById("listaArtesSinEquipar");

function inicializarArtes() {
    const ventanas = { equipadas: "modalArtesEquipadas", sinEquipar: "modalArtesSinEquipar" };
    crearMenuSao({
        boton: document.getElementById("btnArtes"),
        menu: document.getElementById("menuArtes"),
        opciones: () => [
            { clave: "equipadas", etiqueta: "Artes equipadas", icono: "artes" },
            { clave: "sinEquipar", etiqueta: "Artes sin equipar", icono: "artesSinEquipar" }
        ],
        alElegir: (clave, menu) => {
            // Como el inventario: al elegir solo suena el click
            reproducir("click");
            menu.cerrar({ sonido: false });
            const ventana = document.getElementById(ventanas[clave]);
            ventana.dataset.sinSonidoAbrir = "1";
            bootstrap.Modal.getOrCreateInstance(ventana).show();
        }
    });

    [listaArtesEquipadasEl, listaArtesSinEquiparEl].forEach(lista => lista.addEventListener("click", alPulsarArte));
    inicializarDesbloqueos();

    // Tarjetas de "Artes pasivas" (columna derecha): clic o Enter/Espacio abre su detalle
    const abrirDetallePasiva = (e) => {
        const tarjeta = e.target.closest(".arte-pasiva");
        const arte = personaje.artes[Number(tarjeta?.dataset.index)];
        // Las inactivas (requisitos sin cumplir) no abren notificación
        if (!arte || motivoRequisitos(personaje, arte)) return;
        reproducir("click");
        mostrarDetalleArte(arte);
    };
    listaArtesPasivasEl.addEventListener("click", abrirDetallePasiva);
    listaArtesPasivasEl.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        abrirDetallePasiva(e);
    });
}

function alPulsarArte(e) {
    const boton = e.target.closest("button[data-accion]");
    const arte = personaje.artes[Number(boton?.closest(".fila-objeto")?.dataset.index)];
    if (!boton || boton.disabled || !arte) return;
    reproducir("click");
    switch (boton.dataset.accion) {
        case "usar": {
            const resultado = usarArte(personaje, arte, gastarAccionesOConfirmar);
            actualizarTodo();
            mostrarPopupArte(arte, resultado);
            return;
        }
        case "equipar":
        case "desequipar": {
            const resultado = (boton.dataset.accion === "equipar" ? equiparArte : desequiparArte)(personaje, arte);
            actualizarTodo();
            if (!resultado.ok) mostrarPopupInfo("No se puede", resultado.resumen.map(escaparHtml));
            return;
        }
        case "editar":
            abrirEditorArte(arte, boton.closest(".modal"));
            return;
        case "borrar":
            if (!confirm(`¿Borrar el arte ${arte.nombre}? No se puede deshacer.`)) return;
            personaje.artes.splice(personaje.artes.indexOf(arte), 1);
            personaje.calcularCaracteristicas();
            actualizarTodo();
            return;
    }
}

/* Notificación al usar un arte: descripción, PA y, si hace daño, el daño (sin tirar dados) */
function mostrarPopupArte(arte, resultado) {
    if (!resultado.ok) {
        mostrarPopupInfo(`No se puede usar ${escaparHtml(arte.nombre)}`, resultado.resumen.map(escaparHtml));
        return;
    }
    // resumen = [descripción, PA gastados, combo...]. Se comparte en la sala: texto plano (lo escapa el pintor)
    const [descripcion, ...extras] = resultado.resumen;
    const golpes = resultado.danno;
    if (!golpes) {
        emitirEvento("arte", { titulo: arte.nombre, lineas: [descripcion, ...extras] });
        return;
    }
    // Hace daño: popup como el de las tiradas, sin dados (el arte no falla); un bloque por golpe
    mostrarPopupDanno({
        titulo: arte.nombre,
        subtitulo: ["Arte", ...(golpes.length > 1 ? [`${golpes.length} golpes`] : []), ...extras].join(" · "),
        descripcion,
        golpes: structuredClone(golpes)
    });
}

/* Línea de lo que hace el arte: uso, coste y daño (activas) o modificadores (pasivas) */
function detalleArte(arte) {
    if (arte.tipo === "pasiva") return textoModificadores(arte.modificadores) || "Sin modificadores";
    const partes = [];
    const uso = arte.uso.tipo === "arma"
        ? arte.uso.armas.map(tipo => ARMAS[tipo]?.etiqueta ?? tipo).join(" o ") + (arte.uso.ambasManos ? " (las dos manos)" : "")
        : PARTES_USO_ARTE[arte.uso.parte];
    partes.push(arte.combo ? `Usa: ${uso} · combo (no gasta acción)` : `Usa: ${uso}`);
    if (arte.haceDanno) {
        const extra = arte.danno > 0 ? ` + ${arte.danno}` : "";
        if (arte.uso.tipo === "arma") partes.push(`Daño: arma + CaC${extra}`);
        else if (arte.danno > 0) partes.push(`Daño ${arte.danno}`);
        const elemental = textoElemental(arte.dannoElemental, "+");
        if (elemental) partes.push(elemental);
        if (arte.golpes > 1) partes.push(`${arte.golpes} golpes`);
    }
    return partes.join(" · ");
}

/* Requisitos con ✓ / ✗; los alternativos van juntos ("Uno de: …") */
function requisitosArteHtml(arte) {
    const { obligatorios, alternativos } = estadoRequisitos(personaje, arte);
    const chip = ({ ok, texto }) => `<span class="req-arte ${ok ? "ok" : "no"}">${ok ? "✓" : "✗"} ${escaparHtml(texto)}</span>`;
    const partes = obligatorios.map(chip);
    if (alternativos.length) {
        const algunoOk = alternativos.some(r => r.ok);
        partes.push(`<span class="req-arte-grupo ${algunoOk ? "ok" : "no"}">Uno de: ${alternativos.map(chip).join("")}</span>`);
    }
    if (arte.notaRequisitos) partes.push(`<span class="req-arte nota" title="No se comprueba: lo valida el máster">${escaparHtml(arte.notaRequisitos)}</span>`);
    return partes.length ? `<div class="arte-requisitos">${partes.join("")}</div>` : "";
}

/**
 * Fila de un arte. En el catálogo (enCatalogo) solo tiene el botón Añadir; motivoAnadir lo bloquea
 * (ya la tiene o no quedan desbloqueos).
 */
function filaArte(arte, indice, { enCatalogo = false, motivoAnadir = null, autor = null, quitable = false } = {}) {
    const activa = arte.tipo === "activa";
    const inactiva = arte.equipada && motivoRequisitos(personaje, arte);
    const coste = [activa ? `${arte.costePA} PA` : "Pasiva", `${arte.ranuras} ranura${arte.ranuras === 1 ? "" : "s"}`].join(" · ");

    let botones;
    if (enCatalogo) {
        botones = (quitable ? botonObjeto("quitarSala", "descartar", "Quitar del catálogo de la sala") : "")
            + botonObjeto("anadir", "artesSinEquipar", motivoAnadir || "Añadir a las artes sin equipar (gasta 1 desbloqueo de arte)", Boolean(motivoAnadir));
    } else if (arte.equipada) {
        const motivoUsar = activa ? motivoNoUsarArte(personaje, arte) : null;
        const motivoGuardar = motivoNoDesequiparArte(personaje, arte);
        botones = botonObjeto("editar", "editar", "Editar")
            + botonObjeto("desequipar", "cancelar", motivoGuardar || "Desequipar", Boolean(motivoGuardar))
            + (activa ? botonObjeto("usar", "usar", motivoUsar || `Usar (${arte.costePA} PA)`, Boolean(motivoUsar)) : "");
    } else {
        const motivoEquipar = motivoNoEquiparArte(personaje, arte);
        botones = botonObjeto("editar", "editar", "Editar")
            + botonObjeto("borrar", "descartar", "Borrar")
            + botonObjeto("equipar", "artes", motivoEquipar || "Equipar", Boolean(motivoEquipar));
    }

    // Equipada, ocupa tantos huecos como ranuras (grid-row: span N en la lista de equipadas)
    const huecos = arte.equipada && arte.ranuras > 1 ? ` style="--ranuras:${arte.ranuras}"` : "";
    return `<div class="fila-objeto fila-arte${inactiva ? " inactiva" : ""}" data-index="${indice}"${huecos}>
        <span class="objeto-icono" title="${activa ? "Activa" : "Pasiva"}">${iconoSao(activa ? "arteActiva" : "artePasiva")}</span>
        <div class="objeto-info">
            <div class="objeto-cabecera">
                <span class="objeto-nombre">${escaparHtml(arte.nombre)}</span>
                <span class="objeto-cantidad">${coste}</span>
            </div>
            <div class="objeto-detalle">${escaparHtml(detalleArte(arte))}</div>
            ${autor ? `<div class="arte-autor">Compartida por ${escaparHtml(autor)}</div>` : ""}
            ${requisitosArteHtml(arte)}
            ${arte.descripcion ? `<div class="objeto-descripcion">${escaparHtml(arte.descripcion)}</div>` : ""}
            ${inactiva ? `<div class="arte-inactiva">Inactiva: ${escaparHtml(inactiva.replace(/^Requisitos no cumplidos: /, "falta "))}</div>` : ""}
        </div>
        <div class="objeto-acciones">${botones}</div>
    </div>`;
}

function actualizarArtes() {
    const conIndice = personaje.artes.map((arte, i) => ({ arte, i }));
    const equipadas = conIndice.filter(({ arte }) => arte.equipada);
    const sinEquipar = conIndice.filter(({ arte }) => !arte.equipada);

    // Equipadas: las artes y después un hueco libre por cada ranura de memoria que quede
    const usadas = ranurasUsadas(personaje);
    const libres = Math.max(0, personaje.espaciosArte - usadas);
    const huecos = Array.from({ length: libres }, () => `<div class="fila-objeto vacia"><span class="objeto-hueco">Hueco libre</span></div>`);
    const filasEquipadas = [...equipadas.map(({ arte, i }) => filaArte(arte, i)), ...huecos];
    pintarLista(listaArtesEquipadasEl, filasEquipadas.length ? filasEquipadas.join("")
        : `<p class="lista-vacia">Sin memoria de artes: se consigue a partir del nivel 16.</p>`);

    pintarLista(listaArtesSinEquiparEl, sinEquipar.length
        ? sinEquipar.map(({ arte, i }) => filaArte(arte, i)).join("")
        : `<p class="lista-vacia">No tienes artes sin equipar.</p>`);

    document.getElementById("memoriaArtes").textContent = `(${usadas} / ${personaje.espaciosArte})`;
    document.getElementById("contadorArtesSinEquipar").textContent = `(${sinEquipar.length})`;

    // Desbloqueos de arte: total y botón de crear (crear gasta uno)
    document.getElementById("cantidadDesbloqueos").textContent = desbloqueosDisponibles(personaje);
    const botonCrear = document.getElementById("btnAbrirCrearArte");
    const sinDesbloqueos = motivoNoConseguirArte(personaje);
    botonCrear.disabled = Boolean(sinDesbloqueos);
    botonCrear.title = sinDesbloqueos || "Crear un arte nueva (gasta 1 desbloqueo de arte)";

    // Avisos: memoria superada (no debería verse: comprobarMemoriaArtes desequipa antes) y zona
    const fueraDeZona = esZonaSegura(personaje) ? "" : MOTIVOS_ZONA.artes + ".";
    const exceso = usadas > personaje.espaciosArte
        ? `Las artes equipadas ocupan ${usadas} de memoria y solo tienes ${personaje.espaciosArte}.` : "";
    pintarAviso("avisoArtesEquipadas", [exceso, fueraDeZona]);
    pintarAviso("avisoArtesSinEquipar", [fueraDeZona]);
}

/* Desbloqueos de arte: añadir o quitar la cantidad del campo (como el Cor) */
function inicializarDesbloqueos() {
    document.querySelector(".barra-desbloqueos .cor-icono").innerHTML = iconoSao("desbloqueo");
    document.getElementById("btnAnadirDesbloqueos").innerHTML = iconoSao("desbloqueoMas");
    document.getElementById("btnQuitarDesbloqueos").innerHTML = iconoSao("desbloqueoMenos");
    const input = document.getElementById("inputDesbloqueos");
    const operar = (operacion) => {
        reproducir("click");
        const resultado = operacion(personaje, input.value);
        if (!resultado.ok) mostrarPopupInfo("Desbloqueos de arte", resultado.resumen.map(escaparHtml));
        actualizarTodo();
    };
    document.getElementById("btnAnadirDesbloqueos").addEventListener("click", () => operar(anadirDesbloqueos));
    document.getElementById("btnQuitarDesbloqueos").addEventListener("click", () => operar(quitarDesbloqueos));
}

/* Al subir de nivel se avisa si se consigue un desbloqueo de arte natural.
   null = aún no se conoce (al cargar una ficha se vuelve a null para no avisar). */
let desbloqueosNaturalesVistos = null;

function comprobarDesbloqueosNaturales() {
    const naturales = desbloqueosNaturales(personaje.nivel);
    if (desbloqueosNaturalesVistos !== null && naturales > desbloqueosNaturalesVistos) {
        const nuevos = naturales - desbloqueosNaturalesVistos;
        mostrarPopupInfo("Desbloqueo de arte", [
            `Nivel ${personaje.nivel}: +${nuevos} desbloqueo${nuevos === 1 ? "" : "s"} de arte.`,
            `Disponibles: ${desbloqueosDisponibles(personaje)}. Úsalos en Artes sin equipar (catálogo o crear arte).`
        ]);
    }
    desbloqueosNaturalesVistos = naturales;
}

/* Notificación de un arte pasiva: solo sus modificadores (si tiene) y su descripción. Se comparte en la sala */
function mostrarDetalleArte(arte) {
    const lineas = [];
    const modificadores = textoModificadores(arte.modificadores);
    if (modificadores) lineas.push(modificadores);
    if (arte.descripcion) lineas.push(arte.descripcion);
    emitirEvento("pasiva", { titulo: arte.nombre, lineas });
}

/* Si se pierde memoria de artes (baja Cultura, nivel...), se desequipan las últimas equipadas y se avisa */
function comprobarMemoriaArtes() {
    const desequipadas = ajustarMemoriaArtes(personaje);
    if (!desequipadas.length) return;
    mostrarPopupInfo("Memoria de artes insuficiente", [
        `Tienes ${personaje.espaciosArte} de memoria de artes. Se ha${desequipadas.length === 1 ? "" : "n"} desequipado:`,
        ...desequipadas.map(arte => `<b>${escaparHtml(arte.nombre)}</b> (${arte.ranuras} ranura${arte.ranuras === 1 ? "" : "s"})`),
        desequipadas.length === 1 ? "Está en las artes sin equipar." : "Están en las artes sin equipar."
    ]);
}

/* Apartado "Artes pasivas" (columna derecha, bajo Modificadores): las pasivas equipadas con lo que
   modifican y su descripción. Las inactivas (requisitos sin cumplir) salen atenuadas con el motivo. */
const listaArtesPasivasEl = document.getElementById("listaArtesPasivas");

function actualizarArtesPasivas() {
    const pasivas = personaje.artes
        .map((arte, indice) => ({ arte, indice }))
        .filter(({ arte }) => arte.equipada && arte.tipo === "pasiva");
    const visible = pasivas.length > 0;
    document.getElementById("tituloArtesPasivas").style.display = visible ? "" : "none";
    listaArtesPasivasEl.style.display = visible ? "" : "none";

    pintarLista(listaArtesPasivasEl, pasivas.map(({ arte, indice }) => {
        const motivo = motivoRequisitos(personaje, arte);
        const modificadores = arte.modificadores.map(mod => {
            const numero = Number(mod.numero) || 0;
            return `<span class="chip-mod-pasiva ${numero < 0 ? "negativo" : "positivo"}">${conSigno(numero)} ${escaparHtml(ETIQUETAS_ATRIBUTO[mod.modificado] ?? mod.modificado)}</span>`;
        }).join("");
        // Activa: al pulsarla se abre su notificación (mostrarDetalleArte). Inactiva: no se puede pulsar
        const pulsable = motivo ? "" : ` role="button" tabindex="0" title="Ver detalle" aria-label="${escaparHtml(arte.nombre)}: ver detalle"`;
        return `<div class="arte-pasiva${motivo ? " inactiva" : ""}" data-index="${indice}"${pulsable}>
            <div class="arte-pasiva-cabecera">
                <span class="arte-pasiva-icono">${iconoSao("artePasiva")}</span>
                <span class="arte-pasiva-nombre">${escaparHtml(arte.nombre)}</span>
                ${motivo ? `<span class="arte-pasiva-estado" title="${escaparHtml(motivo)}">Inactiva</span>` : ""}
            </div>
            ${modificadores ? `<div class="arte-pasiva-mods">${modificadores}</div>` : ""}
            ${arte.descripcion ? `<div class="arte-pasiva-descripcion">${escaparHtml(arte.descripcion)}</div>` : ""}
            ${motivo ? `<div class="arte-pasiva-motivo">${escaparHtml(motivo)}</div>` : ""}
        </div>`;
    }).join(""));
}

function pintarAviso(id, textos) {
    const aviso = document.getElementById(id);
    const texto = textos.filter(Boolean).join(" ");
    aviso.textContent = texto;
    aviso.hidden = !texto;
}

/**
 * Ventana que se abre desde otra (p. ej. crear arte desde las artes sin equipar): oculta la de origen
 * y vuelve a ella al cerrarse, sin los sonidos de abrir y cerrar (es un cambio de ventana).
 */
function crearVentanaHija(modalEl) {
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    let origen = null;
    modalEl.addEventListener("hide.bs.modal", () => {
        if (origen) modalEl.dataset.sinSonidoCerrar = "1";
    });
    modalEl.addEventListener("hidden.bs.modal", () => {
        if (!origen) return;
        const anterior = origen;
        origen = null;
        anterior.dataset.sinSonidoAbrir = "1";
        bootstrap.Modal.getOrCreateInstance(anterior).show();
    });
    return {
        abrirDesde(ventanaOrigen) {
            origen = ventanaOrigen;
            ventanaOrigen.addEventListener("hidden.bs.modal", () => modal.show(), { once: true });
            ventanaOrigen.dataset.sinSonidoCerrar = "1";
            modalEl.dataset.sinSonidoAbrir = "1";
            bootstrap.Modal.getOrCreateInstance(ventanaOrigen).hide();
        },
        cerrar: () => modal.hide()
    };
}

/* Crear o editar un arte ______________________________________________________ */

/** Abre el formulario para editar un arte (o para crear una si arte es null); se asigna en inicializarFormularioArte */
let abrirEditorArte = () => {};

const ETIQUETAS_TIPO_REQUISITO = {
    nivel: "Nivel", caracteristica: "Característica", habilidad: "Habilidad",
    armadura: "Armadura", arma: "Arma", escudo: "Escudo"
};
/* Tipos que se pueden elegir en cada requisito de equipo */
const TIPOS_ARMA_ATAQUE = Object.keys(ARMAS).filter(tipo => !ARMAS[tipo].escudo);
const OPCIONES_TIPOS_REQUISITO = {
    armadura: Object.entries(ETIQUETAS_TIPO_ARMADURA),
    arma: TIPOS_ARMA_ATAQUE.map(tipo => [tipo, ARMAS[tipo].etiqueta]),
    escudo: TIPOS_ESCUDO.map(tipo => [tipo, ARMAS[tipo].etiqueta])
};
const REQUISITO_POR_DEFECTO = {
    nivel: { valor: 16 },
    caracteristica: { clave: "fortaleza", valor: 5 },
    habilidad: { clave: "combate", valor: 10 },
    armadura: { tipos: ["ligera"] },
    arma: { tipos: ["espada"], ambasManos: false },
    escudo: { tipos: ["escudo"] }
};

/* Casillas para elegir varios tipos (armas, armaduras...) */
function casillasTipos(opciones, elegidos, clase) {
    return opciones.map(([valor, etiqueta]) =>
        `<label class="casilla-tipo"><input type="checkbox" class="${clase}" value="${valor}" ${elegidos.includes(valor) ? "checked" : ""}> ${escaparHtml(etiqueta)}</label>`
    ).join("");
}

function filaRequisitoArte(req, i) {
    const opciones = (lista, elegido) => Object.entries(lista)
        .map(([valor, etiqueta]) => `<option value="${valor}" ${valor === elegido ? "selected" : ""}>${etiqueta}</option>`).join("");
    let campos = "";
    if (req.tipo === "nivel") {
        campos = `<input type="number" class="req-valor" min="1" value="${req.valor}" aria-label="Nivel mínimo">`;
    } else if (req.tipo === "caracteristica" || req.tipo === "habilidad") {
        const lista = req.tipo === "caracteristica" ? ETIQUETAS_CARACTERISTICA : ETIQUETAS_HABILIDAD;
        campos = `<select class="req-clave" aria-label="Cuál">${opciones(lista, req.clave)}</select>
            <input type="number" class="req-valor" min="0" step="${req.clave === "aguante" ? "0.5" : "1"}" value="${req.valor}" aria-label="Mínimo">`;
    } else {
        campos = `<span class="casillas-tipos">${casillasTipos(OPCIONES_TIPOS_REQUISITO[req.tipo], req.tipos, "req-tipos")}</span>`;
        if (req.tipo === "arma") {
            campos += `<label class="casilla-tipo"><input type="checkbox" class="req-ambas" ${req.ambasManos ? "checked" : ""}> En las dos manos</label>`;
        }
    }
    return `<li class="requisito-arte" data-index="${i}">
        <select class="req-tipo" aria-label="Tipo de requisito">${opciones(ETIQUETAS_TIPO_REQUISITO, req.tipo)}</select>
        ${campos}
        <label class="casilla-tipo" title="Basta con cumplir uno de los alternativos"><input type="checkbox" class="req-alternativo" ${req.alternativo ? "checked" : ""}> Alternativo</label>
        <button type="button" class="quitar-mod" title="Eliminar requisito" aria-label="Eliminar requisito">×</button>
    </li>`;
}

/* Lee una fila de requisito del formulario */
function leerFilaRequisito(fila) {
    const tipo = fila.querySelector(".req-tipo").value;
    const req = { tipo, alternativo: fila.querySelector(".req-alternativo").checked };
    const clave = fila.querySelector(".req-clave");
    const valor = fila.querySelector(".req-valor");
    if (clave) req.clave = clave.value;
    if (valor) req.valor = Number(valor.value) || 0;
    if (fila.querySelector(".req-tipos")) req.tipos = [...fila.querySelectorAll(".req-tipos:checked")].map(c => c.value);
    if (tipo === "arma") req.ambasManos = fila.querySelector(".req-ambas")?.checked ?? false;
    return req;
}

function inicializarFormularioArte() {
    const modalEl = document.getElementById("modalCrearArte");
    const ventana = crearVentanaHija(modalEl);
    const campo = (id) => document.getElementById(id);
    const listaRequisitos = campo("listaRequisitosArte");
    const listaMods = campo("listaModsArte");
    const aviso = campo("avisoCrearArte");
    let requisitos = [];
    let mods = [];
    /* Arte que se está editando, o null al crear */
    let edicion = null;

    // Desplegables y casillas fijas
    campo("arteUsoParte").innerHTML = Object.entries(PARTES_USO_ARTE)
        .map(([valor, etiqueta]) => `<option value="${valor}">${etiqueta}</option>`).join("");
    campo("arteUsoArmas").innerHTML = casillasTipos(Object.entries(ARMAS).map(([tipo, arma]) => [tipo, arma.etiqueta]), [], "uso-arma");
    campo("arteDannoElemental").innerHTML = ELEMENTOS.map(e => campoElemental("dannoElemental", e, `id="arteElem_${e}"`)).join("");
    campo("arteDannoElemental").addEventListener("input", () => marcarElementalesActivos(campo("arteDannoElemental")));

    const pintarRequisitos = () => {
        listaRequisitos.innerHTML = requisitos.map(filaRequisitoArte).join("")
            || `<li class="lista-vacia">Sin requisitos: cualquiera puede equiparla.</li>`;
    };
    const pintarMods = () => {
        listaMods.innerHTML = mods.map((mod, i) => `
            <li class="mod-equipo" data-index="${i}">
                <select class="listValores" aria-label="Atributo">${opcionesAtributo(mod.modificado)}</select>
                <input type="number" class="cantidadMod" aria-label="Cantidad" value="${mod.numero}">
                <button type="button" class="quitar-mod" title="Eliminar modificador" aria-label="Eliminar modificador">×</button>
            </li>`).join("");
    };

    // Muestra los campos del tipo (activa / pasiva), del uso (parte / arma) y del daño
    const actualizarCampos = () => {
        const tipo = campo("arteTipo").value;
        const uso = campo("arteUsoTipo").value;
        const haceDanno = campo("arteHaceDanno").checked;
        modalEl.querySelectorAll("[data-tipo-arte], [data-uso], [data-danno]").forEach(el => {
            const visible = (!el.dataset.tipoArte || el.dataset.tipoArte === tipo)
                && (!el.dataset.uso || el.dataset.uso === uso)
                && (el.dataset.danno === undefined || haceDanno);
            el.style.display = visible ? "" : "none";
        });
    };
    modalEl.addEventListener("change", actualizarCampos);

    // Requisitos: al cambiar el tipo se ponen sus valores por defecto; lo demás se lee de la fila
    campo("btnAnadirRequisitoArte").addEventListener("click", () => {
        requisitos.push({ tipo: "habilidad", alternativo: false, ...REQUISITO_POR_DEFECTO.habilidad });
        pintarRequisitos();
    });
    listaRequisitos.addEventListener("change", (e) => {
        const fila = e.target.closest(".requisito-arte");
        if (!fila) return;
        const i = Number(fila.dataset.index);
        if (e.target.classList.contains("req-tipo")) {
            const tipo = e.target.value;
            requisitos[i] = { tipo, alternativo: requisitos[i].alternativo, ...REQUISITO_POR_DEFECTO[tipo] };
            pintarRequisitos();
            return;
        }
        requisitos[i] = leerFilaRequisito(fila);
        // El paso del valor cambia si la característica es el Aguante (admite ,5)
        if (e.target.classList.contains("req-clave")) pintarRequisitos();
    });
    listaRequisitos.addEventListener("click", (e) => {
        if (!e.target.closest(".quitar-mod")) return;
        requisitos.splice(Number(e.target.closest(".requisito-arte").dataset.index), 1);
        pintarRequisitos();
    });

    // Modificadores de las pasivas
    campo("btnAnadirModArte").addEventListener("click", () => {
        mods.push({ modificado: "regeneracion", numero: 1 });
        pintarMods();
    });
    listaMods.addEventListener("change", (e) => {
        const mod = mods[Number(e.target.closest(".mod-equipo")?.dataset.index)];
        if (!mod) return;
        if (e.target.classList.contains("listValores")) mod.modificado = e.target.value;
        if (e.target.classList.contains("cantidadMod")) mod.numero = parseInt(e.target.value) || 0;
    });
    listaMods.addEventListener("click", (e) => {
        if (!e.target.closest(".quitar-mod")) return;
        mods.splice(Number(e.target.closest(".mod-equipo").dataset.index), 1);
        pintarMods();
    });

    // Rellena el formulario con un arte (o con los valores por defecto)
    const rellenar = (arte) => {
        campo("formCrearArte").reset();
        const datos = arte ?? cargarArte({ nombre: "", tipo: "activa" });
        campo("arteNombre").value = arte ? datos.nombre : "";
        campo("arteTipo").value = datos.tipo;
        campo("arteRanuras").value = datos.ranuras;
        campo("arteDescripcion").value = datos.descripcion;
        campo("arteNotaRequisitos").value = datos.notaRequisitos;
        requisitos = datos.requisitos.map(req => ({ ...req, tipos: req.tipos ? [...req.tipos] : undefined }));
        mods = (datos.modificadores ?? []).map(mod => ({ ...mod }));
        const activa = datos.tipo === "activa";
        campo("arteCostePA").value = activa ? datos.costePA : 1;
        campo("arteCombo").checked = activa && datos.combo;
        campo("arteUsoTipo").value = activa ? datos.uso.tipo : "parte";
        campo("arteUsoParte").value = activa && datos.uso.tipo === "parte" ? datos.uso.parte : "ninguna";
        const armas = activa && datos.uso.tipo === "arma" ? datos.uso.armas : [];
        campo("arteUsoArmas").querySelectorAll(".uso-arma").forEach(c => { c.checked = armas.includes(c.value); });
        campo("arteUsoAmbasManos").checked = activa && datos.uso.tipo === "arma" && datos.uso.ambasManos;
        campo("arteHaceDanno").checked = !activa || datos.haceDanno;
        campo("arteDanno").value = activa ? datos.danno : 0;
        campo("arteGolpes").value = activa ? datos.golpes : 1;
        const elemental = activa ? datos.dannoElemental : {};
        ELEMENTOS.forEach(e => { campo(`arteElem_${e}`).value = elemental?.[e] || 0; });
        campo("detallesDannoElementalArte").open = ELEMENTOS.some(e => elemental?.[e] > 0);
        marcarElementalesActivos(campo("arteDannoElemental"));
        // Compartir en el catálogo de la sala: solo dentro de una sala
        campo("filaCompartirArte").hidden = !getEstadoOnline().sala;
        campo("arteCompartir").checked = false;
        aviso.textContent = "";
        pintarRequisitos();
        pintarMods();
        actualizarCampos();
        const textoBoton = arte ? "Guardar" : "Crear";
        campo("modalCrearArteLabel").textContent = arte ? "Editar arte" : "Crear arte";
        campo("btnGuardarArte").title = textoBoton;
        campo("btnGuardarArte").setAttribute("aria-label", textoBoton);
    };

    const guardar = () => {
        const nombre = campo("arteNombre").value.trim();
        if (!nombre) {
            aviso.textContent = "Ponle un nombre al arte.";
            campo("arteNombre").focus();
            return;
        }
        // Un requisito de equipo sin ningún tipo marcado no tendría sentido
        if (requisitos.some(req => req.tipos && req.tipos.length === 0)) {
            aviso.textContent = "Marca al menos un tipo en cada requisito de armadura, arma o escudo.";
            return;
        }
        const tipo = campo("arteTipo").value;
        const usoTipo = campo("arteUsoTipo").value;
        const armas = [...campo("arteUsoArmas").querySelectorAll(".uso-arma:checked")].map(c => c.value);
        if (tipo === "activa" && usoTipo === "arma" && armas.length === 0) {
            aviso.textContent = "Marca al menos un arma con la que se usa el arte.";
            return;
        }
        const numero = (id) => parseInt(campo(id).value) || 0;
        const datos = {
            // Al editar se conservan id, origen del catálogo, si está equipada, grupo y etiquetas
            ...(edicion ? { id: edicion.id, idCatalogo: edicion.idCatalogo, equipada: edicion.equipada, grupo: edicion.grupo, etiquetas: edicion.etiquetas } : { grupo: "propia" }),
            nombre, tipo,
            descripcion: campo("arteDescripcion").value.trim(),
            ranuras: Math.max(1, numero("arteRanuras")),
            requisitos: requisitos.map(cargarRequisito).filter(Boolean),
            notaRequisitos: campo("arteNotaRequisitos").value.trim(),
            modificadores: mods,
            costePA: Math.max(0, numero("arteCostePA")),
            combo: campo("arteCombo").checked,
            uso: usoTipo === "arma"
                ? { tipo: "arma", armas, ambasManos: campo("arteUsoAmbasManos").checked }
                : { tipo: "parte", parte: campo("arteUsoParte").value },
            haceDanno: campo("arteHaceDanno").checked,
            danno: Math.max(0, numero("arteDanno")),
            golpes: Math.max(1, numero("arteGolpes")),
            dannoElemental: Object.fromEntries(ELEMENTOS.map(e => [e, campo(`arteElem_${e}`).value]))
        };
        const arte = cargarArte(datos);
        if (edicion) {
            personaje.artes[personaje.artes.indexOf(edicion)] = arte;
        } else {
            // Crear un arte nueva gasta un desbloqueo de arte (editar no)
            const resultado = conseguirArte(personaje, arte);
            if (!resultado.ok) {
                aviso.textContent = resultado.resumen.join(" ");
                return;
            }
        }
        personaje.calcularCaracteristicas();
        reproducir("click");
        actualizarTodo();
        ventana.cerrar();
        if (campo("arteCompartir").checked && getEstadoOnline().sala) {
            // La copia de la ficha pasa a apuntar al arte compartida ("Ya la tienes" en el catálogo)
            compartirArte(arte, artesSala).then(id => {
                if (!id) return;
                arte.idCatalogo = id;
                actualizarTodo();
            });
        }
    };

    campo("btnGuardarArte").addEventListener("click", guardar);
    campo("arteNombre").addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); guardar(); }
    });
    modalEl.addEventListener("shown.bs.modal", () => campo("arteNombre").focus());

    abrirEditorArte = (arte, origen) => {
        edicion = arte;
        rellenar(arte);
        ventana.abrirDesde(origen);
    };
    campo("btnAbrirCrearArte").addEventListener("click", (e) => {
        reproducir("click");
        abrirEditorArte(null, e.target.closest(".modal"));
    });
}

/* Catálogo de artes ___________________________________________________________ */

const listaCatalogoArtesEl = document.getElementById("listaCatalogoArtes");
/* Catálogo (data/artes.json), cargado al iniciar (cargarCatalogoArtes). Si no carga, la ficha sigue sin él.
   catalogoArtes = el de data/artes.json + las artes compartidas en la sala (ids "sala-…") */
let catalogoArtes = [];
let catalogoBase = [];
/* Artes compartidas de la sala tal y como llegan (con autor): [{ id, autor, nombreAutor, arte }] */
let artesSala = [];
const esArteDeSala = (arte) => arte.id.startsWith("sala-");

function rehacerCatalogo() {
    const deSala = artesSala.map(({ id, arte }) => cargarArte({ ...arte, id, idCatalogo: null, equipada: false }))
        .sort((x, y) => x.nombre.localeCompare(y.nombre));
    catalogoArtes = [...catalogoBase, ...deSala];
}

function alCambiarArtesSala(lista) {
    artesSala = lista;
    rehacerCatalogo();
    actualizarCatalogoArtes();
}
/* "cargando", "ok" o "error" */
let estadoCatalogoArtes = "cargando";

/* Texto sin tildes ni mayúsculas, para buscar */
const normalizarTexto = (texto) => String(texto ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function actualizarCatalogoArtes() {
    const disponibles = desbloqueosDisponibles(personaje);
    document.getElementById("desbloqueosCatalogo").textContent = `(${disponibles} desbloqueo${disponibles === 1 ? "" : "s"})`;
    if (estadoCatalogoArtes !== "ok") {
        pintarLista(listaCatalogoArtesEl, `<p class="lista-vacia">${estadoCatalogoArtes === "cargando"
            ? "Cargando el catálogo…"
            : "No se pudo cargar el catálogo (data/artes.json). Abre la ficha con un servidor, p. ej. npx http-server."}</p>`);
        return;
    }
    const busqueda = normalizarTexto(document.getElementById("catalogoBuscar").value.trim());
    const grupo = document.getElementById("catalogoGrupo").value;
    const tipo = document.getElementById("catalogoTipo").value;
    const soloCumplo = document.getElementById("catalogoSoloCumplo").checked;
    const tengo = new Set(personaje.artes.map(arte => arte.idCatalogo).filter(Boolean));
    const sinDesbloqueos = motivoNoConseguirArte(personaje);

    const visibles = catalogoArtes
        .map((arte, i) => ({ arte, i }))
        .filter(({ arte }) => (!grupo || arte.grupo === grupo) && (!tipo || arte.tipo === tipo)
            && (!soloCumplo || cumpleRequisitos(personaje, arte))
            && (!busqueda || normalizarTexto([arte.nombre, arte.descripcion, ...arte.etiquetas].join(" ")).includes(busqueda)));

    const opcionesFila = (arte) => {
        const deSala = artesSala.find(a => a.id === arte.id);
        return {
            enCatalogo: true,
            motivoAnadir: tengo.has(arte.id) ? "Ya la tienes" : sinDesbloqueos,
            autor: deSala?.nombreAutor ?? null,
            // Quitarla de la sala: su autor o el máster (lo comprueban también las reglas de Firestore)
            quitable: Boolean(deSala) && [deSala.autor, salaActual?.master].includes(usuarioActual?.uid)
        };
    };
    const { usuario: usuarioActual, sala: salaActual } = getEstadoOnline();

    // Primero las compartidas en la sala; después las del catálogo, agrupadas en el orden de GRUPOS_ARTE
    const compartidas = visibles.filter(({ arte }) => esArteDeSala(arte));
    const htmlSala = compartidas.length
        ? `<h6 class="grupo-catalogo">Compartidas en la sala</h6>` + compartidas.map(({ arte, i }) => filaArte(arte, i, opcionesFila(arte))).join("")
        : "";
    const html = htmlSala + Object.keys(GRUPOS_ARTE).map(clave => {
        const delGrupo = visibles.filter(({ arte }) => arte.grupo === clave && !esArteDeSala(arte));
        if (!delGrupo.length) return "";
        return `<h6 class="grupo-catalogo">${GRUPOS_ARTE[clave]}</h6>`
            + delGrupo.map(({ arte, i }) => filaArte(arte, i, opcionesFila(arte))).join("");
    }).join("");
    pintarLista(listaCatalogoArtesEl, html || `<p class="lista-vacia">Ningún arte coincide con los filtros.</p>`);
}

function inicializarCatalogoArtes() {
    const ventana = crearVentanaHija(document.getElementById("modalCatalogoArtes"));
    document.getElementById("catalogoGrupo").innerHTML = `<option value="">Todos los grupos</option>` +
        Object.entries(GRUPOS_ARTE).filter(([clave]) => clave !== "propia")
            .map(([clave, etiqueta]) => `<option value="${clave}">${etiqueta}</option>`).join("");
    ["catalogoBuscar", "catalogoGrupo", "catalogoTipo", "catalogoSoloCumplo"].forEach(id => {
        document.getElementById(id).addEventListener("input", actualizarCatalogoArtes);
    });

    document.getElementById("btnAbrirCatalogoArtes").addEventListener("click", (e) => {
        reproducir("click");
        actualizarCatalogoArtes();
        ventana.abrirDesde(e.target.closest(".modal"));
    });

    listaCatalogoArtesEl.addEventListener("click", (e) => {
        const boton = e.target.closest('button[data-accion="anadir"], button[data-accion="quitarSala"]');
        const arte = catalogoArtes[Number(boton?.closest(".fila-objeto")?.dataset.index)];
        if (!boton || boton.disabled || !arte) return;
        reproducir("click");
        if (boton.dataset.accion === "quitarSala") {
            if (confirm(`¿Quitar ${arte.nombre} del catálogo de la sala? Quien ya la tenga la conserva.`)) quitarArteDeSala(arte.id, arte.nombre);
            return;
        }
        // Gasta un desbloqueo de arte
        const resultado = conseguirArte(personaje, copiarDelCatalogo(arte));
        actualizarTodo();
        mostrarPopupInfo(resultado.ok ? "Arte añadida" : "No se puede añadir", resultado.resumen.map(escaparHtml));
    });
}

/* Menú de opciones: cargar y guardar personaje, online, silencio ___________ */
/* Opciones online según haya sesión y sala (interfazOnline.js) */
function opcionesOnline() {
    const { usuario, sala } = getEstadoOnline();
    if (!usuario) return [{ clave: "cuenta", etiqueta: "Iniciar sesión (online)", icono: "amigos" }];
    return [
        { clave: "cuenta", etiqueta: `Cuenta: ${usuario.nombre}`, icono: "amigos" },
        { clave: "sala", etiqueta: sala ? `Sala: ${sala.nombre}` : "Entrar en una sala", icono: "pueblo", activa: Boolean(sala) },
        { clave: "guardarNube", etiqueta: "Guardar en la nube", icono: "guardar" },
        { clave: "cargarNube", etiqueta: "Cargar de la nube", icono: "cargar" }
    ];
}

/* Menú de opciones: se guarda para repintarlo si cambia la sesión con el menú abierto */
let menuOpciones = null;

function inicializarOpciones() {
    menuOpciones = crearMenuSao({
        boton: document.getElementById("btnOpciones"),
        menu: document.getElementById("menuOpciones"),
        opciones: () => [
            { clave: "cargar", etiqueta: "Cargar personaje", icono: "cargar" },
            { clave: "guardar", etiqueta: "Guardar personaje", icono: "guardar" },
            ...opcionesOnline(),
            { clave: "historial", etiqueta: "Historial de avisos", icono: "historial" },
            estaSilenciado()
                ? { clave: "sonido", etiqueta: "Activar audio", icono: "silencio" }
                : { clave: "sonido", etiqueta: "Silenciar audio", icono: "sonido" }
        ],
        alElegir: (clave, menu) => {
            switch (clave) {
                case "cuenta":
                case "sala":
                case "cargarNube":
                    reproducir("click");
                    menu.cerrar({ sonido: false });
                    ({ cuenta: abrirCuenta, sala: abrirSala, cargarNube: abrirPersonajesNube })[clave]();
                    break;
                case "guardarNube":
                    reproducir("click");
                    menu.cerrar({ sonido: false });
                    guardarEnNube();
                    break;
                case "cargar":
                    // El selector de fichero tiene que abrirse dentro del clic; al cargar suena "linkStart"
                    reproducir("click");
                    menu.cerrar({ sonido: false });
                    document.getElementById("fileInput").click();
                    break;
                case "guardar":
                    reproducir("click");
                    menu.cerrar({ sonido: false });
                    personaje.guardarJSON();
                    marcarGuardado();
                    break;
                case "historial": {
                    reproducir("click");
                    menu.cerrar({ sonido: false });
                    const ventana = document.getElementById("modalHistorialPopups");
                    ventana.dataset.sinSonidoAbrir = "1";
                    bootstrap.Modal.getOrCreateInstance(ventana).show();
                    break;
                }
                case "sonido":
                    // El menú sigue abierto para ver el cambio; al activar suena el click
                    setSilenciado(!estaSilenciado());
                    reproducir("click");
                    menu.actualizar();
                    break;
            }
        }
    });
}

/* Historial de pop-ups de la sesión (solo en memoria, popups.js) ____________ */
function inicializarHistorialPopups() {
    const ventana = document.getElementById("modalHistorialPopups");
    const lista = document.getElementById("listaHistorialPopups");
    const formatoHora = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    const pintar = () => {
        const entradas = getHistorialPopups().reverse();
        lista.innerHTML = entradas.length
            ? entradas.map(({ hora, html, clases }) => `
                <div class="entrada-historial-popup">
                    <span class="hora-historial-popup">${formatoHora.format(hora)}</span>
                    <div class="${clases} popup-historial">${html}</div>
                </div>`).join("")
            : `<p class="historial-vacio">Sin avisos en esta sesión</p>`;
    };

    ventana.addEventListener("show.bs.modal", pintar);
    // Si llega un aviso con la ventana abierta, se añade al momento
    document.addEventListener("historialpopups", () => { if (ventana.classList.contains("show")) pintar(); });
    document.getElementById("btnVaciarHistorialPopups").addEventListener("click", () => {
        reproducir("click");
        vaciarHistorialPopups();
    });
}

/* Inventario y baúl (reglas en objetos.js) __________________________________ */
const listaInventarioEl = document.getElementById("listaInventario");
const listaBaulEl = document.getElementById("listaBaul");
/* Fila del inventario que está mostrando sus formas de usar (p. ej. qué mano), o null */
let eleccionUso = null;

const ETIQUETAS_ATRIBUTO = Object.fromEntries(GRUPOS_ATRIBUTOS.flatMap(([, atributos]) => atributos));
const ETIQUETAS_ARMADURA = { pesada: "Armadura pesada", media: "Armadura media", ligera: "Armadura ligera", ropa: "Ropa", real: "Armadura real" };

const conSigno = (numero) => `${numero > 0 ? "+" : ""}${numero}`;

function textoModificadores(mods) {
    return (mods || []).map(mod => `${conSigno(Number(mod.numero) || 0)} ${ETIQUETAS_ATRIBUTO[mod.modificado] ?? mod.modificado}`).join(", ");
}

function etiquetaTipoEquipo(tipo) {
    return ARMAS[tipo]?.etiqueta ?? ETIQUETAS_ARMADURA[tipo] ?? (tipo === TIPO_ACCESORIO ? "Accesorio"
        : tipo === TIPO_RELIQUIA ? "Reliquia" : tipo || "Sin tipo");
}

function iconoObjeto(objeto) {
    if (objeto.tipo !== "equipo") return TIPOS_OBJETO[objeto.tipo].icono;
    const tipo = objeto.equipo?.tipo;
    if (ARMAS[tipo]) return tieneIconoSao(tipo) ? tipo : "otros";
    if (tipo === TIPO_RELIQUIA) return "reliquia";
    return tipo === TIPO_ACCESORIO ? "accesorio" : "armadura";
}

/* Valores elementales con valor, p. ej. "+3 fuego, +2 hielo" o "res. fuego 5" */
function textoElemental(valores, prefijo) {
    return ELEMENTOS.filter(elemento => valores?.[elemento] > 0)
        .map(elemento => {
            const etiqueta = TIPOS_DANNO[elemento].etiqueta.toLowerCase();
            return prefijo === "+" ? `+${valores[elemento]} ${etiqueta}` : `${prefijo}${etiqueta} ${valores[elemento]}`;
        })
        .join(", ");
}

/* Resumen de lo que hace el objeto, bajo su nombre */
function detalleObjeto(objeto) {
    switch (objeto.tipo) {
        case "comida": return [textoModificadores(objeto.modificadores), describirEfecto(objeto, false)].filter(Boolean).join(" · ") || "Sin efecto";
        case "pocion": return describirEfecto(objeto, false) || "Sin efecto";
        case "arrojadiza": {
            const efecto = describirEfecto(objeto, false);
            return `Daño ${objeto.danno} + ${Math.max(0, personaje.dDistancia)} (distancia)` + (efecto ? ` · ${efecto}` : "");
        }
        case "equipo": {
            const equipo = objeto.equipo;
            const partes = [etiquetaTipoEquipo(equipo.tipo)];
            if (ARMAS[equipo.tipo]?.escudo) partes.push(`defensa ${equipo.defensa || 0}`);
            else if (ARMAS[equipo.tipo]) {
                partes.push(`daño ${equipo.danno || 0}`, ARMAS[equipo.tipo].manos === 2 ? "dos manos" : "una mano");
                const elemental = textoElemental(equipo.dannoElemental, "+");
                if (elemental) partes.push(elemental);
            }
            if (TIPOS_ARMADURA.includes(equipo.tipo)) {
                partes.push(`armadura ${equipo.armadura || 0}`, `−${equipo.penalizacionAtletismo || 0} Atletismo`);
                const resistencias = textoElemental(equipo.resistencias, "res. ");
                if (resistencias) partes.push(resistencias);
            }
            const mods = textoModificadores(equipo.modificadores);
            if (mods) partes.push(mods);
            if (equipo.pocionAplicada) partes.push(`con ${equipo.pocionAplicada.nombre}`);
            if (equipo.reliquia) {
                const n = equipo.reliquia.habilidades.length;
                partes.push(`${equipo.tipo !== TIPO_RELIQUIA ? "reliquia: " : ""}${n} habilidad${n === 1 ? "" : "es"}`);
            }
            return partes.join(" · ");
        }
        case "cristal": return "Se usa con una mano libre";
        default: return "Sin uso";
    }
}

function nombreEnMano(mano) {
    const arma = personaje[mano];
    return arma.nombre?.trim() || ARMAS[arma.tipo]?.etiqueta || ETIQUETAS_MANO[mano];
}

/* Formas de usar un objeto del inventario: { accion, etiqueta, mano?, motivo? } (motivo = no se puede) */
function opcionesUso(objeto) {
    const sinManoLibre = manoParaUsar(personaje) ? null : "Necesitas una mano libre";
    // En una sala, la comida y las pociones se pueden ofrecer a los demás jugadores (gasta una mano libre)
    const ofrecer = () => {
        const { usuario, sala } = getEstadoOnline();
        if (!usuario || !sala) return [];
        return getMiembrosSala().filter(miembro => miembro.uid !== usuario.uid)
            .map(destino => ({ accion: "ofrecer", destino, etiqueta: `Ofrecer a ${destino.nombre} (mano libre)`, motivo: sinManoLibre }));
    };
    switch (objeto.tipo) {
        case "comida":
            return [
                { accion: "comer", etiqueta: "Comer" + (personaje.comidaActiva ? ` (sustituye a ${personaje.comidaActiva})` : "") },
                ...ofrecer()
            ];
        case "pocion":
            return [
                { accion: "beber", etiqueta: "Beber (acción de cabeza)", motivo: motivoNoBeber(personaje, objeto) },
                ...manosConArma(personaje).map(mano => ({ accion: "aplicar", mano, etiqueta: `Aplicar a ${nombreEnMano(mano)}` })),
                ...ofrecer()
            ];
        case "cristal":
            return [{ accion: "cristal", etiqueta: "Usar cristal (mano libre)", motivo: sinManoLibre }];
        case "arrojadiza":
            return [{ accion: "lanzar", etiqueta: "Lanzar (mano libre)", motivo: sinManoLibre }];
        case "equipo": {
            const motivo = motivoNoEquipar(personaje, objeto);
            if (motivo || categoriaEquipo(objeto.equipo.tipo) !== "mano") {
                const coste = categoriaEquipo(objeto.equipo.tipo) === "armadura" ? " (todas las acciones)" : " (mano libre)";
                return [{ accion: "equipar", etiqueta: "Equipar" + coste, motivo }];
            }
            const manos = manosParaEquipar(personaje, objeto.equipo.tipo);
            const dosManos = TIPOS_DOS_MANOS.includes(objeto.equipo.tipo);
            return manos.map(mano => ({ accion: "equipar", mano, etiqueta: dosManos ? "Equipar a dos manos" : `Equipar en ${ETIQUETAS_MANO[mano].toLowerCase()}` }));
        }
        default:
            return [];
    }
}

function botonObjeto(accion, icono, titulo, deshabilitado = false) {
    return `<button type="button" class="btn-objeto" data-accion="${accion}" title="${escaparHtml(titulo)}"
        aria-label="${escaparHtml(titulo)}" ${deshabilitado ? "disabled" : ""}>${iconoSao(icono)}</button>`;
}

function filaObjeto(objeto, indice, enInventario) {
    if (!objeto) return `<div class="fila-objeto vacia" data-index="${indice}"><span class="objeto-hueco">Hueco libre</span></div>`;

    const tipoInfo = TIPOS_OBJETO[objeto.tipo];
    const pila = objeto.tipo === "equipo" ? 1 : MAX_PILA_INVENTARIO;
    const cantidad = enInventario ? `${objeto.cantidad}/${pila}` : `×${objeto.cantidad}`;
    let botones;
    let eleccion = "";

    if (enInventario) {
        const opciones = opcionesUso(objeto);
        const disponibles = opciones.filter(opcion => !opcion.motivo);
        const motivo = !opciones.length ? "Sin uso" : !disponibles.length ? opciones[0].motivo : "";
        const tituloUsar = motivo || (opciones.length === 1 ? opciones[0].etiqueta : "Usar…");
        botones = botonObjeto("editar", "editar", "Editar")
            + botonObjeto("baul", "baul", baulAccesible(personaje) ? "Transferir al baúl" : MOTIVOS_ZONA.baul, !baulAccesible(personaje))
            + botonObjeto("descartar", "descartar", "Descartar 1")
            + botonObjeto("usar", "usar", tituloUsar, Boolean(motivo));
        // Con varias formas de usarlo se elige; las que no se pueden ahora (p. ej. sin mano libre) salen desactivadas
        if (eleccionUso === indice && opciones.length > 1) {
            eleccion = `<div class="objeto-eleccion">
                ${opciones.map((opcion, k) => `<button type="button" class="btn-eleccion" data-accion="elegir" data-opcion="${k}"
                    ${opcion.motivo ? `disabled title="${escaparHtml(opcion.motivo)}"` : ""}>${escaparHtml(opcion.etiqueta)}</button>`).join("")}
                <button type="button" class="btn-eleccion cancelar" data-accion="cancelar">Cancelar</button>
            </div>`;
        }
    } else {
        const cabe = cabenEnInventario(personaje, objeto) > 0;
        const tituloTransferir = !baulAccesible(personaje) ? MOTIVOS_ZONA.baul
            : cabe ? "Transferir al inventario" : "No queda espacio en el inventario";
        botones = botonObjeto("editar", "editar", "Editar")
            + botonObjeto("inventario", "inventario", tituloTransferir, !cabe || !baulAccesible(personaje))
            + botonObjeto("descartar", "descartar", "Descartar 1");
    }

    return `<div class="fila-objeto" data-index="${indice}">
        <span class="objeto-icono" title="${tipoInfo.etiqueta}">${iconoSao(iconoObjeto(objeto))}</span>
        <div class="objeto-info">
            <div class="objeto-cabecera">
                <span class="objeto-nombre">${escaparHtml(objeto.nombre)}</span>
                <span class="objeto-cantidad">${cantidad}</span>
            </div>
            <div class="objeto-detalle">${tipoInfo.etiqueta} · ${escaparHtml(detalleObjeto(objeto))}</div>
            ${objeto.descripcion ? `<div class="objeto-descripcion">${escaparHtml(objeto.descripcion)}</div>` : ""}
        </div>
        <div class="objeto-acciones">${botones}</div>
        ${eleccion}
    </div>`;
}

/* Las listas se regeneran solo si cambia su contenido (no tienen campos editables) */
const htmlListas = new Map();
function pintarLista(contenedor, html) {
    if (htmlListas.get(contenedor) === html) return;
    htmlListas.set(contenedor, html);

    // Si el foco estaba en un botón de la lista, se devuelve al mismo botón (o a la ventana),
    // para que el teclado y Escape sigan funcionando
    const enfocado = contenedor.contains(document.activeElement) ? document.activeElement : null;
    const fila = enfocado?.closest(".fila-objeto")?.dataset.index;
    const accion = enfocado?.dataset.accion;
    contenedor.innerHTML = html;
    if (!enfocado) return;
    const mismo = contenedor.querySelector(`.fila-objeto[data-index="${fila}"] button[data-accion="${accion}"]:not(:disabled)`);
    (mismo ?? contenedor.closest(".modal"))?.focus();
}

function actualizarObjetos() {
    if (eleccionUso !== null && !personaje.inventario[eleccionUso]) eleccionUso = null;
    pintarLista(listaInventarioEl, personaje.inventario.map((objeto, i) => filaObjeto(objeto, i, true)).join(""));
    pintarLista(listaBaulEl, personaje.baul.length
        ? personaje.baul.map((objeto, i) => filaObjeto(objeto, i, false)).join("")
        : `<p class="lista-vacia">El baúl está vacío.</p>`);

    const ocupados = personaje.inventario.filter(Boolean).length;
    document.getElementById("contadorInventario").textContent = `(${ocupados} / ${personaje.inventario.length})`;
    document.getElementById("contadorBaul").textContent = `(${personaje.baul.length})`;
    document.getElementById("cantidadCor").textContent = personaje.cor;

    // Fuera de la base no se crean objetos en el baúl
    const crearEnBaul = document.querySelector('.btn-crear-objeto[data-destino="baul"]');
    crearEnBaul.disabled = !baulAccesible(personaje);
    crearEnBaul.title = crearEnBaul.disabled ? MOTIVOS_ZONA.crearEnBaul : "";
    document.getElementById("avisoZonaBaul").hidden = baulAccesible(personaje);
}

/* Cor: añadir o gastar la cantidad del campo */
function inicializarCor() {
    document.querySelector(".barra-cor .cor-icono").innerHTML = iconoSao("cor");
    document.getElementById("btnAnadirCor").innerHTML = iconoSao("corMas");
    document.getElementById("btnGastarCor").innerHTML = iconoSao("corMenos");
    const inputCor = document.getElementById("inputCor");
    const operar = (operacion) => {
        reproducir("click");
        const resultado = operacion(personaje, inputCor.value);
        if (!resultado.ok) mostrarPopupInfo("Cor", resultado.resumen.map(escaparHtml));
        actualizarTodo();
    };
    document.getElementById("btnAnadirCor").addEventListener("click", () => operar(anadirCor));
    document.getElementById("btnGastarCor").addEventListener("click", () => operar(gastarCor));
}

/* Pregunta antes de descartar la última unidad de un hueco */
function confirmarDescarte(objeto) {
    return objeto.cantidad > 1 || confirm(`¿Descartar ${objeto.nombre}? Es la última unidad.`);
}

function ejecutarUso(indice, opcion) {
    const objeto = personaje.inventario[indice];
    const gastar = gastarAccionesOConfirmar;
    let resultado;
    let titulo = objeto.nombre;

    switch (opcion.accion) {
        case "comer":
            resultado = comer(personaje, indice);
            if (resultado.ok && objeto.modificadores.length) resultado.resumen.splice(1, 0, textoModificadores(objeto.modificadores));
            break;
        case "beber": resultado = beberPocion(personaje, indice, gastar); break;
        case "aplicar": resultado = aplicarPocionAArma(personaje, indice, opcion.mano, gastar); break;
        case "equipar": resultado = equipar(personaje, indice, opcion.mano, gastar); break;
        case "cristal":
            resultado = usarCristal(personaje, indice, gastar);
            if (resultado.ok) reproducir("cristal");
            break;
        case "lanzar":
            resultado = lanzarArrojadiza(personaje, indice, gastar);
            if (resultado.ok) lanzar(resultado.objeto, resultado.mano);
            break;
        case "ofrecer":
            resultado = ofrecerObjeto(personaje, indice, gastar, opcion.destino.nombre);
            break;
        default: return;
    }

    eleccionUso = null;
    actualizarTodo();
    if (opcion.accion === "ofrecer" && resultado.ok) {
        // Lo ven todos; solo el destinatario puede consumirlo desde el pop-up
        const nombre = String(personaje.nombre ?? "").trim() || "Alguien";
        emitirEvento("oferta", {
            titulo: `${nombre} ofrece ${resultado.objeto.nombre} a ${opcion.destino.nombre}`,
            subtitulo: TIPOS_OBJETO[resultado.objeto.tipo].etiqueta,
            lineas: [detalleObjeto(resultado.objeto)],
            para: opcion.destino.uid,
            objeto: resultado.objeto
        });
        return;
    }
    if (!resultado.ok) titulo = `No se puede: ${objeto.nombre}`;
    if (!resultado.resumen.length) return;
    // Comida, pociones y cristales usados se comparten en la sala; lo demás (equipar, fallos) solo se ve aquí
    const subtitulo = resultado.ok ? SUBTITULOS_USO_COMPARTIDO[opcion.accion] : null;
    if (subtitulo) emitirEvento("objeto", { titulo, subtitulo, lineas: resultado.resumen });
    else mostrarPopupInfo(escaparHtml(titulo), resultado.resumen.map(escaparHtml));
}

/* Usos de objetos que se ven en la sala, con el subtítulo de su pop-up */
const SUBTITULOS_USO_COMPARTIDO = {
    comer: "Comida",
    beber: "Poción",
    aplicar: "Poción aplicada al arma",
    cristal: "Cristal"
};

/* Tirada de un arma arrojadiza: dado medio + Reflejos + Combate (o Sigilo) */
function lanzar(objeto, mano) {
    const { modos, criticoFacil } = obtenerConfiguracionTirada();
    const tirada = prepararLanzamiento(personaje, objeto, modos);
    ejecutarTirada({
        nombreAccion: tirada.nombre,
        subtitulo: `Lanzamiento · ${ETIQUETAS_MANO[mano]}`,
        valorHabilidad: tirada.valorHabilidad,
        etiquetaHabilidad: tirada.etiquetaHabilidad,
        valorCaracteristica: tirada.valorCaracteristica,
        etiquetaCaracteristica: tirada.etiquetaCaracteristica,
        modoTirada: tirada.modo,
        criticoFacil: criticoFacil,
        bonificador: tirada.bonificador,
        etiquetaBonificador: tirada.bonificador > 0 ? "Ventaja extra" : "Desventaja extra",
        etiquetaTotal: "ATAQUE",
        calcularDanno: (resultado) => calcularDannoLanzamiento(personaje, objeto, esCritico(resultado))
    });
}

function inicializarObjetos() {
    listaInventarioEl.addEventListener("click", (e) => {
        const boton = e.target.closest("button[data-accion]");
        const fila = boton?.closest(".fila-objeto");
        if (!fila) return;
        reproducir("click");
        const indice = Number(fila.dataset.index);
        const objeto = personaje.inventario[indice];
        if (!objeto) return;

        switch (boton.dataset.accion) {
            case "editar": eleccionUso = null; return abrirEditorObjeto("inventario", indice);
            case "baul":
                if (baulAccesible(personaje)) transferirABaul(personaje, indice);
                break;
            case "descartar":
                if (!confirmarDescarte(objeto)) return;
                descartar(personaje.inventario, indice, true);
                break;
            case "usar": {
                const opciones = opcionesUso(objeto);
                if (opciones.length === 1 && !opciones[0].motivo) return ejecutarUso(indice, opciones[0]);
                eleccionUso = eleccionUso === indice ? null : indice;
                break;
            }
            case "elegir": {
                const opcion = opcionesUso(objeto)[Number(boton.dataset.opcion)];
                if (opcion && !opcion.motivo) return ejecutarUso(indice, opcion);
                break;
            }
            case "cancelar": eleccionUso = null; break;
        }
        actualizarTodo();
    });

    listaBaulEl.addEventListener("click", (e) => {
        const boton = e.target.closest("button[data-accion]");
        const fila = boton?.closest(".fila-objeto");
        if (!fila) return;
        reproducir("click");
        const indice = Number(fila.dataset.index);
        const objeto = personaje.baul[indice];
        if (!objeto) return;

        if (boton.dataset.accion === "editar") return abrirEditorObjeto("baul", indice);
        if (boton.dataset.accion === "inventario" && baulAccesible(personaje)) {
            const resultado = transferirAInventario(personaje, indice);
            if (!resultado.ok) mostrarPopupInfo("Inventario lleno", resultado.resumen);
        }
        if (boton.dataset.accion === "descartar") {
            if (!confirmarDescarte(objeto)) return;
            descartar(personaje.baul, indice, false);
        }
        actualizarTodo();
    });

    // Al cerrar el inventario se olvida la elección de uso pendiente
    document.getElementById("modalInventario").addEventListener("hidden.bs.modal", () => {
        if (eleccionUso === null) return;
        eleccionUso = null;
        actualizarObjetos();
    });

    inicializarCrearObjeto();
}

/* Ventana de crear y editar objetos ________________________________________ */
/* Abre la ventana con un objeto del inventario o del baúl; la define inicializarCrearObjeto */
let abrirEditorObjeto = () => {};

function inicializarCrearObjeto() {
    const modalEl = document.getElementById("modalCrearObjeto");
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    const campo = (id) => document.getElementById(id);
    const selectTipo = campo("objetoTipo");
    const selectTipoEquipo = campo("objetoTipoEquipo");
    const selectEstado = campo("objetoEstado");
    const selectAccionEstado = campo("objetoEstadoAccion");
    const checkPermanente = campo("objetoEstadoPermanente");
    const listaMods = campo("listaModsObjeto");
    const aviso = campo("avisoCrearObjeto");
    let destino = "inventario";
    let modalOrigen = null;
    let mods = [];
    /* Habilidades de reliquia del objeto (tipo Reliquia o arma marcada como reliquia) */
    let habilidades = [];
    const listaHabilidades = campo("listaHabilidadesObjeto");
    const checkReliquia = campo("objetoEsReliquia");
    /* Objeto que se está editando: { lista: "inventario" | "baul", indice }, o null al crear */
    let edicion = null;

    // Opciones de los desplegables
    selectTipo.innerHTML = Object.entries(TIPOS_OBJETO).map(([clave, info]) => `<option value="${clave}">${info.etiqueta}</option>`).join("");
    selectTipoEquipo.innerHTML =
        `<optgroup label="Armas y escudos">${Object.entries(ARMAS).map(([clave, arma]) => `<option value="${clave}">${arma.etiqueta}</option>`).join("")}</optgroup>
        <optgroup label="Armaduras">${TIPOS_ARMADURA.map(tipo => `<option value="${tipo}">${ETIQUETAS_ARMADURA[tipo]}</option>`).join("")}</optgroup>
        <optgroup label="Otros"><option value="${TIPO_ACCESORIO}">Accesorio</option><option value="${TIPO_RELIQUIA}">Reliquia</option></optgroup>`;
    selectEstado.innerHTML = `<option value="">Ninguno</option>` +
        Object.entries(ESTADOS_INFO).map(([clave, info]) => `<option value="${clave}">${info.etiqueta}</option>`).join("");
    campo("objetoElemental").innerHTML = `<option value="">Ninguno</option>` +
        ELEMENTOS_ARROJADIZA.map(tipo => `<option value="${tipo}">${TIPOS_DANNO[tipo].etiqueta}</option>`).join("");

    const pintarMods = () => {
        listaMods.innerHTML = mods.map((mod, i) => `
            <li class="mod-equipo" data-index="${i}">
                <select class="listValores" aria-label="Atributo">${opcionesAtributo(mod.modificado)}</select>
                <input type="number" class="cantidadMod" aria-label="Cantidad" value="${mod.numero}">
                <button type="button" class="quitar-mod" title="Eliminar modificador" aria-label="Eliminar modificador">×</button>
            </li>`).join("");
    };

    const pintarHabilidades = () => {
        listaHabilidades.innerHTML = habilidades.map((_, i) => filaHabilidadReliquia(i, false)).join("");
        rellenarFilasHabilidades(listaHabilidades, habilidades);
    };
    /* ¿El equipo elegido lleva habilidades de reliquia? */
    const conHabilidades = () => {
        const tipoEquipo = selectTipoEquipo.value;
        const puedeSerReliquia = (Boolean(ARMAS[tipoEquipo]) && !ARMAS[tipoEquipo].escudo) || tipoEquipo === TIPO_ACCESORIO;
        return selectTipo.value === "equipo" && (tipoEquipo === TIPO_RELIQUIA || (puedeSerReliquia && checkReliquia.checked));
    };

    // Muestra solo los campos del tipo elegido
    const actualizarCampos = () => {
        const tipo = selectTipo.value;
        modalEl.querySelectorAll("[data-campos]").forEach(el => {
            el.style.display = el.dataset.campos.split(" ").includes(tipo) ? "" : "none";
        });
        const tipoEquipo = selectTipoEquipo.value;
        const grupoEquipo = ARMAS[tipoEquipo]?.escudo ? "escudo" : ARMAS[tipoEquipo] ? "arma"
            : tipoEquipo === TIPO_ACCESORIO ? "accesorio"
            : TIPOS_ARMADURA.includes(tipoEquipo) ? "armadura" : "";
        modalEl.querySelectorAll("[data-equipo]").forEach(el => {
            el.style.display = el.dataset.equipo.split(" ").includes(grupoEquipo) ? "" : "none";
        });
        const quitar = (tipo === "pocion" || tipo === "comida") && selectAccionEstado.value === "quitar";
        modalEl.querySelectorAll(".campo-estado-valor").forEach(el => {
            el.style.display = selectEstado.value && !quitar ? "" : "none";
        });
        campo("objetoEstadoTurnos").disabled = checkPermanente.checked;
        campo("labelObjetoDescripcion").textContent = tipo === "cristal" ? "Mensaje al usarlo" : "Descripción";
        campo("campoHabilidadesReliquia").style.display = conHabilidades() ? "" : "none";
    };

    // Valores por defecto del estado elegido
    selectEstado.addEventListener("change", () => {
        const info = ESTADOS_INFO[selectEstado.value];
        if (!info) return;
        campo("objetoEstadoValor").value = info.valorPorDefecto ?? 1;
        checkPermanente.checked = info.turnos === TURNOS_PERMANENTE;
        campo("objetoEstadoTurnos").value = info.turnos === TURNOS_PERMANENTE ? 3 : info.turnos;
    });

    modalEl.addEventListener("change", actualizarCampos);
    campo("btnAnadirModObjeto").addEventListener("click", () => {
        mods.push({ modificado: "atletismo", numero: 1 });
        pintarMods();
    });
    listaMods.addEventListener("change", (e) => {
        const mod = mods[Number(e.target.closest(".mod-equipo")?.dataset.index)];
        if (!mod) return;
        if (e.target.classList.contains("listValores")) mod.modificado = e.target.value;
        if (e.target.classList.contains("cantidadMod")) mod.numero = parseInt(e.target.value) || 0;
    });
    campo("btnAnadirHabilidadObjeto").addEventListener("click", () => {
        habilidades.push(cargarHabilidadReliquia({ enfriamiento: 1 }));
        pintarHabilidades();
        listaHabilidades.lastElementChild?.querySelector(".nombreHabilidad")?.focus();
    });
    listaHabilidades.addEventListener("input", (e) => {
        const habilidad = habilidades[Number(e.target.closest(".habilidad-reliquia")?.dataset.index)];
        if (!habilidad) return;
        if (e.target.classList.contains("nombreHabilidad")) habilidad.nombre = e.target.value;
        if (e.target.classList.contains("descripcionHabilidad")) habilidad.descripcion = e.target.value;
        if (e.target.classList.contains("enfriamientoHabilidad")) habilidad.enfriamiento = Math.max(0, parseInt(e.target.value) || 0);
    });
    listaHabilidades.addEventListener("click", (e) => {
        if (!e.target.closest(".quitar-habilidad")) return;
        habilidades.splice(Number(e.target.closest(".habilidad-reliquia").dataset.index), 1);
        pintarHabilidades();
    });
    listaMods.addEventListener("click", (e) => {
        if (!e.target.closest(".quitar-mod")) return;
        mods.splice(Number(e.target.closest(".mod-equipo").dataset.index), 1);
        pintarMods();
    });

    // La misma ventana sirve para crear y para editar: titulo y botón según el modo
    const ponerModo = (editando) => {
        campo("modalCrearObjetoLabel").textContent = editando ? "Editar objeto" : "Crear objeto";
        // Botón redondo: el texto va en el título
        const textoBoton = editando ? "Guardar" : "Crear";
        campo("btnCrearObjeto").title = textoBoton;
        campo("btnCrearObjeto").setAttribute("aria-label", textoBoton);
    };

    const reiniciar = () => {
        campo("formCrearObjeto").reset();
        Object.keys(FORMULARIO_ELEMENTAL).forEach(campoElem => rellenarElementalesFormulario(campoElem, null));
        selectTipo.value = "material";
        campo("objetoCantidad").value = 1;
        mods = [];
        pintarMods();
        habilidades = [];
        pintarHabilidades();
        aviso.textContent = "";
        edicion = null;
        ponerModo(false);
        actualizarCampos();
    };

    // Rellena el formulario con un objeto existente
    const rellenar = (objeto) => {
        selectTipo.value = objeto.tipo;
        campo("objetoNombre").value = objeto.nombre;
        campo("objetoCantidad").value = objeto.cantidad;
        campo("objetoDescripcion").value = objeto.descripcion;
        const modsObjeto = objeto.tipo === "equipo" ? objeto.equipo.modificadores : objeto.modificadores;
        mods = (modsObjeto || []).map(mod => ({ modificado: mod.modificado, numero: Number(mod.numero) || 0 }));
        pintarMods();

        if (objeto.tipo === "pocion") {
            campo("objetoPv").value = objeto.pv;
            campo("objetoPa").value = objeto.pa || 0;
        }
        if (objeto.tipo === "arrojadiza") {
            campo("objetoDanno").value = objeto.danno;
            campo("objetoElemental").value = objeto.elemental?.tipo ?? "";
            campo("objetoElementalCantidad").value = objeto.elemental?.cantidad ?? 0;
        }
        if (objeto.estado) {
            selectEstado.value = objeto.estado.clave;
            selectAccionEstado.value = objeto.estado.quitar ? "quitar" : "activar";
            campo("objetoEstadoValor").value = objeto.estado.valor;
            checkPermanente.checked = objeto.estado.turnos === TURNOS_PERMANENTE;
            campo("objetoEstadoTurnos").value = objeto.estado.turnos === TURNOS_PERMANENTE ? 3 : objeto.estado.turnos;
        }
        if (objeto.tipo === "equipo") {
            const equipo = objeto.equipo;
            selectTipoEquipo.value = equipo.tipo;
            campo("objetoEquipoDanno").value = equipo.danno || 0;
            campo("objetoEquipoDefensa").value = equipo.defensa || 0;
            campo("objetoEquipoArmadura").value = equipo.armadura || 0;
            campo("objetoEquipoPenalizacion").value = equipo.penalizacionAtletismo || 0;
            rellenarElementalesFormulario("resistencias", equipo.resistencias);
            rellenarElementalesFormulario("dannoElemental", equipo.dannoElemental);
            checkReliquia.checked = Boolean(equipo.reliquia);
            habilidades = (equipo.reliquia?.habilidades ?? []).map(cargarHabilidadReliquia);
            pintarHabilidades();
        }
        actualizarCampos();
    };

    const leerEstado = (puedeQuitar) => {
        if (!selectEstado.value) return null;
        return {
            clave: selectEstado.value,
            valor: Math.max(0, parseInt(campo("objetoEstadoValor").value) || 0),
            turnos: checkPermanente.checked ? TURNOS_PERMANENTE : Math.max(0, parseInt(campo("objetoEstadoTurnos").value) || 0),
            quitar: puedeQuitar && selectAccionEstado.value === "quitar"
        };
    };

    const crear = () => {
        const tipo = selectTipo.value;
        const nombre = campo("objetoNombre").value.trim();
        if (!nombre) {
            aviso.textContent = "Ponle un nombre al objeto.";
            campo("objetoNombre").focus();
            return;
        }
        const numero = (id) => parseInt(campo(id).value) || 0;
        const modificadores = mods.map(mod => new Modificador(nombre, mod.modificado, mod.numero, TURNOS_PERMANENTE));
        const datos = {
            tipo, nombre,
            descripcion: campo("objetoDescripcion").value.trim(),
            cantidad: Math.max(1, numero("objetoCantidad"))
        };
        if (tipo === "comida") Object.assign(datos, { modificadores, estado: leerEstado(true) });
        if (tipo === "pocion") Object.assign(datos, { pv: numero("objetoPv"), pa: Math.max(0, numero("objetoPa")), estado: leerEstado(true) });
        if (tipo === "arrojadiza") {
            Object.assign(datos, {
                danno: Math.max(0, numero("objetoDanno")),
                estado: leerEstado(false),
                elemental: campo("objetoElemental").value
                    ? { tipo: campo("objetoElemental").value, cantidad: Math.max(0, numero("objetoElementalCantidad")) }
                    : null
            });
        }
        if (tipo === "equipo") {
            // Al editar se conserva lo que el formulario no muestra (p. ej. una poción aplicada al arma)
            const original = edicion ? personaje[edicion.lista][edicion.indice]?.equipo : null;
            datos.equipo = {
                ...(original ? JSON.parse(JSON.stringify(original)) : {}),
                tipo: selectTipoEquipo.value, nombre, descripcion: datos.descripcion,
                danno: Math.max(0, numero("objetoEquipoDanno")),
                defensa: Math.max(0, numero("objetoEquipoDefensa")),
                armadura: Math.max(0, numero("objetoEquipoArmadura")),
                penalizacionAtletismo: Math.max(0, numero("objetoEquipoPenalizacion")),
                // Resistencias solo en armaduras; daño elemental solo en armas de ataque
                resistencias: tarjetaUsaElemental({ tipo: selectTipoEquipo.value }, "resistencias")
                    ? leerElementalesFormulario("resistencias") : cargarValoresElementales(),
                dannoElemental: tarjetaUsaElemental({ tipo: selectTipoEquipo.value }, "dannoElemental")
                    ? leerElementalesFormulario("dannoElemental") : cargarValoresElementales(),
                modificadores,
                reliquia: conHabilidades() ? { habilidades: habilidades.map(cargarHabilidadReliquia) } : null
            };
        }

        const objeto = cargarObjeto(datos);
        const lineas = [];

        // Fuera de la base no se puede usar el baúl: lo que no quepa en el inventario no se crea
        if (!baulAccesible(personaje)) {
            const pila = objeto.tipo === "equipo" ? 1 : MAX_PILA_INVENTARIO;
            const sobra = edicion?.lista === "inventario" ? objeto.cantidad - pila
                : edicion ? 0
                : destino === "baul" ? objeto.cantidad
                : objeto.cantidad - cabenEnInventario(personaje, objeto);
            if (sobra > 0) {
                aviso.textContent = destino === "baul" && !edicion
                    ? MOTIVOS_ZONA.crearEnBaul + "."
                    : `No caben ${sobra} en el inventario y fuera de la base no pueden ir al baúl. Reduce la cantidad.`;
                return;
            }
        }

        if (edicion) {
            // Editar: el objeto se queda en su hueco. En el inventario la pila no pasa de su máximo;
            // lo que sobre va al baúl para no perderlo.
            const pila = objeto.tipo === "equipo" ? 1 : MAX_PILA_INVENTARIO;
            if (edicion.lista === "inventario" && objeto.cantidad > pila) {
                const sobra = objeto.cantidad - pila;
                objeto.cantidad = pila;
                anadirABaul(personaje, { ...objeto, cantidad: sobra });
                lineas.push(`Solo caben ${pila} por hueco: ${sobra} van al baúl.`);
            }
            personaje[edicion.lista][edicion.indice] = objeto;
            personaje.calcularCaracteristicas();
        } else if (destino === "baul") {
            anadirABaul(personaje, objeto);
        } else {
            // Lo que no cabe en el inventario va al baúl, para no perderlo
            const resto = anadirAInventario(personaje, objeto);
            if (resto > 0) {
                anadirABaul(personaje, { ...objeto, cantidad: resto });
                lineas.push(`No caben ${resto} en el inventario: van al baúl.`);
            }
        }
        const editado = Boolean(edicion);
        edicion = null;
        modal.hide();
        actualizarTodo();
        if (lineas.length) mostrarPopupInfo(`${editado ? "Editado" : "Creado"}: ${escaparHtml(nombre)}`, lineas);
    };

    campo("btnCrearObjeto").addEventListener("click", () => {
        reproducir("click");
        crear();
    });
    campo("objetoNombre").addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); crear(); }
    });

    // Se abre desde el inventario o el baúl: se oculta esa ventana y se vuelve a ella al cerrar
    const abrirDesde = (origen) => {
        modalOrigen = origen;
        modalOrigen.addEventListener("hidden.bs.modal", () => modal.show(), { once: true });
        // Cambio de ventana, no volver a la pantalla principal: solo suena el click
        modalOrigen.dataset.sinSonidoCerrar = "1";
        modalEl.dataset.sinSonidoAbrir = "1";
        bootstrap.Modal.getOrCreateInstance(modalOrigen).hide();
    };

    document.querySelectorAll(".btn-crear-objeto").forEach(boton => {
        boton.addEventListener("click", () => {
            reproducir("click");
            destino = boton.dataset.destino;
            reiniciar();
            abrirDesde(boton.closest(".modal"));
        });
    });

    // Editar un objeto ya creado (botón de cada fila; el click ya suena en la lista)
    abrirEditorObjeto = (lista, indice) => {
        const objeto = personaje[lista][indice];
        if (!objeto) return;
        reiniciar();
        edicion = { lista, indice };
        ponerModo(true);
        rellenar(objeto);
        abrirDesde(document.getElementById(lista === "baul" ? "modalBaul" : "modalInventario"));
    };
    modalEl.addEventListener("shown.bs.modal", () => campo("objetoNombre").focus());
    // Cerrar esta ventana devuelve al inventario o al baúl, no a la pantalla principal:
    // ni sonido de cerrar ni de volver a abrir (al crear ya suena el click)
    modalEl.addEventListener("hide.bs.modal", () => {
        if (modalOrigen) modalEl.dataset.sinSonidoCerrar = "1";
    });
    modalEl.addEventListener("hidden.bs.modal", () => {
        if (!modalOrigen) return;
        const origen = modalOrigen;
        modalOrigen = null;
        origen.dataset.sinSonidoAbrir = "1";
        bootstrap.Modal.getOrCreateInstance(origen).show();
    });
}

/* Debug: abrir la página con ?debug para ver el botón ______________________ */
function inicializarDebug() {
    if (!new URLSearchParams(window.location.search).has("debug")) return;

    // Acceso desde la consola del navegador: fichaDebug.personaje, fichaDebug.ejecutar()...
    window.fichaDebug = {
        personaje, ejecutar: () => ejecutarDebug(personaje), crearPersonajePrueba, validarFicha,
        // Artes: el catálogo cargado y los requisitos de cada una para este personaje
        get catalogoArtes() { return catalogoArtes; },
        // Copia un arte del catálogo a las artes sin equipar, p. ej. fichaDebug.anadirArte("golpe-horizontal")
        anadirArte: (id) => {
            const arte = catalogoArtes.find(a => a.id === id);
            if (!arte) return `No existe "${id}" en el catálogo`;
            personaje.artes.push(copiarDelCatalogo(arte));
            actualizarTodo();
            return `${arte.nombre} añadida a las artes sin equipar`;
        },
        requisitosArtes: () => catalogoArtes.map(arte => {
            const { cumple, obligatorios, alternativos } = estadoRequisitos(personaje, arte);
            const marcar = (lista) => lista.map(r => `${r.ok ? "✓" : "✗"} ${r.texto}`).join(", ");
            return { id: arte.id, cumple, obligatorios: marcar(obligatorios), alternativos: marcar(alternativos) };
        })
    };

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

/* Catálogo de artes (data/artes.json). Si no carga, la ficha sigue funcionando sin él. */
function cargarCatalogoArtes() {
    descargarCatalogo()
        .then(catalogo => {
            catalogoBase = catalogo;
            rehacerCatalogo();
            estadoCatalogoArtes = "ok";
        })
        .catch(error => {
            estadoCatalogoArtes = "error";
            console.warn("No se pudo cargar el catálogo de artes:", error);
        })
        .finally(actualizarCatalogoArtes);
}

document.addEventListener("DOMContentLoaded", () => {
    cargarCatalogoArtes();
    construirManosEquipamiento();
    inicializarEquipamiento();
    inicializarBloquesElementales();
    inicializarModsEquipo();
    inicializarHabilidadesReliquia();
    actualizarModificadores();
    parseModificadoresEquipo();
    actualizarTodo();
    inicializarTiradasHabilidades();
    inicializarTurno();
    inicializarEstados();
    inicializarDanno();
    inicializarZona();
    inicializarMenuInventario();
    inicializarArtes();
    inicializarFormularioArte();
    inicializarCatalogoArtes();
    inicializarObjetos();
    inicializarCor();
    precargarSonidos();
    inicializarOpciones();
    inicializarHistorialPopups();
    inicializarBotonesModales();
    inicializarDebug();
    actualizarTodo();
    marcarGuardado(); // ficha vacía de inicio: cerrar sin tocar nada no avisa
    // Online (Firebase): si la última vez se dejó la sesión abierta, se recupera con su sala
    inicializarOnline({
        personaje: () => personaje,
        cargarFicha,
        marcarGuardado,
        hayCambiosSinGuardar: () => { comprobarCambios(); return hayCambiosSinGuardar; },
        aviso: (titulo, lineas) => mostrarPopupInfo(escaparHtml(titulo), lineas.map(escaparHtml)),
        alCambiarEstado: () => {
            menuOpciones?.actualizar();
            actualizarCatalogoArtes();
        },
        alCambiarArtesSala,
        // Las opciones "Ofrecer a…" del inventario dependen de quién hay en la sala
        alCambiarMiembros: () => actualizarObjetos()
    });
});