import { type ConfigEnv, type ProxyOptions, defineConfig, loadEnv } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import { VitePWA } from 'vite-plugin-pwa';
import { createHtmlPlugin } from 'vite-plugin-html';
import { promises as fs } from 'fs';
import { Plugin } from 'vite';
import zlib from 'zlib';

// Custom compression plugin to avoid path issues
interface CompressionOptions {
	algorithm?: 'gzip' | 'brotli';
	ext?: string;
	threshold?: number;
}

const customCompressionPlugin = (options: CompressionOptions = {}): Plugin => {
	const {
		algorithm = 'gzip',
		ext = algorithm === 'brotli' ? '.br' : '.gz',
		threshold = 1024, // 1KB
	} = options;

	return {
		name: 'custom-compression',
		apply: 'build',
		async writeBundle(_: unknown, bundle: Record<string, unknown>) {
			const compressFunction = algorithm === 'brotli'
				? zlib.brotliCompressSync
				: zlib.gzipSync;

			for (const [fileName, file] of Object.entries(bundle)) {
				const fileInfo = file as { type?: string };
				if (fileInfo.type === 'chunk' || fileInfo.type === 'asset') {
					const filePath = resolve('dist', fileName);
					try {
						const source = await fs.readFile(filePath);
						if (source.length > threshold) {
							// Skip small files
							const compressed = compressFunction(source);
							await fs.writeFile(filePath + ext, compressed);
							console.log(`[custom-compression] Compressed ${fileName}: ${source.length}B → ${compressed.length}B`);
						}
					} catch (err) {
						console.warn(`[custom-compression] Error compressing ${fileName}:`, err);
					}
				}
			}
		}
	};
};

// Create a plugin for critical CSS extraction
const criticalCssPlugin = (): Plugin => {
	return {
		name: 'critical-css-inline',
		apply: 'build',
		enforce: 'post', // Ensure this runs after all other plugins
		async closeBundle() {
			// Wait a bit to ensure all files are written
			await new Promise<void>((resolve) => {
				globalThis.setTimeout(() => resolve(), 100);
			});

			const Critters = (await import('critters')).default;
			const critters = new Critters({
				// Critters options
				preload: 'media',
				inlineFonts: true,
				pruneSource: true,
				compress: true,
				mergeStylesheets: true,
				minimumExternalSize: 4096, // Files larger than this will not be inlined (4kb)
				path: resolve(__dirname, 'dist'), // Add explicit path to resolve stylesheet issues
			});

			try {
				// Check if index.html exists before processing
				try {
					await fs.access('dist/index.html');
				} catch {
					console.warn('⚠️ dist/index.html not found, skipping critical CSS extraction');
					return;
				}

				// Process the main HTML file
				const html = await fs.readFile('dist/index.html', 'utf8');
				const processed = await critters.process(html, { path: 'dist/index.html' });
				await fs.writeFile('dist/index.html', processed);
				console.log('✅ Critical CSS inlined successfully');
			} catch (e) {
				console.error('Error processing critical CSS:', e);
				// Don't fail the build if critical CSS extraction fails
			}
		}
	};
};

// Worker API endpoints (proxied to localhost:8787)
const workerEndpoints = [
	'agent',
	'auth',
	'sessions',
	'conversations',
	'files',
	'geo/autocomplete',
	'health',
	'intakes',
	'notifications',
	'config',
	'status',
	'ai',
	'practices',
	'user-details',
	'onboarding',
	'practice',
	'preferences',
	'subscriptions',
	'subscription',
	'matters',
	'uploads',
];

// Proxy configuration types from http-proxy-middleware
const createWorkerProxyConfig = (): ProxyOptions => ({
	target: 'http://localhost:8787',
	changeOrigin: true,
	secure: false,
	ws: true,
	configure: (proxy) => {
		proxy.on('error', (err: Error) => {
			console.log('[Vite Proxy] Worker proxy error:', err);
		});
		proxy.on('proxyReq', (_proxyReq, req) => {
			console.log('[Vite Proxy] Worker →', req.method, req.url);
		});
		proxy.on('proxyRes', (proxyRes, req) => {
			console.log('[Vite Proxy] Worker ←', proxyRes.statusCode, req.url);
		});
	},
});

import { createRequire } from 'module';

const buildProxyEntries = (): Record<string, ProxyOptions> => {
	const entries: Record<string, ProxyOptions> = {};

	// Worker API endpoints (always proxied to localhost:8787)
	workerEndpoints.forEach((endpoint) => {
		entries[`/api/${endpoint}`] = createWorkerProxyConfig();
	});

	return entries;
};

// Plugin to fix decode-named-character-reference during prerendering
const fixDecodeNamedCharacterReference = (): Plugin => {
	return {
		name: 'fix-decode-named-character-reference',
		configResolved(config) {
			// Override the conditions to force non-DOM version during build
			config.build.rollupOptions = {
				...config.build.rollupOptions,
				onwarn(warning, warn) {
					// Suppress warnings about this specific package
					if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
					warn(warning);
				}
			};
		},
		resolveId(id, importer) {
			if (id === 'decode-named-character-reference') {
				// Dynamically resolve the package entry instead of hardcoding a pnpm path.
				// We want the non-DOM build (default export) so use Node resolution with
				// appropriate conditions. If resolution fails, log and return null so
				// Vite can fall back or surface an error.
				try {
					const req = createRequire(import.meta.url);
					// require.resolve will respect "exports" and choose the default
					// entry, which in this package is the non-DOM index.js.
					const resolved = req.resolve('decode-named-character-reference', { paths: [__dirname] });
					return resolved;
				} catch (err) {
					console.error('[vite] failed to resolve decode-named-character-reference:', err);
					return null;
				}
			}
			return null;
		},
		load(id) {
			if (id.includes('decode-named-character-reference') && id.endsWith('index.js')) {
				// Return the content of the non-DOM version
				return null; // Let Vite handle loading the file
			}
			return null;
		}
	};
};

// Plugin to force Vite to serve static HTML files from public/ instead of SPA fallback
const serveStaticHtmlPlugin = (): Plugin => {
	return {
		name: 'serve-static-html',
		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				if (req.url && req.url.endsWith('.html') && req.url !== '/index.html') {
					// Clean URL of query params
					const urlPath = req.url.split('?')[0];
					const publicPath = resolve(process.cwd(), 'public', urlPath.slice(1));
					try {
						const content = await fs.readFile(publicPath, 'utf-8');
						res.setHeader('Content-Type', 'text/html');
						res.end(content);
						return;
					} catch (e) {
						// File not found in public/, let Vite handle it
					}
				}
				next();
			});
		}
	};
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }: ConfigEnv) => {
	const env = loadEnv(mode, process.cwd(), '');
	return {
		envPrefix: ['VITE_'],
		plugins: [
			serveStaticHtmlPlugin(),
			fixDecodeNamedCharacterReference(),
			preact({
				prerender: {
					enabled: true,
					renderTarget: '#app',
				},
			}),
			// Replace with custom compression
			customCompressionPlugin({ algorithm: 'gzip' }),
			customCompressionPlugin({ algorithm: 'brotli' }),
			// Bundle visualization for production builds
			visualizer({
				gzipSize: true,
				brotliSize: true,
				open: false, // Set to true to auto-open visualization after build
				filename: 'dist/stats.html',
			}),
			// PWA support — disabled in dev so the service worker never intercepts
			// static files (widget-test.html, widget-loader.js) during local development.
			// In production, Cloudflare Pages + _headers/_redirects handle routing.
			VitePWA({
				registerType: 'autoUpdate',
				// ↓ KEY: disable the SW in dev mode entirely
				devOptions: {
					enabled: false,
				},
				includeAssets: ['favicon.svg'],
				manifest: {
					name: 'Blawby Chat',
					short_name: 'Blawby Chat',
					description: 'Chat interface for Blawby AI assistant',
					theme_color: '#ffffff',
					background_color: '#ffffff',
					display: 'standalone',
					icons: [
						{
							src: 'favicon.svg',
							sizes: '192x192',
							type: 'image/svg+xml',
							purpose: 'any maskable'
						},
						{
							src: 'favicon.svg',
							sizes: '512x512',
							type: 'image/svg+xml',
							purpose: 'any maskable'
						}
					]
				},
				workbox: {
					// Precache app shell assets only — exclude static standalone pages
					// and the widget script (they are served directly by Cloudflare Pages).
					globPatterns: ['**/*.{js,css,svg,png,jpg,jpeg,gif,webp}'],
					globIgnores: [
						'widget-loader.js',
						'widget-test.html',
						'stats.html',
					],
					navigateFallbackDenylist: [
						// Never route API or auth requests through the SPA
						/^\/api\//,
						/^\/__better-auth__/,
						// Never intercept standalone static pages or widget assets
						/\/widget-[^/]+$/,
						/\.html$/,
					],
					runtimeCaching: [
						{
							urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
							handler: 'CacheFirst',
							options: {
								cacheName: 'google-fonts-cache',
								expiration: {
									maxEntries: 10,
									maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
								},
								cacheableResponse: {
									statuses: [0, 200]
								}
							}
						}
					]
				}
			}),
			// Process HTML with critical CSS extraction
			createHtmlPlugin({
				minify: true,
				inject: {
					data: {
						title: 'Blawby Chat',
						description: 'Chat interface for Blawby AI assistant',
					}
				}
			}),
			// Critical CSS extraction
			criticalCssPlugin(),
		],
		build: {
			minify: 'terser',
			terserOptions: {
				compress: {
					drop_console: true,
					passes: 2,
					drop_debugger: true,
					pure_funcs: ['console.log', 'console.info', 'console.debug'],
				},
				format: {
					comments: false
				}
			},
			rollupOptions: {
				input: {
					main: resolve(__dirname, 'index.html'),
				},
				output: {
					dir: 'dist',
					entryFileNames: 'assets/[name]-[hash].js',
					chunkFileNames: 'assets/[name]-[hash].js',
					assetFileNames: ({ name }) => {
						// Different output paths for different asset types
						if (/\.(gif|jpe?g|png|svg|webp)$/.test(name ?? '')) {
							return 'assets/images/[name]-[hash][extname]';
						}
						if (/\.(woff2?|eot|ttf|otf)$/.test(name ?? '')) {
							return 'assets/fonts/[name]-[hash][extname]';
						}
						return 'assets/[name]-[hash][extname]';
					},
					// Manualchunks configuration for better code splitting
					manualChunks: {
						vendor: ['preact', 'preact/hooks', 'preact/jsx-runtime', 'preact/compat'],
						ui: ['./src/app/ErrorBoundary.tsx']
					}
				},
			},
			cssCodeSplit: true,
			reportCompressedSize: true,
			emptyOutDir: true,
			sourcemap: false,  // Change to true for development
			target: 'esnext', // Modern browsers for better optimization
			assetsInlineLimit: 4096, // 4kb - small assets will be inlined
		},
		optimizeDeps: {
			include: ['preact', 'preact/hooks', 'preact/compat', 'preact/jsx-runtime', 'i18next', 'react-i18next', 'i18next-browser-languagedetector'],
		},
		resolve: {
			dedupe: ['preact', 'preact/compat', 'react', 'react-dom'],
			alias: {
				'@': resolve(__dirname, './src'),
				'react': 'preact/compat',
				'react-dom': 'preact/compat',
				'react/jsx-runtime': 'preact/jsx-runtime',
				'worker_threads': resolve(__dirname, 'tests/stubs/worker_threads.ts'),
				'node:worker_threads': resolve(__dirname, 'tests/stubs/worker_threads.ts')
			}
		},
		server: {
			host: true,
			port: 5137,      // Matches your current setup
			strictPort: true, // Fail if port is busy (tunnel expects this exact port)
			allowedHosts: ['local.blawby.com'], // Allow the public tunnel domain
			hmr: {
				protocol: 'wss',
				host: 'local.blawby.com',
				clientPort: 443
			},
			proxy: {
				...buildProxyEntries(),

				'/api': {
					target: env.VITE_BACKEND_API_URL, // e.g. https://production-api.blawby.com
					changeOrigin: true,
					secure: true,
				}
			}
		}
	}
	// Note: URL configuration is now centralized in src/config/urls.ts
	// No need to override environment variables here - use .env file or Cloudflare Pages settings
});
