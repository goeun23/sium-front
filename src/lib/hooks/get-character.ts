import { createClient } from '../supabase/server';

export const getCharactor = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 비로그인 처리 (필요시 리다이렉트나 null 처리)
  if (!user) return null;

  try {
    const { data: userCharacters } = await supabase
      .from('user_characters')
      .select('*, character:characters(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    const character = userCharacters?.find((c) => c.is_active) || userCharacters?.[0] || null;
    return { character };
  } catch (err) {
    return {};
  }
};
