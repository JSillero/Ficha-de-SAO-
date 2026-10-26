// scripts/dados.js

// Estado global para ventaja/desventaja (o puedes pasarlo por parámetro)

/**
 * @typedef {Object} ResultadoTirada
 * @property {string} titulo
 * @property {number} resultadoDados - Resultado de la tirada de dados (el valor que se usará para el cálculo final)
 * @property {number} valorHabilidad - Valor de la habilidad del personaje
 * @property {number} valorCaracteristica - Valor de la característica del personaje
 * @property {[number, number, number]} dados - Array con los resultados de los tres dados
 * @property {number} ventajaTirada - 0 = desventaja, 1 = normal, 2 = ventaja
 * @property {number} total - Total final de la tirada (resultadoDados + valorHabilidad + valorCaracteristica)
 * @property {number} critico - Número de críticos obtenidos en la tirada
 * @property {number} pifia - Número de pifias obtenidas en la tirada
 * @property {string} [subtitulo] - Línea bajo el título (p. ej. el arma usada)
 * @property {string|null} [etiquetaHabilidad] - Texto del sumando de habilidad (null lo oculta)
 * @property {string|null} [etiquetaCaracteristica] - Texto del sumando de característica (null lo oculta)
 * @property {number} [bonificador] - Bonificador extra (p. ej. ventaja acumulada)
 * @property {string} [etiquetaBonificador]
 * @property {string} [etiquetaTotal]
 * @property {{ total: number, desglose: string[], notas?: string[] }|null} [danno] - Daño del ataque, si lo hay
 */



/**
 * Función principal que llamarás desde la interfaz.
 * Recibe los datos necesarios sin acoplarse directamente al objeto PJ.
 */


/**
 * Opciones extra:
 * - etiquetaHabilidad / etiquetaCaracteristica: texto en la operación del popup (null oculta ese sumando).
 * - subtitulo: línea bajo el título (p. ej. el arma usada).
 * - etiquetaTotal: texto junto al total (por defecto "TOTAL").
 * - calcularDanno(resultado): si se pasa, el popup añade un bloque de daño. Se llama tras tirar,
 *   porque el daño depende de si hay crítico. Debe devolver { total, desglose: string[], notas?: string[] }.
 */
export function ejecutarTirada({ nombreAccion, valorHabilidad, valorCaracteristica, modoTirada, criticoFacil,
    bonificador = 0, etiquetaBonificador = "Bonif.",
    etiquetaHabilidad = "Hab.", etiquetaCaracteristica = "Caract.", subtitulo = "", etiquetaTotal = "TOTAL",
    calcularDanno = null }) {

    /** @type {ResultadoTirada} */
    const resultado = {
        titulo: nombreAccion,
        subtitulo: subtitulo,
        resultadoDados: 0,
        valorHabilidad: valorHabilidad,
        valorCaracteristica: valorCaracteristica,
        etiquetaHabilidad: etiquetaHabilidad,
        etiquetaCaracteristica: etiquetaCaracteristica,
        bonificador: bonificador,
        etiquetaBonificador: etiquetaBonificador,
        etiquetaTotal: etiquetaTotal,
        dados: [1, 1, 1], // Inicialmente vacío, se llenará después
        ventajaTirada: modoTirada,
        total: 0,
        critico: 0,
        pifia: 0,
        danno: null
    };

    const dado = tirarDados(resultado, criticoFacil);
    resultado.total = dado + (Number(valorHabilidad) || 0) + (Number(valorCaracteristica) || 0) + (Number(bonificador) || 0);
    if (calcularDanno) resultado.danno = calcularDanno(resultado);

    // Lanzar el popup visual
    crearPopupResultado(resultado);
    return resultado;
}

/* Un crítico (de cualquier grado) es cuando el popup muestra la insignia de crítico */
export function esCritico(resultado) {
    return resultado.critico >= 2;
}

/**
 * Combina varias fuentes de ventaja/desventaja (cada una 0 desventaja, 1 normal, 2 ventaja).
 * Ventaja y desventaja se anulan entre sí; cada fuente extra del mismo signo da ±2 a la tirada.
 * @returns {{ modo: number, bonificador: number }}
 */
export function combinarModos(...modos) {
    const ventajas = modos.filter(m => m === 2).length;
    const desventajas = modos.filter(m => m === 0).length;
    const neto = ventajas - desventajas;
    if (neto === 0) return { modo: 1, bonificador: 0 };
    return {
        modo: neto > 0 ? 2 : 0,
        bonificador: Math.sign(neto) * 2 * (Math.abs(neto) - 1)
    };
}
/**
 * @param {ResultadoTirada} objetoResultado
 * @param {boolean} criticoFacil
 */
function tirarDados(objetoResultado, criticoFacil) {
    var dado1 = Math.floor(Math.random() * (10 - 1 + 1) + 1);
    var dado2 = Math.floor(Math.random() * (10 - 1 + 1) + 1);
    var dado3 = Math.floor(Math.random() * (10 - 1 + 1) + 1);
    var critico = 0;
    var fallo = 0;
    var resultado = -1;
    if (dado1 == 10 || (criticoFacil && dado1 == 9)) {
        critico++;
    }
    if (dado2 == 10 || (criticoFacil && dado2 == 9)) {
        critico++;
    }
    if (dado3 == 10 || (criticoFacil && dado3 == 9)) {
        critico++;
    }
    if (dado1 == 1) {
        fallo++;
    }
    if (dado2 == 1) {
        fallo++;
    }
    if (dado3 == 1) {
        fallo++;
    }
    switch (objetoResultado.ventajaTirada) {
        case 0:
            resultado = Math.min(dado1, dado2, dado3);
            critico = critico - 1; // se restan 1 al critico para que el critico sea cuando los 3 dados sean 10 o 9 y no cuando 2 de ellos lo sean
            fallo = fallo + 1; // se le suman 1 a la pifia porque la pifia sea siempre que hay un 1
            break;
        case 1:
            var min = Math.min(dado1, dado2, dado3);
            var max = Math.max(dado1, dado2, dado3);
            if (dado1 == dado2) {
                resultado = dado1;
            } else if (dado1 == dado3) {
                resultado = dado1;
            } else if (dado2 == dado3) {
                resultado = dado2;
            } else {
                if (dado1 != min && dado1 != max) {
                    resultado = dado1;
                } else if (dado2 != min && dado2 != max) {
                    resultado = dado2;
                } else if (dado3 != min && dado3 != max) {
                    resultado = dado3;
                }
            }
            break;
        case 2:
            resultado = Math.max(dado1, dado2, dado3);
            critico = critico + 1; // se suman 1 al critico para que el critico sea siempre que hay un 10 o un 9 y posibilidad de critico absoluto
            fallo = fallo - 1; // se le restan 1 a la pifia porque la pifia sea cuando solo hay 1 en el resultado
            break;
    }
    console.log(resultado + " es el resultat de " + dado1 + " " + dado2 + " " + dado3);
    objetoResultado.resultadoDados = resultado;
    objetoResultado.critico = critico;
    objetoResultado.pifia = fallo;
    objetoResultado.dados = [dado1, dado2, dado3];
    return resultado;

}

/**
 * Genera y muestra el pop-up en la esquina inferior izquierda.
 * @param {ResultadoTirada} resultado
 */
function crearPopupResultado(resultado) {
    const contenedor = document.getElementById('contenedor-popups-dados');
    if (!contenedor) return;

    // Crear el elemento del pop-up
    const popup = document.createElement('div');
    popup.className = `popup-dado popup-modo-${resultado.ventajaTirada}`;

    // Determinar texto del modo de tirada
    let nombreModo = 'NORMAL';
    if (resultado.ventajaTirada === 0) nombreModo = 'DESVENTAJA';
    else if (resultado.ventajaTirada === 2) nombreModo = 'VENTAJA';

    // Determinar texto y clase de Crítico / Pifia
    let badgeEspecialHtml = '';
    if (resultado.critico >= 4) {
        badgeEspecialHtml = `<div class="badge-alerta badge-critico-absoluto">CRÍTICO ABSOLUTO</div>`;
    } else if (resultado.critico === 3) {
        badgeEspecialHtml = `<div class="badge-alerta badge-super-critico">SUPER CRÍTICO</div>`;
    } else if (resultado.critico === 2) {
        badgeEspecialHtml = `<div class="badge-alerta badge-critico">CRÍTICO</div>`;
    } else if (resultado.pifia >= 4) {
        badgeEspecialHtml = `<div class="badge-alerta badge-pifia-absoluta">PIFIA ABSOLUTA</div>`;
    } else if (resultado.pifia === 3) {
        badgeEspecialHtml = `<div class="badge-alerta badge-super-pifia">SUPER PIFIA</div>`;
    } else if (resultado.pifia === 2) {
        badgeEspecialHtml = `<div class="badge-alerta badge-pifia">PIFIA</div>`;
    }

    // Renderizar los 3 dados y resaltar el elegido
    let dadoElegidoYaMarcado = false;
    const dadosHtml = (resultado.dados || []).map(d => {
        const esElegido = (!dadoElegidoYaMarcado && d === resultado.resultadoDados);
        if (esElegido) dadoElegidoYaMarcado = true;
        return `<span class="dado-chip ${esElegido ? 'dado-seleccionado' : ''}">${d}</span>`;
    }).join('');

    // Operación matemática y total
    const valorDado = Number(resultado.resultadoDados) || 0;
    const valorHab = Number(resultado.valorHabilidad) || 0;
    const valorCaract = Number(resultado.valorCaracteristica) || 0;
    const valorBonif = Number(resultado.bonificador) || 0;
    const totalFinal = valorDado + valorHab + valorCaract + valorBonif;

    // Sumandos de la operación; una etiqueta null oculta ese sumando
    const sumandos = [`${valorDado} (Dado)`];
    if (resultado.etiquetaHabilidad !== null) sumandos.push(`+ ${valorHab} (${resultado.etiquetaHabilidad ?? "Hab."})`);
    if (resultado.etiquetaCaracteristica !== null) sumandos.push(`+ ${valorCaract} (${resultado.etiquetaCaracteristica ?? "Caract."})`);
    if (valorBonif) sumandos.push(`${valorBonif > 0 ? "+" : "−"} ${Math.abs(valorBonif)} (${resultado.etiquetaBonificador})`);

    // Bloque de daño (ataques)
    let dannoHtml = "";
    if (resultado.danno) {
        const { total, desglose = [], notas = [] } = resultado.danno;
        dannoHtml = `
        <div class="popup-danno">
            <div class="popup-operacion">${desglose.join(" + ")}</div>
            <div class="popup-total-wrapper">
                <span class="popup-total-label">DAÑO</span>
                <span class="popup-total-valor">${total}</span>
            </div>
            ${notas.map(nota => `<div class="popup-nota">${nota}</div>`).join("")}
        </div>`;
    }

    popup.innerHTML = `
        <div class="popup-header">
            <strong class="popup-titulo">${resultado.titulo}</strong>
            <span class="popup-modo modo-${resultado.ventajaTirada}">${nombreModo}</span>
        </div>
        ${resultado.subtitulo ? `<div class="popup-subtitulo">${resultado.subtitulo}</div>` : ""}
        ${badgeEspecialHtml}
        <div class="popup-dados-contenedor">
            <span class="popup-dados-label">Dados:</span>
            <div class="popup-dados-chips">${dadosHtml}</div>
        </div>
        <div class="popup-operacion">
            ${sumandos.join(" ")}
        </div>
        <div class="popup-total-wrapper">
            <span class="popup-total-label">${resultado.etiquetaTotal ?? "TOTAL"}</span>
            <span class="popup-total-valor">${totalFinal}</span>
        </div>
        ${dannoHtml}
    `;

    // Añadir al contenedor
    contenedor.appendChild(popup);

    // Auto-eliminar a los 4.5 segundos con animación de salida
    /*setTimeout(() => {
        popup.classList.add('fade-out');
        popup.addEventListener('animationend', () => popup.remove());
    }, 4500);*/

    // Cerrar de inmediato al hacer click
    popup.addEventListener('click', () => popup.remove());
}