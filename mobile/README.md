# Ludok Time — app Android nativa

Reescritura de la PWA como app Android de verdad, con React Native (Expo SDK 57).
Los datos siguen siendo tuyos y siguen viviendo solo en el móvil, pero ahora en el
almacenamiento privado de la app en vez de en el navegador.

## Por qué nativa

En GrapheneOS, Vanadium [no soporta WebAPKs](https://discuss.grapheneos.org/d/4175-does-pwa-use-webview-or-vanadium)
porque se generan en servidores de Google: lo que se instalaba antes era un **acceso directo**
que abría el navegador, no una app. Además el scroll y las pulsaciones nunca iban a tener el
tacto del sistema. Eso ya no depende de nada externo.

Un efecto secundario importante: en la web había que **pedirle** al navegador que no borrara los
datos (`navigator.storage.persist()`), y podía decir que no. Aquí viven en
`/data/data/com.ludok.time/` y solo desaparecen si desinstalas la app.

## Arranque

```bash
npm install
npm run android      # instala y abre en un móvil conectado por adb
npm run typecheck    # tipos de la app y de los scripts de verificación
npm run verify       # comprueba la capa de datos (ver más abajo)
```

Requisitos ya presentes en esta máquina: JDK 17 (Gradle lo tiene en su caché), Android SDK con
API 36 y `adb`.

> Gradle pide un toolchain de **Java 17**. Si falla con «Cannot find a Java installation
> matching languageVersion=17», compila apuntando al JDK que Gradle ya se descargó:
>
> ```bash
> export JAVA_HOME=~/.gradle/jdks/eclipse_adoptium-17-amd64-linux.2
> cd android && ./gradlew assembleDebug
> ```

## Traer tus datos desde la PWA

1. En la web: **Ajustes → Exportar copia**. Guarda el JSON.
2. En la app: **Ajustes → Importar copia → Reemplazar**.

El formato de copia es **el mismo en las dos**, a propósito: `SCHEMA_VERSION` sigue valiendo 2
justamente para que la ida y vuelta funcione en ambos sentidos.

Lo único que no viaja son los campos `notes` y `tags`, que se quitaron de la app hace tiempo por
no usarse. El script de verificación los lista explícitamente en vez de descartarlos en silencio.

## Verificación de la capa de datos

Los datos son la parte que no puede fallar, así que se prueban de verdad y no solo con tipos:

```bash
npm run verify:data       # formato de copia: ida y vuelta, huecos, volumen, rechazos
npm run verify:library    # reglas de negocio: episodios, estados, libros, vídeos
npm run verify:real ../ludok-time-backup-2026-07-27.json   # con una copia tuya real
```

Los tres ejecutan **el mismo código que corre en el móvil**, contra un SQLite de escritorio. Eso
es posible porque la lógica pide la base de datos a [`src/lib/dbRef.ts`](src/lib/dbRef.ts) en vez
de crearla ella: `src/lib/db.ts` es el único fichero que toca `expo-sqlite`.

Se usa **libsql** y no `better-sqlite3` porque este último es sincrónico y no admite
transacciones asíncronas, mientras que `expo-sqlite` sí: con libsql la semántica coincide con la
real.

## Estructura

```
app/                     # rutas (expo-router)
  (tabs)/                # Biblioteca, Añadir, Vídeos, Stats, Ajustes
  series|movie|book/[id] # fichas
  preview/…              # vista previa antes de añadir
src/
  lib/                   # datos y lógica (portados de la web)
  ui/                    # tokens de diseño y componentes base
  components/            # piezas con lógica de la app
  hooks/                 # consultas reactivas (useLiveQuery de Drizzle)
verify/                  # scripts de comprobación (Node, no van en el APK)
```

## Diseño: «Sala oscura»

La carátula es lo único que pone color; la interfaz es monocroma **sin color de acento**, y la
jerarquía la marca el contraste. El color solo aparece con significado: rojo para borrar, ámbar
para el aviso de copia. Todo sale de [`src/ui/theme.ts`](src/ui/theme.ts).

Hay tema claro además del oscuro, con el mismo criterio; se elige en Ajustes.

## Compilar un APK para instalar

```bash
npm run build:apk
# → mobile/android/app/build/outputs/apk/release/app-release.apk
```

Tiene que ser **release**, no debug: en debug el JavaScript no va dentro del APK, se carga del
servidor de Metro, así que un APK de debug no funciona sin el ordenador delante.

Instalar: `adb install -r app-release.apk`, o copiar el fichero al móvil y abrirlo.
Con `-r` se instala **encima** conservando los datos, siempre que la firma sea la misma.

### ⚠️ El keystore hay que guardarlo como oro

La firma vive en `release.jks` + `keystore.properties`, los dos **fuera del repo**
(en `.gitignore`).

Android solo deja instalar un APK **encima** de otro si van firmados con la misma clave. Si se
pierden, la única salida es **desinstalar** para poner la versión nueva — y desinstalar **borra
los datos de la app**.

Guárdalos junto a las copias de seguridad. Es el único fichero de este proyecto que no se puede
regenerar.
