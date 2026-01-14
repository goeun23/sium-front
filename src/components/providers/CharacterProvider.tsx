'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Character, UserCharacter } from '@/types/character';

import {
  addRewardAction,
  fetchUserProfileAction,
  selectCharacterAction,
  spendGoldAction,
  switchCharacterAction,
  fetchUserCharacterAction,
  updateGoldAction,
} from '@/actions/characterActions';

interface CharacterProviderProps {
  children: React.ReactNode;
  initialData?: {
    userCharacters: UserCharacter[];
    availableCharacters: Character[];
    gold: number;
    activeCharacter: UserCharacter | null;
  } | null;
}

interface CharacterContextType {
  character: UserCharacter | null;
  userCharacters: UserCharacter[];
  availableCharacters: Character[];
  gold: number;
  loading: boolean;
  error: string | null;
  selectCharacter: (characterId: number) => Promise<UserCharacter>;
  switchCharacter: (userCharacterId: string) => Promise<void>;
  addRewards: (
    xp: number,
    earnedGold: number
  ) => Promise<{ data: UserCharacter; leveledUp: boolean }>;
  updateGold: (newGold: number) => Promise<void>;
  spendGold: (amount: number) => Promise<void>;
  refresh: () => Promise<void>;
}

const CharacterContext = createContext<CharacterContextType | undefined>(undefined);

export function CharacterProvider({ children, initialData }: CharacterProviderProps) {
  // 1. 초기값을 props에서 받아옴 (없으면 기본값)
  const [character, setCharacter] = useState<UserCharacter | null>(
    initialData?.activeCharacter ?? null
  );
  const [userCharacters, setUserCharacters] = useState<UserCharacter[]>(
    initialData?.userCharacters ?? []
  );
  const [availableCharacters, setAvailableCharacters] = useState<Character[]>(
    initialData?.availableCharacters ?? []
  );
  const [gold, setGold] = useState(initialData?.gold ?? 0);
  const supabase = createClient();
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  const fetchAvailableCharacters = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('characters')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;
      setAvailableCharacters(data || []);
    } catch (err: any) {
      setError(err.message);
    }
  }, [supabase]);

  const fetchUserData = useCallback(async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setCharacter(null);
        setUserCharacters([]);
        setGold(0);
        setLoading(false);
        return;
      }

      // 1. Fetch User Profile (Gold)
      const { profileGold } = await fetchUserProfileAction();
      setGold(profileGold || 0);

      // 2. Fetch User Characters
      const { characters } = await fetchUserCharacterAction();
      setUserCharacters(characters || []);

      // 3. Set active character
      const active = characters?.find((c) => c.is_active) || characters?.[0] || null;
      setCharacter(active);
    } catch (err: any) {
      console.error('Error fetching user data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const selectCharacter = async (characterId: number) => {
    if (!character) throw new Error('No character selected');

    try {
      setLoading(true);
      const { activedCharacter } = await selectCharacterAction(characterId);

      setCharacter(activedCharacter);
      await fetchUserData();
      return activedCharacter;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const switchCharacter = async (userCharacterId: string) => {
    try {
      const { error } = await switchCharacterAction(userCharacterId);

      if (error) throw error;
      await fetchUserData();
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const addRewards = async (xp: number, earnedGold: number) => {
    if (!character) throw new Error('No character selected');

    try {
      setLoading(true);

      // server action 호출
      const { newCharacterData, newGold, leveledUp } = await addRewardAction({
        characterId: character.id,
        xpToAdd: xp,
        earnedGold,
      });

      setCharacter(newCharacterData);
      setGold(newGold);
      setUserCharacters((prev) =>
        prev.map((c) => (c.id === newCharacterData.id ? newCharacterData : c))
      );
      if (leveledUp) {
        // level up action 처리
      }

      return { data: newCharacterData, leveledUp };
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateGold = async (newGoldValue: number) => {
    try {
      await updateGoldAction(newGoldValue);
      setGold(newGoldValue);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const spendGold = async (amount: number) => {
    try {
      const { newGold } = await spendGoldAction(amount);
      setGold(newGold);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  useEffect(() => {
    if (!initialData) {
      fetchUserData();
      fetchAvailableCharacters();
    }

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        fetchUserData();
        fetchAvailableCharacters();
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUserData, fetchAvailableCharacters, supabase, initialData]);

  return (
    <CharacterContext.Provider
      value={{
        character,
        userCharacters,
        availableCharacters,
        gold,
        loading,
        error,
        selectCharacter,
        switchCharacter,
        addRewards,
        updateGold,
        spendGold,
        refresh: fetchUserData,
      }}
    >
      {children}
    </CharacterContext.Provider>
  );
}

export function useCharacter() {
  const context = useContext(CharacterContext);
  if (context === undefined) {
    throw new Error('useCharacter must be used within a CharacterProvider');
  }
  return context;
}
