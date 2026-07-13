// GridWars — Pokémon Avatar Hook
// Fetches random Pokémon sprites from PokéAPI with localStorage caching
import { useState, useEffect, useCallback } from 'react';

const TOTAL_POKEMON = 898; // Gen 1-8
const CACHE_KEY = 'gridwars_pokemon_cache';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// In-memory cache for instant access
let memoryCache = null;

function loadCache() {
  if (memoryCache) return memoryCache;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Date.now() - data.timestamp < CACHE_TTL) {
        memoryCache = data.pokemon;
        return memoryCache;
      }
    }
  } catch {}
  return null;
}

function saveCache(pokemon) {
  memoryCache = pokemon;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      pokemon,
      timestamp: Date.now(),
    }));
  } catch {}
}

async function fetchRandomPokemon() {
  const id = Math.floor(Math.random() * TOTAL_POKEMON) + 1;
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
    if (!res.ok) throw new Error('Fetch failed');
    const data = await res.json();
    return {
      id: data.id,
      name: data.name,
      sprite: data.sprites.other?.['official-artwork']?.front_default
        || data.sprites.front_default,
      types: data.types.map(t => t.type.name),
    };
  } catch {
    // Fallback
    return {
      id,
      name: `pokemon-${id}`,
      sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
      types: ['normal'],
    };
  }
}

export function usePokemonAvatar(enabled) {
  const [pokemon, setPokemon] = useState(null);
  const [loading, setLoading] = useState(false);

  // Load cached on mount
  useEffect(() => {
    if (enabled) {
      const cached = loadCache();
      if (cached) {
        setPokemon(cached);
      } else {
        reroll();
      }
    }
  }, [enabled]);

  const reroll = useCallback(async () => {
    setLoading(true);
    const poke = await fetchRandomPokemon();
    setPokemon(poke);
    saveCache(poke);
    setLoading(false);
  }, []);

  return { pokemon, loading, reroll };
}
