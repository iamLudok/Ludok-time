# Ludok Time 🎬📺

Tu app personal para apuntar todo lo que ves: **series, películas y anime** (con hueco para
libros y YouTube más adelante). Nació porque TV Time se cayó y no quiero volver a perder mi
historial: aquí **los datos son míos** y viven en mi dispositivo.

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
