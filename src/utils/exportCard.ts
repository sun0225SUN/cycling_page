/**
 * Capture a card as PNG without mutating the live layout.
 * Expanding the on-screen element (overflow/width) caused a visible jitter;
 * we clone off-screen, expand the clone, then export that instead.
 */
export async function exportCard(element: HTMLElement, filename: string) {
  const { toPng } = await import('html-to-image');
  const computed = getComputedStyle(element);
  const width = Math.ceil(
    Math.max(
      element.getBoundingClientRect().width,
      element.scrollWidth + parseFloat(computed.paddingRight || '0') + 2
    )
  );

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = [
    'position:fixed',
    'left:-100000px',
    'top:0',
    'z-index:-1',
    'pointer-events:none',
    'opacity:1',
  ].join(';');

  const clone = element.cloneNode(true) as HTMLElement;
  clone.classList.add('exporting');
  clone
    .querySelectorAll('[data-export-hidden]')
    .forEach((node) => node.remove());
  clone.style.overflow = 'visible';
  clone.style.maxWidth = 'none';
  clone.style.width = `${width}px`;
  clone.style.margin = '0';
  clone.scrollLeft = 0;

  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );

    const bounds = clone.getBoundingClientRect();
    const dataUrl = await toPng(clone, {
      backgroundColor:
        computed.backgroundColor === 'rgba(0, 0, 0, 0)'
          ? undefined
          : computed.backgroundColor,
      width: Math.ceil(Math.max(bounds.width, width)),
      height: Math.ceil(bounds.height),
      pixelRatio: 2,
    });

    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
    return dataUrl;
  } finally {
    host.remove();
  }
}
