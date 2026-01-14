'use server';

import { createClient } from '@/lib/supabase/server';
import { UserCharacter } from '@/types/character';

// ------ Helper Functions (Private) ------

/**
 * Supabase Client를 생성하고 인증된 유저를 반환합니다.
 * 인증되지 않은 경우 에러를 던집니다.
 */
async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Not authenticated');

  return { supabase, user };
}

/**
 * 유저의 현재 골드를 조회합니다.
 */
async function getUserGold(supabase: any, userId: string): Promise<number> {
  const { data: profile, error } = await supabase
    .from('users')
    .select('gold')
    .eq('uuid', userId)
    .maybeSingle();

  if (error) {
    if (error.code !== 'PGRST116') throw error;
    // 프로필 없으면 0 리턴 (혹은 경고)
    return 0;
  }
  return profile?.gold || 0;
}

/**
 * 유저의 골드를 업데이트(덮어쓰기) 합니다.
 */
async function updateUserGold(supabase: any, userId: string, newGold: number) {
  // upsert는 없으면 생성, 있으면 수정. users 테이블 특성상 update가 맞을 수 있으나
  // 기존 로직이 upsert를 혼용하고 있으므로 안전하게 upsert 사용 고려.
  // 여기서는 명확히 update를 사용하되, 기존 코드의 upsert 필요성을 고려해 upsert 사용.
  const { error } = await supabase
    .from('users')
    .upsert({ uuid: userId, gold: newGold }, { onConflict: 'uuid' });

  if (error) throw error;
}

// ------ Exported Actions ------

interface AddRewardActionProps {
  characterId: string;
  xpToAdd: number;
  earnedGold: number;
}

export async function addRewardAction({ characterId, xpToAdd, earnedGold }: AddRewardActionProps) {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    // 1. 현재 캐릭터 상태 조회
    const { data: currentCharacter, error: fetchError } = await supabase
      .from('user_characters')
      .select('*')
      .eq('id', characterId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !currentCharacter) throw new Error('character not found');

    // 2. XP 및 레벨 계산
    let newLevel = currentCharacter.current_level;
    let finalXP = currentCharacter.current_xp + xpToAdd;

    while (true) {
      const nextLevelThreshold = newLevel * 100;
      if (finalXP >= nextLevelThreshold) {
        finalXP -= nextLevelThreshold;
        newLevel += 1;
      } else {
        break;
      }
    }

    // 3. 캐릭터 업데이트
    const { data: updatedChar, error: charError } = await supabase
      .from('user_characters')
      .update({
        current_xp: finalXP,
        current_level: newLevel,
        updated_at: new Date().toISOString(),
      })
      .eq('id', characterId)
      .select('*, character:characters(*)')
      .single();

    if (charError) throw charError;

    // 4. 골드 업데이트
    const currentGold = await getUserGold(supabase, user.id);
    const newGold = currentGold + earnedGold;
    await updateUserGold(supabase, user.id, newGold);

    return {
      newGold,
      newCharacterData: updatedChar,
      leveledUp: newLevel > currentCharacter.current_level,
    };
  } catch (err: any) {
    console.error('Server Action Error', err);
    throw new Error(err.message);
  }
}

export async function selectCharacterAction(characterId: number) {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    // 1. 모든 캐릭터 비활성화
    await supabase.from('user_characters').update({ is_active: false }).eq('user_id', user.id);

    // 2. 보유중인지 확인
    const { data: existingChars } = await supabase
      .from('user_characters')
      .select('*, character:characters(*)')
      .eq('user_id', user.id)
      .eq('character_id', characterId);

    const existing = existingChars?.[0];
    let activedCharacter;

    if (existing) {
      // 3-A. 보유중 -> 활성화
      const { data, error } = await supabase
        .from('user_characters')
        .update({ is_active: true })
        .eq('id', existing.id)
        .select('*, character:characters(*)')
        .single();

      if (error) throw error;
      activedCharacter = data;
    } else {
      // 3-B. 미보유 -> 신규 생성 및 활성화
      const { data, error } = await supabase
        .from('user_characters')
        .insert({
          user_id: user.id,
          character_id: characterId,
          current_xp: 0,
          current_level: 1,
          is_active: true,
        })
        .select('*, character:characters(*)')
        .single();

      if (error) throw error;
      activedCharacter = data;
    }

    return { activedCharacter };
  } catch (err: any) {
    throw new Error(err.message);
  }
}

export async function spendGoldAction(amount: number) {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    // 1. 현재 골드 확인
    const currentGold = await getUserGold(supabase, user.id);
    if (currentGold < amount) throw new Error('골드가 부족합니다.');

    // 2. 골드 차감
    const newGold = currentGold - amount;
    await updateUserGold(supabase, user.id, newGold);

    return { newGold };
  } catch (err: any) {
    throw new Error(err.message);
  }
}

export async function switchCharacterAction(userCharacterId: string) {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    // 1. 모든 캐릭터 비활성화
    await supabase.from('user_characters').update({ is_active: false }).eq('user_id', user.id);

    // 2. 선택된 캐릭터 활성화
    const { error } = await supabase
      .from('user_characters')
      .update({ is_active: true })
      .eq('id', userCharacterId);

    return { error: error || null };
  } catch (err: any) {
    throw new Error(err.message);
  }
}

export async function fetchUserCharacterAction() {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    const { data: characters, error: charError } = await supabase
      .from('user_characters')
      .select('*, character:characters(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (charError) throw charError;

    return { characters };
  } catch (err: any) {
    throw new Error(err.message);
  }
}

export async function fetchUserProfileAction() {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    const profileGold = await getUserGold(supabase, user.id);

    return { profileGold };
  } catch (err: any) {
    throw new Error(err.message);
  }
}

export async function updateGoldAction(newGold: number) {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    await updateUserGold(supabase, user.id, newGold);

    return { success: true };
  } catch (err: any) {
    throw new Error(err.message);
  }
}
