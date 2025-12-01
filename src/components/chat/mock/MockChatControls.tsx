import { FunctionComponent } from 'preact';
import { useMockChat } from '../../../hooks/useMockChat';

/**
 * Debug controls for mock chat mode
 * Add this component to your dev tools or settings
 */
export const MockChatControls: FunctionComponent = () => {
	const { isMockMode, setMockMode, clearMessages, resetToDefault, loadMockSet } = useMockChat();

	if (!isMockMode) {
		return (
			<div className="p-4 border border-gray-300 dark:border-gray-700 rounded-lg">
				<button
					onClick={() => setMockMode(true)}
					className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
				>
					Enable Mock Chat Mode
				</button>
				<p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
					Enable mock mode to preview the chat UI with demo data
				</p>
			</div>
		);
	}

	return (
		<div className="p-4 border border-yellow-300 dark:border-yellow-700 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
			<div className="flex items-center justify-between mb-4">
				<h3 className="font-semibold text-yellow-800 dark:text-yellow-200">
					🔧 Mock Chat Controls
				</h3>
				<button
					onClick={() => setMockMode(false)}
					className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
				>
					Disable Mock Mode
				</button>
			</div>
			
			<div className="space-y-2">
				<div className="flex gap-2">
					<button
						onClick={resetToDefault}
						className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
					>
						Reset to Default
					</button>
					<button
						onClick={clearMessages}
						className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
					>
						Clear Messages
					</button>
				</div>
				
				<div className="flex gap-2">
					<button
						onClick={() => loadMockSet('default')}
						className="px-3 py-1 text-sm bg-blue-200 dark:bg-blue-800 rounded hover:bg-blue-300 dark:hover:bg-blue-700"
					>
						Load Default Set
					</button>
					<button
						onClick={() => loadMockSet('avatars')}
						className="px-3 py-1 text-sm bg-blue-200 dark:bg-blue-800 rounded hover:bg-blue-300 dark:hover:bg-blue-700"
					>
						Load Avatars Set
					</button>
					<button
						onClick={() => loadMockSet('files')}
						className="px-3 py-1 text-sm bg-blue-200 dark:bg-blue-800 rounded hover:bg-blue-300 dark:hover:bg-blue-700"
					>
						Load Files Set
					</button>
				</div>
			</div>
		</div>
	);
};

