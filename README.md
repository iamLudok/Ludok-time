# Ludok Time

App Android para apuntar todo lo que veo y leo: **series, películas y libros**.
Nació porque TV Time se cayó y perdí mi historial entero. Aquí **los datos son míos** y viven en mi
móvil.

React Native con Expo SDK 57.

## Lo que manda: no perder datos nunca

Todo lo demás va después.

- Los datos viven en `/data/data/com.ludok.time/`. No hay cuentas ni servidores.
- Copia de seguridad en JSON, exportable e importable en cualquier momento.
- **Copia automática a un Nextcloud propio** al abrir la app estando en WiFi, un fichero por día.
- Aviso en la Biblioteca cuando llevas mucho sin copia.
- La capa de datos **se prueba de verdad**, no solo con tipos (ver más abajo).

## Qué se registra

| Tipo | Fuente | Progreso |
|---|---|---|
| Series | TMDB | Episodio a episodio, con «ver siguiente» y el fotograma de cada uno |
| Películas | TMDB | Vista / pendiente |
| Libros | Open Library, o a mano | Por página, con % leído |

Hubo vídeos de YouTube (por enlace y por import del historial de Takeout). Se quitaron en agosto de
2026 por no usarse. Una copia anterior a eso se sigue pudiendo importar: los vídeos se descartan y
la app dice cuántos.

También hubo manga (MangaDex, con enlace de lectura a inManga). Se quitó en noviembre de 2026
hasta tenerlo mejor pensado. Los que ya estaban apuntados **no se borran**: siguen en la base de
datos y en las copias, solo que la app no los muestra. Por eso se quedan en el esquema las columnas
`currentChapter`, `totalChapters` y `readUrl`, y el tipo `manga`.

## Arranque

```bash
npm install
npm run android      # instala y abre en un móvil conectado por adb
npm run typecheck    # tipos de la app y de los scripts de verificación
npm run verify       # comprueba la capa de datos
```

Hace falta JDK 17, Android SDK con API 36 y `adb`.

> Gradle pide un toolchain de **Java 17**. Si falla con «Cannot find a Java installation matching
> languageVersion=17» teniendo un JDK más nuevo, apunta al que Gradle ya se descargó:
>
> ```bash
> export JAVA_HOME=~/.gradle/jdks/eclipse_adoptium-17-amd64-linux.2
> ```

## Compilar un APK

```bash
npm run build:apk                    # todas las arquitecturas (~96 MB)
./scripts/build-apk.sh --compartir   # solo arm64-v8a (~40 MB), para repartir
# → android/app/build/outputs/apk/release/app-release.apk
```

Tiene que ser **release**, no debug: en debug el JavaScript no va dentro del APK, se carga del
servidor de Metro, así que un APK de debug no funciona sin el ordenador delante.

Instalar: `adb install -r app-release.apk`. Con `-r` se instala **encima** conservando los datos,
siempre que la firma sea la misma.

### ⚠️ El keystore hay que guardarlo como oro

La firma vive en `release.jks` + `keystore.properties`, los dos fuera del repo (en `.gitignore`).

Android solo deja instalar un APK **encima** de otro si van firmados con la misma clave. Si se
pierden, la única salida es **desinstalar** para poner la versión nueva — y desinstalar **borra los
datos de la app**.

Guárdalos junto a las copias de seguridad. Es lo único de este proyecto que no se puede regenerar.

## Verificación de la capa de datos

Los datos son la parte que no puede fallar, así que se prueban ejecutando **el mismo código que
corre en el móvil** contra un SQLite de escritorio:

```bash
npm run verify:data       # formato de copia: ida y vuelta, huecos, volumen, rechazos
npm run verify:library    # reglas: episodios, estados, libros, borrados
npm run verify:migration  # que actualizar de versión no pierde nada
npm run verify:upcoming   # qué series entran en «Próximos»
npm run verify:real ./ludok-time-backup-2026-07-27.json   # con una copia real
```

Esto es posible porque la lógica pide la base de datos a [`src/lib/dbRef.ts`](src/lib/dbRef.ts) en
vez de crearla ella: [`src/lib/db.ts`](src/lib/db.ts) es el **único** fichero que toca
`expo-sqlite`.

Se usa **libsql** y no `better-sqlite3` porque este último es sincrónico y no admite transacciones
asíncronas, mientras que `expo-sqlite` sí: con libsql la semántica coincide con la real.

Estas pruebas ya han pillado fallos que habrían corrompido datos en silencio — por ejemplo un
upsert que mezclaba las filas entre sí al importar.

## Actores

En la ficha de cada serie y película sale su **reparto** (los 12 primeros, que TMDB devuelve
ordenados por relevancia — Sex Education trae 149 personas). Tocando una cara entras en su perfil:
quién es, y todo lo que ha hecho, marcando con ✓ lo que ya tienes en la biblioteca.

Desde ahí puedes **seguir** a un actor. Los que sigues aparecen en la Biblioteca, debajo de
«Continuar viendo», y sus estrenos futuros salen en **Próximos**.

Los favoritos viven en **su propia tabla**, no como un tipo más de `items`: un actor no es algo que
estés viendo ni leyendo, y meterlo en la biblioteca obligaría a excluirlo en cada consulta, filtro y
contador — el mismo lío que dieron los vídeos de YouTube antes de quitarlos.

El reparto y los perfiles **no se guardan**: se piden en vivo y llegan en la misma petición que el
resto de la ficha. Solo se guarda a quién sigues.

## Ver una serie o una película otra vez

En una serie completada sale **Verla otra vez** (o el estado «Viendo otra vez»). Los episodios se
desmarcan para seguir el progreso desde cero, y lo que tenían marcado pasa a la tabla
`past_watches` con su fecha: no se pierde cuándo viste cada episodio la primera vez. En la ficha
salen los visionados anteriores, y en cada episodio sus fechas de antes.

Se desmarca en vez de llevar un contador para que «Seguir viendo», «Ver siguiente» y el progreso
funcionen igual que la primera vez. Si se pulsa sin querer, se puede deshacer mientras no hayas
marcado nada nuevo. Las estadísticas suman todos los visionados.

En las películas es más simple, porque se ven de una sentada: **La he vuelto a ver** pasa la fecha
de «Visto» al historial y pone la de hoy, que se puede corregir. Usan la misma tabla, con
`episodeId` igual al id de la propia película. El último visionado se puede quitar, y entonces
vuelve la fecha anterior.

## Próximos episodios y estrenos

Pestaña **Próximos**: cuándo sale el siguiente capítulo de cada serie que sigues, ordenado por lo
que llega antes. Es una consulta en vivo a TMDB, nada se guarda — las fechas cambian, y una fecha
caducada guardada sería peor que no tenerla.

Incluye las series marcadas como **completadas** a propósito: desde que no se guardan episodios sin
emitir, estar al día con una serie en emisión la deja como completada, y ese es justo el caso en el
que quieres saber cuándo sale el siguiente.

Solo se guardan episodios **ya emitidos**. TMDB devuelve las temporadas enteras, con los capítulos
futuros dentro; guardarlos ensuciaba la lista y dejaba el progreso clavado en 24/25.

Debajo, en el mismo scroll, los **estrenos de tus actores favoritos**. Si un título sale por varios
actores que sigues, aparece una sola vez con todos sus nombres.

## Copia automática a Nextcloud

En **Ajustes → Copia automática a Nextcloud**: dirección, usuario, contraseña y carpeta. Al abrir la
app estando en WiFi sube sola, como mucho una vez cada 12 horas, con un fichero por día.

Usa una **contraseña de aplicación** de Nextcloud (Ajustes personales → Seguridad), no la de la
cuenta: se revoca sola sin tocar nada más.

Esa contraseña **no se incluye en las copias exportadas**, a propósito: una copia se comparte y se
mueve de sitio, y esa contraseña da permiso de escritura sobre tus ficheros — la copia acabaría
viajando con su propia llave dentro.

Por lo mismo, **la API key de TMDB tampoco sale en las copias**. Al restaurar en un móvil nuevo hay
que volver a pegarla en Ajustes; si ese móvil ya tenía una, se conserva. Las copias de antes de
noviembre de 2026 sí la llevan, y al importarlas se restaura.

No se usa una tarea en segundo plano a propósito: Android las mata sin avisar y encima no se vería
si funcionan. Como la app se abre a diario, en la práctica la copia acaba siendo diaria igual.

## Estructura

```
app/                     # rutas (expo-router)
  (tabs)/                # Biblioteca, Añadir, Próximos, Stats, Ajustes
  series|movie|book/[id]  # fichas
  person/[tmdbId]        # perfil de un actor
  preview/…              # vista previa antes de añadir
src/
  lib/                   # datos y lógica
  ui/                    # tokens de diseño y componentes base
  components/            # piezas con lógica de la app
  hooks/                 # consultas reactivas (useLiveQuery de Drizzle)
verify/                  # comprobaciones (Node, no van dentro del APK)
scripts/                 # compilar y firmar el APK
```

## Diseño: «Sala oscura»

La carátula es lo único que pone color; la interfaz es monocroma **sin color de acento**, y la
jerarquía la marca el contraste. El color solo aparece con significado: rojo para borrar, ámbar para
el aviso de copia. Todo sale de [`src/ui/theme.ts`](src/ui/theme.ts).

Hay tema claro además del oscuro, con el mismo criterio; se elige en Ajustes.

## Historia: antes era una PWA

Hasta julio de 2026 esto era una PWA (Vite + React + Dexie) publicada en GitHub Pages. Se reescribió
como app nativa por tres motivos: no convencía cómo se veía, no convencía el tacto, y **en
GrapheneOS no llegaba a ser una app** — Vanadium
[no soporta WebAPKs](https://discuss.grapheneos.org/d/4175-does-pwa-use-webview-or-vanadium)
porque se generan en servidores de Google, así que lo que se instalaba era un acceso directo que
abría el navegador.

De paso se resolvió mejor el miedo original: en la web había que *pedirle* al navegador que no
borrara los datos (`navigator.storage.persist()`), y podía negarse. En nativo solo desaparecen si
desinstalas la app.

El formato de las copias se mantiene compatible con el de aquella versión (`SCHEMA_VERSION` sigue
valiendo 2), así que una copia guardada entonces todavía se puede restaurar. El código web sigue en
el historial de git.
