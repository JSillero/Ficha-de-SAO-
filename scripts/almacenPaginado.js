/* Almacén paginado sin DOM: lo comparten los compendios del máster (de NPC en compendio.js, de objetos en
 * compendioObjetos.js).
 * - Entradas: { id, pagina, ...lo que devuelva cargarEntrada }. Al guardar (caché, nube, exportar) cada entrada
 *   se reduce a sus camposTexto (más el id).
 * - Páginas: para no pasar el límite de 1 MB de un documento de Firestore, las entradas se reparten en páginas
 *   de menos de tamanoMaxPagina bytes. Una nueva va a la última página; si no cabe, se abre otra. Solo se suben
 *   las páginas cambiadas (cambiadas).
 * - Caché en localStorage (clave) = { actualizado, pendiente, cambiadas, total, entradas, dueno }.
 *   pendiente = hay cambios sin subir. actualizado = hora del último cambio (ms), para saber si manda la copia
 *   local o la de la nube. dueno = uid con el que se sincronizó.
 * cargarEntrada(datos) normaliza una entrada (guardada, de la nube o importada) o devuelve null si no vale. */

// Margen bajo el límite de 1 MiB de Firestore (y bajo las 900 000 letras de firestore.rules)
const TAMANO_MAX_PAGINA = 850000;

const bytes = (texto) => new TextEncoder().encode(texto).length;

export function crearAlmacenPaginado({ clave, cargarEntrada, camposTexto, claveListaAntigua = null }) {
    let tamanoMaxPagina = TAMANO_MAX_PAGINA;
    let estado = null;

    const vacio = () => ({ actualizado: 0, pendiente: false, cambiadas: [], total: 0, entradas: [], dueno: null });
    const cargar = (datos) => {
        const entrada = cargarEntrada(datos);
        if (!entrada) return null;
        return { ...entrada, pagina: Number.isInteger(datos.pagina) && datos.pagina >= 0 ? datos.pagina : 0 };
    };

    function leer() {
        if (estado) return estado;
        try {
            estado = JSON.parse(localStorage.getItem(clave)) ?? null;
        } catch {
            estado = null;
        }
        // Formato anterior del compendio de NPC: la lista se llamaba "plantillas"
        if (estado && claveListaAntigua && !Array.isArray(estado.entradas) && Array.isArray(estado[claveListaAntigua])) {
            estado.entradas = estado[claveListaAntigua];
            delete estado[claveListaAntigua];
        }
        if (!estado || typeof estado !== "object" || !Array.isArray(estado.entradas)) estado = vacio();
        estado.entradas = estado.entradas.map(cargar).filter(Boolean);
        estado.cambiadas = Array.isArray(estado.cambiadas) ? estado.cambiadas.filter(Number.isInteger) : [];
        estado.total = Math.max(Number(estado.total) || 0, ...estado.entradas.map(e => e.pagina + 1), 0);
        return estado;
    }

    /** Guarda la caché. Devuelve false si no cabe en el navegador (sigue en memoria y se puede subir a la nube). */
    function escribir() {
        try {
            localStorage.setItem(clave, JSON.stringify(leer()));
            return true;
        } catch (error) {
            console.warn(`No cabe ${clave} en el navegador:`, error);
            return false;
        }
    }

    const texto = (entrada) => Object.fromEntries(["id", ...camposTexto].map(campo => [campo, entrada[campo]]));
    const tamano = (entrada) => bytes(JSON.stringify(texto(entrada))) + 1;
    const dePagina = (n) => leer().entradas.filter(e => e.pagina === n);
    const tamanoPagina = (n, salvo = null) => dePagina(n).filter(e => e !== salvo).reduce((s, e) => s + tamano(e), 2);
    const porId = (id) => leer().entradas.find(e => e.id === id) ?? null;

    function marcar(...paginas) {
        const d = leer();
        paginas.forEach(n => { if (!d.cambiadas.includes(n)) d.cambiadas.push(n); });
        d.actualizado = Date.now();
        d.pendiente = true;
    }

    /* Página para una entrada de este tamaño: la última si cabe; si no, una nueva */
    function paginaPara(t, salvo = null) {
        const d = leer();
        if (d.total === 0) {
            d.total = 1;
            return 0;
        }
        const ultima = d.total - 1;
        if (tamanoPagina(ultima, salvo) + t <= tamanoMaxPagina) return ultima;
        d.total += 1;
        return d.total - 1;
    }

    function repaginar() {
        const d = leer();
        const totalAntes = d.total;
        d.total = 0;
        d.entradas.forEach(e => { e.pagina = -1; });
        d.entradas.forEach(e => { e.pagina = paginaPara(tamano(e)); });
        marcar(...Array.from({ length: Math.max(totalAntes, d.total) }, (_, i) => i));
        escribir();
    }

    const info = () => {
        const d = leer();
        return { total: d.total, entradas: d.entradas.length, pendiente: d.pendiente, actualizado: d.actualizado, dueno: d.dueno ?? null };
    };

    return {
        entradas: () => leer().entradas,
        porId,
        existe: (id) => Boolean(id && porId(id)),
        info,
        setDueno(uid) {
            leer().dueno = uid ?? null;
            escribir();
        },
        /** Añade una entrada ya cargada (cargarEntrada) y la guarda. Devuelve la entrada, o null si no vale. */
        anadir(datos) {
            const entrada = cargar(datos);
            if (!entrada) return null;
            entrada.pagina = paginaPara(tamano(entrada));
            leer().entradas.push(entrada);
            marcar(entrada.pagina);
            escribir();
            return entrada;
        },
        /** Sustituye los datos de una entrada (mismo id y, si cabe, misma página). null si no existe o no vale. */
        sustituir(id, datos) {
            const anterior = porId(id);
            const nueva = anterior ? cargar({ ...datos, id }) : null;
            if (!nueva) return null;
            const paginaAntes = anterior.pagina;
            Object.assign(anterior, nueva, { pagina: paginaAntes });
            // Si ha crecido y ya no cabe en su página, pasa a la última (o a una nueva)
            if (tamanoPagina(paginaAntes) > tamanoMaxPagina) anterior.pagina = paginaPara(tamano(anterior), anterior);
            marcar(paginaAntes, anterior.pagina);
            escribir();
            return anterior;
        },
        borrar(id) {
            const d = leer();
            const i = d.entradas.findIndex(e => e.id === id);
            if (i < 0) return false;
            const [borrada] = d.entradas.splice(i, 1);
            marcar(borrada.pagina);
            escribir();
            return true;
        },
        repaginar,
        /** Solo para el debug: páginas más pequeñas para comprobar que se reparten */
        setTamanoMaxPagina(t) {
            tamanoMaxPagina = Math.max(1000, Math.trunc(Number(t)) || TAMANO_MAX_PAGINA);
            repaginar();
            return info();
        },

        /* Nube */
        /** Lo que hay que subir: { actualizado, total, paginas: { n: texto }, borrar: [n] } (null si nada) */
        cambiosParaSubir() {
            const d = leer();
            if (!d.pendiente) return null;
            const paginas = {};
            const borrar = [];
            d.cambiadas.forEach(n => {
                if (n < d.total) paginas[n] = JSON.stringify(dePagina(n).map(texto));
                else borrar.push(n);
            });
            return { actualizado: d.actualizado, total: d.total, paginas, borrar };
        },
        /** La subida ha ido bien: ya no hay cambios pendientes (salvo que haya cambiado mientras se subía) */
        marcarSubido(actualizado) {
            const d = leer();
            if (d.actualizado !== actualizado) return;
            d.pendiente = false;
            d.cambiadas = [];
            escribir();
        },
        /** Todas las páginas cambiadas (para subirlo entero, p. ej. si en la nube no hay nada) */
        marcarTodoCambiado() {
            const d = leer();
            d.cambiadas = Array.from({ length: d.total }, (_, i) => i);
            d.pendiente = true;
            if (!d.actualizado) d.actualizado = Date.now();
            escribir();
        },
        /** Pone el de la nube ({ actualizado, paginas: [texto] }) en lugar del local */
        cargarDeNube({ actualizado, paginas }) {
            const entradas = [];
            paginas.forEach((textoPagina, n) => {
                let lista = [];
                try { lista = JSON.parse(textoPagina); } catch { lista = []; }
                (Array.isArray(lista) ? lista : []).forEach(datos => {
                    const e = cargar({ ...datos, pagina: n });
                    if (e) entradas.push(e);
                });
            });
            estado = { actualizado: Number(actualizado) || 0, pendiente: false, cambiadas: [], total: paginas.length, entradas, dueno: estado?.dueno ?? null };
            return escribir();
        },

        /* Exportar / importar */
        /** Todas las páginas, cada una como lista de entradas en texto */
        paginasParaExportar() {
            const d = leer();
            return Array.from({ length: d.total }, (_, n) => dePagina(n).map(texto));
        },
        /** Entrada reducida a lo que se guarda (para importar) */
        texto,
        /** Añade entradas importadas (con id nuevo si ya hay una con el suyo) y reparte las páginas */
        importar(lista, nuevoId) {
            const d = leer();
            let n = 0;
            lista.forEach(datos => {
                const e = cargar({ ...datos, id: porId(datos.id) || !datos.id ? nuevoId() : datos.id });
                if (e) { d.entradas.push(e); n++; }
            });
            repaginar();
            return n;
        }
    };
}
