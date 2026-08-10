/**
 * Versión del formato de las COPIAS DE SEGURIDAD.
 *
 * Tiene que seguir valiendo 2, el mismo número que usa la versión web: su
 * `importBackup` rechaza cualquier copia con una versión mayor que la suya, así
 * que subirlo aquí rompería tanto la migración de los datos como la ida y
 * vuelta entre las dos apps.
 *
 * Vive en un módulo propio y sin dependencias para que lo puedan usar tanto los
 * mapeadores de filas como el núcleo de copias sin crear un ciclo de imports.
 */
export const SCHEMA_VERSION = 2
