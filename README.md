# Ludok Time 🎬📺

Tu app personal para apuntar todo lo que ves y lees: **series, películas, libros y vídeos de
YouTube**. Nació porque TV Time se cayó y no quiero volver a perder mi historial: aquí
**los datos son míos** y viven en mi dispositivo.

- **Local-first**: todo se guarda en el navegador (IndexedDB). Sin servidores, sin cuentas.
- **A prueba de pérdidas**: exporta/importa una copia JSON cuando quieras y un aviso te recuerda
  hacer copia si llevas mucho sin hacerla.
- **PWA**: se instala en el móvil como una app y funciona sin conexión.
- **Catálogo TMDB**: buscas series/pelis con sus carátulas, temporadas y episodios.

## Puesta en marcha

```bash
npm install
npm run dev      # desarrollo en http://localhost:5173
npm run build    # build de producción en dist/
npm run preview  # sirve el build (para probar la PWA instalable)
```

## Qué puedes registrar

| Tipo | Fuente | Cómo se sigue el progreso |
|---|---|---|
| 📺 Series | TMDB | Episodio a episodio, con "ver siguiente" |
| 🎬 Películas | TMDB | Vista / pendiente |
| 📖 Libros | Open Library (sin API key) | **Por página**, con % leído |
| ▶️ Vídeos de YouTube | Enlace, a mano o import de Takeout | Sección propia |

**Los vídeos de YouTube viven en su propia pestaña** y no aparecen en la biblioteca ni en los
contadores de series/pelis. Es a propósito: al importar el historial pueden entrar miles y
sepultarían el resto.

## Vista previa antes de añadir

Al buscar, cada resultado indica si es **📺 Serie** o **🎬 Película** y solo tiene un botón,
"👁 Ver detalles" (nada de "Añadir" directo — siempre puedes añadirlo después de ver la ficha).
Igual desde "También te puede gustar", tocando la carátula. La vista previa muestra datos de TMDB
en vivo: sinopsis, temporadas con su número de episodios, y dónde verla. Nada se guarda hasta que
pulsas "Añadir" dentro de la ficha previa; si el título ya está en tu biblioteca, en vez de
añadir verás un botón para ir directo a su ficha real.

## Continuar viendo

En la Biblioteca, arriba de todo, aparece un bloque con tus series en estado "Viendo" y su
próximo episodio, con un botón para marcarlo visto ahí mismo — sin entrar en la ficha.

## Fechas de "visto" (editables)

No hay un diario global: cada episodio, película o libro muestra su propia fecha de "visto"
(junto al episodio, en su ficha). Al marcar algo se guarda "hoy", pero puedes tocar la fecha
(✏️) y ponerla a mano si sabes que lo viste hace tiempo — útil al recuperar historial antiguo
(p. ej. de TV Time) sin que quede como si lo hubieras visto todo en el mismo minuto.

## Dónde verla y próximo episodio

En la ficha de cada serie/película se consulta TMDB en vivo (datos de JustWatch) para mostrar en
qué plataformas está disponible en España — con suscripción, alquiler o compra.

En la ficha de una serie que sigue en emisión (justo debajo de la cabecera) siempre verás algún
aviso sobre el próximo episodio:

- **Cuenta atrás** ("en 12 días", "mañana"…) si TMDB ya anuncia fecha y aún no lo tienes
  localmente, con un botón **🔄 Actualizar** para traerlo en cuanto esté disponible.
- **"Sin fecha anunciada todavía"** si la serie sigue activa pero TMDB no tiene el dato aún —
  para que quede claro que la app sí lo ha comprobado, no que algo esté roto.
- **Nada** si la serie ya terminó/canceló, o si el próximo episodio ya está en tu lista (en ese
  caso lo gestiona el botón "▶ Ver siguiente").

## También te puede gustar

En la ficha de cada serie/película, una fila de carátulas parecidas por género/temática (TMDB
"similar"), filtradas por **idioma original** para no mezclar cosas de fuera de sitio (p. ej. que
un anime japonés recomiende series occidentales solo porque comparten género), y excluyendo lo que
ya tienes en tu biblioteca. Se pueden añadir directamente con el botón "+", sin tener que ir a Buscar.

### Importar tu historial de YouTube

1. Ve a [Google Takeout](https://takeout.google.com/) y pide **solo YouTube → historial**, en **JSON**.
2. En la app: pestaña **Vídeos → Subir watch-history.json**.

Se ignoran anuncios y vídeos borrados, no se duplican los repetidos y se respeta la fecha real en
que viste cada uno.

## Configurar la API key de TMDB (gratis, 2 minutos)

La búsqueda usa [The Movie Database](https://www.themoviedb.org). Necesitas una API key propia:

1. Crea una cuenta en <https://www.themoviedb.org>.
2. Ve a **Ajustes → API**: <https://www.themoviedb.org/settings/api>.
3. Solicita una API key (uso personal). Copia la **API Key (v3 auth)**.
4. En la app, entra en **Ajustes → API de TMDB**, pega la key y guarda.

La key se guarda solo en tu dispositivo (se incluye en las copias de seguridad).

## No perder los datos nunca (importante)

Los datos viven en el almacenamiento del navegador. Para que estén a salvo:

1. La app pide **almacenamiento persistente** al arrancar (reduce que el navegador los borre).
   Puedes ver el estado en **Ajustes → Almacenamiento**.
2. Haz **copias de seguridad** a menudo: **Ajustes → Exportar copia**. Guarda el fichero
   `ludok-time-backup-*.json` en tu nube o carpeta de Archivos. En el móvil se abre el menú de
   compartir para mandarlo donde quieras.
3. Para restaurar (móvil nuevo, borrado accidental…): **Ajustes → Importar copia**.
   - *Reemplazar*: deja exactamente lo que hay en la copia.
   - *Fusionar*: añade lo de la copia sin borrar lo que ya tengas.

## Despliegue (GitHub Pages)

La app se publica sola en <https://iamludok.github.io/Ludok-time/> con cada `push` a `master`,
mediante el workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

Requisito (una sola vez): en GitHub → **Settings → Pages → Build and deployment → Source**,
elegir **GitHub Actions** (no "Deploy from a branch").

> Importante: lo que se publica es la carpeta `dist/` (el build), no el código fuente.
> Como Pages sirve la app en el subdirectorio `/Ludok-time/`, `vite.config.ts` fija `base` a esa
> ruta y el router usa `basename`. El build genera además un `404.html` para que los enlaces
> directos (p. ej. `/Ludok-time/settings`) funcionen al recargar.

## Cómo se actualiza la app (y por qué tus datos no corren peligro)

El código y los datos viven en sitios separados:

- **El código** (HTML/JS) lo sirve el service worker → es lo que se actualiza.
- **Tus datos** (biblioteca, episodios vistos, valoraciones, API key) están en
  **IndexedDB** → una actualización **no los toca nunca**.

Es decir: puedes actualizar mil veces sin perder nada. Está verificado desplegando una versión
nueva encima de una instalación con datos y comprobando que seguían intactos.

Detalle importante del funcionamiento de las PWA:

> Tras publicar una versión nueva, **la primera vez que abres la app sigues viendo la vieja**.
> El service worker se descarga la nueva por detrás y entra **en la siguiente apertura**.
> Es normal, no es un fallo. Si tienes prisa, recarga con `Ctrl+Shift+R`.

Para que no te quedes semanas con una versión antigua, [`src/lib/updates.ts`](src/lib/updates.ts)
comprueba si hay versión nueva **cada hora y cada vez que vuelves a la app**.

Además, las notas y etiquetas de cada título **se guardan solas** al salir del campo, así que ni
siquiera se pierde texto a medio escribir.

## Instalar como app (PWA)

Abre la web en el navegador del móvil y usa **"Añadir a pantalla de inicio"** / **"Instalar app"**.
En escritorio (Chrome/Edge) aparece un icono de instalar en la barra de direcciones.

> Nota: para que la PWA funcione bien necesita servirse por HTTPS (o `localhost`). Si la despliegas,
> usa un hosting con HTTPS (Netlify, Vercel, GitHub Pages, tu propio servidor con TLS…).

## Estructura

```
src/
  lib/         # lógica: db (Dexie), tmdb, openlibrary, youtube, backup, library, settings
  components/  # ItemCard, EpisodeList, ContinueWatching, WhereToWatch, NextEpisodeCountdown…
  pages/       # Library, Search, Preview, SeriesDetail, MovieDetail, BookDetail, Videos, Stats, Settings
  types.ts     # modelo de datos
```

## Próximos pasos

- Auto-guardado de la copia en una carpeta/nube propia.
