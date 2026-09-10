import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useLiveQuery } from 'drizzle-orm/expo-sqlite'
import { and, eq } from 'drizzle-orm'
import { db } from '../../src/lib/db'
import { items as itemsTable } from '../../src/lib/schema'
import { getMangaPreview } from '../../src/lib/mangaPreview'
import { statusLabel as mangaStatus } from '../../src/lib/mangadex'
import { findReadUrl } from '../../src/lib/inmanga'
import { addManga } from '../../src/lib/library'
import { DetailHead } from '../../src/ui/DetailHead'
import { Txt } from '../../src/ui/Text'
import { Button } from '../../src/ui/Button'
import { Empty } from '../../src/ui/Screen'
import { usePalette } from '../../src/ui/ThemeProvider'
import { useToast } from '../../src/ui/Toast'
import { space } from '../../src/ui/theme'

/**
 * Vista previa de un manga antes de añadirlo.
 *
 * Mientras la miras, se busca por detrás su enlace en inManga: así, si lo
 * encuentra, el manga entra ya con el botón de leer puesto y no hay que esperar
 * al pulsar «Añadir».
 */
export default function PreviewManga() {
  const router = useRouter()
  const palette = usePalette()
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [readUrl, setReadUrl] = useState<string | null | undefined>(undefined)

  const manga = getMangaPreview()

  useEffect(() => {
    if (!manga) return
    let alive = true
    findReadUrl(manga.title).then((url) => alive && setReadUrl(url))
    return () => {
      alive = false
    }
  }, [manga?.key])

  const { data: mine } = useLiveQuery(
    db
      .select()
      .from(itemsTable)
      .where(
        and(
          eq(itemsTable.type, 'manga'),
          eq(itemsTable.source, 'mangadex'),
          eq(itemsTable.sourceId, manga?.key ?? ''),
        ),
      ),
  )
  const existing = mine?.[0]

  if (!manga) {
    return (
      <Empty text="Vuelve a buscar este manga para ver su ficha.">
        <Button title="Buscar" kind="primary" onPress={() => router.replace('/search')} />
      </Empty>
    )
  }

  const add = async () => {
    setAdding(true)
    try {
      const id = await addManga(manga, readUrl ?? undefined)
      toast(`Añadido: ${manga.title}`)
      router.replace(`/manga/${id}`)
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
        poster={manga.cover}
        type="manga"
        title={manga.title}
        meta={[
          manga.author,
          manga.year,
          mangaStatus(manga.status),
          manga.lastChapter ? `${manga.lastChapter} capítulos` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      >
        {existing ? (
          <Button
            title="Ya lo tienes · Ver ficha"
            kind="primary"
            small
            style={styles.cta}
            onPress={() => router.replace(`/manga/${existing.id}`)}
          />
        ) : (
          <Button
            title={adding ? 'Añadiendo…' : 'Añadir manga'}
            kind="primary"
            small
            style={styles.cta}
            onPress={add}
            disabled={adding}
          />
        )}
      </DetailHead>

      <Txt variant="small" tone="faint">
        {readUrl === undefined
          ? 'Buscando el enlace en inManga…'
          : readUrl
            ? 'Encontrado en inManga: entrará con el botón de leer puesto.'
            : 'No aparece en inManga. Podrás pegar el enlace a mano en su ficha.'}
      </Txt>

      {manga.description ? (
        <Txt variant="small" tone="muted">
          {manga.description}
        </Txt>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.lg },
  cta: { alignSelf: 'flex-start', marginTop: space.xs },
})