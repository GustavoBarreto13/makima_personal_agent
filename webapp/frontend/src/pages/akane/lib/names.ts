// Nome legível (pt-BR) de um código de idioma ("ja" → "japonês") ou país ("JP" → "Japão"). Cai no código se o
// navegador não souber.

function display(type: 'language' | 'region', code: string): string {
  try {
    return new Intl.DisplayNames(['pt-BR'], { type }).of(code) ?? code
  } catch {
    return code
  }
}

export const languageName = (code: string): string => display('language', code.toLowerCase())
export const countryName = (code: string): string => display('region', code.toUpperCase())
