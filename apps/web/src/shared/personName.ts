/** The name to show for a person: the one the player gave them, else the generated first name. */
export function personName(o: { name: string; custom_name?: string | null }): string {
  const custom = o.custom_name?.trim()
  return custom ? custom : o.name
}
