export const triggerDownload = (url: string, name: string) => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const link = document.createElement('a');
  link.href = url;
  try {
    if (new URL(url).origin !== window.location.origin) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    } else {
      link.download = name;
    }
  } catch {
    link.download = name;
  }
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const openFile = (url: string) => {
  if (typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
};
