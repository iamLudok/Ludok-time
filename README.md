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

**Los vídeos de YouTube viven en su propia pestaña** y no aparecen en la biblioteca, el diario ni
en los contadores de series/pelis. Es a propósito: al importar el historial pueden entrar miles y
sepultarían el resto.

## El Diario

Es el historial cronológico de **qué has visto o leído y cuándo** (el equivalente al feed de TV
Time). Solo registra consumo real: episodio visto, película vista, libro terminado. No apunta
altas, valoraciones ni cambios de estado — eso sería ruido, no historial.

### Recuperando tu historial antiguo (p. ej. de TV Time)

Si vas a marcar de golpe cosas que ya viste **antes** de usar esta app, activa primero
**Ajustes → Puesta al día**. Mientras esté encendido, marcar algo como visto sigue actualizando
el progreso y el estado con normalidad, pero **no** escribe en el diario — así no queda como si
hubieras visto 50 episodios en el mismo minuto. Apágalo cuando termines de ponerte al día.

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
- **Tus datos** (biblioteca, episodios vistos, valoraciones, diario, API key) están en
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
  lib/         # lógica: db (Dexie), tmdb, backup, library, settings, persistencia
  components/  # ItemCard, EpisodeList, DetailControls, BackupBanner, RatingInput
  pages/       # Library, Search, SeriesDetail, MovieDetail, Timeline, Stats, Settings
  types.ts     # modelo de datos
```

## Próximos pasos (fuera del MVP)

- 📖 Libros (Open Library) y ▶️ vídeos de YouTube (oEmbed + importar de Google Takeout).
- Auto-guardado de la copia en una carpeta/nube propia.
