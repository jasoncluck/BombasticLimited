import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock DOM globals
const mockElement = {
  textContent: '',
  className: '',
  style: {} as any,
  classList: {
    add: vi.fn(),
    remove: vi.fn(),
  },
};

const mockDocument = {
  createElement: vi.fn(() => mockElement),
  body: {
    appendChild: vi.fn(),
    removeChild: vi.fn(),
  },
};

global.document = mockDocument as any;

// Mock setTimeout
global.setTimeout = vi.fn((fn) => {
  fn();
  return 1;
}) as any;

// Now import the functions
import { createDragImage, updateElementClasses } from '../dragdrop';

describe('Dragdrop Utilities', () => {
  const createMockDragEvent = (hasDataTransfer = true): DragEvent => {
    const dataTransfer = hasDataTransfer
      ? {
          setDragImage: vi.fn(),
        }
      : null;

    return {
      dataTransfer,
    } as any;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock element
    mockElement.textContent = '';
    mockElement.className = '';
    mockElement.style = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createDragImage', () => {
    it('should create and position drag element correctly', () => {
      const event = createMockDragEvent();
      const text = 'Drag this item';

      createDragImage(event, text);

      expect(mockDocument.createElement).toHaveBeenCalledWith('div');
      expect(mockElement.textContent).toBe(text);
      expect(mockElement.className).toContain('px-2 py-2');
      expect(mockElement.className).toContain('bg-background');
      expect(mockElement.style.position).toBe('absolute');
      expect(mockElement.style.left).toBe('-9999px');
      expect(mockElement.style.top).toBe('-9999px');
    });

    it('should append element to document body', () => {
      const event = createMockDragEvent();
      const text = 'Test';

      createDragImage(event, text);

      expect(mockDocument.body.appendChild).toHaveBeenCalledWith(mockElement);
    });

    it('should set drag image on dataTransfer', () => {
      const event = createMockDragEvent();
      const text = 'Test';

      createDragImage(event, text);

      expect(event.dataTransfer?.setDragImage).toHaveBeenCalledWith(
        mockElement,
        0,
        0
      );
    });

    it('should remove element after timeout', () => {
      const event = createMockDragEvent();
      const text = 'Test';

      createDragImage(event, text);

      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 0);
      expect(mockDocument.body.removeChild).toHaveBeenCalledWith(mockElement);
    });

    it('should return early when no dataTransfer', () => {
      const event = createMockDragEvent(false);
      const text = 'Test';

      createDragImage(event, text);

      expect(mockDocument.createElement).not.toHaveBeenCalled();
      expect(mockDocument.body.appendChild).not.toHaveBeenCalled();
    });

    it('should handle empty text', () => {
      const event = createMockDragEvent();
      const text = '';

      createDragImage(event, text);

      expect(mockElement.textContent).toBe('');
      expect(mockDocument.createElement).toHaveBeenCalled();
    });

    it('should handle special characters in text', () => {
      const event = createMockDragEvent();
      const text = 'Special chars: <>&"\'';

      createDragImage(event, text);

      expect(mockElement.textContent).toBe(text);
    });

    it('should apply complete CSS classes', () => {
      const event = createMockDragEvent();
      const text = 'Test';

      createDragImage(event, text);

      expect(mockElement.className).toContain('px-2');
      expect(mockElement.className).toContain('py-2');
      expect(mockElement.className).toContain('max-w-[250px]');
      expect(mockElement.className).toContain('text-sm');
      expect(mockElement.className).toContain('bg-background');
      expect(mockElement.className).toContain('border');
      expect(mockElement.className).toContain('rounded');
      expect(mockElement.className).toContain('shadow-md');
    });
  });

  describe('updateElementClasses', () => {
    const createMockElement = (): HTMLElement =>
      ({
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
        },
      }) as any;

    it('should add classes when provided', () => {
      const element = createMockElement();
      const addClasses = ['class1', 'class2', 'class3'];

      updateElementClasses(element, addClasses);

      expect(element.classList.add).toHaveBeenCalledWith(
        'class1',
        'class2',
        'class3'
      );
      expect(element.classList.remove).not.toHaveBeenCalled();
    });

    it('should remove classes when provided', () => {
      const element = createMockElement();
      const removeClasses = ['old-class1', 'old-class2'];

      updateElementClasses(element, [], removeClasses);

      expect(element.classList.remove).toHaveBeenCalledWith(
        'old-class1',
        'old-class2'
      );
      expect(element.classList.add).not.toHaveBeenCalled();
    });

    it('should add and remove classes when both provided', () => {
      const element = createMockElement();
      const addClasses = ['new-class1', 'new-class2'];
      const removeClasses = ['old-class1', 'old-class2'];

      updateElementClasses(element, addClasses, removeClasses);

      expect(element.classList.remove).toHaveBeenCalledWith(
        'old-class1',
        'old-class2'
      );
      expect(element.classList.add).toHaveBeenCalledWith(
        'new-class1',
        'new-class2'
      );
    });

    it('should handle empty arrays gracefully', () => {
      const element = createMockElement();

      updateElementClasses(element, [], []);

      expect(element.classList.add).not.toHaveBeenCalled();
      expect(element.classList.remove).not.toHaveBeenCalled();
    });

    it('should handle undefined parameters gracefully', () => {
      const element = createMockElement();

      updateElementClasses(element);

      expect(element.classList.add).not.toHaveBeenCalled();
      expect(element.classList.remove).not.toHaveBeenCalled();
    });

    it('should call remove before add to ensure correct order', () => {
      const element = createMockElement();
      const addClasses = ['new-class'];
      const removeClasses = ['old-class'];

      updateElementClasses(element, addClasses, removeClasses);

      // Check call order - remove should be called before add
      const removeCall = (element.classList.remove as any).mock
        .invocationCallOrder[0];
      const addCall = (element.classList.add as any).mock
        .invocationCallOrder[0];

      expect(removeCall).toBeLessThan(addCall);
    });

    it('should handle single class in arrays', () => {
      const element = createMockElement();

      updateElementClasses(element, ['single-add'], ['single-remove']);

      expect(element.classList.remove).toHaveBeenCalledWith('single-remove');
      expect(element.classList.add).toHaveBeenCalledWith('single-add');
    });

    it('should handle many classes efficiently', () => {
      const element = createMockElement();
      const manyClasses = Array.from({ length: 50 }, (_, i) => `class-${i}`);

      updateElementClasses(element, manyClasses, manyClasses);

      expect(element.classList.remove).toHaveBeenCalledWith(...manyClasses);
      expect(element.classList.add).toHaveBeenCalledWith(...manyClasses);
    });

    it('should handle classes with special characters', () => {
      const element = createMockElement();
      const specialClasses = [
        'class-with-dashes',
        'class_with_underscores',
        'class123',
      ];

      updateElementClasses(element, specialClasses);

      expect(element.classList.add).toHaveBeenCalledWith(...specialClasses);
    });
  });

  describe('integration scenarios', () => {
    it('should work in typical drag and drop workflow', () => {
      const event = createMockDragEvent();
      const element = {
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
        },
      } as any;

      // Simulate drag start
      updateElementClasses(element, ['dragging'], ['idle']);
      createDragImage(event, '3 items selected');

      expect(element.classList.remove).toHaveBeenCalledWith('idle');
      expect(element.classList.add).toHaveBeenCalledWith('dragging');
      expect(mockElement.textContent).toBe('3 items selected');
      expect(event.dataTransfer?.setDragImage).toHaveBeenCalled();
    });

    it('should handle drag end cleanup', () => {
      const element = {
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
        },
      } as any;

      // Simulate drag end
      updateElementClasses(element, ['idle'], ['dragging', 'drag-over']);

      expect(element.classList.remove).toHaveBeenCalledWith(
        'dragging',
        'drag-over'
      );
      expect(element.classList.add).toHaveBeenCalledWith('idle');
    });
  });

  describe('error handling', () => {
    it('should handle DOM errors gracefully in createDragImage', () => {
      const event = createMockDragEvent();
      mockDocument.createElement.mockImplementation(() => {
        throw new Error('DOM error');
      });

      expect(() => createDragImage(event, 'test')).toThrow('DOM error');
    });

    it('should handle classList errors gracefully in updateElementClasses', () => {
      const element = {
        classList: {
          add: vi.fn(() => {
            throw new Error('ClassList error');
          }),
          remove: vi.fn(),
        },
      } as any;

      expect(() => updateElementClasses(element, ['test'])).toThrow(
        'ClassList error'
      );
    });
  });
});
