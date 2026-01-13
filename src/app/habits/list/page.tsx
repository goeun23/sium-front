import { HabitListContents } from '@/app/habits/list/HabitListContents';
import { fetchHabits } from '@/lib/api/habits';

export default async function HabitListPage() {
  const habits = await fetchHabits();

  return <HabitListContents habits={habits} />;
}
