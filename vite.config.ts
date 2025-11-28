import { defineConfig } from 'vite';
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
			await new Promise(resolve => setTimeout(resolve, 100));
			
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

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
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
		// PWA support
		VitePWA({
			registerType: 'autoUpdate',
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
				// Workbox options
				globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,gif,webp}'],
				navigateFallbackDenylist: [
					/^\/api\//,
					/^\/__better-auth__/,
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
					ui: ['./src/components/ErrorBoundary.tsx']
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
		// Proxy API calls to local backend for chatbot endpoints only
		// Management endpoints (auth, organizations CRUD, payment, subscription) are handled by remote API
		// and will bypass the proxy entirely, using remote API via frontend helpers
		proxy: {
			'/api/agent': {
				target: 'http://localhost:8787',
				changeOrigin: true,
				secure: false,
				configure: (proxy: any, _options: any) => {
					proxy.on('error', (err: Error, _req: any, _res: any) => {
						console.log('proxy error', err);
					});
					proxy.on('proxyReq', (_proxyReq: any, req: any, _res: any) => {
						console.log('Sending Request to the Target:', req.method, req.url);
					});
					proxy.on('proxyRes', (proxyRes: any, req: any, _res: any) => {
						console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
					});
				},
			},
			'/api/sessions': {
				target: 'http://localhost:8787',
				changeOrigin: true,
				secure: false,
			},
			'/api/files': {
				target: 'http://localhost:8787',
				changeOrigin: true,
				secure: false,
			},
			'/api/activity': {
				target: 'http://localhost:8787',
				changeOrigin: true,
				secure: false,
			},
			'/api/analyze': {
				target: 'http://localhost:8787',
				changeOrigin: true,
				secure: false,
			},
			'/api/review': {
				target: 'http://localhost:8787',
				changeOrigin: true,
				secure: false,
			},
			'/api/pdf': {
				target: 'http://localhost:8787',
				changeOrigin: true,
				secure: false,
			},
			'/api/debug': {
				target: 'http://localhost:8787',
				changeOrigin: true,
				secure: false,
			},
			'/api/status': {
				target: 'http://localhost:8787',
				changeOrigin: true,
				secure: false,
			},
			'/api/config': {
				target: 'http://localhost:8787',
				changeOrigin: true,
				secure: false,
			},
			'/api/usage': {
				target: 'http://localhost:8787',
				changeOrigin: true,
				secure: false,
			},
			'/api/health': {
				target: 'http://localhost:8787',
				changeOrigin: true,
				secure: false,
			},
		}
	},
	// Environment variables for development
	define: {
		// Set VITE_API_URL for development mode to use localhost
		// In production builds, this will be undefined, triggering relative URL usage
		'import.meta.env.VITE_API_URL': JSON.stringify(process.env.NODE_ENV === 'development' ? 'http://localhost:8787' : undefined)
	}
});
