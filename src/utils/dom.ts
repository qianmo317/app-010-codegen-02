// DOM 工具函数
export function createElement(tag: string, className?: string, text?: string): HTMLElement {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

export function createButton(text: string, onClick: () => void, className?: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.className = className || 'btn';
  btn.addEventListener('click', onClick);
  return btn;
}

export function createLink(text: string, href: string, className?: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.textContent = text;
  a.href = href;
  a.className = className || '';
  a.addEventListener('click', async (e) => {
    e.preventDefault();
    const router = (await import('../router')).router;
    router.navigate(href);
  });
  return a;
}

export function clearElement(el: HTMLElement) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

export function formatDateDisplay(year: number, month: number, day: number): string {
  return `${year}年${month}月${day}日`;
}
