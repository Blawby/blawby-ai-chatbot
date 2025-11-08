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
    <h1>🤖 Blawby AI Chatbot API</h1>
    <p>AI-powered legal assistance with matter building</p>
    <ul>
        <li><strong>POST</strong> /api/chat - AI conversations</li>
        <li><strong>GET</strong> /api/organizations - Available organizations</li>
        <li><strong>POST</strong> /api/matter-creation - Matter building flow</li>
        <li><strong>POST</strong> /api/forms - Contact submissions</li>

        <li><strong>POST</strong> /api/feedback - AI feedback collection</li>
        <li><strong>GET</strong> /api/export - Training data export</li>

    </ul>
    <p>✅ API operational</p>
</body>
</html>`, {
    headers: { 'Content-Type': 'text/html' }
  });
} 