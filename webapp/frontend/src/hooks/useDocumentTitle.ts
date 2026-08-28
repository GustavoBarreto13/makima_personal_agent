import { useEffect } from 'react'

// Define o título da aba e o favicon enquanto o componente que chama está montado.
export function useDocumentTitle(title: string, iconSrc?: string) {
  useEffect(() => {
    document.title = title
    if (!iconSrc) return
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = iconSrc
  }, [title, iconSrc])
}
