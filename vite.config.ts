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

			const Beasties = (await import('beasties')).default;
			const beasties = new Beasties({
				preload: 'media',
				inlineFonts: true,
				pruneSource: true,
				compress: true,
				mergeStylesheets: true,
				minimumExternalSize: 4096,
				path: resolve(__dirname, 'dist'),
			});

			try {
				try {
					await fs.access('dist/index.html');
				} catch {
					console.warn('⚠️ dist/index.html not found, skipping critical CSS extraction');
					return;
				}

				const html = await fs.readFile('dist/index.html', 'utf8');
				const processed = await beasties.process(html);
				await fs.writeFile('dist/index.html', processed);
				console.log('✅ Critical CSS inlined successfully');
			} catch (e) {
				console.error('Error processing critical CSS:', e);
				// Don't fail the build if critical CSS extraction fails
			}
		}
	};
};

// Chunk size budgets (gzip KB). Violations warn locally, fail in CI.
const CHUNK_BUDGETS: Record<string, number> = {
	vendor: 80,
	i18n: 60,
	main: 180,
};
const bundleBudgetPlugin = (): Plugin => ({
	name: 'bundle-budget',
	apply: 'build',
	generateBundle(_options, bundle) {
		const violations: string[] = [];
		for (const [fileName, chunk] of Object.entries(bundle)) {
			if (chunk.type !== 'chunk') continue;
			const gzSize = zlib.gzipSync(Buffer.from(chunk.code)).length;
			const gzKB = Math.round(gzSize / 1024);
			const label = Object.keys(CHUNK_BUDGETS).find(k => fileName.includes(k));
			const budget = label ? CHUNK_BUDGETS[label] : CHUNK_BUDGETS.main;
			if (gzKB > budget) {
				violations.push(`  ${fileName}: ${gzKB}KB gz (budget: ${budget}KB)`);
			}
		}
		if (violations.length > 0) {
			const msg = `Bundle budget exceeded:\n${violations.join('\n')}`;
			if (process.env.CI) {
				throw new Error(msg);
			} else {
				console.warn(`\n⚠️ ${msg}\n`);
			}
		}
	},
});

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
	'clients',
	'onboarding',
	'practice',
	'preferences',
	'subscriptions',
	'subscription',
	'matters',
	'uploads',
	'widget',
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
		resolveId(id, _importer) {
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
		enforce: 'pre',
		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
					if (req.url) {
						// Strip query string FIRST so .html/.js detection works even when
						// query params are present (e.g. /mock-embed.html?slug=paul-yahoo).
						const urlPath = req.url.split('?')[0];
						if ((urlPath.endsWith('.html') || urlPath.endsWith('.js')) && urlPath !== '/index.html') {
							const publicDir = resolve(process.cwd(), 'public');
							// Path traversal protection: resolve full path and ensure it's within publicDir
							const requestedPath = resolve(publicDir, urlPath.replace(/^\/+/, ''));

							if (!requestedPath.startsWith(publicDir)) {
								next();
								return;
							}

							try {
								const content = await fs.readFile(requestedPath, 'utf-8');
								res.setHeader('Content-Type', urlPath.endsWith('.js') ? 'application/javascript' : 'text/html');
								res.end(content);
								return;
							} catch (_e) {
								// File not found in public/, let Vite handle it (SPA fallback or 404)
							}
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
					// Precache only app shell JS/CSS and PWA icons.
					// Images, HTML pages, and widget assets are served by Cloudflare Pages directly.
					globPatterns: ['assets/**/*.{js,css}'],
					globIgnores: [],
					navigateFallbackDenylist: [
						// Never route API or auth requests through the SPA
						/^\/api\//,
						/^\/__better-auth__/,
						// Never intercept standalone static pages or widget assets
						/\/widget-[^/]+$/,
						/\.html$/,
					],
					runtimeCaching: []
				}
			}),
			// Process HTML with critical CSS extraction
			createHtmlPlugin({
				minify: true,
				inject: {
					data: {
						title: 'Blawby Chat',
						description: 'Chat interface for Blawby AI assistant',
						workerApiOrigin: (() => {
							try {
								const raw = process.env.VITE_WORKER_API_URL ?? '';
								return raw ? new URL(raw).origin : '';
							} catch {
								return '';
							}
						})(),
					}
				}
			}),
			// Critical CSS extraction
			criticalCssPlugin(),
			// Bundle size budget enforcement (warns locally, fails in CI)
			bundleBudgetPlugin(),
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
						vendor: ['preact', 'preact/hooks', 'preact/jsx-runtime', 'preact/compat', 'nanostores', '@nanostores/preact'],
						i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
						stripe: ['@stripe/stripe-js', '@stripe/react-stripe-js'],
						markdown: ['react-markdown', 'remark-gfm'],
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
				'node:worker_threads': resolve(__dirname, 'tests/stubs/worker_threads.ts'),
				// Force the non-DOM build of decode-named-character-reference so the
				// markdown chunk doesn't blow up during Node-side prerender.
				'decode-named-character-reference': resolve(__dirname, 'node_modules/decode-named-character-reference/index.js')
			}
		},
		server: {
			host: true,
			port: 5137,      // Matches your current setup
			strictPort: true, // Fail if port is busy (tunnel expects this exact port)
			allowedHosts: ['local.blawby.com'], // Allow the public tunnel domain
			watch: {
				ignored: [
					'**/.tmp/**',
					'**/test-results/**',
					'**/playwright-report/**',
					'**/.playwright-artifacts-*/**',
					'**/trace.zip',
					'**/*.trace',
					'**/*.network',
				],
			},
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
