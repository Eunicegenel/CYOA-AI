import {
  getPokemonByName,
  getMoveByName,
  getAbilityByName,
  getItemByName,
  canPokemonLearnMove,
  searchAnimeLore,
  searchMangaLore,
  getPokemonKnowledgeStats,
} from "../../services/pokemonKnowledgeService.js";

console.log("\nPokémon Knowledge Stats:");
console.log(getPokemonKnowledgeStats());

console.log("\nPokémon Lookup: Tyranitar");
const tyranitar = getPokemonByName("Tyranitar");
console.log({
  name: tyranitar?.identity?.displayName,
  types: tyranitar?.aiReadySummary?.primaryTypes,
  genus: tyranitar?.classification?.genus,
});

console.log("\nMove Lookup: Earthquake");
const earthquake = getMoveByName("Earthquake");
console.log({
  name: earthquake?.identity?.displayName,
  type: earthquake?.aiReadySummary?.primaryType,
  power: earthquake?.aiReadySummary?.primaryPower,
});

console.log("\nAbility Lookup: Sand Stream");
const sandStream = getAbilityByName("Sand Stream");
console.log({
  name: sandStream?.identity?.displayName,
  description: sandStream?.aiReadySummary?.conciseDescription,
});

console.log("\nItem Lookup: Choice Band");
const choiceBand = getItemByName("Choice Band");
console.log({
  name: choiceBand?.identity?.displayName,
  description: choiceBand?.aiReadySummary?.conciseDescription,
});

console.log("\nLearnset Check: Can Gengar learn Thunderbolt?");
console.log(canPokemonLearnMove("Gengar", "Thunderbolt"));

console.log("\nAnime Lore Search: Ash Greninja");
console.log(
  searchAnimeLore("Ash Greninja", 3).map((entry) => ({
    score: entry.score,
    title: entry.page.title,
    heading: entry.section.heading,
    preview: entry.text.slice(0, 180),
  }))
);

console.log("\nManga Lore Search: Yellow arc");
console.log(
  searchMangaLore("Yellow arc", 3).map((entry) => ({
    score: entry.score,
    title: entry.page.title,
    heading: entry.section.heading,
    preview: entry.text.slice(0, 180),
  }))
);
