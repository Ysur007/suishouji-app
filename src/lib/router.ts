import { useEffect, useState } from 'react';

const EVT = 'ssj:route';

function currentPath(): string {
  const raw = location.pathname.replace(/\/+$/, '');
  return raw || '/';
}

export function navigate(to: string, replace = false) {
  if (currentPath() === to) return;
  if (replace) history.replaceState({}, '', to);
  else history.pushState({}, '', to);
  window.dispatchEvent(new Event(EVT));
}

/** 极简路由：只关心 pathname，够用且不引依赖 */
export function useRoute(): string {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const onChange = () => setPath(currentPath());
    window.addEventListener('popstate', onChange);
    window.addEventListener(EVT, onChange);
    return () => {
      window.removeEventListener('popstate', onChange);
      window.removeEventListener(EVT, onChange);
    };
  }, []);

  return path;
}
