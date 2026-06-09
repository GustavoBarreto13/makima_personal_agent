// Campo de upload ou URL de ícone — usado nos formulários de Contas, Cartões e Assinaturas.
// Portado do handoff de referência (addmodal.jsx → IconField).
// Usa as classes .icon-field / .icon-preview / .icon-url-input / .icon-upload-btn.

import { useState, useRef } from 'react'
import { namiApi } from '../namiApi'
import { Icon } from '../icons'

interface IconFieldProps {
  /** URL atual da imagem (null = sem ícone) */
  value: string | null
  /** Sigla exibida quando não há imagem (ex.: "NU", "NF") */
  fallbackLabel: string
  /** Chamado com nova URL ou null para remover */
  onChange: (url: string | null) => void
}

/**
 * Campo de ícone com preview quadrado, upload de arquivo e campo de URL direta.
 * Usa as classes .icon-field / .icon-preview / .icon-actions definidas em nami.css.
 *
 * Args:
 *   value: URL atual da imagem ou null.
 *   fallbackLabel: sigla de até 2 chars para o placeholder.
 *   onChange: callback com a nova URL após upload/URL ou null para remover.
 */
export function IconField({ value, fallbackLabel, onChange }: IconFieldProps) {
  const [urlInput, setUrlInput]   = useState(value ?? '')
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState('')
  const [imgError, setImgError]   = useState(false)  // true quando a img falha ao carregar
  const fileRef = useRef<HTMLInputElement>(null)

  // Mostra a imagem somente se há URL e ela carregou sem erro
  const showImg = !!value && !imgError

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Só são aceitos PNG, JPEG ou WebP')
      return
    }

    setUploading(true)
    setError('')

    try {
      const result = await namiApi.uploadIcon(file)
      setUrlInput(result.url)
      setImgError(false)
      onChange(result.url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar imagem')
    } finally {
      setUploading(false)
      // Limpa o input para permitir re-upload do mesmo arquivo
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function handleUrlBlur() {
    const url = urlInput.trim()
    if (url) {
      setImgError(false)
      onChange(url)
    }
  }

  function handleRemove() {
    setUrlInput('')
    setImgError(false)
    onChange(null)
  }

  return (
    <div className="icon-field">
      {/* Preview quadrado arredondado 40×40 */}
      <div
        className="icon-preview"
        style={{ background: showImg ? 'transparent' : 'var(--accent-t)' }}
      >
        {showImg ? (
          <img
            src={value!}
            alt="ícone"
            onError={() => setImgError(true)}
          />
        ) : (
          // Sigla como fallback — máximo 2 caracteres
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
            {fallbackLabel.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      {/* Controles: URL + upload + remover */}
      <div className="icon-actions">
        <input
          className="icon-url-input"
          type="url"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onBlur={handleUrlBlur}
          placeholder="https://... ou envie uma imagem"
        />

        <div style={{ display: 'flex', gap: 5 }}>
          {/* Botão de upload — aciona o file picker oculto */}
          <button
            type="button"
            className="icon-upload-btn"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            <Icon name="upload" size={12} />
            {uploading ? 'Enviando…' : 'Enviar imagem'}
          </button>

          {/* Botão remover — só aparece se há imagem */}
          {value && (
            <button
              type="button"
              className="icon-upload-btn"
              onClick={handleRemove}
              style={{ color: 'var(--out)', borderColor: 'var(--out-t)' }}
            >
              Remover
            </button>
          )}
        </div>

        {/* Erro */}
        {error && (
          <span style={{ fontSize: 11, color: 'var(--out)' }}>{error}</span>
        )}
      </div>

      {/* Input de arquivo oculto */}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  )
}
