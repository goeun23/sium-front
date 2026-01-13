import { Habit } from '@/types/habit';
import { createClient } from '../supabase/server';
export const fetchHabits = async () => {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const { data: habits, error } = await supabase
      .from('habits')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      return [];
    }
    return habits as Habit[];
  } catch (err: any) {
    console.error(err.message);
    return [];
  }
};
