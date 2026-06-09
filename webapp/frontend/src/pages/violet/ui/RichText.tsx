// Componente RichText — renderiza texto com @pessoas e #tags como spans clicáveis.
// Parse inline: @NomePessoa → span.mention-person (cor emerald)
//               #tag-nome → span.mention-tag (cor accent-deep)
// Cliques em menções disparam onMentionClick para o shell navegar/filtrar.

import React from 'react'

interface RichTextProps {
  // Texto bruto que pode conter @Pessoa e #tag
  content: string
  // Callback acionado quando o usuário clica em uma menção
  onMentionClick?: (kind: 'person' | 'tag', value: string) => void
}

// Tipo de token produzido pelo parser
type Token =
  | { type: 'text'; value: string }
  | { type: 'person'; value: string }
  | { type: 'tag'; value: string }

// Transforma o texto bruto em uma lista de tokens (texto + menções)
function parseTokens(content: string): Token[] {
  const tokens: Token[] = []
  // Intercala @pessoa e #tag usando uma regex combinada.
  // Cada match tem grupos de captura: group[1]=pessoa, group[2]=tag
  const combined = /(@[\wÀ-ÿ]+)|(#[\wÀ-ÿ-]+)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = combined.exec(content)) !== null) {
    // Texto antes da menção (pode ser string vazia)
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: content.slice(lastIndex, match.index) })
    }

    if (match[1]) {
      // É uma @pessoa — remove o @ do value
      tokens.push({ type: 'person', value: match[1].slice(1) })
    } else if (match[2]) {
      // É uma #tag — remove o # do value
      tokens.push({ type: 'tag', value: match[2].slice(1) })
    }

    lastIndex = combined.lastIndex
  }

  // Texto restante após o último match
  if (lastIndex < content.length) {
    tokens.push({ type: 'text', value: content.slice(lastIndex) })
  }

  return tokens
}

// Componente RichText — renderiza tokens como elementos React
export function RichText({ content, onMentionClick }: RichTextProps) {
  const tokens = parseTokens(content)

  return (
    <>
      {tokens.map((token, i) => {
        if (token.type === 'text') {
          // Texto puro — renderiza como fragmento sem tag extra
          return <React.Fragment key={i}>{token.value}</React.Fragment>
        }

        if (token.type === 'person') {
          return (
            <span
              key={i}
              className="mention-person"
              onClick={() => onMentionClick?.('person', token.value)}
            >
              @{token.value}
            </span>
          )
        }

        // token.type === 'tag'
        return (
          <span
            key={i}
            className="mention-tag"
            onClick={() => onMentionClick?.('tag', token.value)}
          >
            #{token.value}
          </span>
        )
      })}
    </>
  )
}
