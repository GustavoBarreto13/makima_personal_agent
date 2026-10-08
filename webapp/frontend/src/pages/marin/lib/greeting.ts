// Saudação do hero conforme a hora local (mesma regra do shell antigo e da Akane).

export function greeting(hour: number): string {
  if (hour < 6) return 'Boa madrugada'
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}
