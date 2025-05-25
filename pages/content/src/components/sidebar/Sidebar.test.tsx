// @ts-nocheck
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import Sidebar from './Sidebar'; // Adjust path as necessary
import { getSidebarPreferences, saveSidebarPreferences } from '@src/utils/storage';
import { useSiteAdapter } from '@src/adapters/adapterRegistry';
import { useBackgroundCommunication } from './hooks/backgroundCommunication';

// --- Mocks ---
jest.mock('@src/utils/storage', () => ({
  getSidebarPreferences: jest.fn(),
  saveSidebarPreferences: jest.fn(),
}));

jest.mock('@src/adapters/adapterRegistry', () => ({
  useSiteAdapter: jest.fn(),
}));

jest.mock('./hooks/backgroundCommunication', () => ({
  useBackgroundCommunication: jest.fn(),
}));

// Mock other global dependencies or chrome APIs
global.chrome = {
  runtime: {
    getURL: jest.fn(path => path), // Simple mock for getURL
    id: 'test-extension-id', // Mock extension ID
    // Mock other chrome.runtime properties if needed by the component
  },
  // Mock other chrome APIs like chrome.storage if directly used (though here it's via our mocked storage module)
} as any;

// Mock for mcpTools global object
if (typeof window !== 'undefined') {
  (window as any).mcpTools = {
    getMasterToolDict: jest.fn(() => ({})),
    clearAllTools: jest.fn(),
  };
  // Mock for activeSidebarManager global (if its methods are called directly)
  (window as any).activeSidebarManager = {
    applyThemeClass: jest.fn(),
    getIsVisible: jest.fn(() => true),
    setPushContentMode: jest.fn(),
    updatePushModeStyles: jest.fn(),
    getShadowHost: jest.fn(() => ({ shadowRoot: {} })), // Mock for debugStyles button
  };
}

// Mock ResizeObserver - often needed for components that use resize listeners
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserver;


// --- Test Suite ---
describe('Sidebar - Auto-Save Preference Toggle', () => {
  // Default mock implementations for hooks and functions
  const mockGetSidebarPreferences = getSidebarPreferences as jest.Mock;
  const mockSaveSidebarPreferences = saveSidebarPreferences as jest.Mock;
  const mockUseSiteAdapter = useSiteAdapter as jest.Mock;
  const mockUseBackgroundCommunication = useBackgroundCommunication as jest.Mock;

  beforeEach(() => {
    // Reset all mocks before each test
    mockGetSidebarPreferences.mockReset();
    mockSaveSidebarPreferences.mockReset();
    mockUseSiteAdapter.mockReset();
    mockUseBackgroundCommunication.mockReset();

    // Provide default return values for hooks
    mockUseSiteAdapter.mockReturnValue({
      name: 'MockAdapter',
      hostname: 'mock.com',
      insertTextIntoInput: jest.fn(),
      triggerSubmission: jest.fn(),
      getAiOutput: jest.fn().mockResolvedValue('mock AI output'),
      setNewOutputListener: jest.fn(),
      supportsFileUpload: jest.fn(() => false),
      attachFile: jest.fn().mockResolvedValue(false),
    });

    mockUseBackgroundCommunication.mockReturnValue({
      serverStatus: 'connected',
      availableTools: [],
      sendMessage: jest.fn().mockResolvedValue('mock message response'),
      refreshTools: jest.fn().mockResolvedValue([]),
      forceReconnect: jest.fn().mockResolvedValue(true),
    });

    // Default preferences for most tests
    mockGetSidebarPreferences.mockResolvedValue({
      isPushMode: false,
      sidebarWidth: 320,
      isMinimized: false,
      autoSubmit: false,
      theme: 'system',
      autoSaveEnabled: false, // Default to false for autoSave
    });
    
    mockSaveSidebarPreferences.mockResolvedValue(undefined);
  });

  test('initializes toggle state from preferences (autoSaveEnabled: true)', async () => {
    mockGetSidebarPreferences.mockResolvedValueOnce({ autoSaveEnabled: true });
    
    await act(async () => {
      render(<Sidebar />);
    });

    // Wait for the component to settle after async operations (like loading preferences)
    // Using findByRole which waits for the element
    const toggleSwitch = await screen.findByRole('switch', { name: /Automatically Save AI Outputs/i });
    expect(toggleSwitch).toBeChecked();
  });

  test('initializes toggle state from preferences (autoSaveEnabled: false)', async () => {
    mockGetSidebarPreferences.mockResolvedValueOnce({ autoSaveEnabled: false });
    
    await act(async () => {
      render(<Sidebar />);
    });
    
    const toggleSwitch = await screen.findByRole('switch', { name: /Automatically Save AI Outputs/i });
    expect(toggleSwitch).not.toBeChecked();
  });

  test('updates and saves preference when toggle is clicked from false to true', async () => {
    const initialPrefs = { 
      isPushMode: false,
      sidebarWidth: 300,
      isMinimized: false,
      autoSubmit: false,
      theme: 'dark',
      autoSaveEnabled: false 
    };
    mockGetSidebarPreferences.mockResolvedValueOnce(initialPrefs);
    
    await act(async () => {
      render(<Sidebar />);
    });

    const toggleSwitch = await screen.findByRole('switch', { name: /Automatically Save AI Outputs/i });
    expect(toggleSwitch).not.toBeChecked(); // Initial state

    await act(async () => {
      fireEvent.click(toggleSwitch);
    });
    
    expect(toggleSwitch).toBeChecked(); // UI state updated

    // Wait for the debounce in saveSidebarPreferences to complete
    // (useEffect in Sidebar saves preferences with a 300ms debounce)
    await waitFor(() => {
      expect(mockSaveSidebarPreferences).toHaveBeenCalledTimes(1);
      expect(mockSaveSidebarPreferences).toHaveBeenCalledWith({
        ...initialPrefs,
        autoSaveEnabled: true, // The toggled value
      });
    }, { timeout: 500 }); // Wait a bit longer than the debounce
  });

  test('updates and saves preference when toggle is clicked from true to false', async () => {
    const initialPrefs = { 
      isPushMode: true,
      sidebarWidth: 400,
      isMinimized: false,
      autoSubmit: true,
      theme: 'light',
      autoSaveEnabled: true
    };
    mockGetSidebarPreferences.mockResolvedValueOnce(initialPrefs);
    
    await act(async () => {
      render(<Sidebar />);
    });

    const toggleSwitch = await screen.findByRole('switch', { name: /Automatically Save AI Outputs/i });
    expect(toggleSwitch).toBeChecked(); // Initial state

    await act(async () => {
      fireEvent.click(toggleSwitch);
    });
    
    expect(toggleSwitch).not.toBeChecked(); // UI state updated

    await waitFor(() => {
      expect(mockSaveSidebarPreferences).toHaveBeenCalledTimes(1);
      expect(mockSaveSidebarPreferences).toHaveBeenCalledWith({
        ...initialPrefs,
        autoSaveEnabled: false, // The toggled value
      });
    }, { timeout: 500 });
  });
});
