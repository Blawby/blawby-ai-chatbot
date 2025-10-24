import '@testing-library/jest-dom';
import { vi, beforeAll, afterAll, afterEach } from 'vitest';
import { cleanup } from '@testing-library/preact';
import { spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { setTimeout as setTimeoutPromise } from 'timers/promises';
import { resetTestState } from '../src/__tests__/test-utils';

// Configuration for real API testing
const WORKER_URL = process.env.WORKER_URL ?? 'http://localhost:8787';
const WORKER_PORT = 8787;

// Global variables for managing wrangler dev process
let wranglerProcess: ChildProcess | null = null;

// For real API tests, we want to use the actual fetch
// Don't mock fetch - let it use the real implementation

// Only mock browser APIs that don't exist in Node.js environment
// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock matchMedia only if window exists (browser environment)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Mock URL.createObjectURL only if URL exists
if (typeof URL !== 'undefined') {
  global.URL.createObjectURL = vi.fn(() => 'mocked-url');
  global.URL.revokeObjectURL = vi.fn();
}

// Mock FileReader only if it exists
if (typeof FileReader !== 'undefined') {
  global.FileReader = vi.fn().mockImplementation(() => ({
    readAsDataURL: vi.fn(),
    readAsText: vi.fn(),
    readAsArrayBuffer: vi.fn(),
    result: null,
    error: null,
    onload: null,
    onerror: null,
    onloadend: null,
  })) as any;
  
  // Add static properties
  (global.FileReader as any).EMPTY = 0;
  (global.FileReader as any).LOADING = 1;
  (global.FileReader as any).DONE = 2;
}

// Helper function to kill processes on a specific port (cross-platform)
async function killProcessesOnPort(port: number): Promise<void> {
  const isWindows = process.platform === 'win32';
  
  return new Promise<void>((resolve, reject) => {
    let command: string;
    let args: string[];
    
    if (isWindows) {
      // Windows: use netstat to find PIDs, then taskkill to kill them
      command = 'netstat';
      args = ['-ano'];
    } else {
      // Unix-like: use lsof to find PIDs
      command = 'lsof';
      args = ['-ti', `:${port}`];
    }
    
    const findProcess = spawn(command, args, { stdio: 'pipe' });
    let output = '';
    let hasOutput = false;
    
    // Set up timeout to ensure promise always resolves
    const timeout = setTimeout(() => {
      if (!hasOutput) {
        console.log(`⏰ No processes found on port ${port} (timeout)`);
        resolve();
      }
    }, 5000);
    
    findProcess.stdout?.on('data', (data) => {
      hasOutput = true;
      output += data.toString();
    });
    
    findProcess.stdout?.on('close', async () => {
      clearTimeout(timeout);
      await handleProcessOutput(output, port, isWindows);
      resolve();
    });
    
    findProcess.on('error', (error) => {
      clearTimeout(timeout);
      console.warn(`⚠️ Failed to find processes on port ${port}:`, error.message);
      resolve(); // Don't reject - this is not critical
    });
  });
}

// Helper function to handle process output and kill processes
async function handleProcessOutput(output: string, port: number, isWindows: boolean): Promise<void> {
  if (!output.trim()) {
    console.log(`✅ No processes found on port ${port}`);
    return;
  }
  
  let pids: string[] = [];
  
  if (isWindows) {
    // Parse netstat output to find PIDs listening on the port
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes(`:${port}`) && line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && !pids.includes(pid)) {
          pids.push(pid);
        }
      }
    }
  } else {
    // Parse lsof output (just PIDs)
    pids = output.trim().split('\n').filter(Boolean);
  }
  
  if (pids.length === 0) {
    console.log(`✅ No processes found on port ${port}`);
    return;
  }
  
  console.log(`🔪 Killing existing processes on port ${port}: ${pids.join(', ')}`);
  
  // Kill each process
  await Promise.all(pids.map(pid => killProcess(pid, isWindows)));
}

// Helper function to kill a single process
async function killProcess(pid: string, isWindows: boolean): Promise<void> {
  return new Promise<void>((resolve) => {
    const command = isWindows ? 'taskkill' : 'kill';
    const args = isWindows ? ['/PID', pid, '/F'] : ['-9', pid];
    
    const killProcess = spawn(command, args, { stdio: 'pipe' });
    
    // Set up timeout to ensure promise always resolves
    const timeout = setTimeout(() => {
      console.warn(`⏰ Timeout killing process ${pid}`);
      resolve();
    }, 3000);
    
    killProcess.on('exit', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        console.log(`✅ Killed process ${pid}`);
      } else {
        console.warn(`⚠️ Failed to kill process ${pid} (exit code: ${code})`);
      }
      resolve();
    });
    
    killProcess.on('error', (error) => {
      clearTimeout(timeout);
      console.warn(`⚠️ Error killing process ${pid}:`, error.message);
      resolve();
    });
  });
}

// Helper function to wait for port to be free with retry loop
async function waitForPortToBeFree(port: number, timeoutMs: number = 10000): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 200; // Check every 200ms
  
  while (Date.now() - startTime < timeoutMs) {
    if (await isPortFree(port)) {
      console.log(`✅ Port ${port} is now free`);
      return;
    }
    await setTimeoutPromise(pollInterval);
  }
  
  throw new Error(`Port ${port} is still in use after ${timeoutMs}ms`);
}

// Helper function to check if port is free
async function isPortFree(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'netstat' : 'lsof';
    const args = isWindows ? ['-ano'] : ['-ti', `:${port}`];
    
    const checkProcess = spawn(command, args, { stdio: 'pipe' });
    let output = '';
    
    const timeout = setTimeout(() => {
      resolve(true); // Assume free if no response
    }, 2000);
    
    checkProcess.stdout?.on('data', (data) => {
      output += data.toString();
    });
    
    checkProcess.stdout?.on('end', () => {
      clearTimeout(timeout);
      if (isWindows) {
        // Check if any line contains our port in LISTENING state
        const isInUse = output.split('\n').some(line => 
          line.includes(`:${port}`) && line.includes('LISTENING')
        );
        resolve(!isInUse);
      } else {
        // lsof returns PIDs if port is in use, empty if free
        resolve(!output.trim());
      }
    });
    
    checkProcess.on('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        resolve(true); // Assume free if command failed
      }
    });
    
    checkProcess.on('error', () => {
      clearTimeout(timeout);
      resolve(true); // Assume free if command failed
    });
  });
}

// Helper function to start wrangler dev
async function startWranglerDev(): Promise<void> {
  // Preflight health check - if server is already running and healthy, return early
  try {
    const preflightResponse = await fetch(`${WORKER_URL}/api/health`);
    if (preflightResponse.ok) {
      console.log('✅ Wrangler dev server is already running and healthy');
      return;
    }
  } catch (error) {
    // Server not running, proceed to spawn
  }

  // If wranglerProcess is already set, check if it's healthy
  if (wranglerProcess) {
    try {
      const healthResponse = await fetch(`${WORKER_URL}/api/health`);
      if (healthResponse.ok) {
        console.log('✅ Existing wrangler dev server is healthy');
        return;
      }
    } catch (error) {
      // Existing process is not healthy, terminate and respawn
      console.log('⚠️ Existing wrangler dev server is not responding, terminating...');
      await stopWranglerDev();
    }
  }

  console.log('🚀 Starting wrangler dev server...');
  
  try {
    // Kill any existing processes on the port first
    await killProcessesOnPort(WORKER_PORT);
    // Wait for port to be free with retry loop
    await waitForPortToBeFree(WORKER_PORT);
  } catch (error) {
    console.warn('⚠️ Port cleanup failed:', error);
    // Continue anyway - the server might still start successfully
  }

  try {
    wranglerProcess = spawn('wrangler', ['dev', '--port', WORKER_PORT.toString(), '--local'], {
      stdio: 'pipe',
      shell: true,
      env: { ...process.env, NODE_ENV: 'test' }
    });

    // Capture output for debugging
    let output = '';
    wranglerProcess.stdout?.on('data', (data) => {
      output += data.toString();
      // Log important messages
      const message = data.toString();
      if (message.includes('Ready on') || message.includes('Local:') || message.includes('http://')) {
        console.log('📡 Wrangler output:', message.trim());
      }
    });

    wranglerProcess.stderr?.on('data', (data) => {
      const error = data.toString();
      console.log('⚠️ Wrangler stderr:', error.trim());
    });

    // Attach exit and error listeners to detect failures
    wranglerProcess.on('exit', (code, signal) => {
      console.log(`❌ Wrangler dev server exited with code ${code} and signal ${signal}`);
      console.log('📋 Last output:', output.slice(-500)); // Last 500 chars
      wranglerProcess = null;
    });

    wranglerProcess.on('error', (error) => {
      console.error('❌ Wrangler dev server error:', error);
      console.log('📋 Last output:', output.slice(-500)); // Last 500 chars
      wranglerProcess = null;
    });

    // Wait for server to start with exponential backoff
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds timeout
    let waitTime = 1000; // Start with 1 second
    
    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`${WORKER_URL}/api/health`, {
          signal: AbortSignal.timeout(5000) // 5 second timeout per request
        });
        if (response.ok) {
          console.log('✅ Wrangler dev server is ready');
          return;
        }
      } catch (error) {
        // Server not ready yet or request failed
        if (attempts % 10 === 0) { // Log every 10 attempts
          console.log(`⏳ Waiting for wrangler dev server... (attempt ${attempts + 1}/${maxAttempts})`);
        }
      }
      
      await setTimeoutPromise(waitTime);
      attempts++;
      
      // Exponential backoff with max 5 seconds
      waitTime = Math.min(waitTime * 1.1, 5000);
    }
    
    console.log('📋 Final output:', output.slice(-1000)); // Last 1000 chars
    throw new Error(`Wrangler dev server failed to start within ${maxAttempts} seconds`);
  } catch (error) {
    console.error('❌ Failed to spawn wrangler dev server:', error);
    wranglerProcess = null;
    throw error;
  }
}

// Helper function to stop wrangler dev
async function stopWranglerDev(): Promise<void> {
  if (!wranglerProcess) {
    return;
  }

  console.log('🛑 Stopping wrangler dev server...');
  
  return new Promise((resolve) => {
    wranglerProcess!.on('close', () => {
      console.log('✅ Wrangler dev server stopped');
      wranglerProcess = null;
      resolve();
    });
    
    wranglerProcess!.kill('SIGTERM');
    
    // Force kill after 5 seconds if graceful shutdown fails
    setTimeout(() => {
      if (wranglerProcess) {
        wranglerProcess.kill('SIGKILL');
        wranglerProcess = null;
        resolve();
      }
    });
  });
}

// Global setup - start wrangler dev before all tests
beforeAll(async () => {
  console.log('🧪 Setting up real API test environment...');
  
  try {
    await startWranglerDev();
    console.log('✅ Real API test environment ready');
  } catch (error) {
    console.error('❌ Failed to start wrangler dev:', error);
    throw error;
  }
});

// Global cleanup - stop wrangler dev after all tests
afterAll(async () => {
  console.log('🧹 Cleaning up real API test environment...');
  
  try {
    await stopWranglerDev();
    console.log('✅ Real API test cleanup complete');
  } catch (error) {
    console.error('❌ Failed to stop wrangler dev:', error);
  }
});

// Global test cleanup - run after each test
afterEach(() => {
  cleanup();
  resetTestState();
});

// Export helper functions for use in tests
export { WORKER_URL, startWranglerDev, stopWranglerDev };
