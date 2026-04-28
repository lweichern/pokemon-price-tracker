const ERA_PREFIXES = [
  "Sword & Shield",
  "Scarlet & Violet",
];

const SPECIAL_SETS = [
  "Crown Zenith",
  "Celebrations",
  "Shining Fates",
  "Hidden Fates",
  "Pokemon GO",
  "Pokémon GO",
  "Trick or Trade",
  "Detective Pikachu",
  "Champion's Path",
  "Champions Path",
];

const specialLower = SPECIAL_SETS.map((s) => s.toLowerCase());

export function isTrackedSet(setName: string): boolean {
  if (ERA_PREFIXES.some((prefix) => setName.startsWith(prefix))) return true;
  return specialLower.includes(setName.toLowerCase());
}
