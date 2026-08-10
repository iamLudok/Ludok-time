# Ludok Time

App Android para apuntar todo lo que veo y leo: **series, películas, libros y vídeos de YouTube**.
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
| Libros | Open Library + Google Books, o a mano | Por página, con % leído |
| Vídeos de YouTube | Enlace, a mano o import de Takeout | Sección propia |

Los vídeos viven en su pestaña y no entran en la biblioteca ni en los contadores: al importar el
historial de Takeout pueden ser miles y sepultarían el resto.

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
npm run verify:library    # reglas: episodios, estados, libros, vídeos, borrados
npm run verify:migration  # que actualizar de versión no pierde nada
npm run verify:real ./ludok-time-backup-2026-07-27.json   # con una copia real
```

Esto es posible porque la lógica pide la base de datos a [`src/lib/dbRef.ts`](src/lib/dbRef.ts) en
vez de crearla ella: [`src/lib/db.ts`](src/lib/db.ts) es el **único** fichero que toca
`expo-sqlite`.

Se usa **libsql** y no `better-sqlite3` porque este último es sincrónico y no admite transacciones
asíncronas, mientras que `expo-sqlite` sí: con libsql la semántica coincide con la real.

Estas pruebas ya han pillado fallos que habrían corrompido datos en silencio — por ejemplo un
upsert que mezclaba las filas entre sí al importar.

## Copia automática a Nextcloud

En **Ajustes → Copia automática a Nextcloud**: dirección, usuario, contraseña y carpeta. Al abrir la
app estando en WiFi sube sola, como mucho una vez cada 12 horas, con un fichero por día.

Usa una **contraseña de aplicación** de Nextcloud (Ajustes personales → Seguridad), no la de la
cuenta: se revoca sola sin tocar nada más.

Esa contraseña **no se incluye en las copias exportadas**, a propósito: una copia se comparte y se
mueve de sitio, y esa contraseña da permiso de escritura sobre tus ficheros — la copia acabaría
viajando con su propia llave dentro.

No se usa una tarea en segundo plano a propósito: Android las mata sin avisar y encima no se vería
si funcionan. Como la app se abre a diario, en la práctica la copia acaba siendo diaria igual.

## Estructura

```
app/                     # rutas (expo-router)
  (tabs)/                # Biblioteca, Añadir, Vídeos, Stats, Ajustes
  series|movie|book/[id] # fichas
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
