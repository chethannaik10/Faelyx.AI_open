import { useRef, useState } from 'react';

export function useVoice(onFinal: (text: string) => void) {
  const rec = useRef<any>(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');

  const supported = typeof window !== 'undefined' &&
    (('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window));

  function start() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = 'en-US'; r.interimResults = true; r.continuous = false;
    r.onresult = (e: any) => {
      let final = '', tmp = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t; else tmp += t;
      }
      setInterim(tmp);
      if (final) { onFinal(final.trim()); setInterim(''); }
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    r.start(); setListening(true); rec.current = r;
  }
  function stop() { rec.current?.stop(); setListening(false); }

  return { supported, listening, interim, start, stop };
}
