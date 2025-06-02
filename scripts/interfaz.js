import Equipamiento from "./equipamiento.js";
import Modificador from "./modificador.js";
import PJ from "./PJ.js";

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
    element.addEventListener('focusout', () => {
        personaje[element.id] = Number(element.value);
        personaje.calcularCaracteristicas();
        actualizarTodo();
    })
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

function actualizarTodo() {
    actualizarInformacion();
    actualizarAtributos();
    actualizarHabilidades();
    actualizarCaracteristicas();
    actuaizarTextos();
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
}

function actualizarAtributos() {
    spanFortaleza.value = personaje.fortaleza;
    spanReflejos.value = personaje.reflejos;
    spanVoluntad.value = personaje.voluntad;
    spanMente.value = personaje.inteligencia;
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
function parseModificadoresEquipo() {
    for (const elemento of document.getElementsByClassName("equipamiento")) {
        /* Resetean valores internos del listado de modificadores  */
        let listaModsEquipo = elemento.getElementsByClassName("modificadoresEquipo")[0];
        listaModsEquipo.innerHTML = "";
        personaje[elemento.classList[0]].modificadores.forEach((modificador, index) => {
            listaModsEquipo.innerHTML += ` 
            <li id="modificadorE${index}" class="modificadorE">
              <input type="text" class="" style="display:none" value="${modificador.nombre}"> Atributo:
              <select class="listValores" > 
                    <option ${modificador.modificado == "atletismo" ? "selected" : ""} value="atletismo">Atletismo</option>
                    <option ${modificador.modificado == "combate" ? "selected" : ""} value="combate">Combate</option>
                    <option ${modificador.modificado == "percepcion" ? "selected" : ""} value="percepcion">Percepción</option>
                    <option ${modificador.modificado == "subterfugio" ? "selected" : ""} value="subterfugio">Sigilo</option>
                    <option ${modificador.modificado == "comunicacion" ? "selected" : ""} value="comunicacion">Carisma</option>
                    <option ${modificador.modificado == "cutlura" ? "selected" : ""}value="cutlura">Cultura</option>
                    <option ${modificador.modificado == "profesion" ? "selected" : ""}value="profesion">Profesion</option>
                    <option ${modificador.modificado == "sacro" ? "selected" : ""}value="sacro">Sacro</option>
                    <option ${modificador.modificado == "armadura" ? "selected" : ""}value="armadura">Armadura</option>
                </select> 
                Cantidad:<input type="number"  class="cantidadMod" value="${modificador.numero}"/> 
                <input style="display:none" class="duracionMod" value="${modificador.turnos}"/>
                <div class="eliminarMod">-</div>
            </li>`;
        });

    }

    /* Se añaden funcionalidad a los elementos TODO : hacer que el evento se lanze en los contenedores de modificadores y que haga bubbling para ver si esta donde debe  */
    añadirFuncionalidadEquipoModificador();
}

let selectTipoArmadura = document.querySelector("#divEquipamiento > div.equipoArmadura.equipamiento > select");
let listaAccesorios = document.querySelector("#divEquipamiento > div.listaAccesorios > ul");
function generarAccesorios() {
    listaAccesorios.innerHTML = "";
    for (let index = 0; index < Number(selectTipoArmadura.value); index++) {
        listaAccesorios.innerHTML += `<li class="accesorio " id="accesorio${index}"> <b>Accesorio ${index + 1}:</b> <input type="text"
                            placeholder="Nombre">
                        <button>+</button>

                        <ul class="modificadoresAccesorio">

                        </ul>
                        </li>`;

        /* Añadir modificador a accesorio  */
        document.querySelector(`#accesorio${index} > button`).addEventListener("click", () => {
            personaje.accesorios[index].modificadores.push(new Modificador("Nombre", "Atletismo", 0, 0));
            actualizarTodo();
        });


    }
}
function parseModificadoresAccesorios() {
    for (const [indexAccesorio, modificadoresAccesorio] of Array.from(document.getElementsByClassName("modificadoresAccesorio")).entries()) {
        personaje.accesorios[indexAccesorio].modificadores.forEach((modificador, index) => {
            modificadoresAccesorio.innerHTML += ` 
            <li class="modificadorA" >
              <input type="text" class="" style="display:none" value="${modificador.nombre}"> Atributo:
              <select class="listValores" > 
                    <option ${modificador.modificado == "atletismo" ? "selected" : ""} value="atletismo">Atletismo</option>
                    <option ${modificador.modificado == "combate" ? "selected" : ""} value="combate">Combate</option>
                    <option ${modificador.modificado == "percepcion" ? "selected" : ""} value="percepcion">Percepción</option>
                    <option ${modificador.modificado == "subterfugio" ? "selected" : ""} value="subterfugio">Sigilo</option>
                    <option ${modificador.modificado == "comunicacion" ? "selected" : ""} value="comunicacion">Carisma</option>
                    <option ${modificador.modificado == "cutlura" ? "selected" : ""}value="cutlura">Cultura</option>
                    <option ${modificador.modificado == "profesion" ? "selected" : ""}value="profesion">Profesion</option>
                    <option ${modificador.modificado == "sacro" ? "selected" : ""}value="sacro">Sacro</option>
                    <option ${modificador.modificado == "armadura" ? "selected" : ""}value="armadura">Armadura</option>
                </select> 
                Cantidad:<input type="number"  class="cantidadMod" value="${modificador.numero}"/> 
                <input style="display:none" class="duracionMod" value="${modificador.turnos}"/>
                <button class="eliminarMod">-</button>
            </li>`;

            let elementoModificadorAccesorio = modificadoresAccesorio.parentElement.id.substring(8);

        });

        /* 
                let indexAccesorio = modificadoresAccesorio.parentElement.id.substring(8);
                let tipoEquipo = modificador.parentElement.parentElement.classList[0];
        
                modificador.children[0].addEventListener('focusout', (evt) => {
                    personaje[tipoEquipo].modificadores[index].nombre = evt.currentTarget.value;
                    console.log(personaje.modificadores);
                })
                modificador.children[1].addEventListener('focusout', (evt) => {
                    personaje[tipoEquipo].modificadores[index].modificado = evt.currentTarget.value;
                    console.log(personaje.modificadores);
                })
                modificador.children[2].addEventListener('focusout', (evt) => {
                    personaje[tipoEquipo].modificadores[index].numero = parseInt(evt.currentTarget.value);
                    personaje.calcularCaracteristicas();
                    console.log(personaje.modificadores);
                    actualizarTodo();//cuando se cambia el numero el valor numerico ded algo puede variar.
                })
                modificador.children[3].addEventListener('focusout', (evt) => {
                    personaje[tipoEquipo].modificadores[index].turnos = parseInt(evt.currentTarget.value);
                    personaje.calcularCaracteristicas();
                    actualizarTodo();//puede que haya desaparecido un modificador por lo que hay que recalcular
                })
        
                modificador.children[4].addEventListener('click', (evt) => {
                    personaje[tipoEquipo].modificadores.splice(index, 1);
                    parseModificadoresEquipo();
                    personaje.calcularCaracteristicas();
                    actualizarTodo();//cuando se cambia el numero el valor numerico ded algo puede variar.
        
                }) */
    }





}



/* Funcion que añade funcionalidad de */
for (const elemento of document.getElementsByClassName("equipamiento")) {

    let elementoModificadores = elemento.getElementsByClassName("modificadoresEquipo");
    /* array.forEach(element => {
        
    }); */
    elemento.getElementsByTagName("button")[0].addEventListener("click", () => {
        personaje[elemento.classList[0]].modificadores.push(new Modificador("nombre", "atletismo", 0, -1));
        console.log(personaje[elemento.classList[0]]);
        parseModificadoresEquipo();
    })
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
        let tipoEquipo = modificador.parentElement.parentElement.classList[0];
        modificador.children[0].addEventListener('focusout', (evt) => {
            personaje[tipoEquipo].modificadores[index].nombre = evt.currentTarget.value;
            console.log(personaje.modificadores);
        })
        modificador.children[1].addEventListener('focusout', (evt) => {
            personaje[tipoEquipo].modificadores[index].modificado = evt.currentTarget.value;
            console.log(personaje.modificadores);
        })
        modificador.children[2].addEventListener('focusout', (evt) => {
            personaje[tipoEquipo].modificadores[index].numero = parseInt(evt.currentTarget.value);
            personaje.calcularCaracteristicas();
            console.log(personaje.modificadores);
            actualizarTodo();//cuando se cambia el numero el valor numerico ded algo puede variar.
        })
        modificador.children[3].addEventListener('focusout', (evt) => {
            personaje[tipoEquipo].modificadores[index].turnos = parseInt(evt.currentTarget.value);
            personaje.calcularCaracteristicas();
            actualizarTodo();//puede que haya desaparecido un modificador por lo que hay que recalcular
        })

        modificador.children[4].addEventListener('click', (evt) => {
            personaje[tipoEquipo].modificadores.splice(index, 1);
            parseModificadoresEquipo();
            personaje.calcularCaracteristicas();
            actualizarTodo();//cuando se cambia el numero el valor numerico ded algo puede variar.

        })

    }
}

document.addEventListener("DOMContentLoaded", () => {
    parseModificadores();
    parseModificadoresEquipo();
    actualizarTodo();

})