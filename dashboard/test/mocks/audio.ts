import { vi } from 'vitest';

let oscillatorCount = 0;

export function resetOscillatorCount() {
  oscillatorCount = 0;
}

export function getOscillatorCount() {
  return oscillatorCount;
}

class MockOscillator {
  type = 'sine';
  frequency = { value: 0 };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  constructor() {
    oscillatorCount++;
  }
}

class MockGain {
  gain = {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn();
}

class MockAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  createOscillator() {
    return new MockOscillator();
  }
  createGain() {
    return new MockGain();
  }
  resume = vi.fn();
}

export function installAudioContextMock() {
  if (typeof window !== 'undefined') {
    (window as any).AudioContext = MockAudioContext;
    (window as any).webkitAudioContext = MockAudioContext;
  }
}