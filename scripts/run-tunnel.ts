#!/usr/bin/env node

/**
 * Script to run cloudflared tunnel with token from environment variable
 * 
 * Usage:
 *   CLOUDFLARE_TUNNEL_TOKEN=your-token npm run tunnel
 * 
 * Or set in .env file:
 *   CLOUDFLARE_TUNNEL_TOKEN=your-token
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
function loadEnvVar(varName: string): string | null {
    let value = process.env[varName] ?? null;

    if (!value) {
        try {
            const envFile = join(projectRoot, '.env');
            const envContent = readFileSync(envFile, 'utf-8');
            for (const line of envContent.split('\n')) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                if (trimmed.startsWith(`${varName}=`)) {
                    const idx = trimmed.indexOf('=');
                    value = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, '') || null;
                    break;
                }
            }
        } catch {
            // .env file doesn't exist or can't be read, that's okay
        }
    }

    if (!value) {
        try {
            const devVarsFile = join(projectRoot, 'worker', '.dev.vars');
            const envContent = readFileSync(devVarsFile, 'utf-8');
            for (const line of envContent.split('\n')) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                if (trimmed.startsWith(`${varName}=`)) {
                    const idx = trimmed.indexOf('=');
                    value = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, '') || null;
                    break;
                }
            }
        } catch {
            // worker/.dev.vars file doesn't exist or can't be read, that's okay
        }
    }

    return value;
}

const token = loadEnvVar('CLOUDFLARE_TUNNEL_TOKEN');
const originUrl = loadEnvVar('CLOUDFLARE_TUNNEL_URL') ?? 'http://localhost:5137';

if (!token) {
    console.error('❌ Error: CLOUDFLARE_TUNNEL_TOKEN is required');
    console.error('   Please set it in your .env file or as an environment variable:');
    console.error('   CLOUDFLARE_TUNNEL_TOKEN=your-token-here');
    console.error('');
    console.error('   To get your tunnel token:');
    console.error('   1. Go to: https://one.dash.cloudflare.com/');
    console.error('   2. Or run: cloudflared tunnel token <tunnel-name>');
    process.exit(1);
}

try {
    // Kill any orphaned cloudflared processes from previous runs that might
    // hold the tunnel open to a dead port and cause 502 Bad Gateway errors.
    if (process.platform === 'win32') {
        // Windows fallback for environments where pkill is unavailable.
        execSync('taskkill /IM cloudflared.exe /F', { stdio: 'ignore' });
    } else {
        execSync('pkill -f "cloudflared tunnel run"', { stdio: 'ignore' });
    }
} catch {
    // Non-zero exit is expected when no prior cloudflared process is running.
}

// Spawn cloudflared process with an explicit origin URL so local dev does not
// depend on managed ingress propagation for local.blawby.com.
const cloudflared: ChildProcess = spawn('cloudflared', ['tunnel', '--url', originUrl, 'run', '--token', token], {
    stdio: 'inherit',
    shell: false
});

cloudflared.on('error', (error: Error) => {
    console.error('❌ Failed to start cloudflared:', error.message);
    console.error('   Make sure cloudflared is installed: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/');
    process.exit(1);
});

cloudflared.on('exit', (code: number | null) => {
    process.exit(code || 0);
});

// Handle process termination
process.on('SIGINT', () => {
    cloudflared.kill('SIGINT');
});

process.on('SIGTERM', () => {
    cloudflared.kill('SIGTERM');
});
