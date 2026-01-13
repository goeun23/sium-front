import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';


const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Sium',
  description: '귀여운 캐릭터와 함께 성장하는 습관 형성',
  icons: {
    icon: '/favicon.ico',
  },
};

import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import { ToastProvider } from '@/components/ui/Toast';
import { CharacterProvider } from '@/components/providers/CharacterProvider';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let initialCharacterData = null;

  if(user){
    const [profileRes, userCharsRes, availableCharsRes] = await Promise.all([
      supabase.from('users').select('gold').eq('uuid', user.id).single(),
      supabase.from('user_characters').select('*, character:characters(*)').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase.from('characters').select('*').order('id', { ascending: true })
    ]);

    const characters = userCharsRes.data || [];
    const active = characters.find(c=> c.is_active) || characters[0] || null;

    initialCharacterData = {
      gold:profileRes.data?.gold || 0, 
      userCharacters : characters, 
      availableCharacters : availableCharsRes.data || [], 
      activeCharacter : active
    }
  }

  return (
    <html lang="ko">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <CharacterProvider initialData={initialCharacterData}>
          <ToastProvider>
            <Header user={user} />
            {children}
          </ToastProvider>
        </CharacterProvider>
      </body>
    </html>
  );
}

