export function createDragImage(event: DragEvent, text: string) {
  if (!event.dataTransfer) return;

  const dragElement = document.createElement('div');
  dragElement.textContent = text;
  dragElement.className =
    'px-2 py-2 max-w-[250px] text-sm bg-background border rounded shadow-md ';

  // Position off-screen initially to avoid flash at 0,0
  dragElement.style.position = 'absolute';
  dragElement.style.left = '-9999px';
  dragElement.style.top = '-9999px';

  document.body.appendChild(dragElement);

  // Set as drag image
  event.dataTransfer.setDragImage(dragElement, 0, 0);

  setTimeout(() => {
    document.body.removeChild(dragElement);
  }, 0);
}

export function updateElementClasses(
  element: HTMLElement,
  addClasses: string[] = [],
  removeClasses: string[] = []
) {
  if (removeClasses.length > 0) {
    element.classList.remove(...removeClasses);
  }
  if (addClasses.length > 0) {
    element.classList.add(...addClasses);
  }
}
