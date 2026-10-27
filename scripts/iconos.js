// scripts/iconos.js
// Iconos SAO en SVG en línea para estados y tipos de daño.
// Mismo estilo que los ficheros de imgs/ (círculo con glifo, partes secundarias al 71 %),
// pero los colores salen de variables CSS para poder tener tres variantes sin ficheros extra:
//   normal  → fondo gris, glifo blanco (por defecto)
//   hover   → fondo blanco, glifo dorado
//   activo  → fondo del color del estado (--color), glifo --color-glifo
// Clases dentro de cada glifo (estilos en secciones.css, bloque "Iconos SAO"):
//   p = relleno principal, s = relleno secundario (71 %), f = recorte con el color de fondo,
//   t = trazo del glifo, o = opacidad secundaria, tf = trazo grueso con el color de fondo (separador).

function estrella(cx, cy, r, clase = "p") {
    const puntos = Array.from({ length: 10 }, (_, i) => {
        const angulo = (-90 + i * 36) * Math.PI / 180;
        const radio = i % 2 ? r * 0.5 : r;
        return `${(cx + radio * Math.cos(angulo)).toFixed(1)},${(cy + radio * Math.sin(angulo)).toFixed(1)}`;
    });
    return `<polygon class="${clase}" points="${puntos.join(" ")}"/>`;
}

function poligonoEstrella(cx, cy, r, rInterior, puntas, clase = "p") {
    const puntos = Array.from({ length: puntas * 2 }, (_, i) => {
        const angulo = (-90 + i * 180 / puntas) * Math.PI / 180;
        const radio = i % 2 ? rInterior : r;
        return `${(cx + radio * Math.cos(angulo)).toFixed(1)},${(cy + radio * Math.sin(angulo)).toFixed(1)}`;
    });
    return `<polygon class="${clase}" points="${puntos.join(" ")}"/>`;
}

/* Las armas se dibujan en vertical (punta arriba) y se giran 45° como el icono de Combate */
const enDiagonal = (contenido) => `<g transform="rotate(45 50 50)">${contenido}</g>`;

const brazoCopo = (angulo) =>
    `<path class="t" transform="rotate(${angulo} 50 50)" d="M50 18V82M41 25L50 34L59 25M41 75L50 66L59 75"/>`;

const GLIFOS = {
    fuego: `
        <path class="s" d="M50 16C59 31 73 40 71 60C70 74 61 83 50 83C39 83 30 74 29 62C28 49 37 43 40 32C44 40 46 45 47 50C50 39 53 29 50 16Z"/>
        <path class="p" d="M50 48C57 57 62 62 61 70C60 77 55 82 50 82C45 82 40 77 40 70C40 63 46 58 50 48Z"/>`,
    electricidad: `
        <polygon class="p" points="58,14 28,56 47,56 40,86 72,42 53,42"/>
        <polygon class="s" points="58,14 28,56 47,56"/>`,
    hielo: brazoCopo(0) + brazoCopo(60) + brazoCopo(120),
    luz: `
        <circle class="p" cx="50" cy="50" r="14"/>
        <path class="t o" d="M50 16V26M50 74V84M16 50H26M74 50H84M26 26L33 33M67 67L74 74M74 26L67 33M33 67L26 74"/>`,
    oscuridad: `
        <path class="p" d="M56 18A32 32 0 1 0 82 64A26 26 0 0 1 56 18Z"/>
        ${estrella(70, 30, 8, "s")}`,
    paralisis: `
        <path class="t" d="M38 46V37A12 12 0 0 1 62 37V46"/>
        <rect class="p" x="30" y="45" width="40" height="32" rx="5"/>
        <polygon class="f" points="53,50 43,63 50,63 47,73 57,59 50,59"/>`,
    veneno: `
        <rect class="s" x="43" y="21" width="14" height="20"/>
        <rect class="p" x="39" y="17" width="22" height="6" rx="2"/>
        <circle class="p" cx="50" cy="60" r="22"/>
        <circle class="f" cx="43" cy="63" r="4"/>
        <circle class="f" cx="56" cy="54" r="3"/>
        <circle class="f" cx="54" cy="69" r="5"/>`,
    hemorragia: `
        <path class="p" d="M44 18C44 18 24 47 24 61A20 20 0 0 0 64 61C64 47 44 18 44 18Z"/>
        <path class="s" d="M70 44C70 44 60 58 60 64A10 10 0 0 0 80 64C80 58 70 44 70 44Z"/>`,
    regeneracion: `
        <path class="p" d="M50 80C22 61 19 41 31 32C40 26 47 30 50 37C53 30 60 26 69 32C81 41 78 61 50 80Z"/>
        <rect class="f" x="46" y="40" width="8" height="24" rx="1"/>
        <rect class="f" x="38" y="48" width="24" height="8" rx="1"/>`,
    aturdido: `
        <ellipse class="t o" cx="50" cy="54" rx="30" ry="13"/>
        ${estrella(50, 38, 13)}
        ${estrella(27, 64, 11)}
        ${estrella(73, 64, 11)}`,
    cegado: `
        <path class="p" d="M16 50C30 28 70 28 84 50C70 72 30 72 16 50Z"/>
        <circle class="f" cx="50" cy="50" r="11"/>
        <path class="tf" d="M27 77L73 23"/>
        <path class="t" d="M27 77L73 23"/>`,
    dormido: `
        <path class="t" d="M24 48H50L24 76H50"/>
        <path class="t o" d="M56 30H72L56 48H72"/>
        <path class="t o" d="M72 14H82L72 26H82"/>`,
    wither: `
        <path class="p" d="M50 20C34 20 26 32 26 45C26 54 31 60 36 63V76H64V63C69 60 74 54 74 45C74 32 66 20 50 20Z"/>
        <circle class="f" cx="40" cy="46" r="7"/>
        <circle class="f" cx="60" cy="46" r="7"/>
        <polygon class="f" points="50,54 46,62 54,62"/>
        <rect class="f" x="42" y="67" width="3" height="9"/>
        <rect class="f" x="48.5" y="67" width="3" height="9"/>
        <rect class="f" x="55" y="67" width="3" height="9"/>`,
    embriaguez: `
        <rect class="p" x="28" y="34" width="32" height="44" rx="5"/>
        <path class="t" d="M60 44H67A7 7 0 0 1 74 51V60A7 7 0 0 1 67 67H60"/>
        <rect class="f" x="35" y="44" width="4" height="26" rx="2"/>
        <rect class="f" x="47" y="44" width="4" height="26" rx="2"/>
        <path class="s" d="M25 37C24 27 35 24 40 29C42 22 53 22 55 29C60 24 68 29 63 37Z"/>`,
    fisico: `
        <path class="p" d="M76 15L85 24L47 62L38 53Z"/>
        <path class="s" d="M76 15L85 24L42 58Z"/>
        <path class="t" d="M30 49L51 70"/>
        <path class="t" d="M37 63L28 72"/>
        <circle class="p" cx="24" cy="76" r="6"/>`,
    elemental: `
        <polygon class="p" points="48,16 55,43 82,50 55,57 48,84 41,57 14,50 41,43"/>
        <polygon class="s" points="76,14 79,21 86,24 79,27 76,34 73,27 66,24 73,21"/>
        <polygon class="s" points="74,62 76,67 81,69 76,71 74,76 72,71 67,69 72,67"/>`,

    /* Armas y escudos (botón Usar); claves = tipos de ARMAS en equipamiento.js */
    cuchillo: enDiagonal(`
        <polygon class="p" points="45,62 45,36 55,24 55,62"/>
        <polygon class="s" points="50,30 55,24 55,62 50,62"/>
        <rect class="p" x="38" y="62" width="24" height="5" rx="2"/>
        <rect class="p" x="46" y="67" width="8" height="18" rx="3"/>`),
    espada: enDiagonal(`
        <polygon class="p" points="45,62 45,22 50,12 55,22 55,62"/>
        <polygon class="s" points="50,12 55,22 55,62 50,62"/>
        <rect class="p" x="35" y="62" width="30" height="5" rx="2"/>
        <rect class="p" x="47" y="67" width="6" height="14"/>
        <circle class="p" cx="50" cy="84" r="4.5"/>`),
    estoque: enDiagonal(`
        <polygon class="p" points="48,62 48,18 50,10 52,18 52,62"/>
        <path class="p" d="M37 60A13 13 0 0 0 63 60Z"/>
        <path class="s" d="M50 60H63A13 13 0 0 1 50 73Z"/>
        <rect class="p" x="47.5" y="70" width="5" height="12"/>
        <circle class="p" cx="50" cy="84" r="4"/>`),
    maza: enDiagonal(`
        <rect class="p" x="46.5" y="40" width="7" height="46" rx="3"/>
        ${poligonoEstrella(50, 30, 19, 12, 8)}
        <circle class="s" cx="50" cy="30" r="9"/>`),
    lanza: enDiagonal(`
        <rect class="p" x="47.5" y="30" width="5" height="58" rx="2"/>
        <polygon class="p" points="50,8 58,24 50,34 42,24"/>
        <polygon class="s" points="50,8 58,24 50,34"/>
        <rect class="s" x="44" y="34" width="12" height="4" rx="2"/>`),
    espadon: enDiagonal(`
        <polygon class="p" points="43,64 43,20 50,8 57,20 57,64"/>
        <polygon class="s" points="50,8 57,20 57,64 50,64"/>
        <rect class="p" x="30" y="63" width="40" height="6" rx="3"/>
        <rect class="p" x="46.5" y="69" width="7" height="16"/>
        <circle class="p" cx="50" cy="88" r="5"/>`),
    martillo_guerra: enDiagonal(`
        <rect class="p" x="46.5" y="34" width="7" height="54" rx="3"/>
        <rect class="p" x="28" y="16" width="44" height="20" rx="3"/>
        <rect class="s" x="28" y="16" width="12" height="20" rx="3"/>
        <polygon class="s" points="72,20 82,26 72,32"/>`),
    hacha: enDiagonal(`
        <rect class="p" x="46.5" y="14" width="7" height="74" rx="3"/>
        <path class="p" d="M53 20C72 18 82 32 80 50C72 43 63 42 53 46Z"/>
        <path class="s" d="M53 33C64 31 74 36 80 50C72 43 63 42 53 46Z"/>
        <polygon class="s" points="46.5,26 36,30 46.5,36"/>`),
    escudo: `
        <path class="p" d="M50 16L76 24V46C76 64 64 76 50 84C36 76 24 64 24 46V24Z"/>
        <path class="s" d="M50 16L76 24V46C76 64 64 76 50 84Z"/>
        <path class="t" d="M50 30V66M38 44H62" style="stroke:var(--fondo)"/>`,
    gran_escudo: `
        <path class="p" d="M27 16H73V58C73 72 63 81 50 86C37 81 27 72 27 58Z"/>
        <path class="s" d="M50 16H73V58C73 72 63 81 50 86Z"/>
        <circle class="f" cx="50" cy="48" r="9"/>
        <circle class="p" cx="50" cy="48" r="4"/>`,
    /* Sonido (botón de silencio de la cabecera) */
    sonido: `
        <polygon class="p" points="20,40 34,40 52,24 52,76 34,60 20,60"/>
        <path class="t o" d="M62 38A16 16 0 0 1 62 62"/>
        <path class="t o" d="M70 29A28 28 0 0 1 70 71"/>`,
    silencio: `
        <polygon class="p" points="20,40 34,40 52,24 52,76 34,60 20,60"/>
        <path class="t" d="M62 40L80 60M80 40L62 60"/>`,

    /* Accesorios */
    accesorio: `
        <circle class="t" cx="50" cy="60" r="18" style="stroke-width:8"/>
        <polygon class="p" points="50,18 61,30 50,42 39,30"/>
        <polygon class="s" points="50,18 61,30 50,42"/>`,
    bloqueado: `
        <path class="t" d="M38 46V37A12 12 0 0 1 62 37V46"/>
        <rect class="p" x="30" y="45" width="40" height="32" rx="5"/>
        <circle class="f" cx="50" cy="57" r="4.5"/>
        <rect class="f" x="48" y="58" width="4" height="11" rx="1"/>`,

    /* Valores de combate (defensa usa "escudo" y daño CaC usa "espada") */
    iniciativa: `
        <rect class="p" x="28" y="14" width="44" height="6" rx="2"/>
        <rect class="p" x="28" y="80" width="44" height="6" rx="2"/>
        <path class="t" style="stroke-width:5" d="M35 20C35 38 47 42 47 50C47 58 35 62 35 80M65 20C65 38 53 42 53 50C53 58 65 62 65 80"/>
        <polygon class="s" points="40,30 60,30 50,44"/>
        <polygon class="p" points="38,78 62,78 50,64"/>`,
    armadura: `
        <path class="p" d="M30 22L42 18C44 24 56 24 58 18L70 22L80 36L70 42V80H30V42L20 36Z"/>
        <path class="s" d="M50 23C55 23 57 21 58 18L70 22L80 36L70 42V80H50Z"/>
        <path class="t" style="stroke:var(--fondo);stroke-width:4" d="M38 54H62M38 66H62"/>`,
    movimiento: `
        <path class="p" d="M36 16H56V54L76 62C82 64 84 70 84 76V78H36Z"/>
        <rect class="s" x="33" y="14" width="26" height="9" rx="2"/>
        <rect class="s" x="36" y="78" width="48" height="7" rx="2"/>`,
    distancia: enDiagonal(`
        <rect class="p" x="48.5" y="24" width="3" height="58"/>
        <polygon class="p" points="50,8 59,26 41,26"/>
        <polygon class="s" points="48.5,70 39,80 39,90 48.5,80"/>
        <polygon class="s" points="51.5,70 61,80 61,90 51.5,80"/>`),
    magia: `
        ${enDiagonal(`<rect class="p" x="46.5" y="42" width="7" height="46" rx="3"/>
        <rect class="s" x="46.5" y="42" width="7" height="9"/>`)}
        ${estrella(38, 36, 15)}
        ${estrella(70, 22, 7, "s")}
        ${estrella(18, 66, 6, "s")}`,
    aguante: `
        <path class="p" d="M50 80C22 61 19 41 31 32C40 26 47 30 50 37C53 30 60 26 69 32C81 41 78 61 50 80Z"/>
        <path class="tf" style="stroke-width:5;stroke-linejoin:round" d="M22 52H37L43 41L51 63L57 50H78"/>`,
    perspicacia: `
        <path class="p" d="M54 16C38 16 26 28 26 44C26 52 29 58 32 62V84H56V75H64C68 75 70 71 70 67V59L77 55L70 46C70 28 66 16 54 16Z"/>
        <path class="f" d="M48 30L59 34V45C59 51 55 56 48 59C41 56 37 51 37 45V34Z"/>`,
    percepcion: `
        <path class="p" d="M14 50C29 27 71 27 86 50C71 73 29 73 14 50Z"/>
        <circle class="f" cx="50" cy="50" r="14"/>
        <circle class="p" cx="50" cy="50" r="7"/>
        <circle class="f" cx="54" cy="46" r="2.5"/>`,

    /* Tipos de objeto (el equipamiento usa el icono de su arma, "armadura" o "accesorio") */
    comida: `
        <path class="p" d="M50 34C40 26 24 30 24 50C24 70 38 84 50 80C62 84 76 70 76 50C76 30 60 26 50 34Z"/>
        <path class="s" d="M50 34C60 26 76 30 76 50C76 70 62 84 50 80Z"/>
        <path class="t" d="M50 34C50 26 53 20 58 16"/>
        <path class="p" d="M53 26C57 17 66 14 73 16C71 24 63 28 53 26Z"/>`,
    pocion: `
        <rect class="p" x="41" y="12" width="18" height="8" rx="2"/>
        <path class="p" d="M44 20H56V38L74 70C78 78 72 86 64 86H36C28 86 22 78 26 70L44 38Z"/>
        <path class="f" d="M33 62H67L71 71C73 76 70 80 65 80H35C30 80 27 76 29 71Z"/>
        <circle class="s" cx="45" cy="70" r="3"/>
        <circle class="s" cx="56" cy="74" r="2.5"/>`,
    cristal: `
        <polygon class="p" points="50,12 72,34 50,88 28,34"/>
        <polygon class="s" points="50,12 72,34 50,88"/>
        <path class="tf" style="stroke-width:4" d="M28 34H72"/>`,
    material: `
        <polygon class="p" points="50,16 80,32 80,68 50,84 20,68 20,32"/>
        <polygon class="s" points="50,50 80,32 80,68 50,84"/>
        <path class="tf" style="stroke-width:4;stroke-linejoin:round" d="M20 32L50 50L80 32M50 50V84"/>`,
    arrojadiza: `
        ${enDiagonal(`<polygon class="p" points="50,10 58,28 56,56 44,56 42,28"/>
        <polygon class="s" points="50,10 58,28 56,56 50,56"/>
        <rect class="p" x="38" y="56" width="24" height="6" rx="2"/>
        <rect class="p" x="46" y="62" width="8" height="18" rx="3"/>`)}
        <path class="t o" d="M14 66L28 52M22 80L34 68M34 88L42 80"/>`,

    /* Acciones de los objetos y menús */
    inventario: `
        <path class="p" d="M30 38H70L78 80C79 84 76 86 72 86H28C24 86 21 84 22 80Z"/>
        <path class="t" d="M40 38V30C40 20 60 20 60 30V38"/>
        <rect class="s" x="26" y="34" width="48" height="9" rx="3"/>`,
    baul: `
        <rect class="p" x="16" y="42" width="68" height="38" rx="4"/>
        <path class="s" d="M16 42V36C16 26 24 20 34 20H66C76 20 84 26 84 36V42Z"/>
        <rect class="f" x="16" y="42" width="68" height="4"/>
        <rect class="f" x="43" y="44" width="14" height="16" rx="2"/>`,
    descartar: `
        <rect class="p" x="22" y="22" width="56" height="8" rx="2"/>
        <rect class="s" x="41" y="14" width="18" height="8" rx="2"/>
        <path class="p" d="M28 34H72L67 84H33Z"/>
        <path class="tf" style="stroke-width:4" d="M42 42V76M58 42V76"/>`,
    editar: enDiagonal(`
        <rect class="s" x="41" y="10" width="18" height="10" rx="3"/>
        <rect class="p" x="41" y="22" width="18" height="46"/>
        <polygon class="p" points="41,70 59,70 50,88"/>
        <polygon class="f" points="47,80 53,80 50,86"/>`),
    usar: `
        <circle class="t o" cx="50" cy="50" r="27"/>
        <circle class="p" cx="50" cy="50" r="15"/>`,
    amigos: `
        <circle class="s" cx="64" cy="34" r="11"/>
        <path class="s" d="M50 76C50 60 56 52 64 52C74 52 82 60 82 76Z"/>
        <circle class="p" cx="40" cy="40" r="13"/>
        <path class="p" d="M16 82C16 64 27 56 40 56C53 56 64 64 64 82Z"/>`,
    artes: `
        ${estrella(48, 54, 30)}
        ${estrella(78, 22, 9, "s")}
        ${estrella(20, 22, 6, "s")}`,
    descanso: `
        <path class="s" d="M50 14C57 26 68 33 66 48C65 59 58 64 50 64C42 64 35 59 34 50C33 40 40 35 42 26C45 32 47 36 48 40C50 31 52 24 50 14Z"/>
        <path class="p" d="M50 38C55 45 58 49 58 54C57 60 54 63 50 63C46 63 43 60 43 54C43 49 47 45 50 38Z"/>
        <path class="t" style="stroke-width:9" d="M24 84L76 68M24 68L76 84"/>`,

    /* Reliquia: gema tallada */
    reliquia: `
        <polygon class="s" points="34,20 66,20 80,38 20,38"/>
        <polygon class="p" points="20,41 80,41 50,84"/>
        <path class="tf" style="stroke-width:3" d="M38 41L50 82L62 41"/>
        <path class="t o" style="stroke-width:3" d="M50 8V14M30 12L34 17M70 12L66 17"/>`,

    /* Botones de las ventanas: aceptar (anillo) y cancelar (aspa), con su sombra */
    aceptar: `
        <circle cx="51" cy="54" r="17" style="fill:none;stroke:rgba(0,0,0,.35);stroke-width:12"/>
        <circle class="t" cx="50" cy="50" r="17" style="stroke-width:12"/>`,
    cancelar: `
        <path d="M35 38L66 69M66 38L35 69" style="fill:none;stroke:rgba(0,0,0,.35);stroke-width:12"/>
        <path class="t" d="M34 34L66 66M66 34L34 66" style="stroke-width:12;stroke-linecap:butt"/>`,

    /* Menú de opciones: engranaje, cargar y guardar personaje */
    ajustes: `
        ${[0, 45, 90, 135].map(angulo => `<rect class="p" x="43" y="15" width="14" height="70" rx="3" transform="rotate(${angulo} 50 50)"/>`).join("")}
        <circle class="p" cx="50" cy="50" r="25"/>
        <circle class="f" cx="50" cy="50" r="10"/>`,
    cargar: `
        <path class="p" d="M32 23H55V36H68V77H32Z"/>
        <path class="s" d="M58 23L68 33H58Z"/>
        <path class="f" d="M50 40L62 52H54V69H46V52H38Z"/>`,
    guardar: `
        <path class="p" d="M69 67.77v7.23h-7.23l7.23-7.23zm0-42.77v35.699l-14.302 14.301h-23.698v-50h38zm-19 25.25h-14v1.5h14v-1.5zm14-5.5h-28v1.5h28v-1.5zm0-5.5h-28v1.5h28v-1.5zm0-5.5h-28v1.5h28v-1.5zm-10.376 47.451l-2.917 1.326 1.326-2.917 1.591 1.591zm25.014-24.483l-2.121-2.121-24.042 24.041 2.121 2.121 24.042-24.041z"/>`,

    /* Zonas y descansos */
    mapa: `
        <polygon class="p" points="16,28 37,20 37,74 16,82"/>
        <polygon class="s" points="39,20 61,28 61,82 39,74"/>
        <polygon class="p" points="63,28 84,20 84,74 63,82"/>
        <path class="tf" style="stroke-width:4" d="M48 38L54 44M54 38L48 44"/>`,
    pueblo: `
        <polygon class="s" points="50,44 66,26 82,44"/>
        <rect class="s" x="54" y="44" width="24" height="38"/>
        <rect class="f" x="62" y="52" width="8" height="8" rx="1"/>
        <polygon class="p" points="14,56 36,36 58,56"/>
        <rect class="p" x="19" y="56" width="34" height="26"/>
        <rect class="f" x="31" y="64" width="10" height="18" rx="2"/>`,
    casa: `
        <rect class="s" x="62" y="22" width="10" height="20"/>
        <polygon class="p" points="14,52 50,20 86,52"/>
        <rect class="p" x="24" y="50" width="52" height="32"/>
        <rect class="f" x="44" y="60" width="12" height="22" rx="2"/>`,
    cama: `
        <rect class="p" x="14" y="28" width="9" height="54" rx="2"/>
        <rect class="s" x="27" y="46" width="18" height="11" rx="4"/>
        <rect class="s" x="47" y="44" width="39" height="13" rx="3"/>
        <rect class="p" x="14" y="58" width="72" height="13" rx="2"/>
        <rect class="p" x="77" y="70" width="9" height="12" rx="2"/>
        <path class="t o" style="stroke-width:4" d="M58 18H70L58 32H70"/>`,

    otros: enDiagonal(`
        <rect class="p" x="46.5" y="24" width="7" height="64" rx="3"/>
        <path class="p" d="M18 34C34 14 66 14 82 34L78 38C62 26 38 26 22 38Z"/>
        <path class="s" d="M50 19C64 19 74 25 82 34L78 38C70 31 61 27 50 27Z"/>`)
};

/**
 * Devuelve el SVG de un icono SAO.
 * @param {string} clave nombre del glifo en GLIFOS
 */
export function tieneIconoSao(clave) {
    return Boolean(GLIFOS[clave]);
}

export function iconoSao(clave) {
    const glifo = GLIFOS[clave] ?? GLIFOS.elemental;
    return `<svg class="icono-sao" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle class="ic-fondo" cx="50" cy="50" r="50"/>${glifo}</svg>`;
}
