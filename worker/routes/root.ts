import type { Env } from '../types';

export async function handleRoot(_request: Request, _env: Env): Promise<Response> {
  return new Response(`
<!DOCTYPE html>
<html>
<head>
    <title>Blawby AI Chatbot API</title>
    <style>body { font-family: system-ui; max-width: 600px; margin: 40px auto; padding: 20px; }</style>
</head>
<body>
    <h1>Blawby Chatbot API</h1>
    <p>Legal assistance with matter building (AI functionality removed - user-to-user chat coming soon)</p>
    <ul>
        <li><strong>POST</strong> /api/forms - Contact submissions</li>
        <li><strong>POST</strong> /api/analyze - Document analysis (Adobe PDF Services)</li>
        <li><strong>GET</strong> /api/sessions - Session management</li>
        <li><strong>POST</strong> /api/files - File uploads</li>
        <!-- REMOVED: AI endpoints - /api/chat, /api/feedback, /api/export -->
    </ul>
    <p>✅ API operational</p>
</body>
</html>`, {
    headers: { 'Content-Type': 'text/html' }
  });
} 