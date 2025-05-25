// @ts-nocheck
import { saveTextToFile } from './helpers';

// Mock logMessage as it's called within saveTextToFile and not relevant to this specific test's assertions.
// We also need to mock other functions from './helpers' if they are called by the tested function,
// but saveTextToFile is fairly isolated.
jest.mock('./helpers', () => {
  const originalModule = jest.requireActual('./helpers');
  return {
    __esModule: true,
    ...originalModule,
    logMessage: jest.fn(),
  };
});

describe('saveTextToFile', () => {
  let mockAnchor: HTMLAnchorElement;
  let appendChildSpy: jest.SpyInstance<Node, [Node]>;
  let removeChildSpy: jest.SpyInstance<Node, [Node]>;
  let createObjectURLSpy: jest.SpyInstance<string, [blob: Blob | MediaSource]>;
  let revokeObjectURLSpy: jest.SpyInstance<void, [url: string]>;
  let createElementSpy: jest.SpyInstance<HTMLAnchorElement, [tagName: string, options?: ElementCreationOptions]>;
  let clickSpy: jest.Mock<any, any>;
  let mockBlobInstance: Blob;

  // Store original implementations
  let originalCreateElement: (tagName: string, options?: ElementCreationOptions) => HTMLElement;
  let originalAppendChild: <T extends Node>(node: T) => T;
  let originalRemoveChild: <T extends Node>(node: T) => T;
  let originalCreateObjectURL: (obj: Blob | MediaSource) => string;
  let originalRevokeObjectURL: (url: string) => void;
  let OriginalBlob: typeof Blob;


  beforeEach(() => {
    // Mock anchor element
    clickSpy = jest.fn();
    mockAnchor = {
      href: '',
      setAttribute: jest.fn(),
      click: clickSpy,
      style: {} as CSSStyleDeclaration, // Add other properties if accessed
    } as any as HTMLAnchorElement; // Type assertion

    // Store original implementations before mocking
    originalCreateElement = document.createElement;
    originalAppendChild = document.body.appendChild;
    originalRemoveChild = document.body.removeChild;
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    OriginalBlob = global.Blob;


    // Spy on document.createElement and return our mock anchor
    createElementSpy = jest.spyOn(document, 'createElement').mockReturnValue(mockAnchor);
    
    // Spy on document.body.appendChild and document.body.removeChild
    appendChildSpy = jest.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    removeChildSpy = jest.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

    // Spy on URL.createObjectURL and URL.revokeObjectURL
    createObjectURLSpy = jest.spyOn(URL, 'createObjectURL').mockReturnValue('mock-object-url');
    revokeObjectURLSpy = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    // Mock Blob
    mockBlobInstance = {
      size: 0,
      type: '',
      arrayBuffer: jest.fn(),
      slice: jest.fn(),
      stream: jest.fn(),
      text: jest.fn(),
    } as any as Blob;

    global.Blob = jest.fn().mockImplementation((contentParts, options) => {
      mockBlobInstance.size = contentParts[0] ? contentParts[0].length : 0;
      mockBlobInstance.type = options ? options.type : '';
      return mockBlobInstance;
    }) as any;
  });

  afterEach(() => {
    // Restore all mocks to their original implementations
    jest.restoreAllMocks();
    
    // Additionally restore globals if they were directly assigned
    document.createElement = originalCreateElement;
    document.body.appendChild = originalAppendChild;
    document.body.removeChild = originalRemoveChild;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    global.Blob = OriginalBlob;
  });

  it('should correctly create a blob, trigger a download with .txt extension, and clean up', () => {
    const content = 'Hello, test world!';
    const filenameWithoutExtension = 'test_output';
    const expectedFilenameWithExtension = `${filenameWithoutExtension}.txt`;

    saveTextToFile(content, filenameWithoutExtension);

    expect(global.Blob).toHaveBeenCalledTimes(1);
    expect(global.Blob).toHaveBeenCalledWith([content], { type: 'text/plain;charset=utf-8' });

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(createObjectURLSpy).toHaveBeenCalledWith(mockBlobInstance);
    
    expect(createElementSpy).toHaveBeenCalledTimes(1);
    expect(createElementSpy).toHaveBeenCalledWith('a');
    
    expect(mockAnchor.href).toBe('mock-object-url');
    expect(mockAnchor.setAttribute).toHaveBeenCalledTimes(1);
    expect(mockAnchor.setAttribute).toHaveBeenCalledWith('download', expectedFilenameWithExtension);
    
    expect(appendChildSpy).toHaveBeenCalledTimes(1);
    expect(appendChildSpy).toHaveBeenCalledWith(mockAnchor);
    
    expect(clickSpy).toHaveBeenCalledTimes(1);
    
    expect(removeChildSpy).toHaveBeenCalledTimes(1);
    expect(removeChildSpy).toHaveBeenCalledWith(mockAnchor);
    
    expect(revokeObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('mock-object-url');
  });

  it('should use the provided filename if it already has .txt extension', () => {
    const content = 'Another test.';
    const filenameWithExtension = 'another_output.txt';

    saveTextToFile(content, filenameWithExtension);

    expect(global.Blob).toHaveBeenCalledWith([content], { type: 'text/plain;charset=utf-8' });
    expect(mockAnchor.setAttribute).toHaveBeenCalledWith('download', filenameWithExtension);
  });
  
  it('should handle empty content string', () => {
    const content = '';
    const filename = 'empty_content.txt';

    saveTextToFile(content, filename);

    expect(global.Blob).toHaveBeenCalledWith([''], { type: 'text/plain;charset=utf-8' });
    expect(mockAnchor.setAttribute).toHaveBeenCalledWith('download', filename);
    expect(clickSpy).toHaveBeenCalled();
  });
});

describe('sanitizeFilename', () => {
  // Import the actual sanitizeFilename for testing, logMessage will remain mocked from the setup above.
  const { sanitizeFilename } = jest.requireActual('./helpers');

  it('should return valid titles as is', () => {
    expect(sanitizeFilename('ValidTitle123')).toBe('ValidTitle123');
  });

  it('should replace spaces with underscores', () => {
    expect(sanitizeFilename('Title With Spaces')).toBe('Title_With_Spaces');
  });

  it('should replace multiple spaces with a single underscore', () => {
    expect(sanitizeFilename('Title  With   Multiple   Spaces')).toBe('Title_With_Multiple_Spaces');
  });

  it('should remove invalid characters <>:"/\\|?*', () => {
    expect(sanitizeFilename('Title<With>Invalid"Chars:/\\|?*')).toBe('Title_With_Invalid_Chars_');
  });

  it('should replace multiple consecutive invalid characters with a single underscore', () => {
    expect(sanitizeFilename('Title<<>>With**Invalid//Chars')).toBe('Title_With_Invalid_Chars');
  });
  
  it('should handle mixed spaces and invalid characters', () => {
    expect(sanitizeFilename('Title <With> Invalid Chars?*')).toBe('Title_With_Invalid_Chars_');
  });

  it('should return "Untitled" for an empty title', () => {
    expect(sanitizeFilename('')).toBe('Untitled');
  });

  it('should return "Untitled" for a title consisting only of invalid characters or spaces', () => {
    expect(sanitizeFilename('   ')).toBe('Untitled');
    expect(sanitizeFilename('<>/?*')).toBe('Untitled');
    expect(sanitizeFilename('  <>?*  ')).toBe('Untitled');
  });

  it('should truncate very long titles to 100 characters', () => {
    const longTitle = 'a'.repeat(150);
    expect(sanitizeFilename(longTitle).length).toBe(100);
    expect(sanitizeFilename(longTitle)).toBe('a'.repeat(100));
  });

  it('should truncate long titles with spaces and invalid chars correctly', () => {
    const longTitle = 'This is a very long title with spaces and invalid characters like < > " : / \\ | ? * that should be sanitized and truncated'.repeat(3);
    const sanitized = sanitizeFilename(longTitle);
    expect(sanitized.length).toBe(100);
    // Check that the beginning is what we expect after sanitization
    expect(sanitized.startsWith('This_is_a_very_long_title_with_spaces_and_invalid_characters_like_')).toBe(true);
  });

  it('should not end with an underscore if the original title does not warrant it after truncation', () => {
    const title = 'a'.repeat(99) + 'b'; // Length 100
    expect(sanitizeFilename(title)).toBe(title);
    const title2 = 'a'.repeat(100) + 'b'; // Length 101, 'b' is truncated
    expect(sanitizeFilename(title2)).toBe('a'.repeat(100));
  });
  
  it('should handle titles that become empty after removing invalid characters before truncation', () => {
    expect(sanitizeFilename('<>:"/\\|?*'.repeat(20))).toBe('Untitled');
  });
});

describe('generateUniqueFilename (simulation for Sidebar logic)', () => {
  const { sanitizeFilename } = jest.requireActual('./helpers');

  // This simulates the core filename generation logic from Sidebar.tsx's handleNewAiOutputForAutoSave
  const generateTestFilename = (title: string, counters: Record<string, number>): { filename: string, newCounters: Record<string, number> } => {
    const baseFilename = sanitizeFilename(title);
    const currentCounter = counters[baseFilename] || 1;
    const filename = `${baseFilename}_${currentCounter}.txt`;
    
    const newCounters = {
      ...counters,
      [baseFilename]: currentCounter + 1,
    };
    return { filename, newCounters };
  };

  it('should generate unique filenames with incrementing counters for the same title', () => {
    let counters: Record<string, number> = {};
    const title = "My Test Page";

    // First call
    let result = generateTestFilename(title, counters);
    expect(result.filename).toBe("My_Test_Page_1.txt");
    counters = result.newCounters;

    // Second call
    result = generateTestFilename(title, counters);
    expect(result.filename).toBe("My_Test_Page_2.txt");
    counters = result.newCounters;

    // Third call
    result = generateTestFilename(title, counters);
    expect(result.filename).toBe("My_Test_Page_3.txt");
    counters = result.newCounters;
  });

  it('should handle different titles independently', () => {
    let counters: Record<string, number> = {};
    const title1 = "First Page";
    const title2 = "Second Page";

    // First call for title1
    let result1 = generateTestFilename(title1, counters);
    expect(result1.filename).toBe("First_Page_1.txt");
    counters = result1.newCounters;

    // First call for title2
    let result2 = generateTestFilename(title2, counters);
    expect(result2.filename).toBe("Second_Page_1.txt");
    counters = result2.newCounters;
    
    // Second call for title1
    result1 = generateTestFilename(title1, counters);
    expect(result1.filename).toBe("First_Page_2.txt");
    counters = result1.newCounters;

    // Check counters state
    expect(counters["First_Page"]).toBe(3);
    expect(counters["Second_Page"]).toBe(2);
  });

  it('should use "Untitled" as base if sanitized title is empty, and increment', () => {
    let counters: Record<string, number> = {};
    const title = "???"; // Will be sanitized to "Untitled"

    // First call
    let result = generateTestFilename(title, counters);
    expect(result.filename).toBe("Untitled_1.txt");
    counters = result.newCounters;

    // Second call
    result = generateTestFilename(title, counters);
    expect(result.filename).toBe("Untitled_2.txt");
    counters = result.newCounters;
  });
});
