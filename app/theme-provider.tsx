'use client';
import {ThemeProvider,useTheme} from 'next-themes';
import {useEffect,useState,type ReactNode} from 'react';
export function AppThemeProvider({children}:{children:ReactNode}){return <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem enableColorScheme storageKey="ildan-theme">{children}</ThemeProvider>}
export function ThemeSwitch(){const {theme,setTheme}=useTheme();const [mounted,setMounted]=useState(false);useEffect(()=>setMounted(true),[]);return <label className="theme-switch"><span>화면 모드</span><select aria-label="화면 모드" value={mounted?theme:'system'} onChange={e=>setTheme(e.target.value)}><option value="light">☀ 라이트</option><option value="dark">☾ 다크</option><option value="system">◐ 시스템</option></select></label>}
