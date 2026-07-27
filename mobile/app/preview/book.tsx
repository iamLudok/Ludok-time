import { useState } from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useLiveQuery } from 'drizzle-orm/expo-sqlite'
import { and, eq } from 'drizzle-orm'
import { db } from '../../src/lib/db'
import { items as itemsTable } from '../../src/lib/schema'
import { getBookPreview } from '../../src/lib/bookPreview'
import { addBook } from '../../src/lib/library'
import { DetailHead } from '../../src/ui/DetailHead'
import { Button } from '../../src/ui/Button'
import { Empty } from '../../src/ui/Screen'
import { usePalette } from '../../src/ui/ThemeProvider'
import { useToast } from '../../src/ui/Toast'
import { space } from '../../src/ui/theme'

/**
 * Vista previa de un libro SIN añadirlo. Ni Open Library ni Google Books tienen
 * un endpoint de detalle tan rico como TMDB, así que se reutilizan los datos que
 * ya trajo la búsqueda: aquí solo se llega desde el buscador.
 *
 * La ruta no lleva la clave del libro a propósito: las de Open Library son del
 * tipo `/works/OL123W`, y una barra dentro de un segmento de ruta da problemas
 * aunque vaya codificada. Como el libro ya viaja en memoria, la clave sobra.
 */
export default function PreviewBook() {
  const router = useRouter()
  const palette = usePalette()
  const toast = useToast()
  const [adding, setAdding] = useState(false)

  const book = getBookPreview()

  const { data: mine } = useLiveQuery(
    db
      .select()
      .from(itemsTable)
      .where(
        and(
          eq(itemsTable.type, 'book'),
          eq(itemsTable.source, book?.source ?? 'manual'),
          eq(itemsTable.sourceId, book?.key ?? ''),
        ),
      ),
  )
  const existing = mine?.[0]

  if (!book) {
    return (
      <Empty text="Vuelve a buscar este libro para ver su ficha.">
        <Button title="Buscar" kind="primary" onPress={() => router.replace('/search')} />
      </Empty>
    )
  }

  const add = async () => {
    setAdding(true)
    try {
      const id = await addBook(book)
      toast(`Añadido: ${book.title}`)
      router.replace(`/book/${id}`)
    } catch {
      toast('No se pudo añadir')
    } finally {
      setAdding(false)
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <DetailHead
        poster={book.cover || undefined}
        type="book"
        title={book.title}
        meta={[book.author ?? 'Autor desconocido', book.year, book.pages ? `${book.pages} págs.` : null]
          .filter(Boolean)
          .join(' · ')}
      >
        {existing ? (
          <Button
            title="Ya lo tienes · Ver ficha"
            kind="primary"
            small
            style={styles.cta}
            onPress={() => router.replace(`/book/${existing.id}`)}
          />
        ) : (
          <Button
            title={adding ? 'Añadiendo…' : 'Añadir libro'}
            kind="primary"
            small
            style={styles.cta}
            onPress={add}
            disabled={adding}
          />
        )}
      </DetailHead>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.lg },
  cta: { alignSelf: 'flex-start', marginTop: space.xs },
})
