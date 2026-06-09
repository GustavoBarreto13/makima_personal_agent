// Campo de upload ou URL de ícone — usado nos formulários de Contas, Cartões e Assinaturas.
// Exibe preview circular 56×56. Se não há imagem, mostra sigla sobre fundo colorido.
// Permite upload de arquivo (PNG/JPEG/WebP ≤ 1 MB) ou colar URL diretamente.

import { useState, useRef } from 'react'
import { namiApi } from '../namiApi'

interface IconFieldProps {
  value: string | null         // URL atual da imagem (null = sem ícone)
  fallbackLabel: string        // Sigla exibida quando não há imagem (ex.: "NU", "NF")
  onChange: (url: string | null) => void  // Chamado com nova URL ou null para remover
}

/** Campo de ícone com preview, upload e URL direta. */
export function IconField({ value, fallbackLabel, onChange }: IconFieldProps) {
  const [urlInput, setUrlInput] = useState(value ?? '')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [imgError, setImgError] = useState(false)  // true quando a img falha ao carregar
  const fileRef = useRef<HTMLInputElement>(null)

  // Determina se deve mostrar a imagem ou o fallback
  const showImg = !!value && !imgError

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validação antes do upload: só aceita images
    if (!file.type.startsWith('image/')) {
      setError('Só são aceitos arquivos de imagem (PNG, JPEG, WebP)')
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
      // Limpa o input de arquivo para permitir re-upload do mesmo arquivo
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
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      {/* Preview circular 56×56 */}
      <div style={{
        width: 56,
        height: 56,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
        border: '2px solid var(--line)',
        background: showImg ? 'transparent' : 'var(--tang-tint)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18,
        fontWeight: 700,
        color: 'var(--tang-deep)',
        fontFamily: 'var(--mono)',
        position: 'relative',
      }}>
        {showImg ? (
          <img
            src={value!}
            alt="ícone"
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          // Exibe sigla como fallback (máx 2 chars)
          <span>{fallbackLabel.slice(0, 2).toUpperCase()}</span>
        )}
      </div>

      {/* Controles */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Campo de URL direta */}
        <input
          type="url"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onBlur={handleUrlBlur}
          placeholder="https://... ou envie uma imagem"
          style={{
            width: '100%',
            padding: '7px 10px',
            borderRadius: 'var(--r-sm)',
            border: '1.5px solid var(--line)',
            background: 'var(--paper)',
            color: 'var(--ink)',
            fontFamily: 'var(--sans)',
            fontSize: 12.5,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        {/* Botões de ação */}
        <div style={{ display: 'flex', gap: 6 }}>
          {/* Botão de upload — abre file picker oculto */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              padding: '5px 10px',
              borderRadius: 'var(--r-sm)',
              border: '1.5px solid var(--line)',
              background: 'var(--paper)',
              color: uploading ? 'var(--ink-4)' : 'var(--ink-2)',
              fontFamily: 'var(--sans)',
              fontSize: 12,
              cursor: uploading ? 'wait' : 'pointer',
            }}
          >
            {uploading ? 'Enviando…' : '⬆ Enviar imagem'}
          </button>

          {/* Botão remover — só aparece se há imagem */}
          {value && (
            <button
              type="button"
              onClick={handleRemove}
              style={{
                padding: '5px 10px',
                borderRadius: 'var(--r-sm)',
                border: '1.5px solid var(--line)',
                background: 'transparent',
                color: 'var(--out)',
                fontFamily: 'var(--sans)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Remover
            </button>
          )}
        </div>

        {/* Mensagem de erro */}
        {error && (
          <div style={{ fontSize: 11.5, color: 'var(--out)' }}>{error}</div>
        )}
      </div>

      {/* Input de arquivo oculto — acionado pelo botão "Enviar imagem" */}
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
