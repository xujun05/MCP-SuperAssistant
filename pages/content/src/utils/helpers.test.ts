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
